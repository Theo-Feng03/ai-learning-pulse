import { prisma } from "@/lib/db/client";

/** 按外键顺序清空所有表（集成测试 beforeEach 使用） */
export async function resetDb() {
  await prisma.projectLink.deleteMany();
  await prisma.learningEntryTopic.deleteMany();
  await prisma.learningEntry.deleteMany();
  await prisma.aIAnalysis.deleteMany();
  await prisma.runError.deleteMany();
  await prisma.article.deleteMany();
  await prisma.storyGroup.deleteMany();
  await prisma.ingestionRun.deleteMany();
  await prisma.source.deleteMany();
  await prisma.topic.deleteMany();
  await prisma.appSetting.deleteMany();
  await prisma.exportRun.deleteMany();
}
