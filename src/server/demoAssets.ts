import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import type { CaptionSegment, CaptionStyleConfig } from '../db/schema.ts';
import { calculateWordTimings, DEFAULT_CAPTION_STYLE } from '../utils/clipLogic.ts';

const execFileAsync = promisify(execFile);

export const STORAGE_ROOT = path.resolve(process.cwd(), 'storage');
export const SAMPLES_DIR = path.join(STORAGE_ROOT, 'samples');
export const UPLOADS_DIR = path.join(STORAGE_ROOT, 'uploads');
export const CLIPS_DIR = path.join(STORAGE_ROOT, 'clips');
export const EXPORTS_DIR = path.join(STORAGE_ROOT, 'exports');

export interface SampleVideoSpec {
  id: string;
  title: string;
  duration: number;
  filePath: string;
  publicUrl: string;
  imageSource: string;
  description: string;
  clips: Array<{
    id: number;
    title: string;
    hookText: string;
    summary: string;
    startTime: number;
    endTime: number;
    engagementScore: number;
    speakerFocusX: number;
    aspectRatio: '9:16' | '16:9' | '1:1';
    captionStyle: CaptionStyleConfig;
    captions: CaptionSegment[];
  }>;
}

const KEYNOTE_IMG = path.resolve(
  process.cwd(),
  'src/assets/images/creator_tech_keynote_1795270018985.jpg'
);
const PODCAST_IMG = path.resolve(
  process.cwd(),
  'src/assets/images/creator_podcast_thumb_1795270019943.jpg'
);

