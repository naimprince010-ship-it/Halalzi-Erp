import { NextResponse } from "next/server";

export type AuthErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_CREDENTIALS"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "EMAIL_ALREADY_EXISTS"
  | "COMPANY_SUSPENDED"
  | "USER_DISABLED"
  | "INTERNAL_SERVER_ERROR";

export class AppError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  console.error(error);

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again.",
      },
    },
    { status: 500 },
  );
}

export function validationError(message = "Please check the submitted fields.") {
  return new AppError("VALIDATION_ERROR", message, 400);
}

export function invalidCredentials() {
  return new AppError("INVALID_CREDENTIALS", "Invalid email or password.", 401);
}

export function unauthenticated() {
  return new AppError("UNAUTHENTICATED", "Please login to continue.", 401);
}

export function forbidden(message = "You do not have permission to perform this action.") {
  return new AppError("FORBIDDEN", message, 403);
}

export function userDisabled() {
  return new AppError("USER_DISABLED", "Your account is disabled.", 403);
}

export function companySuspended() {
  return new AppError("COMPANY_SUSPENDED", "This company workspace is suspended.", 403);
}
