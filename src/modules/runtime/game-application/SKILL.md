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

## Online play

A 2D round can move onto a Syncplay deterministic room, where only player inputs cross the network
and each player's game steps the same world. No room server code is involved.

```ts
import { createSyncplayRoom } from '@series-inc/rundot-syncplay/browser';
import { NET_SEATS, netSessionConfigBytes, netSessionConfigDigest } from '@modules/runtime/game-application/netRuntime';

const app = await createGameApplication({ dimension: '2d', netIdentity });
const transport = await createSyncplayRoom(RundotAPI.realtime, {
  maxPlayers: NET_SEATS, runtimeIdentity: netIdentity,
  sessionConfigBytes: netSessionConfigBytes, sessionConfigDigest: netSessionConfigDigest,
});
await app.startOnline(async () => transport);
// Later: app.leaveOnline();
```

- The shared world adds one copy of the scene's `player` entity per seat (`player`, `player_1`).
  `app.localPlayerId` names the one this browser controls.
- The round waits in `ready`, with `view.online.state` `waiting`, until every seat is filled.
- Pause, save and restore do nothing while online. Restart starts a new round for everyone.
- `netIdentity` binds the simulation sources and the Syncplay version. The game generates it
  (the Modules template runs `npm run gen:net-identity`) and passes it in; a room from another build is refused.
- The game's `rundot/rooms.config.json` declares the `deterministic` room type.
