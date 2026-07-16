"use client";

import { useEffect, useState } from "react";
import { Badge, btnPrimary, btnSecondary, Card, inputCls, labelCls } from "@/components/ui";

interface SettingsData {
  settings: {
    titleSimilarityThreshold: number;
    aiMaxPerRun: number;
    autoExportOnPublish: boolean;
  };
  model: { configured: boolean; modelName: string | null; hasApiKey: boolean };
  exportDir: string;
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [threshold, setThreshold] = useState("0.85");
  const [maxPerRun, setMaxPerRun] = useState("30");
  const [autoExport, setAutoExport] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d: SettingsData) => {
        setData(d);
        setThreshold(String(d.settings.titleSimilarityThreshold));
        setMaxPerRun(String(d.settings.aiMaxPerRun));
        setAutoExport(d.settings.autoExportOnPublish);
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          titleSimilarityThreshold: Number(threshold),
          aiMaxPerRun: Number(maxPerRun),
          autoExportOnPublish: autoExport,
        }),
      });
      const d = await res.json();
      setMessage(res.ok ? "已保存" : (d.error?.message ?? "保存失败"));
    } finally {
      setBusy(false);
    }
  };

  const testModel = async () => {
    setBusy(true);
    setTestMessage(null);
    try {
      const res = await fetch("/api/settings", { method: "POST" });
      const d = await res.json();
      setTestMessage(d.ok ? `连接正常：${d.message ?? ""}` : `连接失败：${d.message ?? ""}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">设置</h1>

      <Card title="模型配置状态（密钥只存于 .env，不在此处显示或修改）">
        {data ? (
          <div className="space-y-2 text-sm">
            <p>
              状态：
              {data.model.configured ? (
                <Badge tone="green">已配置（{data.model.modelName}）</Badge>
              ) : (
                <Badge tone="amber">no_ai 模式（未配置）</Badge>
              )}
            </p>
            <p>
              API Key：{data.model.hasApiKey ? "已设置" : "未设置（Ollama 等本地模型可不设置）"}
            </p>
            <p className="text-xs text-stone-500">
              修改模型：编辑 .env 中的 MODEL_BASE_URL / MODEL_API_KEY / MODEL_NAME 并重启应用。
            </p>
            <button type="button" className={btnSecondary} onClick={testModel} disabled={busy}>
              测试模型连接
            </button>
            {testMessage ? <p className="text-sm">{testMessage}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-stone-500">加载中…</p>
        )}
      </Card>

      <Card title="非敏感配置">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="set-threshold" className={labelCls}>
              标题相似度阈值（0.5 - 1，默认 0.85）
            </label>
            <input id="set-threshold" type="number" step="0.01" min="0.5" max="1"
              className={inputCls} value={threshold}
              onChange={(e) => setThreshold(e.target.value)} />
          </div>
          <div>
            <label htmlFor="set-max" className={labelCls}>单次运行最大 AI 处理条数</label>
            <input id="set-max" type="number" min="1" max="500" className={inputCls}
              value={maxPerRun} onChange={(e) => setMaxPerRun(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={autoExport}
                onChange={(e) => setAutoExport(e.target.checked)} />
              发布学习记录后自动重新导出 showcase.json
            </label>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button type="button" className={btnPrimary} onClick={save} disabled={busy}>
            保存配置
          </button>
          {message ? <span className="text-sm text-stone-600">{message}</span> : null}
        </div>
      </Card>

      <Card title="导出">
        <p className="text-sm text-stone-600">
          导出目录：<code className="rounded bg-stone-100 px-1">{data?.exportDir ?? "exports"}</code>
          （相对项目根目录，可通过 EXPORT_DIR 环境变量修改）
        </p>
      </Card>
    </div>
  );
}
