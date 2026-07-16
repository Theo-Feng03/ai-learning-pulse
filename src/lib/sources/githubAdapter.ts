import { parseFeedXml } from "./rssAdapter";
import {
  AdapterError,
  type AdapterItem,
  type FetchContext,
  type SourceAdapter,
  type SourceInput,
} from "./types";

/**
 * 从用户输入解析 owner/repo。
 * 支持："owner/repo"、"https://github.com/owner/repo"、
 * "https://github.com/owner/repo/releases"、"https://github.com/owner/repo/releases.atom"
 */
export function parseOwnerRepo(input: string): { owner: string; repo: string } {
  const trimmed = input.trim().replace(/\/+$/, "");
  const bare = /^([\w.-]+)\/([\w.-]+)$/.exec(trimmed);
  if (bare) return { owner: bare[1], repo: bare[2] };

  try {
    const url = new URL(trimmed);
    if (url.hostname.toLowerCase() !== "github.com") {
      throw new Error("not github");
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      return { owner: parts[0], repo: parts[1].replace(/\.atom$/, "") };
    }
  } catch {
    // fallthrough
  }
  throw new AdapterError(
    "source_parse_error",
    "GitHub Release 信源需要 owner/repo 或 github.com 仓库地址",
    false,
  );
}

/** GitHub Release Adapter：使用公开的 releases.atom feed，无需 API Token */
export const githubReleaseAdapter: SourceAdapter = {
  buildFeedUrl(source: SourceInput): string {
    const { owner, repo } = parseOwnerRepo(source.url);
    return `https://github.com/${owner}/${repo}/releases.atom`;
  },
  async fetchItems(source: SourceInput, ctx: FetchContext): Promise<AdapterItem[]> {
    const { owner, repo } = parseOwnerRepo(source.url);
    const xml = await ctx.fetchText(this.buildFeedUrl(source), ctx.timeoutMs);
    const items = await parseFeedXml(xml);
    // Release 标题通常只有版本号，补充仓库名便于阅读
    return items.map((item) => ({
      ...item,
      title: item.title.includes(repo) ? item.title : `${owner}/${repo}: ${item.title}`,
    }));
  },
};
