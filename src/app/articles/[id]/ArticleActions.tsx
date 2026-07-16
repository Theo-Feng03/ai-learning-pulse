"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnPrimary, btnSecondary } from "@/components/ui";

export function ArticleActions({
  articleId,
  learningEntryId,
  canRetryAnalyze,
}: {
  articleId: string;
  learningEntryId: string | null;
  canRetryAnalyze: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const saveDraft = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/articles/${articleId}/learning`, { method: "POST" });
      const data = await res.json();
      if (res.ok) router.push(`/learning/${data.learningEntryId}`);
      else setMessage(data.error?.message ?? "创建草稿失败");
    } finally {
      setBusy(false);
    }
  };

  const retryAnalyze = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/articles/${articleId}/analyze`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) setMessage(data.error?.message ?? "重试失败");
      else if (data.failed) setMessage("AI 分析仍然失败，可稍后再试");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {learningEntryId ? (
        <button type="button" className={btnPrimary} onClick={() => router.push(`/learning/${learningEntryId}`)}>
          打开学习草稿
        </button>
      ) : (
        <button type="button" className={btnPrimary} onClick={saveDraft} disabled={busy}>
          保存为学习记录
        </button>
      )}
      {canRetryAnalyze ? (
        <button type="button" className={btnSecondary} onClick={retryAnalyze} disabled={busy}>
          重试 AI 分析
        </button>
      ) : null}
      {message ? <span className="text-sm text-red-600">{message}</span> : null}
    </div>
  );
}
