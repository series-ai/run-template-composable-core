/**
 * Cosmetic particle emitter for 2D and 3D presentation scenes.
 * This class controls visual particles.
 * It does not simulate authoritative gameplay physics.
 */

import type { ColorRgb, ColorRgba, PresentationClock } from './types';

export type ParticleOrigin =
  | [number, number]
  | [number, number, number]
  | { x: number; y: number; z?: number };

export interface ParticleBurstConfig {
  /** Total particles to emit in this burst. */
  count: number;
  /** Particle lifetime in seconds. */
  lifetime: number;
  /** Emission speed in metres per second. */
  speed: number;
  /** Emission spread angle in radians. Default is Math.PI. */
  spread?: number;
  /** Emission base angle in radians. Default is 0. */
  baseDirection?: number;
  /** Palette of colors. Values are hex strings or RGBA tuples. */
  colors: (string | ColorRgba | ColorRgb)[];
  /** Base particle size in metres. Default is 0.1. */
  size?: number;
  /** Random variance factor for size between 0 and 1. Default is 0. */
  sizeVariance?: number;
  /** Vertical acceleration in metres per second squared. Default is 0. */
  gravity?: number;
  /** Drag coefficient per second. Default is 0. */
  drag?: number;
  /** Maximum initial rotation in radians. Default is 0. */
  rotation?: number;
  /** Maximum rotation speed in radians per second. Default is 0. */
  rotationSpeed?: number;
  /** Initial distance offset from the emission origin. Default is 0. */
  initialOffset?: number;
  /** Deduplication key for this event. */
  eventKey?: string;
  /** Seed override for this burst. */
  seed?: number;
  /** Velocity spread along the Z axis for 3D scenes. Default is 0. */
  zSpread?: number;
  /** Scale factor at the end of particle lifetime. Default is 1.0. */
  endScale?: number;
  /** Fade alpha to zero over particle lifetime. Default is true. */
  fadeOut?: boolean;
}

export interface ParticleEmitterConfig {
  /** Maximum number of simultaneous particles. Default is 500. */
  maxParticles?: number;
  /** Seed value for the pseudo-random generator. Default is 1337. */
  seed?: number;
  /** Suppress bursts when true. Default is false. */
  reducedMotion?: boolean;
  /** Maximum number of stored event keys. Default is 256. */
  maxEventKeys?: number;
}

export interface LiveParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  lifetime: number;
  size: number;
  scale: number;
  rotation: number;
  rotationSpeed: number;
  r: number;
  g: number;
  b: number;
  a: number;
  baseAlpha: number;
  gravity: number;
  drag: number;
  endScale: number;
  fadeOut: boolean;
}

const DEFAULT_MAX_PARTICLES = 500;
const DEFAULT_MAX_EVENT_KEYS = 256;
const DEFAULT_SEED = 1337;
const MAX_CATCHUP_STEP_SECONDS = 0.25;

function parseColorToRgba(
  input: string | ColorRgba | ColorRgb,
  target: [number, number, number, number],
): void {
  if (Array.isArray(input)) {
    if ((input.length !== 3 && input.length !== 4) || input.some((part) => !Number.isFinite(part) || part < 0 || part > 1)) throw new TypeError('Invalid particle color.');
    target[0] = Math.max(0, Math.min(1, input[0] ?? 1));
    target[1] = Math.max(0, Math.min(1, input[1] ?? 1));
    target[2] = Math.max(0, Math.min(1, input[2] ?? 1));
    target[3] = input.length > 3 ? Math.max(0, Math.min(1, input[3] ?? 1)) : 1;
    return;
  }

  if (typeof input === 'string') {
    let hex = input.trim();
    if (!/^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(hex)) throw new TypeError('Invalid particle color.');
    if (hex.startsWith('#')) {
      hex = hex.slice(1);
    }
    if (hex.length === 3) {
      const r = parseInt(hex.charAt(0) + hex.charAt(0), 16) / 255;
      const g = parseInt(hex.charAt(1) + hex.charAt(1), 16) / 255;
      const b = parseInt(hex.charAt(2) + hex.charAt(2), 16) / 255;
      target[0] = Number.isNaN(r) ? 1 : r;
      target[1] = Number.isNaN(g) ? 1 : g;
      target[2] = Number.isNaN(b) ? 1 : b;
      target[3] = 1;
      return;
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      target[0] = Number.isNaN(r) ? 1 : r;
      target[1] = Number.isNaN(g) ? 1 : g;
      target[2] = Number.isNaN(b) ? 1 : b;
      target[3] = Number.isNaN(a) ? 1 : a;
      return;
    }
  }

  target[0] = 1;
  target[1] = 1;
  target[2] = 1;
  target[3] = 1;
}

export class ParticleEmitter {
  readonly capacity: number;
  private readonly maxEventKeys: number;
  private readonly pool: LiveParticle[];
  private readonly activeParticles: LiveParticle[];
  private readonly eventKeys: Set<string>;
  private readonly eventKeyQueue: string[];
  private readonly colorScratch: [number, number, number, number];

