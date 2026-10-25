import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/test-results/**",
      "**/playwright-report/**",
      "apps/web/e2e/artifacts/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: "core では Math.random() 禁止。rng/ を使うこと",
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: "core では Date.now() 禁止。time/ を使うこと",
        },
        {
          selector: "NewExpression[callee.name='Date']",
          message: "core では new Date() 禁止。time/ を使うこと",
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "window", message: "core は DOM 非依存" },
        { name: "document", message: "core は DOM 非依存" },
        { name: "localStorage", message: "core は DOM 非依存" },
        { name: "sessionStorage", message: "core は DOM 非依存" },
        { name: "indexedDB", message: "core は DOM 非依存" },
        { name: "navigator", message: "core は DOM 非依存" },
        { name: "location", message: "core は DOM 非依存" },
        { name: "history", message: "core は DOM 非依存" },
        { name: "alert", message: "core は DOM 非依存" },
        { name: "confirm", message: "core は DOM 非依存" },
        { name: "prompt", message: "core は DOM 非依存" },
        { name: "fetch", message: "core は純粋なロジックのみ。通信禁止" },
        { name: "XMLHttpRequest", message: "core は DOM 非依存" },
        { name: "WebSocket", message: "core は DOM 非依存" },
        { name: "performance", message: "core は決定論的であること" },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "react/*", "react-dom/*", "@trace/web"],
              message: "core から React・apps を import しない",
            },
          ],
        },
      ],
    },
  },
);
