# 接入微信公众号（WeWe RSS）

微信公众号没有官方 RSS。[WeWe RSS](https://github.com/cooderl/wewe-rss) 是一个开源桥接服务：用微信读书账号登录后，把你订阅的公众号转成标准 RSS，供 AI Learning Pulse 采集。**全部在你本机运行，凭据不出门。**

## 前置条件

- Docker（推荐 [OrbStack](https://orbstack.dev/) 或 Docker Desktop，装完即可）
- 一个微信读书账号（建议用小号；扫码登录后该账号会被用于拉取公众号内容，存在被平台限制的风险，属于个人使用的灰色地带——自行斟酌）

## 步骤

1. **启动服务**（先把 `docker-compose.yml` 里的 `AUTH_CODE` 改成自己的口令）：

   ```bash
   cd docker/wewe-rss
   docker compose up -d
   ```

2. **登录**：打开 http://localhost:4000 → 输入 AUTH_CODE → 「账号管理」→ 微信读书扫码登录。

3. **添加公众号**：「公众号源」→ 添加你想订阅的公众号（粘贴公众号的分享链接即可）。

4. **拿到 RSS 地址**：
   - 全部订阅合成一个 feed：`http://localhost:4000/feeds/all.atom`
   - 也可以在界面里复制单个公众号的 feed 地址

5. **加进 AI Learning Pulse**：信源管理 → 新增信源 → 类型 RSS → 粘贴上面的地址 → 测试抓取 → 保存。
   - **公开显示名**：填公众号的名字（如"某某 AI 周刊"），这样发布的学习记录来源显示正常名称
   - localhost 的 feed 地址属于私有信源 URL，AI Learning Pulse 永远不会导出它

之后每次采集（手动或 cron）都会把新的公众号文章拉进收件箱，和其他信源一样走 AI 摘要、学习记录、发布的完整流程。

## 注意

- WeWe RSS 需要保持运行（Docker 容器常驻，开机自启由 Docker Desktop/OrbStack 设置控制）；它停了不影响 AI Learning Pulse 本身，只是采集不到新的公众号文章
- 抓取频率默认每天两次（compose 里的 `CRON_EXPRESSION`），不建议调得太频繁
- 双机同步：WeWe RSS 的数据在 `docker/wewe-rss/data/`（已被 .gitignore 排除），第二台电脑需要单独登录一次；或者只在一台电脑上跑 WeWe RSS，另一台照常同步 AI Learning Pulse 的数据即可
