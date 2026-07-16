import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { createRun, runIngestion } from "@/lib/ingestion/run";
import { AdapterError } from "@/lib/sources/types";
import { resetDb } from "../setup/db";
import { createTestSource, fixtureFetchContext, fixtureXml } from "./helpers";

describe("单信源失败诊断", () => {
  beforeEach(resetDb);

  it("单个信源失败时任务 partial_failed，其他信源数据正常落库", async () => {
    const good = await createTestSource({
      name: "Good Blog",
      url: "https://fixture.example.com/feed",
    });
    const bad = await createTestSource({
      name: "Bad Blog",
      url: "https://broken.example.com/feed",
    });
    const ctx = fixtureFetchContext({
      "https://fixture.example.com/feed": fixtureXml("sample-feed.xml"),
      "https://broken.example.com/feed": new AdapterError("source_timeout", "抓取超时（15000ms）"),
    });

    const run = await createRun("cli");
    const finished = await runIngestion(run.id, { fetchContext: ctx, provider: null });

    expect(finished.status).toBe("partial_failed");
    expect(finished.sourceSuccess).toBe(1);
    expect(finished.sourceFailed).toBe(1);

    // 运行详情可定位 sourceId、stage、error code
    const errors = await prisma.runError.findMany({ where: { runId: run.id } });
    expect(errors).toHaveLength(1);
    expect(errors[0].sourceId).toBe(bad.id);
    expect(errors[0].stage).toBe("fetch");
    expect(errors[0].code).toBe("source_timeout");

    // 成功信源的文章存在
    expect(await prisma.article.count({ where: { sourceId: good.id } })).toBe(2);
    expect(await prisma.article.count({ where: { sourceId: bad.id } })).toBe(0);
  });

  it("全部信源失败时任务 failed", async () => {
    await createTestSource({ name: "Bad Blog", url: "https://broken.example.com/feed" });
    const ctx = fixtureFetchContext({
      "https://broken.example.com/feed": new AdapterError("source_http_error", "HTTP 500"),
    });

    const run = await createRun("cli");
    const finished = await runIngestion(run.id, { fetchContext: ctx, provider: null });
    expect(finished.status).toBe("failed");
  });

  it("连续 3 次失败后信源标记为 degraded 并记录错误码", async () => {
    const source = await createTestSource({
      name: "Flaky Blog",
      url: "https://broken.example.com/feed",
    });
    await createTestSource({ name: "Good Blog", url: "https://fixture.example.com/feed" });
    const ctx = fixtureFetchContext({
      "https://fixture.example.com/feed": fixtureXml("sample-feed.xml"),
      "https://broken.example.com/feed": new AdapterError("source_http_error", "HTTP 503"),
    });

    for (let i = 0; i < 3; i++) {
      const run = await createRun("cli");
      await runIngestion(run.id, { fetchContext: ctx, provider: null });
    }

    const updated = await prisma.source.findUniqueOrThrow({ where: { id: source.id } });
    expect(updated.failureCount).toBe(3);
    expect(updated.status).toBe("degraded");
    expect(updated.lastErrorCode).toBe("source_http_error");
  });

  it("信源恢复后 failureCount 归零、状态回到 active", async () => {
    const source = await createTestSource({
      name: "Recovering Blog",
      url: "https://fixture.example.com/feed",
    });
    await prisma.source.update({
      where: { id: source.id },
      data: { failureCount: 3, status: "degraded", lastErrorCode: "source_timeout" },
    });
    const ctx = fixtureFetchContext({
      "https://fixture.example.com/feed": fixtureXml("sample-feed.xml"),
    });

    const run = await createRun("cli");
    await runIngestion(run.id, { fetchContext: ctx, provider: null });

    const updated = await prisma.source.findUniqueOrThrow({ where: { id: source.id } });
    expect(updated.failureCount).toBe(0);
    expect(updated.status).toBe("active");
    expect(updated.lastSuccessAt).not.toBeNull();
  });
});
