import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { githubReleaseAdapter, parseOwnerRepo } from "@/lib/sources/githubAdapter";
import { parseFeedXml, rssAdapter } from "@/lib/sources/rssAdapter";
import { AdapterError, type FetchContext } from "@/lib/sources/types";

const fixture = (name: string) =>
  readFileSync(path.resolve(__dirname, "../fixtures/rss", name), "utf8");

const ctxWith = (xml: string): FetchContext => ({
  fetchText: async () => xml,
  timeoutMs: 1000,
});

describe("RSS/Atom adapter", () => {
  it("解析固定 RSS fixture，跳过缺 link 的条目", async () => {
    const items = await parseFeedXml(fixture("sample-feed.xml"));
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Fixture: New AI model released with longer context");
    expect(items[0].url).toContain("utm_source=rss");
    expect(items[0].author).toBe("Fixture Author");
    expect(items[0].publishedAt).toBeInstanceOf(Date);
    expect(items[0].excerpt).toContain("fixture article");
    expect(items[0].content).toContain("Full fixture body");
  });

  it("通过注入 fetchText 抓取", async () => {
    const items = await rssAdapter.fetchItems(
      { type: "RSS", url: "https://fixture.example.com/feed" },
      ctxWith(fixture("sample-feed.xml")),
    );
    expect(items).toHaveLength(2);
  });

  it("非法 feed 抛出 source_parse_error", async () => {
    await expect(parseFeedXml("this is not xml at all <<<")).rejects.toMatchObject({
      code: "source_parse_error",
    });
  });

  it("超时错误向上传播", async () => {
    const ctx: FetchContext = {
      fetchText: async () => {
        throw new AdapterError("source_timeout", "抓取超时（15000ms）");
      },
      timeoutMs: 1,
    };
    await expect(
      rssAdapter.fetchItems({ type: "RSS", url: "https://x.example.com" }, ctx),
    ).rejects.toMatchObject({ code: "source_timeout" });
  });
});

describe("GitHub Release adapter", () => {
  it("解析 owner/repo 与完整 URL", () => {
    expect(parseOwnerRepo("ollama/ollama")).toEqual({ owner: "ollama", repo: "ollama" });
    expect(parseOwnerRepo("https://github.com/ollama/ollama")).toEqual({
      owner: "ollama",
      repo: "ollama",
    });
    expect(parseOwnerRepo("https://github.com/a/b/releases")).toEqual({ owner: "a", repo: "b" });
    expect(() => parseOwnerRepo("https://gitlab.com/a/b")).toThrow();
  });

  it("构造 releases.atom 抓取地址", () => {
    expect(githubReleaseAdapter.buildFeedUrl({ type: "GITHUB_RELEASE", url: "a/b" })).toBe(
      "https://github.com/a/b/releases.atom",
    );
  });

  it("解析 releases.atom 并补充仓库名前缀", async () => {
    const items = await githubReleaseAdapter.fetchItems(
      { type: "GITHUB_RELEASE", url: "fixture/repo" },
      ctxWith(fixture("github-releases.atom")),
    );
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("fixture/repo: v1.2.0");
    expect(items[0].url).toBe("https://github.com/fixture/repo/releases/tag/v1.2.0");
  });
});
