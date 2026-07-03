// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import vitest from "@vitest/eslint-plugin";

export default tseslint.config([
  // ── ignore generated / third-party artefacts ──────────────────────────────
  {
    ignores: ["dist/", "coverage/", "fixtures/", "**/*.b64"],
  },

  // ── base JS rules for all files ──────────────────────────────────────────
  js.configs.recommended,

  // ── type-aware TypeScript rules for source + scripts ─────────────────────
  {
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.ts", "vite.config.ts"],
    extends: [...tseslint.configs.recommendedTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // ── React Hooks ──────────────────────────────────────────────────────
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // ── Accessibility ────────────────────────────────────────────────────
      ...jsxA11y.configs.recommended.rules,

      // ── TypeScript extras ────────────────────────────────────────────────
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",

      // Downgrade noisy-but-valid patterns to warnings
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",

      // sql.js uses 'any' internally; allow in DB-adjacent code for now
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // ── Test files: type-aware TS + Vitest ───────────────────────────────────
  {
    files: ["tests/**/*.ts"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    plugins: {
      vitest,
    },
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...vitest.configs.recommended.rules,
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      // globalThis manipulation in tests
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);
