// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/.next/**", "**/coverage/**", "**/node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.mjs", "scripts/*.mjs", "packages/*/bin/*.mjs", "apps/*/*.config.mjs"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Boundary discipline (SPEC §4): no `as any` sneaking through.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      // A leading underscore is the idiomatic "intentionally discarded"
      // marker (destructured-away fields, unused callback params whose
      // position still matters) — used throughout src/record and src/probe.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
    },
  },
  {
    // SPEC §4 isolation rule: src/checks and src/verify never import node:*
    // builtins — that is what lets a published record be re-verified inside
    // a visitor's browser (the browser Verify button, M6) with zero server.
    files: ["packages/dogwatch/src/checks/**/*.ts", "packages/dogwatch/src/verify/**/*.ts"],
    ignores: [
      "packages/dogwatch/src/checks/**/*.test.ts",
      "packages/dogwatch/src/verify/**/*.test.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*"],
              message:
                "SPEC §4 boundary: src/checks and src/verify must not import node builtins (this is what lets a published record be re-derived and re-verified inside a browser with zero server, e.g. schemas/run-record.v1.json + the M6 Verify button). Inject capabilities (probe results, file reads) from the caller instead. (Tests are exempt.)",
            },
          ],
        },
      ],
    },
  },
  {
    // src/probe is the ONLY network/I-O code in the pipeline (SPEC §4); it is
    // injected everywhere else so the whole pipeline replays offline from
    // recorded transcripts (SPEC §11).
    files: ["packages/dogwatch/src/probe/**/*.ts"],
    rules: {},
  },
  {
    files: ["**/*.mjs", "scripts/**"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        fetch: "readonly",
      },
    },
  }
);
