/** Environment access. Read lazily so tests can override values per run. */

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

export function uploadDir(): string {
  return process.env.UPLOAD_DIR ?? "./uploads";
}

export function bcryptCost(): number {
  const raw = Number(process.env.BCRYPT_COST ?? "12");
  if (!Number.isInteger(raw) || raw < 4 || raw > 15) return 12;
  return raw;
}

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export function logLevel(): LogLevel {
  const v = process.env.LOG_LEVEL;
  return v === "debug" || v === "info" || v === "warn" || v === "error" || v === "silent" ? v : "info";
}

/** Only ever honoured outside production. */
export function exposeDevResetLink(): boolean {
  return !isProduction() && process.env.EXPOSE_DEV_RESET_LINK === "true";
}
