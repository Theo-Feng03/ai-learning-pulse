import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { applySnapshot, buildSnapshot, syncSnapshotSchema } from "@/lib/sync/snapshot";
import { resetDb } from "../setup/db";
import { createTestSource, createTestTopic } from "./helpers";

const DAY = 24 * 60 * 60 * 1000;

async function seedLocal() {
  const source = await createTestSource({
    name: "Shared Blog",
    url: "https://shared.example.com/feed",
  });
  const article = await prisma.article.create({
    data: {
      sourceId: source.id,
      canonicalUrl: "https://shared.example.com/posts/a",
      originalUrl: "https://shared.example.com/posts/a",
      title: "Shared article",
      normalizedTitle: "shared article",
      contentHash: "hash-a",
      status: "normalized",
      publishedAt: new Date(),
    },
  });
  return { source, article };
}

describe("双机同步：快照与合并", () => {
  beforeEach(resetDb);

  it("快照往返：导出 → 清库 → 合并回来，数据按自然键完整恢复", async () => {
    const { article } = await seedLocal();
    const topic = await createTestTopic("AI Search");
    const entry = await prisma.learningEntry.create({
      data: {
        articleId: article.id,
        status: "published",
        userTakeaway: "一条超过十个字符的学习结论。",
        confirmedAt: new Date(),
        publishedAt: new Date(),
      },
    });
    await prisma.learningEntryTopic.create({
      data: { learningEntryId: entry.id, topicId: topic.id },
    });
    await prisma.projectLink.create({
      data: {
        learningEntryId: entry.id,
        projectName: "项目",
        projectUrl: "https://example.com/p",
        isPublic: true,
      },
    });

    const snapshot = syncSnapshotSchema.parse(
      JSON.parse(JSON.stringify(await buildSnapshot("mac-a"))),
    );
    await resetDb();
    const stats = await applySnapshot(snapshot);

    expect(stats.created).toBeGreaterThan(0);
    const restored = await prisma.learningEntry.findFirst({
      include: {
        article: { include: { source: true } },
        topics: { include: { topic: true } },
        projectLinks: true,
      },
    });
    expect(restored!.status).toBe("published");
    expect(restored!.userTakeaway).toBe("一条超过十个字符的学习结论。");
    expect(restored!.article.canonicalUrl).toBe("https://shared.example.com/posts/a");
    expect(restored!.article.source.normalizedUrl).toContain("shared.example.com");
    expect(restored!.topics[0].topic.slug).toBe("ai-search");
    expect(restored!.projectLinks).toHaveLength(1);
  });

  it("两台机器各自采集同一篇文章（不同本地 id）：合并后仍只有一条", async () => {
    // 机器 B 的快照（id 与本机无关，靠 canonicalUrl 对齐）
    await seedLocal();
    const remote = await buildSnapshot("mac-b");

    // 本机（机器 A）重置后重新入库同一篇文章 → 不同 cuid
    await resetDb();
    await seedLocal();

    const stats = await applySnapshot(remote);
    expect(await prisma.article.count()).toBe(1);
    expect(await prisma.source.count()).toBe(1);
    expect(stats.created).toBe(0);
  });

  it("LWW：远端较新的学习记录覆盖本地并带上子表；本地较新时保持不变", async () => {
    const { article } = await seedLocal();
    await createTestTopic("AI Search");
    await createTestTopic("Research");
    const now = Date.now();

    await prisma.learningEntry.create({
      data: {
        articleId: article.id,
        status: "draft",
        userTakeaway: "本地旧版本结论",
        updatedAt: new Date(now - 2 * DAY),
      },
    });

    const remote = await buildSnapshot("mac-b");
    // 模拟远端更新：更晚的 updatedAt、confirmed、不同主题
    remote.entries[0] = {
      ...remote.entries[0],
      status: "confirmed",
      userTakeaway: "远端更新过的学习结论内容。",
      confirmedAt: new Date(now - DAY).toISOString(),
      updatedAt: new Date(now - DAY).toISOString(),
      topicSlugs: ["research"],
    };

    let stats = await applySnapshot(remote);
    expect(stats.updated).toBeGreaterThan(0);
    let entry = await prisma.learningEntry.findFirstOrThrow({
      include: { topics: { include: { topic: true } } },
    });
    expect(entry.status).toBe("confirmed");
    expect(entry.userTakeaway).toBe("远端更新过的学习结论内容。");
    expect(entry.topics.map((t) => t.topic.slug)).toEqual(["research"]);

    // 本地随后又更新（更晚）→ 旧的远端快照不再覆盖
    await prisma.learningEntry.update({
      where: { id: entry.id },
      data: { userTakeaway: "本地最新的结论，超过十个字符。", updatedAt: new Date(now) },
    });
    stats = await applySnapshot(remote);
    entry = await prisma.learningEntry.findFirstOrThrow({
      include: { topics: { include: { topic: true } } },
    });
    expect(entry.userTakeaway).toBe("本地最新的结论，超过十个字符。");
  });

  it("合并只补不删：本地独有的文章在合并后仍然存在", async () => {
    await seedLocal();
    const remote = await buildSnapshot("mac-b");

    const extraSource = await createTestSource({
      name: "Local Only Blog",
      url: "https://local-only.example.com/feed",
    });
    await prisma.article.create({
      data: {
        sourceId: extraSource.id,
        canonicalUrl: "https://local-only.example.com/posts/1",
        originalUrl: "https://local-only.example.com/posts/1",
        title: "Local only article",
        normalizedTitle: "local only article",
        contentHash: "hash-local",
        status: "normalized",
      },
    });

    await applySnapshot(remote);
    expect(await prisma.article.count()).toBe(2);
  });

  it("快照 schema 拒绝版本不符或缺字段的数据", () => {
    expect(() =>
      syncSnapshotSchema.parse({ syncSchemaVersion: 99, exportedAt: "", hostname: "x" }),
    ).toThrow();
  });
});
