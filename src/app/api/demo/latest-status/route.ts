import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/http";
import { getLatestDemoStatus } from "@/features/payment/service";

export async function GET() {
  try {
    const latestStatus = await getLatestDemoStatus();
    return NextResponse.json({ latestStatus });
  } catch (error) {
    return toErrorResponse(error);
  }
}
