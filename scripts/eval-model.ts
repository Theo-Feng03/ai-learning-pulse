// AI 固定评测：pnpm eval:model
// 只能显式运行，不进入默认测试。默认使用 .env 中配置的真实模型；
// AI_PROVIDER=mock pnpm eval:model 可做无成本流程演练。
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getProvider } from "../src/lib/ai";
import type { ArticleAnalysisOutput } from "../src/lib/ai/types";
import { ALLOWED_TOPICS } from "../src/types/domain";

interface EvalSample {
  id: string;
  kind: string;
  input: { title: string; sourceName: string; excerpt?: string; content?: string };
  expected: {
    minScore?: number;
    maxScore?: number;
    category?: string;
    insufficientContent?: boolean;
  };
}

interface EvalResult {
  id: string;
  kind: string;
  ok: boolean;
  parseOk: boolean;
  failures: string[];
  output?: ArticleAnalysisOutput;
}

function check(sample: EvalSample, output: ArticleAnalysisOutput): string[] {
  const failures: string[] = [];
  const e = sample.expected;
  if (e.minScore !== undefined && output.relevanceScore < e.minScore) {
    failures.push(`score ${output.relevanceScore} < min ${e.minScore}`);
  }
  if (e.maxScore !== undefined && output.relevanceScore > e.maxScore) {
    failures.push(`score ${output.relevanceScore} > max ${e.maxScore}`);
  }
  if (e.category && output.category !== e.category) {
    failures.push(`category ${output.category} ≠ ${e.category}`);
  }
  if (e.insufficientContent !== undefined && output.insufficientContent !== e.insufficientContent) {
    failures.push(`insufficientContent ${output.insufficientContent} ≠ ${e.insufficientContent}`);
  }
  return failures;
}

async function main() {
  const provider = getProvider();
  if (!provider) {
    console.error("[eval] 未配置模型。请在 .env 设置 MODEL_BASE_URL / MODEL_NAME 后运行，");
    console.error("[eval] 或使用 AI_PROVIDER=mock pnpm eval:model 做流程演练。");
    process.exitCode = 1;
    return;
  }
  console.log(`[eval] provider=${provider.providerName} model=${provider.modelName}`);

  const setPath = path.resolve(__dirname, "../tests/fixtures/eval/eval-set.json");
  const { samples } = JSON.parse(readFileSync(setPath, "utf8")) as { samples: EvalSample[] };

  const results: EvalResult[] = [];
  for (const sample of samples) {
    try {
      const output = await provider.analyzeArticle({
        title: sample.input.title,
        sourceName: sample.input.sourceName,
        excerpt: sample.input.excerpt,
        content: sample.input.content,
        configuredInterests: [],
        allowedTopics: [...ALLOWED_TOPICS],
      });
      const failures = check(sample, output);
      results.push({ id: sample.id, kind: sample.kind, ok: failures.length === 0, parseOk: true, failures, output });
      console.log(`[eval] ${sample.id}: ${failures.length === 0 ? "PASS" : `FAIL (${failures.join("; ")})`}`);
    } catch (err) {
      results.push({
        id: sample.id,
        kind: sample.kind,
        ok: false,
        parseOk: false,
        failures: [err instanceof Error ? err.message : "调用失败"],
      });
      console.log(`[eval] ${sample.id}: ERROR`);
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const parseRate = results.filter((r) => r.parseOk).length / results.length;

  const outDir = path.resolve(__dirname, "../tests/tmp/eval");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(
    path.join(outDir, `eval-${stamp}.json`),
    JSON.stringify({ provider: provider.providerName, model: provider.modelName, passed, total: results.length, parseRate, results }, null, 2),
  );

  const md = [
    `# AI 评测报告（${stamp}）`,
    "",
    `- Provider：${provider.providerName} / ${provider.modelName}`,
    `- 通过：${passed}/${results.length}`,
    `- 结构化输出可解析率：${(parseRate * 100).toFixed(1)}%（目标 ≥ 95%）`,
    "",
    "| 样本 | 类型 | 结果 | 说明 |",
    "|---|---|---|---|",
    ...results.map((r) => `| ${r.id} | ${r.kind} | ${r.ok ? "✅" : "❌"} | ${r.failures.join("; ") || "—"} |`),
  ].join("\n");
  writeFileSync(path.join(outDir, `eval-${stamp}.md`), md);

  console.log(`[eval] 通过 ${passed}/${results.length}，可解析率 ${(parseRate * 100).toFixed(1)}%`);
  console.log(`[eval] 报告已写入 tests/tmp/eval/eval-${stamp}.{json,md}`);
  process.exitCode = parseRate >= 0.95 ? 0 : 1;
}

void main();
