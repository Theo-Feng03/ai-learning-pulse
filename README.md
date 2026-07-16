# AI Learning Pulse｜个人 AI 学习雷达

本地运行的单用户 AI 资讯学习工作台：从公开可信信源采集最新 AI 资讯，完成标准化、去重、AI 分类和摘要；把值得关注的内容保存为学习草稿，补充**本人**学习结论并确认发布后，生成可供个人主页读取的脱敏静态 JSON（`exports/showcase.json`），并提供公开效果预览页 `/showcase`。

> 核心原则：**自动抓取不等于学习；AI 生成内容不等于我的观点。**
> 只有本人填写学习结论并点击“确认已学习”，再点击“发布到主页”的记录，才进入热力图、主题统计和公开导出。

## 快速开始

### macOS 一键安装（推荐）

新电脑上打开终端，粘贴一行：

```bash
curl -fsSL https://raw.githubusercontent.com/Theo-Feng03/ai-learning-pulse/main/setup.sh | bash
```

自动完成：Homebrew / Node / pnpm / GitHub CLI 安装 → GitHub 登录 → 克隆代码到 `~/Documents/AI_NEWS` → 依赖安装 → 数据库初始化 → 从你的私有数据仓库拉取全部数据（没有则写入演示数据）。装完后双击文件夹里的「启动 AI Learning Pulse.command」即可使用。重复运行安全（幂等）。

### 手动安装

要求：Node.js ≥ 20（建议当前 LTS）、pnpm ≥ 10。

```bash
pnpm install
cp .env.example .env
pnpm db:setup      # 应用数据库迁移并生成 Prisma Client
pnpm seed:demo     # 写入演示信源、文章和学习记录（可重复执行）
pnpm dev           # 打开 http://localhost:3000
```

不配置任何模型 API Key 时系统进入 **no_ai 模式**：采集、手工记录、确认、发布和导出全部可用，只是没有 AI 摘要和评分。首页会明确显示当前模式。

### 使用示例数据

`pnpm seed:demo` 写入：

- 3 个真实公开信源（OpenAI News、Hugging Face Blog、ollama/ollama Releases）；
- 5 篇虚构演示文章（含一组“标题相似聚合”演示）；
- 3 条学习记录，分别处于 published / confirmed / draft 状态。

之后即可体验完整闭环：收件箱 → 详情 → 保存草稿 → 填写结论 + 选主题 → 确认已学习 → 发布到主页 → 导出 → `/showcase` 查看公开效果。

### 添加真实信源

在「信源管理」页新增：

- **RSS / Atom**：填写 feed 地址（http/https）。
- **GitHub Release**：填写 `owner/repo` 或仓库地址，系统使用公开的 `releases.atom`，无需 Token。

点击“测试抓取”可预览最近 3 条标题；测试失败仍可保存后手动停用。相同类型 + 相同 URL 不允许重复。连续失败 3 次的信源标记为 degraded（不自动删除）。

**隐私提示**：信源 URL 默认视为私有、永不导出。若希望导出时显示来源名称，请为信源填写“公开显示名”。

### 配置模型（可选）

编辑 `.env`（改动后重启 `pnpm dev`）：

```bash
MODEL_BASE_URL="https://api.openai.com/v1"   # 任何 OpenAI-compatible 接口
MODEL_API_KEY="sk-..."                        # Ollama 等本地服务可留空
MODEL_NAME="gpt-4o-mini"
```

本地 Ollama 示例：`MODEL_BASE_URL="http://localhost:11434/v1"`、`MODEL_NAME="qwen2.5:7b"`、Key 留空。业务代码不绑定任何具体厂商；设置页可测试模型连通性。

配置模型后，文章详情页还提供**中英互译**：点「译为中文 / 译为英文」切换标题与摘要的语言（自动按原文语言选方向）。译文按文章缓存，重复查看不重复调用模型；机器翻译仅用于本地阅读，带明确标注，不进入学习记录和公开导出。no_ai 模式下该按钮不可用。

### 手动学习记录（无法采集的信息源）

短视频、公众号文章、书、课程等爬不到的内容，用「学习时间线 → 手动添加学习记录」：粘贴链接 + 标题即可创建草稿，之后照常填结论、确认、发布——统计与导出口径完全一致，来源仍然可追溯。

### 视频转学习草稿（可选）

「学习时间线 → 手动添加学习记录」页面提供视频入口，两种模式：

