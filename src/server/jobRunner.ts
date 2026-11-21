import { EventEmitter } from 'events';
import { eq } from 'drizzle-orm';
import path from 'path';
import { db } from '../db/index.ts';
import { clips, jobs, projects } from '../db/schema.ts';
import { DEFAULT_CAPTION_STYLE, trimClipSilenceBoundaries } from '../utils/clipLogic.ts';
import { runTranscriptAndHighlightPipeline, type AiEngineChoice } from './aiPipeline.ts';
import { CLIPS_DIR, UPLOADS_DIR } from './demoAssets.ts';
import {
  detectAudioSilences,
  downloadYouTubeVideo,
  extractAudioTrack,
  probeVideo,
  renderClipVideo,
} from './videoProcessor.ts';

export const jobEvents = new EventEmitter();
jobEvents.setMaxListeners(100);

export interface JobProgressEvent {
  projectId: number;
  jobId: number;
  status: string;
  progress: number;
  stageMessage: string;
  errorMessage?: string | null;
  logLine?: string;
}

async function updateProjectAndJob(
  projectId: number,
  jobId: number,
  patch: {
    status: string;
    progress: number;
    stageMessage: string;
    errorMessage?: string | null;
    logLine?: string;
    durationSeconds?: number;
    width?: number;
    height?: number;
    videoPath?: string;
    title?: string;
    transcriptJson?: unknown;
  }
) {
  const projectUpdate: Record<string, unknown> = {
    status: patch.status,
    progress: patch.progress,
    stageMessage: patch.stageMessage,
    updatedAt: new Date(),
  };
  if (patch.errorMessage !== undefined) projectUpdate.errorMessage = patch.errorMessage;
  if (patch.durationSeconds !== undefined) projectUpdate.durationSeconds = patch.durationSeconds;
  if (patch.width !== undefined) projectUpdate.width = patch.width;
  if (patch.height !== undefined) projectUpdate.height = patch.height;
  if (patch.videoPath !== undefined) projectUpdate.videoPath = patch.videoPath;
  if (patch.title !== undefined) projectUpdate.title = patch.title;
  if (patch.transcriptJson !== undefined) projectUpdate.transcriptJson = patch.transcriptJson;

  await db.update(projects).set(projectUpdate).where(eq(projects.id, projectId));

  const existingJob = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  const prevLogs = existingJob[0]?.logsJson || [];
  const stampedLine = patch.logLine
    ? `[${new Date().toISOString().slice(11, 19)}] ${patch.logLine}`
    : undefined;
  const nextLogs = stampedLine ? [...prevLogs, stampedLine] : prevLogs;

  const jobUpdate: Record<string, unknown> = {
    status: patch.status,
    progress: patch.progress,
    logsJson: nextLogs,
  };
  if (patch.status === 'ingesting' && !existingJob[0]?.startedAt) {
    jobUpdate.startedAt = new Date();
  }
  if (patch.status === 'completed' || patch.status === 'failed') {
    jobUpdate.completedAt = new Date();
  }

  await db.update(jobs).set(jobUpdate).where(eq(jobs.id, jobId));

  const eventPayload: JobProgressEvent = {
    projectId,
    jobId,
    status: patch.status,
    progress: patch.progress,
    stageMessage: patch.stageMessage,
    errorMessage: patch.errorMessage,
    logLine: stampedLine,
  };
  jobEvents.emit(`project:${projectId}`, eventPayload);
}

export function enqueueProjectProcessing(
  projectId: number,
  jobId: number,
  userId: number,
  preferredEngine: AiEngineChoice = 'auto'
) {
  setImmediate(() => {
    runProjectPipeline(projectId, jobId, userId, preferredEngine).catch((err) => {
      console.error(`Unhandled background error for project ${projectId}:`, err);
    });
  });
}

