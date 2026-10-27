/**
 * Fixed-step simulation runtime with an 8-step cap and suspension handling.
 */

import type { FixedStepStats } from './types.js';

export interface PumpResult {
  readonly stepsTaken: number;
  readonly alpha: number;
}

export type StepCallback = (fixedDt: number, isFirstTick: boolean) => void;

export class FixedStepRuntime {
  readonly fixedDt: number;
  readonly maxStepsPerPump: number;

  private accumulator = 0;
  private readonly suspensionCauses = new Set<string>();
  private justResumed = true;

  private totalPumps = 0;
  private totalTicks = 0;
  private droppedSeconds = 0;
  private droppedTicks = 0;
  private maxTicksInSinglePump = 0;

  constructor(fixedDtSeconds = 1 / 60, maxStepsPerPump = 8) {
    if (!Number.isFinite(fixedDtSeconds) || Math.abs(fixedDtSeconds - 1 / 60) > 1e-6) {
      throw new Error(
        `Unsupported fixedDtSeconds: ${fixedDtSeconds}. Only 60 Hz (1/60) is supported.`,
      );
    }
    if (!Number.isInteger(maxStepsPerPump) || maxStepsPerPump < 1 || maxStepsPerPump > 8) throw new RangeError('Step limit must be from 1 to 8.');
    this.fixedDt = 1 / 60;
    this.maxStepsPerPump = maxStepsPerPump;
  }

  /**
   * Sets or clears an independent suspension cause.
   * Rebases accumulator to prevent burst steps.
   */
  setSuspended(cause: string, suspended: boolean): void {
    if (suspended) {
      this.suspensionCauses.add(cause);
      this.accumulator = 0;
      this.justResumed = true;
    } else {
      const hadCauses = this.suspensionCauses.size > 0;
      this.suspensionCauses.delete(cause);
      if (hadCauses) {
        this.accumulator = 0;
        this.justResumed = true;
      }
    }
  }

  /**
   * Returns true when any suspension cause is active.
   */
  isSuspended(): boolean {
    return this.suspensionCauses.size > 0;
  }

  /**
   * Returns a copy of the active suspension causes.
   */
  getSuspensionCauses(): readonly string[] {
    return Array.from(this.suspensionCauses);
  }

  /**
   * Advances simulation time and executes fixed steps.
   */
  pump(deltaSeconds: number, stepCallback: StepCallback): PumpResult {
    if (this.isSuspended()) {
      return { stepsTaken: 0, alpha: 0 };
    }

    if (this.justResumed) {
      this.justResumed = false;
      deltaSeconds = 0;
      this.accumulator = 0;
    }

    if (deltaSeconds > 0 && Number.isFinite(deltaSeconds)) {
      this.accumulator += deltaSeconds;
    }

    const maxAllowedTime = this.maxStepsPerPump * this.fixedDt;
    if (this.accumulator > maxAllowedTime) {
      const excessTime = this.accumulator - maxAllowedTime;
      this.droppedSeconds += excessTime;
      this.droppedTicks += Math.floor(excessTime / this.fixedDt);
      this.accumulator = maxAllowedTime;
    }

    let stepsTaken = 0;
    while (this.accumulator >= this.fixedDt && stepsTaken < this.maxStepsPerPump) {
      const isFirstTick = stepsTaken === 0;
      stepCallback(this.fixedDt, isFirstTick);
      this.accumulator -= this.fixedDt;
      stepsTaken += 1;
      this.totalTicks += 1;
    }

    if (stepsTaken > this.maxTicksInSinglePump) {
      this.maxTicksInSinglePump = stepsTaken;
    }
    this.totalPumps += 1;

    const alpha = Math.min(1, Math.max(0, this.accumulator / this.fixedDt));
    return { stepsTaken, alpha };
  }

  /**
   * Returns simulation performance statistics.
   */
  getStats(): FixedStepStats {
    return {
      totalPumps: this.totalPumps,
      totalTicks: this.totalTicks,
      droppedSeconds: this.droppedSeconds,
      droppedTicks: this.droppedTicks,
      maxTicksInSinglePump: this.maxTicksInSinglePump,
    };
  }

  /**
   * Resets accumulator and timing states.
   */
  reset(): void {
    this.accumulator = 0;
    this.justResumed = true;
  }
}
