import Parser from "rss-parser";
import {
  AdapterError,
  type AdapterItem,
  type FetchContext,
  type SourceAdapter,
  type SourceInput,
} from "./types";

const MAX_EXCERPT_LENGTH = 500;
const MAX_CONTENT_LENGTH = 20_000;

const parser = new Parser({
  customFields: {
    item: [["content:encoded", "contentEncoded"]],
  },
});

type ParsedItem = {
  title?: string;
  link?: string;
  creator?: string;
  author?: string;
  isoDate?: string;
  pubDate?: string;
  contentSnippet?: string;
  content?: string;
  contentEncoded?: string;
};

function toDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function clip(value: string | undefined, max: number): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export function mapFeedItems(items: ParsedItem[]): AdapterItem[] {
  const result: AdapterItem[] = [];
  for (const item of items) {
    const title = item.title?.trim();
    const url = item.link?.trim();
    if (!title || !url) continue;
    result.push({
      title,
      url,
      author: item.creator?.trim() || item.author?.trim() || undefined,
      publishedAt: toDate(item.isoDate) ?? toDate(item.pubDate),
      excerpt: clip(item.contentSnippet, MAX_EXCERPT_LENGTH),
      content: clip(item.contentEncoded ?? item.content, MAX_CONTENT_LENGTH),
    });
  }
  return result;
}

export async function parseFeedXml(xml: string): Promise<AdapterItem[]> {
  try {
    const feed = await parser.parseString(xml);
    return mapFeedItems((feed.items ?? []) as ParsedItem[]);
  } catch (err) {
    throw new AdapterError(
      "source_parse_error",
      `Feed 解析失败：${err instanceof Error ? err.message.slice(0, 200) : "未知错误"}`,
      false,
    );
  }
}

/** RSS 与 Atom 共用一个 Adapter（rss-parser 同时支持两种格式） */
export const rssAdapter: SourceAdapter = {
  buildFeedUrl(source: SourceInput): string {
    return source.url;
  },
  async fetchItems(source: SourceInput, ctx: FetchContext): Promise<AdapterItem[]> {
    const xml = await ctx.fetchText(this.buildFeedUrl(source), ctx.timeoutMs);
    return parseFeedXml(xml);
  },
};