async function runProjectPipeline(
  projectId: number,
  jobId: number,
  userId: number,
  preferredEngine: AiEngineChoice
) {
  try {
    const rows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    const project = rows[0];
    if (!project) return;

    // Clean any stale partial clips before executing/retrying
    await db.delete(clips).where(eq(clips.projectId, projectId));

    let videoPath = project.videoPath || '';

    // Stage 1: Media ingestion
    await updateProjectAndJob(projectId, jobId, {
      status: 'ingesting',
      progress: 12,
      stageMessage:
        project.sourceType === 'youtube'
          ? 'Extracting authorized YouTube video stream...'
          : 'Inspecting source video dimensions and audio streams...',
      errorMessage: null,
      logLine: `Starting media ingestion (${project.sourceType}).`,
    });

    if (project.sourceType === 'youtube') {
      if (!project.sourceUrl) {
        throw new Error('Missing YouTube URL.');
      }
      videoPath = path.join(UPLOADS_DIR, `yt_project_${projectId}.mp4`);
      const ytResult = await downloadYouTubeVideo(project.sourceUrl, videoPath);
      await updateProjectAndJob(projectId, jobId, {
        status: 'ingesting',
        progress: 24,
        stageMessage: 'YouTube stream acquired. Inspecting media tracks...',
        videoPath,
        title: ytResult.title || project.title,
        logLine: `Downloaded stream for "${ytResult.title}".`,
      });
    }

    if (!videoPath) {
      throw new Error('Source video file path is missing.');
    }

    const probe = await probeVideo(videoPath);
    await updateProjectAndJob(projectId, jobId, {
      status: 'transcribing',
      progress: 35,
      stageMessage: 'Extracting 16kHz audio and running speech-to-text transcription...',
      durationSeconds: probe.duration,
      width: probe.width,
      height: probe.height,
      logLine: `Probed ${probe.width}x${probe.height} · ${probe.duration.toFixed(1)}s · audio=${probe.hasAudio}.`,
    });

    // Stage 2: Audio extraction + Speech-to-Text + AI Highlight Selection
    const audioPath = path.join(UPLOADS_DIR, `audio_project_${projectId}.mp3`);
    await extractAudioTrack(videoPath, audioPath, probe.hasAudio);

    const silences = project.removeSilences
      ? await detectAudioSilences(audioPath, probe.hasAudio)
      : [];

    await updateProjectAndJob(projectId, jobId, {
      status: 'analyzing',
      progress: 56,
      stageMessage: 'AI analyzing timestamped transcript for viral hooks & highlights...',
      logLine: `Extracted audio${silences.length ? ` (${silences.length} silent intervals detected)` : ''}; running AI transcript & highlight analysis.`,
    });

    const aiAnalysis = await runTranscriptAndHighlightPipeline({
      audioPath,
      videoDuration: probe.duration,
      targetClipDuration: project.targetClipDuration,
      language: project.language,
      preferredEngine,
    });

    await updateProjectAndJob(projectId, jobId, {
      status: 'rendering',
      progress: 72,
      stageMessage: `AI (${aiAnalysis.engineUsed.toUpperCase()}) selected ${aiAnalysis.clips.length} clips. Cutting & burning animated subtitles...`,
      transcriptJson: aiAnalysis.transcript,
      logLine: `AI engine "${aiAnalysis.engineUsed}" identified ${aiAnalysis.clips.length} sentence-aligned highlight clips.`,
    });

    // Stage 3: FFmpeg smart crop + cut + animated ASS karaoke subtitles into preview MP4s
    const totalClips = aiAnalysis.clips.length;
    for (let i = 0; i < totalClips; i++) {
      const candidate = aiAnalysis.clips[i];
      const style = { ...DEFAULT_CAPTION_STYLE };

      const refinedWindow = project.removeSilences
        ? trimClipSilenceBoundaries(candidate.startTime, candidate.endTime, silences, 10)
        : { start: candidate.startTime, end: candidate.endTime };

      const clipStart = refinedWindow.start;
      const clipEnd = refinedWindow.end;
      const clipDuration = Number((clipEnd - clipStart).toFixed(2));

      const inserted = await db
        .insert(clips)
        .values({
          projectId,
          userId,
          title: candidate.title,
          hookText: candidate.hookText,
          summary: candidate.summary,
          startTime: clipStart,
          endTime: clipEnd,
          duration: clipDuration,
          engagementScore: candidate.engagementScore,
          speakerFocusX: project.smartCrop ? candidate.speakerFocusX : 0.5,
          aspectRatio: project.outputFormat,
          captionStyle: style,
          captionsJson: candidate.captions,
          exportQuality: '1080p',
        })
        .returning();

      const clipRow = inserted[0];
      const previewFile = `clip_${clipRow.id}_preview.mp4`;
      const previewAbs = path.join(CLIPS_DIR, previewFile);

      await renderClipVideo({
        sourceVideoPath: videoPath,
        outputPath: previewAbs,
        startTime: clipStart,
        endTime: clipEnd,
        srcWidth: probe.width,
        srcHeight: probe.height,
        hasAudio: probe.hasAudio,
        aspectRatio: project.outputFormat,
        speakerFocusX: project.smartCrop ? candidate.speakerFocusX : 0.5,
        quality: '720p',
        captions: candidate.captions,
        captionStyle: style,
        burnCaptions: true,
      });

      await db
        .update(clips)
        .set({ previewVideoPath: `/storage/clips/${previewFile}` })
        .where(eq(clips.id, clipRow.id));

      const stepProgress = 74 + Math.round(((i + 1) / totalClips) * 24);
      await updateProjectAndJob(projectId, jobId, {
        status: 'rendering',
        progress: stepProgress,
        stageMessage: `Rendered clip ${i + 1} of ${totalClips} with animated subtitles: ${candidate.title}`,
        logLine: `FFmpeg cut & burned animated captions for clip #${clipRow.id} (${clipStart.toFixed(1)}s–${clipEnd.toFixed(1)}s).`,
      });
    }

    await updateProjectAndJob(projectId, jobId, {
      status: 'completed',
      progress: 100,
      stageMessage: `Ready: ${totalClips} AI-edited clips generated with animated subtitles.`,
      logLine: `Pipeline completed successfully (${totalClips} MP4 clips).`,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unexpected video processing failure.';
    console.error(`Project ${projectId} processing failed:`, error);
    await updateProjectAndJob(projectId, jobId, {
      status: 'failed',
      progress: 0,
      stageMessage: 'Processing failed',
      errorMessage: errMsg,
      logLine: `ERROR: ${errMsg}`,
    });
  }
}
