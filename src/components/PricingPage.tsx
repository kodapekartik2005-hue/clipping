import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import type { PageRoute } from '../types/app.ts';

interface PricingPageProps {
  onNavigate: (route: PageRoute) => void;
}

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    audience: 'For solo creators testing short-form',
    monthlyPrice: 0,
    annualPrice: 0,
    monthlyUnit: '/ month',
    annualUnit: '/ year',
    minutes: '60 min / month',
    clipLimit: 'Up to 5 clips per video',
    exportRes: '720p HD MP4 export',
    features: [
      'YouTube URL & local MP4 upload',
      'Automated speech-to-text captions',
      '9:16 vertical smart cropping',
      '2 caption templates',
    ],
  },
  {
    id: 'pro',
    name: 'Creator Pro',
    audience: 'For daily YouTube, Reels & TikTok channels',
    monthlyPrice: 1,
    annualPrice: 14,
    monthlyUnit: '/ month',
    annualUnit: '/ year',
    minutes: '600 min / month',
    clipLimit: 'Up to 10 clips per video',
    exportRes: '1080p Full HD MP4 export',
    recommended: true,
    features: [
      'Priority background processing queue',
      'All 4 animated caption templates',
      'Active speaker tracking + silence removal',
      '9:16, 1:1 square & 16:9 multi-ratio export',
    ],
  },
  {
    id: 'studio',
    name: 'Studio Team',
    audience: 'For agencies, podcasters & media networks',
    monthlyPrice: 15,
    annualPrice: 12,
    monthlyUnit: '/ month',
    annualUnit: '/ month · billed yearly',
    minutes: '2,400 min / month',
    clipLimit: 'Unlimited clips per video',
    exportRes: '4K Ultra HD MP4 export',
    features: [
      'Multi-language transcription (30+ languages)',
      'Custom font, color & brand hook presets',
      'Dedicated queue telemetry & admin logs',
      'Batch MP4 rendering & priority support',
    ],
  },
];

export function PricingPage({ onNavigate }: PricingPageProps) {
  const { profile, firebaseUser, isDemoMode, authFetch, refreshProfile } = useAuth();
  const [annual, setAnnual] = useState(false);
  const [savingPlan, setSavingPlan] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSelectPlan = async (planId: string) => {
    setNotice(null);
    if (!firebaseUser) {
      if (isDemoMode) {
        setNotice(`Demo preview selected "${planId.toUpperCase()}" tier. Sign in with Google to persist subscription changes.`);
        return;
      }
      onNavigate('auth');
      return;
    }

    setSavingPlan(planId);
    try {
      const res = await authFetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      });
      if (res.ok) {
        await refreshProfile();
        setNotice(`Workspace plan updated to ${planId.toUpperCase()}.`);
      } else {
        setNotice('Could not update plan right now.');
      }
    } finally {
      setSavingPlan(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 space-y-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">
            Transparent plans built around monthly video minutes
          </h1>
          <p className="text-sm sm:text-base text-slate-400">
            Every plan includes AI highlight detection, sentence-safe boundary snapping, and animated word-level caption editing.
          </p>
        </div>

        <div className="inline-flex items-center rounded-lg border border-white/10 bg-[#0B0F1A] p-1 shrink-0">
          <button
            type="button"
            onClick={() => setAnnual(false)}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              !annual ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setAnnual(true)}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              annual ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Yearly
          </button>
        </div>
      </div>

      {notice && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {PLANS.map((plan) => {
          const price = annual ? plan.annualPrice : plan.monthlyPrice;
          const unit = annual ? plan.annualUnit : plan.monthlyUnit;
          const isCurrent = profile?.plan === plan.id;

          return (
            <div
              key={plan.id}
              className={`rounded-2xl border p-7 flex flex-col justify-between space-y-6 ${
                plan.recommended
                  ? 'border-indigo-500/60 bg-[#0F1629]'
                  : 'border-white/[0.08] bg-[#0B0F1A]'
              }`}
            >
              <div className="space-y-5">
                <div>
                  <h2 className="font-display text-xl font-bold text-white">{plan.name}</h2>
                  <p className="text-xs text-slate-400 mt-1">{plan.audience}</p>
                </div>

                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-display text-4xl font-bold text-white tabular-nums">
                      ${price}
                    </span>
                    <span className="text-sm text-slate-400">{unit}</span>
                  </div>
                  {plan.id === 'pro' && (
                    <p className="text-xs text-slate-400 mt-1">
                      {annual ? `or $${plan.monthlyPrice} / month` : `or $${plan.annualPrice} / year`}
                    </p>
                  )}
                </div>

                <div className="border-y border-white/[0.08] py-4 space-y-1.5 text-xs text-slate-300">
                  <p className="font-semibold text-white tabular-nums">{plan.minutes}</p>
                  <p>{plan.clipLimit}</p>
                  <p>{plan.exportRes}</p>
                </div>

                <ul className="space-y-2.5 text-sm text-slate-300">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                disabled={savingPlan === plan.id || isCurrent}
                onClick={() => handleSelectPlan(plan.id)}
                className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity cursor-pointer ${
                  isCurrent
                    ? 'border border-white/15 bg-white/[0.04] text-slate-400 cursor-default'
                    : plan.recommended
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:opacity-90'
                      : 'border border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]'
                }`}
              >
                {isCurrent
                  ? 'Current Plan'
                  : savingPlan === plan.id
                    ? 'Updating...'
                    : `Select ${plan.name}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
