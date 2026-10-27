/**
 * Imperative chunked tile layer with seam-safe sprite registration.
 */

import { SpriteScene } from './SpriteScene';
import type { FrustumBounds } from './camera';
import { isChunkInFrustum, type TilemapChunkPlan } from './tilemap';
import { buildTileContours, type TileCollisionPlan } from './tileContours';
import type {
  BlendMode,
  BoundingBox2D,
  ColorRgba,
  PresentationClock,
  Vector2D,
} from './types';

export interface TilePaletteEntry {
  readonly atlasId: string;
  readonly frameId: string;
  readonly solid?: boolean;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
  readonly flipDiagonal?: boolean;
  readonly rotation?: number;
  readonly quarterTurns?: number;
  readonly animationFrames?: readonly string[];
  readonly animationDurationMs?: number;
  readonly width?: number;
  readonly height?: number;
  readonly tint?: ColorRgba;
  readonly opacity?: number;
}

export interface TileCell {
  readonly id?: string;
  readonly tileId?: string | number;
  readonly atlasId?: string;
  readonly frameId?: string;
  readonly solid?: boolean;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
  readonly flipDiagonal?: boolean;
  readonly rotation?: number;
  readonly quarterTurns?: number;
  readonly animationFrames?: readonly string[];
  readonly animationDurationMs?: number;
  readonly width?: number;
  readonly height?: number;
  readonly tint?: ColorRgba;
  readonly opacity?: number;
  readonly explicitOrder?: number;
}

export type TileCellInput = TileCell | string | number | null | undefined;

export interface TileLayerConfig {
  readonly id: string;
  readonly columns?: number;
  readonly rows?: number;
  readonly width?: number;
  readonly height?: number;
  readonly tileSizeMeters?: number;
  readonly cellWidthMeters?: number;
  readonly cellHeightMeters?: number;
  readonly originX?: number;
  readonly originY?: number;
  readonly origin?: Vector2D;
  readonly firstTileCenterX?: number;
  readonly firstTileCenterY?: number;
  readonly chunkWidth?: number;
  readonly chunkHeight?: number;
  readonly layer?: string;
  readonly layerRank?: number;
  readonly subBand?: number;
  readonly explicitOrder?: number;
  readonly blendMode?: BlendMode;
  readonly tint?: ColorRgba;
  readonly opacity?: number;
  readonly parentId?: string | null;
  readonly palette?: Record<string | number, TilePaletteEntry> | readonly TilePaletteEntry[];
  readonly cells: readonly TileCellInput[];
  readonly revision?: number;
}

export interface TileEdit {
  readonly col: number;
  readonly row: number;
  readonly cell: TileCellInput;
}

export interface TileChunkInfo {
  readonly id: string;
  readonly chunkX: number;
  readonly chunkY: number;
  readonly startCol: number;
  readonly startRow: number;
  readonly endCol: number;
  readonly endRow: number;
  readonly bounds: BoundingBox2D;
  readonly tileSpriteIds: readonly string[];
}

interface AnimatedTileRecord {
  readonly nodeId: string;
  readonly frames: readonly string[];
  readonly durationMs: number;
  lastFrameId: string;
}

const MAX_TILES = 1_000_000;

/**
 * Imperative chunked tile layer.
 * Registers real tile sprites into SpriteScene.
 */
export class TileLayer {
  readonly id: string;
  readonly scene: SpriteScene;
  readonly columns: number;
  readonly rows: number;
  readonly cellWidthMeters: number;
  readonly cellHeightMeters: number;
  readonly originX: number;
  readonly originY: number;
  readonly chunkWidth: number;
  readonly chunkHeight: number;
  readonly bounds: BoundingBox2D;

  private readonly parentId: string | null;
  private readonly layerName: string;
  private readonly layerRank: number;
  private readonly subBand: number;
  private readonly baseExplicitOrder: number;
  private readonly defaultBlendMode: BlendMode;
  private readonly defaultTint: ColorRgba;
  private readonly defaultOpacity: number;