- **贴链接**：B 站 / YouTube / TikTok 稳定支持，抖音尽力直连
- **上传文件**：抖音等直连失败时的保底通道（手机下载 → AirDrop → 上传，需附原视频链接保证来源可追溯）

流程全部本地完成：yt-dlp 只抽音频 → 本地 Whisper 转口播稿 → **音频用完即删** → 口播稿存入 `Article.content`（永不导出）→ 如已配模型自动生成 AI 摘要 → 你照常写学习结论。

依赖（macOS）：`brew install yt-dlp ffmpeg whisper-cpp`，模型放 `data/models/ggml-small.bin`（可用 `WHISPER_MODEL` 环境变量改路径；国内网络建议从 ModelScope 镜像下载）。

### 接入微信公众号（可选）

通过本地部署的 WeWe RSS 桥接：见 [docker/wewe-rss/README.md](docker/wewe-rss/README.md)。桥接后公众号文章与其他信源一样进入采集管道。

### 采集

- 页面：总览页点击“开始采集”，每 2 秒轮询进度。
- CLI：`pnpm ingest`（供 cron / launchd 定时调用；退出码 0 = completed 或 partial_failed，非 0 = 整体失败）。

crontab 示例（每天 9 点）：

```
0 9 * * * cd /path/to/repo && /usr/local/bin/pnpm ingest >> logs/ingest.log 2>&1
```

### 生成 showcase.json

- 页面：总览页“导出展示数据”。
- CLI：`pnpm export:showcase`。
- 也可在设置页开启“发布后自动导出”。

导出文件位于 `exports/showcase.json`（可用 `EXPORT_DIR` 修改目录）。导出使用**字段白名单 + Zod 严格校验 + 临时文件原子替换**；失败时保留上一个成功版本。个人主页只需读取这一个静态文件，不依赖本地服务在线。

### 运行测试

```bash
pnpm test              # 单元 + 集成（Vitest，独立 SQLite 测试库，含 AI mock）
pnpm test:e2e          # Playwright 核心闭环（首次需 pnpm exec playwright install chromium）
pnpm typecheck && pnpm lint
```

真实模型评测**不会**混入默认测试，必须显式运行：

```bash
pnpm eval:model                      # 使用 .env 中的真实模型跑 30 条固定评测集
AI_PROVIDER=mock pnpm eval:model     # 无成本流程演练
```

报告输出到 `tests/tmp/eval/`。

### 环境检查

```bash
pnpm verify:env   # 检查数据库、导出目录和模型配置状态（不输出密钥）
```

## 部署公开展示页（GitHub Pages）

`docs/` 内是一个零依赖的静态展示页（`index.html` + `showcase.json`），可直接由 GitHub Pages 托管（Settings → Pages → Deploy from branch → `main` / `/docs`）。

发布新学习记录后更新线上页面：

```bash
pnpm site:update                       # 重新导出并同步到 docs/showcase.json
git add docs/showcase.json && git commit -m "更新学习记录" && git push
```

上线的只有白名单导出的 `showcase.json`：不含 API Key、本地路径、私有信源 URL、文章正文和未发布内容。

## 双机同步（可选）

数据可以在两台电脑之间同步：每台电脑保留完整的本地数据库，另有一份便携快照存放在你自己的**私有** GitHub 仓库中（与公开代码仓完全隔离），顺带充当异地备份。

首次设置（第一台电脑）：

```bash
# .env 中配置：SYNC_REPO="你的用户名/ai-learning-pulse-data"
pnpm sync:init      # 自动创建私有仓库并推送当前数据
```

第二台电脑：直接跑上面的「macOS 一键安装」即可，脚本会自动配置 `SYNC_REPO` 并拉取全部数据；手动路线则是克隆代码仓、`pnpm db:setup` 后在 `.env` 配置相同的 `SYNC_REPO`，执行 `pnpm sync:pull`。

日常使用：

```bash
pnpm sync:push      # 换电脑前：先合并远端，再推送本机数据（永不丢对方数据）
pnpm sync:pull      # 到另一台电脑后：拉取合并
```

同步机制与边界：

- 快照使用**自然键**（canonical URL / feed URL / 主题 slug）对齐记录，两台电脑各自采集到同一篇文章会合并为一条；
- 冲突按记录级"谁新用谁"（比较 `updatedAt`）；学习记录被远端覆盖时其主题与项目关联整体跟随；
- 合并前自动备份本地数据库到 `prisma/backups/`（保留最近 10 份）；
- 同步仓库必须是私有仓库，脚本会校验，公开仓库拒绝推送；
- **不同步**：`.env`（密钥）、运行日志、标题聚合组（各机自行计算）；
- **不做删除同步**：一台电脑删除的数据若另一台还有，合并后会回来（v1 限制）。

