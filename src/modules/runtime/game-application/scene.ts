/**
 * Shared scene definition for physics and rendering.
 */

export interface EntityRender2D {
  readonly shape: 'box' | 'circle';
  readonly size: readonly [width: number, height: number];
  readonly atlasRole: 'ground' | 'wall' | 'platform' | 'player' | 'star' | 'obstacle' | string;
  readonly layerRank: number;
}

export interface EntitySceneDefinition2D {
  readonly id: string;
  readonly kind: 'static' | 'dynamic';
  readonly shape:
    | { readonly type: 'box'; readonly halfX: number; readonly halfY: number }
    | { readonly type: 'circle'; readonly radius: number };
  readonly position: readonly [x: number, y: number];
  readonly angle?: number;
  readonly isSensor?: boolean;
  readonly massKg?: number;
  readonly friction?: number;
  readonly render: EntityRender2D;
}

export interface SceneDefinition2D {
  readonly dimension: '2d';
  readonly gravity: readonly [x: number, y: number];
  readonly entities: readonly EntitySceneDefinition2D[];
}

export interface EntityRender3D {
  readonly shape: 'box' | 'sphere';
  readonly size: readonly [width: number, height: number, depth: number];
  readonly role: 'ground' | 'wall' | 'player' | 'orb' | 'obstacle' | string;
  readonly color: string;
}

export interface EntitySceneDefinition3D {
  readonly id: string;
  readonly kind: 'static' | 'dynamic';
  readonly shape:
    | { readonly type: 'box'; readonly halfX: number; readonly halfY: number; readonly halfZ: number }
    | { readonly type: 'sphere'; readonly radius: number };
  readonly position: readonly [x: number, y: number, z: number];
  readonly orientation?: readonly [x: number, y: number, z: number, w: number];
  readonly isSensor?: boolean;
  readonly massKg?: number;
  readonly friction?: number;
  readonly render: EntityRender3D;
}

export interface SceneDefinition3D {
  readonly dimension: '3d';
  readonly gravity: readonly [x: number, y: number, z: number];
  readonly entities: readonly EntitySceneDefinition3D[];
}

export function ownScene<T extends SceneDefinition2D | SceneDefinition3D>(input: T): T {
  const scene = structuredClone(input);
  if (!scene.entities.length || scene.entities.length > 64) throw new Error('Scene body count must be from 1 to 64.');
  const ids = new Set<string>();
  for (const entity of scene.entities) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(entity.id) || ids.has(entity.id)) throw new Error('Scene entity IDs must be unique.');
    ids.add(entity.id);
  }
  function freeze(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  freeze(scene); return scene;
}

/**
 * Immutable reference scene for 2D platformer.
 * Jump velocity 8.5 m/s and gravity 18 m/s^2 gives 2.0 m rise.
 * Platforms and collectibles are verified reachable by solver proof.
 */
export const REFERENCE_SCENE_2D: SceneDefinition2D = {
  dimension: '2d',
  gravity: [0, -18],
  entities: [
    {
      id: 'ground',
      kind: 'static',
      shape: { type: 'box', halfX: 20, halfY: 0.5 },
      position: [0, -0.5],
      render: { shape: 'box', size: [40, 1], atlasRole: 'ground', layerRank: 1 },
    },
    {
      id: 'wall_left',
      kind: 'static',
      shape: { type: 'box', halfX: 0.5, halfY: 6 },
      position: [-12, 5],
      render: { shape: 'box', size: [1, 12], atlasRole: 'wall', layerRank: 1 },
    },
    {
      id: 'wall_right',
      kind: 'static',
      shape: { type: 'box', halfX: 0.5, halfY: 6 },
      position: [16, 5],
      render: { shape: 'box', size: [1, 12], atlasRole: 'wall', layerRank: 1 },
    },
    {
      id: 'platform_1',
      kind: 'static',
      shape: { type: 'box', halfX: 2.0, halfY: 0.2 },
      position: [5.0, 1.0],
      render: { shape: 'box', size: [4.0, 0.4], atlasRole: 'platform', layerRank: 1 },
    },
    {
      id: 'platform_2',
      kind: 'static',
      shape: { type: 'box', halfX: 2.0, halfY: 0.2 },
      position: [10.5, 2.0],
      render: { shape: 'box', size: [4.0, 0.4], atlasRole: 'platform', layerRank: 1 },
    },
    {
      id: 'obstacle_1',
      kind: 'dynamic',
      shape: { type: 'box', halfX: 0.4, halfY: 0.4 },
      position: [-4.0, 0.4],
      massKg: 2,
      friction: 0.3,
      render: { shape: 'box', size: [0.8, 0.8], atlasRole: 'obstacle', layerRank: 1 },
    },
    {
      id: 'player',
      kind: 'dynamic',
      shape: { type: 'circle', radius: 0.45 },
      position: [0, 1.5],
      massKg: 1,
      friction: 0.2,
      render: { shape: 'circle', size: [0.9, 0.9], atlasRole: 'player', layerRank: 3 },
    },
    {
      id: 'star_0',
      kind: 'static',
      isSensor: true,
      shape: { type: 'circle', radius: 0.35 },
      position: [0, 1.5],
      render: { shape: 'circle', size: [0.7, 0.7], atlasRole: 'star', layerRank: 2 },
    },
    {
      id: 'star_1',
      kind: 'static',
      isSensor: true,
      shape: { type: 'circle', radius: 0.35 },
      position: [4.0, 2.3],
      render: { shape: 'circle', size: [0.7, 0.7], atlasRole: 'star', layerRank: 2 },
    },
    {
      id: 'star_2',
      kind: 'static',
      isSensor: true,
      shape: { type: 'circle', radius: 0.35 },
      position: [6.0, 1.65],
      render: { shape: 'circle', size: [0.7, 0.7], atlasRole: 'star', layerRank: 2 },
    },
    {
      id: 'star_3',
      kind: 'static',
      isSensor: true,
      shape: { type: 'circle', radius: 0.35 },
      position: [9.5, 3.5],
      render: { shape: 'circle', size: [0.7, 0.7], atlasRole: 'star', layerRank: 2 },
    },
    {
      id: 'star_4',
      kind: 'static',
      isSensor: true,
      shape: { type: 'circle', radius: 0.35 },
      position: [11.5, 2.65],
      render: { shape: 'circle', size: [0.7, 0.7], atlasRole: 'star', layerRank: 2 },
    },
  ],
};

