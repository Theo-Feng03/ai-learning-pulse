import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Learning Pulse",
  description: "个人 AI 学习雷达：采集资讯，AI 辅助理解，本人确认后形成公开学习轨迹",
};

const NAV_ITEMS = [
  { href: "/", label: "总览" },
  { href: "/inbox", label: "资讯收件箱" },
  { href: "/learning", label: "学习时间线" },
  { href: "/sources", label: "信源管理" },
  { href: "/runs", label: "运行记录" },
  { href: "/settings", label: "设置" },
  { href: "/showcase", label: "公开预览" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">
        <div className="flex min-h-screen">
          <aside className="w-52 shrink-0 border-r border-stone-200 bg-white px-4 py-6">
            <Link href="/" className="block text-lg font-bold text-stone-900">
              AI Learning Pulse
            </Link>
            <p className="mt-1 text-xs text-stone-500">个人 AI 学习雷达</p>
            <nav aria-label="主导航" className="mt-6 flex flex-col gap-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded px-2 py-1.5 text-sm text-stone-700 hover:bg-stone-100"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>
          <main className="min-w-0 flex-1 px-8 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
