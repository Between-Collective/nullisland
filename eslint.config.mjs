import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Lint for the packages. The web app has its own config (Next brings rules that
 * only make sense inside it), and this covers what used to be linted as part of
 * it before the generator moved into a package of its own.
 */
export default tseslint.config(
  { ignores: ["**/dist/**", "apps/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["packages/**/*.ts"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly", Buffer: "readonly", crypto: "readonly", structuredClone: "readonly", require: "readonly", __dirname: "readonly", TextEncoder: "readonly", TextDecoder: "readonly", Blob: "readonly" },
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
);