## 不得提交到 Git 的文件

`.gitignore` 已覆盖，请勿手动强行提交：

- `.env`（密钥）
- `prisma/*.db`（本地数据库及真实采集数据）
- `exports/*.json`（个人导出产物）
- `tests/tmp/`、`test-results/`、`logs/`、`.next/`、`node_modules/`

## 核心概念与状态流

```
Article:        fetched → normalized → analyzed （异常: analyze_failed / ignored / saved）
LearningEntry:  draft → confirmed → published → archived
                published --撤回--> confirmed；archived --恢复--> confirmed
IngestionRun:   created → fetching → normalizing → analyzing → completed | partial_failed | failed
```

- **AI 与本人内容严格分离**：`AIAnalysis`（摘要、评分、建议主题）永远不会写入 `LearningEntry.userTakeaway`；创建草稿时结论为空；AI 建议主题仅作候选，必须本人点选。
- **有效学习记录**：绑定文章 + 结论 ≥ 10 字符 + 至少 1 个主题 + 来源可追溯 + 本人点击“确认已学习”。
- **只有 published 记录**计入 90 天统计、热力图、主题统计并进入导出。
- 修改已确认/已发布记录的结论或主题会**回到 draft**，需重新确认与发布；已导出内容在下一次导出时同步移除。

## 目录结构

```
prisma/          schema、迁移、seed
scripts/         ingest / export-showcase / verify-env / eval-model
src/app/         页面与 API 路由（App Router）
src/lib/         sources（适配器）、ingestion（管道）、dedup、ai、learning、analytics、export
tests/           unit / integration / e2e / fixtures（RSS fixture 与 30 条评测集）
exports/         showcase.json 输出目录（内容不入库）
```

## Decisions（实施假设记录）

PRD 未完全确定处采用的最小实现，如需调整欢迎提 issue：

1. **模型配置判定**：`MODEL_BASE_URL` + `MODEL_NAME` 同时存在即视为已配置；`MODEL_API_KEY` 可选（兼容 Ollama 等本地服务）。
2. **正文抽取**：第一版只保存 RSS/Atom 自带的摘要与正文片段（截断），未引入 jsdom + Readability 的网页正文抓取；AI 在正文不足时标记 `insufficientContent`。
3. **AI 规则预筛**：第一版对全部新文章按运行上限（默认 30 条/次）分析，未实现关键词预筛；超出部分标记 queued 由下次运行处理。
4. **Article 增加 `aiStatus` 字段**：PRD 的文章状态枚举不含 AI 明细状态（not_configured / rate_limited / queued），单独用一列记录，避免与主状态互相覆盖。
5. **信源导出名**：导出时使用 `publicName || name`；feed URL 一律不导出。文章的 `originalUrl`（公开文章链接）会导出，因为它是“来源可追溯”要求的一部分。
6. **GitHub Release**：走公开 `releases.atom`，不调用 GitHub API，避免 Token 管理。
7. **结构化日志**：运行观测落在 `IngestionRun` / `RunError` / `ExportRun` 表 + 控制台输出，未额外写 JSON 日志文件。
8. **Docker Compose（P1）**：暂未提供；SQLite + pnpm 本地启动已满足“克隆即体验”。
9. **每篇文章一条学习记录**（PRD 12.5），重复“保存为学习记录”幂等返回已有草稿。
10. **eval:model 阈值**：以“结构化输出可解析率 ≥ 95%”为退出码判定；内容质量断言输出在报告中供人工检查。
11. **翻译功能（v0.2 新增）**：只翻译标题与摘要（不翻正文），按 (文章, 目标语言) 缓存、原文变化后失效；译文属于 AI 内容，永不进入 showcase.json 白名单。

## 许可证与致谢

产品交互参考了 AI News Radar、Horizon、Karakeep、simonw/til、Obsidian Digital Garden 等开源项目的**产品思路**；本仓库代码为原创实现，未复制上述项目（含 AGPL 项目）的代码。运行时第三方依赖：Next.js（MIT）、Prisma（Apache-2.0）、Zod（MIT）、rss-parser（MIT）、Tailwind CSS（MIT）。
