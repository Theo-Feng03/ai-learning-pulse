import type { SourceType } from "@/types/domain";

/** 抓取到的原始条目（标准化前） */
export interface AdapterItem {
  title: string;
  url: string;
  author?: string;
  publishedAt?: Date;
  excerpt?: string;
  content?: string;
}

/** 抓取所需的最小信源信息（不依赖 Prisma 类型，便于测试） */
export interface SourceInput {
  type: SourceType | string;
  url: string;
  name?: string;
}

export type FetchTextFn = (url: string, timeoutMs: number) => Promise<string>;

export interface FetchContext {
  fetchText: FetchTextFn;
  timeoutMs: number;
}

export type AdapterErrorCode = "source_timeout" | "source_http_error" | "source_parse_error";

export class AdapterError extends Error {
  constructor(
    public code: AdapterErrorCode,
    message: string,
    public retryable = true,
  ) {
    super(message);
  }
}

export interface SourceAdapter {
  /** 将用户输入的 URL（或 owner/repo）转换为实际抓取地址 */
  buildFeedUrl(source: SourceInput): string;
  fetchItems(source: SourceInput, ctx: FetchContext): Promise<AdapterItem[]>;
}
