"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, btnDanger, btnPrimary, btnSecondary, Card, inputCls, labelCls } from "@/components/ui";
import { formatDateTime, SOURCE_STATUS_LABELS } from "@/lib/format";

interface SourceRow {
  id: string;
  name: string;
  type: string;
  url: string;
  publicName: string | null;
  exportAllowed: boolean;
  enabled: boolean;
  status: string;
  failureCount: number;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
  _count: { articles: number };
}

const EMPTY_FORM = {
  name: "",
  type: "RSS",
  url: "",
  publicName: "",
  exportAllowed: false,
};

export default function SourcesPage() {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/sources");
    const data = await res.json();
    if (res.ok) setSources(data.sources);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const testFetch = async () => {
    setBusy(true);
    setTestResult(null);
    setError(null);
    try {
      const res = await fetch("/api/sources/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: form.type, url: form.url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "测试请求失败");
      } else if (data.success) {
        setTestResult(
          `测试成功，最近条目：\n${data.sampleItems.map((i: { title: string }) => `· ${i.title}`).join("\n")}`,
        );
      } else {
        setError(`测试失败（${data.error.code}）：${data.error.message}。仍可保存为停用状态。`);
      }
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        type: form.type,
        url: form.url,
        publicName: form.publicName || null,
        exportAllowed: form.exportAllowed,
      };
      const res = editingId
        ? await fetch(`/api/sources/${editingId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...payload, type: undefined }),
          })
        : await fetch("/api/sources", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok) {
        setError(`${data.error?.code ?? "error"}：${data.error?.message ?? "保存失败"}`);
        return;
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      setTestResult(null);
      void load();
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async (source: SourceRow) => {
    await fetch(`/api/sources/${source.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !source.enabled }),
    });
    void load();
  };

  const remove = async (source: SourceRow) => {
    if (!window.confirm(`删除信源「${source.name}」及其 ${source._count.articles} 篇文章？`)) return;
    await fetch(`/api/sources/${source.id}`, { method: "DELETE" });
    void load();
  };

  const startEdit = (source: SourceRow) => {
    setEditingId(source.id);
    setForm({
      name: source.name,
      type: source.type,
      url: source.url,
      publicName: source.publicName ?? "",
      exportAllowed: source.exportAllowed,
    });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">信源管理</h1>

      <Card title={editingId ? "编辑信源" : "新增信源"}>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="s-name" className={labelCls}>名称 *</label>
            <input id="s-name" className={inputCls} value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="s-type" className={labelCls}>类型 *</label>
            <select id="s-type" className={inputCls} value={form.type} disabled={editingId !== null}
              onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="RSS">RSS</option>
              <option value="ATOM">Atom</option>
              <option value="GITHUB_RELEASE">GitHub Release</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="s-url" className={labelCls}>
              URL *{form.type === "GITHUB_RELEASE" ? "（支持 owner/repo 或仓库地址）" : "（http/https）"}
            </label>
            <input id="s-url" className={inputCls} value={form.url}
              placeholder={form.type === "GITHUB_RELEASE" ? "ollama/ollama" : "https://example.com/feed.xml"}
              onChange={(e) => setForm({ ...form, url: e.target.value })} />
          </div>
          <div>
            <label htmlFor="s-public" className={labelCls}>公开显示名（导出用，留空表示私有）</label>
            <input id="s-public" className={inputCls} value={form.publicName}
              onChange={(e) => setForm({ ...form, publicName: e.target.value })} />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.exportAllowed}
                onChange={(e) => setForm({ ...form, exportAllowed: e.target.checked })} />
              允许导出该信源名称
            </label>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={btnSecondary} onClick={testFetch}
            disabled={busy || !form.url}>
            测试抓取
          </button>
          <button type="button" className={btnPrimary} onClick={submit}
            disabled={busy || !form.name || !form.url}>
            {editingId ? "保存修改" : "保存信源"}
          </button>
          {editingId ? (
            <button type="button" className={btnSecondary}
              onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}>
              取消编辑
            </button>
          ) : null}
        </div>
        {testResult ? (
          <pre className="mt-3 whitespace-pre-wrap rounded bg-emerald-50 p-2 text-xs text-emerald-800">{testResult}</pre>
        ) : null}
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </Card>

      <Card title={`信源列表（${sources.length}）`}>
        {sources.length === 0 ? (
          <p className="text-sm text-stone-500">还没有信源。运行 pnpm seed:demo 写入演示信源，或在上方新增。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
                  <th className="py-2 pr-3">名称</th>
                  <th className="py-2 pr-3">类型</th>
                  <th className="py-2 pr-3">状态</th>
                  <th className="py-2 pr-3">最后成功</th>
                  <th className="py-2 pr-3">连续失败</th>
                  <th className="py-2 pr-3">文章数</th>
                  <th className="py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id} className="border-b border-stone-100 align-top">
                    <td className="py-2 pr-3">
                      <p className="font-medium">{s.name}</p>
                      <p className="max-w-60 truncate text-xs text-stone-400" title={s.url}>{s.url}</p>
                    </td>
                    <td className="py-2 pr-3">{s.type}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={s.status === "active" ? "green" : s.status === "degraded" ? "red" : "gray"}>
                        {SOURCE_STATUS_LABELS[s.status] ?? s.status}
                      </Badge>
                      {s.lastErrorCode ? (
                        <p className="mt-0.5 text-xs text-red-600">{s.lastErrorCode}</p>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-xs">{formatDateTime(s.lastSuccessAt)}</td>
                    <td className="py-2 pr-3">{s.failureCount}</td>
                    <td className="py-2 pr-3">{s._count.articles}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" className={btnSecondary} onClick={() => startEdit(s)}>
                          编辑
                        </button>
                        <button type="button" className={btnSecondary} onClick={() => toggleEnabled(s)}>
                          {s.enabled ? "停用" : "启用"}
                        </button>
                        <button type="button" className={btnDanger} onClick={() => remove(s)}>
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
