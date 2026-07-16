import { describe, expect, it } from "vitest";
import { normalizeTitle, titleSimilarity } from "@/lib/dedup/titleSimilarity";

describe("normalizeTitle", () => {
  it("小写化并去标点", () => {
    expect(normalizeTitle("Hello, World! (2026)")).toBe("hello world 2026");
  });

  it("去除常见站点后缀", () => {
    expect(normalizeTitle("Big AI News - The Verge")).toBe("big ai news");
    expect(normalizeTitle("Big AI News | TechCrunch")).toBe("big ai news");
  });

  it("压缩多余空格", () => {
    expect(normalizeTitle("  a   b  ")).toBe("a b");
  });
});

describe("titleSimilarity", () => {
  it("完全相同 = 1", () => {
    expect(titleSimilarity("OpenAI releases new model", "OpenAI releases new model")).toBe(1);
  });

  it("站点后缀不同视为相同", () => {
    expect(
      titleSimilarity("OpenAI releases new model - Blog A", "OpenAI releases new model | Blog B"),
    ).toBe(1);
  });

  it("轻微措辞差异 ≥ 0.85 阈值附近", () => {
    const sim = titleSimilarity(
      "Fixture: New AI model released with longer context",
      "Fixture: New AI model released with longer context - Mirror Blog",
    );
    expect(sim).toBeGreaterThanOrEqual(0.85);
  });

  it("不同主题 < 0.5", () => {
    expect(
      titleSimilarity("OpenAI releases new model", "Weekly notes on developer tooling"),
    ).toBeLessThan(0.5);
  });

  it("中文标题可比较", () => {
    expect(titleSimilarity("模型发布公告", "模型发布公告")).toBe(1);
    expect(titleSimilarity("模型发布公告", "开发者工具周报")).toBeLessThan(0.5);
  });

  it("空标题相似度为 0", () => {
    expect(titleSimilarity("", "anything")).toBe(0);
  });
});
