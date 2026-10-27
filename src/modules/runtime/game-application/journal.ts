/**
 * Atomic A/B persistence journal and data validation.
 */

import type {
  Dimension,
  ProgressSave,
  RoundResume,
  StorageLike,
} from './types.js';

export const CURRENT_PROGRESS_SCHEMA_VERSION = 1;
export const CURRENT_CHECKPOINT_VERSION = 1;

/**
 * Computes an FNV-1a 32-bit checksum for data integrity validation.
 */
export function computeChecksum(payload: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * In-memory storage adapter for headless environments and tests.
 */
export class MemoryStorage implements StorageLike {
  private readonly storage = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.storage.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.storage.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.storage.delete(key);
  }

  clear(): void {
    this.storage.clear();
  }
}

interface JournalSlotRecord {
  readonly generation: number;
  readonly checksum: string;
  readonly data: ProgressSave;
}

/**
 * Manages atomic A/B journal storage for player progress and round resume.
 */
export class PersistenceJournal {
  private readonly storage: StorageLike;
  private readonly gameId: string;
  private readonly slotAKey: string;
  private readonly slotBKey: string;
  futureSchemaVersion: number | null = null;
  invalidResume = false;

  constructor(gameId = 'rundot_game', storage?: StorageLike) {
    this.gameId = gameId;
    this.storage = storage ?? new MemoryStorage();
    this.slotAKey = `${gameId}_progress_slot_a`;
    this.slotBKey = `${gameId}_progress_slot_b`;
  }

  /**
   * Returns default progress data for new sessions.
   */
  createDefaultProgress(): ProgressSave {
    return {
      schemaVersion: CURRENT_PROGRESS_SCHEMA_VERSION,
      generation: 1,
      gameId: this.gameId,
      bestScores: {},
      unlocks: ['stage_1'],
      selectedLevel: 'stage_1',
      durableInventoryAndSettings: {},
      completedRewardIds: [],
    };
  }

  /**
   * Returns the storage key for dimension-specific round resumes.
   */
  getResumeKey(dimension: Dimension): string {
    return `${this.gameId}_round_resume_${dimension}`;
  }

