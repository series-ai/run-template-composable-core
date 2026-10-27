/**
 * Canonical 2D sprite scene graph and registry.
 */

import { compareFixedCodepoints } from './fixedCodepointSort';
import type {
  AtlasFrame,
  AtlasManifest,
  BlendMode,
  BoundingBox2D,
  ColorRgba,
  FrameQuadMetrics,
  PickResult,
  ProfileId,
  RectPx,
  SceneNode,
  SceneNodeType,
} from './types';

export interface GroupOptions {
  profileId: ProfileId;
  hitBounds?: BoundingBox2D;
  opacity?: number;
  tint?: ColorRgba;
  layerRank?: number;
  subBand?: number;
  explicitOrder?: number;
  parentId?: string | null;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  visible?: boolean;
}

export interface SpriteOptions {
  profileId: ProfileId;
  interactive?: boolean;
  hitBounds?: BoundingBox2D;
  parentId?: string | null;
  atlasId?: string;
  frameId?: string;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  pivotX?: number;
  pivotY?: number;
  anchorOffsetXMeters?: number;
  anchorOffsetYMeters?: number;
  visible?: boolean;
  opacity?: number;
  tint?: ColorRgba;
  layer?: string;
  layerRank?: number;
  subBand?: number;
  explicitOrder?: number;
  sortY?: boolean;
  flipX?: boolean;
  flipY?: boolean;
  width?: number;
  height?: number;
  blendMode?: BlendMode;
  clipRect?: RectPx;
  maskId?: string;
}

export interface SpriteSceneOptions {
  pixelsPerMetre?: number;
}

export interface ForeignFrame2D {
  readonly matrix: readonly [number, number, number, number, number, number];
  readonly visible: boolean;
  readonly opacity: number;
  readonly tint: readonly [number, number, number, number];
  readonly renderOrder: number;
}
export interface ForeignBinding2D {
  readonly profileId: 'flat-2d';
  sync(frame: ForeignFrame2D): void;
  pick(x: number, y: number): boolean;
}

export interface NodePatch {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  pivotX: number;
  pivotY: number;
  anchorOffsetXMeters: number;
  anchorOffsetYMeters: number;
  visible: boolean;
  opacity: number;
  tint: ColorRgba;
  layer: string;
  layerRank: number;
  subBand: number;
  explicitOrder: number;
  sortY: boolean;
  flipX: boolean;
  flipY: boolean;
  atlasId: string;
  frameId: string;
  width: number;
  height: number;
  blendMode: BlendMode;
  clipRect: RectPx | undefined;
  maskId: string | undefined;
}

/**
 * Multiply two 2D affine transforms.
 * Format: [a, b, c, d, tx, ty].
 */
function multiplyTransforms(
  parent: [number, number, number, number, number, number],
  local: [number, number, number, number, number, number],
): [number, number, number, number, number, number] {
  const [pa, pb, pc, pd, ptx, pty] = parent;
  const [la, lb, lc, ld, ltx, lty] = local;
  return [
    pa * la + pc * lb,
    pb * la + pd * lb,
    pa * lc + pc * ld,
    pb * lc + pd * ld,
    pa * ltx + pc * lty + ptx,
    pb * ltx + pd * lty + pty,
  ];
}

/**
 * Invert a 2D affine transform.
 */
function invertTransform(
  m: [number, number, number, number, number, number],
): [number, number, number, number, number, number] | null {
  const [a, b, c, d, tx, ty] = m;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-12) {
    return null;
  }
  const invDet = 1.0 / determinant;
  const ia = d * invDet;
  const ib = -b * invDet;
  const ic = -c * invDet;
  const id = a * invDet;
  const itx = (c * ty - d * tx) * invDet;
  const ity = (b * tx - a * ty) * invDet;
  return [ia, ib, ic, id, itx, ity];
}

