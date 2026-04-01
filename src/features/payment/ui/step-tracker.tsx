import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  FLOW_STEPS,
  type FlowStage,
  type FlowStatusVariant,
} from "@/features/payment/ui/flow-stage";

const statusLabelMap: Record<FlowStatusVariant, string> = {
  none: "No Session",
  pending: "Pending",
  processing: "Processing Webhook",
  success: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
};

const statusClassMap: Record<FlowStatusVariant, string> = {
  none: "bg-muted text-muted-foreground",
  pending: "bg-sky-100 text-sky-800 border-sky-200",
  processing: "bg-cyan-100 text-cyan-800 border-cyan-200",
  success: "bg-emerald-100 text-emerald-800 border-emerald-200",
  failed: "bg-red-100 text-red-800 border-red-200",
  cancelled: "bg-amber-100 text-amber-800 border-amber-200",
};

export function StepTracker({
  stage,
  activeStep,
  statusVariant,
  className,
}: {
  stage: FlowStage;
  activeStep: number;
  statusVariant: FlowStatusVariant;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-teal-300/80 bg-linear-to-br from-cyan-100/90 via-background to-teal-100/80 p-5",
        className,
      )}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-800">
            Redirect Flow Tracker
          </p>
          <p className="text-base text-muted-foreground">
            Current stage:{" "}
            <span className="font-medium text-foreground">
              {stage.replaceAll("_", " ")}
            </span>
          </p>
        </div>
        <Badge
          className={cn(
            "border px-2.5 py-0.5 text-sm font-semibold",
            statusClassMap[statusVariant],
          )}
        >
          {statusLabelMap[statusVariant]}
        </Badge>
      </div>

      <ol className="grid gap-3 md:grid-cols-5">
        {FLOW_STEPS.map((step) => {
          const isActive = step.id === activeStep;
          const isDone = step.id < activeStep;

          return (
            <li
              key={step.id}
              className={cn(
                "rounded-lg border p-3.5 transition-colors",
                isActive
                  ? "border-teal-500 bg-teal-100/85"
                  : isDone
                    ? "border-cyan-400 bg-cyan-100/75"
                    : "border-border bg-background/80",
              )}
            >
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                    isActive
                      ? "bg-teal-700 text-white"
                      : isDone
                        ? "bg-cyan-700 text-white"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {step.id}
                </span>
                <span className="text-base font-semibold">{step.label}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {step.description}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
