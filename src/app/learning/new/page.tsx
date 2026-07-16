"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnPrimary, Card, inputCls, labelCls } from "@/components/ui";
import { VideoIntake } from "./VideoIntake";

// 手动添加学习记录：适用于无法自动采集的信息源（短视频、公众号、书、课程…）
export default function ManualEntryPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/learning/manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          url,
          sourceName: sourceName || undefined,
          excerpt: excerpt || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "创建失败");
        return;
      }
      router.push(`/learning/${data.learningEntryId}`);
    } catch {
      setError("网络错误");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/learning" className="text-sm text-stone-500 hover:underline">
        ← 返回学习时间线
      </Link>
      <h1 className="text-xl font-bold">手动添加学习记录</h1>
      <p className="text-sm text-stone-500">
        适用于无法自动采集的信息源：短视频、公众号文章、书、课程、线下分享……
        贴上链接即可创建草稿，之后照常填写结论、确认、发布。
      </p>

      <Card>
        <div className="space-y-3">
          <div>
            <label htmlFor="m-title" className={labelCls}>标题 *</label>
            <input id="m-title" className={inputCls} value={title}
              placeholder="内容的原始标题或你对它的称呼"
              onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label htmlFor="m-url" className={labelCls}>原文链接 *（http/https）</label>
            <input id="m-url" className={inputCls} value={url}
              placeholder="https://…"
              onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div>
            <label htmlFor="m-source" className={labelCls}>
              来源名称（可选，留空则使用网址域名；会出现在公开导出中）
            </label>
            <input id="m-source" className={inputCls} value={sourceName}
              placeholder="抖音 / 某某公众号 / 书名…"
              onChange={(e) => setSourceName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="m-excerpt" className={labelCls}>内容摘要（可选，帮助日后回忆）</label>
            <textarea id="m-excerpt" rows={3} className={inputCls} value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)} />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button type="button" className={btnPrimary} onClick={submit}
            disabled={busy || !title.trim() || !url.trim()}>
            {busy ? "创建中…" : "创建草稿并去填写结论"}
          </button>
          {error ? <span className="text-sm text-red-600">{error}</span> : null}
        </div>
      </Card>

      <VideoIntake />
    </div>
  );
}
