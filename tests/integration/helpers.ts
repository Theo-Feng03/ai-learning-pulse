import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db/client";
import { normalizeSourceUrl } from "@/lib/dedup/canonicalUrl";
import { AdapterError, type FetchContext } from "@/lib/sources/types";

export const fixtureXml = (name: string) =>
  readFileSync(path.resolve(__dirname, "../fixtures/rss", name), "utf8");

/** URL → fixture 内容映射；未命中时抛出 HTTP 错误 */
export function fixtureFetchContext(routes: Record<string, string | Error>): FetchContext {
  return {
    timeoutMs: 1000,
    fetchText: async (url) => {
      const hit = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
      if (!hit) throw new AdapterError("source_http_error", `HTTP 404（fixture 未命中：${url}）`);
      const value = hit[1];
      if (value instanceof Error) throw value;
      return value;
    },
  };
}

export async function createTestSource(overrides: {
  name: string;
  type?: string;
  url: string;
  exportAllowed?: boolean;
  publicName?: string;
}) {
  const type = overrides.type ?? "RSS";
  return prisma.source.create({
    data: {
      name: overrides.name,
      type,
      url: overrides.url,
      normalizedUrl: normalizeSourceUrl(
        type === "GITHUB_RELEASE" && !overrides.url.startsWith("http")
          ? `https://github.com/${overrides.url}`
          : overrides.url,
        type,
      ),
      publicName: overrides.publicName,
      exportAllowed: overrides.exportAllowed ?? true,
      enabled: true,
      status: "active",
    },
  });
}

export async function createTestTopic(name: string) {
  return prisma.topic.upsert({
    where: { slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") },
    create: { name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") },
    update: {},
  });
}
