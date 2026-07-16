import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { getProvider } from "@/lib/ai";
import { analyzeArticles } from "@/lib/ai/analyzeArticles";
import { prisma } from "@/lib/db/client";
import { createManualEntry } from "@/lib/learning/manual";

// 视频 → 学习草稿流水线：
//   ① yt-dlp 只抽音频（不下完整视频） ② ffmpeg 转 16kHz 单声道
//   ③ 本地 Whisper 转口播稿 ④ 删除音频 ⑤ 创建学习草稿（口播稿存 Article.content，永不导出）
//   ⑥ 如已配置模型，自动跑 AI 分析（摘要/评分/中文标题）
// 抖音直连可能因反爬失败：此时走"文件模式"（手机下载后上传）。

const execFileAsync = promisify(execFile);

const YT_DLP = process.env.YT_DLP_PATH || "yt-dlp";
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const WHISPER = process.env.WHISPER_PATH || "whisper-cli";
const WHISPER_MODEL =
  process.env.WHISPER_MODEL || path.resolve(process.cwd(), "data/models/ggml-small.bin");

const TMP_ROOT = path.resolve(process.cwd(), "data/video-tmp");
const MAX_BUFFER = 64 * 1024 * 1024;

export interface VideoMeta {
  title: string;
  uploader?: string;
  webpageUrl?: string;
  platform?: string;
}

/** 可注入的外部工具集（测试用 stub） */
export interface VideoTools {
  fetchMeta(url: string): Promise<VideoMeta>;
  downloadAudio(url: string, outDir: string): Promise<string>;
  toWav(inputPath: string, outDir: string): Promise<string>;
  transcribe(wavPath: string): Promise<string>;
}

const PLATFORM_NAMES: Record<string, string> = {
  douyin: "抖音",
  tiktok: "TikTok",
  bilibili: "B站",
  youtube: "YouTube",
};

function platformLabel(extractor?: string, url?: string): string {
  const key = (extractor ?? "").toLowerCase();
  for (const [needle, label] of Object.entries(PLATFORM_NAMES)) {
    if (key.includes(needle) || url?.includes(needle)) return label;
  }
  return extractor || "视频";
}

export const defaultTools: VideoTools = {
  async fetchMeta(url) {
    // --print 比 -J 稳（多分 P/playlist 场景 -J 可能输出 null 或巨大 JSON）
    const { stdout } = await execFileAsync(
      YT_DLP,
      ["--print", "%(title)s\t%(uploader,channel)s\t%(webpage_url)s\t%(extractor_key)s",
        "--no-warnings", "--no-playlist", "--playlist-items", "1", url],
      { maxBuffer: MAX_BUFFER, timeout: 60_000 },
    );
    const [title, uploader, webpageUrl, extractor] = stdout.trim().split("\t");
    return {
      title: title && title !== "NA" ? title : "未命名视频",
      uploader: uploader && uploader !== "NA" ? uploader : undefined,
      webpageUrl: webpageUrl && webpageUrl !== "NA" ? webpageUrl : url,
      platform: platformLabel(extractor, url),
    };
  },
  async downloadAudio(url, outDir) {
    await execFileAsync(
      YT_DLP,
      ["-x", "--audio-format", "m4a", "--no-playlist", "--no-warnings",
        "-o", path.join(outDir, "audio.%(ext)s"), url],
      { maxBuffer: MAX_BUFFER, timeout: 300_000 },
    );
    return path.join(outDir, "audio.m4a");
  },
  async toWav(inputPath, outDir) {
    const wavPath = path.join(outDir, "audio-16k.wav");
    await execFileAsync(
      FFMPEG,
      ["-y", "-i", inputPath, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wavPath],
      { maxBuffer: MAX_BUFFER, timeout: 300_000 },
    );
    return wavPath;
  },
  async transcribe(wavPath) {
    const { stdout } = await execFileAsync(
      WHISPER,
      ["-m", WHISPER_MODEL, "-f", wavPath, "--no-timestamps", "--language", "auto", "--no-prints"],
      { maxBuffer: MAX_BUFFER, timeout: 900_000 },
    );
    return stdout.replace(/\s+/g, (m) => (m.includes("\n") ? "\n" : " ")).trim();
  },
};

