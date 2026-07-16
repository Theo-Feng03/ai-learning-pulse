import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 本地单用户工具：默认由 `next dev --hostname 127.0.0.1` 启动（见 README），不做额外网络暴露。
  serverExternalPackages: ["@prisma/client", "rss-parser"],
};

export default nextConfig;
