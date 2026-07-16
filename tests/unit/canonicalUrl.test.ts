import { describe, expect, it } from "vitest";
import { canonicalizeUrl, normalizeSourceUrl } from "@/lib/dedup/canonicalUrl";

describe("canonicalizeUrl", () => {
  it("删除 utm 跟踪参数", () => {
    expect(
      canonicalizeUrl(
        "https://example.com/post?utm_source=rss&utm_medium=feed&utm_campaign=x&utm_term=y&utm_content=z",
      ),
    ).toBe("https://example.com/post");
  });

  it("删除 ref 和其他跟踪参数，保留业务参数", () => {
    expect(canonicalizeUrl("https://example.com/post?ref=hn&id=42&fbclid=abc")).toBe(
      "https://example.com/post?id=42",
    );
  });

  it("删除 fragment", () => {
    expect(canonicalizeUrl("https://example.com/post#section-2")).toBe(
      "https://example.com/post",
    );
  });

  it("query 参数按键排序", () => {
    expect(canonicalizeUrl("https://example.com/post?b=2&a=1&c=3")).toBe(
      "https://example.com/post?a=1&b=2&c=3",
    );
  });

  it("hostname 小写", () => {
    expect(canonicalizeUrl("https://Example.COM/Post")).toBe("https://example.com/Post");
  });

  it("删除默认端口", () => {
    expect(canonicalizeUrl("https://example.com:443/post")).toBe("https://example.com/post");
    expect(canonicalizeUrl("http://example.com:80/post")).toBe("http://example.com/post");
  });

  it("保留非默认端口", () => {
    expect(canonicalizeUrl("http://localhost:3000/post")).toBe("http://localhost:3000/post");
  });

  it("删除非根路径末尾斜杠", () => {
    expect(canonicalizeUrl("https://example.com/post/")).toBe("https://example.com/post");
    expect(canonicalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("同一 URL 带不同跟踪参数时结果一致（去重前提）", () => {
    const a = canonicalizeUrl("https://example.com/p?utm_source=a#x");
    const b = canonicalizeUrl("https://EXAMPLE.com/p/?utm_medium=b");
    expect(a).toBe(b);
  });

  it("非法 URL 抛出异常", () => {
    expect(() => canonicalizeUrl("not a url")).toThrow();
  });
});

describe("normalizeSourceUrl", () => {
  it("包含类型前缀，忽略大小写差异", () => {
    expect(normalizeSourceUrl("https://Example.com/feed.xml", "RSS")).toBe(
      "RSS:https://example.com/feed.xml",
    );
  });
});
