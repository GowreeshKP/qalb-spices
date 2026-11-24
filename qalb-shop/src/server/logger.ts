import { logLevel, type LogLevel } from "./env";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

export type LogContext = Record<string, string | number | boolean | null | undefined>;

const REDACT = /password|token|secret|authorization|cookie/i;

function redact(context: LogContext): LogContext {
  const out: LogContext = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] = REDACT.test(key) ? "[redacted]" : value;
  }
  return out;
}

function write(level: Exclude<LogLevel, "silent">, msg: string, context: LogContext = {}): void {
  if (ORDER[level] < ORDER[logLevel()]) return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...redact(context) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Structured JSON logger. Sensitive keys are redacted; never pass stack traces to clients. */
export const logger = {
  debug: (msg: string, ctx?: LogContext) => write("debug", msg, ctx),
  info: (msg: string, ctx?: LogContext) => write("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => write("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => write("error", msg, ctx),
};
