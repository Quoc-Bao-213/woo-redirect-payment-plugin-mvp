import { db } from "@/db";
import { ApiError } from "@/lib/http";
import { and, desc, eq, gt } from "drizzle-orm";
import { simulatePayment } from "@/features/payment/simulator";
import {
  sessions,
  webhookEvents,
  paymentAttempts,
  type SessionRecord,
  type SessionStatus,
  type WebhookEventType,
} from "@/db/schema";
import {
  type PayInput,
  type CancelInput,
  webhookPayloadSchema,
  type CreateSessionInput,
} from "@/features/payment/schemas";
import {
  maskCardNumber,
  generateEventId,
  generateOrderId,
  addMinutesToDate,
  resolveAppBaseUrl,
  signWebhookPayload,
  getWebhookSharedSecret,
  verifyWebhookSignature,
} from "@/features/payment/utils";

const SESSION_EXPIRY_MINUTES = 25;
const DEFAULT_AMOUNT = 4999;
const DEFAULT_CURRENCY = "USD";

type CheckoutSummary = {
  sessionId: string;
  orderId: string;
  amount: number;
  currency: string;
  status: SessionStatus;
  attemptCount: number;
  maxAttempts: number;
  expiresAt: string;
};

type LatestAttemptSummary = {
  attemptNumber: number;
  maskedCardNumber: string;
  status: "succeeded" | "failed";
  responseCode: string;
  responseMessage: string;
  transactionId: string | null;
  createdAt: string;
};

type SessionDetails = CheckoutSummary & {
  customerEmail: string | null;
  updatedAt: string;
  latestAttempt: LatestAttemptSummary | null;
  webhookDelivered: boolean;
};

type LatestStatus = {
  sessionId: string;
  orderId: string;
  status: SessionStatus;
  attemptCount: number;
  maxAttempts: number;
  amount: number;
  currency: string;
  responseCode: string | null;
  responseMessage: string | null;
  transactionId: string | null;
  webhookDelivered: boolean;
  updatedAt: string;
};

type InternalWebhookPayload = {
  eventId: string;
  eventType: WebhookEventType;
  sessionId: string;
  orderId: string;
  status: SessionStatus;
  attemptNumber: number | null;
  transactionId: string | null;
  responseCode: string | null;
  responseMessage: string | null;
  occurredAt: string;
};

type CreateSessionResult = {
  sessionId: string;
  orderId: string;
  status: SessionStatus;
  checkoutUrl: string;
  reused: boolean;
  supersededSessionId?: string;
};

function normalizeCurrency(currency?: string) {
  return (currency ?? DEFAULT_CURRENCY).toUpperCase();
}

function isExpired(session: SessionRecord) {
  return session.expiresAt.getTime() <= Date.now();
}

function canAttempt(session: SessionRecord) {
  if (session.status === "succeeded" || session.status === "cancelled") {
    return false;
  }

  if (session.attemptCount >= session.maxAttempts) {
    return false;
  }

  return true;
}

async function getSessionBySessionId(sessionId: string) {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  return session ?? null;
}

async function getLatestAttempt(sessionId: string) {
  const [latestAttempt] = await db
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.sessionId, sessionId))
    .orderBy(desc(paymentAttempts.createdAt))
    .limit(1);

  if (!latestAttempt) {
    return null;
  }

  return {
    attemptNumber: latestAttempt.attemptNumber,
    maskedCardNumber: latestAttempt.maskedCardNumber,
    status: latestAttempt.status,
    responseCode: latestAttempt.responseCode,
    responseMessage: latestAttempt.responseMessage,
    transactionId: latestAttempt.transactionId,
    createdAt: latestAttempt.createdAt.toISOString(),
  } satisfies LatestAttemptSummary;
}

async function isWebhookDelivered(sessionId: string) {
  const [webhookEvent] = await db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.sessionId, sessionId),
        eq(webhookEvents.processed, true),
      ),
    )
    .orderBy(desc(webhookEvents.createdAt))
    .limit(1);

  return Boolean(webhookEvent);
}

async function dispatchInternalWebhook(
  payload: InternalWebhookPayload,
  origin?: string,
) {
  const rawPayload = JSON.stringify(payload);
  const secret = getWebhookSharedSecret();
  const signature = signWebhookPayload(rawPayload, secret);
  const baseUrl = resolveAppBaseUrl(origin);

  const response = await fetch(`${baseUrl}/api/webhook/payment`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-signature": signature,
    },
    body: rawPayload,
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(
      502,
      "WEBHOOK_DELIVERY_FAILED",
      `Webhook delivery failed with status ${response.status}: ${body}`,
    );
  }
}

function mapEventTypeToStatus(eventType: WebhookEventType): SessionStatus {
  if (eventType === "payment.succeeded") {
    return "succeeded";
  }

  if (eventType === "payment.cancelled") {
    return "cancelled";
  }

  return "failed";
}

