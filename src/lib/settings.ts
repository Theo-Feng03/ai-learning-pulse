import { prisma } from "@/lib/db/client";
import { getEnv } from "@/lib/env";

// 非敏感可调配置：数据库 AppSetting 优先，其次环境变量默认值
export interface AppSettings {
  titleSimilarityThreshold: number;
  aiMaxPerRun: number;
  autoExportOnPublish: boolean;
}

export const SETTING_KEYS = {
  titleSimilarityThreshold: "titleSimilarityThreshold",
  aiMaxPerRun: "aiMaxPerRun",
  autoExportOnPublish: "autoExportOnPublish",
} as const;

export async function getSettings(): Promise<AppSettings> {
  const env = getEnv();
  const rows = await prisma.appSetting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const threshold = Number(map.get(SETTING_KEYS.titleSimilarityThreshold));
  const maxPerRun = Number(map.get(SETTING_KEYS.aiMaxPerRun));

  return {
    titleSimilarityThreshold:
      Number.isFinite(threshold) && threshold > 0 && threshold <= 1
        ? threshold
        : env.TITLE_SIMILARITY_THRESHOLD,
    aiMaxPerRun:
      Number.isFinite(maxPerRun) && maxPerRun > 0 ? Math.floor(maxPerRun) : env.AI_MAX_PER_RUN,
    autoExportOnPublish: map.get(SETTING_KEYS.autoExportOnPublish) === "true",
  };
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const writes: Array<{ key: string; value: string }> = [];
  if (patch.titleSimilarityThreshold !== undefined) {
    writes.push({
      key: SETTING_KEYS.titleSimilarityThreshold,
      value: String(patch.titleSimilarityThreshold),
    });
  }
  if (patch.aiMaxPerRun !== undefined) {
    writes.push({ key: SETTING_KEYS.aiMaxPerRun, value: String(patch.aiMaxPerRun) });
  }
  if (patch.autoExportOnPublish !== undefined) {
    writes.push({
      key: SETTING_KEYS.autoExportOnPublish,
      value: patch.autoExportOnPublish ? "true" : "false",
    });
  }
  for (const w of writes) {
    await prisma.appSetting.upsert({
      where: { key: w.key },
      create: w,
      update: { value: w.value },
    });
  }
  return getSettings();
}