/**
 * Compute the frame quad metrics in metres.
 * Uses the same trimmed untrimmed-source pivot rectangle and renderAnchorOffset for draw, bounds, and picking.
 */
export function computeFrameQuadMetrics(
  frame: AtlasFrame | undefined,
  node: {
    width?: number;
    height?: number;
    pivotX: number;
    pivotY: number;
    anchorOffsetXMeters: number;
    anchorOffsetYMeters: number;
  },
  pixelsPerMetre: number,
): FrameQuadMetrics {
  if (frame) {
    const sourceW = frame.sourceSizePx.width / pixelsPerMetre;
    const sourceH = frame.sourceSizePx.height / pixelsPerMetre;
    const trimX = frame.trimmedRectPx.x / pixelsPerMetre;
    const trimY = frame.trimmedRectPx.y / pixelsPerMetre;
    const trimW = frame.trimmedRectPx.width / pixelsPerMetre;
    const trimH = frame.trimmedRectPx.height / pixelsPerMetre;
    const pivotX = frame.pivotNormalized.x;
    const pivotY = frame.pivotNormalized.y;

    const localLeft = -pivotX * sourceW + trimX + node.anchorOffsetXMeters;
    const localTop = pivotY * sourceH - trimY + node.anchorOffsetYMeters;
    const localBottom = localTop - trimH;

    return {
      localLeft,
      localBottom,
      localWidth: trimW,
      localHeight: trimH,
    };
  }

  const width = node.width ?? 1;
  const height = node.height ?? 1;
  const localLeft = -node.pivotX * width + node.anchorOffsetXMeters;
  const localBottom = -node.pivotY * height + node.anchorOffsetYMeters;

  return {
    localLeft,
    localBottom,
    localWidth: width,
    localHeight: height,
  };
}

function computeFrameHitMetrics(frame: AtlasFrame | undefined, node: SceneNode, pixelsPerMetre: number): FrameQuadMetrics {
  if (!frame) return computeFrameQuadMetrics(frame, node, pixelsPerMetre);
  const width = frame.sourceSizePx.width / pixelsPerMetre;
  const height = frame.sourceSizePx.height / pixelsPerMetre;
  return { localLeft: -frame.pivotNormalized.x * width + node.anchorOffsetXMeters,
    localBottom: (frame.pivotNormalized.y - 1) * height + node.anchorOffsetYMeters,
    localWidth: width, localHeight: height };
}

export class SpriteScene {
  private readonly foreign = new Map<string, ForeignBinding2D>();
  readonly pixelsPerMetre: number;
  private readonly nodes = new Map<string, SceneNode>();
  private readonly rootNodeIds = new Set<string>();
  private readonly atlases = new Map<string, AtlasManifest>();
  private disposed = false;

  constructor(options?: SpriteSceneOptions) {
    this.pixelsPerMetre = options?.pixelsPerMetre ?? 100;
  }

  /**
   * Register an atlas manifest.
   * Validates dimensions and sets frame atlas dimensions.
   */
  registerAtlas(manifest: AtlasManifest): void {
    this.assertNotDisposed();
    if (!manifest.pixelWidth || manifest.pixelWidth <= 0 || !manifest.pixelHeight || manifest.pixelHeight <= 0) {
      throw new RangeError(
        `SpriteScene.registerAtlas: atlas "${manifest.atlasId}" must have finite positive pixelWidth and pixelHeight.`,
      );
    }
    for (const frame of Object.values(manifest.frames)) {
      frame.atlasPixelWidth = manifest.pixelWidth;
      frame.atlasPixelHeight = manifest.pixelHeight;
    }
    this.atlases.set(manifest.atlasId, manifest);
  }

  getAtlas(atlasId: string): AtlasManifest | undefined {
    return this.atlases.get(atlasId);
  }

  getFrame(atlasId: string, frameId: string): AtlasFrame | undefined {
    return this.atlases.get(atlasId)?.frames[frameId];
  }

