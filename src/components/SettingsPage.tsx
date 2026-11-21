import React, { useState } from 'react';
import { Save } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import type { PageRoute } from '../types/app.ts';

interface SettingsPageProps {
  onNavigate: (route: PageRoute) => void;
}

export function SettingsPage({ onNavigate }: SettingsPageProps) {
  const { profile, firebaseUser, isDemoMode, authFetch, refreshProfile, signOut } = useAuth();

  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [defaultLanguage, setDefaultLanguage] = useState(profile?.defaultLanguage || 'en');
  const [defaultAspectRatio, setDefaultAspectRatio] = useState(
    profile?.defaultAspectRatio || '9:16'
  );
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (!firebaseUser) {
      setStatusMessage(
        isDemoMode
          ? 'Settings updated for current demo session. Sign in with Google to save permanently.'
          : 'Please sign in first.'
      );
      return;
    }

    setSaving(true);
    try {
      const res = await authFetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          defaultLanguage,
          defaultAspectRatio,
        }),
      });
      if (res.ok) {
        await refreshProfile();
        setStatusMessage('Profile and workspace defaults saved.');
      } else {
        setStatusMessage('Failed to save settings.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Profile & Studio Defaults</h1>
        <p className="text-sm text-slate-400 mt-1">
          Configure your creator profile, default transcription language, and preferred export aspect ratio.
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="rounded-2xl border border-white/[0.08] bg-[#0B0F1A] p-6 sm:p-8 space-y-6"
      >
        <div className="flex items-center gap-4 pb-6 border-b border-white/[0.08]">
          <img
            src={
              profile?.avatarUrl ||
              '/src/assets/images/avatar_creator_profile_1795270019068.jpg'
            }
            alt="Account portrait"
            referrerPolicy="no-referrer"
            className="h-16 w-16 rounded-full object-cover border border-white/10"
          />
          <div>
            <p className="font-display text-lg font-semibold text-white">
              {profile?.displayName || 'Creator Account'}
            </p>
            <p className="text-sm text-slate-400">{profile?.email || 'Not signed in'}</p>
            <p className="text-xs text-indigo-300 mt-1">
              Plan: {(profile?.plan || 'starter').toUpperCase()} ·{' '}
              <span className="tabular-nums">{profile?.creditsMinutes ?? 60}</span> minutes remaining
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="sm:col-span-2 space-y-1.5">
            <label htmlFor="settings-name" className="block text-xs font-medium text-slate-300">
              Display Name
            </label>
            <input
              id="settings-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your creator or studio name"
              className="w-full rounded-lg border border-white/10 bg-[#07090F] px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="settings-lang" className="block text-xs font-medium text-slate-300">
              Default Caption Language
            </label>
            <select
              id="settings-lang"
              value={defaultLanguage}
              onChange={(e) => setDefaultLanguage(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#07090F] px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="en">English (en)</option>
              <option value="auto">Auto-Detect</option>
              <option value="es">Spanish (es)</option>
              <option value="fr">French (fr)</option>
              <option value="de">German (de)</option>
              <option value="hi">Hindi (hi)</option>
              <option value="ja">Japanese (ja)</option>
              <option value="pt">Portuguese (pt)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="settings-ratio" className="block text-xs font-medium text-slate-300">
              Default Output Aspect Ratio
            </label>
            <select
              id="settings-ratio"
              value={defaultAspectRatio}
              onChange={(e) => setDefaultAspectRatio(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#07090F] px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="9:16">9:16 Vertical (Shorts / Reels / TikTok)</option>
              <option value="16:9">16:9 Landscape</option>
              <option value="1:1">1:1 Square</option>
            </select>
          </div>
        </div>

        {statusMessage && (
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">
            {statusMessage}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <button
            type="button"
            onClick={() => onNavigate('pricing')}
            className="text-sm font-medium text-indigo-400 hover:text-indigo-300 cursor-pointer"
          >
            Manage Subscription Plan
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={async () => {
                await signOut();
                onNavigate('landing');
              }}
              className="rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/[0.05] cursor-pointer"
            >
              Sign Out
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 cursor-pointer"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? 'Saving...' : 'Save Preferences'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
