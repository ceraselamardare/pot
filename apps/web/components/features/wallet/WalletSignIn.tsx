"use client"
// "I have a NEAR wallet" (D-20: small text; design-direction 01 §2 "More ways to join"): NEAR Connect's own picker
// opens (loaded on tap), the wallet signs in and signs "Sign in to Pot" in one prompt, our server checks it
// (NEP-413) and opens the session. Cancelling returns here silently.
// `walletSignIn()` is the same tap without the UI, for the sign-in dialog's option stack (SignInOptions
// `layout="direct"`: a quiet row, or the marigold when the wallet is the only way in).
import { useCallback, useState, useSyncExternalStore } from "react"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"

export type WalletErr = "signin.wallet.error" | "signin.wallet.limited"

/** Sign in with NEAR Connect: "ok" once our session exists, "cancelled" (silent), or the error line to show. */
export async function walletSignIn(): Promise<"ok" | "cancelled" | WalletErr> {
  try {
    const { signInWithWallet } = await import("@/lib/signing/near-connect/wallet")
    await signInWithWallet()
    return "ok"
  } catch (e) {
    const reason = (e as { reason?: string })?.reason
    if (reason === "cancelled") return "cancelled"
    return reason === "wallet_key_not_full_access" ? "signin.wallet.limited" : "signin.wallet.error"
  }
}

/** NEAR Connect's picker, while it's on screen (it appends `.hot-connector-popup` to body and hides it with display:none). */
export function walletPickerUp(): HTMLElement | null {
  if (typeof document === "undefined") return null
  // any shown root: NEAR Connect can leave a hidden one behind and append another
  return [...document.querySelectorAll<HTMLElement>(".hot-connector-popup")].find((r) => r.style.display !== "none") ?? null
}

/**
 * Is NEAR Connect's picker on screen? It (and a wallet's own panel after a pick, the same `.hot-connector-popup`
 * root) is appended to body and shown/hidden through its inline style, so a MutationObserver on body sees both.
 * Watched only while `active` (the sign-in dialog is open). The sign-in dialog turns non-modal meanwhile.
 */
export function useWalletPickerUp(active: boolean): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!active || typeof MutationObserver === "undefined") return () => undefined
      const mo = new MutationObserver(cb)
      mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] })
      return () => mo.disconnect()
    },
    [active],
  )
  return useSyncExternalStore(subscribe, () => active && walletPickerUp() !== null, () => false)
}

/** Dismiss NEAR Connect's picker the way its own backdrop does (it reports "User rejected": a silent cancel). */
export function dismissWalletPicker(): boolean {
  const backdrop = walletPickerUp()?.querySelector<HTMLElement>(".modal-container")
  if (!backdrop) return false
  backdrop.click()
  return true
}

export function WalletSignIn({ onSignedIn, className }: { onSignedIn?: () => void; className?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<WalletErr | null>(null)
  const go = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    const r = await walletSignIn()
    setBusy(false)
    if (r === "ok") onSignedIn?.()
    else if (r !== "cancelled") setError(r)
  }
  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <button
        type="button"
        onClick={() => void go()}
        aria-busy={busy || undefined}
        disabled={busy}
        className="min-h-11 rounded-sm px-3 text-body-sm text-link underline-offset-4 hover:underline disabled:opacity-60"
        data-wallet-signin
      >
        {t("landing.more.wallet")}
      </button>
      {error && (
        <p role="alert" className="text-center text-body-sm text-ink">
          {t(error)}
        </p>
      )}
    </div>
  )
}
