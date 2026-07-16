import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { exportShowcase } from "@/lib/export/showcase";
import { createManualEntry } from "@/lib/learning/manual";
import { confirmEntry, publishEntry, updateEntry } from "@/lib/learning/service";
import { createRun, runIngestion } from "@/lib/ingestion/run";
import { resetDb } from "../setup/db";
import { createTestTopic, fixtureFetchContext, fixtureXml, createTestSource } from "./helpers";
import { readFileSync } from "node:fs";

describe("手动学习记录", () => {
  beforeEach(resetDb);

  it("任意 URL 创建草稿：生成 MANUAL 信源与文章，来源可追溯", async () => {
    const { entry, created } = await createManualEntry({
      title: "某个抖音视频：RAG 的三个常见误区",
      url: "https://www.douyin.com/video/12345?utm_source=share",
      sourceName: "抖音",
    });

    expect(created).toBe(true);
    expect(entry.status).toBe("draft");
    expect(entry.userTakeaway).toBe("");
    expect(entry.article.source.type).toBe("MANUAL");
    expect(entry.article.source.name).toBe("抖音");
    expect(entry.article.source.enabled).toBe(false);
    // utm 参数被规范化移除
    expect(entry.article.canonicalUrl).toBe("https://www.douyin.com/video/12345");
    expect(entry.article.aiStatus).toBe("skipped");
  });

  it("来源名称留空时使用域名；相同 URL 幂等返回同一草稿", async () => {
    const first = await createManualEntry({
      title: "一篇公众号文章",
      url: "https://mp.weixin.qq.com/s/abcdef",
    });
    expect(first.entry.article.source.name).toBe("mp.weixin.qq.com");

    const second = await createManualEntry({
      title: "换个标题也一样",
      url: "https://mp.weixin.qq.com/s/abcdef",
    });
    expect(second.created).toBe(false);
    expect(second.entry.id).toBe(first.entry.id);
    expect(await prisma.learningEntry.count()).toBe(1);
  });

  it("非法 URL 返回 validation_error", async () => {
    await expect(
      createManualEntry({ title: "t", url: "不是链接" }),
    ).rejects.toMatchObject({ code: "validation_error" });
    await expect(
      createManualEntry({ title: "t", url: "ftp://example.com/x" }),
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("手动记录走完整闭环：确认、发布、进入导出且来源名正确", async () => {
    const topic = await createTestTopic("AI Product");
    const { entry } = await createManualEntry({
      title: "视频：如何评估 AI 产品",
      url: "https://example.com/video/1",
      sourceName: "某学习频道",
    });
    await updateEntry(entry.id, {
      userTakeaway: "评估 AI 产品要先看真实任务的完成率。",
      topicIds: [topic.id],
    });
    await confirmEntry(entry.id);
    await publishEntry(entry.id);

    const result = await exportShowcase();
    const raw = readFileSync(result.path, "utf8");
    const payload = JSON.parse(raw);
    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].sourceName).toBe("某学习频道");
    expect(payload.entries[0].sourceUrl).toBe("https://example.com/video/1");
    // 虚拟信源的内部 URL 不泄漏
    expect(raw).not.toContain("manual://");
  });

  it("MANUAL 信源不参与采集", async () => {
    await createManualEntry({ title: "手动条目", url: "https://example.com/manual" });
    await createTestSource({ name: "Fixture Blog", url: "https://fixture.example.com/feed" });
    const ctx = fixtureFetchContext({
      "https://fixture.example.com/feed": fixtureXml("sample-feed.xml"),
    });

    const run = await createRun("cli");
    const finished = await runIngestion(run.id, { fetchContext: ctx, provider: null });

    expect(finished.status).toBe("completed"); // MANUAL 信源没有被当成失败信源
    expect(finished.sourceTotal).toBe(1);
    expect(await prisma.runError.count()).toBe(0);
  });
});
