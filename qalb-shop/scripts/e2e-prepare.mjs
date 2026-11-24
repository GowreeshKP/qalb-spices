// Prepares a fresh migrated + seeded SQLite database for the E2E run.
// Runs as part of the Playwright webServer command, i.e. before the app starts.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = {
  ...process.env,
  DATABASE_URL: "file:./e2e.db",
  BCRYPT_COST: "4",
  SEED_ADMIN_EMAIL: "admin@qalb.test",
  SEED_ADMIN_PASSWORD: "Admin#12345",
  SEED_USER_EMAIL: "user@qalb.test",
  SEED_USER_PASSWORD: "User#12345",
};

for (const file of ["e2e.db", "e2e.db-journal"]) {
  const target = path.join(root, "prisma", file);
  if (existsSync(target)) rmSync(target);
}
rmSync(path.join(root, "tests", ".e2e-uploads"), { recursive: true, force: true });
mkdirSync(path.join(root, "tests", ".e2e-uploads"), { recursive: true });

execSync("npx prisma migrate deploy", { cwd: root, env, stdio: "inherit" });
execSync("npx tsx prisma/seed.ts", { cwd: root, env, stdio: "inherit" });
