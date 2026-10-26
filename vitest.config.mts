import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for the code that has no framework in it (src/lib, and the scraper once it gets some).
// `npm test` runs them once; the deploy workflow runs it before building and shipping anything.
export default defineConfig({
  resolve: {
    // The same `@/` alias as tsconfig.json.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scraper/**/*.test.ts"],
    // Vitest already fails when no test file matches; stated here because the deploy waits on this
    // run, and a suite that quietly found nothing must not look like a pass.
    passWithNoTests: false,
  },
});
