---
name: two-d-scene
description: Canonical R3F 2D scene runtime for Venus with multi-texture batching, transform tree, and camera helpers.
tier: view
renderMode: both
tags: [2d, scene, r3f, three, sprite, atlas, animation, tilemap, camera, text, batch]
---

# 2D Scene Runtime

This module provides canonical 2D scene rendering for React Three Fiber.
It renders batched sprites, tile layers, and cosmetic particles.
The two-d/graphics module supplies text, shapes, masks, and image effects.

## Capabilities

- One central `SpriteScene` graph registry.
- Declarative `Sprite2D` and `SpriteGroup` components that mount once.
- Zero React state changes per animation frame.
- Ordered multi-texture shader batches with up to 4 atlas samplers.
- Unrolled `textureLod` LOD0 shader sampling.
- Preservation of global transparent draw order across multiple atlases.
- Premultiplied alpha encoded-sRGB flat material pipeline.
- Monotonic `renderOrder` on all flat transparent owners.
- Reverse visual-order picking on the CPU with transformed bounds.
- Orthographic camera fit, follow, deadzone, and parallax helpers.
- Chunked tilemap culling, animation, and collision merge plans.
- Owned atlas textures with nearest or linear sampling.
- Seeded particle pools and shared 2D particle batches.

## Explicit Source Files

Import directly from explicit source files.
Do not use barrel exports.

- `@modules/two-d/scene/types`: Core types and interfaces.
- `@modules/two-d/scene/SpriteScene`: Scene graph registry and picking.
- `@modules/two-d/scene/atlasManifest`: Atlas validation and parsers.
- `@modules/two-d/scene/animation`: Animation frame resolution.
- `@modules/two-d/scene/camera`: Camera and stage math helpers.
- `@modules/two-d/scene/TileLayer`: Tile registration, animation, culling, and contour plans.
- `@modules/two-d/scene/materials`: Multi-texture flat shaders.
- `@modules/two-d/scene/batchRenderer`: Batch planning and mesh pools.
- `@modules/two-d/scene/Sprite2D`: Declarative sprite component.
- `@modules/two-d/scene/SpriteGroup`: Declarative group component.
- `@modules/two-d/scene/SpriteBatchView`: R3F view component.

## Integration

### 1. Initialize Scene and Atlas

```ts
import { SpriteScene } from '@modules/two-d/scene/SpriteScene';
import { validateAtlasManifest } from '@modules/two-d/scene/atlasManifest';

const scene = new SpriteScene();

const atlas = validateAtlasManifest({
  atlasId: 'hero',
  imagePath: '/assets/hero.png',
  pixelWidth: 1024,
  pixelHeight: 1024,
  frames: {
    idle_0: {
      id: 'idle_0',
      atlasId: 'hero',
      rectPx: { x: 0, y: 0, width: 64, height: 64 },
      sourceSizePx: { width: 64, height: 64 },
      trimmedRectPx: { x: 0, y: 0, width: 64, height: 64 },
      rotation: 'none',
      pivotNormalized: { x: 0.5, y: 0.5 },
    },
  },
});

scene.registerAtlas(atlas);
```

### 2. Mount Sprites Declaratively

```tsx
import { useRef } from 'react';
import Sprite2D, { type Sprite2DHandle } from '@modules/two-d/scene/Sprite2D';
import SpriteGroup from '@modules/two-d/scene/SpriteGroup';

function GameScene({ scene }: { scene: SpriteScene }) {
  const playerRef = useRef<Sprite2DHandle>(null);

  return (
    <SpriteGroup id="world" scene={scene} profileId="flat-2d">
      <Sprite2D
        profileId="flat-2d"
        ref={playerRef}
        id="player"
        scene={scene}
        atlasId="hero"
        frameId="idle_0"
        x={0}
        y={0}
        sortY={true}
      />
    </SpriteGroup>
  );
}
```

### 3. Render Batched Sprites in Canvas

```tsx
import SpriteBatchView from '@modules/two-d/scene/SpriteBatchView';

function View({ scene, clock, textures }: { scene: SpriteScene; clock: PresentationClock; textures: Map<string, THREE.Texture> }) {
  return <SpriteBatchView scene={scene} clock={clock} textures={textures} />;
}
```

## Constraints and Limits

- All flat elements require `profileId: 'flat-2d'`.
- Tint colors must be normalized `[r, g, b, a]` numeric tuples.
- The batch renderer supports at most 4 atlas textures per batch run.
- The offscreen compositor supports at most 2 active render targets.
- The offscreen compositor permits a maximum render target size of 512x512 pixels.
- The mask system permits at most 2 nested masks.

## Ownership and limits

The application owns AtlasTextures. Release each lease or dispose the owner.
Flat sources use encoded sRGB RGBA. The texture owner premultiplies once at upload.
The batch reads that alpha tag. It does not premultiply the sampled color twice.
Nearest and linear sampling use separate texture leases. Mipmaps are off.
The texture limit is 64 MiB by default.

ParticleEmitter accepts an explicit active clock. A new epoch clears particles.
Each emitter permits at most 1,000 live particles. Long gaps expire full lifetimes.
Motion catch-up has a 0.25-second cap. Reduced motion clears and suppresses particles.
ParticleSprites places all 2D emitters in the shared sprite batch.
ParticleView provides one separate fixed-band owner for a 3D overlay.
No particle code implements gameplay collision or physics.

Tile contours contain authoring vertices only. Apply collider edits through Syncplay.
No tile module owns a physics stepper.

Axis-aligned nearest samples round UVs to a 1/4096-texel grid before LOD0 sampling.
This stabilizes exact texel boundaries. Rotated and linear samples keep continuous UVs.
