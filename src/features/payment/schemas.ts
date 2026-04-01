import { z } from "zod";

export const sessionStatusSchema = z.enum([
  "pending",
  "succeeded",
  "failed",
  "cancelled",
]);

export const createSessionInputSchema = z.object({
  amount: z.coerce.number().int().positive().max(1_000_000).optional(),
  currency: z.string().trim().length(3).optional(),
});

export const payInputSchema = z.object({
  email: z.string().trim().email().max(200),
  cardHolderName: z.string().trim().min(1).max(120),
  cardNumber: z
    .string()
    .transform((value) => value.replace(/\s+/g, ""))
    .refine((value) => /^\d{16}$/.test(value), {
      message: "Card number must contain exactly 16 digits",
    }),
  expiry: z
    .string()
    .transform((value) => value.replace(/\s+/g, ""))
    .refine((value) => /^(0[1-9]|1[0-2])\/\d{2}$/.test(value), {
      message: "Expiry must be in MM/YY format",
    })
    .refine(
      (value) => {
        const month = Number(value.slice(0, 2));
        const yearTwoDigits = Number(value.slice(3, 5));
        const now = new Date();
        const currentYearTwoDigits = now.getFullYear() % 100;
        const currentMonth = now.getMonth() + 1;

        return (
          yearTwoDigits > currentYearTwoDigits ||
          (yearTwoDigits === currentYearTwoDigits && month >= currentMonth)
        );
      },
      {
        message: "Expiry month/year cannot be in the past",
      },
    ),
  cvv: z
    .string()
    .transform((value) => value.replace(/\s+/g, ""))
    .refine((value) => /^\d{3,4}$/.test(value), {
      message: "CVV must have 3 or 4 digits",
    }),
});

export const cancelInputSchema = z.object({
  reason: z.string().trim().max(120).optional(),
});

export const webhookEventTypeSchema = z.enum([
  "payment.succeeded",
  "payment.failed",
  "payment.cancelled",
]);

export const webhookPayloadSchema = z.object({
  eventId: z.string().uuid(),
  eventType: webhookEventTypeSchema,
  sessionId: z.string().uuid(),
  orderId: z.string().uuid(),
  status: sessionStatusSchema,
  attemptNumber: z.number().int().positive().nullable(),
  transactionId: z.string().uuid().nullable(),
  responseCode: z.string().min(1).max(32).nullable(),
  responseMessage: z.string().min(1).max(255).nullable(),
  occurredAt: z.string().datetime(),
});

export type CreateSessionInput = z.infer<typeof createSessionInputSchema>;
export type PayInput = z.infer<typeof payInputSchema>;
export type CancelInput = z.infer<typeof cancelInputSchema>;
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
