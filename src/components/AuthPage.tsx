import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, PlayCircle, Shield } from 'lucide-react';
import type { PageRoute } from '../types/app.ts';

interface AuthPageProps {
  onGoogleSignIn: () => Promise<boolean>;
  onEnterDemo: () => Promise<void>;
  authError: string | null;
  onNavigate: (route: PageRoute) => void;
}

export function AuthPage({
  onGoogleSignIn,
  onEnterDemo,
  authError,
  onNavigate,
}: AuthPageProps) {
  const [submitting, setSubmitting] = useState(false);

  const handleGoogle = async () => {
    setSubmitting(true);
    const ok = await onGoogleSignIn();
    setSubmitting(false);
    if (ok) {
      onNavigate('dashboard');
    }
  };

  const handleDemo = async () => {
    setSubmitting(true);
    await onEnterDemo();
    setSubmitting(false);
    onNavigate('dashboard');
  };

  return (
    <div className="min-h-[calc(100vh-69px)] bg-[#07090F] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0B0F1A] p-8 space-y-6">
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold tracking-tight text-white">
            Sign in to ClipGenius AI
          </h1>
          <p className="text-sm text-slate-400">
            Access your saved video projects, background AI clipping queue, and 1080p MP4 exports.
          </p>
        </div>

        {authError && (
          <div
            role="alert"
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200"
          >
            {authError}
          </div>
        )}

        <div className="space-y-3">
          <button
            type="button"
            disabled={submitting}
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition-opacity hover:opacity-95 disabled:opacity-60 cursor-pointer"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
            <span>{submitting ? 'Connecting...' : 'Continue with Google'}</span>
          </button>

          <div className="relative py-2 flex items-center">
            <div className="flex-grow border-t border-white/[0.08]" />
            <span className="px-3 text-xs text-slate-500">or preview without account</span>
            <div className="flex-grow border-t border-white/[0.08]" />
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={handleDemo}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-indigo-500/40 bg-indigo-500/15 px-4 py-3 text-sm font-semibold text-indigo-200 transition-colors hover:bg-indigo-500/25 cursor-pointer"
          >
            <PlayCircle className="h-4 w-4" />
            <span>Explore Interactive Studio Demo</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="border-t border-white/[0.08] pt-5 space-y-2.5 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-blue-400 shrink-0" />
            <span>Includes 60 free monthly AI video processing minutes</span>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-indigo-400 shrink-0" />
            <span>Protected by Firebase Authentication & encrypted media storage</span>
          </div>
        </div>
      </div>
    </div>
  );
}
