// Gift amounts typed as dollars ("25", "7.50") → Micro, and back. Pure (unit-tested).
import type { Micro } from "@pot/sdk"
import { GIFT_COFFEE, GIFT_PRESETS } from "@/lib/gifts"

const RE = /^(\d{1,6})(?:[.,](\d{0,2}))?$/

/** "25" / "7.5" / "7,50" → Micro; null for anything else (empty, letters, 3 decimals, more than 6 digits). */
export function parseDollars(input: string): Micro | null {
  const m = RE.exec(input.trim())
  if (!m) return null
  const whole = BigInt(m[1]!)
  const frac = BigInt((m[2] ?? "").padEnd(2, "0"))
  return whole * 1_000_000n + frac * 10_000n
}

/** Micro → "25" / "7.50" for an input's value. */
export function dollarsInput(m: Micro): string {
  const whole = m / 1_000_000n
  const cents = (m % 1_000_000n) / 10_000n
  return cents === 0n ? whole.toString() : `${whole}.${cents.toString().padStart(2, "0")}`
}

/** The presets: ☕ × 1 / × 2 / × 4 → { cups, amount }. */
export const GIFT_PRESET_AMOUNTS: { cups: number; amount: Micro }[] = GIFT_PRESETS.map((n) => ({ cups: n, amount: GIFT_COFFEE * BigInt(n) }))
