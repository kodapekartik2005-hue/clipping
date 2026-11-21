import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from './src/db/index.ts';
import { clips, jobs, projects, users, type CaptionSegment, type CaptionStyleConfig } from './src/db/schema.ts';
import { requireAuth, type AuthRequest } from './src/middleware/auth.ts';
import { getServerAiCapabilities, type AiEngineChoice } from './src/server/aiPipeline.ts';
import {
  CLIPS_DIR,
  EXPORTS_DIR,
  SAMPLES_DIR,
  STORAGE_ROOT,
  UPLOADS_DIR,
  ensureDemoMediaReady,
  getDemoSamples,
} from './src/server/demoAssets.ts';
import { enqueueProjectProcessing, jobEvents, type JobProgressEvent } from './src/server/jobRunner.ts';
import { fetchYouTubeMetadata, probeVideo, renderClipVideo } from './src/server/videoProcessor.ts';
import { DEFAULT_CAPTION_STYLE, parseYouTubeUrl } from './src/utils/clipLogic.ts';

const SERVER_SIGNING_SECRET =
  process.env.SESSION_SECRET ||
  process.env.SQL_PASSWORD ||
  crypto.randomBytes(32).toString('hex');

function createSignedProjectToken(projectId: number, userId: number): string {
  const exp = Date.now() + 2 * 60 * 60 * 1000;
  const payload = `${projectId}:${userId}:${exp}`;
  const sig = crypto
    .createHmac('sha256', SERVER_SIGNING_SECRET)
    .update(payload)
    .digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

function verifySignedProjectToken(token: string, expectedProjectId: number): boolean {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const [projStr, userStr, expStr, sig] = raw.split(':');
    if (!projStr || !userStr || !expStr || !sig) return false;
    if (Number(projStr) !== expectedProjectId) return false;
    if (Date.now() > Number(expStr)) return false;

    const expectedSig = crypto
      .createHmac('sha256', SERVER_SIGNING_SECRET)
      .update(`${projStr}:${userStr}:${expStr}`)
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
  } catch {
    return false;
  }
}

