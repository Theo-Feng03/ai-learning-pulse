// 示例数据：pnpm seed:demo（可重复执行，使用 upsert 幂等）
// 所有内容均为虚构演示数据，不包含真实抓取结果。
import { prisma } from "../src/lib/db/client";
import { canonicalizeUrl, normalizeSourceUrl } from "../src/lib/dedup/canonicalUrl";
import { normalizeTitle } from "../src/lib/dedup/titleSimilarity";
import { contentHashOf } from "../src/lib/hash";
import { ALLOWED_TOPICS, PROMPT_VERSION } from "../src/types/domain";

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function seedTopics() {
  const colors = ["#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#6366f1"];
  const topics = [];
  for (const [i, name] of ALLOWED_TOPICS.entries()) {
    topics.push(
      await prisma.topic.upsert({
        where: { slug: slugify(name) },
        create: { name, slug: slugify(name), color: colors[i % colors.length] },
        update: {},
      }),
    );
  }
  return new Map(topics.map((t) => [t.name, t]));
}

async function seedSources() {
  const defs = [
    {
      name: "OpenAI News",
      type: "RSS",
      url: "https://openai.com/news/rss.xml",
      publicName: "OpenAI News",
      exportAllowed: true,
    },
    {
      name: "Hugging Face Blog",
      type: "RSS",
      url: "https://huggingface.co/blog/feed.xml",
      publicName: "Hugging Face Blog",
      exportAllowed: true,
    },
    {
      name: "ollama/ollama Releases",
      type: "GITHUB_RELEASE",
      url: "https://github.com/ollama/ollama",
      publicName: "Ollama Releases",
      exportAllowed: true,
    },
  ] as const;

  const sources = [];
  for (const def of defs) {
    const normalizedUrl = normalizeSourceUrl(def.url, def.type);
    sources.push(
      await prisma.source.upsert({
        where: { normalizedUrl },
        create: {
          name: def.name,
          type: def.type,
          url: def.url,
          normalizedUrl,
          publicName: def.publicName,
          exportAllowed: def.exportAllowed,
          enabled: true,
          status: "active",
          lastSuccessAt: daysAgo(1),
        },
        update: {},
      }),
    );
  }
  return sources;
}

interface DemoArticle {
  sourceIndex: number;
  title: string;
  url: string;
  publishedDaysAgo: number;
  excerpt: string;
  topics: string[];
  category: string;
  relevanceScore: number;
  summaryZh: string;
  whyItMatters: string;
}

const DEMO_ARTICLES: DemoArticle[] = [
  {
    sourceIndex: 0,
    title: "Demo: Introducing structured retrieval for assistants",
    url: "https://example.com/demo/structured-retrieval",
    publishedDaysAgo: 2,
    excerpt: "A demo article about structured retrieval capabilities for AI assistants.",
    topics: ["AI Search"],
    category: "Product",
    relevanceScore: 86,
    summaryZh: "【演示】该文章介绍了一种面向助手场景的结构化检索能力，强调检索结果的可引用性。",
    whyItMatters: "结构化检索与个人知识工作流相关，可能值得关注其对搜索类产品的影响。",
  },
  {
    sourceIndex: 1,
    title: "Demo: Evaluating open models on long-context tasks",
    url: "https://example.com/demo/long-context-eval?utm_source=rss",
    publishedDaysAgo: 4,
    excerpt: "A demo write-up on long-context evaluation methodology for open models.",
    topics: ["Model Evaluation", "Open Source Models"],
    category: "Research",
    relevanceScore: 78,
    summaryZh: "【演示】该文章讨论了开放模型在长上下文任务上的评测方法与常见误区。",
    whyItMatters: "评测方法影响模型选型判断，可能值得关注其提出的基准设计。",
  },
  {
    sourceIndex: 1,
    title: "Demo: Evaluating open models for long context tasks",
    url: "https://example.com/demo/long-context-eval-mirror",
    publishedDaysAgo: 4,
    excerpt: "Mirror demo of the long-context evaluation article from another feed.",
    topics: ["Model Evaluation"],
    category: "Research",
    relevanceScore: 75,
    summaryZh: "【演示】同一事件的另一来源报道，用于演示标题相似聚合。",
    whyItMatters: "多来源覆盖同一事件时，聚合可以减少重复阅读。",
  },
  {
    sourceIndex: 2,
    title: "ollama/ollama: v0.demo.1",
    url: "https://example.com/demo/ollama-release",
    publishedDaysAgo: 7,
    excerpt: "Demo release notes: faster local inference and new model support.",
    topics: ["Inference & Serving", "Developer Tools"],
    category: "DeveloperTool",
    relevanceScore: 70,
    summaryZh: "【演示】该版本改进了本地推理性能并新增模型支持。",
    whyItMatters: "本地推理工具链的更新可能影响离线开发体验。",
  },
  {
    sourceIndex: 0,
    title: "Demo: Weekly community roundup",
    url: "https://example.com/demo/community-roundup",
    publishedDaysAgo: 10,
    excerpt: "",
    topics: ["Other"],
    category: "Community",
    relevanceScore: 30,
    summaryZh: "【演示】社区周报类内容，正文不足。",
    whyItMatters: "常规社区动态，关注价值有限。",
  },
];

