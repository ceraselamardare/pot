"use client"
// "I have a NEAR wallet" (F-19, B-10; frontend-architecture §4.5; kb/near-connect.md). Loaded lazily inside the tap
// (D-42: @hot-labs/near-connect never ships on first load).
//  - Sign-in: connector.connect({signMessageParams}) = sign in + NEP-413 "Sign in to Pot" in one prompt; the signed
//    message arrives on the "wallet:signInAndSignMessage" event (fallback: wallet.signMessage). Then
//    POST /api/session/wallet sets the cookies.
//  - Actions: gasless when the wallet declares `signDelegateActions` (testnet: Meteor, Intear, Ledger, NEAR CLI):
//    its SignedDelegate goes to the same /api/relay as everyone's. Otherwise signAndSendTransaction: the wallet pays
//    its own testnet gas and hub-funded methods attach the hub's cost (`buildCall(…, {direct: true})`).
// E2E: a build with NEXT_PUBLIC_E2E_MOCK_WALLET=1 swaps the connector for ./e2e-mock-wallet.ts, a local signer
// (NEP-413 sign-in + signDelegateActions) whose key the test puts in localStorage['pot.e2e.wallet']. next.config.ts
// refuses that flag on Vercel and mainnet builds and aliases `pot-e2e-mock-wallet` to a stub in every other build
// (the mock's code is not in the bundle); the mock itself also refuses to run outside localhost.
import { buildCall, newOpKey, opKeyOfRef, type ActionIntent, type Api } from "@pot/sdk"
import { sdkConfig } from "@/lib/client/config"
import { ActionError } from "@/lib/client/errors"
import { api } from "@/lib/client/live/api"
import { postRelay, type RelayOk } from "@/lib/client/live/relay"
import { SESSION_KEY } from "@/lib/client/live/session"
import { queryClient } from "@/lib/client/query"
import { makeNonce, SIGN_IN_MESSAGE, toBase64 } from "@/server/features/wallet/nep413"

type ConnectorAction = { type: "FunctionCall"; params: { methodName: string; args: Record<string, unknown>; gas: string; deposit: string } }

interface SignedMessage {
  accountId: string
  publicKey: string
  signature: string
}

interface WalletLike {
  manifest: { id: string; name?: string; features: { signDelegateActions?: boolean } }
  signMessage(p: { message: string; recipient: string; nonce: Uint8Array }): Promise<SignedMessage>
  signDelegateActions(p: { delegateActions: { receiverId: string; actions: ConnectorAction[] }[] }): Promise<{ signedDelegateActions: string[] }>
  signAndSendTransaction(p: { receiverId: string; actions: ConnectorAction[] }): Promise<unknown>
  signOut(): Promise<void>
}

interface ConnectorLike {
  connect(input?: { signMessageParams?: { message: string; recipient: string; nonce: Uint8Array } }): Promise<WalletLike>
  getConnectedWallet(): Promise<{ wallet: WalletLike; accounts: { accountId: string }[] }>
  once(event: string, cb: (p: unknown) => void): void
  disconnect(): Promise<void>
}

export const MOCK_WALLET = process.env.NEXT_PUBLIC_E2E_MOCK_WALLET === "1"

let connectorP: Promise<ConnectorLike> | null = null

async function connector(): Promise<ConnectorLike> {
  // `pot-e2e-mock-wallet` is ./e2e-mock-wallet.ts only in a flagged local test build, a throwing stub otherwise
  if (MOCK_WALLET) return (await import("pot-e2e-mock-wallet")).mockConnector() as unknown as ConnectorLike
  return (connectorP ??= (async () => {
    const { NearConnector } = await import("@hot-labs/near-connect")
    return new NearConnector({ network: "testnet", footerBranding: null, features: {} }) as unknown as ConnectorLike
  })())
}

/** One prompt: sign in + the NEP-413 message; then our session. */
export async function signInWithWallet(): Promise<Api.SessionInfo> {
  const c = await connector()
  const nonce = makeNonce()
  const recipient = window.location.host
  const params = { message: SIGN_IN_MESSAGE, recipient, nonce }
  const viaEvent = new Promise<SignedMessage | null>((resolve) => {
    c.once("wallet:signInAndSignMessage", (p) => {
      const acc = (p as { accounts?: { accountId: string; signedMessage?: SignedMessage }[] }).accounts?.[0]
      resolve(acc?.signedMessage ? { ...acc.signedMessage, accountId: acc.accountId } : null)
    })
  })
  let wallet: WalletLike
  try {
    wallet = await c.connect({ signMessageParams: params })
  } catch (e) {
    throw new ActionError("session", "cancelled", { message: String(e) })
  }
  let signed = await Promise.race([viaEvent, new Promise<null>((r) => setTimeout(() => r(null), 2_000))])
  if (!signed) signed = await wallet.signMessage(params)
  const body: Api.WalletSessionReq = {
    accountId: signed.accountId,
    publicKey: signed.publicKey as Api.WalletSessionReq["publicKey"],
    signature: normalizeSignature(signed.signature),
    nonce: toBase64(nonce),
    message: SIGN_IN_MESSAGE,
    recipient,
  }
  const { data } = await api<Api.WalletSessionRes>("POST", "/api/session/wallet", body)
  const qc = queryClient()
  qc.setQueryData(SESSION_KEY, data.session)
  void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY[0] })
  return data.session
}

