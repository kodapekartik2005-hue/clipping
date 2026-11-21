import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { Ytdl, chooseFormat } from '@distube/ytdl-core';
import type { CaptionSegment, CaptionStyleConfig } from '../db/schema.ts';
import {
  buildAssSubtitles,
  buildSmartCropFilter,
  getTargetDimensions,
  parseYouTubeUrl,
  type SilenceInterval,
} from '../utils/clipLogic.ts';

const execFileAsync = promisify(execFile);

export interface VideoProbeInfo {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

export async function probeVideo(filePath: string): Promise<VideoProbeInfo> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);

  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; width?: number; height?: number; duration?: string }>;
  };

  const videoStream = parsed.streams?.find((s) => s.codec_type === 'video');
  const audioStream = parsed.streams?.find((s) => s.codec_type === 'audio');
  const rawDuration =
    Number(parsed.format?.duration) || Number(videoStream?.duration) || 30;

  return {
    duration: Math.max(1, rawDuration),
    width: videoStream?.width || 1920,
    height: videoStream?.height || 1080,
    hasAudio: Boolean(audioStream),
  };
}

export async function extractAudioTrack(
  videoPath: string,
  outputMp3Path: string,
  hasAudio: boolean
): Promise<void> {
  fs.mkdirSync(path.dirname(outputMp3Path), { recursive: true });
  if (!hasAudio) {
    // Generate a silent MP3 track matching duration so downstream pipeline handles silent videos cleanly
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=16000:cl=mono',
      '-t',
      '5',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '48k',
      outputMp3Path,
    ]);
    return;
  }

  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    videoPath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-b:a',
    '48k',
    outputMp3Path,
  ]);
}

export async function detectAudioSilences(
  audioPath: string,
  hasAudio: boolean
): Promise<SilenceInterval[]> {
  if (!hasAudio) return [];
  try {
    const { stderr } = await execFileAsync(
      'ffmpeg',
      ['-i', audioPath, '-af', 'silencedetect=noise=-35dB:d=0.8', '-f', 'null', '-'],
      { timeout: 30000 }
    );
    const silences: SilenceInterval[] = [];
    let currentStart: number | null = null;
    for (const line of stderr.split('\n')) {
      const startMatch = line.match(/silence_start:\s*([0-9.]+)/);
      if (startMatch) {
        currentStart = Number(startMatch[1]);
        continue;
      }
      const endMatch = line.match(/silence_end:\s*([0-9.]+)/);
      if (endMatch && currentStart !== null) {
        silences.push({ start: currentStart, end: Number(endMatch[1]) });
        currentStart = null;
      }
    }
    return silences;
  } catch {
    return [];
  }
}

