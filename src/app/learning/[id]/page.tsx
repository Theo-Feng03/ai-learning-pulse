"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge, btnDanger, btnPrimary, btnSecondary, Card, entryStatusTone, inputCls, labelCls } from "@/components/ui";
import { ENTRY_STATUS_LABELS, formatDateTime, parseTopics } from "@/lib/format";

interface TopicRow {
  id: string;
  name: string;
}

interface ProjectLinkForm {
  projectName: string;
  projectUrl: string;
  note: string;
  isPublic: boolean;
}

interface EntryData {
  id: string;
  status: string;
  userTakeaway: string;
  whyFollow: string | null;
  impact: string | null;
  confirmedAt: string | null;
  publishedAt: string | null;
  article: {
    id: string;
    title: string;
    originalUrl: string;
    publishedAt: string | null;
    source: { name: string };
    analysis: {
      summaryZh: string;
      whyItMatters: string;
      confidence: number;
      topics: string;
      insufficientContent: boolean;
    } | null;
  };
  topics: Array<{ topicId: string; topic: TopicRow }>;
  projectLinks: Array<{
    projectName: string;
    projectUrl: string;
    note: string | null;
    isPublic: boolean;
  }>;
}

export default function LearningEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [entry, setEntry] = useState<EntryData | null>(null);
  const [allTopics, setAllTopics] = useState<TopicRow[]>([]);
  const [takeaway, setTakeaway] = useState("");
  const [whyFollow, setWhyFollow] = useState("");
  const [impact, setImpact] = useState("");
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [links, setLinks] = useState<ProjectLinkForm[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const applyEntry = useCallback((data: EntryData) => {
    setEntry(data);
    setTakeaway(data.userTakeaway);
    setWhyFollow(data.whyFollow ?? "");
    setImpact(data.impact ?? "");
    setSelectedTopicIds(data.topics.map((t) => t.topicId));
    setLinks(
      data.projectLinks.map((l) => ({
        projectName: l.projectName,
        projectUrl: l.projectUrl,
        note: l.note ?? "",
        isPublic: l.isPublic,
      })),
    );
    setDirty(false);
  }, []);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/learning/${id}`)
      .then((r) => r.json())
      .then((d) => (d.entry ? applyEntry(d.entry) : setMessage(d.error?.message ?? "加载失败")))
      .catch(() => setMessage("加载失败"));
    fetch("/api/topics")
      .then((r) => r.json())
      .then((d) => setAllTopics(d.topics ?? []))
      .catch(() => {});
  }, [id, applyEntry]);

  const save = async (): Promise<boolean> => {
    setBusy(true);
    setMessage(null);
    setErrors([]);
    try {
      const res = await fetch(`/api/learning/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userTakeaway: takeaway,
          whyFollow: whyFollow || null,
          impact: impact || null,
          topicIds: selectedTopicIds,
          projectLinks: links
            .filter((l) => l.projectName && l.projectUrl)
            .map((l) => ({ ...l, note: l.note || null })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors([data.error?.message ?? "保存失败"]);
        return false;
      }
      applyEntry(data.entry);
      setMessage(
        data.revertedToDraft
          ? "已保存。核心内容被修改，状态已回到草稿，需要重新确认与发布。"
          : "已保存草稿。",
      );
      return true;
    } finally {
      setBusy(false);
    }
  };

  const action = async (path: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    // 先保存再执行状态操作，避免未保存内容参与校验
    if (dirty) {
      const ok = await save();
      if (!ok) return;
    }
    setBusy(true);
    setMessage(null);
    setErrors([]);
    try {
      const res = await fetch(`/api/learning/${id}/${path}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        const issues = data.error?.details?.issues as Array<{ message: string }> | undefined;
        setErrors(issues ? issues.map((i) => i.message) : [data.error?.message ?? "操作失败"]);
        return;
      }
      const refreshed = await fetch(`/api/learning/${id}`).then((r) => r.json());
      if (refreshed.entry) applyEntry(refreshed.entry);
      if (path === "publish") {
        setMessage(
          data.autoExported
            ? "已发布，并已自动重新导出 showcase.json。"
            : "已发布。提示：导出数据尚未更新，可在总览页点击“导出展示数据”。",
        );
      } else {
        setMessage("操作成功。");
      }
    } finally {
      setBusy(false);
    }
  };

  if (!entry) {
    return <p className="text-sm text-stone-500">{message ?? "加载中…"}</p>;
  }

  const aiTopicSuggestions = entry.article.analysis
    ? parseTopics(entry.article.analysis.topics)
    : [];

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/learning" className="text-sm text-stone-500 hover:underline">
          ← 返回学习时间线
        </Link>
        <Badge tone={entryStatusTone(entry.status)}>
          {ENTRY_STATUS_LABELS[entry.status] ?? entry.status}
        </Badge>
      </div>

      {/* AI 参考区：只读 */}
      <Card title="AI 参考（机器生成，不代表我的观点）" className="border-sky-200 bg-sky-50/40">
        <p className="text-sm font-medium">{entry.article.title}</p>
        <p className="mt-0.5 text-xs text-stone-500">
          {entry.article.source.name}｜{formatDateTime(entry.article.publishedAt)}｜
          <a href={entry.article.originalUrl} target="_blank" rel="noreferrer" className="underline">
            打开原文 ↗
          </a>
        </p>
        {entry.article.analysis ? (
          <div className="mt-2 space-y-1.5 text-sm text-stone-700">
            <p>
              <span className="font-medium">AI 摘要：</span>
              {entry.article.analysis.summaryZh}
            </p>
            <p>
              <span className="font-medium">为什么值得关注：</span>
              {entry.article.analysis.whyItMatters}
            </p>
            <p className="text-xs text-stone-500">
              置信度 {entry.article.analysis.confidence.toFixed(2)}
              {entry.article.analysis.insufficientContent ? "｜信息不足" : ""}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-stone-500">无 AI 分析（no_ai 模式或分析失败）。</p>
        )}
      </Card>

      {/* 作者输入区 */}
      <Card title="我的记录（本人填写）" className="border-emerald-200">
        <div className="space-y-3">
          <div>
            <label htmlFor="takeaway" className={labelCls}>
              我的学习结论 *（至少 10 个字符；创建时为空，不会用 AI 内容预填）
            </label>
            <textarea id="takeaway" rows={4} className={inputCls} value={takeaway}
              onChange={(e) => { setTakeaway(e.target.value); setDirty(true); }}
              placeholder="用自己的话写下从这条资讯中学到了什么" />
          </div>
          <div>
            <label htmlFor="whyFollow" className={labelCls}>为什么关注（可选）</label>
            <textarea id="whyFollow" rows={2} className={inputCls} value={whyFollow}
              onChange={(e) => { setWhyFollow(e.target.value); setDirty(true); }} />
          </div>
          <div>
            <label htmlFor="impact" className={labelCls}>对我的影响（可选）</label>
            <textarea id="impact" rows={2} className={inputCls} value={impact}
              onChange={(e) => { setImpact(e.target.value); setDirty(true); }} />
          </div>

          <fieldset>
            <legend className={labelCls}>主题 *（必须本人选择，AI 建议仅供参考）</legend>
            {aiTopicSuggestions.length > 0 ? (
              <p className="mb-1.5 text-xs text-stone-500">
                AI 建议：{aiTopicSuggestions.join("、")}（点击下方对应主题采纳）
              </p>
            ) : null}
            <div className="flex flex-wrap gap-1.5">
              {allTopics.map((topic) => {
                const selected = selectedTopicIds.includes(topic.id);
                return (
                  <button
                    key={topic.id}
                    type="button"
                    aria-pressed={selected}
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      selected
                        ? "border-stone-800 bg-stone-800 text-white"
                        : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
                    }`}
                    onClick={() => {
                      setSelectedTopicIds((prev) =>
                        selected ? prev.filter((t) => t !== topic.id) : [...prev, topic.id],
                      );
                      setDirty(true);
                    }}
                  >
                    {topic.name}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className={labelCls}>关联项目（可选；仅“公开”项目会被导出）</legend>
            {links.map((link, i) => (
              <div key={i} className="mb-2 grid gap-2 rounded border border-stone-200 p-2 md:grid-cols-2">
                <input aria-label={`项目名称 ${i + 1}`} className={inputCls} placeholder="项目名称"
                  value={link.projectName}
                  onChange={(e) => {
                    setLinks(links.map((l, j) => (j === i ? { ...l, projectName: e.target.value } : l)));
                    setDirty(true);
                  }} />
                <input aria-label={`项目链接 ${i + 1}`} className={inputCls} placeholder="https://…"
                  value={link.projectUrl}
                  onChange={(e) => {
                    setLinks(links.map((l, j) => (j === i ? { ...l, projectUrl: e.target.value } : l)));
                    setDirty(true);
                  }} />
                <input aria-label={`备注 ${i + 1}`} className={inputCls} placeholder="备注（可选）"
                  value={link.note}
                  onChange={(e) => {
                    setLinks(links.map((l, j) => (j === i ? { ...l, note: e.target.value } : l)));
                    setDirty(true);
                  }} />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={link.isPublic}
                      onChange={(e) => {
                        setLinks(links.map((l, j) => (j === i ? { ...l, isPublic: e.target.checked } : l)));
                        setDirty(true);
                      }} />
                    公开（进入导出）
                  </label>
                  <button type="button" className="text-xs text-red-600 underline"
                    onClick={() => { setLinks(links.filter((_, j) => j !== i)); setDirty(true); }}>
                    删除
                  </button>
                </div>
              </div>
            ))}
            <button type="button" className={btnSecondary}
              onClick={() =>
                setLinks([...links, { projectName: "", projectUrl: "", note: "", isPublic: false }])
              }>
              + 添加项目关联
            </button>
          </fieldset>
        </div>
      </Card>

      {errors.length > 0 ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      ) : null}
      {message ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnSecondary} onClick={save} disabled={busy}>
          保存草稿
        </button>
        {entry.status === "draft" ? (
          <button type="button" className={btnPrimary} onClick={() => action("confirm")} disabled={busy}>
            确认已学习
          </button>
        ) : null}
        {entry.status === "confirmed" ? (
          <button type="button" className={btnPrimary} onClick={() => action("publish")} disabled={busy}>
            发布到主页
          </button>
        ) : null}
        {entry.status === "published" ? (
          <button type="button" className={btnSecondary}
            onClick={() => action("unpublish", "撤回后该记录将退出公开统计与下一次导出，确定？")}
            disabled={busy}>
            撤回发布
          </button>
        ) : null}
        {entry.status === "archived" ? (
          <button type="button" className={btnPrimary} onClick={() => action("restore")} disabled={busy}>
            恢复记录
          </button>
        ) : (
          <button type="button" className={btnDanger}
            onClick={() => action("archive", "归档后记录不再出现在公开展示中，确定？")} disabled={busy}>
            归档
          </button>
        )}
      </div>
      <p className="text-xs text-stone-400">
        状态流：草稿 → 确认已学习 → 发布到主页。只有已发布记录进入热力图、主题统计和 showcase.json。
        修改已确认/已发布记录的结论或主题会回到草稿。
      </p>
    </div>
  );
}
