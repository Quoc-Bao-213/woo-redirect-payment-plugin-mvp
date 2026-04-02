import type { AttemptStatus } from "@/db/schema";
import { generateTransactionId } from "@/features/payment/utils";

export type PaymentSimulationResult = {
  attemptStatus: AttemptStatus;
  responseCode: string;
  responseMessage: string;
  transactionId: string | null;
};

export function simulatePayment(cardNumber: string): PaymentSimulationResult {
  if (cardNumber === "4242424242424242") {
    return {
      attemptStatus: "succeeded",
      responseCode: "00",
      responseMessage: "Approved",
      transactionId: generateTransactionId(),
    };
  }

  return {
    attemptStatus: "failed",
    responseCode: "05",
    responseMessage: "Payment failed. Please retry.",
    transactionId: null,
  };
}
