# Composable Core

A RUN.game starter with React 19, React Three Fiber 9, Three.js, Zustand, and Tailwind CSS 4.

## Run locally

Use Node.js 24 and npm. Install the locked dependencies:

    npm ci
    npm run dev

Open the URL that Vite prints. Select **+10 Points** to change the score.
Select the camera button to switch between the 2D and 3D views.

## Build

    npm run build
    npm run preview

The build runs TypeScript checks and writes the game to `dist/`.
GitHub Actions runs a clean install and build for pushes to `main` and pull requests.

## Included code

- `src/viewport/GameViewport.tsx` provides the canvas and camera views.
- `src/core/frameLoop.ts` provides a fixed-step update loop.
- `src/core/eventBus.ts` provides typed game events.
- `src/core/gameState.ts` stores the score and game state.
- `src/core/moduleHost.ts` provides signal and event bindings for modules.
- `game.config.prod.json` provides the RUN.game configuration.

The demo uses the event bus and game state. It does not connect modules to the
module host automatically. Module installation and integration need separate
verification for each module.

## Studio import

Studio imports this repository from the `main` branch. The game files are at the
repository root. Studio catalog registration and the Modules beta gate are
configured in Venus. This repository does not enable either setting.

## Source

The initial source comes from `templates/composable-core/` in
`series-ai/venus` at commit `b6dd7b0f1700c79719b43d8ed2ed86501771303f`.
This copy updates Drei for React Three Fiber 9 and removes an unused import.
It also preserves Tailwind control spacing and points the 3D camera at the demo.
The license notice follows the existing RUN.game starter repositories.

## License

See `LICENSE.txt`.
