export interface ArticleAnalysisInput {
  title: string;
  sourceName: string;
  publishedAt?: string;
  originalLanguage?: string;
  excerpt?: string;
  content?: string;
  configuredInterests: string[];
  allowedTopics: string[];
}

export interface ArticleAnalysisOutput {
  relevanceScore: number;
  category: string;
  topics: string[];
  summaryZh: string;
  whyItMatters: string;
  confidence: number;
  insufficientContent: boolean;
}

export interface ProviderHealth {
  ok: boolean;
  message?: string;
}

export type TargetLang = "zh" | "en";

export interface TranslationInput {
  title: string;
  excerpt?: string;
  targetLang: TargetLang;
}

export interface TranslationOutput {
  title: string;
  excerpt: string;
}

export interface ModelProvider {
  /** 用于 AIAnalysis.provider 字段，如 "openai-compatible" / "mock" */
  readonly providerName: string;
  readonly modelName: string;
  analyzeArticle(input: ArticleAnalysisInput): Promise<ArticleAnalysisOutput>;
  translateArticle(input: TranslationInput): Promise<TranslationOutput>;
  healthCheck(): Promise<ProviderHealth>;
}

export type ModelErrorCode =
  | "timeout"
  | "rate_limited"
  | "http_error"
  | "invalid_json"
  | "not_configured";

export class ModelError extends Error {
  constructor(
    public code: ModelErrorCode,
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}
