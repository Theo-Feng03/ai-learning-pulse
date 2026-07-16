// E2E 数据库准备：由 playwright webServer 命令在启动 next dev 前执行
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../..");
const tmpDir = path.join(root, "tests/tmp");
mkdirSync(tmpDir, { recursive: true });

const dbPath = path.join(tmpDir, "e2e.db");
if (existsSync(dbPath)) rmSync(dbPath);
const exportDir = path.join(tmpDir, "e2e-exports");
if (existsSync(exportDir)) rmSync(exportDir, { recursive: true });
mkdirSync(exportDir, { recursive: true });

const env = { ...process.env, DATABASE_URL: `file:${dbPath}` };
execSync("pnpm prisma db push --skip-generate", { cwd: root, env, stdio: "inherit" });
execSync("pnpm exec tsx prisma/seed.ts", { cwd: root, env, stdio: "inherit" });
console.log("[e2e] 数据库与导出目录已准备");