export interface VideoJobInput {
  /** 链接模式：视频链接 */
  url?: string;
  /** 文件模式：已保存到本地的上传文件路径 */
  filePath?: string;
  /** 文件模式必填：原视频链接（保证来源可追溯） */
  originalUrl?: string;
  title?: string;
  sourceName?: string;
}

async function setStatus(jobId: string, status: string, patch: Record<string, unknown> = {}) {
  await prisma.videoJob.update({ where: { id: jobId }, data: { status, ...patch } });
}

async function processJob(jobId: string, input: VideoJobInput, tools: VideoTools) {
  const workDir = path.join(TMP_ROOT, jobId);
  mkdirSync(workDir, { recursive: true });
  try {
    let meta: VideoMeta;
    let audioPath: string;

    if (input.url) {
      await setStatus(jobId, "downloading", { message: "获取视频信息并抽取音频…" });
      meta = await tools.fetchMeta(input.url);
      audioPath = await tools.downloadAudio(input.url, workDir);
    } else if (input.filePath) {
      meta = {
        title: input.title?.trim() || path.parse(input.filePath).name,
        webpageUrl: input.originalUrl,
        platform: input.sourceName || platformLabel(undefined, input.originalUrl) || "视频",
      };
      audioPath = input.filePath;
      await setStatus(jobId, "downloading", { message: "读取上传文件…", title: meta.title });
    } else {
      throw new Error("缺少视频链接或文件");
    }

    await setStatus(jobId, "transcribing", { title: meta.title, message: "本地 Whisper 转写中…" });
    const wavPath = await tools.toWav(audioPath, workDir);
    const transcript = await tools.transcribe(wavPath);
    if (!transcript || transcript.length < 5) {
      throw new Error("转写结果为空（视频可能没有清晰语音）");
    }

    await setStatus(jobId, "creating", { message: "创建学习草稿…" });
    const url = meta.webpageUrl ?? input.url ?? input.originalUrl;
    if (!url) throw new Error("缺少原视频链接");
    const { entry } = await createManualEntry({
      title: input.title?.trim() || meta.title,
      url,
      sourceName: input.sourceName?.trim() || [meta.platform, meta.uploader].filter(Boolean).join(" · "),
      excerpt: `【口播稿节选】${transcript.slice(0, 280)}`,
      content: transcript,
    });

    if (getProvider()) {
      await setStatus(jobId, "analyzing", { message: "AI 分析中…", entryId: entry.id });
      await analyzeArticles([entry.articleId], getProvider(), { maxPerRun: 1 });
    }

    await setStatus(jobId, "done", {
      entryId: entry.id,
      message: `完成：口播稿 ${transcript.length} 字`,
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "处理失败";
    const friendly = /douyin|抖音/.test(input.url ?? "")
      ? `${raw.slice(0, 200)}（抖音直连常被反爬拦截：可用小程序把视频下载到手机，AirDrop 到电脑后改用"上传文件"模式）`
      : raw.slice(0, 300);
    await setStatus(jobId, "failed", { message: friendly });
  } finally {
    // 音频/临时文件用完即删
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
    if (input.filePath) await rm(input.filePath, { force: true }).catch(() => {});
  }
}

/** 创建任务并后台执行，立即返回 jobId */
export async function startVideoJob(input: VideoJobInput, tools: VideoTools = defaultTools) {
  const job = await prisma.videoJob.create({
    data: {
      status: "pending",
      sourceUrl: input.url ?? input.originalUrl ?? null,
      fileName: input.filePath ? path.basename(input.filePath) : null,
      title: input.title ?? null,
    },
  });
  void processJob(job.id, input, tools).catch(async (err) => {
    await setStatus(job.id, "failed", {
      message: err instanceof Error ? err.message.slice(0, 300) : "处理失败",
    }).catch(() => {});
  });
  return job;
}

/** 供测试同步执行 */
export async function runVideoJobSync(input: VideoJobInput, tools: VideoTools) {
  const job = await prisma.videoJob.create({
    data: { status: "pending", sourceUrl: input.url ?? input.originalUrl ?? null },
  });
  await processJob(job.id, input, tools);
  return prisma.videoJob.findUniqueOrThrow({ where: { id: job.id } });
}
