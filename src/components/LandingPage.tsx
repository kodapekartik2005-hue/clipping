import React from 'react';
import { ArrowRight, Play, Scissors, Subtitles, Video } from 'lucide-react';
import type { PageRoute } from '../types/app.ts';

interface LandingPageProps {
  onNavigate: (route: PageRoute) => void;
  onStartDemo: () => Promise<void>;
  onOpenSampleStudio: () => Promise<void>;
  isAuthenticated: boolean;
}

export function LandingPage({
  onNavigate,
  onStartDemo,
  onOpenSampleStudio,
  isAuthenticated,
}: LandingPageProps) {
  return (
    <div className="min-h-screen bg-[#07090F] text-slate-100">
      {/* Hero Section */}
      <section className="mx-auto max-w-[1280px] px-6 pt-14 pb-20 lg:pt-20 lg:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          <div className="lg:col-span-6 space-y-6">
            <p className="text-sm font-medium text-indigo-400">
              AI Video Clipping · Speech-Synced Captions · 9:16 Export
            </p>
            <h1
              className="font-display font-bold tracking-tight text-white leading-[1.08]"
              style={{ fontSize: 'clamp(2.25rem, 4vw, 3.65rem)', textWrap: 'balance' }}
            >
              Turn long-form video into viral vertical shorts in one click.
            </h1>
            <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl">
              Paste a YouTube link or upload a recording. ClipGenius AI locates high-retention hooks, cuts on clean sentence boundaries, centers active speakers in 9:16, and renders animated captions ready for Shorts, Reels, and TikTok.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                type="button"
                onClick={() => (isAuthenticated ? onNavigate('dashboard') : onStartDemo())}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>{isAuthenticated ? 'Open Workspace' : 'Try Studio Demo'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('auth')}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.03] px-5 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.07] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Sign In with Google</span>
              </button>
            </div>

            <div className="pt-4 border-t border-white/[0.08] grid grid-cols-3 gap-6 max-w-lg">
              <div>
                <p className="font-display text-2xl font-bold text-white tabular-nums">5–10</p>
                <p className="text-xs text-slate-400 mt-0.5">Clips per video</p>
              </div>
              <div>
                <p className="font-display text-2xl font-bold text-white tabular-nums">15–60s</p>
                <p className="text-xs text-slate-400 mt-0.5">Sentence-safe cuts</p>
              </div>
              <div>
                <p className="font-display text-2xl font-bold text-white tabular-nums">1080p</p>
                <p className="text-xs text-slate-400 mt-0.5">MP4 studio render</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0B0F1A]">
              <img
                src="/src/assets/images/hero_clipping_studio_1795270020171.jpg"
                alt="ClipGenius AI vertical short-form editing monitor with waveform and kinetic captions"
                referrerPolicy="no-referrer"
                className="w-full aspect-video object-cover"
              />
              <div className="border-t border-white/[0.08] bg-[#0B0F1A]/95 px-5 py-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    Automated 9:16 Speaker Crop + Word-Synced Captions
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    00:22 duration · 94% hook retention · MP4 export ready
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onOpenSampleStudio}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/15 px-3.5 py-2 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/25 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>Inspect Studio</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4-Step Pipeline */}
      <section className="border-t border-white/[0.08] bg-[#0B0F1A]/60 py-20">
        <div className="mx-auto max-w-[1280px] px-6">
          <div className="max-w-2xl mb-12">
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
              From raw footage to scheduled shorts without manual timeline scrubbing
            </h2>
            <p className="mt-3 text-slate-400 text-base">
              Every uploaded file or YouTube link runs through an automated multi-stage pipeline combining speech recognition, narrative hook scoring, and FFmpeg video rendering.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                num: '01. Ingest & Transcribe',
                desc: 'Extract 16kHz audio and generate word-accurate multi-language transcripts with speaker turns.',
              },
              {
                num: '02. Detect Viral Hooks',
                desc: 'Score engaging moments between 15 and 60 seconds, snapping cleanly to sentence edges.',
              },
              {
                num: '03. Smart 9:16 Framing',
                desc: 'Convert 16:9 widescreen into 9:16 vertical, 1:1 square, or 16:9 keeping the speaker centered.',
              },
              {
                num: '04. Burn-In Captions & MP4',
                desc: 'Customize templates, font size, colors, and progress bars, then download crisp 1080p MP4s.',
              },
            ].map((step) => (
              <div
                key={step.num}
                className="rounded-xl border border-white/[0.08] bg-[#0F1524] p-6 space-y-2.5"
              >
                <h3 className="font-display text-base font-semibold text-white">{step.num}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Asymmetric Capabilities Showcase */}
      <section className="mx-auto max-w-[1280px] px-6 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-7 rounded-2xl border border-white/[0.08] bg-[#0F1524] overflow-hidden flex flex-col">
            <img
              src="/src/assets/images/creator_podcast_thumb_1795270019943.jpg"
              alt="Podcast studio hosts framed for automated dual-speaker clipping"
              referrerPolicy="no-referrer"
              className="w-full h-64 sm:h-72 object-cover"
            />
            <div className="p-7 flex-1 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Subtitles className="h-4 w-4 text-blue-400" />
                  <span>Animated Caption Engine · 4 Studio Templates</span>
                </div>
                <h3 className="font-display text-xl font-bold text-white">
                  Word-by-word emphasis synced directly to spoken cadence
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Edit any misheard word inline inside the Caption Editor. Switch between Kinetic Pop, Minimal Broadcast, Bold Highlight, and Clean Editorial styles with real-time frame preview before FFmpeg burn-in.
                </p>
              </div>
              <div>
                <button
                  type="button"
                  onClick={onOpenSampleStudio}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-blue-400 hover:text-blue-300 cursor-pointer"
                >
                  <span>Open Live Caption Studio</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 rounded-2xl border border-white/[0.08] bg-[#0F1524] overflow-hidden flex flex-col">
            <img
              src="/src/assets/images/creator_tech_keynote_1795270018985.jpg"
              alt="Keynote speaker centered on stage for smart vertical framing"
              referrerPolicy="no-referrer"
              className="w-full h-64 sm:h-72 object-cover"
            />
            <div className="p-7 flex-1 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Scissors className="h-4 w-4 text-indigo-400" />
                  <span>Smart Crop · 9:16 / 1:1 / 16:9</span>
                </div>
                <h3 className="font-display text-xl font-bold text-white">
                  One timeline, every social aspect ratio
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Export native 9:16 for YouTube Shorts, Instagram Reels, and TikTok, 1:1 square for LinkedIn feeds, or 16:9 landscape highlights in selectable 720p, 1080p, or 4K MP4 quality.
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-400 pt-2 border-t border-white/[0.06]">
                <span className="inline-flex items-center gap-1.5">
                  <Video className="h-3.5 w-3.5 text-slate-300" />
                  <span>H.264 MP4</span>
                </span>
                <span aria-hidden="true">·</span>
                <span>AAC 128kbps</span>
                <span aria-hidden="true">·</span>
                <span>Progress Bar Overlay</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom Conversion Banner */}
      <section className="mx-auto max-w-[1280px] px-6 pb-20">
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#11182B] to-[#0B0F1A] p-8 sm:p-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
              Ready to ship a week of short-form clips in minutes?
            </h2>
            <p className="text-sm sm:text-base text-slate-300">
              Start with 60 free monthly processing minutes or explore the interactive demo studio immediately.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onStartDemo}
              className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:opacity-90 whitespace-nowrap cursor-pointer"
            >
              Launch Demo Workspace
            </button>
            <button
              type="button"
              onClick={() => onNavigate('pricing')}
              className="rounded-lg border border-white/15 px-5 py-3 text-sm font-medium text-slate-200 hover:bg-white/[0.06] whitespace-nowrap cursor-pointer"
            >
              View Plans
            </button>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-white/[0.08] py-8">
        <div className="mx-auto max-w-[1280px] px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} ClipGenius AI. Automated video clipping & caption studio.</p>
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => onNavigate('pricing')}
              className="hover:text-slate-300 cursor-pointer"
            >
              Pricing
            </button>
            <button
              type="button"
              onClick={() => onNavigate('studio')}
              className="hover:text-slate-300 cursor-pointer"
            >
              Studio
            </button>
            <button
              type="button"
              onClick={() => onNavigate('auth')}
              className="hover:text-slate-300 cursor-pointer"
            >
              Account
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
