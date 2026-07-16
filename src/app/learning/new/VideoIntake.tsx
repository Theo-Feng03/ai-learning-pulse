"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { btnPrimary, btnSecondary, Card, inputCls, labelCls } from "@/components/ui";

const STATUS_LABELS: Record<string, string> = {
  pending: "排队中…",
  downloading: "抽取音频中…",
  transcribing: "本地转写口播稿中（几分钟内，取决于视频长度）…",
  creating: "创建学习草稿…",
  analyzing: "AI 分析中…",
  done: "完成",
  failed: "失败",
};

export function VideoIntake() {
  const router = useRouter();
  const [mode, setMode] = useState<"link" | "file">("link");
  const [url, setUrl] = useState("");
  const [originalUrl, setOriginalUrl] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!jobId) return;
    timerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/learning/video/${jobId}`);
        if (!res.ok) return;
        const { job } = await res.json();
        setStatus(job.status);
        setMessage(job.message);
        if (job.status === "done" && job.entryId) {
          if (timerRef.current) clearInterval(timerRef.current);
          router.push(`/learning/${job.entryId}`);
        }
        if (job.status === "failed") {
          if (timerRef.current) clearInterval(timerRef.current);
          setJobId(null);
          setBusy(false);
          setError(job.message ?? "处理失败");
        }
      } catch {
        // 轮询失败下次重试
      }
    }, 2000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [jobId, router]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    setMessage(null);
    try {
      let res: Response;
      if (mode === "link") {
        res = await fetch("/api/learning/video", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url, title: title || undefined }),
        });
      } else {
        if (!file) return;
        const form = new FormData();
        form.set("file", file);
        form.set("originalUrl", originalUrl);
        if (title) form.set("title", title);
        res = await fetch("/api/learning/video", { method: "POST", body: form });
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "创建任务失败");
        setBusy(false);
        return;
      }
      setJobId(data.jobId);
      setStatus("pending");
    } catch {
      setError("网络错误");
      setBusy(false);
    }
  };

  const running = jobId !== null;

  return (
    <Card title="🎬 视频转学习草稿（本地转写，音频用完即删）">
      <div className="mb-3 flex gap-2 text-sm">
        <button type="button"
          className={mode === "link" ? btnPrimary : btnSecondary}
          onClick={() => setMode("link")} disabled={running}>
          贴视频链接
        </button>
        <button type="button"
          className={mode === "file" ? btnPrimary : btnSecondary}
          onClick={() => setMode("file")} disabled={running}>
          上传视频/音频文件
        </button>
      </div>

      {mode === "link" ? (
        <div className="space-y-3">
          <div>
            <label htmlFor="v-url" className={labelCls}>
              视频链接 *（B 站 / YouTube / TikTok 稳定；抖音尽力直连，失败请改用文件模式）
            </label>
            <input id="v-url" className={inputCls} value={url}
              placeholder="https://www.bilibili.com/video/…"
              onChange={(e) => setUrl(e.target.value)} disabled={running} />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="rounded bg-stone-50 px-2.5 py-1.5 text-xs text-stone-500">
            抖音路线：用手机小程序（如「下载视频提取」）把视频存到相册 → AirDrop 到这台 Mac → 在这里上传。
          </p>
          <div>
            <label htmlFor="v-file" className={labelCls}>视频/音频文件 *（≤800MB）</label>
            <input id="v-file" type="file" accept="video/*,audio/*" className={inputCls}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={running} />
          </div>
          <div>
            <label htmlFor="v-origin" className={labelCls}>
              原视频链接 *（抖音分享链接即可——保证学习记录来源可追溯）
            </label>
            <input id="v-origin" className={inputCls} value={originalUrl}
              placeholder="https://v.douyin.com/…"
              onChange={(e) => setOriginalUrl(e.target.value)} disabled={running} />
          </div>
        </div>
      )}

      <div className="mt-3">
        <label htmlFor="v-title" className={labelCls}>标题（可选，链接模式会自动获取）</label>
        <input id="v-title" className={inputCls} value={title}
          onChange={(e) => setTitle(e.target.value)} disabled={running} />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button type="button" className={btnPrimary} onClick={submit}
          disabled={busy || running || (mode === "link" ? !url.trim() : !file || !originalUrl.trim())}>
          {running ? "处理中…" : "开始转写"}
        </button>
        {status ? (
          <span className="text-sm text-stone-600">
            {STATUS_LABELS[status] ?? status}
            {message && status !== "failed" ? `（${message}）` : ""}
          </span>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      <p className="mt-3 text-xs text-stone-400">
        流程：抽音频 → 本地 Whisper 转口播稿 → 删除音频 → 生成草稿（口播稿存本地、永不导出）→
        AI 摘要（如已配模型）。完成后自动跳到编辑页写你的学习结论。
      </p>
    </Card>
  );
}
