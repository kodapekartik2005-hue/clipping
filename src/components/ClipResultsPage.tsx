import React, { useState } from 'react';
import { ArrowLeft, Download, FileText, Scissors } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import type { ClipItem, ProjectItem } from '../types/app.ts';
import { formatDurationCompact } from '../utils/clipLogic.ts';

interface ClipResultsPageProps {
  project: ProjectItem;
  clips: ClipItem[];
  onEditClip: (clip: ClipItem) => void;
  onBack: () => void;
}

export function ClipResultsPage({
  project,
  clips,
  onEditClip,
  onBack,
}: ClipResultsPageProps) {
  const { firebaseUser, authFetch } = useAuth();
  const [showTranscript, setShowTranscript] = useState(false);
  const [exportingId, setExportingId] = useState<number | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [readyDownloads, setReadyDownloads] = useState<Record<number, { url: string; filename: string }>>({});

  const handleQuickExport = async (clip: ClipItem) => {
    setExportError(null);
    setExportingId(clip.id);
    try {
      const endpoint = firebaseUser
        ? `/api/clips/${clip.id}/export`
        : `/api/demo/clips/${clip.id}/export`;
      const fetchFn = firebaseUser ? authFetch : fetch;

      const res = await fetchFn(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: clip.startTime,
          endTime: clip.endTime,
          aspectRatio: clip.aspectRatio || '9:16',
          quality: '1080p',
          speakerFocusX: clip.speakerFocusX ?? 0.5,
          captions: clip.captionsJson,
          captionStyle: clip.captionStyle,
        }),
      });
      const data = (await res.json()) as {
        downloadUrl?: string;
        filename?: string;
        error?: string;
      };
      if (!res.ok || !data.downloadUrl) {
        throw new Error(data.error || 'Export failed.');
      }

      setReadyDownloads((prev) => ({
        ...prev,
        [clip.id]: {
          url: data.downloadUrl!,
          filename: data.filename || `clip_${clip.id}.mp4`,
        },
      }));
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'MP4 export failed.');
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Projects</span>
          </button>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white">
            {project.title}
          </h1>
          <p className="text-xs text-slate-400 tabular-nums">
            {clips.length} AI-generated clips · {formatDurationCompact(project.durationSeconds)} source ·{' '}
            {project.outputFormat} target format
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowTranscript((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#0B0F1A] px-4 py-2 text-xs font-medium text-slate-200 hover:bg-white/[0.06] whitespace-nowrap self-start cursor-pointer"
        >
          <FileText className="h-4 w-4 text-indigo-400" />
          <span>{showTranscript ? 'Hide Transcript' : 'Full Transcript'}</span>
        </button>
      </div>

      {exportError && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200"
        >
          {exportError}
        </div>
      )}

      {showTranscript && (
        <div className="rounded-xl border border-white/[0.08] bg-[#0B0F1A] p-5 space-y-3 max-h-72 overflow-y-auto">
          <h2 className="font-display text-sm font-semibold text-white">
            Speech Recognition Transcript
          </h2>
          {project.transcriptJson && project.transcriptJson.length > 0 ? (
            <div className="space-y-2 text-xs text-slate-300">
              {project.transcriptJson.map((seg, idx) => (
                <p key={idx} className="leading-relaxed">
                  <span className="font-mono text-indigo-400 mr-2 tabular-nums">
                    {formatDurationCompact(seg.start)}
                  </span>
                  <span className="font-semibold text-white mr-1.5">{seg.speaker}:</span>
                  <span>{seg.text}</span>
                </p>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              Sentence-aligned transcript captions are embedded inside each clip card below.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {clips.map((clip, idx) => {
          const videoSrc =
            clip.previewVideoPath || clip.previewVideoUrl || clip.sourceVideoUrl || '';
          const ready = readyDownloads[clip.id];
          const firstCaption = clip.captionsJson?.[0]?.text || clip.summary;

          return (
            <article
              key={clip.id}
              className="rounded-2xl border border-white/[0.08] bg-[#0B0F1A] overflow-hidden flex flex-col justify-between"
            >
              <div>
                <div className="relative bg-[#07090F] h-64 w-full overflow-hidden border-b border-white/[0.06]">
                  {videoSrc ? (
                    <video
                      src={`${videoSrc}#t=${clip.startTime + 0.2},${clip.endTime}`}
                      poster={
                        project.thumbnailUrl ||
                        (project.title.toLowerCase().includes('podcast')
                          ? '/src/assets/images/creator_podcast_thumb_1795270019943.jpg'
                          : '/src/assets/images/creator_tech_keynote_1795270018985.jpg')
                      }
                      controls
                      preload="auto"
                      className="h-full w-full object-cover"
                      style={{
                        objectPosition: `${Math.round((clip.speakerFocusX ?? 0.5) * 100)}% center`,
                      }}
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-xs text-slate-500">
                      Preview rendering
                    </div>
                  )}
                </div>

                <div className="p-5 space-y-2.5">
                  <p className="text-xs text-slate-400 tabular-nums">
                    Clip 0{idx + 1} · {formatDurationCompact(clip.duration)} · {clip.aspectRatio} ·{' '}
                    {clip.engagementScore}% retention match
                  </p>
                  <h2 className="font-display text-base font-semibold text-white leading-snug">
                    {clip.title}
                  </h2>
                  {clip.hookText && (
                    <p className="text-xs font-medium text-blue-400">
                      Hook: {clip.hookText}
                    </p>
                  )}
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    “{firstCaption}”
                  </p>
                </div>
              </div>

              <div className="px-5 pb-5 pt-2 flex flex-col gap-2">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => onEditClip(clip)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90 whitespace-nowrap cursor-pointer"
                  >
                    <Scissors className="h-3.5 w-3.5" />
                    <span>Edit in Studio</span>
                  </button>

                  <button
                    type="button"
                    disabled={exportingId === clip.id}
                    onClick={() => handleQuickExport(clip)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-white/[0.09] disabled:opacity-60 whitespace-nowrap cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>{exportingId === clip.id ? 'Rendering...' : 'Render MP4'}</span>
                  </button>
                </div>

                {(ready || clip.previewVideoPath) && (
                  <a
                    href={ready ? ready.url : clip.previewVideoPath!}
                    download={
                      ready
                        ? ready.filename
                        : `${clip.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48)}.mp4`
                    }
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>{ready ? 'Download 1080p MP4' : 'Download Subtitled MP4'}</span>
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
