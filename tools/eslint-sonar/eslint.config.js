import path from "node:path";
import { fileURLToPath } from "node:url";
import tsParser from "@typescript-eslint/parser";
import sonarjs from "eslint-plugin-sonarjs";
import globals from "globals";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const sonarRules = {
  ...sonarjs.configs.recommended.rules,
};

for (const [ruleName, severity] of Object.entries(sonarRules)) {
  if (severity !== "off") {
    sonarRules[ruleName] = "error";
  }
}

// ESM Node projects: these eslint-plugin-sonarjs rules are not SonarCloud TypeScript rule ids (see SonarJS README).
sonarRules["sonarjs/declarations-in-global-scope"] = "off";
sonarRules["sonarjs/arrow-function-convention"] = "off";
sonarRules["sonarjs/file-header"] = "off";

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/*.test.ts",
      "**/*.spec.ts",
    ],
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        tsconfigRootDir: repoRoot,
      },
      globals: {
        ...globals.node,
        NodeJS: "readonly",
      },
    },
    ...sonarjs.configs.recommended,
    rules: sonarRules,
  },
];