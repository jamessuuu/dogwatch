import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: [
            "packages/*/src/**/*.test.ts",
            "packages/*/test/**/*.test.ts",
            "apps/*/lib/**/*.test.ts",
          ],
        },
      },
      {
        test: {
          name: "eval",
          include: ["evals/**/*.eval.test.ts"],
        },
      },
    ],
  },
});
