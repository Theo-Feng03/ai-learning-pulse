import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, aiStatusTone, Card } from "@/components/ui";
import { prisma } from "@/lib/db/client";
import { getEnv } from "@/lib/env";
import { AI_STATUS_LABELS, parseTopics } from "@/lib/format";
import { ArticleActions } from "./ArticleActions";
import { ArticleContent } from "./ArticleContent";

export const dynamic = "force-dynamic";

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = await prisma.article.findUnique({
    where: { id },
    include: {
      source: true,
      analysis: true,
      learningEntry: { select: { id: true, status: true } },
      storyGroup: {
        include: {
          articles: { select: { id: true, title: true, source: { select: { name: true } } } },
        },
      },
    },
  });
  if (!article) notFound();

  const modelConfigured = getEnv().modelConfigured;
  const canRetry = modelConfigured && article.aiStatus !== "analyzed";

  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/inbox" className="text-sm text-stone-500 hover:underline">
        ← 返回收件箱
      </Link>

      <ArticleContent
        articleId={article.id}
        title={article.title}
        excerpt={article.excerpt}
        language={article.language}
        sourceName={article.source.name}
        author={article.author}
        publishedAt={article.publishedAt?.toISOString() ?? null}
        originalUrl={article.originalUrl}
        modelConfigured={modelConfigured}
      />

      <Card
        title={
          <span className="flex items-center gap-2">
            AI 参考（机器生成，仅供筛选）
            <Badge tone={aiStatusTone(article.aiStatus)}>
              {AI_STATUS_LABELS[article.aiStatus] ?? article.aiStatus}
            </Badge>
          </span>
        }
      >
        {article.analysis ? (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="purple">相关性 {article.analysis.relevanceScore}</Badge>
              <Badge tone="blue">{article.analysis.category}</Badge>
              {parseTopics(article.analysis.topics).map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
              <Badge>置信度 {article.analysis.confidence.toFixed(2)}</Badge>
              {article.analysis.insufficientContent ? <Badge tone="amber">信息不足</Badge> : null}
            </div>
            <p>
              <span className="font-medium">AI 摘要：</span>
              {article.analysis.summaryZh}
            </p>
            <p>
              <span className="font-medium">为什么值得关注：</span>
              {article.analysis.whyItMatters}
            </p>
            <p className="text-xs text-stone-400">
              {article.analysis.provider}/{article.analysis.modelName}｜prompt{" "}
              {article.analysis.promptVersion}
            </p>
          </div>
        ) : article.aiStatus === "not_configured" ? (
          <p className="text-sm text-stone-500">
            no_ai 模式：未配置模型。你仍可以直接保存学习草稿并手工选择主题。
          </p>
        ) : article.aiStatus === "analyze_failed" ? (
          <p className="text-sm text-red-600">AI 分析失败，可点击下方“重试 AI 分析”。</p>
        ) : (
          <p className="text-sm text-stone-500">尚未分析。</p>
        )}
      </Card>

      {article.storyGroup && article.storyGroup.articles.length > 1 ? (
        <Card title={`同一事件（多源 ${article.storyGroup.articles.length}）`}>
          <ul className="space-y-1 text-sm">
            {article.storyGroup.articles.map((a) => (
              <li key={a.id}>
                {a.id === article.id ? (
                  <span className="text-stone-400">{a.title}（当前）</span>
                ) : (
                  <Link href={`/articles/${a.id}`} className="hover:underline">
                    {a.title}
                  </Link>
                )}
                <span className="text-xs text-stone-400">｜{a.source.name}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <ArticleActions
        articleId={article.id}
        learningEntryId={article.learningEntry?.id ?? null}
        canRetryAnalyze={canRetry}
      />
    </div>
  );
}
