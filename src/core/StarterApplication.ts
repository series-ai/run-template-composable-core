import { ReferenceArt } from '../viewport/ReferenceArt';
import { createGameApplication } from '../modules/runtime/game-application/createGameApplication';
import type { Dimension, GameApplication, StorageLike } from '../modules/runtime/game-application/types';
import type { GameSettings, GameShellActions, GameShellView } from '../modules/ui/game-shell/types';
import { ParticleEmitter } from '../modules/two-d/scene/ParticleEmitter';

const initialView: GameShellView = {
  status: 'loading', dimension: '2d', score: 0, bestScore: 0,
  secondsRemaining: 60, objective: 'Collect five stars.', canPickDimension: true,
};

export class StarterApplication {
  readonly art = new ReferenceArt();
  readonly effects = new ParticleEmitter({ maxParticles: 128, seed: 1337 });
  game: GameApplication | undefined;
  private generation = 0;
  private view = initialView;
  private readonly listeners = new Set<() => void>();
  private unsubscribeGame: (() => void) | undefined;
  private readonly cleanups: Array<() => void> = [];
  private audio: AudioContext | undefined;
  private disposed = false;
  private readonly suspensionCauses = new Set<string>();
  private hostReady: Promise<void> | undefined;
  private storageAdapter: StorageLike | undefined;
  private readonly inputSources = new Map<string, Set<string>>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  readonly getView = (): GameShellView => this.view;
  readonly actions: GameShellActions = {
    start: () => { this.unlockAudio(); this.game?.start(); },
    pause: () => this.game?.pause(),
    resume: () => { this.unlockAudio(); this.game?.resume(); },
    restart: () => { this.unlockAudio(); this.game?.restart(); this.game?.start(); },
    retry: () => { void this.load(this.view.dimension); },
    setDimension: (dimension) => { void this.load(dimension); },
    setHeld: (action, held) => {
      this.setInput('touch', action, held);
    },
    press: (action) => { if (this.view.status === 'running' && !this.game?.getView().isSuspended) this.game?.input.press(action); },
    setSettings: (settings: Partial<GameSettings>) => {
      this.game?.setSettings(settings); void this.game?.save().catch(console.warn);
    },
    setMenuOpen: (open) => { if (open) this.clearInput(); this.setSuspended('ui-menu', open); },
  };

  async load(dimension: Dimension): Promise<void> {
    if (this.disposed) return;
    const generation = ++this.generation;
    this.clearInput();
    this.effects.clear();
    this.unsubscribeGame?.(); this.unsubscribeGame = undefined;
    const previous = this.game; this.game = undefined;
    this.publish({ ...this.view, dimension, status: 'loading', error: undefined, notice: undefined });
    if (previous) {
      try { await previous.save(); } catch (error) { console.warn('Progress could not be saved.', error); }
      finally { previous.dispose(); }
    }
    if (this.disposed || generation !== this.generation) return;
    let next: GameApplication | undefined;
    try {
      await this.ensureHost();
      if (this.disposed || generation !== this.generation) return;
      next = await createGameApplication({ dimension, storage: this.storageAdapter, gameId: 'modules-starter' });
      await next.restore();
      if (this.disposed || generation !== this.generation) { next.dispose(); return; }
      this.game = next;
      next.setSuspended('hidden', document.hidden);
      for (const cause of this.suspensionCauses) next.setSuspended(cause, true);
      let previousScore = next.getView().score;
      let previousStatus = next.getView().status;
      const collected = new Set(next.getPresentation().poses.filter((pair) => !pair.visible).map((pair) => pair.entityId));
      const syncView = (): void => {
        if (!next || this.game !== next) return;
        const view = next.getView();
        this.effects.setReducedMotion(view.settings.reducedMotion);
        const frame = next.getPresentation();
        this.effects.update({ epoch: frame.epoch, activeSeconds: frame.currentTick / 60, deltaSeconds: 0, suspended: view.isSuspended });
        for (const pair of frame.poses) {
          if (pair.visible || collected.has(pair.entityId)) continue;
          collected.add(pair.entityId);
          const origin: [number, number, number] = 'xMeters' in pair.current ? [pair.current.xMeters, pair.current.yMeters, 0] : [...pair.current.positionMeters];
          this.effects.emitBurst(origin, { count: 18, lifetime: 0.7, speed: 2.4, size: 0.16,
            gravity: -3, colors: ['#ffd36c', '#f4efe8'], eventKey: `${frame.epoch}:${pair.entityId}` });
        }
        if (frame.poses.every((pair) => pair.visible)) collected.clear();
        if (view.score > previousScore && view.settings.sound) this.playReward();
        previousScore = view.score;
        if (view.status === 'results' && previousStatus !== 'results') void next.save().catch(console.warn);
        previousStatus = view.status;
        this.publish({ ...view, instructions: view.instructions ? [...view.instructions] : undefined,
          canPickDimension: true, levelName: dimension === '2d' ? 'Sky garden' : 'Orb garden' });
      };
      this.unsubscribeGame = next.subscribe(syncView); syncView();
    } catch (error) {
      next?.dispose();
      if (!this.disposed && generation === this.generation) {
        console.warn('The game could not load.', { dimension, cause: error });
        this.publish({ ...this.view, status: 'error', error: 'The game could not load. Please try again.' });
      }
    }
  }

