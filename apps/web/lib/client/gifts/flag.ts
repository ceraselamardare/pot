// Gifts are behind NEXT_PUBLIC_FLAG_GIFTS until verified on testnet (notes/gifts-plan.md); the server has FLAG_GIFTS.
// Unset: on in mock builds (design, tests), off in testnet builds. "true"/"1" turns it on, anything else off.
// NEXT_PUBLIC_* is inlined at build time, so a build is one or the other.
import { IS_LIVE } from "../config"

const raw = process.env.NEXT_PUBLIC_FLAG_GIFTS

export const GIFTS_ON: boolean = raw === undefined || raw === "" ? !IS_LIVE : raw === "true" || raw === "1"
