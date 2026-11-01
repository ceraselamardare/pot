"use client"
// "I have a NEAR wallet" (F-19, B-10; frontend-architecture §4.5; kb/near-connect.md). Loaded lazily inside the tap
// (D-42: @hot-labs/near-connect never ships on first load).
//  - Sign-in: connector.connect({signMessageParams}) = sign in + NEP-413 "Sign in to Pot" in one prompt; the signed
//    message arrives on the "wallet:signInAndSignMessage" event (fallback: wallet.signMessage). Then
//    POST /api/session/wallet sets the cookies.
//  - Actions: gasless when the wallet declares `signDelegateActions` (testnet: Meteor, Intear, Ledger, NEAR CLI):
//    its SignedDelegate goes to the same /api/relay as everyone's. Otherwise signAndSendTransaction: the wallet pays
//    its own testnet gas and hub-funded methods attach the hub's cost (`buildCall(…, {direct: true})`).
// E2E: a build with NEXT_PUBLIC_E2E_MOCK_WALLET=1 swaps the connector for a local NEP-413 signer whose key the test
// puts in localStorage['pot.e2e.wallet'] (never in a normal build).
import { buildCall, newOpKey, type ActionIntent, type Api } from "@pot/sdk"
import { ed25519 } from "@noble/curves/ed25519.js"
import { base58 } from "@scure/base"
import { sdkConfig } from "@/lib/client/config"
import { ActionError } from "@/lib/client/errors"
import { api } from "@/lib/client/live/api"
import { postRelay, type RelayOk } from "@/lib/client/live/relay"
import { SESSION_KEY } from "@/lib/client/live/session"
import { queryClient } from "@/lib/client/query"
import { makeNonce, nep413Hash, SIGN_IN_MESSAGE, toBase64 } from "@/server/features/wallet/nep413"

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
  if (MOCK_WALLET) return mockConnector()
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
 * A wallet session's action: gasless through our relayer when the wallet can sign delegates, else the wallet sends
 * it (its own gas). Same RelayOk shape for the callers.
 */
export async function walletSend(intent: ActionIntent, opts: { opId?: string; context?: Api.RelayContext } = {}): Promise<RelayOk> {
  const c = await connector()
  let connected: Awaited<ReturnType<ConnectorLike["getConnectedWallet"]>>
  try {
    connected = await c.getConnectedWallet()
  } catch {
    throw new ActionError("needs_device", "reconnect_wallet")
  }
  const wallet = connected.wallet
  const opId = opts.opId ?? (intent.type === "request_spend" ? intent.requestRef : newOpKey())
  if (wallet.manifest.features.signDelegateActions) {
    const call = buildCall(intent, sdkConfig())
    const { signedDelegateActions } = await wallet.signDelegateActions({ delegateActions: [{ receiverId: call.receiverId, actions: connectorActions(call) }] })
    const b64 = signedDelegateActions[0]
    if (!b64) throw new ActionError("failed", "wallet_no_signature")
    return postRelay({
      signedDelegate: b64,
      idempotencyKey: opId,
      intent: intent.type as Api.IntentType,
      ...(intent.type === "request_spend" ? { requestRef: intent.requestRef } : {}),
      ...(opts.context ? { context: opts.context } : {}),
    } as Api.RelayReq)
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

// ---------------------------------------------------------------------------------------------
// e2e mock wallet (NEXT_PUBLIC_E2E_MOCK_WALLET=1 builds only)

function mockConnector(): ConnectorLike {
  const cfg = (): { accountId: string; seedHex: string; delegates?: boolean } => {
    const raw = localStorage.getItem("pot.e2e.wallet")
    if (!raw) throw new Error("no mock wallet")
    return JSON.parse(raw)
  }
  const listeners = new Map<string, (p: unknown) => void>()
  const hexToBytes = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)))
  const wallet: WalletLike = {
    manifest: { id: "e2e-mock", name: "Mock", features: { signDelegateActions: false } },
    async signMessage(p) {
      const w = cfg()
      const seed = hexToBytes(w.seedHex)
      const sig = ed25519.sign(nep413Hash({ message: p.message, nonce: p.nonce, recipient: p.recipient }), seed)
      return { accountId: w.accountId, publicKey: `ed25519:${base58.encode(ed25519.getPublicKey(seed))}`, signature: toBase64(sig) }
    },
    async signDelegateActions() {
      throw new Error("not in the mock")
    },
    async signAndSendTransaction() {
      throw new Error("not in the mock")
    },
    async signOut() {},
  }
  return {
    async connect(input) {
      if (localStorage.getItem("pot.e2e.walletCancel") === "1") throw new Error("User closed the modal")
      if (input?.signMessageParams) {
        const signed = await wallet.signMessage(input.signMessageParams)
        listeners.get("wallet:signInAndSignMessage")?.({ wallet, accounts: [{ accountId: signed.accountId, signedMessage: signed }], success: true })
      }
      return wallet
    },
    async getConnectedWallet() {
      return { wallet, accounts: [{ accountId: cfg().accountId }] }
    },
    once(event, cb) {
      listeners.set(event, cb)
    },
    async disconnect() {},
  }
}
