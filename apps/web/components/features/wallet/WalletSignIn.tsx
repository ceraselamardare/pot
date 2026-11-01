"use client"
// "I have a NEAR wallet" (D-20: small text; design-direction 01 §2 "More ways to join"): NEAR Connect's own picker
// opens (loaded on tap), the wallet signs in and signs "Sign in to Pot" in one prompt, our server checks it
// (NEP-413) and opens the session. Cancelling returns here silently.
import { useState } from "react"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"

export function WalletSignIn({ onSignedIn, className }: { onSignedIn?: () => void; className?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<"signin.wallet.error" | "signin.wallet.limited" | null>(null)
  const go = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const { signInWithWallet } = await import("@/lib/signing/near-connect/wallet")
      await signInWithWallet()
      onSignedIn?.()
    } catch (e) {
      const reason = (e as { reason?: string })?.reason
      if (reason === "cancelled") setError(null)
      else setError(reason === "wallet_key_not_full_access" ? "signin.wallet.limited" : "signin.wallet.error")
    } finally {
      setBusy(false)
    }
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
