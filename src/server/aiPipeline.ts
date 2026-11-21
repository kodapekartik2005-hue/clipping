import { analyzeAudioForClips, isGeminiConfigured, type VideoAiAnalysisResult } from './gemini.ts';
import { analyzeAudioWithOpenAI, isOpenAiConfigured } from './openai.ts';

export type AiEngineChoice = 'auto' | 'openai' | 'gemini';

export interface ServerCapabilities {
  openaiConfigured: boolean;
  geminiConfigured: boolean;
  activeDefaultEngine: 'openai' | 'gemini' | 'none';
}

export function getServerAiCapabilities(): ServerCapabilities {
  const openaiConfigured = isOpenAiConfigured();
  const geminiConfigured = isGeminiConfigured();
  const activeDefaultEngine = openaiConfigured
    ? 'openai'
    : geminiConfigured
      ? 'gemini'
      : 'none';

  return {
    openaiConfigured,
    geminiConfigured,
    activeDefaultEngine,
  };
}

export async function runTranscriptAndHighlightPipeline(params: {
  audioPath: string;
  videoDuration: number;
  targetClipDuration: string;
  language: string;
  preferredEngine?: AiEngineChoice;
}): Promise<VideoAiAnalysisResult & { engineUsed: 'openai' | 'gemini' }> {
  const preferred = params.preferredEngine || 'auto';
  const openaiReady = isOpenAiConfigured();
  const geminiReady = isGeminiConfigured();

  if (preferred === 'openai') {
    if (!openaiReady) {
      throw new Error(
        'OPENAI_API_KEY is not configured in server environment variables.'
      );
    }
    const result = await analyzeAudioWithOpenAI(
      params.audioPath,
      params.videoDuration,
      params.targetClipDuration,
      params.language
    );
    return { ...result, engineUsed: 'openai' };
  }

  if (preferred === 'gemini') {
    if (!geminiReady) {
      throw new Error(
        'GEMINI_API_KEY is not configured in server environment secrets.'
      );
    }
    const result = await analyzeAudioForClips(
      params.audioPath,
      params.videoDuration,
      params.targetClipDuration,
      params.language
    );
    return { ...result, engineUsed: 'gemini' };
  }

  // Auto mode: prefer OpenAI if OPENAI_API_KEY is configured, otherwise Gemini if configured
  if (openaiReady) {
    const result = await analyzeAudioWithOpenAI(
      params.audioPath,
      params.videoDuration,
      params.targetClipDuration,
      params.language
    );
    return { ...result, engineUsed: 'openai' };
  }

  if (geminiReady) {
    const result = await analyzeAudioForClips(
      params.audioPath,
      params.videoDuration,
      params.targetClipDuration,
      params.language
    );
    return { ...result, engineUsed: 'gemini' };
  }

  throw new Error(
    'No AI provider key is configured on the server. Set OPENAI_API_KEY or GEMINI_API_KEY in server environment variables.'
  );
}
