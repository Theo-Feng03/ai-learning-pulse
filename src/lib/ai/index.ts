import { getEnv } from "@/lib/env";
import { MockProvider } from "./mockProvider";
import { OpenAICompatibleProvider } from "./openaiCompatible";
import type { ModelProvider } from "./types";

/**
 * 根据环境变量返回 ModelProvider；未配置时返回 null（no_ai 模式）。
 * AI_PROVIDER=mock 仅用于本地演示与测试。
 */
export function getProvider(): ModelProvider | null {
  if (process.env.AI_PROVIDER === "mock") return new MockProvider();
  const env = getEnv();
  if (!env.modelConfigured || !env.MODEL_BASE_URL || !env.MODEL_NAME) return null;
  return new OpenAICompatibleProvider({
    baseUrl: env.MODEL_BASE_URL,
    apiKey: env.MODEL_API_KEY,
    modelName: env.MODEL_NAME,
    timeoutMs: env.MODEL_TIMEOUT_MS,
  });
}
