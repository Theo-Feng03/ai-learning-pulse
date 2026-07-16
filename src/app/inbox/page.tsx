"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Badge, aiStatusTone, btnSecondary, Card, inputCls } from "@/components/ui";
import { AI_STATUS_LABELS, formatDateTime, parseTopics } from "@/lib/format";

interface ArticleItem {
  id: string;
  title: string;
  publishedAt: string | null;
  excerpt: string | null;
  status: string;
  aiStatus: string;
  source: { id: string; name: string };
  analysis: { relevanceScore: number; titleZh: string | null; topics: string; summaryZh: string } | null;
  learningEntry: { id: string; status: string } | null;
  storyGroup: { _count: { articles: number } } | null;
}

interface SourceOption {
  id: string;
  name: string;
}

function InboxContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<ArticleItem[]>([]);
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);

  const [windowHours, setWindowHours] = useState(searchParams.get("windowHours") ?? "");
  const [sourceId, setSourceId] = useState(searchParams.get("sourceId") ?? "");
  const [aiStatus, setAiStatus] = useState(searchParams.get("aiStatus") ?? "");
  const [learningState, setLearningState] = useState(searchParams.get("learningState") ?? "");
  const [minScore, setMinScore] = useState(searchParams.get("minScore") ?? "");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (windowHours) params.set("windowHours", windowHours);
    if (sourceId) params.set("sourceId", sourceId);
    if (aiStatus) params.set("aiStatus", aiStatus);
    if (learningState) params.set("learningState", learningState);
    if (minScore) params.set("minScore", minScore);
    params.set("page", String(page));
    try {
      const res = await fetch(`/api/articles?${params}`);
      const data = await res.json();
      if (res.ok) {
        setItems(data.items);
        setPagination(data.pagination);
      }
    } finally {
      setLoading(false);
    }
  }, [windowHours, sourceId, aiStatus, learningState, minScore, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetch("/api/sources")
      .then((r) => r.json())
      .then((d) => setSources(d.sources ?? []))
      .catch(() => {});
  }, []);

  const ignore = async (id: string) => {
    await fetch(`/api/articles/${id}/ignore`, { method: "POST" });
    void load();
  };

  const saveDraft = async (id: string) => {
    const res = await fetch(`/api/articles/${id}/learning`, { method: "POST" });
    const data = await res.json();
    if (res.ok) router.push(`/learning/${data.learningEntryId}`);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">资讯收件箱</h1>

      <Card>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div>
            <label htmlFor="f-window" className="mb-1 block text-xs text-stone-500">时间</label>
            <select id="f-window" className={inputCls} value={windowHours}
              onChange={(e) => { setWindowHours(e.target.value); setPage(1); }}>
              <option value="">全部</option>
              <option value="24">24 小时</option>
              <option value="168">7 天</option>
              <option value="720">30 天</option>
            </select>
          </div>
          <div>
            <label htmlFor="f-source" className="mb-1 block text-xs text-stone-500">来源</label>
            <select id="f-source" className={inputCls} value={sourceId}
              onChange={(e) => { setSourceId(e.target.value); setPage(1); }}>
              <option value="">全部</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-ai" className="mb-1 block text-xs text-stone-500">AI 状态</label>
            <select id="f-ai" className={inputCls} value={aiStatus}
              onChange={(e) => { setAiStatus(e.target.value); setPage(1); }}>
              <option value="">全部</option>
              {Object.entries(AI_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-learn" className="mb-1 block text-xs text-stone-500">学习状态</label>
            <select id="f-learn" className={inputCls} value={learningState}
              onChange={(e) => { setLearningState(e.target.value); setPage(1); }}>
              <option value="">全部</option>
              <option value="unprocessed">未处理</option>
              <option value="ignored">已忽略</option>
              <option value="drafted">已有草稿</option>
            </select>
          </div>
          <div>
            <label htmlFor="f-score" className="mb-1 block text-xs text-stone-500">最低分数</label>
            <input id="f-score" type="number" min={0} max={100} className={inputCls}
              value={minScore} placeholder="0"
              onChange={(e) => { setMinScore(e.target.value); setPage(1); }} />
          </div>
        </div>
      </Card>

      {loading ? (
        <p className="text-sm text-stone-500">加载中…</p>
      ) : items.length === 0 ? (
        <Card>
          <p className="text-sm text-stone-500">
            没有匹配的资讯。先在<Link href="/sources" className="underline">信源管理</Link>添加信源，
            然后在总览页点击“开始采集”。
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border border-stone-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/articles/${item.id}`} className="font-medium hover:underline">
                    {item.analysis?.titleZh ?? item.title}
                  </Link>
                  {item.analysis?.titleZh ? (
                    <p className="mt-0.5 truncate text-xs text-stone-400" title={item.title}>
                      原题：{item.title}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-stone-400">
                    {item.source.name}｜{formatDateTime(item.publishedAt)}
                    {item.storyGroup && item.storyGroup._count.articles > 1
                      ? `｜多源 ${item.storyGroup._count.articles}`
                      : ""}
                  </p>
                  {item.analysis ? (
                    <p className="mt-1 line-clamp-2 text-sm text-stone-600">
                      {item.analysis.summaryZh}
                    </p>
                  ) : item.excerpt ? (
                    <p className="mt-1 line-clamp-2 text-sm text-stone-600">{item.excerpt}</p>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone={aiStatusTone(item.aiStatus)}>
                      {AI_STATUS_LABELS[item.aiStatus] ?? item.aiStatus}
                    </Badge>
                    {item.analysis ? <Badge tone="purple">分数 {item.analysis.relevanceScore}</Badge> : null}
                    {item.analysis
                      ? parseTopics(item.analysis.topics).map((t) => <Badge key={t}>{t}</Badge>)
                      : null}
                    {item.status === "ignored" ? <Badge tone="amber">已忽略</Badge> : null}
                    {item.learningEntry ? <Badge tone="green">已有草稿</Badge> : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  {item.learningEntry ? (
                    <Link href={`/learning/${item.learningEntry.id}`} className={btnSecondary}>
                      打开草稿
                    </Link>
                  ) : (
                    <button type="button" className={btnSecondary} onClick={() => saveDraft(item.id)}>
                      保存为学习记录
                    </button>
                  )}
                  {!item.learningEntry ? (
                    <button type="button" className={btnSecondary} onClick={() => ignore(item.id)}>
                      {item.status === "ignored" ? "取消忽略" : "忽略"}
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pagination.pages > 1 ? (
        <div className="flex items-center gap-3 text-sm">
          <button type="button" className={btnSecondary} disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}>
            上一页
          </button>
          <span>
            {pagination.page} / {pagination.pages}（共 {pagination.total} 条）
          </span>
          <button type="button" className={btnSecondary} disabled={page >= pagination.pages}
            onClick={() => setPage((p) => p + 1)}>
            下一页
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense fallback={<p className="text-sm text-stone-500">加载中…</p>}>
      <InboxContent />
    </Suspense>
  );
}
