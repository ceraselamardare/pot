"use client"
// Create Pot (ux-spec §4.12, design-direction 01 §3, frontend-architecture §5.10): a Pot in under a minute.
// Step 1 name + emoji + colour with a live preview of what friends see; step 2 Trip rules (Club and Team
// "coming soon") + optional "$150 each"; step 3 progress ("Free: we cover the setup") → the Share sheet.
// The invite keypair is generated here, so the first link exists the moment the Pot does (7 days, 10 uses).
import { Check, Gift, Plane, Users } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useReducer } from "react"
import { toast } from "sonner"
import { ProgressSteps } from "@/components/feedback/States"
import { COVER_GRADIENTS, CoverTile } from "@/components/pot/CoverTile"
import { Button } from "@/components/ui/button"
import { Sheet } from "@/components/sheets/Sheet"
import { t } from "@/i18n/t"
import { useOnline } from "@/lib/client/browser"
import { createReducer, initialCreate, NAME_MAX } from "@/lib/client/machines/create"
import { generateInvite } from "@/lib/client/invite"
import { createPot } from "@/lib/client/actions"
import { ActionError } from "@/lib/client/errors"
import { cents, formatUsd } from "@/lib/client/money"
import { cn } from "@/lib/client/cn"

const EMOJI = ["✈️", "🇵🇹", "🏖️", "🏔️", "🍷", "🎉", "🏕️", "🚐", "🎿", "🍕", "⚽", "🎸"]

