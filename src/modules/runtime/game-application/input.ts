/**
 * Input state management and tick snapshot polling.
 */

import type { InputAction, InputCheckpointState } from './types.js';

/**
 * Read-only input interface provided to a simulation tick.
 */
export interface TickInput {
  readonly pressedActions: readonly InputAction[];
  isHeld(action: InputAction): boolean;
  wasPressed(action: InputAction): boolean;
  axis2D(): { readonly x: number; readonly y: number };
}

/**
 * Manages continuous held actions and single-tick latched press edges.
 */
export class InputManager {
  private readonly heldStates = new Map<string, boolean>();
  private readonly latchedPressed: string[] = [];

  /**
   * Sets continuous hold state for an action.
   * Latching a press edge occurs when transitioning from unheld to held.
   */
  setHeld(action: InputAction, held: boolean): void {
    const wasHeld = this.heldStates.get(action) ?? false;
    if (held && !wasHeld) {
      this.press(action);
    }
    this.heldStates.set(action, held);
  }

  /**
   * Latches a single press edge.
   * The first simulation tick that runs consumes this edge.
   */
  press(action: InputAction): void {
    if (this.latchedPressed.length >= 256) throw new RangeError('Input edge limit exceeded.');
    this.latchedPressed.push(action);
  }

  /**
   * Builds the input snapshot for a simulation tick.
   * Only the first tick in a pump consumes latched edges.
   */
  pollTick(isFirstEligibleTick: boolean): TickInput {
    const pressedActions = Object.freeze(isFirstEligibleTick ? this.latchedPressed.splice(0) : []);
    const tickPressed = new Set(pressedActions);

    const heldSnapshot = new Map(this.heldStates);

    return {
      pressedActions,
      isHeld(action: InputAction): boolean {
        return heldSnapshot.get(action) ?? false;
      },
      wasPressed(action: InputAction): boolean {
        return tickPressed.has(action);
      },
      axis2D(): { readonly x: number; readonly y: number } {
        const left = heldSnapshot.get('left') ? 1 : 0;
        const right = heldSnapshot.get('right') ? 1 : 0;
        const up = heldSnapshot.get('up') ? 1 : 0;
        const down = heldSnapshot.get('down') ? 1 : 0;
        return {
          x: right - left,
          y: up - down,
        };
      },
    };
  }

  /**
   * Captures serialized input state for checkpoints.
   */
  captureState(): InputCheckpointState {
    const held: Record<string, boolean> = {};
    for (const [action, isHeld] of this.heldStates.entries()) {
      if (isHeld) {
        held[action] = true;
      }
    }
    return {
      heldStates: held,
      latchedActions: Array.from(this.latchedPressed),
    };
  }

  /**
   * Restores input state from a checkpoint.
   */
  restoreState(state?: InputCheckpointState): void {
    this.heldStates.clear();
    this.latchedPressed.length = 0;
    if (!state) {
      return;
    }
    if (state.heldStates) {
      for (const [action, isHeld] of Object.entries(state.heldStates)) {
        if (isHeld) {
          this.heldStates.set(action, true);
        }
      }
    }
    if (Array.isArray(state.latchedActions)) {
      for (const action of state.latchedActions) {
        this.press(action);
      }
    }
  }

  /**
   * Clears all held actions and latched edges.
   */
  reset(): void {
    this.heldStates.clear();
    this.latchedPressed.length = 0;
  }
}
