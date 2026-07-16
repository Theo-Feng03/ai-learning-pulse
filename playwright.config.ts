import path from "node:path";
import { defineConfig } from "@playwright/test";

const dbPath = path.resolve(__dirname, "tests/tmp/e2e.db");

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "pnpm exec tsx tests/e2e/prepare-db.ts && pnpm exec next dev --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    env: {
      DATABASE_URL: `file:${dbPath}`,
      EXPORT_DIR: "tests/tmp/e2e-exports",
      // E2E 在 no_ai 模式下运行，验证降级主链路
      MODEL_BASE_URL: "",
      MODEL_API_KEY: "",
      MODEL_NAME: "",
    },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
