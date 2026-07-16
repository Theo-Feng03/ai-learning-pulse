import { beforeEach, describe, expect, it } from "vitest";
import { MockProvider } from "@/lib/ai/mockProvider";
import { prisma } from "@/lib/db/client";
import { createRun, runIngestion } from "@/lib/ingestion/run";
import { resetDb } from "../setup/db";
import { createTestSource, fixtureFetchContext, fixtureXml } from "./helpers";

describe("确定性采集管道", () => {
  beforeEach(resetDb);

  it("RSS fixture → 入库 → AI mock → Article + AIAnalysis", async () => {
    await createTestSource({ name: "Fixture Blog", url: "https://fixture.example.com/feed" });
    const ctx = fixtureFetchContext({
      "https://fixture.example.com/feed": fixtureXml("sample-feed.xml"),
    });

    const run = await createRun("cli");
    const finished = await runIngestion(run.id, { fetchContext: ctx, provider: new MockProvider() });

    expect(finished.status).toBe("completed");
    expect(finished.sourceSuccess).toBe(1);
    expect(finished.fetchedCount).toBe(2);
    expect(finished.newCount).toBe(2);
    expect(finished.aiSuccess).toBe(2);

    const articles = await prisma.article.findMany({ include: { analysis: true } });
    expect(articles).toHaveLength(2);
    for (const article of articles) {
      expect(article.status).toBe("analyzed");
      expect(article.analysis).not.toBeNull();
      expect(article.analysis!.provider).toBe("mock");
    }
    // utm 参数已从 canonicalUrl 移除
    const modelPost = articles.find((a) => a.originalUrl.includes("utm_source"));
    expect(modelPost!.canonicalUrl).toBe("https://fixture.example.com/posts/new-ai-model");
  });

  it("同一 feed 重复运行不增加 Article（canonical URL 幂等）", async () => {
    await createTestSource({ name: "Fixture Blog", url: "https://fixture.example.com/feed" });
    const ctx = fixtureFetchContext({
      "https://fixture.example.com/feed": fixtureXml("sample-feed.xml"),
    });

    const run1 = await createRun("cli");
    await runIngestion(run1.id, { fetchContext: ctx, provider: null });
    const run2 = await createRun("cli");
    const finished2 = await runIngestion(run2.id, { fetchContext: ctx, provider: null });

    expect(await prisma.article.count()).toBe(2);
    expect(finished2.newCount).toBe(0);
    expect(finished2.dedupCount).toBe(2);
  });

  it("相似标题的两条不同来源文章绑定同一 StoryGroup 且都保留", async () => {
    await createTestSource({ name: "Fixture Blog", url: "https://fixture.example.com/feed" });
    await createTestSource({ name: "Mirror Blog", url: "https://mirror.example.com/feed" });
    const ctx = fixtureFetchContext({
      "https://fixture.example.com/feed": fixtureXml("sample-feed.xml"),
      "https://mirror.example.com/feed": fixtureXml("similar-title-feed.xml"),
    });

    const run = await createRun("cli");
    await runIngestion(run.id, { fetchContext: ctx, provider: null });

    const articles = await prisma.article.findMany();
    expect(articles).toHaveLength(3);

    const grouped = articles.filter((a) => a.storyGroupId !== null);
    expect(grouped).toHaveLength(2);
    expect(new Set(grouped.map((a) => a.storyGroupId)).size).toBe(1);
    expect(new Set(grouped.map((a) => a.sourceId)).size).toBe(2);
  });

  it("no_ai 模式：文章正常入库并标记 not_configured", async () => {
    await createTestSource({ name: "Fixture Blog", url: "https://fixture.example.com/feed" });
    const ctx = fixtureFetchContext({
      "https://fixture.example.com/feed": fixtureXml("sample-feed.xml"),
    });

    const run = await createRun("manual");
    const finished = await runIngestion(run.id, { fetchContext: ctx, provider: null });

    expect(finished.status).toBe("completed");
    expect(finished.aiSkipped).toBe(2);
    const articles = await prisma.article.findMany();
    expect(articles.every((a) => a.aiStatus === "not_configured")).toBe(true);
    expect(articles.every((a) => a.status === "normalized")).toBe(true);
  });

  it("GitHub Release feed 正常入库", async () => {
    await createTestSource({
      name: "fixture/repo Releases",
      type: "GITHUB_RELEASE",
      url: "fixture/repo",
    });
    const ctx = fixtureFetchContext({
      "https://github.com/fixture/repo/releases.atom": fixtureXml("github-releases.atom"),
    });

    const run = await createRun("cli");
    const finished = await runIngestion(run.id, { fetchContext: ctx, provider: null });
    expect(finished.status).toBe("completed");
    expect(finished.newCount).toBe(2);
    const article = await prisma.article.findFirst({ orderBy: { publishedAt: "desc" } });
    expect(article!.title).toBe("fixture/repo: v1.2.0");
  });

  it("同一 runId 重复执行被拒绝（幂等）", async () => {
    await createTestSource({ name: "Fixture Blog", url: "https://fixture.example.com/feed" });
    const ctx = fixtureFetchContext({
      "https://fixture.example.com/feed": fixtureXml("sample-feed.xml"),
    });
    const run = await createRun("cli");
    await runIngestion(run.id, { fetchContext: ctx, provider: null });
    const again = await runIngestion(run.id, { fetchContext: ctx, provider: null });
    // 第二次直接返回已有结果，不重新执行
    expect(again.status).toBe("completed");
    expect(await prisma.article.count()).toBe(2);
    expect(await prisma.ingestionRun.count()).toBe(1);
  });

  it("模型 mock 返回非法 JSON 且修复失败时 Article 标记 analyze_failed", async () => {
    await createTestSource({ name: "Fixture Blog", url: "https://fixture.example.com/feed" });
    const ctx = fixtureFetchContext({
      "https://fixture.example.com/feed": fixtureXml("sample-feed.xml"),
    });
    const provider = new MockProvider([
      { kind: "always_invalid_json" },
      { kind: "always_invalid_json" },
    ]);

    const run = await createRun("cli");
    const finished = await runIngestion(run.id, { fetchContext: ctx, provider });

    expect(finished.aiFailed).toBe(2);
    expect(finished.status).toBe("partial_failed");
    const failed = await prisma.article.findMany({ where: { status: "analyze_failed" } });
    expect(failed).toHaveLength(2);
    const errors = await prisma.runError.findMany({ where: { stage: "analyze" } });
    expect(errors.length).toBe(2);
    expect(errors[0].code).toBe("invalid_json");
  });

  it("429 后停止新增 AI 调用，剩余标记 rate_limited", async () => {
    await createTestSource({ name: "Fixture Blog", url: "https://fixture.example.com/feed" });
    const ctx = fixtureFetchContext({
      "https://fixture.example.com/feed": fixtureXml("sample-feed.xml"),
    });
    const provider = new MockProvider([{ kind: "rate_limited" }, { kind: "rate_limited" }]);

    const run = await createRun("cli");
    const finished = await runIngestion(run.id, { fetchContext: ctx, provider });

    expect(finished.aiFailed).toBe(0);
    const rateLimited = await prisma.article.findMany({ where: { aiStatus: "rate_limited" } });
    expect(rateLimited.length).toBeGreaterThanOrEqual(1);
  });
});
