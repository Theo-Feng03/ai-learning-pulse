import { expect, test } from "@playwright/test";

// 核心闭环（no_ai 模式）：示例数据 → 详情 → 草稿 → 填写结论 + 主题 → 确认 → 发布
// → 时间线可见 → 导出 → /showcase 可见 → 撤回 → 重新导出后消失

const TARGET_TITLE = "Demo: Evaluating open models for long context tasks";
const TAKEAWAY = "E2E 测试写入的学习结论：长上下文评测需要控制信息位置分布。";

test.describe.configure({ mode: "serial" });

test("使用示例数据启动并打开资讯详情", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "总览" })).toBeVisible();
  // no_ai 模式明确提示且不阻止启动
  await expect(page.getByText("no_ai 模式", { exact: false }).first()).toBeVisible();

  await page.goto("/inbox");
  await page.getByRole("link", { name: TARGET_TITLE }).click();
  await expect(page.getByRole("heading", { name: TARGET_TITLE })).toBeVisible();
  await expect(page.getByText("AI 参考（机器生成，仅供筛选）")).toBeVisible();
});

test("创建草稿、确认、发布、时间线可见", async ({ page }) => {
  await page.goto("/inbox");
  await page.getByRole("link", { name: TARGET_TITLE }).click();
  await page.waitForURL(/\/articles\//);
  await page.getByRole("button", { name: "保存为学习记录" }).click();
  await page.waitForURL(/\/learning\//);

  // 学习编辑页：AI 参考与我的记录分区可见，userTakeaway 初始为空
  await expect(page.getByText("AI 参考（机器生成，不代表我的观点）")).toBeVisible();
  await expect(page.getByText("我的记录（本人填写）")).toBeVisible();
  const takeawayInput = page.getByLabel(/我的学习结论/);
  await expect(takeawayInput).toHaveValue("");

  // 未填写时确认 → 校验错误
  await page.getByRole("button", { name: "确认已学习" }).click();
  await expect(page.getByText(/不得少于 10 个字符/)).toBeVisible();

  // 填写结论 + 选择主题
  await takeawayInput.fill(TAKEAWAY);
  await page.getByRole("button", { name: "Model Evaluation" }).click();
  await page.getByRole("button", { name: "确认已学习" }).click();
  await expect(page.getByText("已确认", { exact: true })).toBeVisible();

  // 发布
  await page.getByRole("button", { name: "发布到主页" }).click();
  await expect(page.getByText("已发布", { exact: true })).toBeVisible();

  // 时间线可见
  await page.goto("/learning?status=published");
  await expect(page.getByText(TAKEAWAY.slice(0, 12), { exact: false })).toBeVisible();
});

test("导出展示数据并在 /showcase 看到记录", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "导出展示数据" }).click();
  await expect(page.getByText(/已导出 \d+ 条记录/)).toBeVisible();

  await page.goto("/showcase");
  await expect(page.getByText("AI Learning Pulse").first()).toBeVisible();
  await expect(page.getByText(TAKEAWAY.slice(0, 12), { exact: false })).toBeVisible();
  await expect(
    page.getByText("本页面只统计本人确认发布的学习记录", { exact: false }),
  ).toBeVisible();
});

test("撤回发布后重新导出，记录从公开预览消失", async ({ page }) => {
  // 找到刚才的记录并撤回
  await page.goto("/learning?status=published");
  await page.getByRole("link", { name: TARGET_TITLE }).click();
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "撤回发布" }).click();
  await expect(page.getByText("已确认", { exact: true })).toBeVisible();

  // 重新导出
  await page.goto("/");
  await page.getByRole("button", { name: "导出展示数据" }).click();
  await expect(page.getByText(/已导出 \d+ 条记录/)).toBeVisible();

  // 公开预览不再包含该记录（seed 的演示已发布记录仍在）
  await page.goto("/showcase");
  await expect(page.getByText(TAKEAWAY.slice(0, 12), { exact: false })).not.toBeVisible();
});
