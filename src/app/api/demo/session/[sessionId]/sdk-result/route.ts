import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/http";
import { processDemoSdkResult } from "@/features/payment/service";
import { sdkResultInputSchema } from "@/features/payment/schemas";

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await context.params;
    const payload = await request.json();
    const input = sdkResultInputSchema.parse(payload);
    const origin = new URL(request.url).origin;
    const result = await processDemoSdkResult(sessionId, input, origin);

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
