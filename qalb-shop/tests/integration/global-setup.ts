import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

/** Build a fresh SQLite test database by applying the real migrations. */
export default function setup(): void {
  const dbDir = path.resolve(__dirname, "../../prisma");
  for (const file of ["test.db", "test.db-journal"]) {
    const target = path.join(dbDir, file);
    if (existsSync(target)) rmSync(target);
  }
  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(__dirname, "../.."),
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "pipe",
  });
}
