import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

// The E2E suite runs against a production build with its own throwaway SQLite database.
export const E2E_ENV = {
  DATABASE_URL: "file:./e2e.db",
  APP_URL: BASE_URL,
  UPLOAD_DIR: "./tests/.e2e-uploads",
  BCRYPT_COST: "4",
  LOG_LEVEL: "warn",
  EXPOSE_DEV_RESET_LINK: "false",
  SEED_ADMIN_EMAIL: "admin@qalb.test",
  SEED_ADMIN_PASSWORD: "Admin#12345",
  SEED_USER_EMAIL: "user@qalb.test",
  SEED_USER_PASSWORD: "User#12345",
};

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  // Tests share one database, so run them serially.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node scripts/e2e-prepare.mjs && npx next build && npx next start -p ${PORT}`,
    url: `${BASE_URL}/api/health`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: E2E_ENV,
  },
});
