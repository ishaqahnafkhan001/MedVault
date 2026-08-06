import { CircleAlert, CircleCheck, Clock3, FileClock, RefreshCw } from "lucide-react";
import type { ProcessingStatus } from "@medvault/shared";

const styles: Record<ProcessingStatus, string> = {
  NOT_APPLICABLE: "bg-[#eef1ef] text-[#5c6965]",
  UPLOADED: "bg-[#e7f0f7] text-[#32627f]",
  QUEUED: "bg-[#e7f0f7] text-[#32627f]",
  PROCESSING: "bg-[#e7f0f7] text-[#32627f]",
  NEEDS_REVIEW: "bg-[#fff0d9] text-[#8b5a17]",
  VERIFIED: "bg-[#e4f2ec] text-[#176c5b]",
  FAILED: "bg-[#f8e4e4] text-[#963e42]",
};
const labels: Record<ProcessingStatus, string> = {
  NOT_APPLICABLE: "Stored",
  UPLOADED: "Preparing",
  QUEUED: "Queued",
  PROCESSING: "Processing",
  NEEDS_REVIEW: "Needs review",
  VERIFIED: "Verified",
  FAILED: "Failed",
};

export function StatusBadge({ status }: { status: ProcessingStatus }) {
  const Icon =
    status === "VERIFIED"
      ? CircleCheck
      : status === "NEEDS_REVIEW"
        ? CircleAlert
        : status === "FAILED"
          ? RefreshCw
          : status === "NOT_APPLICABLE"
            ? FileClock
            : Clock3;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold ${styles[status]}`}
    >
      <Icon size={13} />
      {labels[status]}
    </span>
  );
}
