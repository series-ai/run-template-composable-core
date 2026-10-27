---
name: two-d-graphics
description: Canonical 2D vector shapes, bitmap text, masks, nine-slice, and offscreen compositor for Venus.
tier: view
renderMode: both
tags: [2d, graphics, vector, shapes, text, masks, compositor, nine-slice, r3f, three]
---

# 2D Graphics Module

This module provides 2D graphics tools for React Three Fiber and Three.js.
It renders filled vector shapes, stroked lines, bitmap text, and masks.
It also provides an offscreen compositor and nine-slice quad generators.

## Capabilities

- Filled vector rectangles, rounded rectangles, circles, and polygons.
- Stroked line paths with miter joins and end caps.
- Encoded sRGB premultiplied Flat2D materials.
- Required profileId "flat-2d" on all materials and adapters.
- World bitmap text with glyph lifetimes, wrapping, and alignment.
- Separate authoritative font manifest and studio limit settings.
- Nine-slice and repeated tile quad generation using actual atlas dimensions.
- Bounded transformed rect, circle, and sprite-alpha masks.
- Maximum two nested masks.
- Consistent GPU shader masks and CPU picking contracts.
- CPU alpha picking with preloaded arrays and no synchronous GPU readback.
- Offscreen compositor with a maximum of two live 512x512 render targets.
- Separable two-pass blur, color adjustments, and alpha outlines.
- Idempotent resource cleanup in a single resource scope.
- Integration adapter with explicit render order.

## Source Files

Import directly from explicit source files.
Do not use barrel exports.

- `@modules/two-d/graphics/src/types`: Core types and interfaces.
- `@modules/two-d/graphics/src/color`: Encoded sRGB color validation and utilities.
- `@modules/two-d/graphics/src/materials`: Flat2D materials and premultiplied blending.
- `@modules/two-d/graphics/src/vectorGeometry`: Triangulated 2D vector geometries.
- `@modules/two-d/graphics/src/vectorMesh`: Vector mesh factory objects.
- `@modules/two-d/graphics/src/bitmapText`: World bitmap text rendering and glyph lifetimes.
- `@modules/two-d/graphics/src/nineSlice`: Nine-slice and tiled quad generators.
- `@modules/two-d/graphics/src/masks`: Transformed masks, shader injection, and CPU picking.
- `@modules/two-d/graphics/src/offscreenCompositor`: Render target management and effect passes.
- `@modules/two-d/graphics/src/resourceScope`: Idempotent resource tracking.
- `@modules/two-d/graphics/src/foreignAdapter`: Integration adapter with explicit render order.
