import { afterEach, describe, expect, it, vi } from "vitest";
import { MockProvider } from "@/lib/ai/mockProvider";
import { OpenAICompatibleProvider } from "@/lib/ai/openaiCompatible";
import { parseTranslationOutput } from "@/lib/ai/schema";

describe("parseTranslationOutput", () => {
  it("解析合法 JSON（含代码块包裹）", () => {
    expect(parseTranslationOutput('{"title":"标题","excerpt":"摘要"}')).toEqual({
      title: "标题",
      excerpt: "摘要",
    });
    expect(parseTranslationOutput('```json\n{"title":"t","excerpt":""}\n```').title).toBe("t");
  });

  it("缺字段或非法 JSON 抛出异常", () => {
    expect(() => parseTranslationOutput('{"title":""}')).toThrow();
    expect(() => parseTranslationOutput("不是 JSON")).toThrow();
  });
});

describe("MockProvider.translateArticle", () => {
  it("按目标语言返回确定性译文", async () => {
    const provider = new MockProvider();
    const zh = await provider.translateArticle({ title: "Hello", excerpt: "World", targetLang: "zh" });
    expect(zh.title).toBe("【中文译文】Hello");
    expect(zh.excerpt).toBe("【中文译文】World");
    const en = await provider.translateArticle({ title: "你好", targetLang: "en" });
    expect(en.title).toBe("[EN] 你好");
    expect(en.excerpt).toBe("");
  });
});

describe("OpenAICompatibleProvider.translateArticle repair 分支", () => {
  afterEach(() => vi.unstubAllGlobals());

  const provider = new OpenAICompatibleProvider({
    baseUrl: "https://model.example.com/v1",
    apiKey: "test-key",
    modelName: "test-model",
    timeoutMs: 5000,
  });

  const chatResponse = (content: string) =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

  it("首次非法 JSON 时 repair 一次成功", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(chatResponse("not json"))
      .mockResolvedValueOnce(chatResponse('{"title":"译文标题","excerpt":"译文摘要"}'));
    vi.stubGlobal("fetch", fetchMock);

    const out = await provider.translateArticle({ title: "t", excerpt: "e", targetLang: "zh" });
    expect(out.title).toBe("译文标题");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("repair 仍失败抛出 invalid_json", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(chatResponse("bad"))
      .mockResolvedValueOnce(chatResponse("still bad"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      provider.translateArticle({ title: "t", targetLang: "en" }),
    ).rejects.toMatchObject({ code: "invalid_json" });
  });
});
