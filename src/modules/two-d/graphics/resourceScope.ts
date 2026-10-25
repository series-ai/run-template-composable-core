/**
 * Single resource scope for 2D graphics with idempotent disposal.
 */

import type * as THREE from 'three';
import { BitmapTextMesh, createBitmapTextMesh } from './bitmapText';
import { Flat2DMaterial, type Flat2DMaterialOptions } from './materials';
import { OffscreenCompositor } from './offscreenCompositor';
import type {
  BitmapFontManifest,
  BitmapTextOptions,
  VectorMeshOptions,
  VectorShapeDefinition,
} from './types';
import { createVectorMesh, VectorMesh } from './vectorMesh';

export interface DisposableResource {
  dispose(): void;
}

/**
 * Resource scope that manages lifecycle of 2D graphics objects.
 * Prevents per-frame allocations and eliminates per-actor Texture.clone calls.
 */
export class GraphicsResourceScope {
  private readonly resources = new Set<DisposableResource>();
  private disposed = false;

  /**
   * Track a disposable resource within this scope.
   */
  track<T extends DisposableResource>(resource: T): T {
    this.assertNotDisposed();
    this.resources.add(resource);
    return resource;
  }

  /**
   * Create and track a VectorMesh.
   */
  createVectorMesh(shape: VectorShapeDefinition, options: VectorMeshOptions): VectorMesh {
    this.assertNotDisposed();
    const mesh = createVectorMesh(shape, options);
    this.track(mesh);
    return mesh;
  }

  /**
   * Create and track a BitmapTextMesh.
   */
  createBitmapTextMesh(
    text: string,
    font: BitmapFontManifest,
    options?: BitmapTextOptions,
  ): BitmapTextMesh {
    this.assertNotDisposed();
    const mesh = createBitmapTextMesh(text, font, options);
    this.track(mesh);
    return mesh;
  }

  /**
   * Create and track an OffscreenCompositor.
   */
  createCompositor(): OffscreenCompositor {
    this.assertNotDisposed();
    const compositor = new OffscreenCompositor();
    this.track(compositor);
    return compositor;
  }

  /**
   * Create and track a Flat2DMaterial.
   */
  createFlat2DMaterial(options?: Flat2DMaterialOptions): Flat2DMaterial {
    this.assertNotDisposed();
    const mat = new Flat2DMaterial(options);
    this.track(mat);
    return mat;
  }

  /**
   * Create and track a WebGLRenderTarget through an owned compositor.
   */
  createRenderTarget(
    compositor: OffscreenCompositor,
    width: number,
    height: number,
  ): THREE.WebGLRenderTarget {
    this.assertNotDisposed();
    const rt = compositor.createRenderTarget(width, height);
    this.track(rt);
    return rt;
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error('GraphicsResourceScope is disposed.');
    }
  }

  /**
   * Idempotent disposal of all tracked resources.
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    for (const res of this.resources) {
      try {
        res.dispose();
      } catch {
        // Continue disposing remaining resources
      }
    }
    this.resources.clear();
  }
}
