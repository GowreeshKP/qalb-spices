import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(__dirname, "src") };

export default defineConfig({
  resolve: { alias },
  test: {
    // Integration tests share one SQLite file, so test files run one at a time.
    fileParallelism: false,
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
          env: { BCRYPT_COST: "4", LOG_LEVEL: "silent", DATABASE_URL: "file:./unit-unused.db" },
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/integration/global-setup.ts"],
          testTimeout: 20_000,
          hookTimeout: 60_000,
          env: {
            DATABASE_URL: "file:./test.db",
            BCRYPT_COST: "4",
            LOG_LEVEL: "silent",
            APP_URL: "http://localhost",
            UPLOAD_DIR: "./tests/.tmp-uploads",
            EXPOSE_DEV_RESET_LINK: "true",
          },
        },
      },
    ],
  },
});