async function ensureSampleMp4(
  outputPath: string,
  imagePath: string,
  durationSec: number,
  toneFreq: number
): Promise<void> {
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 10000) {
    return;
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const hasImage = fs.existsSync(imagePath);
  const args = hasImage
    ? [
        '-y',
        '-loop',
        '1',
        '-i',
        imagePath,
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=${toneFreq}:sample_rate=44100:duration=${durationSec}`,
        '-filter_complex',
        `[0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,zoompan=z='min(zoom+0.0008,1.12)':d=${durationSec * 25}:s=1280x720:fps=25[v];[1:a]volume=0.05[a]`,
        '-map',
        '[v]',
        '-map',
        '[a]',
        '-t',
        String(durationSec),
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-movflags',
        '+faststart',
        outputPath,
      ]
    : [
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=#0B0F1A:s=1280x720:d=${durationSec}:r=25`,
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=${toneFreq}:sample_rate=44100:duration=${durationSec}`,
        '-filter_complex',
        '[1:a]volume=0.05[a]',
        '-map',
        '0:v',
        '-map',
        '[a]',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-movflags',
        '+faststart',
        outputPath,
      ];

  await execFileAsync('ffmpeg', args, { timeout: 60000 });
}

let samplesReadyPromise: Promise<void> | null = null;

export async function ensureDemoMediaReady(): Promise<void> {
  if (!samplesReadyPromise) {
    samplesReadyPromise = (async () => {
      await Promise.all([
        ensureSampleMp4(path.join(SAMPLES_DIR, 'sample_keynote.mp4'), KEYNOTE_IMG, 48, 220),
        ensureSampleMp4(path.join(SAMPLES_DIR, 'sample_podcast.mp4'), PODCAST_IMG, 52, 260),
      ]);
    })().catch((err) => {
      samplesReadyPromise = null;
      throw err;
    });
  }
  await samplesReadyPromise;
}

function makeCaptions(
  prefix: string,
  lines: Array<{ start: number; end: number; text: string }>
): CaptionSegment[] {
  return lines.map((line, i) => ({
    id: `${prefix}-${i}`,
    start: line.start,
    end: line.end,
    text: line.text,
    words: calculateWordTimings(line.text, line.start, line.end),
  }));
}

export function getDemoSamples(): SampleVideoSpec[] {
  return [
    {
      id: 'sample-keynote',
      title: 'Product Launch Keynote: Scaling AI Video Workflows',
      duration: 48,
      filePath: path.join(SAMPLES_DIR, 'sample_keynote.mp4'),
      publicUrl: '/storage/samples/sample_keynote.mp4',
      imageSource: '/src/assets/images/creator_tech_keynote_1795270018985.jpg',
      description: '48s keynote excerpt covering automated retention hooks, speaker framing, and instant short-form distribution.',
      clips: [
        {
          id: 9001,
          title: 'Why 80% of Viewers Drop Off in the First 3 Seconds',
          hookText: 'The 3-second retention rule nobody talks about',
          summary: 'Explains how opening with a concrete contradiction keeps vertical viewers past the 3-second scroll threshold.',
          startTime: 0,
          endTime: 18.5,
          engagementScore: 94,
          speakerFocusX: 0.5,
          aspectRatio: '9:16',
          captionStyle: { ...DEFAULT_CAPTION_STYLE },
          captions: makeCaptions('k1', [
            {
              start: 0.4,
              end: 5.2,
              text: 'Most creators lose eighty percent of their audience in three seconds.',
            },
            {
              start: 5.4,
              end: 11.4,
              text: 'Instead of a slow greeting, open immediately with the sharpest outcome.',
            },
            {
              start: 11.6,
              end: 18.2,
              text: 'Automated framing and kinetic captions lock attention from frame one.',
            },
          ]),
        },
        {
          id: 9002,
          title: 'Turning One 45-Minute Keynote Into Eight Viral Shorts',
          hookText: 'Stop editing manually for six hours',
          summary: 'Demonstrates repurposing a single long-form keynote into multi-platform vertical clips with zero manual timeline cutting.',
          startTime: 18.5,
          endTime: 36.5,
          engagementScore: 91,
          speakerFocusX: 0.5,
          aspectRatio: '9:16',
          captionStyle: {
            ...DEFAULT_CAPTION_STYLE,
            template: 'bold_highlight',
            highlightColor: '#A78BFA',
            position: 'center',
          },
          captions: makeCaptions('k2', [
            {
              start: 18.8,
              end: 24.4,
              text: 'One recorded keynote already contains eight standalone viral stories.',
            },
            {
              start: 24.6,
              end: 30.8,
              text: 'Speech analysis detects complete sentence boundaries without awkward cuts.',
            },
            {
              start: 31.0,
              end: 36.2,
              text: 'Export directly for YouTube Shorts, Reels, and TikTok in 1080p.',
            },
          ]),
        },
        {
          id: 9003,
          title: 'Active Speaker Tracking Without Camera Operators',
          hookText: 'Smart 9:16 framing on autopilot',
          summary: 'Covers dynamic horizontal speaker tracking when converting 16:9 widescreen footage into 9:16 vertical video.',
          startTime: 29.0,
          endTime: 47.5,
          engagementScore: 88,
          speakerFocusX: 0.48,
          aspectRatio: '9:16',
          captionStyle: {
            ...DEFAULT_CAPTION_STYLE,
            template: 'minimal_broadcast',
            highlightColor: '#38BDF8',
          },
          captions: makeCaptions('k3', [
            {
              start: 29.3,
              end: 35.1,
              text: 'Landscape video fails on mobile unless the active speaker stays centered.',
            },
            {
              start: 35.3,
              end: 41.5,
              text: 'Smart crop tracks subject movement across every frame automatically.',
            },
            {
              start: 41.7,
              end: 47.2,
              text: 'Clean typography makes silent mobile playback effortless.',
            },
          ]),
        },
      ],
    },
    {
      id: 'sample-podcast',
      title: 'Studio Founders Podcast: Distribution Beats Production',
      duration: 52,
      filePath: path.join(SAMPLES_DIR, 'sample_podcast.mp4'),
      publicUrl: '/storage/samples/sample_podcast.mp4',
      imageSource: '/src/assets/images/creator_podcast_thumb_1795270019943.jpg',
      description: '52s dual-mic podcast conversation on short-form distribution loops and caption legibility.',
      clips: [
        {
          id: 9004,
          title: 'Distribution Loops Outperform One-Off Viral Hits',
          hookText: 'Consistent daily clips beat lucky hits',
          summary: 'Two hosts break down why publishing 5 focused clips per episode compounds channel discovery.',
          startTime: 0,
          endTime: 22.0,
          engagementScore: 95,
          speakerFocusX: 0.28,
          aspectRatio: '9:16',
          captionStyle: { ...DEFAULT_CAPTION_STYLE },
          captions: makeCaptions('p1', [
            {
              start: 0.5,
              end: 7.4,
              text: 'Consistency beats luck when every podcast episode produces five sharp clips.',
            },
            {
              start: 7.6,
              end: 14.8,
              text: 'Viewers discover your full show through a twenty-second answer first.',
            },
            {
              start: 15.0,
              end: 21.6,
              text: 'Keep the pace tight by trimming dead silence between turns.',
            },
          ]),
        },
        {
          id: 9005,
          title: 'Why 70% of Mobile Reels Are Watched Muted First',
          hookText: 'Captions carry the first five seconds',
          summary: 'Highlights why high-contrast word-synchronized captions drive higher watch completion rates.',
          startTime: 22.0,
          endTime: 44.0,
          engagementScore: 90,
          speakerFocusX: 0.72,
          aspectRatio: '9:16',
          captionStyle: {
            ...DEFAULT_CAPTION_STYLE,
            template: 'clean_editorial',
            backgroundOpacity: 0.85,
          },
          captions: makeCaptions('p2', [
            {
              start: 22.4,
              end: 29.2,
              text: 'Most commuters scroll feeds muted until a visual caption grabs them.',
            },
            {
              start: 29.4,
              end: 36.8,
              text: 'Highlighting keywords in electric blue guides the eye naturally.',
            },
            {
              start: 37.0,
              end: 43.6,
              text: 'Edit any transcript word in seconds before exporting final MP4.',
            },
          ]),
        },
        {
          id: 9006,
          title: 'Square vs Vertical Format for LinkedIn & X Clips',
          hookText: 'Pick the right ratio for every feed',
          summary: 'Compares 9:16 vertical mobile Reels against 1:1 square and 16:9 widescreen cuts.',
          startTime: 30.0,
          endTime: 51.0,
          engagementScore: 87,
          speakerFocusX: 0.5,
          aspectRatio: '1:1',
          captionStyle: { ...DEFAULT_CAPTION_STYLE },
          captions: makeCaptions('p3', [
            {
              start: 30.4,
              end: 37.2,
              text: 'Use nine by sixteen for Shorts and TikTok, and square for feed posts.',
            },
            {
              start: 37.4,
              end: 44.5,
              text: 'Switch aspect ratios inside the studio without re-uploading footage.',
            },
            {
              start: 44.7,
              end: 50.6,
              text: 'Your timeline and caption styling adapt automatically to the frame.',
            },
          ]),
        },
      ],
    },
  ];
}
