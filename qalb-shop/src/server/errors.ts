export type ErrorCode =
  | "BAD_REQUEST"
  | "INVALID_JSON"
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "INVALID_CREDENTIALS"
  | "FORBIDDEN"
  | "CSRF_REJECTED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "EMAIL_TAKEN"
  | "VERSION_CONFLICT"
  | "INSUFFICIENT_STOCK"
  | "PRODUCT_UNAVAILABLE"
  | "PRODUCT_HAS_ORDERS"
  | "EMPTY_CART"
  | "NOT_AN_IMAGE"
  | "INVALID_TRANSITION"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

/** Error with an HTTP status and a stable machine-readable code. Safe to show to clients. */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const Errors = {
  badRequest: (message: string, details?: unknown) => new AppError(400, "BAD_REQUEST", message, details),
  invalidJson: () => new AppError(400, "INVALID_JSON", "Request body must be valid JSON"),
  validation: (details: unknown) => new AppError(422, "VALIDATION_ERROR", "Some fields are invalid", details),
  unauthenticated: () => new AppError(401, "UNAUTHENTICATED", "You need to log in to do that"),
  invalidCredentials: () => new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect"),
  forbidden: () => new AppError(403, "FORBIDDEN", "You do not have permission to do that"),
  csrf: () => new AppError(403, "CSRF_REJECTED", "Cross-site request rejected"),
  notFound: (what = "Resource") => new AppError(404, "NOT_FOUND", `${what} not found`),
  conflict: (message: string, code: ErrorCode = "CONFLICT", details?: unknown) => new AppError(409, code, message, details),
  tooLarge: (message: string) => new AppError(413, "PAYLOAD_TOO_LARGE", message),
  unsupportedMedia: (message: string) => new AppError(415, "UNSUPPORTED_MEDIA_TYPE", message),
  rateLimited: (retryAfterSeconds: number) =>
    new AppError(429, "RATE_LIMITED", "Too many attempts. Try again later.", { retryAfterSeconds }),
};
