import tseslint from "typescript-eslint";

const AI_SDKS = ["openai", "openai/*", "@google/*", "@google-cloud/*", "@anthropic-ai/*"];

const SERVICE_ROLE = {
  selector: "MemberExpression[property.name='SUPABASE_SERVICE_ROLE_KEY']",
  message:
    "The service-role key may only be read in server-only modules (apps/web/src/lib/server-only, apps/worker, packages/shared/src/env.ts).",
};

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/*.d.ts", "**/next-env.d.ts", "**/.turbo/**"],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mjs,js}"],
    rules: {
      "no-console": "error", // use the logger (CLAUDE.md conventions)
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-restricted-syntax": ["error", SERVICE_ROLE],
      // Rule 3: no provider SDKs outside packages/ai
      "no-restricted-imports": ["error", { patterns: [{ group: AI_SDKS, message: "AI provider SDKs may only be imported in packages/ai." }] }],
    },
  },
  // Service-role key allowed here only
  {
    files: [
      "apps/web/src/lib/server-only/**",
      "apps/worker/**",
      "packages/shared/src/env.ts",
      "packages/db/tests/**",
    ],
    rules: { "no-restricted-syntax": "off" },
  },
  // AI gateway may import provider SDKs
  {
    files: ["packages/ai/**"],
    rules: { "no-restricted-imports": "off" },
  },
  // Client-side code must never import server-only modules
  {
    files: ["apps/web/src/components/**", "apps/web/src/lib/supabase/client.ts", "**/*.client.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: AI_SDKS, message: "AI provider SDKs may only be imported in packages/ai." },
            { group: ["**/server-only", "**/server-only/*"], message: "Client code must not import server-only modules (service-role key)." },
          ],
        },
      ],
    },
  },
  // Tests and one-off scripts may print
  {
    files: ["**/tests/**", "**/*.test.ts"],
    rules: { "no-console": "off" },
  },
);
