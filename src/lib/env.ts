import { z } from "zod";

const intWithDefault = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (!v || v.trim() === "") return def;
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
    });

const floatWithDefault = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (!v || v.trim() === "") return def;
      const n = Number(v);
      return Number.isFinite(n) && n > 0 && n <= 1 ? n : def;
    });

const envSchema = z.object({
  DATABASE_URL: z.string().default("file:./dev.db"),
  MODEL_BASE_URL: z.string().optional(),
  MODEL_API_KEY: z.string().optional(),
  MODEL_NAME: z.string().optional(),
  MODEL_TIMEOUT_MS: intWithDefault(30_000),
  MODEL_MAX_RETRIES: intWithDefault(1),
  FETCH_TIMEOUT_MS: intWithDefault(15_000),
  INGEST_CONCURRENCY: intWithDefault(5),
  AI_CONCURRENCY: intWithDefault(2),
  AI_MAX_PER_RUN: intWithDefault(30),
  TITLE_SIMILARITY_THRESHOLD: floatWithDefault(0.85),
  EXPORT_DIR: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema> & {
  /** 模型是否已配置；未配置时系统进入 no_ai 模式 */
  modelConfigured: boolean;
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = envSchema.parse(source);
  const baseUrl = parsed.MODEL_BASE_URL?.trim() || undefined;
  const modelName = parsed.MODEL_NAME?.trim() || undefined;
  return {
    ...parsed,
    MODEL_BASE_URL: baseUrl,
    MODEL_NAME: modelName,
    MODEL_API_KEY: parsed.MODEL_API_KEY?.trim() || undefined,
    EXPORT_DIR: parsed.EXPORT_DIR?.trim() || "exports",
    // Ollama 等本地服务可以没有 API Key，因此只要求 BASE_URL + NAME
    modelConfigured: Boolean(baseUrl && modelName),
  };
}

let cached: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (!cached) cached = loadEnv();
  return cached;
}

/** 仅供测试使用 */
export function resetEnvCache() {
  cached = null;
}
