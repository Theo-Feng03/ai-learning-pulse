import { describe, expect, it } from "vitest";
import { showcaseSchema } from "@/lib/export/schema";
import { toShowcaseEntry, type PublishedEntryData } from "@/lib/export/showcase";

const entryData: PublishedEntryData = {
  id: "entry1",
  userTakeaway: "我的学习结论，超过十个字符。",
  whyFollow: "关注理由",
  impact: null,
  publishedAt: new Date("2026-07-10T00:00:00Z"),
  article: {
    title: "Fixture title",
    originalUrl: "https://example.com/post",
    publishedAt: new Date("2026-07-09T00:00:00Z"),
    source: { name: "内部名称", publicName: "公开名称" },
    analysis: { summaryZh: "AI 摘要" },
  },
  topics: [{ topic: { name: "AI Search" } }],
  projectLinks: [
    { projectName: "公开项目", projectUrl: "https://example.com/p", note: "备注", isPublic: true },
    { projectName: "私有项目", projectUrl: "https://private.example.com", note: null, isPublic: false },
  ],
};

describe("toShowcaseEntry 白名单映射", () => {
  it("只导出白名单字段", () => {
    const entry = toShowcaseEntry(entryData);
    expect(Object.keys(entry).sort()).toEqual(
      [
        "id",
        "impact",
        "projectLinks",
        "publishedAt",
        "sourceName",
        "sourcePublishedAt",
        "sourceUrl",
        "summaryZh",
        "title",
        "topics",
        "userTakeaway",
        "whyFollow",
      ].sort(),
    );
  });

  it("使用公开来源名称，不泄漏内部名称", () => {
    expect(toShowcaseEntry(entryData).sourceName).toBe("公开名称");
  });

  it("isPublic=false 的项目关联不导出", () => {
    const entry = toShowcaseEntry(entryData);
    expect(entry.projectLinks).toHaveLength(1);
    expect(JSON.stringify(entry)).not.toContain("private.example.com");
  });
});

describe("showcaseSchema 严格校验", () => {
  const validPayload = {
    schemaVersion: 1,
    generatedAt: "2026-07-15T00:00:00Z",
    profile: { productName: "AI Learning Pulse", description: "d", githubUrl: "" },
    stats: { records90d: 1, activeWeeks12: 1, topicCount90d: 1, linkedPracticeCount: 0 },
    heatmap: [{ date: "2026-07-10", count: 1 }],
    topics: [{ name: "AI Search", count: 1 }],
    entries: [toShowcaseEntry(entryData)],
  };

  it("合法 payload 通过", () => {
    expect(() => showcaseSchema.parse(validPayload)).not.toThrow();
  });

  it("多余字段（如 content、apiKey）直接失败", () => {
    expect(() =>
      showcaseSchema.parse({ ...validPayload, apiKey: "sk-leak" }),
    ).toThrow();
    expect(() =>
      showcaseSchema.parse({
        ...validPayload,
        entries: [{ ...toShowcaseEntry(entryData), content: "全文正文" }],
      }),
    ).toThrow();
  });

  it("schemaVersion 必须为 1", () => {
    expect(() => showcaseSchema.parse({ ...validPayload, schemaVersion: 2 })).toThrow();
  });
});
