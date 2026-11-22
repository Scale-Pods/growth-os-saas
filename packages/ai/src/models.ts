export type Capability = "text" | "image" | "video" | "speech" | "music" | "moderation";

export interface ModelInfo {
  id: string;
  provider: "openai" | "google";
  capability: Capability;
  label: string;
  aspectRatios?: string[];
  maxVariants?: number;
  acceptsReferenceImage?: boolean;
  /** Longest clip in seconds, video only. */
  maxSeconds?: number;
}

/**
 * Model registry. Ids must match rows in `ai_cost_table` so every model has a price.
 * Image and video entries are seeded from the current system; their functions arrive with P07.
 */
export const MODELS: readonly ModelInfo[] = [
  { id: "gemini-3.1-flash-lite", provider: "google", capability: "text", label: "Gemini 3.1 Flash-Lite" },
  { id: "gemini-3.8-flash", provider: "google", capability: "text", label: "Gemini 3.8 Flash" },
  { id: "gpt-4o-mini", provider: "openai", capability: "text", label: "GPT-4o mini" },
  { id: "text-embedding-3-small", provider: "openai", capability: "text", label: "OpenAI embeddings (small)" },
  {
    id: "gemini-2.5-flash-image",
    provider: "google",
    capability: "image",
    label: "Gemini image",
    aspectRatios: ["1:1", "4:5", "9:16", "16:9"],
    maxVariants: 4,
    acceptsReferenceImage: true,
  },
  {
    id: "gpt-image-1",
    provider: "openai",
    capability: "image",
    label: "GPT Image",
    aspectRatios: ["1:1", "2:3", "3:2"],
    maxVariants: 4,
    acceptsReferenceImage: true,
  },
  { id: "veo-3.0-fast", provider: "google", capability: "video", label: "Veo 3 Fast", maxSeconds: 8, aspectRatios: ["9:16", "16:9"] },
  { id: "veo-3.0", provider: "google", capability: "video", label: "Veo 3", maxSeconds: 8, aspectRatios: ["9:16", "16:9"] },
];

export function getModel(id: string): ModelInfo {
  const m = MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown model: ${id}`);
  return m;
}
