import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleProvider } from "@/lib/ai/openaiCompatible";
import { parseAnalysisOutput } from "@/lib/ai/schema";
import { ModelError } from "@/lib/ai/types";
import { ALLOWED_TOPICS } from "@/types/domain";

const allowed = [...ALLOWED_TOPICS];

const validPayload = {
  relevanceScore: 80,
  category: "Product",
  topics: ["AI Search"],
  summaryZh: "测试摘要",
  whyItMatters: "可能值得关注",
  confidence: 0.9,
  insufficientContent: false,
};

describe("parseAnalysisOutput", () => {
  it("解析合法 JSON", () => {
    const out = parseAnalysisOutput(JSON.stringify(validPayload), allowed);
    expect(out.relevanceScore).toBe(80);
    expect(out.topics).toEqual(["AI Search"]);
  });

  it("容忍 ```json 代码块包裹", () => {
    const out = parseAnalysisOutput("```json\n" + JSON.stringify(validPayload) + "\n```", allowed);
    expect(out.summaryZh).toBe("测试摘要");
  });

  it("不在 allowedTopics 中的主题归入 Other", () => {
    const out = parseAnalysisOutput(
      JSON.stringify({ ...validPayload, topics: ["Made Up Topic", "AI Search"] }),
      allowed,
    );
    expect(out.topics).toEqual(["Other", "AI Search"]);
  });

  it("分数越界抛出异常", () => {
    expect(() =>
      parseAnalysisOutput(JSON.stringify({ ...validPayload, relevanceScore: 120 }), allowed),
    ).toThrow();
  });

  it("非法 JSON 抛出异常", () => {
    expect(() => parseAnalysisOutput("这不是 JSON", allowed)).toThrow();
  });
});

describe("OpenAICompatibleProvider repair 分支", () => {
  afterEach(() => vi.unstubAllGlobals());

  const provider = new OpenAICompatibleProvider({
    baseUrl: "https://model.example.com/v1",
    apiKey: "test-key",
    modelName: "test-model",
    timeoutMs: 5000,
  });

  const input = {
    title: "t",
    sourceName: "s",
    configuredInterests: [],
    allowedTopics: allowed,
  };

  const chatResponse = (content: string) =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

  it("首次非法 JSON 时执行一次 repair 并成功", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(chatResponse("oops not json"))
      .mockResolvedValueOnce(chatResponse(JSON.stringify(validPayload)));
    vi.stubGlobal("fetch", fetchMock);

    const out = await provider.analyzeArticle(input);
    expect(out.relevanceScore).toBe(80);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("repair 后仍非法则抛出 invalid_json", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(chatResponse("bad"))
      .mockResolvedValueOnce(chatResponse("still bad"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(provider.analyzeArticle(input)).rejects.toMatchObject({ code: "invalid_json" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("429 映射为 rate_limited", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 429 })));
    await expect(provider.analyzeArticle(input)).rejects.toMatchObject({
      code: "rate_limited",
    });
  });

  it("5xx 标记为可重试", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 500 })));
    const err = await provider.analyzeArticle(input).catch((e) => e);
    expect(err).toBeInstanceOf(ModelError);
    expect(err.retryable).toBe(true);
  });
});