  registerGroup(id: string, options: GroupOptions): void {
    this.assertNotDisposed();
    if (!options || !options.profileId) {
      throw new Error(`SpriteScene.registerGroup: profileId is required for group "${id}".`);
    }
    this.registerNode(id, 'group', {
      profileId: options.profileId,
      interactive: options.hitBounds !== undefined,
      hitBounds: options.hitBounds,
      opacity: options.opacity,
      tint: options.tint,
      layerRank: options.layerRank,
      subBand: options.subBand,
      explicitOrder: options.explicitOrder,
      parentId: options.parentId ?? null,
      x: options.x ?? 0,
      y: options.y ?? 0,
      scaleX: options.scaleX ?? 1,
      scaleY: options.scaleY ?? 1,
      rotation: options.rotation ?? 0,
      visible: options.visible ?? true,
    });
  }

  registerSprite(id: string, options: SpriteOptions): void {
    this.assertNotDisposed();
    if (!options || !options.profileId) {
      throw new Error(`SpriteScene.registerSprite: profileId is required for sprite "${id}".`);
    }
    this.registerNode(id, 'sprite', options);
  }

  registerForeign(id: string, options: SpriteOptions, binding: ForeignBinding2D): void {
    this.assertNotDisposed();
    if (options.profileId !== 'flat-2d' || binding.profileId !== 'flat-2d') throw new Error('Foreign layers require the flat-2d profile.');
    this.registerNode(id, 'foreign', options); this.foreign.set(id, binding);
  }

  syncForeignLayers(ordered: readonly SceneNode[]): void {
    const ranks = new Map(ordered.map((node, index) => [node.id, index]));
    for (const [id, binding] of this.foreign) {
      const node = this.nodes.get(id); if (!node) continue;
      const rank = ranks.get(id);
      binding.sync({ matrix: node.worldMatrix, visible: rank !== undefined,
        opacity: node.worldOpacity, tint: node.worldTint, renderOrder: rank ?? 0 });
    }
  }

  private registerNode(id: string, type: SceneNodeType, options: SpriteOptions): void {
    if (this.nodes.has(id)) {
      throw new Error(`SpriteScene: duplicate node ID "${id}".`);
    }

    const profileId = options.profileId;
    if (profileId !== 'flat-2d') {
      throw new Error(`SpriteScene: unsupported profileId "${profileId}".`);
    }

    const parentId = options.parentId ?? null;
    if (parentId !== null) {
      const parent = this.nodes.get(parentId);
      if (!parent || parent.disposed) {
        throw new Error(`SpriteScene: parent node "${parentId}" does not exist.`);
      }
    }

    const defaultTint: ColorRgba = [1, 1, 1, 1];
    if (options.hitBounds && (!Object.values(options.hitBounds).every(Number.isFinite) || options.hitBounds.minX >= options.hitBounds.maxX || options.hitBounds.minY >= options.hitBounds.maxY)) throw new RangeError('Invalid hit bounds.');
    const initialVisible = options.visible ?? true;
    const initialOpacity = options.opacity ?? 1;
    const initialTint = options.tint ? ([...options.tint] as ColorRgba) : defaultTint;

    const node: SceneNode = {
      id,
      type,
      profileId,
      interactive: options.interactive ?? true,
      hitBounds: options.hitBounds ? { ...options.hitBounds } : undefined,
      parentId,
      childrenIds: [],
      x: options.x ?? 0,
      y: options.y ?? 0,
      scaleX: options.scaleX ?? 1,
      scaleY: options.scaleY ?? 1,
      rotation: options.rotation ?? 0,
      pivotX: options.pivotX ?? 0.5,
      pivotY: options.pivotY ?? 0.5,
      anchorOffsetXMeters: options.anchorOffsetXMeters ?? 0,
      anchorOffsetYMeters: options.anchorOffsetYMeters ?? 0,
      visible: initialVisible,
      opacity: initialOpacity,
      tint: initialTint,
      worldVisible: initialVisible,
      worldOpacity: initialOpacity,
      worldTint: [...initialTint],
      layer: options.layer ?? 'default',
      layerRank: options.layerRank ?? 0,
      subBand: options.subBand ?? 0,
      explicitOrder: options.explicitOrder ?? 0,
      sortY: options.sortY ?? false,
      flipX: options.flipX ?? false,
      flipY: options.flipY ?? false,
      atlasId: options.atlasId,
      frameId: options.frameId,
      width: options.width,
      height: options.height,
      blendMode: options.blendMode ?? 'normal',
      clipRect: options.clipRect,
      maskId: options.maskId,
      worldMatrix: [1, 0, 0, 1, 0, 0],
      worldBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      dirty: true,
      disposed: false,
    };

    this.nodes.set(id, node);

    if (parentId !== null) {
      const parent = this.nodes.get(parentId)!;
      parent.childrenIds.push(id);
    } else {
      this.rootNodeIds.add(id);
    }
  }

