import type { CaptionSegment, CaptionStyleConfig, CaptionWord, TranscriptSegment } from '../db/schema.ts';

export interface YouTubeUrlParseResult {
  valid: boolean;
  videoId: string | null;
  normalizedUrl: string | null;
  error?: string;
}

export function parseYouTubeUrl(rawUrl: string): YouTubeUrlParseResult {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, videoId: null, normalizedUrl: null, error: 'Please enter a YouTube URL.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    return { valid: false, videoId: null, normalizedUrl: null, error: 'Invalid URL format. Paste a valid youtube.com or youtu.be link.' };
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  let videoId: string | null = null;

  if (host === 'youtu.be') {
    const seg = parsed.pathname.split('/').filter(Boolean)[0];
    if (seg) videoId = seg;
  } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (parsed.pathname === '/watch') {
      videoId = parsed.searchParams.get('v');
    } else if (parsed.pathname.startsWith('/shorts/')) {
      videoId = parsed.pathname.split('/')[2] || null;
    } else if (parsed.pathname.startsWith('/live/')) {
      videoId = parsed.pathname.split('/')[2] || null;
    } else if (parsed.pathname.startsWith('/embed/')) {
      videoId = parsed.pathname.split('/')[2] || null;
    }
  } else {
    return {
      valid: false,
      videoId: null,
      normalizedUrl: null,
      error: 'Unsupported domain. Only youtube.com and youtu.be URLs are supported.',
    };
  }

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return {
      valid: false,
      videoId: null,
      normalizedUrl: null,
      error: 'Could not extract a valid 11-character YouTube video ID from this URL.',
    };
  }

  return {
    valid: true,
    videoId,
    normalizedUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

export function getTargetDimensions(
  aspectRatio: string,
  quality: string
): { width: number; height: number } {
  const is4k = quality === '4k';
  const is720 = quality === '720p';

  if (aspectRatio === '16:9') {
    if (is4k) return { width: 3840, height: 2160 };
    if (is720) return { width: 1280, height: 720 };
    return { width: 1920, height: 1080 };
  }

  if (aspectRatio === '1:1') {
    if (is4k) return { width: 2160, height: 2160 };
    if (is720) return { width: 720, height: 720 };
    return { width: 1080, height: 1080 };
  }

  // Default 9:16 vertical
  if (is4k) return { width: 2160, height: 3840 };
  if (is720) return { width: 720, height: 1280 };
  return { width: 1080, height: 1920 };
}

function makeEven(n: number): number {
  const rounded = Math.round(n / 2) * 2;
  return Math.max(2, rounded);
}

export function buildSmartCropFilter(
  srcWidth: number,
  srcHeight: number,
  aspectRatio: string,
  speakerFocusX = 0.5,
  quality = '1080p'
): string {
  const safeW = Math.max(64, srcWidth);
  const safeH = Math.max(64, srcHeight);
  const focusX = Math.min(1, Math.max(0, speakerFocusX));
  const target = getTargetDimensions(aspectRatio, quality);
  const targetRatio = target.width / target.height;
  const srcRatio = safeW / safeH;

  let cropW = safeW;
  let cropH = safeH;

  if (srcRatio > targetRatio) {
    cropH = safeH;
    cropW = makeEven(safeH * targetRatio);
  } else {
    cropW = safeW;
    cropH = makeEven(safeW / targetRatio);
  }

  cropW = Math.min(makeEven(safeW), cropW);
  cropH = Math.min(makeEven(safeH), cropH);

  const maxOffsetX = Math.max(0, safeW - cropW);
  const desiredLeft = Math.round(focusX * safeW - cropW / 2);
  const cropX = Math.min(maxOffsetX, Math.max(0, desiredLeft));
  const cropY = Math.max(0, Math.round((safeH - cropH) / 2));

  return `crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${target.width}:${target.height}:flags=lanczos`;
}

export function calculateWordTimings(
  text: string,
  start: number,
  end: number
): CaptionWord[] {
  const rawWords = text
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (rawWords.length === 0) return [];

  const duration = Math.max(0.4, end - start);
  const weights = rawWords.map((w) => Math.max(2, w.replace(/[^a-zA-Z0-9]/g, '').length));
  const totalWeight = weights.reduce((acc, w) => acc + w, 0);

  let cursor = start;
  return rawWords.map((word, idx) => {
    const slice = (weights[idx] / totalWeight) * duration;
    const wordStart = Number(cursor.toFixed(3));
    const wordEnd = idx === rawWords.length - 1
      ? Number(end.toFixed(3))
      : Number((cursor + slice).toFixed(3));
    cursor += slice;

    const clean = word.replace(/[^a-zA-Z0-9]/g, '');
    const emphasis =
      clean.length >= 6 ||
      /^[A-Z0-9]{2,}$/.test(clean) ||
      /[!?]$/.test(word);

    return {
      word,
      start: wordStart,
      end: Math.max(wordStart + 0.08, wordEnd),
      emphasis,
    };
  });
}

export function snapClipBoundaries(
  desiredStart: number,
  desiredEnd: number,
  transcript: TranscriptSegment[],
  videoDuration: number,
  minDuration = 15,
  maxDuration = 60
): { start: number; end: number } {
  const safeDuration = Math.max(minDuration, videoDuration);
  let start = Math.max(0, desiredStart);
  let end = Math.min(safeDuration, desiredEnd);

  if (transcript.length > 0) {
    // Snap start to closest sentence start within 4s
    let bestStart = start;
    let minStartDiff = 4.0;
    for (const seg of transcript) {
      const diff = Math.abs(seg.start - start);
      if (diff <= minStartDiff) {
        minStartDiff = diff;
        bestStart = seg.start;
      }
    }
    start = bestStart;

    // Snap end to closest sentence end within 4s
    let bestEnd = end;
    let minEndDiff = 4.0;
    for (const seg of transcript) {
      const diff = Math.abs(seg.end - end);
      if (diff <= minEndDiff && seg.end > start + minDuration * 0.7) {
        minEndDiff = diff;
        bestEnd = seg.end;
      }
    }
    end = bestEnd;
  }

  let clipDur = end - start;
  if (clipDur < minDuration) {
    end = Math.min(safeDuration, start + minDuration);
    if (end - start < minDuration) {
      start = Math.max(0, end - minDuration);
    }
  } else if (clipDur > maxDuration) {
    end = start + maxDuration;
  }

  return {
    start: Number(start.toFixed(2)),
    end: Number(end.toFixed(2)),
  };
}

export interface SilenceInterval {
  start: number;
  end: number;
}

export function trimClipSilenceBoundaries(
  clipStart: number,
  clipEnd: number,
  silences: SilenceInterval[],
  minDuration = 12
): { start: number; end: number } {
  let start = clipStart;
  let end = clipEnd;

  for (const s of silences) {
    // Trim leading dead silence overlapping the start edge while leaving 0.25s breath room
    if (s.start <= start + 0.3 && s.end > start + 0.5 && s.end < end - minDuration) {
      start = Number(Math.max(clipStart, s.end - 0.25).toFixed(2));
    }
    // Trim trailing dead silence overlapping the end edge while leaving 0.25s tail
    if (s.end >= end - 0.3 && s.start < end - 0.5 && s.start > start + minDuration) {
      end = Number(Math.min(clipEnd, s.start + 0.25).toFixed(2));
    }
  }

  return {
    start: Number(start.toFixed(2)),
    end: Number(Math.max(start + 2, end).toFixed(2)),
  };
}

export interface RawWhisperWord {
  word: string;
  start: number;
  end: number;
}

export interface RawWhisperSegment {
  start: number;
  end: number;
  text: string;
}

export function buildTranscriptFromWhisper(
  segments: RawWhisperSegment[],
  words: RawWhisperWord[],
  videoDuration: number
): TranscriptSegment[] {
  if (segments.length === 0 && words.length === 0) return [];

  if (segments.length === 0) {
    // Group raw words into ~7s / sentence-ending segments
    const grouped: TranscriptSegment[] = [];
    let bucket: RawWhisperWord[] = [];
    for (const w of words) {
      bucket.push(w);
      const dur = w.end - bucket[0].start;
      if (/[.!?]$/.test(w.word.trim()) || dur >= 6.5) {
        const text = bucket.map((b) => b.word.trim()).join(' ').trim();
        grouped.push({
          start: Number(Math.max(0, bucket[0].start).toFixed(2)),
          end: Number(Math.min(videoDuration, w.end).toFixed(2)),
          speaker: 'Speaker 1',
          text,
          words: bucket.map((b) => {
            const clean = b.word.replace(/[^a-zA-Z0-9]/g, '');
            return {
              word: b.word.trim(),
              start: Number(b.start.toFixed(3)),
              end: Number(Math.max(b.start + 0.08, b.end).toFixed(3)),
              emphasis: clean.length >= 6 || /^[A-Z0-9]{2,}$/.test(clean) || /[!?]$/.test(b.word),
            };
          }),
        });
        bucket = [];
      }
    }
    if (bucket.length > 0) {
      grouped.push({
        start: Number(Math.max(0, bucket[0].start).toFixed(2)),
        end: Number(Math.min(videoDuration, bucket[bucket.length - 1].end).toFixed(2)),
        speaker: 'Speaker 1',
        text: bucket.map((b) => b.word.trim()).join(' ').trim(),
        words: bucket.map((b) => ({
          word: b.word.trim(),
          start: Number(b.start.toFixed(3)),
          end: Number(Math.max(b.start + 0.08, b.end).toFixed(3)),
          emphasis: b.word.trim().length >= 6,
        })),
      });
    }
    return grouped;
  }

  return segments.map((seg) => {
    const start = Math.max(0, Number(seg.start) || 0);
    const end = Math.min(videoDuration, Math.max(start + 0.3, Number(seg.end) || start + 1));
    const segWords = words
      .filter((w) => w.end > start - 0.1 && w.start < end + 0.1)
      .map((w) => {
        const clean = w.word.replace(/[^a-zA-Z0-9]/g, '');
        return {
          word: w.word.trim(),
          start: Number(Math.max(start, w.start).toFixed(3)),
          end: Number(Math.min(end, Math.max(w.start + 0.08, w.end)).toFixed(3)),
          emphasis: clean.length >= 6 || /^[A-Z0-9]{2,}$/.test(clean) || /[!?]$/.test(w.word),
        };
      });

    return {
      start: Number(start.toFixed(2)),
      end: Number(end.toFixed(2)),
      speaker: 'Speaker 1',
      text: (seg.text || '').trim(),
      words: segWords.length > 0 ? segWords : calculateWordTimings(seg.text || '', start, end),
    };
  });
}

export function formatTimecode(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe % 1) * 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

export function formatDurationCompact(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function hexToAssBgr(hex: string, alpha = 0): string {
  const cleaned = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return '&H00FFFFFF';
  }
  const r = cleaned.slice(0, 2);
  const g = cleaned.slice(2, 4);
  const b = cleaned.slice(4, 6);
  const aHex = Math.min(255, Math.max(0, Math.round(alpha * 255)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
  return `&H${aHex}${b}${g}${r}`.toUpperCase();
}

function formatAssTimestamp(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const cs = Math.floor((safe % 1) * 100);
  return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function buildAssSubtitles(
  segments: CaptionSegment[],
  style: CaptionStyleConfig,
  targetWidth: number,
  targetHeight: number,
  clipStartOffset = 0
): string {
  const scaleFactor = targetHeight / 1920;
  const scaledFontSize = Math.max(24, Math.round(style.fontSize * 1.9 * scaleFactor));
  const alignment = style.position === 'top' ? 8 : style.position === 'center' ? 5 : 2;
  const marginV =
    style.position === 'center'
      ? 20
      : Math.round((style.position === 'top' ? 180 : 240) * scaleFactor);

  const primaryAss = hexToAssBgr(style.primaryColor, 0);
  const highlightAss = hexToAssBgr(style.highlightColor, 0);
  const bgAlpha = 1 - Math.min(1, Math.max(0, style.backgroundOpacity));
  const backAss = hexToAssBgr(style.backgroundColor, bgAlpha);
  const borderStyle = style.backgroundOpacity > 0.05 ? 3 : 1;
  const outlineWidth = style.backgroundOpacity > 0.05 ? 10 : 3;

  const header = [
    '[Script Info]',
    'Title: ClipGenius AI Captions',
    'ScriptType: v4.00+',
    `PlayResX: ${targetWidth}`,
    `PlayResY: ${targetHeight}`,
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${style.fontFamily || 'DejaVu Sans'},${scaledFontSize},${highlightAss},${primaryAss},&H00000000,${backAss},-1,0,0,0,100,100,0,0,${borderStyle},${outlineWidth},0,${alignment},48,48,${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const lines: string[] = [];

  for (const seg of segments) {
    const segStart = Math.max(0, seg.start - clipStartOffset);
    const segEnd = Math.max(segStart + 0.25, seg.end - clipStartOffset);

    if (seg.words && seg.words.length > 0) {
      // Chunk into 4 words per caption phrase for punchy animated short-form subtitles
      const chunkSize = 4;
      for (let i = 0; i < seg.words.length; i += chunkSize) {
        const chunk = seg.words.slice(i, i + chunkSize);
        const cStart = Math.max(0, chunk[0].start - clipStartOffset);
        const cEnd = Math.max(cStart + 0.2, chunk[chunk.length - 1].end - clipStartOffset);

        const formattedText = chunk
          .map((w) => {
            const safeWord = w.word.replace(/[{}]/g, '');
            const wordCs = Math.max(8, Math.round((w.end - w.start) * 100));
            const emphasisTag = w.emphasis ? `\\b1` : '';
            return `{\\kf${wordCs}${emphasisTag}}${safeWord}`;
          })
          .join(' ');

        lines.push(
          `Dialogue: 0,${formatAssTimestamp(cStart)},${formatAssTimestamp(cEnd)},Default,,0,0,0,,{\\fad(60,60)}${formattedText}`
        );
      }
    } else {
      const safeText = seg.text.replace(/[{}]/g, '');
      lines.push(
        `Dialogue: 0,${formatAssTimestamp(segStart)},${formatAssTimestamp(segEnd)},Default,,0,0,0,,{\\fad(60,60)}${safeText}`
      );
    }
  }

  return [...header, ...lines].join('\n');
}

export const DEFAULT_CAPTION_STYLE: CaptionStyleConfig = {
  template: 'kinetic_pop',
  fontFamily: 'Plus Jakarta Sans',
  fontSize: 28,
  primaryColor: '#FFFFFF',
  highlightColor: '#60A5FA',
  backgroundColor: '#090D16',
  backgroundOpacity: 0.72,
  position: 'bottom',
  showProgressBar: true,
  showHookTitle: false,
};
