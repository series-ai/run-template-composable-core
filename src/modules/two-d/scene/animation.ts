/**
 * Animation and cosmetic particle helpers.
 */

import type { PresentationAnimationClip } from './types';

export interface AnimationFrameResult {
  frameId: string;
  frameIndex: number;
  complete: boolean;
  frameEventIds?: string[];
}

/**
 * Resolve an active frame for a presentation clip.
 * Reads injected elapsed active milliseconds.
 * Never accesses ambient state.clock.
 */
export function resolveAnimationFrame(clip: PresentationAnimationClip, elapsedMs: number): AnimationFrameResult {
  const frameCount = clip.frames.length;
  if (frameCount === 0) {
    throw new Error('resolveAnimationFrame: clip must have at least one frame.');
  }

  const defaultDuration = clip.fps && clip.fps > 0 ? 1000 / clip.fps : 100;
  let totalDurationMs = 0;
  for (let i = 0; i < frameCount; i += 1) {
    const f = clip.frames[i]!;
    totalDurationMs += f.durationMs > 0 ? f.durationMs : defaultDuration;
  }

  if (totalDurationMs <= 0) {
    totalDurationMs = frameCount * 100;
  }

  const isLoop = clip.playback === 'loop';
  const effectiveMs = isLoop ? (elapsedMs % totalDurationMs + totalDurationMs) % totalDurationMs : Math.max(0, elapsedMs);

  let accumulatedMs = 0;
  for (let i = 0; i < frameCount; i += 1) {
    const frame = clip.frames[i]!;
    const dur = frame.durationMs > 0 ? frame.durationMs : defaultDuration;
    accumulatedMs += dur;
    if (effectiveMs < accumulatedMs || i === frameCount - 1) {
      const isComplete = !isLoop && elapsedMs >= totalDurationMs;
      return {
        frameId: frame.frameId,
        frameIndex: i,
        complete: isComplete,
        frameEventIds: frame.frameEventIds,
      };
    }
  }

  const lastFrame = clip.frames[frameCount - 1]!;
  return {
    frameId: lastFrame.frameId,
    frameIndex: frameCount - 1,
    complete: !isLoop,
    frameEventIds: lastFrame.frameEventIds,
  };
}

/**
 * Convert milliseconds duration to fixed integer simulation ticks.
 */
export function convertDurationMsToTicks(durationMs: number, tickRate: number): number {
  if (durationMs <= 0 || tickRate <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil((durationMs * tickRate) / 1000));
}

/**
 * Create a stable event deduplication key.
 * Format: (epoch:sourceEntityId:sequence).
 */
export function createEventDedupeKey(epoch: number, sourceEntityId: string, sequence: number): string {
  return `${epoch}:${sourceEntityId}:${sequence}`;
}
