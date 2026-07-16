import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProvider } from "@/lib/ai";
import { handleApiError } from "@/lib/api/errors";
import { getEnv } from "@/lib/env";
import { getSettings, updateSettings } from "@/lib/settings";

const patchSchema = z.object({
  titleSimilarityThreshold: z.number().min(0.5).max(1).optional(),
  aiMaxPerRun: z.number().int().min(1).max(500).optional(),
  autoExportOnPublish: z.boolean().optional(),
});

export async function GET() {
  try {
    const env = getEnv();
    const settings = await getSettings();
    // 只返回状态，不返回任何密钥内容
    return NextResponse.json({
      settings,
      model: {
        configured: env.modelConfigured,
        modelName: env.modelConfigured ? env.MODEL_NAME : null,
        hasApiKey: Boolean(env.MODEL_API_KEY),
      },
      exportDir: env.EXPORT_DIR,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = patchSchema.parse(await req.json());
    const settings = await updateSettings(body);
    return NextResponse.json({ settings });
  } catch (err) {
    return handleApiError(err);
  }
}

// 测试模型连接
export async function POST() {
  try {
    const provider = getProvider();
    if (!provider) {
      return NextResponse.json({ ok: false, message: "未配置模型（no_ai 模式）" });
    }
    const health = await provider.healthCheck();
    return NextResponse.json(health);
  } catch (err) {
    return handleApiError(err);
  }
}
