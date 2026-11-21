import fs from 'fs';
import OpenAI from 'openai';
import type { CaptionSegment, TranscriptSegment } from '../db/schema.ts';
import {
  buildTranscriptFromWhisper,
  calculateWordTimings,
  snapClipBoundaries,
} from '../utils/clipLogic.ts';
import type { DetectedClipCandidate, VideoAiAnalysisResult } from './gemini.ts';

export function isOpenAiConfigured(): boolean {
  const key = process.env.OPENAI_API_KEY;
  return Boolean(key && key.trim() && key !== 'MY_OPENAI_API_KEY');
}

function getOpenAiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim() || apiKey === 'MY_OPENAI_API_KEY') {
    throw new Error('OPENAI_API_KEY is not configured in server environment variables.');
  }
  return new OpenAI({ apiKey });
}

interface VerboseWhisperResponse {
  text?: string;
  segments?: Array<{ start?: number; end?: number; text?: string }>;
  words?: Array<{ word?: string; start?: number; end?: number }>;
}

export async function analyzeAudioWithOpenAI(
  audioPath: string,
  videoDuration: number,
  targetClipDuration: string,
  language: string
): Promise<VideoAiAnalysisResult> {
  const openai = getOpenAiClient();

  // 1. Speech-to-text transcription with word & segment timestamps via OpenAI Whisper
  const transcription = (await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['word', 'segment'],
    ...(language && language !== 'auto' ? { language } : {}),
  })) as unknown as VerboseWhisperResponse;

  const rawSegments = (transcription.segments || []).map((s) => ({
    start: Number(s.start) || 0,
    end: Number(s.end) || 0,
    text: String(s.text || ''),
  }));

  const rawWords = (transcription.words || []).map((w) => ({
    word: String(w.word || ''),
    start: Number(w.start) || 0,
    end: Number(w.end) || 0,
  }));

  const transcript: TranscriptSegment[] = buildTranscriptFromWhisper(
    rawSegments,
    rawWords,
    videoDuration
  );

  if (transcript.length === 0 && transcription.text?.trim()) {
    transcript.push({
      start: 0,
      end: Math.max(1, videoDuration),
      speaker: 'Speaker 1',
      text: transcription.text.trim(),
      words: calculateWordTimings(transcription.text.trim(), 0, Math.max(1, videoDuration)),
    });
  }

  // 2. Highlight selection & hook generation via OpenAI GPT-4o-mini
  const minClipSec = targetClipDuration === '15-30' ? 15 : targetClipDuration === '30-60' ? 25 : 15;
  const maxClipSec = targetClipDuration === '15-30' ? 32 : 60;
  const desiredCount =
    videoDuration >= 180 ? '5 to 10' : videoDuration >= 60 ? '3 to 5' : '2 to 4';

  const formattedTranscript = transcript
    .map((seg) => `[${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s] ${seg.text}`)
    .join('\n');

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You are an expert short-form video producer. Analyze timestamped transcripts and extract viral, engaging clips with exact sentence boundaries. Always respond with valid JSON matching {"clips": [{"title": string, "hookText": string, "summary": string, "startTime": number, "endTime": number, "engagementScore": number, "speakerFocusX": number}]}.',
      },
      {
        role: 'user',
        content: `Video duration: ${videoDuration.toFixed(1)} seconds.
Target clip count: ${desiredCount} distinct clips.
Target duration per clip: ${minClipSec} to ${maxClipSec} seconds (or full segment if video is shorter).
Rules:
- Never cut sentences in the middle; startTime and endTime must align with transcript segment boundaries.
- Identify strong hooks, pivotal insights, emotional peaks, and valuable takeaways.
- Return JSON object with "clips" array.

Timestamped Transcript:
${formattedTranscript || '(No audible speech detected)'}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('OpenAI returned an empty highlight selection response.');
  }

  const parsed = JSON.parse(content) as {
    clips?: Array<{
      title?: string;
      hookText?: string;
      summary?: string;
      startTime?: number;
      endTime?: number;
      engagementScore?: number;
      speakerFocusX?: number;
    }>;
  };

  const rawClips = parsed.clips || [];
  if (rawClips.length === 0) {
    throw new Error('OpenAI could not identify clip segments from this transcript.');
  }

  const effectiveMin = Math.min(minClipSec, Math.max(5, videoDuration));

  const clips: DetectedClipCandidate[] = rawClips.map((c, idx) => {
    const snapped = snapClipBoundaries(
      Number(c.startTime) || 0,
      Number(c.endTime) || Math.min(videoDuration, 30),
      transcript,
      videoDuration,
      effectiveMin,
      maxClipSec
    );

    const overlapping = transcript.filter(
      (seg) => seg.end > snapped.start + 0.2 && seg.start < snapped.end - 0.2
    );

    const captions: CaptionSegment[] =
      overlapping.length > 0
        ? overlapping.map((seg, sIdx) => {
            const cStart = Math.max(snapped.start, seg.start);
            const cEnd = Math.max(cStart + 0.4, Math.min(snapped.end, seg.end));
            const matchingWords = (seg.words || []).filter(
              (w) => w.end > cStart && w.start < cEnd
            );
            return {
              id: `cap-${idx}-${sIdx}`,
              start: Number(cStart.toFixed(2)),
              end: Number(cEnd.toFixed(2)),
              text: seg.text,
              words:
                matchingWords.length > 0
                  ? matchingWords
                  : calculateWordTimings(seg.text, cStart, cEnd),
            };
          })
        : [
            {
              id: `cap-${idx}-0`,
              start: snapped.start,
              end: snapped.end,
              text: c.summary || c.title || 'Highlight moment',
              words: calculateWordTimings(
                c.summary || c.title || 'Highlight moment',
                snapped.start,
                snapped.end
              ),
            },
          ];

    return {
      title: c.title || `Highlight Clip ${idx + 1}`,
      hookText: c.hookText || c.title || '',
      summary: c.summary || '',
      startTime: snapped.start,
      endTime: snapped.end,
      engagementScore: Math.min(99, Math.max(60, Math.round(Number(c.engagementScore) || 88))),
      speakerFocusX: Math.min(0.85, Math.max(0.15, Number(c.speakerFocusX) || 0.5)),
      captions,
    };
  });

  return { transcript, clips };
}
