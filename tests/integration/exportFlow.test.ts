import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { showcaseSchema } from "@/lib/export/schema";
import { exportShowcase, showcaseFilePath } from "@/lib/export/showcase";
import {
  confirmEntry,
  createDraftForArticle,
  publishEntry,
  updateEntry,
} from "@/lib/learning/service";
import { resetDb } from "../setup/db";
import { createTestSource, createTestTopic } from "./helpers";

const SECRET_CONTENT = "这是文章完整正文，包含 secret-full-body 标记，不得导出。";

async function setupPublishedAndDraft() {
  const source = await createTestSource({
    name: "内部信源名",
    url: "https://private-feed.example.com/feed.xml",
    publicName: "公开信源名",
  });
  const published = await prisma.article.create({
    data: {
      sourceId: source.id,
      canonicalUrl: "https://fixture.example.com/posts/published",
      originalUrl: "https://fixture.example.com/posts/published",
      title: "已发布文章",
      normalizedTitle: "已发布文章",
      contentHash: "hash-pub",
      content: SECRET_CONTENT,
      status: "saved",
      publishedAt: new Date(),
    },
  });
  const draftArticle = await prisma.article.create({
    data: {
      sourceId: source.id,
      canonicalUrl: "https://fixture.example.com/posts/draft",
      originalUrl: "https://fixture.example.com/posts/draft",
      title: "草稿文章",
      normalizedTitle: "草稿文章",
      contentHash: "hash-draft",
      status: "saved",
      publishedAt: new Date(),
    },
  });

  const topic = await createTestTopic("AI Search");
  const { entry } = await createDraftForArticle(published.id);
  await updateEntry(entry.id, {
    userTakeaway: "已发布记录的学习结论，超过十个字符。",
    topicIds: [topic.id],
    projectLinks: [
      { projectName: "公开项目", projectUrl: "https://example.com/p", isPublic: true },
      { projectName: "私有项目", projectUrl: "https://secret.example.com", isPublic: false },
    ],
  });
  await confirmEntry(entry.id);
  await publishEntry(entry.id);

  const { entry: draftEntry } = await createDraftForArticle(draftArticle.id);
  return { publishedEntryId: entry.id, draftEntryId: draftEntry.id };
}

describe("showcase.json 导出", () => {
  beforeEach(resetDb);

  it("只导出已发布记录和白名单字段，通过 schema 校验", async () => {
    const { publishedEntryId, draftEntryId } = await setupPublishedAndDraft();
    const result = await exportShowcase();

    expect(existsSync(result.path)).toBe(true);
    const raw = readFileSync(result.path, "utf8");
    const payload = showcaseSchema.parse(JSON.parse(raw));

    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].id).toBe(publishedEntryId);
    expect(raw).not.toContain(draftEntryId);
    expect(payload.entries[0].sourceName).toBe("公开信源名");
  });

  it("隐私扫描：不出现密钥、绝对路径、完整正文、私有信源 URL、未发布记录", async () => {
    process.env.MODEL_API_KEY = "sk-test-secret-do-not-export";
    const { draftEntryId } = await setupPublishedAndDraft();
    const result = await exportShowcase();
    const raw = readFileSync(result.path, "utf8");

    expect(raw).not.toContain("sk-test-secret-do-not-export");
    expect(raw).not.toContain("MODEL_API_KEY");
    expect(raw).not.toContain(process.cwd());
    expect(raw).not.toContain("/Users/");
    expect(raw).not.toContain("secret-full-body");
    expect(raw).not.toContain("private-feed.example.com");
    expect(raw).not.toContain("secret.example.com");
    expect(raw).not.toContain("内部信源名");
    expect(raw).not.toContain(draftEntryId);
    delete process.env.MODEL_API_KEY;
  });

  it("撤回记录后再次导出会移除该记录", async () => {
    const { publishedEntryId } = await setupPublishedAndDraft();
    await exportShowcase();

    const { unpublishEntry } = await import("@/lib/learning/service");
    await unpublishEntry(publishedEntryId);
    const result = await exportShowcase();

    const raw = readFileSync(result.path, "utf8");
    expect(result.count).toBe(0);
    expect(raw).not.toContain(publishedEntryId);
  });

  it("导出失败时保留上一个成功版本且 checksum 不变", async () => {
    await setupPublishedAndDraft();
    const first = await exportShowcase();
    const before = readFileSync(showcaseFilePath(), "utf8");
    const checksumBefore = createHash("sha256").update(before).digest("hex");
    expect(checksumBefore).toBe(first.checksum);

    // 模拟写入失败
    await expect(
      exportShowcase({
        writeFileImpl: async () => {
          throw new Error("disk full (simulated)");
        },
      }),
    ).rejects.toThrow("disk full");

    const after = readFileSync(showcaseFilePath(), "utf8");
    expect(createHash("sha256").update(after).digest("hex")).toBe(checksumBefore);

    const exportRuns = await prisma.exportRun.findMany({ orderBy: { createdAt: "asc" } });
    expect(exportRuns.at(-1)?.status).toBe("export_failed");
    // ExportRun 中的路径为相对文件名，不含本地绝对路径
    expect(exportRuns.every((r) => !r.filePath.startsWith("/"))).toBe(true);
  });
});
