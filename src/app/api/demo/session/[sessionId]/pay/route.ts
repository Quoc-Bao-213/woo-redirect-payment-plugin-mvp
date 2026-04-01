import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/http";
import { payInputSchema } from "@/features/payment/schemas";
import { processDemoPayment } from "@/features/payment/service";

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await context.params;
    const payload = await request.json();
    const input = payInputSchema.parse(payload);
    const origin = new URL(request.url).origin;
    const result = await processDemoPayment(sessionId, input, origin);

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
