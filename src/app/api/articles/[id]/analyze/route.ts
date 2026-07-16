import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/ai";
import { analyzeArticles } from "@/lib/ai/analyzeArticles";
import { ApiError, handleApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/client";

// 单篇重试 AI 分析
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const article = await prisma.article.findUnique({ where: { id } });
    if (!article) throw new ApiError("not_found", "文章不存在", 404);

    const provider = getProvider();
    if (!provider) {
      throw new ApiError("model_not_configured", "未配置模型（no_ai 模式），无法执行 AI 分析", 409);
    }

    // 重试时强制重新分析：清空旧结果的缓存命中（inputHash 相同也重算）
    await prisma.aIAnalysis.deleteMany({ where: { articleId: id } });
    const result = await analyzeArticles([id], provider, { maxPerRun: 1 });

    const updated = await prisma.article.findUnique({
      where: { id },
      include: { analysis: true },
    });
    return NextResponse.json({
      status: updated?.aiStatus,
      analysis: updated?.analysis,
      failed: result.aiFailed > 0,
      errors: result.errors,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
