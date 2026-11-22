import { ProviderFailure, type Embedder, type TextProvider, type TextRequest, type TextResponse } from "./ports";

function failure(provider: string, status: number, body: string): ProviderFailure {
  // Keep the message short and free of anything that could contain a key or the prompt.
  const snippet = body.replace(/\s+/g, " ").slice(0, 160);
  return new ProviderFailure(`${provider} returned ${status}: ${snippet}`, status, status === 429 || status >= 500);
}

export function openAiTextProvider(apiKey: string, fetchImpl: typeof fetch = fetch): TextProvider {
  return {
    async generate(req: TextRequest): Promise<TextResponse> {
      let res: Response;
      try {
        res = await fetchImpl("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: req.model,
            messages: [
              { role: "system", content: req.system },
              { role: "user", content: req.user },
            ],
            max_completion_tokens: req.maxOutputTokens,
            ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
            ...(req.jsonMode ? { response_format: { type: "json_object" } } : {}),
          }),
          signal: req.signal,
        });
      } catch (e) {
        throw new ProviderFailure(`openai request failed: ${e instanceof Error ? e.name : "error"}`, null, true);
      }
      if (!res.ok) throw failure("openai", res.status, await res.text());
      const j = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = j.choices?.[0]?.message?.content;
      if (typeof text !== "string") throw new ProviderFailure("openai returned no text", res.status, false);
      return { text, inputTokens: j.usage?.prompt_tokens ?? 0, outputTokens: j.usage?.completion_tokens ?? 0 };
    },
  };
}

export function googleTextProvider(apiKey: string, fetchImpl: typeof fetch = fetch): TextProvider {
  return {
    async generate(req: TextRequest): Promise<TextResponse> {
      let res: Response;
      try {
        res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: req.system }] },
            contents: [{ role: "user", parts: [{ text: req.user }] }],
            generationConfig: {
              maxOutputTokens: req.maxOutputTokens,
              ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
              ...(req.jsonMode ? { responseMimeType: "application/json" } : {}),
            },
          }),
          signal: req.signal,
        });
      } catch (e) {
        throw new ProviderFailure(`google request failed: ${e instanceof Error ? e.name : "error"}`, null, true);
      }
      if (!res.ok) throw failure("google", res.status, await res.text());
      const j = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };
      const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
      if (!text) throw new ProviderFailure("google returned no text", res.status, false);
      return { text, inputTokens: j.usageMetadata?.promptTokenCount ?? 0, outputTokens: j.usageMetadata?.candidatesTokenCount ?? 0 };
    },
  };
}

export function openAiEmbedder(apiKey: string, fetchImpl: typeof fetch = fetch): Embedder {
  return {
    async embed(model, inputs, signal) {
      let res: Response;
      try {
        res = await fetchImpl("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, input: inputs }),
          signal,
        });
      } catch (e) {
        throw new ProviderFailure(`openai embeddings request failed: ${e instanceof Error ? e.name : "error"}`, null, true);
      }
      if (!res.ok) throw failure("openai", res.status, await res.text());
      const j = (await res.json()) as { data?: { embedding?: number[]; index?: number }[]; usage?: { total_tokens?: number } };
      const rows = [...(j.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      if (rows.length !== inputs.length || rows.some((r) => !Array.isArray(r.embedding))) throw new ProviderFailure("openai returned unexpected embeddings", res.status, false);
      return { vectors: rows.map((r) => r.embedding as number[]), tokens: j.usage?.total_tokens ?? 0 };
    },
  };
}