  private validateSlot(raw: string | null): JournalSlotRecord | null {
    if (!raw || typeof raw !== 'string') {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }
      const record = parsed as Record<string, unknown>;
      const generation = record.generation;
      if (typeof generation !== 'number' || !Number.isSafeInteger(generation) || generation <= 0) {
        return null;
      }
      const checksum = record.checksum;
      if (typeof checksum !== 'string' || !/^[0-9a-f]{8}$/i.test(checksum)) {
        return null;
      }
      if (!record.data || typeof record.data !== 'object' || Array.isArray(record.data)) {
        return null;
      }

      const serializedData = JSON.stringify(record.data);
      const computed = computeChecksum(serializedData);
      if (computed !== checksum) {
        return null;
      }

      const data = record.data as Record<string, unknown>;
      const schemaVersion = data.schemaVersion;
      if (
        typeof schemaVersion !== 'number' ||
        !Number.isSafeInteger(schemaVersion) ||
        schemaVersion < 1
      ) {
        return null;
      }

      const gameId = data.gameId;
      if (typeof gameId !== 'string' || gameId !== this.gameId) {
        return null;
      }

      if (data.generation !== generation) {
        return null;
      }

      // Unknown future schema must be preserved as-is without validation failure
      if (schemaVersion > CURRENT_PROGRESS_SCHEMA_VERSION) {
        return {
          generation,
          checksum,
          data: record.data as ProgressSave,
        };
      }

      // Validate known fields for current schema
      const bestScores = data.bestScores;
      if (!bestScores || typeof bestScores !== 'object' || Array.isArray(bestScores)) {
        return null;
      }
      for (const [k, v] of Object.entries(bestScores)) {
        if (typeof k !== 'string' || typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
          return null;
        }
      }

      const unlocks = data.unlocks;
      if (!Array.isArray(unlocks)) {
        return null;
      }
      const seenUnlocks = new Set<string>();
      for (const u of unlocks) {
        if (typeof u !== 'string' || u.length === 0 || seenUnlocks.has(u)) {
          return null;
        }
        seenUnlocks.add(u);
      }

      const selectedLevel = data.selectedLevel;
      if (typeof selectedLevel !== 'string' || selectedLevel.length === 0) {
        return null;
      }

      const completedRewardIds = data.completedRewardIds;
      if (!Array.isArray(completedRewardIds)) {
        return null;
      }
      const seenRewards = new Set<string>();
      for (const r of completedRewardIds) {
        if (typeof r !== 'string' || r.length === 0 || seenRewards.has(r)) {
          return null;
        }
        seenRewards.add(r);
      }

      const durableInventoryAndSettings = data.durableInventoryAndSettings;
      if (
        !durableInventoryAndSettings ||
        typeof durableInventoryAndSettings !== 'object' ||
        Array.isArray(durableInventoryAndSettings)
      ) {
        return null;
      }

      return {
        generation,
        checksum,
        data: record.data as ProgressSave,
      };
    } catch {
      return null;
    }
  }

  /**
   * Reads the newest valid progress generation from slot A or slot B.
   * Falls back to alternate slot if one slot is corrupt.
   */
  async loadProgress(): Promise<ProgressSave> {
    const [rawA, rawB] = await Promise.all([
      this.storage.getItem(this.slotAKey),
      this.storage.getItem(this.slotBKey),
    ]);

    const slots = [this.validateSlot(rawA), this.validateSlot(rawB)].filter((slot) => slot !== null);
    const future = slots.find((slot) => slot.data.schemaVersion > CURRENT_PROGRESS_SCHEMA_VERSION);
    this.futureSchemaVersion = future?.data.schemaVersion ?? null;
    const compatible = slots.filter((slot) => slot.data.schemaVersion === CURRENT_PROGRESS_SCHEMA_VERSION)
      .sort((a, b) => b.generation - a.generation);
    return compatible[0]?.data ?? this.createDefaultProgress();
  }

  /**
   * Writes progress atomically into the alternate journal slot.
   * Merges durable progress from storage to avoid wiping bestScores.
   * Blocks write and preserves state if storage holds a future schema.
   */
  async saveProgress(progress: ProgressSave): Promise<ProgressSave> {
    if (progress.schemaVersion > CURRENT_PROGRESS_SCHEMA_VERSION) {
      throw new Error(
        `Cannot overwrite future schema version ${progress.schemaVersion}.`,
      );
    }

    const [rawA, rawB] = await Promise.all([
      this.storage.getItem(this.slotAKey),
      this.storage.getItem(this.slotBKey),
    ]);

    const slotA = this.validateSlot(rawA);
    const slotB = this.validateSlot(rawB);

    if (
      (slotA && slotA.data.schemaVersion > CURRENT_PROGRESS_SCHEMA_VERSION) ||
      (slotB && slotB.data.schemaVersion > CURRENT_PROGRESS_SCHEMA_VERSION)
    ) {
      throw new Error('Storage contains a newer schema version. Write blocked.');
    }

    let activeSlot: 'A' | 'B' = 'A';
    let highestGen = 0;
    let existingData: ProgressSave | null = null;

    if (slotA && slotB) {
      if (slotA.generation >= slotB.generation) {
        activeSlot = 'A';
        highestGen = slotA.generation;
        existingData = slotA.data;
      } else {
        activeSlot = 'B';
        highestGen = slotB.generation;
        existingData = slotB.data;
      }
    } else if (slotA) {
      activeSlot = 'A';
      highestGen = slotA.generation;
      existingData = slotA.data;
    } else if (slotB) {
      activeSlot = 'B';
      highestGen = slotB.generation;
      existingData = slotB.data;
    }

    let mergedProgress: ProgressSave = { ...progress };

    if (existingData) {
      const mergedBestScores: Record<string, number> = {
        ...existingData.bestScores,
      };
      for (const [dim, score] of Object.entries(progress.bestScores)) {
        mergedBestScores[dim] = Math.max(mergedBestScores[dim] ?? 0, score);
      }

      const mergedUnlocks = Array.from(
        new Set([...existingData.unlocks, ...progress.unlocks]),
      );
      const mergedRewards = Array.from(
        new Set([...existingData.completedRewardIds, ...progress.completedRewardIds]),
      );

      mergedProgress = {
        ...existingData,
        ...progress,
        bestScores: mergedBestScores,
        unlocks: mergedUnlocks,
        completedRewardIds: mergedRewards,
        durableInventoryAndSettings: {
          ...existingData.durableInventoryAndSettings,
          ...progress.durableInventoryAndSettings,
        },
      };
    }

    const nextGeneration = Math.max(highestGen + 1, mergedProgress.generation + 1);
    const nextProgress: ProgressSave = {
      ...mergedProgress,
      generation: nextGeneration,
    };

    const serializedData = JSON.stringify(nextProgress);
    const checksum = computeChecksum(serializedData);
    const payload = JSON.stringify({
      generation: nextGeneration,
      checksum,
      data: nextProgress,
    });

    const targetKey = activeSlot === 'A' ? this.slotBKey : this.slotAKey;
    await this.storage.setItem(targetKey, payload);

    return nextProgress;
  }

  /**
   * Saves exact-runtime round resume state with dimension isolation.
   */
  async saveResume(dimension: Dimension, resume: RoundResume): Promise<void> {
    const payload = JSON.stringify(resume);
    await this.storage.setItem(this.getResumeKey(dimension), payload);
  }

  /**
   * Reads exact-runtime round resume state.
   */
  async loadResume(dimension: Dimension): Promise<RoundResume | null> {
    this.invalidResume = false;
    const raw = await this.storage.getItem(this.getResumeKey(dimension));
    if (!raw || typeof raw !== 'string') {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Invalid saved round.');
      }
      const record = parsed as Record<string, unknown>;
      if (
        !Number.isSafeInteger(record.checkpointVersion) ||
        typeof record.runtimeIdentity !== 'string' ||
        typeof record.progressGeneration !== 'number' || !Number.isSafeInteger(record.progressGeneration) || record.progressGeneration < 0 ||
        !record.roundCheckpoint ||
        typeof record.roundCheckpoint !== 'object' ||
        Array.isArray(record.roundCheckpoint)
      ) {
        throw new Error('Invalid saved round.');
      }
      return parsed as RoundResume;
    } catch {
      this.invalidResume = true;
      return null;
    }
  }

  /**
   * Removes round resume state after round completion or reset.
   */
  async clearResume(dimension: Dimension): Promise<void> {
    const key = this.getResumeKey(dimension);
    if (this.storage.removeItem) {
      await this.storage.removeItem(key);
    } else {
      await this.storage.setItem(key, '');
    }
  }
}
