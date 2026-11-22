import tseslint from "typescript-eslint";

const AI_SDKS = ["openai", "openai/*", "@google/*", "@google-cloud/*", "@anthropic-ai/*"];

const SERVICE_ROLE = {
  selector: "MemberExpression[property.name='SUPABASE_SERVICE_ROLE_KEY']",
  message:
    "The service-role key may only be read in server-only modules (apps/web/src/lib/server-only, apps/worker, packages/shared/src/env.ts, packages/db/scripts).",
};

const ORG_FROM_REQUEST = [
  {
    selector: "MemberExpression[property.name=/^(org_id|orgId)$/][object.name=/^(body|input|payload|formData|searchParams|params|req|request)$/]",
    message: "org_id must never be read from a request. Use ctx.orgId from withOrg / withOrgAction.",
  },
  {
    selector: "CallExpression[callee.property.name='get'][arguments.0.value=/^(org_id|orgId)$/]",
    message: "org_id must never be read from form data or query strings. Use ctx.orgId from withOrg / withOrgAction.",
  },
];

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
  // Web app: org_id never comes from the request
  {
    files: ["apps/web/src/**"],
    rules: { "no-restricted-syntax": ["error", SERVICE_ROLE, ...ORG_FROM_REQUEST] },
  },
  // Service-role key allowed here only
  {
    files: [
      "apps/web/src/lib/server-only/**",
      "apps/worker/**",
      "packages/shared/src/env.ts",
      "packages/db/tests/**",
      // Local-only developer tools (the seed refuses to run against anything but 127.0.0.1)
      "packages/db/scripts/**",
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
