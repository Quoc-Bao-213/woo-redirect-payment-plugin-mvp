import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/http";
import { createDemoSession } from "@/features/payment/service";
import { createSessionInputSchema } from "@/features/payment/schemas";

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({}));
    const input = createSessionInputSchema.parse(payload ?? {});
    const origin = new URL(request.url).origin;
    const result = await createDemoSession(input, origin);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
