import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ApiErrorCode =
  | "validation_error"
  | "not_found"
  | "invalid_state"
  | "duplicate"
  | "source_parse_error"
  | "source_timeout"
  | "export_failed"
  | "model_not_configured"
  | "internal_error";

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public status = 400,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export function errorResponse(
  code: ApiErrorCode,
  message: string,
  status = 400,
  details: Record<string, unknown> = {},
) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

/** 统一包装 API handler：Zod 错误 → validation_error，ApiError → 对应状态码 */
export function handleApiError(err: unknown) {
  if (err instanceof ApiError) {
    return errorResponse(err.code, err.message, err.status, err.details);
  }
  if (err instanceof ZodError) {
    return errorResponse("validation_error", "请求参数不合法", 400, {
      issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  // 不向客户端返回堆栈
  console.error("[api] internal error:", err instanceof Error ? err.message : err);
  return errorResponse("internal_error", "服务器内部错误", 500);
}
