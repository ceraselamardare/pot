// A record status (Paid, Waiting, Declined…) as a chip: icon + colour + word (the Pot record and the spend's details).
import { StatusChip, type ChipStatus } from "@/components/pot/StatusChip"
import { statusWord, type RecordStatus } from "@/lib/client/record"

const CHIP: Record<RecordStatus, ChipStatus> = {
  paid: "approved",
  pending: "needs",
  processing: "sending",
  declined: "declined",
  expired: "expired",
  withdrawn: "expired",
  failed: "failed",
  returned: "expired",
  held: "needs",
  cancelled: "expired",
}

export function RecordStatusChip({ s }: { s: RecordStatus }) {
  return <StatusChip status={CHIP[s]}>{statusWord(s)}</StatusChip>
}
