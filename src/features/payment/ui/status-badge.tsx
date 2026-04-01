import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { SessionStatus } from "@/features/payment/ui/flow-stage";

const statusStyles: Record<SessionStatus, string> = {
  pending: "bg-sky-100 text-sky-800 border-sky-200",
  succeeded: "bg-emerald-100 text-emerald-800 border-emerald-200",
  failed: "bg-red-100 text-red-800 border-red-200",
  cancelled: "bg-amber-100 text-amber-800 border-amber-200",
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <Badge
      className={cn(
        "border px-2.5 py-0.5 text-sm font-semibold capitalize",
        statusStyles[status],
      )}
    >
      {status}
    </Badge>
  );
}
