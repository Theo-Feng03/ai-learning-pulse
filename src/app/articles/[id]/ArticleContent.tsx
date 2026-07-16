"use client";

import { useState } from "react";
import { Badge, btnSecondary, Card } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

interface Translation {
  title: string;
  excerpt: string | null;
}

export function ArticleContent({
  articleId,
  title,
  excerpt,
  content,
  language,
  sourceName,
  author,
  publishedAt,
  originalUrl,
  modelConfigured,
}: {
  articleId: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  language: string | null;
  sourceName: string;
  author: string | null;
  publishedAt: string | null;
  originalUrl: string;
  modelConfigured: boolean;
}) {
  const [translation, setTranslation] = useState<Translation | null>(null);
  const [showTranslated, setShowTranslated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetLang = language === "zh" ? "en" : "zh";
  const translateLabel = targetLang === "zh" ? "译为中文" : "译为英文";

  const toggle = async () => {
    setError(null);
    if (showTranslated) {
      setShowTranslated(false);
      return;
    }
    if (translation) {
      setShowTranslated(true);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/articles/${articleId}/translate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetLang }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "翻译失败");
        return;
      }
      setTranslation({ title: data.title, excerpt: data.excerpt });
      setShowTranslated(true);
    } catch {
      setError("网络错误");
    } finally {
      setBusy(false);
    }
  };

  const shownTitle = showTranslated && translation ? translation.title : title;
  const shownExcerpt = showTranslated && translation ? translation.excerpt : excerpt;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-lg font-bold">{shownTitle}</h1>
        {showTranslated ? <Badge tone="blue">机器翻译</Badge> : null}
      </div>
      <p className="mt-1 text-sm text-stone-500">
        {sourceName}
        {author ? `｜${author}` : ""}｜{formatDateTime(publishedAt)}
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-3">
        <a href={originalUrl} target="_blank" rel="noreferrer" className="text-sm text-sky-700 underline">
          打开原文 ↗
        </a>
        {modelConfigured ? (
          <button type="button" className={btnSecondary} onClick={toggle} disabled={busy}>
            {busy ? "翻译中…" : showTranslated ? "显示原文" : translateLabel}
          </button>
        ) : (
          <span className="text-xs text-stone-400">翻译需配置模型（当前 no_ai 模式）</span>
        )}
      </p>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      {shownExcerpt ? (
        <p className="mt-3 whitespace-pre-wrap text-sm text-stone-700">{shownExcerpt}</p>
      ) : (
        <p className="mt-3 text-sm text-stone-400">
          {showTranslated ? "原文无摘要片段。" : "该来源未提供摘要片段。"}
        </p>
      )}
      {showTranslated ? (
        <p className="mt-2 text-xs text-stone-400">
          机器翻译仅供阅读参考，不会进入学习记录或公开导出。
        </p>
      ) : null}
      {content ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-stone-500">
            查看全文 / 口播稿（{content.length} 字，仅本地可见，永不导出）
          </summary>
          <p className="mt-2 whitespace-pre-wrap rounded bg-stone-50 p-3 text-sm text-stone-700">
            {content}
          </p>
        </details>
      ) : null}
    </Card>
  );
}
