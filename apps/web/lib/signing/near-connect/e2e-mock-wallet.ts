"use client"
// The e2e mock wallet (Rev 9): a stand-in for a NEAR Connect wallet in Playwright runs, so the app follows the exact
// wallet path (NEP-413 "Sign in to Pot" → POST /api/session/wallet; actions → `signDelegateActions` → our relayer).
// The test puts {accountId, seedHex} in localStorage['pot.e2e.wallet']; seedHex is the 32-byte ed25519 seed of a
// FULL-ACCESS key of that account (the server checks it on chain, so the mock can't sign in as anyone it holds no
// key for). Optional flags: `delegates: false` (a wallet without signDelegateActions), and
// localStorage['pot.e2e.walletCancel'] = "1" (the person closes the wallet).
//
// Never in a shipped build:
//  - wallet.ts imports `pot-e2e-mock-wallet`, which next.config.ts resolves to this file only when
//    NEXT_PUBLIC_E2E_MOCK_WALLET=1 (refused on any Vercel build and on mainnet) and to e2e-mock-wallet.off.ts otherwise;
//  - at runtime it refuses to run anywhere but localhost / 127.0.0.1.
import { ed25519 } from "@noble/curves/ed25519.js"
import { base58 } from "@scure/base"
import type { CallSpec } from "@pot/sdk"
import { signingChain } from "@/lib/client/live/chain"
import { nep413Hash, toBase64 } from "@/server/features/wallet/nep413"

type ConnectorAction = { type: "FunctionCall"; params: { methodName: string; args: Record<string, unknown>; gas: string; deposit: string } }
interface SignedMessage {
  accountId: string
  publicKey: string
  signature: string
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"])

export function mockWalletAllowed(): boolean {
  return process.env.NEXT_PUBLIC_E2E_MOCK_WALLET === "1" && typeof window !== "undefined" && LOCAL_HOSTS.has(window.location.hostname)
}

const hexToBytes = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)))

function cfg(): { accountId: string; seedHex: string; delegates?: boolean } {
  const raw = localStorage.getItem("pot.e2e.wallet")
  if (!raw) throw new Error("no mock wallet")
  return JSON.parse(raw)
}

// one delegate at a time per tab, so nonces are handed out in order
let chainP: Promise<unknown> = Promise.resolve()
const lastNonce = new Map<string, bigint>()

async function signDelegates(delegateActions: { receiverId: string; actions: ConnectorAction[] }[]): Promise<string[]> {
  const w = cfg()
  const seed = hexToBytes(w.seedHex)
  const [{ signDelegate, maxBlockHeightFor, DEFAULT_DELEGATE_TTL_BLOCKS }, { KeyPair, KeyPairSigner }] = await Promise.all([
    import("@pot/sdk/sign"),
    import("near-api-js"),
  ])
  const secret = new Uint8Array(64)
  secret.set(seed, 0)
  secret.set(ed25519.getPublicKey(seed), 32)
  const keyPair = KeyPair.fromString(`ed25519:${base58.encode(secret)}`)
  const publicKey = keyPair.getPublicKey().toString()
  const signer = new KeyPairSigner(keyPair)
  const out: string[] = []
  for (const d of delegateActions) {
    const call: CallSpec = {
      receiverId: d.receiverId,
      actions: d.actions.map((a) => ({
        type: "FunctionCall",
        method: a.params.methodName,
        args: a.params.args,
        gas: BigInt(a.params.gas),
        deposit: BigInt(a.params.deposit),
      })),
    }
    const ak = await signingChain().account.accessKey(w.accountId as never, publicKey as never)
    if (!ak.value) throw new Error("mock wallet: key not on chain")
    // a key added a moment ago starts at (its block) × 10⁶; the relayer wants nonce < (final head) × 10⁶
    for (let i = 0; i < 12; i++) {
      const head = await signingChain().account.head("final")
      if (ak.value.nonce + 1n < (BigInt(head.blockHeight) - 1n) * 1_000_000n) break
      await new Promise((r) => setTimeout(r, 700))
    }
    const k = `${w.accountId}:${publicKey}`
    const prev = lastNonce.get(k)
    const nonce = prev !== undefined && prev >= ak.value.nonce ? prev + 1n : ak.value.nonce + 1n
    lastNonce.set(k, nonce)
    const r = await signDelegate(signer, {
      senderId: w.accountId,
      publicKey,
      call,
      nonce,
      maxBlockHeight: maxBlockHeightFor(ak.blockHeight, DEFAULT_DELEGATE_TTL_BLOCKS),
    })
    out.push(r.signedDelegateBase64)
  }
  return out
}

export function mockConnector() {
  if (!mockWalletAllowed()) throw new Error("the e2e mock wallet only runs on a local test build")
  const listeners = new Map<string, (p: unknown) => void>()
  const wallet = {
    manifest: {
      id: "e2e-mock",
      name: "Mock",
      features: {
        get signDelegateActions() {
          return cfg().delegates !== false
        },
      },
    },
    async signMessage(p: { message: string; recipient: string; nonce: Uint8Array }): Promise<SignedMessage> {
      const w = cfg()
      const seed = hexToBytes(w.seedHex)
      const sig = ed25519.sign(nep413Hash({ message: p.message, nonce: p.nonce, recipient: p.recipient }), seed)
      return { accountId: w.accountId, publicKey: `ed25519:${base58.encode(ed25519.getPublicKey(seed))}`, signature: toBase64(sig) }
    },
    async signDelegateActions(p: { delegateActions: { receiverId: string; actions: ConnectorAction[] }[] }) {
      const job = chainP.then(() => signDelegates(p.delegateActions))
      chainP = job.catch(() => undefined)
      return { signedDelegateActions: await job }
    },
    async signAndSendTransaction(): Promise<unknown> {
      throw new Error("not in the mock")
    },
    async signOut() {},
  }
  return {
    async connect(input?: { signMessageParams?: { message: string; recipient: string; nonce: Uint8Array } }) {
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
    once(event: string, cb: (p: unknown) => void) {
      listeners.set(event, cb)
    },
    async disconnect() {},
  }
}
