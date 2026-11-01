"use client"
// The /demo phones (06 §2, §3.4). TourPhone is the stage's hero: the kit's PhoneFrame showing the current state's
// screen, from the real app components in Scenes.tsx. On a tap step its own primary ([Create Pot], [Get $84 back]…)
// is the one marigold and does what Next does, then hands focus to Next. Steps 10 and 13 open on that person's lock
// screen with the push that brought them in (1.4 s, on a forward step only), then the sheet. Step 7 plays its
// sequence; its approved → sent screens share one mount so "In the Pot" rolls to $366.00.
// A tap on anything inert in the phone (Decline, ✕, the Pot's own Add money…) does nothing in the story, so it pokes
// the way on instead: the phone's live button rings, or Next on a step with none (polish after QA, F4).
// StaticPhone is the same screen, frozen, for the server story list and /demo/all.
import { useEffect, useId, useState, type MouseEvent } from "react"
import type { AppScene, Persona } from "@/app/demo/_data/types"
import { PhoneFrame } from "@/components/landing/home/PhoneFrame"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import type { PersonVM } from "@/lib/client/mock/types"
import { PrimaryHint, Scene, type PhoneStory } from "./Scenes"
import { PUSH_MS, TOUR_COVER, TOUR_END, type TourChapter } from "./tour"
import { useTour } from "./TourPlayer"

export interface TourScene {
  scene: AppScene
  /** whose numbers it shows (the dataset chapter) */
  chapter: TourChapter
}

export interface TourPhoneStep {
  /** one screen, or a sequence (step 7) */
  frames: TourScene[]
  /** the lock-screen push shown first on a forward step */
  before?: AppScene
  you: Persona
  tap: boolean
}

export interface TourPhones {
  cover: TourPhoneStep
  steps: TourPhoneStep[]
  end: TourPhoneStep
  stories: Record<TourChapter, PhoneStory>
}

/** approved → sent is one screen that updates in place (the status row swaps, the balance rolls) */
function sceneKey(s: AppScene): string {
  return JSON.stringify(s.scene === "spend" && s.phase === "sent" ? { ...s, phase: "approved" } : s)
}

const noop = () => {}

export function TourPhone({ phones, people, className }: { phones: TourPhones; people: Record<Persona, PersonVM>; className?: string }) {
  const p = useTour()
  const hintId = useId()
  const cover = p.at === TOUR_COVER
  const step = cover ? phones.cover : p.at === TOUR_END ? phones.end : phones.steps[p.at - 1]!
  const frame = step.frames[Math.min(p.frame, step.frames.length - 1)]!
  // the push shows when the visitor steps INTO this step, then gives way to the sheet
  const [pushSeen, setPushSeen] = useState(-1)
  const showPush = !!step.before && p.hydrated && p.via === "next" && pushSeen !== p.arrival
  useEffect(() => {
    if (!showPush) return
    const id = setTimeout(() => setPushSeen(p.arrival), PUSH_MS)
    return () => clearTimeout(id)
  }, [showPush, p.arrival])

  const scene = showPush ? step.before! : frame.scene
  const active = p.hydrated && step.tap && !cover && p.at !== TOUR_END && !showPush && !p.holding
  const onPrimary = () => p.next("next", true)
  const onScreenTap = (e: MouseEvent) => {
    if (cover || p.holding || showPush || (e.target as Element).closest("[data-phone-primary]")) return
    p.poke(active ? "phone" : "next")
  }
  const name = people[step.you].name
  return (
    <>
      <PhoneFrame
        interactive={!cover}
        label={cover ? t("tour.phone.cover") : t("tour.phone.label", { name })}
        className={className}
        data-phone-scene={scene.scene}
        data-tour-phone
      >
        <PrimaryHint.Provider value={active ? hintId : undefined}>
          {/* the inert screen's taps land here (inert content is skipped by hit-testing); keyboard users reach only the
              live button, so this is pointer feedback, not a control */}
          <div key={`${showPush ? "push" : sceneKey(scene)}|${step.you}`} className="d-scene absolute inset-0" onClick={onScreenTap}>
            <Scene
              scene={scene}
              story={phones.stories[frame.chapter]}
              you={step.you}
              people={people}
              tapped={false}
              active={active}
              onPrimary={active ? onPrimary : noop}
              burst={p.burstLive ? p.burst : 0}
            />
          </div>
        </PrimaryHint.Provider>
      </PhoneFrame>
      <span id={hintId} hidden>
        {t("tour.phone.tap_hint")}
      </span>
    </>
  )
}

/** A frozen screen (no tap, no motion): the server story list's per-part phone, and /demo/all. */
export function StaticPhone({
  scene,
  story,
  you,
  people,
  className,
}: {
  scene: AppScene
  story: PhoneStory
  you: Persona
  people: Record<Persona, PersonVM>
  className?: string
}) {
  return (
    <PhoneFrame interactive label={t("tour.phone.label", { name: people[you].name })} className={cn("aspect-[390/760] w-[min(100%,18rem)]", className)} data-phone-scene={scene.scene}>
      <Scene scene={scene} story={story} you={you} people={people} tapped={false} active={false} onPrimary={noop} burst={0} />
    </PhoneFrame>
  )
}