  setParent(childId: string, parentId: string | null): void {
    this.assertNotDisposed();
    const child = this.getNode(childId);
    if (!child) {
      throw new Error(`SpriteScene: child node "${childId}" not found.`);
    }

    if (child.parentId === parentId) {
      return;
    }

    if (parentId !== null) {
      if (parentId === childId) {
        throw new Error(`SpriteScene: node "${childId}" cannot be its own parent.`);
      }
      const parent = this.getNode(parentId);
      if (!parent) {
        throw new Error(`SpriteScene: parent node "${parentId}" not found.`);
      }

      // Check for cycles by walking parent chain upwards
      let current: string | null = parentId;
      while (current !== null) {
        if (current === childId) {
          throw new Error(`SpriteScene: cycle detected when setting parent of "${childId}" to "${parentId}".`);
        }
        current = this.nodes.get(current)?.parentId ?? null;
      }
    }

    // Remove child from prior parent or root set
    if (child.parentId !== null) {
      const oldParent = this.nodes.get(child.parentId);
      if (oldParent) {
        const index = oldParent.childrenIds.indexOf(childId);
        if (index >= 0) {
          oldParent.childrenIds.splice(index, 1);
        }
      }
    } else {
      this.rootNodeIds.delete(childId);
    }

    // Attach to new parent or root set
    child.parentId = parentId;
    if (parentId !== null) {
      const newParent = this.nodes.get(parentId)!;
      newParent.childrenIds.push(childId);
    } else {
      this.rootNodeIds.add(childId);
    }

    this.markDirty(child);
  }

