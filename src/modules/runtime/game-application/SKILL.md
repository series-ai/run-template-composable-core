---
name: game-application
description: Headless GameApplication owner with Syncplay 2D/3D physics, fixed-step runtime, and UI view model.
tier: runtime
renderMode: both
tags: [runtime, physics, syncplay, 2d, 3d, game-application, fixed-step]
---

# Game Application

The `game-application` module provides a headless game application owner.
It integrates Syncplay 2D and 3D physics with a deterministic fixed-step loop.
It manages user input, persists player progress, and publishes UI state.

React components subscribe to the UI view model and read presentation frames.
Physics worlds execute outside React and Canvas component lifecycles.

## Integration

Import the factory from `@modules/runtime/game-application/createGameApplication`.
Call `createGameApplication` with the desired dimension.

```ts
import { createGameApplication } from '@modules/runtime/game-application/createGameApplication';

// Create the game application owner.
const app = await createGameApplication({
  dimension: '2d',
});

// Subscribe to UI changes.
const unsubscribe = app.subscribe(() => {
  const view = app.getView();
  console.log('Current score:', view.score);
});

// Update the game in your animation loop.
function onFrame(deltaSeconds: number): void {
  app.pump(deltaSeconds);
  const frame = app.getPresentation();
  renderWorld(frame);
}

// Dispose the application on shutdown.
app.dispose();
unsubscribe();
```

## Input

Send input commands through the `app.input` interface:

```ts
// Continuous button or key hold:
app.input.setHeld('left', true);
app.input.setHeld('left', false);

// Single button press edge:
app.input.press('jump');
```

Press edges apply to the first simulation tick that follows.
Subsequent ticks in the same pump do not re-consume the edge.

## Suspension

Suspend the runtime when the player opens a menu or switches tabs:

```ts
// Suspend the simulation:
app.setSuspended('pause-menu', true);

// Resume the simulation:
app.setSuspended('pause-menu', false);
```

The runtime stops while any suspension cause remains active.
The first pump after resume ignores elapsed delta time.

## Persistence

Save player progress and restore saved rounds:

```ts
// Save current progress:
await app.save();

// Restore saved progress:
await app.restore();
```

The journal uses an atomic A/B record strategy with checksum verification.
Corrupt round data resets safely to a fresh round while keeping valid progress.
