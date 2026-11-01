"use client"
// You → Profile → Avatar (brand/avatars/README.md): "Use my initials" (the default) or one of the ten brand
// pictures. Native radio buttons in a fieldset, so the group has a name, Tab enters it once, arrow keys move and
// select, and screen readers say "Cat, radio button, 4 of 11, selected". Each option is a 48 px target (tap-min 44).
// The choice saves itself (no marigold button: the screen's one marigold stays free); a polite status line says
// "Saving…" then "Saved", and a failure reverts with a toast that says nothing changed.
import { Check } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { toast } from "sonner"
import { Avatar } from "@/components/pot/Avatar"
import { t } from "@/i18n/t"
import { AVATAR_IDS, avatarLabelKey, type AvatarId } from "@/lib/avatars"
import { cn } from "@/lib/client/cn"
import { saveMyAvatar } from "@/lib/client/profile"
import { useMeInfo } from "@/lib/client/session"

export type AvatarSaveStatus = "idle" | "saving" | "saved"

const OPTIONS: readonly (AvatarId | null)[] = [null, ...AVATAR_IDS]

export function AvatarPicker({
  name,
  initials,
  joinIndex,
  value,
  onChange,
  status = "idle",
}: {
  name: string
  initials: string
  joinIndex: number
  value: AvatarId | null
  onChange: (avatar: AvatarId | null) => void
  status?: AvatarSaveStatus
}) {
  const id = useId()
  return (
    <fieldset aria-describedby={`${id}-hint`} data-avatar-picker>
      <legend className="text-label text-ink">{t("you.avatar")}</legend>
      <p id={`${id}-hint`} className="mt-1 text-body-sm text-ink-muted">
        {t("you.avatar.hint")}
      </p>
      <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] justify-items-center gap-y-2">
        {OPTIONS.map((opt) => {
          const label = opt ? t(avatarLabelKey(opt)) : t("you.avatar.initials")
          const checked = value === opt
          return (
            <label
              key={opt ?? "initials"}
              data-avatar-option={opt ?? "initials"}
              className="relative grid size-12 cursor-pointer place-items-center rounded-pill has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
            >
              <input
                type="radio"
                name={`${id}-avatar`}
                value={opt ?? "initials"}
                checked={checked}
                onChange={() => onChange(opt)}
                aria-label={label}
                className="sr-only"
              />
              <Avatar
                person={{ name, initials, joinIndex, avatar: opt }}
                size="md"
                className={cn("transition-shadow", checked ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : "hover:ring-2 hover:ring-line-strong")}
              />
              {checked && (
                <span aria-hidden className="absolute -right-0.5 -bottom-0.5 grid size-5 place-items-center rounded-pill bg-ink text-surface ring-2 ring-surface">
                  <Check className="size-3.5" strokeWidth={2} />
                </span>
              )}
            </label>
          )
        })}
      </div>
      <p role="status" className="mt-2 min-h-5 text-body-sm text-ink-muted" data-avatar-status={status}>
        {status === "saving" ? t("you.avatar.saving") : status === "saved" ? t("you.avatar.saved") : ""}
      </p>
    </fieldset>
  )
}

/** Arrow keys select as they move, so saves wait for a short pause and only the last pick is sent. */
const SETTLE_MS = 400

/** The picker wired to the signed-in person (mock world or PATCH /api/me). */
export function AvatarSetting() {
  const me = useMeInfo()
  const [draft, setDraft] = useState<AvatarId | null | undefined>(undefined)
  const [status, setStatus] = useState<AvatarSaveStatus>("idle")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef<AvatarId | null | undefined>(undefined)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])
  if (!me) return null
  const value = draft !== undefined ? draft : me.avatar

  const save = async (avatar: AvatarId | null) => {
    try {
      await saveMyAvatar(avatar)
      if (latest.current !== avatar) return // a newer pick is on its way
      setDraft(undefined)
      setStatus("saved")
    } catch {
      if (latest.current !== avatar) return
      setDraft(undefined)
      setStatus("idle")
      toast.error(t("you.avatar.failed"))
    }
  }

  const onChange = (avatar: AvatarId | null) => {
    latest.current = avatar
    setDraft(avatar)
    setStatus("saving")
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(avatar), SETTLE_MS)
  }

  return <AvatarPicker name={me.name} initials={me.initials} joinIndex={me.joinIndex} value={value} onChange={onChange} status={status} />
}
