import { NextResponse } from "next/server";
import { ApiError, toErrorResponse } from "@/lib/http";
import { processPaymentWebhook } from "@/features/payment/service";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    try {
      JSON.parse(rawBody);
    } catch {
      throw new ApiError(
        400,
        "INVALID_JSON",
        "Webhook payload must be valid JSON",
      );
    }

    const signature = request.headers.get("x-webhook-signature");
    const result = await processPaymentWebhook(rawBody, signature);

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
