import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

// 测试数据库：tests/tmp/test.db（.gitignore 已排除）
export default function globalSetup() {
  const tmpDir = path.resolve(__dirname, "../tmp");
  mkdirSync(tmpDir, { recursive: true });
  const dbPath = path.join(tmpDir, "test.db");
  if (existsSync(dbPath)) rmSync(dbPath);

  execSync("pnpm prisma db push --skip-generate", {
    cwd: path.resolve(__dirname, "../.."),
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
    stdio: "pipe",
  });
}
