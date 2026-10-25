---
name: game-shell
description: Reusable semantic DOM game UI shell with HUD, menus, touch controls, and settings.
tier: view
renderMode: both
tags: [ui, dom, hud, shell, menu, touch, input, 2d, 3d]
---

# Game Shell

Provide a shared semantic DOM user interface for 2D and 3D games.
The module renders menus, heads-up display, touch controls, and settings dialogs.
It does not run physics or frame loops.
The game engine passes a read-only view model and action callbacks to the shell.

## Architecture

The shell separates DOM user interface elements from canvas rendering.
The game world mounts as a child element inside the shell.
Pointer events pass through transparent areas to the game canvas.
Interactive controls capture pointer events only on active buttons.
Opening a menu disables gameplay input.
Focus changes and pointer cancellations release active game commands.

## Public API

```tsx
import GameShell from '@modules/ui/game-shell/src/GameShell'
import '@modules/ui/game-shell/src/game-shell.css'

<GameShell view={view} actions={actions}>
  <GameCanvas />
</GameShell>
```

### View Properties

| Property | Type | Description |
|---|---|---|
| `status` | `'loading' \| 'ready' \| 'running' \| 'paused' \| 'results' \| 'error'` | Session lifecycle state |
| `dimension` | `'2d' \| '3d'` | Active camera and world dimension |
| `score` | `number` | Current round score |
| `bestScore` | `number` | Recorded high score |
| `secondsRemaining` | `number \| null` | Time remaining in seconds |
| `objective` | `string` | Active goal instruction |
| `progress` | `number?` | Level progress between 0 and 100 |
| `notice` | `string?` | Optional banner alert text |
| `error` | `string?` | Failure description during error status |
| `settings` | `GameSettings?` | Sound and reduced motion options |
| `canPickDimension` | `boolean?` | Shows dimension toggle button when true |
| `instructions` | `string \| string[]?` | Control instructions for help menu |

### Action Callbacks

| Action | Parameters | Description |
|---|---|---|
| `start` | `()` | Starts round from ready screen |
| `pause` | `()` | Pauses round and opens pause menu |
| `resume` | `()` | Resumes active round |
| `restart` | `()` | Restarts round from pause or results |
| `retry` | `()` | Retries startup after failure |
| `setDimension` | `(dim: '2d' \| '3d')` | Switches between 2D and 3D mode |
| `setHeld` | `(action: string, held: boolean)` | Sets continuous control hold state |
| `press` | `(action: string)` | Sends single button press command |
| `setSettings` | `(settings: Partial<GameSettings>)` | Saves updated player preferences |

## External Store Pattern

Use `createGameShellStore` to decouple frame rates from React rendering:

```ts
import { createGameShellStore } from '@modules/ui/game-shell/src/GameShellStore'

const store = createGameShellStore({
  status: 'ready',
  dimension: '2d',
  score: 0,
  bestScore: 100,
  secondsRemaining: 60,
  objective: 'Collect stars',
})

// Update store when state changes
store.updateField('score', 10)

// Pass store directly to GameShell
<GameShell view={store} actions={actions}>
  <GameCanvas />
</GameShell>
```

## Accessibility and Controls

- Every button target has a minimum size of 44 by 44 pixels.
- Menus trap keyboard focus while open.
- The Escape key closes open dialogs.
- Interactive elements show clear focus indicators.
- Touch controls support multi-touch and cancel events.
- All on-screen text uses plain words without technical jargon.
