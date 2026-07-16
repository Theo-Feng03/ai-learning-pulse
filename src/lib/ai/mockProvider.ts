import { parseAnalysisOutput } from "./schema";
import {
  ModelError,
  type ArticleAnalysisInput,
  type ArticleAnalysisOutput,
  type ModelProvider,
  type ProviderHealth,
  type TranslationInput,
  type TranslationOutput,
} from "./types";

export type MockBehavior =
  | { kind: "valid"; output?: Partial<ArticleAnalysisOutput> }
  | { kind: "invalid_json_then_valid" }
  | { kind: "always_invalid_json" }
  | { kind: "rate_limited" }
  | { kind: "timeout" };

/**
 * 测试与演示用 Mock Provider：不访问网络。
 * 通过 behaviors 队列控制每次调用的行为，队列空时返回确定性合法输出。
 */
export class MockProvider implements ModelProvider {
  readonly providerName = "mock";
  readonly modelName = "mock-model";
  calls = 0;
  private repairAttempted = false;

  constructor(private behaviors: MockBehavior[] = []) {}

  private defaultOutput(input: ArticleAnalysisInput): ArticleAnalysisOutput {
    const insufficient = !input.content && !input.excerpt;
    const isChinese = /[一-鿿]/.test(input.title);
    const raw = JSON.stringify({
      relevanceScore: /\bai|model|llm|agent\b/i.test(input.title) ? 80 : 35,
      ...(isChinese ? {} : { titleZh: `【中文标题】${input.title.slice(0, 60)}` }),
      category: "Product",
      topics: [input.allowedTopics[0] ?? "Other"],
      summaryZh: `【mock】${input.title.slice(0, 80)} 的确定性摘要。`,
      whyItMatters: "该内容可能与配置的关注方向相关，值得快速浏览。",
      confidence: insufficient ? 0.3 : 0.8,
      insufficientContent: insufficient,
    });
    return parseAnalysisOutput(raw, input.allowedTopics);
  }

  async analyzeArticle(input: ArticleAnalysisInput): Promise<ArticleAnalysisOutput> {
    this.calls++;
    const behavior = this.behaviors.shift();
    if (!behavior || behavior.kind === "valid") {
      const base = this.defaultOutput(input);
      return behavior?.kind === "valid" ? { ...base, ...behavior.output } : base;
    }
    switch (behavior.kind) {
      case "invalid_json_then_valid":
        if (!this.repairAttempted) {
          this.repairAttempted = true;
          // 模拟 provider 内部 repair 成功：直接返回合法结果，但记一次额外调用
          this.calls++;
          return this.defaultOutput(input);
        }
        return this.defaultOutput(input);
      case "always_invalid_json":
        throw new ModelError("invalid_json", "模型输出无法解析为合法 JSON（已尝试修复一次）", false);
      case "rate_limited":
        throw new ModelError("rate_limited", "模型接口限流（429）", false);
      case "timeout":
        throw new ModelError("timeout", "模型调用超时", true);
    }
  }

  async translateArticle(input: TranslationInput): Promise<TranslationOutput> {
    this.calls++;
    const behavior = this.behaviors.shift();
    if (behavior && behavior.kind !== "valid") {
      throw new ModelError("invalid_json", "翻译输出无法解析为合法 JSON（已尝试修复一次）", false);
    }
    const prefix = input.targetLang === "zh" ? "【中文译文】" : "[EN] ";
    return {
      title: `${prefix}${input.title}`,
      excerpt: input.excerpt ? `${prefix}${input.excerpt}` : "",
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    return { ok: true, message: "mock provider" };
  }
}
