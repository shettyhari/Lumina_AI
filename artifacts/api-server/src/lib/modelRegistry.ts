export type Provider = "gemini" | "openai" | "anthropic" | "openrouter";

export interface ModelInfo {
  id: string;
  name: string;
  provider: Provider;
  description: string;
  requiresKey: boolean;
  contextWindow?: number;
  supportsStreaming: boolean;
}

export const MODELS: ModelInfo[] = [
  // --- Gemini (built-in, no key required) ---
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "gemini",
    description: "Fastest Gemini model, great for most tasks",
    requiresKey: false,
    contextWindow: 1000000,
    supportsStreaming: true,
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "gemini",
    description: "Most capable Gemini model for complex reasoning",
    requiresKey: false,
    contextWindow: 2000000,
    supportsStreaming: true,
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "gemini",
    description: "Efficient multimodal model with speed focus",
    requiresKey: false,
    contextWindow: 1000000,
    supportsStreaming: true,
  },
  // --- OpenAI (requires user key) ---
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    description: "OpenAI's most capable multimodal model",
    requiresKey: true,
    contextWindow: 128000,
    supportsStreaming: true,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    description: "Fast and affordable OpenAI model",
    requiresKey: true,
    contextWindow: 128000,
    supportsStreaming: true,
  },
  {
    id: "o3-mini",
    name: "o3-mini",
    provider: "openai",
    description: "Advanced reasoning model, optimized for STEM",
    requiresKey: true,
    contextWindow: 200000,
    supportsStreaming: true,
  },
  {
    id: "o1",
    name: "o1",
    provider: "openai",
    description: "Powerful reasoning model for complex problems",
    requiresKey: true,
    contextWindow: 200000,
    supportsStreaming: true,
  },
  // --- Anthropic (requires user key) ---
  {
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    description: "Anthropic's best model for intelligence and speed",
    requiresKey: true,
    contextWindow: 200000,
    supportsStreaming: true,
  },
  {
    id: "claude-3-5-haiku-20241022",
    name: "Claude 3.5 Haiku",
    provider: "anthropic",
    description: "Fastest Claude model for simple tasks",
    requiresKey: true,
    contextWindow: 200000,
    supportsStreaming: true,
  },
  {
    id: "claude-3-opus-20240229",
    name: "Claude 3 Opus",
    provider: "anthropic",
    description: "Most powerful Claude model for complex tasks",
    requiresKey: true,
    contextWindow: 200000,
    supportsStreaming: true,
  },
  // --- OpenRouter (requires user key, many models) ---
  {
    id: "openrouter/meta-llama/llama-3.3-70b-instruct",
    name: "Llama 3.3 70B",
    provider: "openrouter",
    description: "Meta's latest open-source model, very capable",
    requiresKey: true,
    contextWindow: 131072,
    supportsStreaming: true,
  },
  {
    id: "openrouter/deepseek/deepseek-r1",
    name: "DeepSeek R1",
    provider: "openrouter",
    description: "Advanced reasoning model, open-source",
    requiresKey: true,
    contextWindow: 65536,
    supportsStreaming: true,
  },
  {
    id: "openrouter/microsoft/phi-4",
    name: "Microsoft Phi-4",
    provider: "openrouter",
    description: "Compact model with surprisingly strong reasoning",
    requiresKey: true,
    contextWindow: 16384,
    supportsStreaming: true,
  },
  {
    id: "openrouter/qwen/qwen-2.5-72b-instruct",
    name: "Qwen 2.5 72B",
    provider: "openrouter",
    description: "Alibaba's powerful multilingual instruction model",
    requiresKey: true,
    contextWindow: 131072,
    supportsStreaming: true,
  },
];

export function getModelInfo(modelId: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === modelId);
}

export function getProviderForModel(modelId: string): Provider {
  const info = getModelInfo(modelId);
  if (info) return info.provider;
  // Fallback heuristics
  if (modelId.startsWith("gemini")) return "gemini";
  if (modelId.startsWith("gpt-") || modelId.startsWith("o1") || modelId.startsWith("o3")) return "openai";
  if (modelId.startsWith("claude")) return "anthropic";
  if (modelId.startsWith("openrouter/")) return "openrouter";
  return "gemini";
}
