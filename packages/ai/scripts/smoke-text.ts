// One tiny real call per provider through the gateway (fake in-memory ledger, so no database needed).
// Costs a fraction of a cent. Prints results only, never keys.
//   pnpm --filter @growth-os/ai smoke --  (run with the env file that holds the keys)
import { generateText, googleTextProvider, openAiTextProvider, type CreditLedger, type UsageRecord } from "../src";

async function main() {
  const openai = process.env.OPENAI_API_KEY;
  const google = process.env.GOOGLE_AI_API_KEY;

  const ledgerLog: string[] = [];
  const ledger: CreditLedger = {
    async reserve({ credits }) {
      ledgerLog.push(`reserve:${credits}`);
    },
    async settle({ actualCredits }) {
      ledgerLog.push(`settle:${actualCredits}`);
    },
    async release() {
      ledgerLog.push("release");
    },
  };
  const usage: UsageRecord[] = [];

  const runs: Array<[string, string | undefined, () => ReturnType<typeof openAiTextProvider>]> = [
    ["gpt-4o-mini", openai, () => openAiTextProvider(openai!)],
    ["gemini-3.1-flash-lite", google, () => googleTextProvider(google!)],
  ];

  let failed = 0;
  for (const [model, key, make] of runs) {
    if (!key) {
      process.stdout.write(`SKIP  ${model}  (key not set)` + "
");
      continue;
    }
    ledgerLog.length = 0;
    try {
      const provider = make();
      const out = await generateText(
        {
          ledger,
          usage: { record: async (u) => void usage.push(u) },
          costs: { get: async (m) => ({ model: m, unit: "per_1k_tokens", usdPerUnit: 0.0006 }) },
          providerFor: () => provider,
        },
        {
          orgId: "smoke-org",
          userId: null,
          jobId: crypto.randomUUID(),
          model,
          system: "You are a test. Follow the instruction exactly.",
          user: "Reply with the single word: ok",
          maxOutputTokens: 200,
        },
      );
      process.stdout.write(`PASS  ${model}  reply="${out.text.trim().slice(0, 40)}"  credits=${out.credits}  usd=${out.costUsd}  ledger=${ledgerLog.join(",")}` + "
");
    } catch (e) {
      failed++;
      process.stdout.write(`FAIL  ${model}  ${e instanceof Error ? e.message : String(e)}  ledger=${ledgerLog.join(",")}` + "
");
    }
  }
  process.exit(failed ? 1 : 0);
}

main();
