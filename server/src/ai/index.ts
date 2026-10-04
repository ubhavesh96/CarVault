import type { AIProvider } from './types';
import { mockProvider } from './mock';
import { claudeProvider } from './claude';

/** Resolved per call so a key added to .env (and a restart) is all that's needed. */
export function activeProvider(): AIProvider {
  const forced = (process.env.AI_PROVIDER || '').toLowerCase();
  if (forced === 'mock') return mockProvider;
  if (forced === 'claude' || process.env.ANTHROPIC_API_KEY) return claudeProvider;
  return mockProvider;
}

/** Run a provider call; if the live provider fails, degrade to the mock instead of breaking the app. */
export async function withFallback<T>(
  run: (p: AIProvider) => Promise<T>,
): Promise<{ result: T; provider: 'mock' | 'claude'; fallbackReason?: string }> {
  const p = activeProvider();
  try {
    return { result: await run(p), provider: p.name };
  } catch (e) {
    if (p.name === 'mock') throw e;
    const reason = e instanceof Error ? e.message : String(e);
    console.warn(`[ai] ${p.name} failed, falling back to mock: ${reason}`);
    return { result: await run(mockProvider), provider: 'mock', fallbackReason: reason };
  }
}
