import type { CaptionSegment, CaptionStyleConfig, TranscriptSegment } from '../db/schema.ts';

export type PageRoute =
  | 'landing'
  | 'auth'
  | 'dashboard'
  | 'processing'
  | 'results'
  | 'studio'
  | 'pricing'
  | 'settings'
  | 'admin';

export interface UserProfile {
  id: number;
  uid: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  plan: string;
  creditsMinutes: number;
  defaultLanguage: string;
  defaultAspectRatio: string;
}

export interface ClipItem {
  id: number;
  projectId: number;
  title: string;
  hookText: string;
  summary: string;
  startTime: number;
  endTime: number;
  duration: number;
  engagementScore: number;
  speakerFocusX: number;
  aspectRatio: '9:16' | '16:9' | '1:1' | string;
  captionStyle: CaptionStyleConfig;
  captionsJson: CaptionSegment[];
  captions?: CaptionSegment[];
  previewVideoPath?: string | null;
  previewVideoUrl?: string | null;
  sourceVideoUrl?: string | null;
  renderedVideoPath?: string | null;
  exportQuality?: string;
}

export interface ProjectItem {
  id: number;
  title: string;
  sourceType: string;
  sourceUrl?: string | null;
  videoPath?: string | null;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  durationSeconds: number;
  width: number;
  height: number;
  targetClipDuration: string;
  outputFormat: string;
  language: string;
  status: string;
  progress: number;
  stageMessage: string;
  errorMessage?: string | null;
  transcriptJson?: TranscriptSegment[] | null;
  createdAt: string;
  clipCount?: number;
  clips?: ClipItem[];
}

export interface JobRecord {
  id: number;
  projectId: number;
  jobType: string;
  status: string;
  progress: number;
  logsJson: string[];
  createdAt: string;
  completedAt?: string | null;
}
