import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { runVideoJobSync, type VideoTools } from "@/lib/video/service";
import { resetDb } from "../setup/db";

const TRANSCRIPT =
  "大家好，今天讲三个 RAG 的常见误区。第一，检索质量比模型规模更重要。第二，分块策略要匹配问题粒度。第三，评测集不能只用理想问题。";

function stubTools(overrides: Partial<VideoTools> = {}): VideoTools {
  return {
    fetchMeta: async () => ({
      title: "RAG 的三个常见误区",
      uploader: "测试UP主",
      webpageUrl: "https://www.bilibili.com/video/BVtest123",
      platform: "B站",
    }),
    downloadAudio: async (_url, outDir) => `${outDir}/audio.m4a`,
    toWav: async (_input, outDir) => `${outDir}/audio-16k.wav`,
    transcribe: async () => TRANSCRIPT,
    ...overrides,
  };
}

describe("视频 → 学习草稿流水线", () => {
  beforeEach(resetDb);

  it("链接模式：转写并生成带口播稿的学习草稿", async () => {
    const job = await runVideoJobSync({ url: "https://www.bilibili.com/video/BVtest123" }, stubTools());

    expect(job.status).toBe("done");
    expect(job.entryId).not.toBeNull();

    const entry = await prisma.learningEntry.findUniqueOrThrow({
      where: { id: job.entryId! },
      include: { article: { include: { source: true } } },
    });
    expect(entry.status).toBe("draft");
    expect(entry.userTakeaway).toBe(""); // 口播稿不会污染作者字段
    expect(entry.article.title).toBe("RAG 的三个常见误区");
    expect(entry.article.content).toBe(TRANSCRIPT);
    expect(entry.article.excerpt).toContain("【口播稿节选】");
    expect(entry.article.source.type).toBe("MANUAL");
    expect(entry.article.source.name).toBe("B站 · 测试UP主");
  });

  it("文件模式：需要原视频链接，成功后来源可追溯", async () => {
    const job = await runVideoJobSync(
      {
        filePath: "/tmp/fake-upload.mp4",
        originalUrl: "https://v.douyin.com/abc123/",
        title: "抖音视频：模型评测",
        sourceName: "抖音",
      },
      stubTools(),
    );

    expect(job.status).toBe("done");
    const entry = await prisma.learningEntry.findUniqueOrThrow({
      where: { id: job.entryId! },
      include: { article: true },
    });
    expect(entry.article.originalUrl).toBe("https://v.douyin.com/abc123/");
    expect(entry.article.title).toBe("抖音视频：模型评测");
  });

  it("转写为空时任务失败并给出可读原因", async () => {
    const job = await runVideoJobSync(
      { url: "https://www.bilibili.com/video/BVsilent" },
      stubTools({ transcribe: async () => "" }),
    );
    expect(job.status).toBe("failed");
    expect(job.message).toContain("转写结果为空");
  });

  it("抖音链接失败时提示文件模式兜底", async () => {
    const job = await runVideoJobSync(
      { url: "https://v.douyin.com/blocked/" },
      stubTools({
        fetchMeta: async () => {
          throw new Error("Unable to extract video data");
        },
      }),
    );
    expect(job.status).toBe("failed");
    expect(job.message).toContain("上传文件");
  });

  it("口播稿只存本地：导出的 showcase 不包含 content", async () => {
    const job = await runVideoJobSync({ url: "https://www.bilibili.com/video/BVtest123" }, stubTools());
    const entry = await prisma.learningEntry.findUniqueOrThrow({ where: { id: job.entryId! } });

    // 走完确认+发布后导出，验证口播稿不泄漏
    const topic = await prisma.topic.create({ data: { name: "Research", slug: "research" } });
    await prisma.learningEntryTopic.create({
      data: { learningEntryId: entry.id, topicId: topic.id },
    });
    await prisma.learningEntry.update({
      where: { id: entry.id },
      data: {
        userTakeaway: "检索质量优先于模型规模，这条要记住。",
        status: "published",
        confirmedAt: new Date(),
        publishedAt: new Date(),
      },
    });
    const { buildShowcasePayload } = await import("@/lib/export/showcase");
    const payload = JSON.stringify(await buildShowcasePayload());
    expect(payload).not.toContain("分块策略"); // 口播稿正文不出现
    expect(payload).toContain("检索质量优先于模型规模"); // 作者结论正常导出
  });
});