async function main() {
  const topicMap = await seedTopics();
  const sources = await seedSources();

  const articles = [];
  for (const demo of DEMO_ARTICLES) {
    const source = sources[demo.sourceIndex];
    const canonicalUrl = canonicalizeUrl(demo.url);
    const article = await prisma.article.upsert({
      where: { canonicalUrl },
      create: {
        sourceId: source.id,
        canonicalUrl,
        originalUrl: demo.url,
        title: demo.title,
        normalizedTitle: normalizeTitle(demo.title),
        publishedAt: daysAgo(demo.publishedDaysAgo),
        excerpt: demo.excerpt || null,
        contentHash: contentHashOf(demo.title, demo.excerpt),
        language: "en",
        status: "analyzed",
        aiStatus: "analyzed",
      },
      update: {},
    });
    articles.push(article);

    await prisma.aIAnalysis.upsert({
      where: { articleId: article.id },
      create: {
        articleId: article.id,
        relevanceScore: demo.relevanceScore,
        category: demo.category,
        topics: JSON.stringify(demo.topics),
        summaryZh: demo.summaryZh,
        whyItMatters: demo.whyItMatters,
        confidence: demo.excerpt ? 0.85 : 0.3,
        insufficientContent: !demo.excerpt,
        provider: "mock",
        modelName: "demo-seed",
        promptVersion: PROMPT_VERSION,
        inputHash: contentHashOf(demo.title, demo.excerpt),
      },
      update: {},
    });
  }

  // 标题相似聚合演示：第 2、3 条属于同一故事组
  const existingGroup = await prisma.storyGroup.findFirst({
    where: { primaryArticleId: articles[1].id },
  });
  const group =
    existingGroup ??
    (await prisma.storyGroup.create({
      data: {
        normalizedTitle: articles[1].normalizedTitle,
        primaryArticleId: articles[1].id,
      },
    }));
  await prisma.article.updateMany({
    where: { id: { in: [articles[1].id, articles[2].id] } },
    data: { storyGroupId: group.id },
  });

  // 学习记录演示：published / confirmed / draft 各一条
  const publishedEntry = await prisma.learningEntry.upsert({
    where: { articleId: articles[0].id },
    create: {
      articleId: articles[0].id,
      status: "published",
      userTakeaway:
        "【演示】结构化检索把引用粒度从网页降到段落，值得在我的搜索项目里试验相同的引用设计。",
      whyFollow: "与我正在做的个人搜索项目直接相关。",
      impact: "计划在下个迭代里给检索结果加上段落级引用。",
      confirmedAt: daysAgo(1),
      publishedAt: daysAgo(1),
    },
    update: {},
  });
  await prisma.article.update({ where: { id: articles[0].id }, data: { status: "saved" } });
  await prisma.learningEntryTopic.upsert({
    where: {
      learningEntryId_topicId: {
        learningEntryId: publishedEntry.id,
        topicId: topicMap.get("AI Search")!.id,
      },
    },
    create: { learningEntryId: publishedEntry.id, topicId: topicMap.get("AI Search")!.id },
    update: {},
  });
  const existingLink = await prisma.projectLink.findFirst({
    where: { learningEntryId: publishedEntry.id },
  });
  if (!existingLink) {
    await prisma.projectLink.create({
      data: {
        learningEntryId: publishedEntry.id,
        projectName: "个人搜索实验（演示）",
        projectUrl: "https://example.com/demo/my-search-project",
        note: "在该项目中试验段落级引用",
        isPublic: true,
      },
    });
  }

  const confirmedEntry = await prisma.learningEntry.upsert({
    where: { articleId: articles[1].id },
    create: {
      articleId: articles[1].id,
      status: "confirmed",
      userTakeaway: "【演示】长上下文评测容易被检索捷径污染，评测集要控制信息位置分布。",
      confirmedAt: daysAgo(3),
    },
    update: {},
  });
  await prisma.article.update({ where: { id: articles[1].id }, data: { status: "saved" } });
  await prisma.learningEntryTopic.upsert({
    where: {
      learningEntryId_topicId: {
        learningEntryId: confirmedEntry.id,
        topicId: topicMap.get("Model Evaluation")!.id,
      },
    },
    create: {
      learningEntryId: confirmedEntry.id,
      topicId: topicMap.get("Model Evaluation")!.id,
    },
    update: {},
  });

  await prisma.learningEntry.upsert({
    where: { articleId: articles[3].id },
    create: { articleId: articles[3].id, status: "draft", userTakeaway: "" },
    update: {},
  });
  await prisma.article.update({ where: { id: articles[3].id }, data: { status: "saved" } });

  // 一条演示采集运行记录
  const existingRun = await prisma.ingestionRun.findFirst({ where: { trigger: "cli" } });
  if (!existingRun) {
    await prisma.ingestionRun.create({
      data: {
        trigger: "cli",
        status: "completed",
        startedAt: daysAgo(1),
        completedAt: daysAgo(1),
        sourceTotal: 3,
        sourceSuccess: 3,
        sourceFailed: 0,
        fetchedCount: 5,
        newCount: 5,
        dedupCount: 0,
        aiSuccess: 5,
        aiFailed: 0,
        aiSkipped: 0,
        durationMs: 4200,
      },
    });
  }

  console.log("[seed] 示例数据写入完成：3 个信源、5 篇文章、3 条学习记录（published/confirmed/draft）");
}

main()
  .catch((err) => {
    console.error("[seed] 失败：", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
