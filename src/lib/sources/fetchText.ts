import { AdapterError, type FetchTextFn } from "./types";

/** 默认抓取实现：带超时的 GET，只返回响应文本 */
export const defaultFetchText: FetchTextFn = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "ai-learning-pulse/0.1 (local personal tool)",
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      throw new AdapterError(
        "source_http_error",
        `HTTP ${res.status}`,
        res.status >= 500 || res.status === 429,
      );
    }
    return await res.text();
  } catch (err) {
    if (err instanceof AdapterError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new AdapterError("source_timeout", `抓取超时（${timeoutMs}ms）`);
    }
    throw new AdapterError(
      "source_http_error",
      err instanceof Error ? err.message : "网络请求失败",
    );
  } finally {
    clearTimeout(timer);
  }
};
