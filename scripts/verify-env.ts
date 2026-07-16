// 环境检查：pnpm verify:env
// 检查数据库、导出目录和模型配置状态（不输出任何密钥内容）。
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db/client";
import { loadEnv } from "../src/lib/env";

async function main() {
  const env = loadEnv();
  let ok = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
    const tables = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT name FROM sqlite_master WHERE type='table' AND name='Source'`;
    if (tables.length === 0) {
      console.log("✗ 数据库已连接，但缺少表结构。请运行：pnpm db:setup");
      ok = false;
    } else {
      console.log("✓ 数据库连接正常，表结构存在");
    }
  } catch {
    console.log("✗ 数据库不可用。请检查 DATABASE_URL 并运行：pnpm db:setup");
    ok = false;
  }

  const exportDir = path.resolve(process.cwd(), env.EXPORT_DIR ?? "exports");
  if (!existsSync(exportDir)) {
    mkdirSync(exportDir, { recursive: true });
    console.log(`✓ 已创建导出目录：${env.EXPORT_DIR}`);
  } else {
    console.log(`✓ 导出目录存在：${env.EXPORT_DIR}`);
  }

  if (env.modelConfigured) {
    console.log(`✓ 模型已配置（${env.MODEL_NAME}），API Key ${env.MODEL_API_KEY ? "已设置" : "未设置（本地模型可用）"}`);
  } else {
    console.log("ℹ 模型未配置：进入 no_ai 模式。采集、手工记录、确认、发布和导出仍然可用。");
  }

  process.exitCode = ok ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
