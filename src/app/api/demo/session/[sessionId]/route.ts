import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/http";
import { getDemoSession } from "@/features/payment/service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await context.params;
    const session = await getDemoSession(sessionId);

    if (!session) {
      return NextResponse.json(
        {
          error: {
            code: "SESSION_NOT_FOUND",
            message: "Checkout session was not found",
          },
        },
        { status: 404 },
      );
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      return NextResponse.json(
        {
          error: {
            code: "SESSION_EXPIRED",
            message: "Checkout session has expired",
          },
        },
        { status: 410 },
      );
    }

    return NextResponse.json(session);
  } catch (error) {
    return toErrorResponse(error);
  }
}
