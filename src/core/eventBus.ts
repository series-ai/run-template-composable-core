export type EventListener<T = unknown> = (payload: T) => void;

export interface GameEventBus<TMap extends Record<string, unknown>> {
  on<K extends keyof TMap>(event: K, listener: EventListener<TMap[K]>): () => void;
  once<K extends keyof TMap>(event: K, listener: EventListener<TMap[K]>): void;
  emit<K extends keyof TMap>(event: K, payload: TMap[K]): void;
  clear(): void;
}

export function createGameBus<TMap extends Record<string, unknown>>(): GameEventBus<TMap> {
  const listeners: Map<keyof TMap, Set<EventListener<any>>> = new Map();

  return {
    on<K extends keyof TMap>(event: K, listener: EventListener<TMap[K]>): () => void {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(listener);
      return () => {
        listeners.get(event)?.delete(listener);
      };
    },

    once<K extends keyof TMap>(event: K, listener: EventListener<TMap[K]>): void {
      const unsubscribe = this.on(event, (payload) => {
        unsubscribe();
        listener(payload);
      });
    },

    emit<K extends keyof TMap>(event: K, payload: TMap[K]): void {
      const set = listeners.get(event);
      if (set) {
        for (const fn of set) {
          try {
            fn(payload);
          } catch (err) {
            console.error(`[EventBus] Error in listener for event "${String(event)}":`, err);
          }
        }
      }
    },

    clear(): void {
      listeners.clear();
    },
  };
}

/** Default base game event contract before additional modules register their own events */
export interface BaseGameEvents extends Record<string, unknown> {
  "game:start": { timestamp: number };
  "game:pause": { paused: boolean };
  "game:score": { score: number; delta: number };
  "game:over": { finalScore: number; reason: string };
  "viewport:resize": { width: number; height: number; aspect: number };
  "webgl:contextrestored": void;
}

export const gameBus = createGameBus<BaseGameEvents>();
