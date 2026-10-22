/**
 * Runtime Composition Bus for Composable Game Modules (Track B).
 *
 * Provides single-writer signal slots and multi-listener event channels
 * to wire modular game components together declaratively without AST manipulation.
 */

export class ModuleHost {
  private signals = new Map<string, unknown>();
  private events = new Map<string, Array<(payload: unknown) => void>>();
  private activeWriters = new Map<string, string>();

  /**
   * Registers a canonical signal slot on the host (e.g. 'host:input.move2d').
   */
  registerSignalSlot(name: string, defaultValue?: unknown): void {
    this.signals.set(name, defaultValue);
  }

  /**
   * Registers an event broadcast channel on the host (e.g. 'host:state.pause').
   */
  registerEventSlot(name: string): void {
    if (!this.events.has(name)) {
      this.events.set(name, []);
    }
  }

  /**
   * Binds a module's signal output provider to a host slot with single-writer enforcement.
   */
  bindSignal(slotName: string, sourceProvider: unknown, writerId: string): void {
    if (this.activeWriters.has(slotName)) {
      throw new Error(
        `Collision: Slot "${slotName}" already has writer "${this.activeWriters.get(slotName)}"`,
      );
    }
    this.activeWriters.set(slotName, writerId);
    this.signals.set(slotName, sourceProvider);
  }

  /**
   * Subscribes a listener to a host event channel. Returns an unsubscribe function.
   */
  bindEvent(slotName: string, listener: (payload: unknown) => void): () => void {
    const list = this.events.get(slotName) || [];
    list.push(listener);
    this.events.set(slotName, list);
    return () => {
      const idx = list.indexOf(listener);
      if (idx !== -1) list.splice(idx, 1);
    };
  }

  /**
   * Reads the current value of a signal slot, evaluating getter functions if provided.
   */
  readSignal<T = unknown>(slotName: string, fallback?: T): T | undefined {
    const provider = this.signals.get(slotName);
    if (provider === undefined && fallback !== undefined) return fallback;
    return (typeof provider === 'function' ? provider() : provider) as T;
  }

  /**
   * Emits an event to all subscribers on the given channel.
   * Copies the listener array to support safe in-flight unsubscriptions.
   */
  emitEvent(slotName: string, payload?: unknown): void {
    const listeners = this.events.get(slotName) || [];
    for (const l of [...listeners]) {
      l(payload);
    }
  }

  /**
   * Clears all registered slots, bindings, and active writers.
   */
  reset(): void {
    this.signals.clear();
    this.events.clear();
    this.activeWriters.clear();
  }

  /**
   * Alias for registerSignalSlot and bindSignal with default writer.
   */
  registerSignal<T>(slot: string, getter: () => T, writerId = 'default'): void {
    this.registerSignalSlot(slot);
    this.bindSignal(slot, getter, writerId);
  }

  /**
   * Alias for registering and subscribing to a host event channel.
   */
  onEvent(slot: string, handler: (payload: unknown) => void): () => void {
    this.registerEventSlot(slot);
    return this.bindEvent(slot, handler);
  }

  /**
   * Alias for reset().
   */
  dispose(): void {
    this.reset();
  }
}