  private reducedMotion: boolean;
  private prngState: number;
  private lastEpoch: number | null;
  private lastActiveSeconds: number;

  constructor(config: ParticleEmitterConfig = {}) {
    const rawMax = config.maxParticles ?? DEFAULT_MAX_PARTICLES;
    if (!Number.isInteger(rawMax) || rawMax < 1 || rawMax > 1000) throw new RangeError('Particle capacity must be from 1 to 1000.');
    this.capacity = Math.max(1, Math.floor(rawMax));

    const rawMaxKeys = config.maxEventKeys ?? DEFAULT_MAX_EVENT_KEYS;
    if (!Number.isInteger(rawMaxKeys) || rawMaxKeys < 1 || rawMaxKeys > 4096) throw new RangeError('Invalid particle event limit.');
    if (config.seed !== undefined && !Number.isSafeInteger(config.seed)) throw new TypeError('Invalid particle seed.');
    this.maxEventKeys = Math.max(1, Math.floor(rawMaxKeys));

    this.reducedMotion = config.reducedMotion ?? false;
    this.prngState = (config.seed ?? DEFAULT_SEED) >>> 0;
    this.lastEpoch = null;
    this.lastActiveSeconds = 0;

    this.pool = [];
    this.activeParticles = [];
    this.eventKeys = new Set<string>();
    this.eventKeyQueue = [];
    this.colorScratch = [1, 1, 1, 1];

    for (let i = 0; i < this.capacity; i += 1) {
      this.pool.push({
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        lifetime: 1,
        size: 0.1,
        scale: 1,
        rotation: 0,
        rotationSpeed: 0,
        r: 1,
        g: 1,
        b: 1,
        a: 1,
        baseAlpha: 1,
        gravity: 0,
        drag: 0,
        endScale: 1,
        fadeOut: true,
      });
    }
  }

