import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api/errors";
import { testFetchSource } from "@/lib/sources";
import { AdapterError } from "@/lib/sources/types";
import { SOURCE_TYPES } from "@/types/domain";

const testSchema = z.object({
  type: z.enum(SOURCE_TYPES),
  url: z.string().min(1).max(2000),
});

export async function POST(req: NextRequest) {
  try {
    const body = testSchema.parse(await req.json());
    try {
      const sampleItems = await testFetchSource({ type: body.type, url: body.url });
      return NextResponse.json({ success: true, sampleItems });
    } catch (err) {
      // 测试失败不算接口错误：返回错误码供表单展示
      const code = err instanceof AdapterError ? err.code : "source_fetch_error";
      const message = err instanceof Error ? err.message.slice(0, 300) : "抓取失败";
      return NextResponse.json({ success: false, error: { code, message } });
    }
  } catch (err) {
    return handleApiError(err);
  }
}