  updateNode(id: string, patch: Partial<NodePatch>): void {
    this.assertNotDisposed();
    const node = this.getNode(id);
    if (!node) {
      throw new Error(`SpriteScene: cannot update missing node "${id}".`);
    }

    let transformChanged = false;
    if (patch.x !== undefined && patch.x !== node.x) {
      node.x = patch.x;
      transformChanged = true;
    }
    if (patch.y !== undefined && patch.y !== node.y) {
      node.y = patch.y;
      transformChanged = true;
    }
    if (patch.scaleX !== undefined && patch.scaleX !== node.scaleX) {
      node.scaleX = patch.scaleX;
      transformChanged = true;
    }
    if (patch.scaleY !== undefined && patch.scaleY !== node.scaleY) {
      node.scaleY = patch.scaleY;
      transformChanged = true;
    }
    if (patch.rotation !== undefined && patch.rotation !== node.rotation) {
      node.rotation = patch.rotation;
      transformChanged = true;
    }
    if (patch.pivotX !== undefined && patch.pivotX !== node.pivotX) {
      node.pivotX = patch.pivotX;
      transformChanged = true;
    }
    if (patch.pivotY !== undefined && patch.pivotY !== node.pivotY) {
      node.pivotY = patch.pivotY;
      transformChanged = true;
    }
    if (patch.anchorOffsetXMeters !== undefined && patch.anchorOffsetXMeters !== node.anchorOffsetXMeters) {
      node.anchorOffsetXMeters = patch.anchorOffsetXMeters;
      transformChanged = true;
    }
    if (patch.anchorOffsetYMeters !== undefined && patch.anchorOffsetYMeters !== node.anchorOffsetYMeters) {
      node.anchorOffsetYMeters = patch.anchorOffsetYMeters;
      transformChanged = true;
    }
    if (patch.flipX !== undefined && patch.flipX !== node.flipX) {
      node.flipX = patch.flipX;
      transformChanged = true;
    }
    if (patch.flipY !== undefined && patch.flipY !== node.flipY) {
      node.flipY = patch.flipY;
      transformChanged = true;
    }
    if (patch.width !== undefined && patch.width !== node.width) {
      node.width = patch.width;
      transformChanged = true;
    }
    if (patch.height !== undefined && patch.height !== node.height) {
      node.height = patch.height;
      transformChanged = true;
    }

    if (patch.visible !== undefined) node.visible = patch.visible;
    if (patch.opacity !== undefined) node.opacity = patch.opacity;
    if (patch.tint !== undefined) node.tint = [...patch.tint];
    if (patch.layer !== undefined) node.layer = patch.layer;
    if (patch.layerRank !== undefined) node.layerRank = patch.layerRank;
    if (patch.subBand !== undefined) node.subBand = patch.subBand;
    if (patch.explicitOrder !== undefined) node.explicitOrder = patch.explicitOrder;
    if (patch.sortY !== undefined) node.sortY = patch.sortY;
    if (patch.atlasId !== undefined) node.atlasId = patch.atlasId;
    if (patch.frameId !== undefined) {
      node.frameId = patch.frameId;
      transformChanged = true;
    }
    if (patch.blendMode !== undefined) node.blendMode = patch.blendMode;
    if (patch.clipRect !== undefined) node.clipRect = patch.clipRect;
    if (patch.maskId !== undefined) node.maskId = patch.maskId;

    if (transformChanged) {
      this.markDirty(node);
    }
  }

  private markDirty(node: SceneNode): void {
    if (node.dirty) return;
    node.dirty = true;
    for (const childId of node.childrenIds) {
      const child = this.nodes.get(childId);
      if (child) {
        this.markDirty(child);
      }
    }
  }

  removeNode(id: string): void {
    this.assertNotDisposed();
    const node = this.nodes.get(id);
    if (!node || node.disposed) {
      return;
    }

    // Detach from parent
    if (node.parentId !== null) {
      const parent = this.nodes.get(node.parentId);
      if (parent) {
        const index = parent.childrenIds.indexOf(id);
        if (index >= 0) {
          parent.childrenIds.splice(index, 1);
        }
      }
    } else {
      this.rootNodeIds.delete(id);
    }

    // Recursively remove children
    for (const childId of [...node.childrenIds]) {
      this.removeNode(childId);
    }

    node.disposed = true;
    this.nodes.delete(id);
    this.foreign.delete(id);
  }

  getNode(id: string): SceneNode | undefined {
    const node = this.nodes.get(id);
    if (!node || node.disposed) {
      return undefined;
    }
    return node;
  }

  /**
   * Propagate dirty transforms, visibility, opacity, and tint through hierarchy.
   */
  updateTransforms(): void {
    this.assertNotDisposed();
    for (const rootId of this.rootNodeIds) {
      const rootNode = this.nodes.get(rootId);
      if (rootNode) {
        this.updateNodeTransform(rootNode, [1, 0, 0, 1, 0, 0], 1.0, [1, 1, 1, 1], true);
      }
    }
  }

