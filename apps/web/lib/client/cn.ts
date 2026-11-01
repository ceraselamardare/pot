// cn() that knows the brand's type scale. The stock merger reads unknown `text-*` classes as colours, so
// `text-balance-hero text-ink` would drop the size (tailwind-merge's custom-theme gotcha). Every brand text
// style is registered as a font size here; colours (text-ink, text-link…) stay colours.
import { createCn } from "cn/config"

export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [{ text: ["balance-hero", "title", "heading", "body", "body-sm", "label", "amount"] }],
      shadow: [{ shadow: ["card", "sheet"] }],
      rounded: [{ rounded: ["pill"] }],
    },
  },
})