/**
 * Immutable reference scene for 3D arena.
 */
export const REFERENCE_SCENE_3D: SceneDefinition3D = {
  dimension: '3d',
  gravity: [0, -9.81, 0],
  entities: [
    {
      id: 'ground',
      kind: 'static',
      shape: { type: 'box', halfX: 20, halfY: 0.5, halfZ: 20 },
      position: [0, -0.5, 0],
      render: { shape: 'box', size: [40, 1, 40], role: 'ground', color: '#3c725e' },
    },
    {
      id: 'wall_north',
      kind: 'static',
      shape: { type: 'box', halfX: 20, halfY: 2, halfZ: 0.5 },
      position: [0, 2, -20],
      render: { shape: 'box', size: [40, 4, 1], role: 'wall', color: '#bb8a65' },
    },
    {
      id: 'wall_south',
      kind: 'static',
      shape: { type: 'box', halfX: 20, halfY: 2, halfZ: 0.5 },
      position: [0, 2, 20],
      render: { shape: 'box', size: [40, 4, 1], role: 'wall', color: '#bb8a65' },
    },
    {
      id: 'wall_west',
      kind: 'static',
      shape: { type: 'box', halfX: 0.5, halfY: 2, halfZ: 20 },
      position: [-20, 2, 0],
      render: { shape: 'box', size: [1, 4, 40], role: 'wall', color: '#bb8a65' },
    },
    {
      id: 'wall_east',
      kind: 'static',
      shape: { type: 'box', halfX: 0.5, halfY: 2, halfZ: 20 },
      position: [20, 2, 0],
      render: { shape: 'box', size: [1, 4, 40], role: 'wall', color: '#bb8a65' },
    },
    {
      id: 'obstacle_1',
      kind: 'dynamic',
      shape: { type: 'box', halfX: 0.6, halfY: 0.6, halfZ: 0.6 },
      position: [3, 1, 0],
      massKg: 5,
      friction: 0.4,
      render: { shape: 'box', size: [1.2, 1.2, 1.2], role: 'obstacle', color: '#bb8a65' },
    },
    {
      id: 'player',
      kind: 'dynamic',
      shape: { type: 'sphere', radius: 0.5 },
      position: [0, 1.5, 0],
      massKg: 70,
      friction: 0.5,
      render: { shape: 'sphere', size: [1.0, 1.0, 1.0], role: 'player', color: '#80d9cc' },
    },
    {
      id: 'orb_0',
      kind: 'static',
      isSensor: true,
      shape: { type: 'sphere', radius: 0.4 },
      position: [4, 1.2, 4],
      render: { shape: 'sphere', size: [0.8, 0.8, 0.8], role: 'orb', color: '#ffd36c' },
    },
    {
      id: 'orb_1',
      kind: 'static',
      isSensor: true,
      shape: { type: 'sphere', radius: 0.4 },
      position: [-4, 1.2, 4],
      render: { shape: 'sphere', size: [0.8, 0.8, 0.8], role: 'orb', color: '#ffd36c' },
    },
    {
      id: 'orb_2',
      kind: 'static',
      isSensor: true,
      shape: { type: 'sphere', radius: 0.4 },
      position: [4, 1.2, -4],
      render: { shape: 'sphere', size: [0.8, 0.8, 0.8], role: 'orb', color: '#ffd36c' },
    },
    {
      id: 'orb_3',
      kind: 'static',
      isSensor: true,
      shape: { type: 'sphere', radius: 0.4 },
      position: [-4, 1.2, -4],
      render: { shape: 'sphere', size: [0.8, 0.8, 0.8], role: 'orb', color: '#ffd36c' },
    },
    {
      id: 'orb_4',
      kind: 'static',
      isSensor: true,
      shape: { type: 'sphere', radius: 0.4 },
      position: [0, 1.2, 6],
      render: { shape: 'sphere', size: [0.8, 0.8, 0.8], role: 'orb', color: '#ffd36c' },
    },
  ],
};
