// 静态导出：pnpm export:showcase
import { prisma } from "../src/lib/db/client";
import { exportShowcase } from "../src/lib/export/showcase";

async function main() {
  const result = await exportShowcase();
  console.log(`[export] 已生成 ${result.path}`);
  console.log(`[export] 记录数=${result.count} checksum=${result.checksum.slice(0, 12)}…`);
}

main()
  .catch((err) => {
    console.error("[export] 失败：", err instanceof Error ? err.message : err);
    console.error("[export] 上一个成功版本（如存在）已保留。");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
