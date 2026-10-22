export type TickCallback = (dt: number, totalTime: number) => void;

export class FixedTimeStepLoop {
  private fixedDelta: number;
  private maxSubSteps: number;
  private accumulator: number = 0;
  private lastTime: number = 0;
  private running: boolean = false;
  private rafId: number | null = null;
  private callbacks: Set<TickCallback> = new Set();
  private totalTime: number = 0;

  constructor(targetFps: number = 60, maxSubSteps: number = 5) {
    this.fixedDelta = 1 / targetFps;
    this.maxSubSteps = maxSubSteps;
  }

  public subscribe(cb: TickCallback): () => void {
    this.callbacks.add(cb);
    return () => {
      this.callbacks.delete(cb);
    };
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.loop = this.loop.bind(this);
    if (typeof requestAnimationFrame !== "undefined") {
      this.rafId = requestAnimationFrame(this.loop);
    }
  }

  public stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      if (typeof cancelAnimationFrame !== "undefined") {
        cancelAnimationFrame(this.rafId);
      }
      this.rafId = null;
    }
  }

  private loop(currentTime: number): void {
    if (!this.running) return;

    let frameTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    // Guard against large time spikes (e.g. background tab or frame freeze)
    if (frameTime > 0.25) {
      frameTime = 0.25;
    }

    this.accumulator += frameTime;
    let subSteps = 0;

    while (this.accumulator >= this.fixedDelta && subSteps < this.maxSubSteps) {
      this.totalTime += this.fixedDelta;
      for (const cb of this.callbacks) {
        try {
          cb(this.fixedDelta, this.totalTime);
        } catch (err) {
          console.error("[FixedLoop] Tick callback threw:", err);
        }
      }
      this.accumulator -= this.fixedDelta;
      subSteps++;
    }

    if (this.running && typeof requestAnimationFrame !== "undefined") {
      this.rafId = requestAnimationFrame(this.loop);
    }
  }
}

export const globalFixedLoop = new FixedTimeStepLoop(60);
