import { getEnv } from "@/lib/env";
import { defaultFetchText } from "./fetchText";
import { githubReleaseAdapter } from "./githubAdapter";
import { rssAdapter } from "./rssAdapter";
import type { FetchContext, SourceAdapter, SourceInput } from "./types";

export function getAdapter(type: string): SourceAdapter {
  switch (type) {
    case "RSS":
    case "ATOM":
      return rssAdapter;
    case "GITHUB_RELEASE":
      return githubReleaseAdapter;
    default:
      throw new Error(`未知信源类型：${type}`);
  }
}

export function defaultFetchContext(): FetchContext {
  return { fetchText: defaultFetchText, timeoutMs: getEnv().FETCH_TIMEOUT_MS };
}

/** 测试抓取：返回最近条目标题，供信源表单“测试”按钮使用 */
export async function testFetchSource(source: SourceInput, ctx?: FetchContext) {
  const adapter = getAdapter(String(source.type));
  const items = await adapter.fetchItems(source, ctx ?? defaultFetchContext());
  return items.slice(0, 3).map((i) => ({ title: i.title, url: i.url }));
}
