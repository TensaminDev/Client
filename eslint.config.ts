import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import * as tsParser from "@typescript-eslint/parser";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        tsconfigRootDir,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
];