export async function fetchYouTubeMetadata(url: string): Promise<{ title: string; videoId: string }> {
  const parsed = parseYouTubeUrl(url);
  if (!parsed.valid || !parsed.normalizedUrl || !parsed.videoId) {
    throw new Error(parsed.error || 'Invalid YouTube URL.');
  }

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(parsed.normalizedUrl)}&format=json`;
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const json = (await res.json()) as { title?: string };
      return {
        title: json.title || `YouTube Video (${parsed.videoId})`,
        videoId: parsed.videoId,
      };
    }
  } catch {
    // Fallback title if oEmbed network lookup times out
  }

  return {
    title: `YouTube Video (${parsed.videoId})`,
    videoId: parsed.videoId,
  };
}

export async function downloadYouTubeVideo(
  url: string,
  destPath: string
): Promise<{ title: string }> {
  const parsed = parseYouTubeUrl(url);
  if (!parsed.valid || !parsed.normalizedUrl) {
    throw new Error(parsed.error || 'Invalid YouTube URL.');
  }

  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  try {
    const ytdlClient = new Ytdl({ timeoutMs: 20000 });
    const info = await Promise.race([
      ytdlClient.getInfo(parsed.normalizedUrl),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('YouTube extraction timed out.')), 20000)
      ),
    ]);

    const title = info.videoDetails?.title || `YouTube Video (${parsed.videoId})`;
    const chosen = chooseFormat(info.formats, {
      filter: (f) => f.hasVideo && f.hasAudio,
    });

    if (!chosen) {
      throw new Error('No downloadable MP4 stream was available for this YouTube video.');
    }

    await new Promise<void>((resolve, reject) => {
      const stream = ytdlClient.download(info, { format: chosen });
      const out = fs.createWriteStream(destPath);
      const timer = setTimeout(() => {
        stream.destroy();
        out.close();
        reject(new Error('YouTube stream download exceeded time budget.'));
      }, 45000);

      stream.on('error', (err: Error) => {
        clearTimeout(timer);
        out.close();
        reject(err);
      });
      out.on('error', (err: Error) => {
        clearTimeout(timer);
        reject(err);
      });
      out.on('finish', () => {
        clearTimeout(timer);
        resolve();
      });
      stream.pipe(out);
    });

    return { title };
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `YouTube stream extraction failed (${rawMsg}). YouTube often restricts automated datacenter downloads—please upload the MP4/WebM file directly or test with a Studio Sample video.`
    );
  }
}

export interface RenderClipOptions {
  sourceVideoPath: string;
  outputPath: string;
  startTime: number;
  endTime: number;
  srcWidth: number;
  srcHeight: number;
  hasAudio: boolean;
  aspectRatio: string;
  speakerFocusX: number;
  quality: string;
  captions: CaptionSegment[];
  captionStyle: CaptionStyleConfig;
  burnCaptions: boolean;
}

export async function renderClipVideo(opts: RenderClipOptions): Promise<void> {
  fs.mkdirSync(path.dirname(opts.outputPath), { recursive: true });

  const duration = Math.max(1.5, opts.endTime - opts.startTime);
  const cropScaleFilter = buildSmartCropFilter(
    opts.srcWidth,
    opts.srcHeight,
    opts.aspectRatio,
    opts.speakerFocusX,
    opts.quality
  );
  const targetDims = getTargetDimensions(opts.aspectRatio, opts.quality);

  const filters: string[] = [cropScaleFilter];
  let tempAssPath: string | null = null;

  if (opts.burnCaptions && opts.captions.length > 0) {
    const assContent = buildAssSubtitles(
      opts.captions,
      opts.captionStyle,
      targetDims.width,
      targetDims.height,
      opts.startTime
    );
    tempAssPath = `${opts.outputPath}.subs.ass`;
    fs.writeFileSync(tempAssPath, assContent, 'utf-8');
    // Escape path for FFmpeg filtergraph
    const escapedAssPath = tempAssPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    filters.push(`ass='${escapedAssPath}'`);
  }

  if (opts.burnCaptions && opts.captionStyle.showProgressBar) {
    const barHeight = Math.max(6, Math.round(targetDims.height * 0.006));
    const safeDur = duration.toFixed(2);
    filters.push(
      `drawbox=x=0:y=ih-${barHeight}:w=iw*(t/${safeDur}):h=${barHeight}:color=#60A5FA@0.95:t=fill`
    );
  }

  const args = [
    '-y',
    '-ss',
    opts.startTime.toFixed(2),
    '-t',
    duration.toFixed(2),
    '-i',
    opts.sourceVideoPath,
    '-vf',
    filters.join(','),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
  ];

  if (opts.hasAudio) {
    args.push('-c:a', 'aac', '-b:a', '128k');
  } else {
    args.push('-an');
  }

  args.push('-movflags', '+faststart', opts.outputPath);

  try {
    await execFileAsync('ffmpeg', args, { timeout: 90000 });
  } finally {
    if (tempAssPath && fs.existsSync(tempAssPath)) {
      fs.unlinkSync(tempAssPath);
    }
  }
}
