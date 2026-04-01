import { createHmac, randomUUID, timingSafeEqual } from "crypto";

export function generateSessionId() {
  return randomUUID();
}

export function generateOrderId() {
  return randomUUID();
}

export function generateEventId() {
  return randomUUID();
}

export function generateTransactionId() {
  return randomUUID();
}

export function maskCardNumber(cardNumber: string) {
  const normalized = cardNumber.replace(/\D/g, "");
  const last4 = normalized.slice(-4);

  return `${"*".repeat(Math.max(normalized.length - 4, 0))}${last4}`;
}

export function addMinutesToDate(base: Date, minutes: number) {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

export function normalizeCardNumber(cardNumber: string) {
  return cardNumber.replace(/\s+/g, "");
}

export function getWebhookSharedSecret() {
  return process.env.WEBHOOK_SHARED_SECRET ?? "demo_webhook_secret";
}

export function resolveAppBaseUrl(origin?: string) {
  const fromEnv = process.env.APP_BASE_URL?.trim();

  if (fromEnv) {
    return fromEnv.replace(/\/+$/, "");
  }

  if (origin) {
    return origin.replace(/\/+$/, "");
  }

  return "http://localhost:3000";
}

export function signWebhookPayload(rawPayload: string, secret: string) {
  return createHmac("sha256", secret).update(rawPayload).digest("hex");
}

export function verifyWebhookSignature(
  rawPayload: string,
  signatureHeader: string | null,
  secret: string,
) {
  if (!signatureHeader) {
    return false;
  }

  const expected = signWebhookPayload(rawPayload, secret);
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(signatureHeader, "utf8");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount / 100);
}