  private readonly palette = new Map<string | number, TilePaletteEntry>();
  private readonly cells: Array<TileCell | null>;
  private readonly registeredNodeIds = new Set<string>();
  private readonly chunkGroups = new Map<string, TileChunkInfo>();
  private readonly animatedTiles = new Map<string, AnimatedTileRecord>();

  revision: number;
  private disposed = false;

  constructor(scene: SpriteScene, config: TileLayerConfig) {
    if (!scene) {
      throw new TypeError('TileLayer: SpriteScene instance is required.');
    }
    if (!config || typeof config.id !== 'string' || config.id.trim().length === 0) {
      throw new TypeError('TileLayer: stable non-empty id is required.');
    }

    const columns = config.columns ?? config.width;
    const rows = config.rows ?? config.height;

    if (columns === undefined || !Number.isInteger(columns) || columns <= 0) {
      throw new RangeError('TileLayer: columns must be a positive integer.');
    }
    if (rows === undefined || !Number.isInteger(rows) || rows <= 0) {
      throw new RangeError('TileLayer: rows must be a positive integer.');
    }

    const totalCells = columns * rows;
    if (totalCells > MAX_TILES) {
      throw new RangeError(`TileLayer: total cell count (${totalCells}) exceeds limit (${MAX_TILES}).`);
    }

    const cellWidth = config.cellWidthMeters ?? config.tileSizeMeters ?? 1.0;
    const cellHeight = config.cellHeightMeters ?? config.tileSizeMeters ?? cellWidth;

    if (!Number.isFinite(cellWidth) || cellWidth <= 0) {
      throw new RangeError('TileLayer: cellWidthMeters must be a positive finite number.');
    }
    if (!Number.isFinite(cellHeight) || cellHeight <= 0) {
      throw new RangeError('TileLayer: cellHeightMeters must be a positive finite number.');
    }

    let originX = config.originX ?? config.origin?.x ?? 0;
    let originY = config.originY ?? config.origin?.y ?? 0;

    if (config.firstTileCenterX !== undefined) {
      originX = config.firstTileCenterX - 0.5 * cellWidth;
    }
    if (config.firstTileCenterY !== undefined) {
      originY = config.firstTileCenterY - (rows - 0.5) * cellHeight;
    }

    if (!Number.isFinite(originX) || !Number.isFinite(originY)) {
      throw new TypeError('TileLayer: origin coordinates must be finite numbers.');
    }

    const chunkWidth = config.chunkWidth ?? 8;
    const chunkHeight = config.chunkHeight ?? 8;

    if (!Number.isInteger(chunkWidth) || chunkWidth <= 0) {
      throw new RangeError('TileLayer: chunkWidth must be a positive integer.');
    }
    if (!Number.isInteger(chunkHeight) || chunkHeight <= 0) {
      throw new RangeError('TileLayer: chunkHeight must be a positive integer.');
    }

    if (!Array.isArray(config.cells) || config.cells.length < totalCells) {
      throw new RangeError(
        `TileLayer: cells array length (${config.cells ? config.cells.length : 0}) is less than required (${totalCells}).`,
      );
    }

    this.id = config.id;
    this.scene = scene;
    this.columns = columns;
    this.rows = rows;
    this.cellWidthMeters = cellWidth;
    this.cellHeightMeters = cellHeight;
    this.originX = originX;
    this.originY = originY;
    this.chunkWidth = chunkWidth;
    this.chunkHeight = chunkHeight;
    this.parentId = config.parentId ?? null;
    this.layerName = config.layer ?? 'default';
    this.layerRank = config.layerRank ?? 0;
    this.subBand = config.subBand ?? 0;
    this.baseExplicitOrder = config.explicitOrder ?? 0;
    this.defaultBlendMode = config.blendMode ?? 'normal';
    this.defaultTint = config.tint ? [...config.tint] : [1, 1, 1, 1];
    this.defaultOpacity = config.opacity ?? 1.0;
    this.revision = config.revision ?? 0;

    this.bounds = {
      minX: originX,
      minY: originY,
      maxX: originX + columns * cellWidth,
      maxY: originY + rows * cellHeight,
    };

    // Store palette definitions.
    if (config.palette) {
      if (Array.isArray(config.palette)) {
        for (let i = 0; i < config.palette.length; i += 1) {
          const entry = config.palette[i]!;
          this.validatePaletteEntry(entry, i);
          this.palette.set(i, entry);
        }
      } else if (typeof config.palette === 'object') {
        for (const [key, entry] of Object.entries(config.palette)) {
          this.validatePaletteEntry(entry, key);
          this.palette.set(key, entry);
          const numKey = Number(key);
          if (!Number.isNaN(numKey)) {
            this.palette.set(numKey, entry);
          }
        }
      } else {
        throw new TypeError('TileLayer: palette must be an array or object.');
      }
    }

    // Initialize cells and register sprites.
    this.cells = new Array<TileCell | null>(totalCells);
    this.createChunkGroups();

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < columns; c += 1) {
        const index = r * columns + c;
        const rawCell = config.cells[index];
        const normalized = this.normalizeCell(rawCell);
        this.cells[index] = normalized;

        if (normalized) {
          this.registerTileSprite(c, r, normalized, index);
        }
      }
    }
  }

  private validatePaletteEntry(entry: TilePaletteEntry, key: string | number): void {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof entry.atlasId !== 'string' ||
      entry.atlasId.trim().length === 0 ||
      typeof entry.frameId !== 'string' ||
      entry.frameId.trim().length === 0
    ) {
      throw new TypeError(`TileLayer: invalid palette entry at key "${key}".`);
    }
  }

  private normalizeCell(raw: TileCellInput): TileCell | null {
    if (raw === null || raw === undefined) {
      return null;
    }
    if (typeof raw === 'string' || typeof raw === 'number') {
      const entry = this.palette.get(raw);
      if (!entry) {
        return null;
      }
      return {
        tileId: raw,
        atlasId: entry.atlasId,
        frameId: entry.frameId,
        solid: entry.solid,
        flipX: entry.flipX,
        flipY: entry.flipY,
        flipDiagonal: entry.flipDiagonal,
        rotation: entry.rotation,
        quarterTurns: entry.quarterTurns,
        animationFrames: entry.animationFrames,
        animationDurationMs: entry.animationDurationMs,
        width: entry.width,
        height: entry.height,
        tint: entry.tint,
        opacity: entry.opacity,
      };
    }
    if (typeof raw === 'object') {
      return raw;
    }
    return null;
  }

  private createChunkGroups(): void {
    const chunkCols = Math.ceil(this.columns / this.chunkWidth);
    const chunkRows = Math.ceil(this.rows / this.chunkHeight);

    for (let cy = 0; cy < chunkRows; cy += 1) {
      for (let cx = 0; cx < chunkCols; cx += 1) {
        const chunkId = `${this.id}:chunk:${cx}_${cy}`;
        const startCol = cx * this.chunkWidth;
        const startRow = cy * this.chunkHeight;
        const endCol = Math.min(startCol + this.chunkWidth, this.columns);
        const endRow = Math.min(startRow + this.chunkHeight, this.rows);

        const chunkMinX = this.originX + startCol * this.cellWidthMeters;
        const chunkMaxX = this.originX + endCol * this.cellWidthMeters;
        const chunkMinY = this.originY + (this.rows - endRow) * this.cellHeightMeters;
        const chunkMaxY = this.originY + (this.rows - startRow) * this.cellHeightMeters;

        this.scene.registerGroup(chunkId, {
          profileId: 'flat-2d',
          parentId: this.parentId,
          visible: true,
        });
        this.registeredNodeIds.add(chunkId);

        this.chunkGroups.set(chunkId, {
          id: chunkId,
          chunkX: cx,
          chunkY: cy,
          startCol,
          startRow,
          endCol,
          endRow,
          bounds: {
            minX: chunkMinX,
            minY: chunkMinY,
            maxX: chunkMaxX,
            maxY: chunkMaxY,
          },
          tileSpriteIds: [],
        });
      }
    }
  }

  private registerTileSprite(col: number, row: number, cell: TileCell, index: number): void {
    const pal = cell.tileId !== undefined ? this.palette.get(cell.tileId) : undefined;
    const atlasId = cell.atlasId ?? pal?.atlasId;
    const frameId = cell.frameId ?? pal?.frameId;

    if (!atlasId || !frameId) {
      return;
    }

    const spriteId = cell.id ?? `${this.id}:tile:${col}_${row}`;
    const chunkX = Math.floor(col / this.chunkWidth);
    const chunkY = Math.floor(row / this.chunkHeight);
    const chunkId = `${this.id}:chunk:${chunkX}_${chunkY}`;

    // Convert row 0 top to world coordinates (+Y up).
    const centerX = this.originX + (col + 0.5) * this.cellWidthMeters;
    const centerY = this.originY + (this.rows - 1 - row + 0.5) * this.cellHeightMeters;

    let flipX = cell.flipX ?? pal?.flipX ?? false;
    const flipY = cell.flipY ?? pal?.flipY ?? false;
    const flipDiagonal = cell.flipDiagonal ?? pal?.flipDiagonal ?? false;

    let rotation = cell.rotation ?? pal?.rotation ?? 0;
    const quarterTurns = cell.quarterTurns ?? pal?.quarterTurns;

    if (quarterTurns !== undefined) {
      rotation = -((quarterTurns % 4 + 4) % 4) * (Math.PI / 2);
    }

    if (flipDiagonal) {
      rotation -= Math.PI / 2;
      flipX = !flipX;
    }

    const animFrames = cell.animationFrames ?? pal?.animationFrames;
    const animDur = cell.animationDurationMs ?? pal?.animationDurationMs ?? 500;
    const activeFrameId = animFrames && animFrames.length > 0 ? animFrames[0]! : frameId;

    const renderWidth = cell.width ?? pal?.width;
    const renderHeight = cell.height ?? pal?.height;

    const tint = cell.tint ?? pal?.tint ?? this.defaultTint;
    const opacity = (cell.opacity ?? pal?.opacity ?? 1.0) * this.defaultOpacity;
    const explicitOrder = cell.explicitOrder ?? this.baseExplicitOrder + index;

    this.scene.registerSprite(spriteId, {
      profileId: 'flat-2d',
      parentId: chunkId,
      atlasId,
      frameId: activeFrameId,
      x: centerX,
      y: centerY,
      rotation,
      flipX,
      flipY,
      width: renderWidth,
      height: renderHeight,
      tint: [...tint],
      opacity,
      layer: this.layerName,
      layerRank: this.layerRank,
      subBand: this.subBand,
      explicitOrder,
      blendMode: this.defaultBlendMode,
      visible: true,
    });

    this.registeredNodeIds.add(spriteId);

    const chunkInfo = this.chunkGroups.get(chunkId);
    if (chunkInfo) {
      (chunkInfo.tileSpriteIds as string[]).push(spriteId);
    }

    if (animFrames && animFrames.length > 1) {
      this.animatedTiles.set(spriteId, {
        nodeId: spriteId,
        frames: animFrames,
        durationMs: animDur,
        lastFrameId: activeFrameId,
      });
    }
  }

  /**
   * Read tile cell at grid coordinate.
   */
  getTile(col: number, row: number): TileCell | null {
    this.assertNotDisposed();
    if (
      !Number.isInteger(col) ||
      !Number.isInteger(row) ||
      col < 0 ||
      col >= this.columns ||
      row < 0 ||
      row >= this.rows
    ) {
      return null;
    }
    return this.cells[row * this.columns + col] ?? null;
  }

  /**
   * Set tile cell at grid coordinate and increment revision.
   */
  setTile(col: number, row: number, cellInput: TileCellInput): number {
    this.assertNotDisposed();
    if (
      !Number.isInteger(col) ||
      !Number.isInteger(row) ||
      col < 0 ||
      col >= this.columns ||
      row < 0 ||
      row >= this.rows
    ) {
      throw new RangeError(`TileLayer.setTile: coordinates (${col}, ${row}) outside bounds.`);
    }

    const index = row * this.columns + col;
    const oldCell = this.cells[index] ?? null;
    const newCell = this.normalizeCell(cellInput);
    this.cells[index] = newCell;

    const spriteId = oldCell?.id ?? newCell?.id ?? `${this.id}:tile:${col}_${row}`;

    if (!newCell) {
      if (this.registeredNodeIds.has(spriteId)) {
        this.scene.removeNode(spriteId);
        this.registeredNodeIds.delete(spriteId);
        this.animatedTiles.delete(spriteId);
      }
    } else if (!oldCell) {
      this.registerTileSprite(col, row, newCell, index);
    } else {
      // Update existing node.
      const pal = newCell.tileId !== undefined ? this.palette.get(newCell.tileId) : undefined;
      const atlasId = newCell.atlasId ?? pal?.atlasId;
      const frameId = newCell.frameId ?? pal?.frameId;

      let flipX = newCell.flipX ?? pal?.flipX ?? false;
      const flipY = newCell.flipY ?? pal?.flipY ?? false;
      const flipDiagonal = newCell.flipDiagonal ?? pal?.flipDiagonal ?? false;

      let rotation = newCell.rotation ?? pal?.rotation ?? 0;
      const quarterTurns = newCell.quarterTurns ?? pal?.quarterTurns;

      if (quarterTurns !== undefined) {
        rotation = -((quarterTurns % 4 + 4) % 4) * (Math.PI / 2);
      }
      if (flipDiagonal) {
        rotation -= Math.PI / 2;
        flipX = !flipX;
      }

      const animFrames = newCell.animationFrames ?? pal?.animationFrames;
      const animDur = newCell.animationDurationMs ?? pal?.animationDurationMs ?? 500;
      const activeFrameId = animFrames && animFrames.length > 0 ? animFrames[0]! : frameId;

      this.scene.updateNode(spriteId, {
        atlasId,
        frameId: activeFrameId,
        rotation,
        flipX,
        flipY,
        width: newCell.width ?? pal?.width,
        height: newCell.height ?? pal?.height,
        tint: newCell.tint ?? pal?.tint ?? this.defaultTint,
        opacity: (newCell.opacity ?? pal?.opacity ?? 1.0) * this.defaultOpacity,
      });

      if (animFrames && animFrames.length > 1) {
        this.animatedTiles.set(spriteId, {
          nodeId: spriteId,
          frames: animFrames,
          durationMs: animDur,
          lastFrameId: activeFrameId ?? '',
        });
      } else {
        this.animatedTiles.delete(spriteId);
      }
    }

    this.revision += 1;
    return this.revision;
  }

  /**
   * Apply a single tile edit and increment revision.
   */
  applyEdit(edit: TileEdit): number {
    this.assertNotDisposed();
    if (!edit || typeof edit !== 'object') {
      throw new TypeError('TileLayer.applyEdit: edit must be an object.');
    }
    return this.setTile(edit.col, edit.row, edit.cell);
  }

  /**
   * Update animated tiles and perform chunk culling.
   */
  update(clock?: PresentationClock, camera?: { position: Vector2D; frustum: FrustumBounds }): void {
    this.assertNotDisposed();

    if (clock) {
      if (typeof clock.activeSeconds !== 'number' || !Number.isFinite(clock.activeSeconds)) {
        throw new TypeError('TileLayer.update: clock.activeSeconds must be a finite number.');
      }
      if (!clock.suspended && this.animatedTiles.size > 0) {
        const elapsedMs = clock.activeSeconds * 1000;
        for (const record of this.animatedTiles.values()) {
          const frameCount = record.frames.length;
          const frameDur = record.durationMs > 0 ? record.durationMs / frameCount : 100;
          const frameIndex = Math.floor(elapsedMs / frameDur) % frameCount;
          const currentFrameId = record.frames[frameIndex]!;

          if (currentFrameId !== record.lastFrameId) {
            record.lastFrameId = currentFrameId;
            this.scene.updateNode(record.nodeId, { frameId: currentFrameId });
          }
        }
      }
    }

    if (camera) {
      if (!camera || typeof camera !== 'object' || !camera.position || typeof camera.position !== 'object' || !camera.frustum) {
        throw new TypeError('TileLayer.update: camera must have position and frustum.');
      }
      this.updateCulling(camera.position, camera.frustum);
    }
  }

  /**
   * Update chunk visibility using camera frustum.
   */
  updateCulling(cameraPosition: Vector2D, frustum: FrustumBounds): void {
    this.assertNotDisposed();
    if (!cameraPosition || !Number.isFinite(cameraPosition.x) || !Number.isFinite(cameraPosition.y)) {
      throw new TypeError('TileLayer.updateCulling: cameraPosition must have finite coordinates.');
    }
    if (!frustum || typeof frustum !== 'object') {
      throw new TypeError('TileLayer.updateCulling: frustum must be an object.');
    }

    for (const chunk of this.chunkGroups.values()) {
      const plan: TilemapChunkPlan = {
        id: chunk.id,
        chunkIndexX: chunk.chunkX,
        chunkIndexY: chunk.chunkY,
        tileOffsetX: chunk.startCol,
        tileOffsetY: chunk.startRow,
        widthTiles: chunk.endCol - chunk.startCol,
        heightTiles: chunk.endRow - chunk.startRow,
        worldBounds: chunk.bounds,
        cells: [],
      };

      const inFrustum = isChunkInFrustum(plan, frustum, cameraPosition);
      this.scene.updateNode(chunk.id, { visible: inFrustum });
    }
  }

  /**
   * Build seam-safe collision contour plan from solid cells.
   */
  buildCollisionPlan(): TileCollisionPlan {
    this.assertNotDisposed();
    const totalCells = this.columns * this.rows;
    const solidCells = new Array<boolean>(totalCells);

    for (let i = 0; i < totalCells; i += 1) {
      const cell = this.cells[i];
      if (!cell) {
        solidCells[i] = false;
        continue;
      }
      if (cell.solid !== undefined) {
        solidCells[i] = cell.solid;
        continue;
      }
      if (cell.tileId !== undefined) {
        const pal = this.palette.get(cell.tileId);
        solidCells[i] = pal?.solid ?? false;
        continue;
      }
      solidCells[i] = false;
    }

    return buildTileContours({
      layerId: this.id,
      revision: this.revision,
      width: this.columns,
      height: this.rows,
      cellWidthMeters: this.cellWidthMeters,
      cellHeightMeters: this.cellHeightMeters,
      originX: this.originX,
      originY: this.originY,
      solidCells,
    });
  }

  /**
   * Get list of chunk descriptors.
   */
  getChunks(): readonly TileChunkInfo[] {
    this.assertNotDisposed();
    return Array.from(this.chunkGroups.values());
  }

  /**
   * Get total bounding box of layer in world metres.
   */
  getBounds(): BoundingBox2D {
    this.assertNotDisposed();
    return { ...this.bounds };
  }

  /**
   * Dispose tile layer and remove all registered nodes.
   * Remove IDs exactly once.
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    for (const id of this.registeredNodeIds) {
      this.scene.removeNode(id);
    }

    this.registeredNodeIds.clear();
    this.animatedTiles.clear();
    this.chunkGroups.clear();
    this.palette.clear();
    this.cells.length = 0;
    this.disposed = true;
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error(`TileLayer: layer "${this.id}" is disposed.`);
    }
  }
}