function resolveIncomingStatus(
  currentStatus: SessionStatus,
  incomingStatus: SessionStatus,
) {
  if (currentStatus === "succeeded" && incomingStatus !== "succeeded") {
    return "succeeded";
  }

  if (currentStatus === "cancelled" && incomingStatus === "failed") {
    return "cancelled";
  }

  return incomingStatus;
}

export async function createDemoSession(
  input: CreateSessionInput,
  origin?: string,
): Promise<CreateSessionResult> {
  const amount = input.amount ?? DEFAULT_AMOUNT;
  const currency = normalizeCurrency(input.currency);
  const now = new Date();
  const baseUrl = resolveAppBaseUrl(origin);

  const [activePendingSession] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.status, "pending"), gt(sessions.expiresAt, now)))
    .orderBy(desc(sessions.updatedAt))
    .limit(1);

  if (activePendingSession && activePendingSession.amount === amount) {
    return {
      sessionId: activePendingSession.id,
      orderId: activePendingSession.orderId,
      status: activePendingSession.status,
      checkoutUrl: `${baseUrl}/checkout/${activePendingSession.id}`,
      reused: true,
    };
  }

  let supersededSessionId: string | undefined;

  if (activePendingSession && activePendingSession.amount !== amount) {
    await db
      .update(sessions)
      .set({
        expiresAt: now,
        updatedAt: now,
      })
      .where(eq(sessions.id, activePendingSession.id));

    supersededSessionId = activePendingSession.id;
  }

  const [createdSession] = await db
    .insert(sessions)
    .values({
      orderId: generateOrderId(),
      amount,
      currency,
      status: "pending",
      attemptCount: 0,
      maxAttempts: 3,
      expiresAt: addMinutesToDate(now, SESSION_EXPIRY_MINUTES),
    })
    .returning();

  return {
    sessionId: createdSession.id,
    orderId: createdSession.orderId,
    status: createdSession.status,
    checkoutUrl: `${baseUrl}/checkout/${createdSession.id}`,
    reused: false,
    ...(supersededSessionId ? { supersededSessionId } : {}),
  };
}

export async function getDemoSession(
  sessionId: string,
): Promise<SessionDetails | null> {
  const session = await getSessionBySessionId(sessionId);

  if (!session) {
    return null;
  }

  const [latestAttempt, webhookDelivered] = await Promise.all([
    getLatestAttempt(sessionId),
    isWebhookDelivered(sessionId),
  ]);

  return {
    sessionId: session.id,
    orderId: session.orderId,
    amount: session.amount,
    currency: session.currency,
    status: session.status,
    attemptCount: session.attemptCount,
    maxAttempts: session.maxAttempts,
    expiresAt: session.expiresAt.toISOString(),
    customerEmail: session.customerEmail,
    updatedAt: session.updatedAt.toISOString(),
    latestAttempt,
    webhookDelivered,
  };
}

export async function processDemoPayment(
  sessionId: string,
  input: PayInput,
  origin?: string,
) {
  const session = await getSessionBySessionId(sessionId);

  if (!session) {
    throw new ApiError(
      404,
      "SESSION_NOT_FOUND",
      "Checkout session was not found",
    );
  }

  if (isExpired(session)) {
    throw new ApiError(
      409,
      "SESSION_EXPIRED",
      "This checkout session has expired",
    );
  }

  if (!canAttempt(session)) {
    throw new ApiError(
      409,
      "SESSION_NOT_PAYABLE",
      "Session cannot accept more payment attempts",
    );
  }

  const nextAttemptNumber = session.attemptCount + 1;
  const simulationResult = simulatePayment(input.cardNumber);
  const isSuccessAttempt = simulationResult.attemptStatus === "succeeded";
  const isFinalFailedAttempt =
    !isSuccessAttempt && nextAttemptNumber >= session.maxAttempts;

  await db
    .update(sessions)
    .set({
      customerEmail: input.email,
      attemptCount: nextAttemptNumber,
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, session.id));

  await db.insert(paymentAttempts).values({
    sessionId: session.id,
    attemptNumber: nextAttemptNumber,
    maskedCardNumber: maskCardNumber(input.cardNumber),
    status: simulationResult.attemptStatus,
    responseCode: simulationResult.responseCode,
    responseMessage: simulationResult.responseMessage,
    transactionId: simulationResult.transactionId,
  });

  if (!isSuccessAttempt && !isFinalFailedAttempt) {
    return {
      redirectTo: "/checkout",
      message:
        "Payment attempt failed. Please retry. Final status is not updated until terminal webhook.",
    };
  }

  const webhookPayload: InternalWebhookPayload = {
    eventId: generateEventId(),
    eventType: isSuccessAttempt ? "payment.succeeded" : "payment.failed",
    sessionId: session.id,
    orderId: session.orderId,
    status: isSuccessAttempt ? "succeeded" : "failed",
    attemptNumber: nextAttemptNumber,
    transactionId: simulationResult.transactionId,
    responseCode: simulationResult.responseCode,
    responseMessage: simulationResult.responseMessage,
    occurredAt: new Date().toISOString(),
  };

  await db.insert(webhookEvents).values({
    sessionId: session.id,
    eventId: webhookPayload.eventId,
    eventType: webhookPayload.eventType,
    payload: webhookPayload,
    processed: false,
  });

  await dispatchInternalWebhook(webhookPayload, origin);

  return {
    redirectTo: isSuccessAttempt ? "/result/success" : "/result/failed",
    message: "Payment submitted. Final state will be updated by webhook.",
  };
}

