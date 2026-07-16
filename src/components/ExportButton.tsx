"use client";

import { useState } from "react";
import { btnSecondary } from "./ui";

export function ExportButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/exports/showcase", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setFailed(false);
        setMessage(`已导出 ${data.count} 条记录 → ${data.path}`);
      } else {
        setFailed(true);
        setMessage(data.error?.message ?? "导出失败");
      }
    } catch {
      setFailed(true);
      setMessage("网络错误");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" className={btnSecondary} onClick={run} disabled={busy}>
        {busy ? "导出中…" : "导出展示数据"}
      </button>
      {message ? (
        <span className={`text-sm ${failed ? "text-red-600" : "text-emerald-700"}`}>{message}</span>
      ) : null}
    </span>
  );
}