  private updateNodeTransform(
    node: SceneNode,
    parentWorldMatrix: [number, number, number, number, number, number],
    parentOpacity: number,
    parentTint: ColorRgba,
    parentVisible: boolean,
  ): void {
    if (node.disposed) return;

    node.worldVisible = parentVisible && node.visible;
    node.worldOpacity = parentOpacity * node.opacity;
    node.worldTint = [
      parentTint[0] * node.tint[0],
      parentTint[1] * node.tint[1],
      parentTint[2] * node.tint[2],
      parentTint[3] * node.tint[3],
    ];

    if (node.dirty) {
      const cos = Math.cos(node.rotation);
      const sin = Math.sin(node.rotation);
      const sx = node.flipX ? -node.scaleX : node.scaleX;
      const sy = node.flipY ? -node.scaleY : node.scaleY;

      // Local affine matrix: [sx * cos, sx * sin, -sy * sin, sy * cos, x, y]
      const localMatrix: [number, number, number, number, number, number] = [
        sx * cos,
        sx * sin,
        -sy * sin,
        sy * cos,
        node.x,
        node.y,
      ];

      node.worldMatrix = multiplyTransforms(parentWorldMatrix, localMatrix);
      this.computeNodeBounds(node);
      node.dirty = false;
    }

    for (const childId of node.childrenIds) {
      const child = this.nodes.get(childId);
      if (child) {
        this.updateNodeTransform(child, node.worldMatrix, node.worldOpacity, node.worldTint, node.worldVisible);
      }
    }
  }

  private computeNodeBounds(node: SceneNode): void {
    const frame = node.atlasId && node.frameId ? this.getFrame(node.atlasId, node.frameId) : undefined;
    const q = computeFrameQuadMetrics(frame, node, this.pixelsPerMetre);

    const left = q.localLeft;
    const bottom = q.localBottom;
    const right = q.localLeft + q.localWidth;
    const top = q.localBottom + q.localHeight;

    const [a, b, c, d, tx, ty] = node.worldMatrix;

    const x1 = a * left + c * bottom + tx;
    const y1 = b * left + d * bottom + ty;
    const x2 = a * right + c * bottom + tx;
    const y2 = b * right + d * bottom + ty;
    const x3 = a * right + c * top + tx;
    const y3 = b * right + d * top + ty;
    const x4 = a * left + c * top + tx;
    const y4 = b * left + d * top + ty;

    node.worldBounds = {
      minX: Math.min(x1, x2, x3, x4),
      minY: Math.min(y1, y2, y3, y4),
      maxX: Math.max(x1, x2, x3, x4),
      maxY: Math.max(y1, y2, y3, y4),
    };
  }

  /**
   * Query all visible nodes sorted by global transparent order.
   * Sort criteria:
   * 1. layerRank (ascending)
   * 2. subBand (ascending)
   * 3. explicitOrder (ascending)
   * 4. depthKey (-footWorldY if sortY is enabled)
   * 5. stable ID (fixed codepoints)
   */
  queryVisibleNodes(includeHitAreas = false): SceneNode[] {
    this.assertNotDisposed();
    this.updateTransforms();

    const visibleList: SceneNode[] = [];
    for (const node of this.nodes.values()) {
      if (!node.disposed && node.worldVisible && (node.type !== 'group' || (includeHitAreas && node.hitBounds)) && node.worldOpacity > 0) {
        visibleList.push(node);
      }
    }

    visibleList.sort((left, right) => {
      if (left.layerRank !== right.layerRank) {
        return left.layerRank - right.layerRank;
      }
      if (left.subBand !== right.subBand) {
        return left.subBand - right.subBand;
      }
      if (left.explicitOrder !== right.explicitOrder) {
        return left.explicitOrder - right.explicitOrder;
      }
      if (left.sortY || right.sortY) {
        // depthKey = -footWorldY (lower world Y draws later)
        const leftDepth = left.sortY ? -left.worldMatrix[5] : 0;
        const rightDepth = right.sortY ? -right.worldMatrix[5] : 0;
        if (leftDepth !== rightDepth) {
          return leftDepth - rightDepth;
        }
      }
      return compareFixedCodepoints(left.id, right.id);
    });

    return visibleList;
  }

