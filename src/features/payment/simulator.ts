import type { AttemptStatus } from "@/db/schema";
import { generateTransactionId } from "@/features/payment/utils";

export type PaymentSimulationResult = {
  attemptStatus: AttemptStatus;
  sessionStatus: "succeeded" | "failed";
  responseCode: string;
  responseMessage: string;
  transactionId: string | null;
  redirectPath: "/result/success" | "/result/failed";
};

export function simulatePayment(cardNumber: string): PaymentSimulationResult {
  if (cardNumber === "4242424242424242") {
    return {
      attemptStatus: "succeeded",
      sessionStatus: "succeeded",
      responseCode: "00",
      responseMessage: "Approved",
      transactionId: generateTransactionId(),
      redirectPath: "/result/success",
    };
  }

  if (cardNumber === "3232323232323232") {
    return {
      attemptStatus: "failed",
      sessionStatus: "failed",
      responseCode: "51",
      responseMessage: "Insufficient funds",
      transactionId: null,
      redirectPath: "/result/failed",
    };
  }

  if (cardNumber === "4141414141414141") {
    return {
      attemptStatus: "failed",
      sessionStatus: "failed",
      responseCode: "05",
      responseMessage: "Do not honor",
      transactionId: null,
      redirectPath: "/result/failed",
    };
  }

  return {
    attemptStatus: "failed",
    sessionStatus: "failed",
    responseCode: "14",
    responseMessage: "Invalid card number",
    transactionId: null,
    redirectPath: "/result/failed",
  };
}