export async function cancelDemoPayment(
  sessionId: string,
  input: CancelInput,
  origin?: string,
) {
  const session = await getSessionBySessionId(sessionId);

  if (!session) {
    throw new ApiError(
      404,
      "SESSION_NOT_FOUND",
      "Checkout session was not found",
    );
  }

  if (isExpired(session)) {
    throw new ApiError(
      409,
      "SESSION_EXPIRED",
      "This checkout session has expired",
    );
  }

  if (session.status === "succeeded") {
    throw new ApiError(
      409,
      "SESSION_ALREADY_PAID",
      "Successful payment cannot be cancelled",
    );
  }

  if (
    session.attemptCount >= session.maxAttempts &&
    session.status === "failed"
  ) {
    throw new ApiError(
      409,
      "SESSION_ATTEMPTS_EXHAUSTED",
      "Session has exhausted retry attempts and cannot be cancelled",
    );
  }

  if (session.status === "cancelled") {
    return {
      redirectTo: "/result/cancelled",
      message: "Session is already cancelled",
    };
  }

  const webhookPayload: InternalWebhookPayload = {
    eventId: generateEventId(),
    eventType: "payment.cancelled",
    sessionId: session.id,
    orderId: session.orderId,
    status: "cancelled",
    attemptNumber: null,
    transactionId: null,
    responseCode: "USER_CANCEL",
    responseMessage: input.reason || "User cancelled the payment",
    occurredAt: new Date().toISOString(),
  };

  await db.insert(webhookEvents).values({
    sessionId: session.id,
    eventId: webhookPayload.eventId,
    eventType: webhookPayload.eventType,
    payload: webhookPayload,
    processed: false,
  });

  await dispatchInternalWebhook(webhookPayload, origin);

  return {
    redirectTo: "/result/cancelled",
    message: "Cancellation submitted. Final state will be updated by webhook.",
  };
}

export async function processPaymentWebhook(
  rawBody: string,
  signatureHeader: string | null,
) {
  const secret = getWebhookSharedSecret();

  if (!verifyWebhookSignature(rawBody, signatureHeader, secret)) {
    throw new ApiError(
      401,
      "INVALID_SIGNATURE",
      "Webhook signature validation failed",
    );
  }

  const parsed = webhookPayloadSchema.parse(JSON.parse(rawBody));

  if (mapEventTypeToStatus(parsed.eventType) !== parsed.status) {
    throw new ApiError(
      400,
      "WEBHOOK_STATUS_MISMATCH",
      "eventType does not match status",
    );
  }

  const [eventRow] = await db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.eventId, parsed.eventId))
    .limit(1);

  if (!eventRow) {
    await db.insert(webhookEvents).values({
      sessionId: parsed.sessionId,
      eventId: parsed.eventId,
      eventType: parsed.eventType,
      payload: parsed,
      processed: false,
    });
  } else if (eventRow.processed) {
    return {
      duplicate: true,
      processed: false,
      status: "already_processed",
    };
  }

  const session = await getSessionBySessionId(parsed.sessionId);

  if (!session) {
    throw new ApiError(
      404,
      "SESSION_NOT_FOUND",
      "Session in webhook payload was not found",
    );
  }

  const nextStatus = resolveIncomingStatus(session.status, parsed.status);

  await db
    .update(sessions)
    .set({
      status: nextStatus,
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, parsed.sessionId));

  await db
    .update(webhookEvents)
    .set({
      processed: true,
      payload: parsed,
    })
    .where(eq(webhookEvents.eventId, parsed.eventId));

  return {
    duplicate: false,
    processed: true,
    status: nextStatus,
  };
}

export async function getLatestDemoStatus(): Promise<LatestStatus | null> {
  const [latestSession] = await db
    .select()
    .from(sessions)
    .orderBy(desc(sessions.updatedAt))
    .limit(1);

  if (!latestSession) {
    return null;
  }

  const [latestAttempt, webhookDelivered] = await Promise.all([
    getLatestAttempt(latestSession.id),
    isWebhookDelivered(latestSession.id),
  ]);

  return {
    sessionId: latestSession.id,
    orderId: latestSession.orderId,
    status: latestSession.status,
    attemptCount: latestSession.attemptCount,
    maxAttempts: latestSession.maxAttempts,
    amount: latestSession.amount,
    currency: latestSession.currency,
    responseCode: latestAttempt?.responseCode ?? null,
    responseMessage: latestAttempt?.responseMessage ?? null,
    transactionId: latestAttempt?.transactionId ?? null,
    webhookDelivered,
    updatedAt: latestSession.updatedAt.toISOString(),
  };
}

export type {
  CheckoutSummary,
  LatestAttemptSummary,
  LatestStatus,
  SessionDetails,
};