  attachInput(target: Window): void {
    const keys: Record<string, string> = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
      ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'jump', KeyE: 'action' };
    const heldKeys = new Set<string>();
    const release = (): void => {
      for (const key of heldKeys) this.setInput(`key:${key}`, keys[key], false);
      heldKeys.clear();
    };
    const keydown = (event: KeyboardEvent): void => {
      if (event.repeat) return;
      if (event.target instanceof HTMLElement && event.target.closest('button,input,select,textarea,[contenteditable]')) return;
      if (event.code === 'Escape') { if (this.view.status === 'running') this.actions.pause(); return; }
      const action = keys[event.code];
      if (!action || this.view.status !== 'running') return;
      event.preventDefault(); heldKeys.add(event.code); this.setInput(`key:${event.code}`, action, true);
    };
    const keyup = (event: KeyboardEvent): void => {
      const action = keys[event.code]; if (!action) return;
      heldKeys.delete(event.code);
      this.setInput(`key:${event.code}`, action, false);
    };
    const blur = (): void => { release(); this.setSuspended('focus', true); };
    const focus = (): void => { this.setSuspended('focus', false); };
    const visibility = (): void => { release(); this.setSuspended('hidden', document.hidden); };
    const save = (): void => { release(); void this.game?.save().catch((error: unknown) => console.warn('Progress could not be saved.', error)); };
    target.addEventListener('keydown', keydown); target.addEventListener('keyup', keyup);
    target.addEventListener('blur', blur); target.addEventListener('focus', focus);
    target.addEventListener('pagehide', save); document.addEventListener('visibilitychange', visibility);
    this.cleanups.push(() => {
      release(); target.removeEventListener('keydown', keydown); target.removeEventListener('keyup', keyup);
      target.removeEventListener('blur', blur); target.removeEventListener('focus', focus);
      target.removeEventListener('pagehide', save); document.removeEventListener('visibilitychange', visibility);
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; ++this.generation;
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
    this.unsubscribeGame?.(); this.game?.dispose(); this.game = undefined;
    this.listeners.clear(); this.art.dispose(); this.effects.clear(); void this.audio?.close();
  }
  pollInput(): void {
    if (this.view.status !== 'running' || this.game?.getView().isSuspended) return;
    const pad = navigator.getGamepads?.().find((entry) => entry?.connected);
    const held = {
      left: (pad?.axes[0] ?? 0) < -0.25 || !!pad?.buttons[14]?.pressed,
      right: (pad?.axes[0] ?? 0) > 0.25 || !!pad?.buttons[15]?.pressed,
      up: (pad?.axes[1] ?? 0) < -0.25 || !!pad?.buttons[12]?.pressed,
      down: (pad?.axes[1] ?? 0) > 0.25 || !!pad?.buttons[13]?.pressed,
      jump: !!pad?.buttons[0]?.pressed,
    };
    for (const [action, value] of Object.entries(held)) this.setInput('gamepad', action, value);
  }
  private setInput(source: string, action: string, held: boolean): void {
    if (held && (this.view.status !== 'running' || this.game?.getView().isSuspended)) return;
    let sources = this.inputSources.get(action);
    if (!sources) { sources = new Set(); this.inputSources.set(action, sources); }
    if (held) sources.add(source); else sources.delete(source);
    this.game?.input.setHeld(action, sources.size > 0);
    if (!sources.size) this.inputSources.delete(action);
  }
  private clearInput(): void {
    for (const action of this.inputSources.keys()) this.game?.input.setHeld(action, false);
    this.inputSources.clear();
  }
  private setSuspended(cause: string, suspended: boolean): void {
    if (suspended) this.clearInput();
    if (suspended) this.suspensionCauses.add(cause); else this.suspensionCauses.delete(cause);
    this.game?.setSuspended(cause, suspended);
  }
  private ensureHost(): Promise<void> {
    if (!this.hostReady) this.hostReady = this.connectHost().catch((error: unknown) => {
      this.hostReady = undefined; throw error;
    });
    return this.hostReady;
  }
  private async connectHost(): Promise<void> {
    const { default: api } = await import('@series-inc/rundot-game-sdk/api');
    const context = api.context;
    if (!context) throw new Error('The game host could not start.');
    if (this.disposed) return;
    this.storageAdapter = {
      getItem: (key) => api.appStorage.getItem(key),
      setItem: (key, value) => api.appStorage.setItem(key, value),
      removeItem: (key) => api.appStorage.removeItem(key),
    };
    this.setSuspended('host-sleep', context.initializeAsleep);
    const subscriptions = [
      api.lifecycles.onPause(() => this.setSuspended('host-overlay', true)),
      api.lifecycles.onResume(() => this.setSuspended('host-overlay', false)),
      api.lifecycles.onSleep(() => { this.setSuspended('host-sleep', true); void this.game?.save().catch(console.warn); }),
      api.lifecycles.onAwake(() => this.setSuspended('host-sleep', false)),
      api.lifecycles.onQuit(() => {
        this.setSuspended('host-quit', true);
        void this.game?.save().catch(console.warn);
        this.dispose();
      }),
    ];
    this.cleanups.push(() => subscriptions.forEach((subscription) => subscription.unsubscribe()));
  }
  private publish(view: GameShellView): void {
    this.view = view; this.listeners.forEach((listener) => listener());
  }
  private unlockAudio(): void {
    if (!this.audio) this.audio = new AudioContext();
    void this.audio.resume();
  }
  private playReward(): void {
    if (!this.audio || this.audio.state !== 'running') return;
    const oscillator = this.audio.createOscillator(); const gain = this.audio.createGain();
    oscillator.frequency.setValueAtTime(660, this.audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(990, this.audio.currentTime + 0.12);
    gain.gain.setValueAtTime(0.08, this.audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.audio.currentTime + 0.16);
    oscillator.connect(gain); gain.connect(this.audio.destination); oscillator.start(); oscillator.stop(this.audio.currentTime + 0.17);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
}
