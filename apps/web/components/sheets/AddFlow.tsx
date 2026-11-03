"use client"
// The Add money flow (ux-spec §4.7-4.8): the Add sheet in two steps ("How much?" → "How do you want to add it?",
// &step=source) and, for "Another app or exchange" + [Continue], the deposit sheet (network → address + QR → progress). The step is URL state, one history entry
// per step, so [Back] in the sheet and the browser's Back both go one step back with the amount and the network
// kept (lib/client/machines/add-flow.ts holds them). Once money is on its way there is no Back: a browser Back
// closes the flow, like ✕ ("You can close this screen").
import { useEffect, useReducer, useState } from "react"
import { AddMoneySheet } from "@/components/sheets/AddMoneySheet"
import { DepositSheet, depositAmount } from "@/components/features/deposit/DepositSheet"
import { addFlowReducer, initialAddFlow, previousParams, urlStep, type AddStep } from "@/lib/client/machines/add-flow"
import type { PotVM } from "@/lib/client/mock/types"
import { closeSheet, sheetStepBack, useSheetParams } from "@/lib/client/sheet"

export function AddFlow({ pot, actor }: { pot: PotVM; actor: string }) {
  const { sheet, amount, params } = useSheetParams()
  const depositId = params.get("d")
  const step = urlStep({ sheet, src: params.get("src"), d: depositId })
  const [flow, dispatch] = useReducer(addFlowReducer, step, (s) => ({ ...initialAddFlow, step: s }))
  // the URL is the step: keep the reducer in line with it (Back, the browser's Back, a step forward, a deep link)
  const [seen, setSeen] = useState(step)
  if (seen !== step) {
    setSeen(step)
    dispatch({ type: "URL", step })
  }
  // a Back out of a transfer on its way: close the whole flow instead of stepping back into it
  useEffect(() => {
    if (flow.closing) closeSheet()
  }, [flow.closing])

  const back = (from: AddStep) => {
    const prev = previousParams(from)
    if (prev) sheetStepBack(prev)
  }

  return (
    <>
      <AddMoneySheet
        pot={pot}
        open={step === "amount" && !flow.closing}
        onClose={closeSheet}
        prefill={amount}
        topupId={params.get("topup")}
        typed={flow.typed}
        onTyped={(value) => dispatch({ type: "AMOUNT", value })}
        source={flow.source}
        onSource={(value) => dispatch({ type: "SOURCE", value })}
      />
      <DepositSheet
        pot={pot}
        open={(step === "network" || step === "address") && !flow.closing}
        depositId={depositId}
        amount={depositAmount(pot, amount)}
        actor={actor}
        step={flow.step}
        chain={flow.chain}
        onChain={(value) => dispatch({ type: "CHAIN", value })}
        onTracking={() => dispatch({ type: "TRACKING" })}
        onBack={back}
        onNewAddress={() => {
          dispatch({ type: "NEW_ADDRESS" })
          back("address")
        }}
      />
    </>
  )
}
