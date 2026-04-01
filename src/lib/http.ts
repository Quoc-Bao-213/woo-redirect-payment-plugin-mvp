import { ZodError } from "zod";
import { NextResponse } from "next/server";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function toErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request payload",
          details: error.flatten(),
        },
      },
      { status: 400 },
    );
  }

  const debugMessage =
    error instanceof Error ? error.message : "Unexpected unknown error";

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong while processing the request",
        ...(process.env.NODE_ENV !== "production"
          ? { debug: debugMessage }
          : {}),
      },
    },
    { status: 500 },
  );
}
