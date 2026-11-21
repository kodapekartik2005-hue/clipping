import fs from 'fs';
import { GoogleGenAI, Type } from '@google/genai';
import type { CaptionSegment, TranscriptSegment } from '../db/schema.ts';
import { calculateWordTimings, snapClipBoundaries } from '../utils/clipLogic.ts';

export function isGeminiConfigured(): boolean {
  const apiKey = process.env.GEMINI_API_KEY;
  return Boolean(apiKey && apiKey.trim() && apiKey !== 'MY_GEMINI_API_KEY');
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in server environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface DetectedClipCandidate {
  title: string;
  hookText: string;
  summary: string;
  startTime: number;
  endTime: number;
  engagementScore: number;
  speakerFocusX: number;
  captions: CaptionSegment[];
}

export interface VideoAiAnalysisResult {
  transcript: TranscriptSegment[];
  clips: DetectedClipCandidate[];
}

export async function analyzeAudioForClips(
  audioPath: string,
  videoDuration: number,
  targetClipDuration: string,
  language: string
): Promise<VideoAiAnalysisResult> {
  const ai = getAiClient();
  const fileStat = fs.statSync(audioPath);

  let audioPart: { inlineData: { mimeType: string; data: string } } | { fileData: { mimeType: string; fileUri: string } };

  if (fileStat.size <= 14 * 1024 * 1024) {
    const base64Audio = fs.readFileSync(audioPath).toString('base64');
    audioPart = {
      inlineData: {
        mimeType: 'audio/mp3',
        data: base64Audio,
      },
    };
  } else {
    const uploaded = await ai.files.upload({
      file: audioPath,
      config: { mimeType: 'audio/mp3' },
    });
    if (!uploaded.uri) {
      throw new Error('Failed to upload audio track to Gemini File API.');
    }
    audioPart = {
      fileData: {
        mimeType: 'audio/mp3',
        fileUri: uploaded.uri,
      },
    };
  }

  // Step 1: High-accuracy transcription using gemini-3.5-transcribe
  const langInstruction =
    language && language !== 'auto'
      ? `Transcribe accurately in language code "${language}".`
      : 'Detect the spoken language automatically and transcribe accurately.';

  const transcribeResp = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: {
      parts: [
        audioPart,
        {
          text: `${langInstruction} Provide a complete verbatim transcript with speaker turns.`,
        },
      ],
    },
  });

  const rawTranscriptText = (transcribeResp.text || '').trim();

  // Step 2: Structured timestamped segmentation + viral highlight detection via gemini-4-hydrogen
  const minClipSec = targetClipDuration === '15-30' ? 15 : targetClipDuration === '30-60' ? 25 : 15;
  const maxClipSec = targetClipDuration === '15-30' ? 32 : 60;
  const desiredCount = videoDuration >= 180 ? '5 to 10' : videoDuration >= 60 ? '3 to 5' : '2 to 4';

  const prompt = `Analyze this audio track (total duration: ${videoDuration.toFixed(1)} seconds) and its verbatim transcript below.

Verbatim Transcript:
${rawTranscriptText || '(Audio may contain sparse speech or ambient sound; align segments to audible speech or distinct audio transitions.)'}

Tasks:
1. Produce timestamped transcript segments ("transcript") covering the speech from 0 to ${videoDuration.toFixed(1)}s. Each segment must align with complete sentences so no sentence is cut in half.
2. Identify ${desiredCount} high-engagement short-form clip moments ("clips") between ${minClipSec} and ${maxClipSec} seconds long (if the total video is shorter than ${minClipSec}s, make the clip cover the strongest self-contained segment up to the video length).
3. Never cut a sentence in the middle: startTime and endTime must sit on natural sentence boundaries.
4. For each clip, create a punchy AI title ("title"), an opening 4-8 word hook overlay ("hookText"), a concise 1-sentence summary ("summary"), an engagement score from 70 to 99 ("engagementScore"), and an estimated horizontal speaker focus ("speakerFocusX" from 0.2 to 0.8, default 0.5).`;

  const analysisResp = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [audioPart, { text: prompt }],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          transcript: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                start: { type: Type.NUMBER },
                end: { type: Type.NUMBER },
                speaker: { type: Type.STRING },
                text: { type: Type.STRING },
              },
              required: ['start', 'end', 'speaker', 'text'],
            },
          },
          clips: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                hookText: { type: Type.STRING },
                summary: { type: Type.STRING },
                startTime: { type: Type.NUMBER },
                endTime: { type: Type.NUMBER },
                engagementScore: { type: Type.INTEGER },
                speakerFocusX: { type: Type.NUMBER },
              },
              required: [
                'title',
                'hookText',
                'summary',
                'startTime',
                'endTime',
                'engagementScore',
                'speakerFocusX',
              ],
            },
          },
        },
        required: ['transcript', 'clips'],
      },
    },
  });

  const parsedText = (analysisResp.text || '').trim();
  if (!parsedText) {
    throw new Error('Gemini returned an empty analysis response.');
  }

  const parsed = JSON.parse(parsedText) as {
    transcript?: Array<{ start: number; end: number; speaker: string; text: string }>;
    clips?: Array<{
      title: string;
      hookText: string;
      summary: string;
      startTime: number;
      endTime: number;
      engagementScore: number;
      speakerFocusX: number;
    }>;
  };

  const transcript: TranscriptSegment[] = (parsed.transcript || []).map((seg) => {
    const start = Math.max(0, Math.min(videoDuration, Number(seg.start) || 0));
    const end = Math.max(start + 0.5, Math.min(videoDuration, Number(seg.end) || start + 2));
    return {
      start,
      end,
      speaker: seg.speaker || 'Speaker 1',
      text: seg.text || '',
      words: calculateWordTimings(seg.text || '', start, end),
    };
  });

  const effectiveMin = Math.min(minClipSec, Math.max(5, videoDuration));
  const rawClips = parsed.clips || [];
  if (rawClips.length === 0) {
    throw new Error('AI analysis could not identify clip segments in this media.');
  }

  const clips: DetectedClipCandidate[] = rawClips.map((c, idx) => {
    const snapped = snapClipBoundaries(
      Number(c.startTime) || 0,
      Number(c.endTime) || Math.min(videoDuration, 30),
      transcript,
      videoDuration,
      effectiveMin,
      maxClipSec
    );

    const overlappingTranscript = transcript.filter(
      (seg) => seg.end > snapped.start + 0.2 && seg.start < snapped.end - 0.2
    );

    const captions: CaptionSegment[] =
      overlappingTranscript.length > 0
        ? overlappingTranscript.map((seg, sIdx) => {
            const cStart = Math.max(snapped.start, seg.start);
            const cEnd = Math.min(snapped.end, seg.end);
            return {
              id: `cap-${idx}-${sIdx}`,
              start: Number(cStart.toFixed(2)),
              end: Number(Math.max(cStart + 0.4, cEnd).toFixed(2)),
              text: seg.text,
              words: calculateWordTimings(seg.text, cStart, Math.max(cStart + 0.4, cEnd)),
            };
          })
        : [
            {
              id: `cap-${idx}-0`,
              start: snapped.start,
              end: snapped.end,
              text: c.summary || c.title,
              words: calculateWordTimings(c.summary || c.title, snapped.start, snapped.end),
            },
          ];

    return {
      title: c.title || `Highlight Clip ${idx + 1}`,
      hookText: c.hookText || c.title,
      summary: c.summary || '',
      startTime: snapped.start,
      endTime: snapped.end,
      engagementScore: Math.min(99, Math.max(60, Math.round(c.engagementScore || 86))),
      speakerFocusX: Math.min(0.85, Math.max(0.15, Number(c.speakerFocusX) || 0.5)),
      captions,
    };
  });

  return { transcript, clips };
}