/** Wallets return base64 (NEP-413); some return bytes or ed25519:base58 — the server takes base64 or ed25519:. */
function normalizeSignature(sig: unknown): string {
  if (typeof sig === "string") return sig
  if (sig instanceof Uint8Array) return toBase64(sig)
  return String(sig)
}

export async function disconnectWallet(): Promise<void> {
  try {
    await (await connector()).disconnect()
  } catch {}
}

const connectorActions = (call: ReturnType<typeof buildCall>): ConnectorAction[] =>
  call.actions.map((a) => {
    if (a.type !== "FunctionCall") throw new ActionError("bug", "action_not_allowed")
    return { type: "FunctionCall", params: { methodName: a.method, args: a.args, gas: a.gas.toString(), deposit: a.deposit.toString() } }
  })

/**
 * The wallet NEAR Connect remembers for this browser. If it lost it (its saved choice is gone, or the wallet's
 * frame can't list accounts any more), connect once more right here: the person picks their wallet again and the
 * action goes on, instead of failing every time with nothing to do about it.
 */
async function connectedWallet(c: ConnectorLike): Promise<Awaited<ReturnType<ConnectorLike["getConnectedWallet"]>>> {
  try {
    return await c.getConnectedWallet()
  } catch {
    try {
      await c.connect()
      return await c.getConnectedWallet()
    } catch {
      throw new ActionError("needs_device", "reconnect_wallet")
    }
  }
}

/**
 * A wallet session's action: gasless through our relayer when the wallet can sign delegates, else the wallet sends
 * it (its own gas). Same RelayOk shape for the callers.
 */
export async function walletSend(
  intent: ActionIntent,
  opts: { opId?: string; context?: Api.RelayContext; /** the Pot session's account: the wallet must sign as it */ accountId?: string } = {},
): Promise<RelayOk> {
  const c = await connector()
  const connected = await connectedWallet(c)
  // The wallet signs as ITS current account. If that isn't the account signed in to Pot (another account picked in
  // the wallet, or another one used in this browser), the relayer would refuse it as sender_mismatch: say so first.
  if (opts.accountId && connected.accounts.length > 0 && !connected.accounts.some((a) => a.accountId === opts.accountId))
    throw new ActionError("needs_device", "wallet_account_mismatch")
  const wallet = connected.wallet
  const opId = opts.opId ?? (intent.type === "request_spend" ? opKeyOfRef(intent.requestRef) : newOpKey())
  if (wallet.manifest.features.signDelegateActions) {
    const call = buildCall(intent, sdkConfig())
    for (let attempt = 0; ; attempt++) {
      let signedDelegateActions: string[]
      try {
        ;({ signedDelegateActions } = await wallet.signDelegateActions({ delegateActions: [{ receiverId: call.receiverId, actions: connectorActions(call) }] }))
      } catch (e) {
        // closed / declined / failed in the wallet: nothing was signed, so nothing was sent
        throw new ActionError("failed", "wallet_declined", { message: String(e).slice(0, 200) })
      }
      const b64 = signedDelegateActions[0]
      if (!b64) throw new ActionError("failed", "wallet_no_signature")
      try {
        return await postRelay({
          signedDelegate: b64,
          idempotencyKey: opId,
          intent: intent.type as Api.IntentType,
          ...(intent.type === "request_spend" ? { requestRef: intent.requestRef } : {}),
          ...(opts.context ? { context: opts.context } : {}),
        } as Api.RelayReq)
      } catch (e) {
        // `expired` / `nonce_used` / `nonce_pending`: nothing ran; sign once more with a fresh nonce (same op id)
        if (attempt === 0 && e instanceof ActionError && e.cls === "retryable") {
          await new Promise((r) => setTimeout(r, e.reason === "nonce_pending" ? 2000 : 300))
          continue
        }
        throw e
      }
    }
  }
  // self-paid: the hub's sponsored cost travels with the call (rev4), the wallet pays gas
  const call = buildCall(intent, sdkConfig(), { direct: true })
  const outcome = (await wallet.signAndSendTransaction({ receiverId: call.receiverId, actions: connectorActions(call) })) as {
    status?: Record<string, unknown>
    transaction?: { hash?: string }
    transaction_outcome?: { id?: string }
    receipts_outcome?: { outcome: { status: Record<string, unknown> } }[]
  }
  const txHash = outcome.transaction?.hash ?? outcome.transaction_outcome?.id ?? ""
  const failed = !!outcome.status && "Failure" in outcome.status
  const inner = (outcome.receipts_outcome ?? []).some((r) => "Failure" in (r.outcome.status ?? {}))
  return {
    ok: true,
    requestId: "",
    relayId: "",
    txHash,
    receiptUrl: `${sdkConfig().explorerUrl}/txns/${txHash}`,
    outcome: failed || inner ? "inner_failed" : "success",
    events: [],
    executedAtBlock: 0,
    result: intent.type === "add_money" && !failed && !inner ? { type: "contribution", recorded: true, amount: intent.amount.toString(), usedAmount: intent.amount.toString() } : null,
    final: true,
  } as unknown as RelayOk
}
