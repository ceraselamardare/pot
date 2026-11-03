// "Zero NEAR, zero popups": a mock of Google's own light "Continue with Google" button (Day tokens inside the Night
// band and the app's GoogleMark; a mock, so never marigold) gets one soft tap (press + ripple) and resolves into
// Maya's account: the G becomes her avatar and stays on it as a badge (so every frame, the still one too, says how
// she got in), then "0 NEAR" pops in and the key "saved on this phone" slides in.
// End frame (server HTML, reduced motion, no JS): Maya with the G · 0 NEAR · the key. Loop: bento.css `auth`, 4 s.
import { KeyRound } from "lucide-react"
import { GoogleMark } from "@/components/features/auth/GoogleMark"
import { Avatar } from "@/components/pot/Avatar"
import { t } from "@/i18n/t"
import { CHAT_CAST } from "../ChatThread"
import { Scene } from "./Scene"

const MAYA = CHAT_CAST.maya

export function AuthScene() {
  return (
    <Scene id="auth" label={t("home.tech.auth.scene")}>
      <div className="flex h-full flex-col items-center justify-center gap-3 px-3">
        {/* the button, and in its place (the G where her avatar lands) Maya's account with its balance */}
        <div className="grid">
          <span
            data-theme="day"
            className="sc sc-auth-btn relative col-start-1 row-start-1 inline-flex h-10 items-center gap-2.5 overflow-hidden rounded-pill border border-line-strong bg-surface pr-4 pl-2 text-label whitespace-nowrap text-ink"
          >
            <GoogleMark />
            {t("signin.google")}
            {/* the tap: a ripple from under the thumb */}
            <span className="sc sc-auth-ripple pointer-events-none absolute top-1/2 left-1/3 size-10 -translate-1/2 rounded-pill" />
          </span>
          <span className="col-start-1 row-start-1 flex items-center justify-between gap-3">
            <span className="sc sc-auth-chip inline-flex h-10 items-center gap-2 rounded-pill border border-line bg-surface pr-4 pl-1 text-label whitespace-nowrap text-ink">
              {/* her account came from Google: the G as a 14 px badge on her avatar's corner (the app's 24 px mark,
                  scaled), cut out by a ring of the chip's colour and clear of her initial */}
              <span className="relative inline-grid">
                <Avatar person={MAYA} size="sm" />
                <span className="absolute -right-1 -bottom-px size-3.5 rounded-pill ring-2 ring-surface">
                  {/* centred absolutely: in a grid, the mark's 24 px box would widen the track and sit off-centre */}
                  <span className="absolute top-1/2 left-1/2 grid -translate-1/2 scale-[.583]">
                    <GoogleMark />
                  </span>
                </span>
              </span>
              {MAYA.name}
            </span>
            <span className="sc sc-auth-near inline-flex h-8 items-center rounded-pill bg-surface-sunken px-3 font-display text-heading whitespace-nowrap text-ink tabular-nums">
              {t("home.tech.auth.s.balance")}
            </span>
          </span>
        </div>
        <span className="sc sc-auth-key flex items-center gap-1.5 text-body-sm whitespace-nowrap text-ink-muted">
          <KeyRound aria-hidden className="size-5 shrink-0" strokeWidth={2} />
          {t("home.tech.auth.s.key")}
        </span>
      </div>
    </Scene>
  )
}
