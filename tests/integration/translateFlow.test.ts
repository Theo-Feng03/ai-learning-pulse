import { beforeEach, describe, expect, it } from "vitest";
import { MockProvider } from "@/lib/ai/mockProvider";
import { translateArticle } from "@/lib/ai/translateArticle";
import { prisma } from "@/lib/db/client";
import { resetDb } from "../setup/db";
import { createTestSource } from "./helpers";

async function createArticle(language = "en") {
  const source = await createTestSource({
    name: "Fixture Blog",
    url: "https://fixture.example.com/feed",
  });
  return prisma.article.create({
    data: {
      sourceId: source.id,
      canonicalUrl: "https://fixture.example.com/posts/translate-me",
      originalUrl: "https://fixture.example.com/posts/translate-me",
      title: "An article about AI evaluation",
      normalizedTitle: "an article about ai evaluation",
      excerpt: "Original English excerpt.",
      contentHash: "hash-v1",
      language,
      status: "normalized",
    },
  });
}

describe("文章翻译（缓存与降级）", () => {
  beforeEach(resetDb);

  it("翻译成功并写入缓存；重复调用不再消耗模型", async () => {
    const article = await createArticle();
    const provider = new MockProvider();

    const first = await translateArticle(article.id, undefined, provider);
    expect(first.targetLang).toBe("zh"); // 英文原文默认译中
    expect(first.title).toBe("【中文译文】An article about AI evaluation");
    expect(first.cached).toBe(false);
    expect(provider.calls).toBe(1);

    const second = await translateArticle(article.id, "zh", provider);
    expect(second.cached).toBe(true);
    expect(provider.calls).toBe(1); // 命中缓存，没有新调用
  });

  it("原文变化后缓存失效并重新翻译", async () => {
    const article = await createArticle();
    const provider = new MockProvider();
    await translateArticle(article.id, "zh", provider);

    await prisma.article.update({
      where: { id: article.id },
      data: { contentHash: "hash-v2", title: "Updated title" },
    });
    const result = await translateArticle(article.id, "zh", provider);
    expect(result.cached).toBe(false);
    expect(result.title).toBe("【中文译文】Updated title");
    expect(provider.calls).toBe(2);
  });

  it("中文原文默认译为英文", async () => {
    const source = await createTestSource({ name: "中文信源", url: "https://zh.example.com/feed" });
    const article = await prisma.article.create({
      data: {
        sourceId: source.id,
        canonicalUrl: "https://zh.example.com/posts/1",
        originalUrl: "https://zh.example.com/posts/1",
        title: "一篇关于模型评测的文章",
        normalizedTitle: "一篇关于模型评测的文章",
        contentHash: "hash-zh",
        language: "zh",
        status: "normalized",
      },
    });
    const result = await translateArticle(article.id, undefined, new MockProvider());
    expect(result.targetLang).toBe("en");
    expect(result.title).toBe("[EN] 一篇关于模型评测的文章");
  });

  it("no_ai 模式返回 model_not_configured", async () => {
    const article = await createArticle();
    await expect(translateArticle(article.id, "zh", null)).rejects.toMatchObject({
      code: "model_not_configured",
    });
  });

  it("翻译不影响导出：ArticleTranslation 不出现在 showcase 中", async () => {
    const article = await createArticle();
    await translateArticle(article.id, "zh", new MockProvider());
    const { buildShowcasePayload } = await import("@/lib/export/showcase");
    const payload = await buildShowcasePayload();
    expect(JSON.stringify(payload)).not.toContain("【中文译文】");
  });
});
