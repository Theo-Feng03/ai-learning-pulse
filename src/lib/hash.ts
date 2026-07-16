import { createHash } from "node:crypto";

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Article.contentHash：标题 + 摘要 + 正文 */
export function contentHashOf(title: string, excerpt?: string | null, content?: string | null) {
  return sha256([title, excerpt ?? "", content ?? ""].join("\n---\n"));
}

/** AIAnalysis.inputHash：内容 + prompt 版本 + 模型名，用于缓存命中 */
export function analysisInputHash(contentHash: string, promptVersion: string, modelName: string) {
  return sha256([contentHash, promptVersion, modelName].join("|"));
}