  /**
   * Test whether a world coordinate is inside a node.
   */
  isPointInsideNode(node: SceneNode, worldX: number, worldY: number): boolean {
    const inv = invertTransform(node.worldMatrix);
    if (!inv) return false;
    const localX = inv[0] * worldX + inv[2] * worldY + inv[4];
    const localY = inv[1] * worldX + inv[3] * worldY + inv[5];

    const frame = node.atlasId && node.frameId ? this.getFrame(node.atlasId, node.frameId) : undefined;
    const q = computeFrameQuadMetrics(frame, node, this.pixelsPerMetre);

    return (
      localX >= q.localLeft &&
      localX <= q.localLeft + q.localWidth &&
      localY >= q.localBottom &&
      localY <= q.localBottom + q.localHeight
    );
  }

  /**
   * Reverse visual-order pick query.
   * Hits top-rendered node first.
   */
  pick(worldX: number, worldY: number): PickResult | null {
    this.assertNotDisposed();
    this.syncForeignLayers(this.queryVisibleNodes());
    const sorted = this.queryVisibleNodes(true);

    // Iterate backwards from top to bottom
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      const node = sorted[i]!;
      if (!node.interactive) continue;
      if (node.type === 'mask') continue;
      if (node.type === 'foreign') {
        if (this.foreign.get(node.id)?.pick(worldX, worldY)) return { nodeId: node.id, worldX, worldY, localX: worldX, localY: worldY };
        continue;
      }

      // Clip rect check in world metres
      if (node.clipRect) {
        const cr = node.clipRect;
        const minX = cr.x / this.pixelsPerMetre;
        const maxX = (cr.x + cr.width) / this.pixelsPerMetre;
        const minY = cr.y / this.pixelsPerMetre;
        const maxY = (cr.y + cr.height) / this.pixelsPerMetre;
        if (worldX < minX || worldX > maxX || worldY < minY || worldY > maxY) {
          continue;
        }
      }

      // Mask check
      if (node.maskId) {
        const maskNode = this.getNode(node.maskId);
        if (!maskNode || !this.isPointInsideNode(maskNode, worldX, worldY)) {
          continue;
        }
      }

      // Local coordinate inverse transform check
      const inv = invertTransform(node.worldMatrix);
      if (!inv) {
        continue;
      }

      const relativeX = worldX - node.worldMatrix[4];
      const relativeY = worldY - node.worldMatrix[5];
      const localX = inv[0] * relativeX + inv[2] * relativeY;
      const localY = inv[1] * relativeX + inv[3] * relativeY;
      if (node.hitBounds) {
        const bounds = node.hitBounds;
        if (localX >= bounds.minX && localX < bounds.maxX && localY > bounds.minY && localY <= bounds.maxY) {
          return { nodeId: node.id, worldX, worldY, localX, localY };
        }
        continue;
      }

      const frame = node.atlasId && node.frameId ? this.getFrame(node.atlasId, node.frameId) : undefined;
      const q = computeFrameHitMetrics(frame, node, this.pixelsPerMetre);

      if (
        localX >= q.localLeft &&
        localX < q.localLeft + q.localWidth &&
        localY >= q.localBottom &&
        localY < q.localBottom + q.localHeight
      ) {
        return {
          nodeId: node.id,
          worldX,
          worldY,
          localX,
          localY,
        };
      }
    }

    return null;
  }

  clear(): void {
    for (const binding of this.foreign.values()) binding.sync({ matrix: [1, 0, 0, 1, 0, 0], visible: false, opacity: 0, tint: [1, 1, 1, 1], renderOrder: 0 });
    this.foreign.clear();
    this.nodes.clear();
    this.rootNodeIds.clear();
    this.atlases.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error('SpriteScene: instance is disposed.');
    }
  }
}
