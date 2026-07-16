import {
  buildRepairPrompt,
  buildTranslateSystemPrompt,
  buildTranslateUserPrompt,
  buildUserPrompt,
  SYSTEM_PROMPT,
} from "./prompt";
import { parseAnalysisOutput, parseTranslationOutput } from "./schema";
import {
  ModelError,
  type ArticleAnalysisInput,
  type ArticleAnalysisOutput,
  type ModelProvider,
  type ProviderHealth,
  type TranslationInput,
  type TranslationOutput,
} from "./types";

export interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey?: string;
  modelName: string;
  timeoutMs: number;
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * OpenAI-compatible Chat Completions Provider。
 * 不包含任何厂商特判：OpenAI、Ollama、以及其他兼容网关均通过 baseUrl 接入。
 */
export class OpenAICompatibleProvider implements ModelProvider {
  readonly providerName = "openai-compatible";
  readonly modelName: string;

  constructor(private config: OpenAICompatibleConfig) {
    this.modelName = config.modelName;
  }

  private async complete(messages: ChatMessage[]): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (this.config.apiKey) headers.authorization = `Bearer ${this.config.apiKey}`;

      const res = await fetch(`${this.config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: this.config.modelName,
          messages,
          temperature: 0.2,
        }),
      });

      if (res.status === 429) {
        throw new ModelError("rate_limited", "模型接口限流（429）", false);
      }
      if (!res.ok) {
        // 不记录响应正文，避免泄露网关回显的请求内容
        throw new ModelError("http_error", `模型接口错误：HTTP ${res.status}`, res.status >= 500);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new ModelError("invalid_json", "模型未返回内容", false);
      return content;
    } catch (err) {
      if (err instanceof ModelError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new ModelError("timeout", `模型调用超时（${this.config.timeoutMs}ms）`, true);
      }
      throw new ModelError(
        "http_error",
        err instanceof Error ? err.message.slice(0, 200) : "模型调用失败",
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async analyzeArticle(input: ArticleAnalysisInput): Promise<ArticleAnalysisOutput> {
    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(input) },
    ];
    const raw = await this.complete(messages);
    try {
      return parseAnalysisOutput(raw, input.allowedTopics);
    } catch {
      // 非法 JSON：使用同模型执行一次 repair
      const repaired = await this.complete([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildRepairPrompt(raw) },
      ]);
      try {
        return parseAnalysisOutput(repaired, input.allowedTopics);
      } catch {
        throw new ModelError("invalid_json", "模型输出无法解析为合法 JSON（已尝试修复一次）", false);
      }
    }
  }

  async translateArticle(input: TranslationInput): Promise<TranslationOutput> {
    const system = buildTranslateSystemPrompt(input.targetLang);
    const user = buildTranslateUserPrompt(input.title, input.excerpt?.slice(0, 4000));
    const raw = await this.complete([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
    try {
      return parseTranslationOutput(raw);
    } catch {
      // 非法 JSON：同模型 repair 一次
      const repaired = await this.complete([
        { role: "system", content: system },
        { role: "user", content: buildRepairPrompt(raw) },
      ]);
      try {
        return parseTranslationOutput(repaired);
      } catch {
        throw new ModelError("invalid_json", "翻译输出无法解析为合法 JSON（已尝试修复一次）", false);
      }
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const raw = await this.complete([
        { role: "user", content: '请只输出 JSON：{"ok": true}' },
      ]);
      return { ok: raw.includes("ok"), message: "模型连接正常" };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof ModelError ? err.message : "模型连接失败",
      };
    }
  }
}
