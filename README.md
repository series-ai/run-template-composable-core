# Modules template

This starter uses React 19, R3F 9, Three, and Syncplay 6.0.0-rc.70.
Select Play to start the 2D collection game.
Select Switch to 3D to play the 3D collection game.
Both games use real Syncplay physics.

## Local commands

Use Node.js 24.

    npm ci
    npm run dev
    npm test
    npm run build

The build checks TypeScript and writes dist/.
The tests use the published Syncplay WASM files.

## Controls

Use the arrow keys or A/D to move in 2D.
Use the arrow keys or W/A/S/D to move in 3D.
Use Space to jump.
Touch devices show direction and jump buttons.
Standard gamepads use the left stick, direction pad, and first button.
The gamepad mapping still needs a physical device check.

## Owners

- src/core/StarterApplication.ts owns startup, input, host events, audio, and assets.
- src/modules/runtime/game-application/ owns each offline world and its fixed clock.
- src/viewport/GameViewport.tsx reads presentation poses. It does not step another world.
- src/modules/two-d/scene/ supplies sprites, atlases, tiles, cameras, and particles.
- src/modules/two-d/graphics/ supplies world text, shapes, masks, and bounded image effects.
- src/modules/ui/game-shell/ supplies the shared DOM interface.

The SDK storage adapter stores settings and best scores separately from round resumes.
Each dimension has its own resume record.
The browser build uses the SDK local host when no RUN host is present.
This does not verify the deployed host or cloud storage.

## Module source

The canonical module source is in the Venus modules/ catalog.
Do not edit the generated copies in this template inside Venus.
Use these commands from the Venus root:

    node scripts/modules/sync-starter-modules.mjs
    node scripts/modules/sync-starter-modules.mjs --check

module-sources.json records each copied file hash.
Each module includes upstream file hashes and adaptation notes.

## Delivery limits

The template supports offline worlds.
It does not create multiplayer sessions or adopt the genre controller slices.
Phone performance, full core parity, and staging H5 delivery remain release gates.
Syncplay 3D initialization requires JavaScript runtime code generation.
The current RUN H5 origin policy permits this and WASM compilation.
A different host must verify its CSP before use.

Studio imports a separate template repository.
A local Venus build does not update that repository or the Studio catalog.

## License

See LICENSE.txt.