  private nextRandom(): number {
    let t = (this.prngState += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  get activeCount(): number {
    return this.activeParticles.length;
  }

  get isReducedMotion(): boolean {
    return this.reducedMotion;
  }

  setReducedMotion(enabled: boolean): void {
    this.reducedMotion = enabled;
    if (enabled) this.clear();
  }

  setSeed(seed: number): void {
    this.prngState = seed >>> 0;
  }

  getParticles(): readonly LiveParticle[] {
    return this.activeParticles;
  }

  clear(): void {
    for (let i = 0; i < this.activeParticles.length; i += 1) {
      const p = this.activeParticles[i]!;
      this.pool.push(p);
    }
    this.activeParticles.length = 0;
    this.eventKeys.clear();
    this.eventKeyQueue.length = 0;
  }

  emitBurst(origin: ParticleOrigin, config: ParticleBurstConfig): number {
    const coordinates = Array.isArray(origin) ? origin : [origin.x, origin.y, origin.z ?? 0];
    if (coordinates.some((value) => !Number.isFinite(value)) || !Number.isInteger(config.count) || config.count < 0 ||
      !Number.isFinite(config.lifetime) || config.lifetime <= 0 || config.lifetime > 60 ||
      !Number.isFinite(config.speed) || config.speed < 0) throw new TypeError('Invalid particle burst.');
    for (const key of ['spread', 'baseDirection', 'size', 'sizeVariance', 'gravity', 'drag', 'rotation', 'rotationSpeed', 'initialOffset', 'seed', 'zSpread', 'endScale'] as const) {
      if (config[key] !== undefined && !Number.isFinite(config[key])) throw new TypeError(`Invalid particle ${key}.`);
    }
    if (config.eventKey !== undefined && (config.eventKey.length > 128 || !config.eventKey)) throw new TypeError('Invalid particle event key.');
    if (config.colors.length > 64) throw new RangeError('Particle palette limit exceeded.');
    for (const color of config.colors) parseColorToRgba(color, this.colorScratch);
    if (this.reducedMotion) {
      return 0;
    }

    if (config.eventKey) {
      if (this.eventKeys.has(config.eventKey)) {
        return 0;
      }
      if (this.eventKeyQueue.length >= this.maxEventKeys) {
        const oldest = this.eventKeyQueue.shift();
        if (oldest !== undefined) {
          this.eventKeys.delete(oldest);
        }
      }
      this.eventKeys.add(config.eventKey);
      this.eventKeyQueue.push(config.eventKey);
    }

    const originX = Array.isArray(origin) ? (origin[0] ?? 0) : origin.x;
    const originY = Array.isArray(origin) ? (origin[1] ?? 0) : origin.y;
    const originZ = Array.isArray(origin) ? (origin[2] ?? 0) : (origin.z ?? 0);

    const requestedCount = Math.min(this.capacity, config.count);
    if (requestedCount === 0 || config.lifetime <= 0) {
      return 0;
    }

    if (config.seed !== undefined) {
      this.prngState = config.seed >>> 0;
    }

    const spread = config.spread ?? Math.PI;
    const baseDirection = config.baseDirection ?? 0;
    const baseSize = Math.max(0.001, config.size ?? 0.1);
    const sizeVariance = Math.max(0, Math.min(1, config.sizeVariance ?? 0));
    const initialOffset = config.initialOffset ?? 0;
    const gravity = config.gravity ?? 0;
    const drag = Math.max(0, config.drag ?? 0);
    const rotationRange = config.rotation ?? 0;
    const rotationSpeedRange = config.rotationSpeed ?? 0;
    const zSpread = config.zSpread ?? 0;
    const endScale = config.endScale ?? 1.0;
    const fadeOut = config.fadeOut ?? true;
    const palette = config.colors.length > 0 ? config.colors : ['#ffffff'];

    let emitted = 0;

    for (let i = 0; i < requestedCount; i += 1) {
      const p = this.pool.pop();
      if (!p) {
        break;
      }

      const angle = baseDirection + (this.nextRandom() * 2 - 1) * spread;
      const speed = config.speed * (0.6 + this.nextRandom() * 0.4);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const vz = zSpread !== 0 ? (this.nextRandom() * 2 - 1) * zSpread * speed : 0;

      p.x = originX + Math.cos(angle) * initialOffset;
      p.y = originY + Math.sin(angle) * initialOffset;
      p.z = originZ;
      p.vx = vx;
      p.vy = vy;
      p.vz = vz;
      p.age = 0;
      p.lifetime = config.lifetime;

      const sizeVar = (this.nextRandom() * 2 - 1) * sizeVariance;
      p.size = Math.max(0.0001, baseSize * (1 + sizeVar));
      p.scale = 1;

      p.rotation = rotationRange !== 0 ? (this.nextRandom() * 2 - 1) * rotationRange : 0;
      p.rotationSpeed =
        rotationSpeedRange !== 0 ? (this.nextRandom() * 2 - 1) * rotationSpeedRange : 0;

      const colorIndex = Math.min(
        Math.floor(this.nextRandom() * palette.length),
        palette.length - 1,
      );
      const chosenColor = palette[colorIndex] ?? '#ffffff';
      parseColorToRgba(chosenColor, this.colorScratch);

      p.r = this.colorScratch[0];
      p.g = this.colorScratch[1];
      p.b = this.colorScratch[2];
      p.a = this.colorScratch[3];
      p.baseAlpha = this.colorScratch[3];

      p.gravity = gravity;
      p.drag = drag;
      p.endScale = endScale;
      p.fadeOut = fadeOut;

      this.activeParticles.push(p);
      emitted += 1;
    }

    return emitted;
  }

  update(clock: PresentationClock): void {
    if (!Number.isSafeInteger(clock.epoch) || !Number.isFinite(clock.activeSeconds) || clock.activeSeconds < 0) throw new TypeError('Invalid particle clock.');
    if (this.lastEpoch === null) {
      this.lastEpoch = clock.epoch;
      this.lastActiveSeconds = clock.activeSeconds;
      return;
    }

    if (clock.epoch !== this.lastEpoch) {
      this.clear();
      this.lastEpoch = clock.epoch;
      this.lastActiveSeconds = clock.activeSeconds;
      return;
    }

    if (clock.suspended) {
      return;
    }

    if (clock.activeSeconds === this.lastActiveSeconds) {
      return;
    }

    const dt = clock.activeSeconds - this.lastActiveSeconds;
    this.lastActiveSeconds = clock.activeSeconds;

    if (dt <= 0) {
      return;
    }

    this.stepSimulation(dt);
  }

  private stepSimulation(dt: number): void {
    const motionDt = Math.min(dt, MAX_CATCHUP_STEP_SECONDS);
    let write = 0;
    const count = this.activeParticles.length;

    for (let i = 0; i < count; i += 1) {
      const p = this.activeParticles[i]!;
      p.age += dt;

      if (p.age >= p.lifetime) {
        this.pool.push(p);
        continue;
      }

      p.x += p.vx * motionDt;
      p.y += p.vy * motionDt;
      p.z += p.vz * motionDt;

      if (p.gravity !== 0) {
        p.vy += p.gravity * motionDt;
      }

      if (p.drag > 0) {
        const dragFactor = Math.max(0, 1 - p.drag * motionDt);
        p.vx *= dragFactor;
        p.vy *= dragFactor;
        p.vz *= dragFactor;
      }

      if (p.rotationSpeed !== 0) {
        p.rotation += p.rotationSpeed * motionDt;
      }

      const progress = p.age / p.lifetime;

      if (p.fadeOut) {
        p.a = p.baseAlpha * Math.max(0, 1 - progress);
      }

      if (p.endScale !== 1) {
        p.scale = 1 + (p.endScale - 1) * progress;
      }

      this.activeParticles[write] = p;
      write += 1;
    }

    this.activeParticles.length = write;
  }
}