function parseAiEngine(val: unknown): AiEngineChoice {
  return val === 'openai' || val === 'gemini' ? val : 'auto';
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Ensure local media storage directories exist
  for (const dir of [STORAGE_ROOT, SAMPLES_DIR, UPLOADS_DIR, CLIPS_DIR, EXPORTS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  app.use(express.json({ limit: '10mb' }));
  // Keep raw user uploads private; serve samples, generated clips, and exports cleanly
  app.use('/storage/samples', express.static(SAMPLES_DIR));
  app.use('/storage/clips', express.static(CLIPS_DIR));
  app.use('/storage/exports', express.static(EXPORTS_DIR));

  const uploadStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.mp4';
      const safeBase = path
        .basename(file.originalname, ext)
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 40);
      cb(null, `${Date.now()}_${safeBase}${ext}`);
    },
  });

  const upload = multer({
    storage: uploadStorage,
    limits: { fileSize: 250 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = /\.(mp4|mov|webm|mkv|m4v)$/i.test(file.originalname) ||
        file.mimetype.startsWith('video/');
      if (!allowed) {
        cb(new Error('Unsupported video format. Please upload MP4, MOV, WebM, or MKV.'));
        return;
      }
      cb(null, true);
    },
  });

  // Health & Server AI Engine Capabilities (never returns key values)
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'ClipGenius AI' });
  });

  app.get('/api/capabilities', (_req, res) => {
    res.json({
      ...getServerAiCapabilities(),
      ffmpegReady: true,
    });
  });

  // Demo workspace (real playable FFmpeg-generated MP4s + deterministic seeded projects for instant preview)
  app.get('/api/demo/workspace', async (_req, res) => {
    try {
      await ensureDemoMediaReady();
      const samples = getDemoSamples();
      const projectsList = samples.map((s, idx) => ({
        id: 8000 + idx + 1,
        title: s.title,
        sourceType: 'sample',
        sourceUrl: null,
        videoUrl: s.publicUrl,
        thumbnailUrl: s.imageSource,
        durationSeconds: s.duration,
        width: 1280,
        height: 720,
        targetClipDuration: '15-30',
        outputFormat: '9:16',
        language: 'en',
        status: 'completed',
        progress: 100,
        stageMessage: `Ready: ${s.clips.length} AI-edited clips generated.`,
        createdAt: new Date(Date.now() - (idx + 1) * 3600_000).toISOString(),
        clips: s.clips.map((c) => ({
          ...c,
          projectId: 8000 + idx + 1,
          duration: Number((c.endTime - c.startTime).toFixed(2)),
          previewVideoUrl: s.publicUrl,
          sourceVideoUrl: s.publicUrl,
          exportQuality: '1080p',
        })),
      }));

      res.json({ projects: projectsList });
    } catch (error) {
      console.error('Demo workspace preparation failed:', error);
      res.status(500).json({ error: 'Unable to prepare demo media workspace.' });
    }
  });

  // Real FFmpeg export on demo clips so interactive Studio editing & MP4 download work end-to-end
  app.post('/api/demo/clips/:clipId/export', async (req, res) => {
    try {
      await ensureDemoMediaReady();
      const clipId = Number(req.params.clipId);
      const samples = getDemoSamples();
      const ownerSample = samples.find((s) => s.clips.some((c) => c.id === clipId));
      const baseClip = ownerSample?.clips.find((c) => c.id === clipId);

      if (!ownerSample || !baseClip) {
        return res.status(404).json({ error: 'Demo clip not found.' });
      }

      const body = req.body as {
        startTime?: number;
        endTime?: number;
        aspectRatio?: string;
        quality?: string;
        speakerFocusX?: number;
        captions?: CaptionSegment[];
        captionStyle?: CaptionStyleConfig;
      };

      const startTime = Math.max(0, Number(body.startTime ?? baseClip.startTime));
      const endTime = Math.min(
        ownerSample.duration,
        Math.max(startTime + 2, Number(body.endTime ?? baseClip.endTime))
      );
      const aspectRatio = body.aspectRatio || baseClip.aspectRatio || '9:16';
      const quality = body.quality || '1080p';
      const captions = Array.isArray(body.captions) ? body.captions : baseClip.captions;
      const captionStyle = body.captionStyle || baseClip.captionStyle || DEFAULT_CAPTION_STYLE;
      const speakerFocusX = Number(body.speakerFocusX ?? baseClip.speakerFocusX ?? 0.5);

      const probe = await probeVideo(ownerSample.filePath);
      const exportName = `demo_clip_${clipId}_${aspectRatio.replace(':', 'x')}_${quality}_${Date.now()}.mp4`;
      const exportAbs = path.join(EXPORTS_DIR, exportName);

      await renderClipVideo({
        sourceVideoPath: ownerSample.filePath,
        outputPath: exportAbs,
        startTime,
        endTime,
        srcWidth: probe.width,
        srcHeight: probe.height,
        hasAudio: probe.hasAudio,
        aspectRatio,
        speakerFocusX,
        quality,
        captions,
        captionStyle,
        burnCaptions: true,
      });

      res.json({
        downloadUrl: `/storage/exports/${exportName}`,
        filename: `${baseClip.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48)}.mp4`,
      });
    } catch (error) {
      console.error('Demo clip export failed:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to render MP4 export.',
      });
    }
  });

  // Authenticated User Profile & Settings
  app.get('/api/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      const dbUser = req.dbUser!;
      const userProjects = await db
        .select()
        .from(projects)
        .where(eq(projects.userId, dbUser.id));
      const userClips = await db
        .select()
        .from(clips)
        .where(eq(clips.userId, dbUser.id));

      res.json({
        user: dbUser,
        stats: {
          totalProjects: userProjects.length,
          totalClips: userClips.length,
          processingCount: userProjects.filter(
            (p) => p.status !== 'completed' && p.status !== 'failed'
          ).length,
        },
      });
    } catch (error) {
      console.error('Failed to fetch /api/me:', error);
      res.status(500).json({ error: 'Failed to load account profile.' });
    }
  });

  app.patch('/api/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      const dbUser = req.dbUser!;
      const { displayName, defaultLanguage, defaultAspectRatio, plan } = req.body as {
        displayName?: string;
        defaultLanguage?: string;
        defaultAspectRatio?: string;
        plan?: string;
      };

      const patch: Record<string, unknown> = {};
      if (typeof displayName === 'string' && displayName.trim()) {
        patch.displayName = displayName.trim().slice(0, 80);
      }
      if (typeof defaultLanguage === 'string' && defaultLanguage.trim()) {
        patch.defaultLanguage = defaultLanguage.trim();
      }
      if (defaultAspectRatio === '9:16' || defaultAspectRatio === '16:9' || defaultAspectRatio === '1:1') {
        patch.defaultAspectRatio = defaultAspectRatio;
      }
      if (plan === 'starter' || plan === 'pro' || plan === 'studio') {
        patch.plan = plan;
        patch.creditsMinutes = plan === 'studio' ? 2400 : plan === 'pro' ? 600 : 60;
      }

      const updated = await db
        .update(users)
        .set(patch)
        .where(eq(users.id, dbUser.id))
        .returning();

      res.json({ user: updated[0] });
    } catch (error) {
      console.error('Failed to update profile:', error);
      res.status(500).json({ error: 'Failed to update profile settings.' });
    }
  });

  // Projects list for authenticated user
  app.get('/api/projects', requireAuth, async (req: AuthRequest, res) => {
    try {
      const dbUser = req.dbUser!;
      const userProjects = await db
        .select()
        .from(projects)
        .where(eq(projects.userId, dbUser.id))
        .orderBy(desc(projects.createdAt));

      const userClips = await db
        .select()
        .from(clips)
        .where(eq(clips.userId, dbUser.id));

      const enriched = userProjects.map((p) => {
        const pClips = userClips.filter((c) => c.projectId === p.id);
        return {
          ...p,
          clipCount: pClips.length,
          clips: pClips,
        };
      });

      res.json({ projects: enriched });
    } catch (error) {
      console.error('Failed to list projects:', error);
      res.status(500).json({ error: 'Failed to load projects.' });
    }
  });

  // Single project detail + live processing job logs + generated clips
  app.get('/api/projects/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const dbUser = req.dbUser!;
      const projectId = Number(req.params.id);
      if (!Number.isFinite(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID.' });
      }

      const rows = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      const project = rows[0];
      if (!project || project.userId !== dbUser.id) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      const projectClips = await db
        .select()
        .from(clips)
        .where(eq(clips.projectId, projectId))
        .orderBy(clips.startTime);

      const projectJobs = await db
        .select()
        .from(jobs)
        .where(eq(jobs.projectId, projectId))
        .orderBy(desc(jobs.createdAt))
        .limit(5);

      const mediaToken = createSignedProjectToken(projectId, dbUser.id);
      const sourceMediaUrl = project.videoPath
        ? `/api/media/project/${projectId}?token=${encodeURIComponent(mediaToken)}`
        : null;
      const eventsStreamUrl = `/api/projects/${projectId}/events?token=${encodeURIComponent(mediaToken)}`;

      res.json({
        project,
        clips: projectClips,
        latestJob: projectJobs[0] || null,
        sourceMediaUrl,
        eventsStreamUrl,
      });
    } catch (error) {
      console.error('Failed to get project details:', error);
      res.status(500).json({ error: 'Failed to load project.' });
    }
  });

  // Real-time Server-Sent Events stream for background job progress
  app.get('/api/projects/:id/events', async (req, res) => {
    const projectId = Number(req.params.id);
    const token = String(req.query.token || '');
    if (!Number.isFinite(projectId) || !verifySignedProjectToken(token, projectId)) {
      return res.status(401).json({ error: 'Unauthorized stream token.' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const listener = (payload: JobProgressEvent) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const channel = `project:${projectId}`;
    jobEvents.on(channel, listener);

    req.on('close', () => {
      jobEvents.off(channel, listener);
    });
  });

  // Authorized owner-only source video stream (Range-capable via sendFile)
  app.get('/api/media/project/:id', async (req, res) => {
    try {
      const projectId = Number(req.params.id);
      const token = String(req.query.token || '');
      if (!Number.isFinite(projectId) || !verifySignedProjectToken(token, projectId)) {
        return res.status(401).json({ error: 'Unauthorized media access token.' });
      }

      const rows = await db
        .select({ videoPath: projects.videoPath })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      const videoPath = rows[0]?.videoPath;
      if (!videoPath || !fs.existsSync(videoPath)) {
        return res.status(404).json({ error: 'Source video file not found.' });
      }

      res.sendFile(path.resolve(videoPath));
    } catch (error) {
      console.error('Authorized media stream failed:', error);
      res.status(500).json({ error: 'Unable to stream source media.' });
    }
  });

  // Retry failed project processing job
  app.post('/api/projects/:id/retry', requireAuth, async (req: AuthRequest, res) => {
    try {
      const dbUser = req.dbUser!;
      const projectId = Number(req.params.id);
      if (!Number.isFinite(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID.' });
      }

      const rows = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      const project = rows[0];
      if (!project || project.userId !== dbUser.id) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      if (project.status !== 'failed') {
        return res.status(400).json({ error: 'Only failed projects can be retried.' });
      }

      if (project.sourceType === 'upload' && (!project.videoPath || !fs.existsSync(project.videoPath))) {
        return res.status(400).json({
          error: 'Original uploaded video is no longer available on disk. Please upload the video again.',
        });
      }

      const preferredEngine = parseAiEngine((req.body as { aiEngine?: string })?.aiEngine);

      const updated = await db
        .update(projects)
        .set({
          status: 'queued',
          progress: 5,
          stageMessage: 'Re-queued for AI processing...',
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId))
        .returning();

      const insertedJob = await db
        .insert(jobs)
        .values({
          projectId,
          userId: dbUser.id,
          jobType: 'retry_auto_clip',
          status: 'queued',
          progress: 5,
          logsJson: [
            `[${new Date().toISOString().slice(11, 19)}] Retry requested by user (engine: ${preferredEngine}).`,
          ],
        })
        .returning();

      enqueueProjectProcessing(projectId, insertedJob[0].id, dbUser.id, preferredEngine);

      res.json({ project: updated[0], job: insertedJob[0] });
    } catch (error) {
      console.error('Retry failed:', error);
      res.status(500).json({ error: 'Unable to retry processing job.' });
    }
  });

  // Upload a video file and enqueue AI clipping pipeline
  app.post('/api/projects/upload', requireAuth, (req: AuthRequest, res) => {
    upload.single('video')(req, res, async (uploadErr) => {
      if (uploadErr) {
        return res.status(400).json({
          error: uploadErr instanceof Error ? uploadErr.message : 'File upload failed.',
        });
      }

      try {
        const dbUser = req.dbUser!;
        if (!req.file) {
          return res.status(400).json({ error: 'Please select a video file to upload.' });
        }

        const {
          title,
          targetClipDuration = '30-60',
          outputFormat = '9:16',
          language = 'auto',
          removeSilences = 'true',
          smartCrop = 'true',
          authorizedRights = 'false',
          aiEngine = 'auto',
        } = req.body as Record<string, string>;

        if (authorizedRights !== 'true') {
          fs.unlink(req.file.path, () => {});
          return res.status(403).json({
            error: 'Processing restricted: confirm you own or have explicit rights to process this uploaded video.',
          });
        }

        const projectTitle =
          (title && title.trim()) ||
          path.basename(req.file.originalname, path.extname(req.file.originalname)) ||
          'Uploaded Video';

        const insertedProject = await db
          .insert(projects)
          .values({
            userId: dbUser.id,
            title: projectTitle,
            sourceType: 'upload',
            videoPath: req.file.path,
            targetClipDuration,
            outputFormat,
            language,
            removeSilences: removeSilences !== 'false',
            smartCrop: smartCrop !== 'false',
            status: 'queued',
            progress: 5,
            stageMessage: 'Uploaded. Queued for AI processing...',
          })
          .returning();

        const project = insertedProject[0];
        const chosenEngine = parseAiEngine(aiEngine);

        const insertedJob = await db
          .insert(jobs)
          .values({
            projectId: project.id,
            userId: dbUser.id,
            jobType: 'auto_clip',
            status: 'queued',
            progress: 5,
            logsJson: [
              `[${new Date().toISOString().slice(11, 19)}] Authorized upload received (${Math.round(req.file.size / 1024)} KB, engine: ${chosenEngine}).`,
            ],
          })
          .returning();

        enqueueProjectProcessing(project.id, insertedJob[0].id, dbUser.id, chosenEngine);

        res.status(201).json({ project, job: insertedJob[0] });
      } catch (error) {
        console.error('Upload project creation failed:', error);
        res.status(500).json({ error: 'Failed to create project from uploaded video.' });
      }
    });
  });

  // Ingest an authorized YouTube URL and enqueue AI clipping pipeline
  app.post('/api/projects/youtube', requireAuth, async (req: AuthRequest, res) => {
    try {
      const dbUser = req.dbUser!;
      const {
        url,
        targetClipDuration = '30-60',
        outputFormat = '9:16',
        language = 'auto',
        removeSilences = true,
        smartCrop = true,
        authorizedRights = false,
        aiEngine = 'auto',
      } = req.body as {
        url?: string;
        targetClipDuration?: string;
        outputFormat?: string;
        language?: string;
        removeSilences?: boolean;
        smartCrop?: boolean;
        authorizedRights?: boolean;
        aiEngine?: string;
      };

      if (!authorizedRights) {
        return res.status(403).json({
          error: 'Processing restricted: confirm you own or have permission to clip this video source.',
        });
      }

      const parsed = parseYouTubeUrl(url || '');
      if (!parsed.valid || !parsed.normalizedUrl) {
        return res.status(400).json({ error: parsed.error || 'Invalid YouTube URL.' });
      }

      const meta = await fetchYouTubeMetadata(parsed.normalizedUrl);

      const insertedProject = await db
        .insert(projects)
        .values({
          userId: dbUser.id,
          title: meta.title,
          sourceType: 'youtube',
          sourceUrl: parsed.normalizedUrl,
          targetClipDuration,
          outputFormat,
          language,
          removeSilences,
          smartCrop,
          status: 'queued',
          progress: 5,
          stageMessage: 'YouTube link validated. Queued for stream extraction...',
        })
        .returning();

      const project = insertedProject[0];
      const chosenEngine = parseAiEngine(aiEngine);

      const insertedJob = await db
        .insert(jobs)
        .values({
          projectId: project.id,
          userId: dbUser.id,
          jobType: 'auto_clip',
          status: 'queued',
          progress: 5,
          logsJson: [
            `[${new Date().toISOString().slice(11, 19)}] Authorized YouTube URL validated ${parsed.normalizedUrl} (engine: ${chosenEngine}).`,
          ],
        })
        .returning();

      enqueueProjectProcessing(project.id, insertedJob[0].id, dbUser.id, chosenEngine);

      res.status(201).json({ project, job: insertedJob[0] });
    } catch (error) {
      console.error('YouTube project creation failed:', error);
      res.status(500).json({ error: 'Failed to create YouTube clipping project.' });
    }
  });

  // Launch full Gemini + FFmpeg AI pipeline on a real Studio Sample MP4
  app.post('/api/projects/sample', requireAuth, async (req: AuthRequest, res) => {
    try {
      await ensureDemoMediaReady();
      const dbUser = req.dbUser!;
      const {
        sampleId = 'sample-keynote',
        targetClipDuration = '15-30',
        outputFormat = '9:16',
        language = 'en',
        aiEngine = 'auto',
      } = req.body as {
        sampleId?: string;
        targetClipDuration?: string;
        outputFormat?: string;
        language?: string;
        aiEngine?: string;
      };

      const samples = getDemoSamples();
      const chosen = samples.find((s) => s.id === sampleId) || samples[0];

      const insertedProject = await db
        .insert(projects)
        .values({
          userId: dbUser.id,
          title: chosen.title,
          sourceType: 'sample',
          videoPath: chosen.filePath,
          targetClipDuration,
          outputFormat,
          language,
          removeSilences: true,
          smartCrop: true,
          status: 'queued',
          progress: 5,
          stageMessage: 'Studio media loaded. Queued for AI analysis...',
        })
        .returning();

      const project = insertedProject[0];
      const chosenEngine = parseAiEngine(aiEngine);

      const insertedJob = await db
        .insert(jobs)
        .values({
          projectId: project.id,
          userId: dbUser.id,
          jobType: 'auto_clip',
          status: 'queued',
          progress: 5,
          logsJson: [
            `[${new Date().toISOString().slice(11, 19)}] Loaded Studio Sample: ${chosen.title} (engine: ${chosenEngine}).`,
          ],
        })
        .returning();

      enqueueProjectProcessing(project.id, insertedJob[0].id, dbUser.id, chosenEngine);

      res.status(201).json({ project, job: insertedJob[0] });
    } catch (error) {
      console.error('Sample project creation failed:', error);
      res.status(500).json({ error: 'Failed to launch studio sample processing.' });
    }
  });

  app.delete('/api/projects/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const dbUser = req.dbUser!;
      const projectId = Number(req.params.id);
      const rows = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!rows[0] || rows[0].userId !== dbUser.id) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      await db.delete(projects).where(eq(projects.id, projectId));
      res.json({ deleted: true });
    } catch (error) {
      console.error('Failed to delete project:', error);
      res.status(500).json({ error: 'Failed to delete project.' });
    }
  });

  // Get single clip for Studio editing
  app.get('/api/clips/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const dbUser = req.dbUser!;
      const clipId = Number(req.params.id);
      const rows = await db.select().from(clips).where(eq(clips.id, clipId)).limit(1);
      const clip = rows[0];
      if (!clip || clip.userId !== dbUser.id) {
        return res.status(404).json({ error: 'Clip not found.' });
      }
      const projRows = await db
        .select()
        .from(projects)
        .where(eq(projects.id, clip.projectId))
        .limit(1);

      const mediaToken = createSignedProjectToken(clip.projectId, dbUser.id);
      const sourceMediaUrl = projRows[0]?.videoPath
        ? `/api/media/project/${clip.projectId}?token=${encodeURIComponent(mediaToken)}`
        : null;

      res.json({ clip, project: projRows[0] || null, sourceMediaUrl });
    } catch (error) {
      console.error('Failed to fetch clip:', error);
      res.status(500).json({ error: 'Failed to fetch clip.' });
    }
  });

  // Save clip edits (trim, captions, style, aspect ratio)
  app.patch('/api/clips/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const dbUser = req.dbUser!;
      const clipId = Number(req.params.id);
      const rows = await db.select().from(clips).where(eq(clips.id, clipId)).limit(1);
      const existing = rows[0];
      if (!existing || existing.userId !== dbUser.id) {
        return res.status(404).json({ error: 'Clip not found.' });
      }

      const body = req.body as Partial<{
        title: string;
        hookText: string;
        startTime: number;
        endTime: number;
        aspectRatio: string;
        speakerFocusX: number;
        captionStyle: CaptionStyleConfig;
        captionsJson: CaptionSegment[];
        exportQuality: string;
      }>;

      const startTime =
        typeof body.startTime === 'number' ? Math.max(0, body.startTime) : existing.startTime;
      const endTime =
        typeof body.endTime === 'number'
          ? Math.max(startTime + 2, body.endTime)
          : existing.endTime;

      const updated = await db
        .update(clips)
        .set({
          title: body.title?.trim() || existing.title,
          hookText: body.hookText !== undefined ? body.hookText : existing.hookText,
          startTime,
          endTime,
          duration: Number((endTime - startTime).toFixed(2)),
          aspectRatio: body.aspectRatio || existing.aspectRatio,
          speakerFocusX:
            typeof body.speakerFocusX === 'number'
              ? Math.min(1, Math.max(0, body.speakerFocusX))
              : existing.speakerFocusX,
          captionStyle: body.captionStyle || existing.captionStyle,
          captionsJson: body.captionsJson || existing.captionsJson,
          exportQuality: body.exportQuality || existing.exportQuality,
          updatedAt: new Date(),
        })
        .where(eq(clips.id, clipId))
        .returning();

      res.json({ clip: updated[0] });
    } catch (error) {
      console.error('Failed to update clip:', error);
      res.status(500).json({ error: 'Failed to save clip edits.' });
    }
  });

  // Render final MP4 export for authenticated user clip
  app.post('/api/clips/:id/export', requireAuth, async (req: AuthRequest, res) => {
    try {
      const dbUser = req.dbUser!;
      const clipId = Number(req.params.id);
      const clipRows = await db.select().from(clips).where(eq(clips.id, clipId)).limit(1);
      const clip = clipRows[0];
      if (!clip || clip.userId !== dbUser.id) {
        return res.status(404).json({ error: 'Clip not found.' });
      }

      const projRows = await db
        .select()
        .from(projects)
        .where(eq(projects.id, clip.projectId))
        .limit(1);
      const project = projRows[0];
      if (!project || !project.videoPath) {
        return res.status(400).json({ error: 'Source video file is unavailable for export.' });
      }

      const body = req.body as Partial<{
        startTime: number;
        endTime: number;
        aspectRatio: string;
        quality: string;
        speakerFocusX: number;
        captions: CaptionSegment[];
        captionStyle: CaptionStyleConfig;
      }>;

      const startTime = typeof body.startTime === 'number' ? body.startTime : clip.startTime;
      const endTime = typeof body.endTime === 'number' ? body.endTime : clip.endTime;
      const aspectRatio = body.aspectRatio || clip.aspectRatio || '9:16';
      const quality = body.quality || clip.exportQuality || '1080p';
      const speakerFocusX =
        typeof body.speakerFocusX === 'number' ? body.speakerFocusX : clip.speakerFocusX;
      const captions = body.captions || clip.captionsJson;
      const captionStyle = body.captionStyle || clip.captionStyle;

      const probe = await probeVideo(project.videoPath);
      const exportFile = `clip_${clipId}_${aspectRatio.replace(':', 'x')}_${quality}_${Date.now()}.mp4`;
      const exportAbs = path.join(EXPORTS_DIR, exportFile);

      await renderClipVideo({
        sourceVideoPath: project.videoPath,
        outputPath: exportAbs,
        startTime,
        endTime,
        srcWidth: probe.width,
        srcHeight: probe.height,
        hasAudio: probe.hasAudio,
        aspectRatio,
        speakerFocusX,
        quality,
        captions,
        captionStyle,
        burnCaptions: true,
      });

      const renderedPath = `/storage/exports/${exportFile}`;
      await db
        .update(clips)
        .set({
          renderedVideoPath: renderedPath,
          aspectRatio,
          exportQuality: quality,
          updatedAt: new Date(),
        })
        .where(eq(clips.id, clipId));

      res.json({
        downloadUrl: renderedPath,
        filename: `${clip.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48)}.mp4`,
      });
    } catch (error) {
      console.error('Clip export failed:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to export MP4 video.',
      });
    }
  });

  // Admin Dashboard Overview (PostgreSQL aggregates + recent queue jobs)
  app.get('/api/admin/overview', requireAuth, async (req: AuthRequest, res) => {
    try {
      const [{ count: totalUsers }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users);
      const [{ count: totalProjects }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(projects);
      const [{ count: totalClips }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(clips);

      const recentJobs = await db
        .select({
          id: jobs.id,
          projectId: jobs.projectId,
          jobType: jobs.jobType,
          status: jobs.status,
          progress: jobs.progress,
          logsJson: jobs.logsJson,
          createdAt: jobs.createdAt,
          completedAt: jobs.completedAt,
        })
        .from(jobs)
        .orderBy(desc(jobs.createdAt))
        .limit(15);

      const recentProjects = await db
        .select({
          id: projects.id,
          title: projects.title,
          sourceType: projects.sourceType,
          outputFormat: projects.outputFormat,
          status: projects.status,
          progress: projects.progress,
          durationSeconds: projects.durationSeconds,
          createdAt: projects.createdAt,
        })
        .from(projects)
        .orderBy(desc(projects.createdAt))
        .limit(15);

      res.json({
        metrics: {
          totalUsers: Number(totalUsers) || 0,
          totalProjects: Number(totalProjects) || 0,
          totalClips: Number(totalClips) || 0,
          activeJobs: recentJobs.filter(
            (j) => j.status !== 'completed' && j.status !== 'failed'
          ).length,
        },
        recentJobs,
        recentProjects,
        currentUser: req.dbUser,
      });
    } catch (error) {
      console.error('Admin overview failed:', error);
      res.status(500).json({ error: 'Failed to load admin overview.' });
    }
  });

  // Vite middleware in dev; static dist/ in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ClipGenius AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
