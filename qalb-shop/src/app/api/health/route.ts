import { db } from "@/server/db";
import { json } from "@/server/http";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";

/** Liveness + database readiness. Returns 503 when the database cannot be reached. */
export async function GET(): Promise<Response> {
  try {
    await db.$queryRaw`SELECT 1`;
    return json({ status: "ok", database: "up", time: new Date().toISOString() });
  } catch (error) {
    logger.error("health_check_failed", { message: error instanceof Error ? error.message : "unknown" });
    return json({ status: "degraded", database: "down", time: new Date().toISOString() }, { status: 503 });
  }
}
