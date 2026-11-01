import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "migrations")),
          APP_SECRET_KEY: "test-secret-key-test-secret-key-0000",
          PUBLIC_ORIGIN: "http://localhost",
          SESSION_COOKIE_SECURE: "false",
          MAX_TOTAL_BYTES: "104857600",
        },
      },
    })),
  ],
  test: { setupFiles: ["./test/setup.ts"] },
});
