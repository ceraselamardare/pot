// shadcn base-nova Button (Base UI), with the brand variants (frontend-architecture §7.5, D-67):
// - `secondary` is the default, so marigold is opt-in;
// - `primary` is the one marigold button per screen: eggplant `on-brand` text, a 1 px `brand-deep` border in
//   Day (none in Night), `brand-deep` when pressed; 52 px tall;
// - no marigold `destructive` (Decline stays secondary). `outline` is kept as an alias of `secondary` for
//   generated shadcn components that ask for it.
// Focus: the global 2 px `focus` ring with a 2 px offset (globals.css), so no outline-none / ring here.
// Press (design-direction 04): `scale` .97 in 120 ms, released over 200 ms; colours change in 120 ms. The scale-*
// utilities set the CSS `scale` property, so `scale` (not `transform`) must be in the transition list.
// Base UI uses the `render` prop, not Radix `asChild`: <Button render={<Link href="/pots" />}>.
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/client/cn"

const secondary =
  "border-line-strong bg-surface text-ink hover:bg-surface-sunken aria-expanded:bg-surface-sunken dark:bg-transparent dark:hover:bg-surface-sunken"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent bg-clip-padding font-sans text-label text-center transition-[background-color,border-color,scale] [--tw-duration:120ms,120ms,200ms] ease-standard select-none active:not-aria-[haspopup]:scale-[.97] active:duration-120 motion-reduce:active:not-aria-[haspopup]:scale-100 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        primary: "border-(--pot-brand-border) bg-brand text-on-brand active:bg-brand-deep",
        secondary,
        outline: secondary,
        ghost: "text-ink hover:bg-surface-sunken aria-expanded:bg-surface-sunken",
        link: "h-auto px-0 text-link underline-offset-4 hover:underline",
      },
      size: {
        // min heights: a label that wraps at 200 % text grows the button instead of spilling out (F-25)
        default: "min-h-12 py-2 px-5", // 48 px secondary (ux-spec); primary is 52 px (compound below)
        lg: "min-h-13 py-2 px-6",
        sm: "min-h-11 py-1.5 px-4", // tap-min 44 px; never smaller
        icon: "size-12",
      },
    },
    compoundVariants: [{ variant: "primary", size: "default", class: "min-h-13 px-6" }],
    defaultVariants: {
      variant: "secondary",
      size: "default",
    },
  },
)

function Button({
  className,
  variant = "secondary",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
