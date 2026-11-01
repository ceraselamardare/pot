// A decorative, CSS-only phone (no real-device branding), ported from the video's <Phone>
// (marketing/video/src/ui/Phone.tsx): an eggplant bezel with a soft rim and side buttons, a pill camera island,
// a status bar (9:41, signal, wi-fi, battery) and a home indicator around a rounded screen on `ground`.
// Token colours only; the same eggplant body in Day and Night.
//
// Accessibility: the whole phone is ONE image (`role="img"` + `aria-label={label}`); everything inside is
// aria-hidden, so screen readers hear one sentence and axe sees no orphaned text. `interactive` (the /demo
// explainer, 05 §8.3): the phone is a `role="region"` named by `label` and its screen content is readable and
// focusable; only the bezel, status bar, camera island and home indicator stay aria-hidden.
//
// Sizing: the phone is a size container. Its width comes from `className` (default 18rem, never wider than its
// parent; give it a definite width, not w-auto/w-fit) and its height from the aspect ratio (default 390 / 844,
// a full phone; pass e.g. "aspect-[390/700]" for a shorter crop). The bezel and radii scale with the width.
// The SCREEN is laid out like a real phone, about 375 logical px wide (rem type, the app's sizes), and is
// CSS-zoomed to fit the phone's width in 1 rem steps (14-26 rem), so the mock keeps real phone proportions at
// any size. The screen clips its content (overflow hidden) and nothing pokes outside the phone's own box, so it
// never causes horizontal scroll.
//
// Any other attribute (style, data-*: a landing sequence's data-seq) goes to the root.
// Children fill the screen (absolute, inset 0) in that logical space. They can read --phone-safe-top (50 px,
// the status bar) and --phone-safe-bottom (34 px, the home indicator) to pad themselves, as <ChatThread> does.
import { BatteryFull, Signal, Wifi } from "lucide-react"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"

/** zoom = screen width / 375, stepped by the phone's own width (screen = 92.8 % of the phone). */
const ZOOM =
  "[zoom:0.5] @min-[14rem]:[zoom:0.554] @min-[15rem]:[zoom:0.594] @min-[16rem]:[zoom:0.633] @min-[17rem]:[zoom:0.673] " +
  "@min-[18rem]:[zoom:0.713] @min-[19rem]:[zoom:0.752] @min-[20rem]:[zoom:0.792] @min-[21rem]:[zoom:0.832] " +
  "@min-[22rem]:[zoom:0.871] @min-[23rem]:[zoom:0.911] @min-[24rem]:[zoom:0.95] @min-[25rem]:[zoom:0.99] @min-[26rem]:[zoom:1.03]"

type Rest = Omit<React.ComponentPropsWithoutRef<"div">, "children" | "className" | "role" | "aria-label">

export function PhoneFrame({
  label,
  children,
  className,
  screenClassName,
  statusBar = true,
  homeIndicator = true,
  interactive = false,
  ...rest
}: Rest & {
  /** the one sentence screen readers hear for the whole phone */
  label: string
  children?: React.ReactNode
  /** sizing and placement: width (default w-[18rem]), aspect ratio, margins, a motion hook */
  className?: string
  /** the screen's background, if not `ground` */
  screenClassName?: string
  statusBar?: boolean
  homeIndicator?: boolean
  /** a live screen (region + readable content) instead of one decorative image */
  interactive?: boolean
}) {
  return (
    <div
      {...rest}
      role={interactive ? "region" : "img"}
      aria-label={label}
      data-phone-frame
      className={cn("@container relative aspect-[390/844] w-[18rem] max-w-full shrink-0", className)}
    >
      <div aria-hidden={interactive ? undefined : true} className="absolute inset-0">
        {/* side buttons, inside the phone's own box */}
        <span aria-hidden className="absolute top-[19%] left-0 h-[3.5%] w-[1.4cqw] rounded-l-sm bg-on-brand" />
        <span aria-hidden className="absolute top-[26%] left-0 h-[7%] w-[1.4cqw] rounded-l-sm bg-on-brand" />
        <span aria-hidden className="absolute top-[34.5%] left-0 h-[7%] w-[1.4cqw] rounded-l-sm bg-on-brand" />
        <span aria-hidden className="absolute top-[29%] right-0 h-[11%] w-[1.4cqw] rounded-r-sm bg-on-brand" />

        {/* body: eggplant bezel, a soft rim, the card shadow; in Night an outer line-strong rim too, because the eggplant
            bezel on Night ground is ~1.2:1 and the phone would read as a hole */}
        <div className="absolute inset-x-[0.7cqw] inset-y-0 rounded-[16cqw] bg-on-brand shadow-card inset-ring-1 inset-ring-line-strong/50 dark:ring-1 dark:ring-line-strong/60">
          {/* the screen: the only clip */}
          <div className={cn("absolute inset-[2.9cqw] overflow-hidden rounded-[13.2cqw] bg-ground text-ink", screenClassName)}>
            <div data-phone-screen className={cn("absolute inset-0 [--phone-safe-bottom:34px] [--phone-safe-top:50px]", ZOOM)}>
              <div className="absolute inset-0">{children}</div>

              {statusBar ? (
                <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-(--phone-safe-top) items-center justify-between pt-0.5 text-ink">
                  <span className="w-[calc(50%-59px)] pl-2 text-center font-sans text-[1.0625rem] leading-none font-semibold tabular-nums">
                    {t("home.chat.clock")}
                  </span>
                  <span className="flex w-[calc(50%-59px)] items-center justify-center gap-1.5 pr-2">
                    <Signal className="size-[1.125rem]" strokeWidth={2} />
                    <Wifi className="size-[1.125rem]" strokeWidth={2} />
                    <BatteryFull className="size-6" strokeWidth={2} />
                  </span>
                </div>
              ) : null}

              {/* camera island */}
              <span aria-hidden className="absolute top-[11px] left-1/2 z-30 h-[34px] w-[118px] -translate-x-1/2 rounded-pill bg-on-brand ring-1 ring-line-strong/30 dark:bg-ground">
                <span className="absolute top-1/2 right-3.5 size-3 -translate-y-1/2 rounded-pill bg-ink-muted/40" />
              </span>

              {homeIndicator ? (
                <span aria-hidden className="pointer-events-none absolute bottom-2 left-1/2 z-20 h-[5px] w-[134px] -translate-x-1/2 rounded-pill bg-ink" />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
