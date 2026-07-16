import { z } from "zod";
import { SHOWCASE_SCHEMA_VERSION } from "@/types/domain";

// showcase.json 契约（Vibe Coding PRD 第 14 节）。
// 这是白名单：payload 只能由下列字段构成，导出前必须通过本 schema 校验。
// strictObject：出现任何多余字段直接失败，防止“先序列化再删字段”式泄漏。

export const showcaseEntrySchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  sourceName: z.string(),
  sourceUrl: z.url(),
  sourcePublishedAt: z.string(),
  summaryZh: z.string(),
  userTakeaway: z.string(),
  whyFollow: z.string(),
  impact: z.string(),
  topics: z.array(z.string()),
  projectLinks: z.array(
    z.strictObject({
      projectName: z.string(),
      projectUrl: z.string(),
      note: z.string(),
    }),
  ),
  publishedAt: z.string(),
});

export const showcaseSchema = z.strictObject({
  schemaVersion: z.literal(SHOWCASE_SCHEMA_VERSION),
  generatedAt: z.string(),
  profile: z.strictObject({
    productName: z.string(),
    description: z.string(),
    githubUrl: z.string(),
  }),
  stats: z.strictObject({
    records90d: z.number().int().min(0),
    activeWeeks12: z.number().int().min(0),
    topicCount90d: z.number().int().min(0),
    linkedPracticeCount: z.number().int().min(0),
  }),
  heatmap: z.array(
    z.strictObject({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      count: z.number().int().min(0),
    }),
  ),
  topics: z.array(
    z.strictObject({
      name: z.string(),
      count: z.number().int().min(0),
    }),
  ),
  entries: z.array(showcaseEntrySchema),
});

export type ShowcasePayload = z.infer<typeof showcaseSchema>;
export type ShowcaseEntry = z.infer<typeof showcaseEntrySchema>;
