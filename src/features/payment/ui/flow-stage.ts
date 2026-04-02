export type SessionStatus = "pending" | "succeeded" | "failed" | "cancelled";
export type FlowContext = "home" | "checkout" | "result";

export type FlowStep = {
  id: number;
  label: string;
  description: string;
};

export type FlowStage =
  | "start"
  | "session_created"
  | "hosted_checkout"
  | "webhook_processing"
  | "final_state";

export type FlowStatusVariant =
  | "none"
  | "pending"
  | "processing"
  | "success"
  | "failed"
  | "cancelled";

export type FlowSessionSnapshot = {
  status: SessionStatus;
  attemptCount: number;
  webhookDelivered: boolean;
};

export const FLOW_STEPS: FlowStep[] = [
  { id: 1, label: "Start", description: "User lands on homepage" },
  {
    id: 2,
    label: "Session Created",
    description: "Backend creates pending session",
  },
  {
    id: 3,
    label: "Hosted Checkout",
    description: "User enters payment details",
  },
  {
    id: 4,
    label: "Webhook Processing",
    description: "Result is waiting for webhook",
  },
  { id: 5, label: "Final State", description: "Webhook confirms final status" },
];

export function deriveFlowStageFromSession(
  session: FlowSessionSnapshot | null,
  context: FlowContext,
): { stage: FlowStage; statusVariant: FlowStatusVariant; activeStep: number } {
  if (!session) {
    return { stage: "start", statusVariant: "none", activeStep: 1 };
  }

  // Homepage should represent the entry stage, not replay terminal state from old sessions.
  if (context === "home") {
    if (session.status === "pending" && session.attemptCount === 0) {
      return {
        stage: "session_created",
        statusVariant: "pending",
        activeStep: 2,
      };
    }

    return { stage: "start", statusVariant: "none", activeStep: 1 };
  }

  if (
    session.webhookDelivered &&
    (session.status === "succeeded" ||
      session.status === "failed" ||
      session.status === "cancelled")
  ) {
    const statusVariant: FlowStatusVariant =
      session.status === "succeeded"
        ? "success"
        : session.status === "cancelled"
          ? "cancelled"
          : "failed";

    return { stage: "final_state", statusVariant, activeStep: 5 };
  }

  if (
    context === "result" &&
    session.attemptCount > 0 &&
    !session.webhookDelivered
  ) {
    return {
      stage: "webhook_processing",
      statusVariant: "processing",
      activeStep: 4,
    };
  }

  if (context === "checkout" || context === "result") {
    return {
      stage: "hosted_checkout",
      statusVariant: "pending",
      activeStep: 3,
    };
  }

  return {
    stage: "session_created",
    statusVariant: "pending",
    activeStep: 2,
  };
}
