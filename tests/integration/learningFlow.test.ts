import { beforeEach, describe, expect, it } from "vitest";
import { computePublishedStats } from "@/lib/analytics/stats";
import { ApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/client";
import {
  archiveEntry,
  confirmEntry,
  createDraftForArticle,
  publishEntry,
  restoreEntry,
  unpublishEntry,
  updateEntry,
} from "@/lib/learning/service";
import { resetDb } from "../setup/db";
import { createTestSource, createTestTopic } from "./helpers";

async function createArticleFixture() {
  const source = await createTestSource({
    name: "Fixture Blog",
    url: "https://fixture.example.com/feed",
    publicName: "Fixture Blog",
  });
  return prisma.article.create({
    data: {
      sourceId: source.id,
      canonicalUrl: "https://fixture.example.com/posts/a",
      originalUrl: "https://fixture.example.com/posts/a",
      title: "Fixture article",
      normalizedTitle: "fixture article",
      contentHash: "hash-a",
      status: "normalized",
      publishedAt: new Date(),
    },
  });
}

describe("学习记录状态流", () => {
  beforeEach(resetDb);

  it("重复创建草稿返回同一条记录；userTakeaway 初始为空", async () => {
    const article = await createArticleFixture();
    const first = await createDraftForArticle(article.id);
    const second = await createDraftForArticle(article.id);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.entry.id).toBe(first.entry.id);
    expect(first.entry.userTakeaway).toBe("");
    expect(first.entry.status).toBe("draft");
    expect(await prisma.learningEntry.count()).toBe(1);

    const updatedArticle = await prisma.article.findUniqueOrThrow({ where: { id: article.id } });
    expect(updatedArticle.status).toBe("saved");
  });

  it("确认校验：结论太短或未选主题时 validation_error", async () => {
    const article = await createArticleFixture();
    const { entry } = await createDraftForArticle(article.id);

    // 全空
    await expect(confirmEntry(entry.id)).rejects.toMatchObject({ code: "validation_error" });

    // 结论够长但没有主题
    await updateEntry(entry.id, { userTakeaway: "这是一条足够长的学习结论内容。" });
    await expect(confirmEntry(entry.id)).rejects.toMatchObject({ code: "validation_error" });

    // 满足条件后确认成功
    const topic = await createTestTopic("AI Search");
    await updateEntry(entry.id, { topicIds: [topic.id] });
    const confirmed = await confirmEntry(entry.id);
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.confirmedAt).not.toBeNull();
  });

  it("draft 直接发布返回 invalid_state；confirmed 发布成功", async () => {
    const article = await createArticleFixture();
    const { entry } = await createDraftForArticle(article.id);

    const err = await publishEntry(entry.id).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("invalid_state");

    const topic = await createTestTopic("AI Search");
    await updateEntry(entry.id, {
      userTakeaway: "这是一条足够长的学习结论内容。",
      topicIds: [topic.id],
    });
    await confirmEntry(entry.id);
    const published = await publishEntry(entry.id);
    expect(published.status).toBe("published");
    expect(published.publishedAt).not.toBeNull();
  });

  it("发布计入统计，撤回后统计减少（published-only 口径）", async () => {
    const article = await createArticleFixture();
    const { entry } = await createDraftForArticle(article.id);
    const topic = await createTestTopic("AI Search");
    await updateEntry(entry.id, {
      userTakeaway: "这是一条足够长的学习结论内容。",
      topicIds: [topic.id],
      projectLinks: [
        {
          projectName: "示例项目",
          projectUrl: "https://example.com/project",
          isPublic: true,
        },
      ],
    });
    await confirmEntry(entry.id);

    // draft/confirmed 不计入
    let stats = await computePublishedStats();
    expect(stats.records90d).toBe(0);
    expect(stats.topicCount90d).toBe(0);

    await publishEntry(entry.id);
    stats = await computePublishedStats();
    expect(stats.records90d).toBe(1);
    expect(stats.activeWeeks12).toBe(1);
    expect(stats.topicCount90d).toBe(1);
    expect(stats.linkedPracticeCount).toBe(1);
    const today = new Date().toISOString().slice(0, 10);
    expect(stats.heatmap.find((d) => d.date === today)?.count).toBe(1);
    expect(stats.topTopics).toEqual([{ name: "AI Search", count: 1 }]);

    await unpublishEntry(entry.id);
    stats = await computePublishedStats();
    expect(stats.records90d).toBe(0);
    expect(stats.heatmap.find((d) => d.date === today)?.count).toBe(0);
  });

  it("修改已发布记录的核心作者字段后状态回到 draft", async () => {
    const article = await createArticleFixture();
    const { entry } = await createDraftForArticle(article.id);
    const topic = await createTestTopic("AI Search");
    await updateEntry(entry.id, {
      userTakeaway: "这是一条足够长的学习结论内容。",
      topicIds: [topic.id],
    });
    await confirmEntry(entry.id);
    await publishEntry(entry.id);

    // 修改非核心字段（whyFollow）不降级
    let result = await updateEntry(entry.id, { whyFollow: "补充关注理由" });
    expect(result.revertedToDraft).toBe(false);
    expect(result.entry.status).toBe("published");

    // 修改 userTakeaway 回到 draft，退出发布
    result = await updateEntry(entry.id, { userTakeaway: "修改后的学习结论，需要重新确认。" });
    expect(result.revertedToDraft).toBe(true);
    expect(result.entry.status).toBe("draft");
    expect(result.entry.publishedAt).toBeNull();
    expect(result.entry.confirmedAt).toBeNull();

    const stats = await computePublishedStats();
    expect(stats.records90d).toBe(0);
  });

  it("归档退出统计；恢复回到 confirmed", async () => {
    const article = await createArticleFixture();
    const { entry } = await createDraftForArticle(article.id);
    const topic = await createTestTopic("AI Search");
    await updateEntry(entry.id, {
      userTakeaway: "这是一条足够长的学习结论内容。",
      topicIds: [topic.id],
    });
    await confirmEntry(entry.id);
    await publishEntry(entry.id);

    await archiveEntry(entry.id);
    const stats = await computePublishedStats();
    expect(stats.records90d).toBe(0);

    const restored = await restoreEntry(entry.id);
    expect(restored.status).toBe("confirmed");
  });
});
