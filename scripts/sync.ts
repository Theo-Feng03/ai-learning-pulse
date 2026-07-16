// 双机数据同步：pnpm sync:init | sync:pull | sync:push
//
// 原理：数据导出为便携快照（data-snapshot.json），存放在一个**私有** GitHub 仓库中。
// 每台电脑：pull = 拉远端快照并按"谁新用谁"合并进本地库；push = 先 pull 合并，再导出推送。
// 因此任意一侧的 push 都不会丢掉另一侧的新数据。合并前自动备份本地数据库。
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import { prisma } from "../src/lib/db/client";
import { applySnapshot, buildSnapshot, syncSnapshotSchema } from "../src/lib/sync/snapshot";

const SNAPSHOT_FILE = "data-snapshot.json";
const BACKUP_KEEP = 10;

const repoSlug = process.env.SYNC_REPO?.trim();
const syncDir = path.resolve(process.cwd(), process.env.SYNC_DIR?.trim() || ".data-sync");
const snapshotPath = path.join(syncDir, SNAPSHOT_FILE);

function run(cmd: string, args: string[], cwd?: string): string {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function ghAvailable(): boolean {
  try {
    run("gh", ["auth", "status"]);
    return true;
  } catch {
    return false;
  }
}

/** 隐私护栏：确认同步仓库确实是私有仓库，公开仓库拒绝推送 */
function assertRepoPrivate(slug: string) {
  const visibility = run("gh", ["repo", "view", slug, "--json", "visibility", "--jq", ".visibility"]).trim();
  if (visibility.toUpperCase() !== "PRIVATE") {
    throw new Error(`同步仓库 ${slug} 不是私有仓库（当前 ${visibility}）。数据快照包含私有草稿，拒绝同步。`);
  }
}

function resolveDbPath(): string {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const filePath = url.replace(/^file:/, "");
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), "prisma", filePath);
}

/** 合并前备份本地数据库，保留最近 10 份 */
function backupDb(): string | null {
  const dbPath = resolveDbPath();
  if (!existsSync(dbPath)) return null;
  const backupDir = path.resolve(process.cwd(), "prisma/backups");
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(backupDir, `dev-${stamp}.db`);
  copyFileSync(dbPath, target);

  const backups = readdirSync(backupDir).filter((f) => f.endsWith(".db")).sort();
  for (const old of backups.slice(0, Math.max(0, backups.length - BACKUP_KEEP))) {
    rmSync(path.join(backupDir, old));
  }
  return target;
}

function ensureRepoCloned(slug: string) {
  if (existsSync(path.join(syncDir, ".git"))) return;
  console.log(`[sync] 克隆同步仓库 ${slug} → ${path.relative(process.cwd(), syncDir)}`);
  run("gh", ["repo", "clone", slug, syncDir]);
}

async function init() {
  if (!repoSlug) {
    console.error('[sync] 请先在 .env 设置 SYNC_REPO（如 SYNC_REPO="你的用户名/ai-learning-pulse-data"）');
    process.exitCode = 1;
    return;
  }
  if (!ghAvailable()) {
    console.error("[sync] 需要已登录的 GitHub CLI（gh auth login）");
    process.exitCode = 1;
    return;
  }
  try {
    run("gh", ["repo", "view", repoSlug]);
    console.log(`[sync] 仓库 ${repoSlug} 已存在，跳过创建`);
  } catch {
    console.log(`[sync] 创建私有仓库 ${repoSlug}…`);
    run("gh", ["repo", "create", repoSlug, "--private", "--description", "AI Learning Pulse 私有数据快照（自动同步）"]);
  }
  assertRepoPrivate(repoSlug);
  ensureRepoCloned(repoSlug);
  await push();
  console.log("[sync] 初始化完成。另一台电脑上配置相同的 SYNC_REPO 后执行 pnpm sync:pull 即可。");
}

/** 拉取远端快照并合并进本地库 */
async function pull(): Promise<void> {
  if (!repoSlug) {
    console.log("[sync] 未配置 SYNC_REPO，跳过同步");
    return;
  }
  assertRepoPrivate(repoSlug);
  ensureRepoCloned(repoSlug);
  // 空仓库（尚无任何提交）没有可拉取的分支
  const remoteHeads = run("git", ["ls-remote", "--heads", "origin"], syncDir).trim();
  if (remoteHeads) {
    run("git", ["pull", "--ff-only"], syncDir);
  }

  if (!existsSync(snapshotPath)) {
    console.log("[sync] 远端还没有快照（另一台机器尚未 push），无需合并");
    return;
  }
  const snapshot = syncSnapshotSchema.parse(JSON.parse(readFileSync(snapshotPath, "utf8")));
  const backup = backupDb();
  if (backup) console.log(`[sync] 已备份本地数据库 → ${path.relative(process.cwd(), backup)}`);

  const stats = await applySnapshot(snapshot);
  console.log(
    `[sync] 已合并远端快照（来自 ${snapshot.hostname}，${snapshot.exportedAt}）：` +
      `新增 ${stats.created}，更新 ${stats.updated}，未变 ${stats.unchanged}`,
  );
}

/** 先 pull 合并，再导出本地数据并推送 */
async function push(): Promise<void> {
  if (!repoSlug) {
    console.log("[sync] 未配置 SYNC_REPO，跳过同步");
    return;
  }
  await pull();

  const snapshot = await buildSnapshot(hostname());
  const nextJson = JSON.stringify(snapshot, null, 1);

  // 忽略导出时间戳与机器名，内容一致就不产生新提交
  const normalize = (s: string) =>
    s.replace(/"exportedAt": "[^"]*"/, "").replace(/"hostname": "[^"]*"/, "");
  if (existsSync(snapshotPath) && normalize(readFileSync(snapshotPath, "utf8")) === normalize(nextJson)) {
    console.log("[sync] 数据无变化，无需推送");
    return;
  }
  writeFileSync(snapshotPath, nextJson, "utf8");
  run("git", ["add", SNAPSHOT_FILE], syncDir);
  run("git", ["commit", "-m", `sync from ${hostname()} @ ${new Date().toISOString()}`], syncDir);
  run("git", ["push"], syncDir);
  console.log(
    `[sync] 已推送快照：${snapshot.articles.length} 篇文章，${snapshot.entries.length} 条学习记录`,
  );
}

async function main() {
  const command = process.argv[2];
  switch (command) {
    case "init":
      await init();
      break;
    case "pull":
      await pull();
      break;
    case "push":
      await push();
      break;
    default:
      console.error("用法：tsx scripts/sync.ts <init|pull|push>");
      process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("[sync] 失败：", err instanceof Error ? err.message : err);
    console.error("[sync] 本地数据未受影响（合并前有自动备份，见 prisma/backups/）。");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
