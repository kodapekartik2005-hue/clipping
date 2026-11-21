import React, { useState } from 'react';
import {
  CreditCard,
  Film,
  LayoutDashboard,
  LogOut,
  Menu,
  Scissors,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type { PageRoute, UserProfile } from '../types/app.ts';

interface PublicTopBarProps {
  currentRoute: PageRoute;
  onNavigate: (route: PageRoute) => void;
  isAuthenticated: boolean;
}

export function PublicTopBar({
  currentRoute,
  onNavigate,
  isAuthenticated,
}: PublicTopBarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#07090F]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-8 px-6 py-4">
        <button
          type="button"
          onClick={() => onNavigate('landing')}
          className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 cursor-pointer"
        >
          ClipGenius AI
        </button>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
          <button
            type="button"
            onClick={() => onNavigate('landing')}
            className={`whitespace-nowrap shrink-0 transition-colors hover:text-white cursor-pointer ${
              currentRoute === 'landing' ? 'text-white' : ''
            }`}
          >
            Platform
          </button>
          <button
            type="button"
            onClick={() => onNavigate('studio')}
            className={`whitespace-nowrap shrink-0 transition-colors hover:text-white cursor-pointer ${
              currentRoute === 'studio' ? 'text-white' : ''
            }`}
          >
            Editing Studio
          </button>
          <button
            type="button"
            onClick={() => onNavigate('pricing')}
            className={`whitespace-nowrap shrink-0 transition-colors hover:text-white cursor-pointer ${
              currentRoute === 'pricing' ? 'text-white' : ''
            }`}
          >
            Pricing
          </button>
          <button
            type="button"
            onClick={() => onNavigate(isAuthenticated ? 'dashboard' : 'auth')}
            className={`whitespace-nowrap shrink-0 transition-colors hover:text-white cursor-pointer ${
              currentRoute === 'auth' ? 'text-white' : ''
            }`}
          >
            {isAuthenticated ? 'Workspace' : 'Sign In'}
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate(isAuthenticated ? 'dashboard' : 'auth')}
            className="hidden sm:inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isAuthenticated ? 'Open Dashboard' : 'Start Clipping'}
          </button>
          <button
            type="button"
            aria-label="Toggle navigation menu"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-slate-200 hover:bg-white/5"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-white/[0.08] bg-[#0B0F1A] px-6 py-4 space-y-3">
          <button
            type="button"
            onClick={() => {
              onNavigate('landing');
              setMobileMenuOpen(false);
            }}
            className="block w-full text-left py-2 text-sm font-medium text-slate-200"
          >
            Platform
          </button>
          <button
            type="button"
            onClick={() => {
              onNavigate('studio');
              setMobileMenuOpen(false);
            }}
            className="block w-full text-left py-2 text-sm font-medium text-slate-200"
          >
            Editing Studio
          </button>
          <button
            type="button"
            onClick={() => {
              onNavigate('pricing');
              setMobileMenuOpen(false);
            }}
            className="block w-full text-left py-2 text-sm font-medium text-slate-200"
          >
            Pricing
          </button>
          <button
            type="button"
            onClick={() => {
              onNavigate(isAuthenticated ? 'dashboard' : 'auth');
              setMobileMenuOpen(false);
            }}
            className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white"
          >
            {isAuthenticated ? 'Open Dashboard' : 'Start Clipping'}
          </button>
        </div>
      )}
    </header>
  );
}

interface WorkspaceShellProps {
  currentRoute: PageRoute;
  onNavigate: (route: PageRoute) => void;
  profile: UserProfile | null;
  isDemoMode: boolean;
  onSignOut: () => void;
  breadcrumb: string;
  primaryAction?: React.ReactNode;
  children: React.ReactNode;
}

export function WorkspaceShell({
  currentRoute,
  onNavigate,
  profile,
  isDemoMode,
  onSignOut,
  breadcrumb,
  primaryAction,
  children,
}: WorkspaceShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navItems: Array<{ route: PageRoute; label: string; icon: React.ReactNode }> = [
    { route: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
    { route: 'results', label: 'Clip Results', icon: <Film className="h-4 w-4" /> },
    { route: 'studio', label: 'Editing Studio', icon: <Scissors className="h-4 w-4" /> },
    { route: 'pricing', label: 'Subscription', icon: <CreditCard className="h-4 w-4" /> },
    { route: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
    { route: 'admin', label: 'Admin Queue', icon: <ShieldCheck className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#07090F] text-slate-100 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-white/[0.08] bg-[#0B0F1A]">
        <div className="flex h-16 items-center px-6 border-b border-white/[0.08]">
          <button
            type="button"
            onClick={() => onNavigate('landing')}
            className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            ClipGenius AI
          </button>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1">
          {navItems.map((item) => {
            const active =
              currentRoute === item.route ||
              (currentRoute === 'processing' && item.route === 'dashboard');
            return (
              <button
                key={item.route}
                type="button"
                onClick={() => onNavigate(item.route)}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-indigo-600/15 text-white border border-indigo-500/30'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100 border border-transparent'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/[0.08] p-4 space-y-3">
          {isDemoMode && (
            <div className="rounded-lg border border-indigo-500/25 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-200">
              Interactive Demo Mode · Sign in with Google for cloud persistence
            </div>
          )}
          <div className="flex items-center gap-3">
            <img
              src={
                profile?.avatarUrl ||
                '/src/assets/images/avatar_creator_profile_1795270019068.jpg'
              }
              alt={profile?.displayName || 'Creator avatar'}
              referrerPolicy="no-referrer"
              className="h-9 w-9 rounded-full object-cover border border-white/10 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {profile?.displayName || 'Creator'}
              </p>
              <p className="truncate text-xs text-slate-400">
                {(profile?.plan || 'starter').toUpperCase()} ·{' '}
                <span className="tabular-nums">{profile?.creditsMinutes ?? 60}m</span>
              </p>
            </div>
            <button
              type="button"
              aria-label="Sign out"
              onClick={onSignOut}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-white/5 hover:text-white cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-white/[0.08] bg-[#07090F]/90 px-4 sm:px-8 backdrop-blur-md">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open workspace navigation"
              onClick={() => setMobileNavOpen((v) => !v)}
              className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-slate-200 hover:bg-white/5 shrink-0"
            >
              {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-400 min-w-0">
              <Sparkles className="h-4 w-4 text-indigo-400 shrink-0" />
              <span className="truncate font-medium text-slate-200">{breadcrumb}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">{primaryAction}</div>
        </header>

        {mobileNavOpen && (
          <div className="lg:hidden border-b border-white/[0.08] bg-[#0B0F1A] px-4 py-3 grid grid-cols-2 gap-2">
            {navItems.map((item) => {
              const active = currentRoute === item.route;
              return (
                <button
                  key={item.route}
                  type="button"
                  onClick={() => {
                    onNavigate(item.route);
                    setMobileNavOpen(false);
                  }}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${
                    active
                      ? 'bg-indigo-600/20 text-white border border-indigo-500/30'
                      : 'text-slate-300 bg-white/[0.02] border border-white/[0.06]'
                  }`}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setMobileNavOpen(false);
                onSignOut();
              }}
              className="col-span-2 flex items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </div>
        )}

        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
