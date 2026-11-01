// A decorative die-cut sticker (tram, pastel de nata, groceries…): a plain <img> with a 256/512 px WebP srcSet.
// Always decorative (alt="" + aria-hidden). `width` is the rendered CSS width in px: it sets the width/height
// attributes (the intrinsic ratio, so nothing shifts while the file loads) and the default `sizes`. To size it
// responsively, pass width classes (e.g. "w-24 md:w-36") plus a matching `sizes`; height stays auto.
// Lazy by default; `priority` for an above-the-fold sticker (eager + high fetch priority).
// Any other attribute goes to the <img> (e.g. a landing sequence's `data-seq="settle"` + `style={seqVars(…)}`);
// the tilt is the CSS `rotate` property, so a motion `transform` composes with it.
import { cn } from "@/lib/client/cn"
import { stickerSrc, stickerSrcSet, stickerRatio, type StickerName } from "./stickers"

type Rest = Omit<
  React.ComponentPropsWithoutRef<"img">,
  "src" | "srcSet" | "sizes" | "width" | "height" | "alt" | "loading" | "className" | "style" | "children"
>

export function Sticker({
  name,
  width = 160,
  sizes,
  priority = false,
  rotate = 0,
  className,
  style,
  ...rest
}: Rest & {
  name: StickerName
  /** rendered width in CSS px (default 160) */
  width?: number
  /** the `sizes` attribute; defaults to `${width}px` */
  sizes?: string
  /** above the fold: load eagerly with high priority */
  priority?: boolean
  /** a slight tilt in degrees (CSS `rotate`, so it composes with a motion `transform`) */
  rotate?: number
  className?: string
  style?: React.CSSProperties
}) {
  const height = Math.round(width / stickerRatio(name))
  return (
    // A static, pre-sized WebP with its own srcSet: next/image's optimizer would add nothing here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...rest}
      src={stickerSrc(name, 512)}
      srcSet={stickerSrcSet(name)}
      sizes={sizes ?? `${width}px`}
      width={width}
      height={height}
      alt=""
      aria-hidden
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      draggable={false}
      data-sticker={name}
      className={cn("pointer-events-none block h-auto max-w-full select-none", className)}
      style={{ ...(rotate ? { rotate: `${rotate}deg` } : null), ...style }}
    />
  )
}
