"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { RUN_STATUS_LABELS } from "@/lib/format";
import { btnPrimary } from "./ui";

const TERMINAL = new Set(["completed", "partial_failed", "failed", "failed_stale"]);

export function IngestButton() {
  const router = useRouter();
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  useEffect(() => {
    if (!runId) return;
    timerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${runId}`);
        if (!res.ok) return;
        const data = await res.json();
        setStatus(data.run.status);
        if (TERMINAL.has(data.run.status)) {
          stopPolling();
          setRunId(null);
          router.refresh();
        }
      } catch {
        // 轮询失败忽略，下次重试
      }
    }, 2000);
    return stopPolling;
  }, [runId, router, stopPolling]);

  const start = async () => {
    setError(null);
    setStatus("created");
    try {
      const res = await fetch("/api/runs/ingest", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "创建采集任务失败");
        setStatus(null);
        return;
      }
      setRunId(data.runId);
    } catch {
      setError("网络错误");
      setStatus(null);
    }
  };

  const running = runId !== null || (status !== null && !TERMINAL.has(status));

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" className={btnPrimary} onClick={start} disabled={running}>
        {running ? `采集中（${RUN_STATUS_LABELS[status ?? "created"] ?? status}）…` : "开始采集"}
      </button>
      {status && TERMINAL.has(status) ? (
        <span className="text-sm text-stone-600">上次运行：{RUN_STATUS_LABELS[status]}</span>
      ) : null}
      {error ? <span className="text-sm text-red-600">{error}</span> : null}
    </span>
  );
}