export function CreatePotSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const online = useOnline()
  const [s, dispatch] = useReducer(createReducer, initialCreate)
  const status = s.status
  useEffect(() => {
    if (status !== "creating") return
    const id = setTimeout(() => dispatch({ type: "SLOW" }), 8000)
    return () => clearTimeout(id)
  }, [status])

  const close = () => {
    if (s.status === "creating") return
    dispatch({ type: "RESET" })
    onClose()
  }
  const create = async () => {
    if (!online) return toast(t("add.offline"))
    dispatch({ type: "SUBMIT" })
    try {
      const invite = await generateInvite()
      const slug = await createPot({
        name: s.name.trim(),
        emoji: s.emoji,
        cover: s.cover,
        goalEachCents: s.goalOn ? s.goalEachCents : null,
        invite,
      })
      dispatch({ type: "CREATED", slug })
      toast.success(t("create.success", { potName: s.name.trim() }))
      dispatch({ type: "RESET" })
      router.replace(`/p/${slug}?sheet=share`)
    } catch (e) {
      dispatch({ type: "FAILED", key: e instanceof ActionError && e.reason === "ERR_CREATOR_DAILY_LIMIT" ? "create.error.limit" : "create.error.relayer" })
    }
  }

  const title = s.step === 1 ? t("create.step1.title") : s.step === 2 ? t("create.step2.title") : t("create.progress", { potName: s.name.trim() }).split(" · ")[0]!
  const nameShown = s.name.trim() || t("create.name.placeholder")

  return (
    <Sheet
      open={open}
      onClose={close}
      title={title}
      full
      keyboard
      footer={
        s.step === 1 ? (
          <Button variant="primary" className="w-full" onClick={() => dispatch({ type: "NEXT" })}>
            {t("create.cta.next")}
          </Button>
        ) : s.step === 2 ? (
          <div className="flex flex-col gap-2">
            {s.error && (
              <p role="alert" className="text-body-sm text-ink">
                {t(s.error)}
              </p>
            )}
            <Button variant="primary" className="w-full" onClick={create} aria-disabled={!online || undefined}>
              {t("create.cta")}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => dispatch({ type: "BACK" })}>
              {t("create.back")}
            </Button>
          </div>
        ) : null
      }
    >
      <div className="flex flex-col gap-5 pt-1">
        {s.step < 3 && <p className="text-body-sm text-ink-muted">{t("create.step_of", { step: s.step, total: 2 })}</p>}

        {s.step === 1 && (
          <>
            <figure className="flex flex-col gap-2">
              <div className="flex items-center gap-3 rounded-lg bg-surface p-3 shadow-card ring-1 ring-line">
                <CoverTile emoji={s.emoji} cover={s.cover} size="lg" />
                <div className="min-w-0">
                  <p className={cn("truncate font-display text-heading", s.name.trim() ? "text-ink" : "text-ink-muted")}>{nameShown}</p>
                  <p className="text-body-sm text-ink-muted">{t("create.preview.members")}</p>
                </div>
              </div>
              <figcaption className="text-body-sm text-ink-muted">{t("create.preview_hint")}</figcaption>
            </figure>

            <label className="flex flex-col gap-1.5">
              <span className="flex items-center justify-between text-label text-ink">
                {t("create.name.label")}
                <span className="text-body-sm font-normal text-ink-muted">{t("create.name.count", { count: s.name.length })}</span>
              </span>
              <input
                value={s.name}
                maxLength={NAME_MAX}
                enterKeyHint="done"
                autoComplete="off"
                aria-invalid={s.nameError || undefined}
                aria-describedby={s.nameError ? "name-error" : undefined}
                placeholder={t("create.name.placeholder")}
                onChange={(e) => dispatch({ type: "NAME", value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") dispatch({ type: "NEXT" })
                }}
                className="h-13 rounded-sm border border-line-strong bg-surface-sunken px-3 text-body text-ink placeholder:text-ink-muted"
              />
              {s.nameError && (
                <span id="name-error" className="text-body-sm text-ink">
                  {t("create.error.name")}
                </span>
              )}
            </label>

            <fieldset>
              <legend className="mb-2 text-label text-ink">{t("create.cover")}</legend>
              <div role="radiogroup" aria-label={t("create.cover")} className="grid grid-cols-6 gap-2">
                {EMOJI.map((e) => (
                  <button
                    key={e}
                    type="button"
                    role="radio"
                    aria-checked={s.emoji === e}
                    aria-label={e}
                    onClick={() => dispatch({ type: "EMOJI", value: e })}
                    className={cn(
                      "grid aspect-square min-h-11 place-items-center rounded-md text-2xl",
                      s.emoji === e ? "bg-brand-soft ring-2 ring-ink" : "bg-surface-sunken hover:bg-line",
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-label text-ink">{t("create.cover.color")}</legend>
              <div role="radiogroup" aria-label={t("create.cover.color")} className="flex flex-wrap gap-2">
                {COVER_GRADIENTS.map((g, i) => (
                  <button
                    key={g}
                    type="button"
                    role="radio"
                    aria-checked={s.cover === i}
                    aria-label={t("create.cover.swatch", { n: i + 1 })}
                    onClick={() => dispatch({ type: "COVER", value: i })}
                    className="grid size-11 place-items-center rounded-pill"
                  >
                    <span className={cn("grid size-9 place-items-center rounded-pill bg-linear-to-br", g, s.cover === i && "ring-2 ring-ink ring-offset-2 ring-offset-surface")}>
                      {s.cover === i && <Check aria-hidden className="size-4 text-on-brand" strokeWidth={3} />}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
          </>
        )}

        {s.step === 2 && (
          <>
            <div role="radiogroup" aria-label={t("create.step2.title")} className="flex flex-col gap-2">
              <div role="radio" aria-checked="true" tabIndex={0} className="relative rounded-lg border-2 border-ink bg-brand-soft p-4">
                <span className="absolute top-3 right-3 grid size-6 place-items-center rounded-pill bg-ink text-surface">
                  <Check aria-hidden className="size-4" strokeWidth={3} />
                </span>
                <p className="flex items-center gap-2 font-display text-heading text-ink">
                  <Plane aria-hidden className="size-5" strokeWidth={2} />
                  {t("create.preset.trip").split(" · ")[0]}
                </p>
                <ul className="mt-2 flex flex-col gap-1 text-body text-ink">
                  {t("create.preset.trip")
                    .split(" · ")
                    .slice(1)
                    .map((line) => (
                      <li key={line} className="flex items-start gap-2">
                        <Check aria-hidden className="mt-1 size-4 shrink-0" strokeWidth={2.5} />
                        {line.charAt(0).toUpperCase() + line.slice(1)}
                      </li>
                    ))}
                </ul>
              </div>
              {(["create.preset.club", "create.preset.team"] as const).map((k) => (
                <div key={k} role="radio" aria-checked="false" aria-disabled="true" className="flex items-center justify-between rounded-lg bg-surface-sunken p-4">
                  <p className="flex items-center gap-2 font-display text-heading text-ink-muted">
                    {k === "create.preset.club" ? <Users aria-hidden className="size-5" strokeWidth={2} /> : <Gift aria-hidden className="size-5" strokeWidth={2} />}
                    {t(k).split(" · ")[0]}
                  </p>
                  <span className="rounded-pill bg-surface px-2.5 py-0.5 text-body-sm font-semibold text-ink-muted">{t("create.preset.soon")}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 rounded-md border border-line p-3">
              <span className="flex flex-col">
                <span className="text-label text-ink" id="goal-label">
                  {t("create.goal.label")}
                </span>
                <span className="text-body-sm text-ink-muted tabular-nums">{t("create.goal.each", { amount: formatUsd(cents(s.goalEachCents), "whole") })}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={s.goalOn}
                aria-labelledby="goal-label"
                onClick={() => dispatch({ type: "GOAL", on: !s.goalOn })}
                className="grid h-11 w-14 shrink-0 place-items-center"
              >
                <span className={cn("relative h-7 w-12 rounded-pill transition-colors duration-200", s.goalOn ? "bg-ink" : "bg-line-strong")}>
                  <span
                    className={cn(
                      "absolute top-0.5 left-0.5 size-6 rounded-pill bg-surface shadow transition-transform duration-200 motion-reduce:transition-none",
                      s.goalOn && "translate-x-5",
                    )}
                  />
                </span>
              </button>
            </div>
          </>
        )}

        {s.step === 3 && (
          <div className="flex flex-col gap-6 pt-4" aria-busy="true">
            <div className="flex items-center gap-3">
              <CoverTile emoji={s.emoji} cover={s.cover} size="lg" />
              <p className="font-display text-heading text-ink">{s.name.trim()}</p>
            </div>
            <ProgressSteps
              steps={[
                {
                  label: t("create.progress", { potName: s.name.trim() }).split(" · ")[0]!,
                  helper: s.slow ? t("create.slow") : t("create.progress", { potName: s.name.trim() }).split(" · ")[1],
                  state: s.slug ? "done" : "current",
                },
                { label: t("create.progress.ready"), state: s.slug ? "current" : "next" },
              ]}
            />
          </div>
        )}
      </div>
    </Sheet>
  )
}
