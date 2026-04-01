export const SESSION_STATUS_VALUES = [
  "pending",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type SessionStatus = (typeof SESSION_STATUS_VALUES)[number];

export const ATTEMPT_STATUS_VALUES = ["succeeded", "failed"] as const;

export type AttemptStatus = (typeof ATTEMPT_STATUS_VALUES)[number];

export const WEBHOOK_EVENT_TYPE_VALUES = [
  "payment.succeeded",
  "payment.failed",
  "payment.cancelled",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPE_VALUES)[number];
