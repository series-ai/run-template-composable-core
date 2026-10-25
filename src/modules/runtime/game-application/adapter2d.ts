import { parseRoundCheckpoint } from './checkpoint.js';
/**
 * 2D Syncplay physics adapter and reference game rules.
 */

import {
  initPhysics2D,
  createPhysicsWorld2D,
  type PhysicsWorld2D,
  type PhysicsBodyHandle2D,
  meters,
  metersPerSecond,
  metersPerSecondSquared,
  kilograms,
  radians,
} from '@series-inc/rundot-syncplay/physics/2d';
import type {
  Pose2D,
  PosePair2D,
  PresentationFrame,
  RoundCheckpoint,
  GameStatus,
  InputCheckpointState,
  CanonicalEntityState2D,
} from './types.js';
import type { TickInput } from './input.js';
import { CURRENT_CHECKPOINT_VERSION, computeChecksum } from './journal.js';
import { type SceneDefinition2D, ownScene, REFERENCE_SCENE_2D } from './scene.js';

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}


function makeWorld(scene: SceneDefinition2D): PhysicsWorld2D {
  return createPhysicsWorld2D({ tickRate: 60, initialGravity: { x: metersPerSecondSquared(scene.gravity[0]), y: metersPerSecondSquared(scene.gravity[1]) },
    capacity: { bodies: 64, joints: 16, contacts: 128 } });
}

interface EntityRecord2D {
  readonly entityId: string;
  readonly bodyId: number;
  handle: PhysicsBodyHandle2D;
  isSensor?: boolean;
  collected?: boolean;
}

export class WorldAdapter2D {
  private world: PhysicsWorld2D;
  private readonly scene: SceneDefinition2D;
  private entities = new Map<string, EntityRecord2D>();
  private poses = new Map<string, { previous: Pose2D; current: Pose2D; snap: boolean }>();

  private currentTick = 0;
  private epoch = 1;
  private isGrounded = false;

  readonly runtimeIdentity: string;
  score = 0;
  status: GameStatus = 'ready';
  secondsRemaining: number | null = 60;
  objective = 'Collect all 5 stars to win.';
  eventSequence = 0;

  private constructor(world: PhysicsWorld2D, scene: SceneDefinition2D) {
    this.world = world;
    this.scene = scene;
    const info = world.info();
    this.runtimeIdentity = `@series-inc/rundot-syncplay@6.0.0-rc.66:2d:artifact=49cb90541deed40f5fff1015bb578e13ec9a793d51931c1227e3e5a11bbfa3f7:abi=${info.worldAbiVersion}:tickRate=${info.tickRate}:dt=${info.fixedDt}:substeps=${info.substeps}:iterations=${info.velocityIterations}:scene=${computeChecksum(JSON.stringify(scene))}:rules=v1:schema=v${CURRENT_CHECKPOINT_VERSION}`;
  }

  static async create(scene: SceneDefinition2D = REFERENCE_SCENE_2D): Promise<WorldAdapter2D> {
    scene = ownScene(scene);
    await initPhysics2D();
    const world = makeWorld(scene);

    const adapter = new WorldAdapter2D(world, scene);
    try { adapter.setupScene(); return adapter; }
    catch (error) { world.dispose(); throw error; }
  }

  private setupScene(): void {
    this.entities.clear();
    this.poses.clear();

    const createdItems: Array<{ entityId: string; isSensor?: boolean; key: number }> = [];

    this.world.edit((ops) => {
      for (const entity of this.scene.entities) {
        const shapeInput =
          entity.shape.type === 'box'
            ? {
                type: 'box' as const,
                halfX: meters(entity.shape.halfX),
                halfY: meters(entity.shape.halfY),
              }
            : {
                type: 'circle' as const,
                radius: meters(entity.shape.radius),
              };

        const bodyRef = ops.createBody({
          shape: shapeInput,
          x: meters(entity.position[0]),
          y: meters(entity.position[1]),
          angle: entity.angle !== undefined ? radians(entity.angle) : undefined,
          kind: entity.kind,
          sensor: entity.isSensor,
          mass: entity.massKg !== undefined ? kilograms(entity.massKg) : undefined,
          friction: entity.friction,
        });

        createdItems.push({
          entityId: entity.id,
          isSensor: entity.isSensor,
          key: bodyRef.createdKey,
        });
      }
    });

    for (const item of createdItems) {
      const handle = this.world.resolveBody(item.key);
      this.entities.set(item.entityId, {
        entityId: item.entityId,
        bodyId: item.key,
        handle,
        isSensor: item.isSensor,
        collected: false,
      });

      const body = this.world.readBody(handle);
      const initialPose: Pose2D = {
        xMeters: body.x,
        yMeters: body.y,
        angleRadians: body.angle,
      };

      this.poses.set(item.entityId, {
        previous: initialPose,
        current: initialPose,
        snap: true,
      });
    }
  }

  /**
   * Resets round to initial state and increments snap epoch.
   */
  restart(): void {
    this.world.dispose();
    this.world = makeWorld(this.scene);

    this.score = 0;
    this.status = 'running';
    this.secondsRemaining = 60;
    this.objective = 'Collect all 5 stars to win.';
    this.currentTick = 0;
    this.epoch += 1;
    this.isGrounded = false;
    this.setupScene();
  }

  /**
   * Returns current physics digest string.
   */
  getPhysicsDigest(): string {
    return this.world.digest().toString();
  }

  /**
   * Returns shared scene definition.
   */
  getScene(): SceneDefinition2D {
    return this.scene;
  }

  /**
   * Checks whether the player stands on ground by inspecting contact normal.
   */
  private checkGrounded(playerBodyId: number, playerX: number, playerY: number): boolean {
    const hits = this.world.raycast({
      x: meters(playerX),
      y: meters(playerY),
      dx: 0,
      dy: -1,
      maxDistance: meters(0.55),
      filter: {
        excludeBodyIds: [playerBodyId],
        hitSolids: true,
        includeSensors: false,
      },
    });

    for (const hit of hits) {
      if (hit.kind === 'surfaceHit' && hit.normal.y > 0.7) {
        return true;
      }
    }

    return false;
  }

  /**
   * Advances simulation by one fixed tick.
   */
  step(fixedDt: number, input: TickInput): void {
    const playerRecord = this.entities.get('player');
    if (!playerRecord) {
      return;
    }

    if (this.status !== 'running') {
      return;
    }

    if (this.secondsRemaining !== null) {
      this.secondsRemaining = Math.max(0, this.secondsRemaining - fixedDt);
      if (this.secondsRemaining === 0) {
        this.status = 'results';
        this.objective = 'Time expired!';
      }
    }

    const playerBody = this.world.readBody(playerRecord.handle);
    this.isGrounded = this.checkGrounded(playerRecord.bodyId, playerBody.x, playerBody.y);

    // Observe trigger contacts from Syncplay
    const latestOutputs = this.world.latest();
    for (const contact of latestOutputs.contacts) {
      const involvesPlayer =
        contact.bodyA === playerRecord.bodyId || contact.bodyB === playerRecord.bodyId;
      if (!involvesPlayer) {
        continue;
      }

      const otherBodyId =
        contact.bodyA === playerRecord.bodyId ? contact.bodyB : contact.bodyA;

      if (contact.type === 'enter') {
        for (let i = 0; i < 5; i += 1) {
          const starRecord = this.entities.get(`star_${i}`);
          if (starRecord && starRecord.bodyId === otherBodyId && !starRecord.collected) {
            starRecord.collected = true;
            this.score += 100;
            this.eventSequence += 1;

            this.world.edit((ops) => {
              ops.replaceBody(starRecord.handle, {
                shape: { type: 'circle', radius: meters(0.01) },
                x: meters(-999),
                y: meters(-999),
                kind: 'static',
                sensor: true,
              });
            });
          }
        }
      }
    }

    // Check victory condition
    let allCollected = true;
    for (let i = 0; i < 5; i += 1) {
      if (!this.entities.get(`star_${i}`)?.collected) {
        allCollected = false;
        break;
      }
    }

    if (allCollected && this.status === 'running') {
      this.status = 'results';
      this.objective = 'Stage Clear! All stars collected.';
    }

    // Apply movement
    if (this.status === 'running') {
      let vx = 0;
      if (input.isHeld('left')) {
        vx -= 6;
      }
      if (input.isHeld('right')) {
        vx += 6;
      }
      if (input.isHeld('action')) {
        vx *= 1.4;
      }

      let vy = playerBody.vy;
      if (input.wasPressed('jump') && this.isGrounded) {
        vy = metersPerSecond(8.5);
        this.isGrounded = false;
      }

      this.world.edit((ops) => {
        ops.replaceBody(playerRecord.handle, {
          shape: { type: 'circle', radius: meters(0.45) },
          x: meters(playerBody.x),
          y: meters(playerBody.y),
          angle: playerBody.angle,
          vx: metersPerSecond(vx),
          vy: metersPerSecond(vy),
          kind: 'dynamic',
          mass: kilograms(1),
          friction: 0.2,
        });
      });
    }

    // Step Syncplay world
    this.world.step();
    this.currentTick += 1;

    // Update entity poses
    for (const [entityId, record] of this.entities.entries()) {
      const body = this.world.readBody(record.handle);
      const poseState = this.poses.get(entityId);
      if (!poseState) {
        continue;
      }

      const nextPose: Pose2D = {
        xMeters: body.x,
        yMeters: body.y,
        angleRadians: body.angle,
      };

      this.poses.set(entityId, {
        previous: poseState.current,
        current: nextPose,
        snap: false,
      });
    }
  }

  /**
   * Returns presentation frame interpolated with alpha.
   */
  getPresentation(alpha: number): PresentationFrame {
    const posePairs: PosePair2D[] = [];

    for (const [entityId, record] of this.entities.entries()) {
      const poseState = this.poses.get(entityId);
      if (!poseState) {
        continue;
      }

      posePairs.push({
        entityId,
        visible: !record.collected,
        bodyIdDecimal: record.bodyId.toString(),
        previous: poseState.previous,
        current: poseState.current,
        snap: poseState.snap,
      });
    }

    return {
      dimension: '2d',
      epoch: this.epoch,
      previousTick: Math.max(0, this.currentTick - 1),
      currentTick: this.currentTick,
      alpha,
      poses: posePairs,
    };
  }

  /**
   * Captures canonical state and physics WASM checkpoint.
   */
  captureCheckpoint(inputState: InputCheckpointState): RoundCheckpoint {
    const cp = this.world.captureCheckpoint();
    const bytes = this.world.serializeCheckpoint(cp);
    this.world.releaseCheckpoint(cp);

    const bodyIdMap: Record<string, string> = {};
    for (const [entityId, record] of this.entities.entries()) {
      bodyIdMap[entityId] = record.bodyId.toString();
    }

    const collectedIds: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      if (this.entities.get(`star_${i}`)?.collected) {
        collectedIds.push(`star_${i}`);
      }
    }

    const canonical: CanonicalEntityState2D = {
      score: this.score,
      status: this.status,
      secondsRemaining: this.secondsRemaining,
      objective: this.objective,
      collectedIds,
      isGrounded: this.isGrounded,
      eventSequence: this.eventSequence,
    };

    return {
      version: CURRENT_CHECKPOINT_VERSION,
      runtimeIdentity: this.runtimeIdentity,
      dimension: '2d',
      tick: this.currentTick,
      physicsEpoch: this.epoch,
      canonicalEntityState: canonical,
      bodyIdMap,
      physicsCheckpointBase64: uint8ArrayToBase64(bytes),
      eventSequence: this.eventSequence,
      inputState,
      physicsDigest: this.world.digest().toString(),
    };
  }

  /**
   * Restores checkpoint and re-resolves fresh handles.
   * Disposes and recreates world on native restore failure.
   */
  restoreCheckpoint(checkpoint: RoundCheckpoint): void {
    const expected = new Map([...this.entities].map(([id, record]) => [id, record.bodyId.toString()]));
    const sensors = new Set(this.scene.entities.filter((entity) => entity.isSensor).map((entity) => entity.id));
    const parsed = parseRoundCheckpoint(checkpoint, '2d', this.runtimeIdentity, expected, sensors);
    const candidate = makeWorld(this.scene);
    try {
      candidate.restore(base64ToUint8Array(parsed.physicsCheckpointBase64));
      if (candidate.digest().toString() !== parsed.physicsDigest || candidate.info().frame !== BigInt(parsed.tick) ||
          candidate.info().bodyCount !== this.scene.entities.length) throw new Error('Saved physics state does not match.');
      const entities = new Map<string, EntityRecord2D>();
      const poses = new Map<string, { previous: Pose2D; current: Pose2D; snap: boolean }>();
      const collected = new Set(parsed.canonicalEntityState.collectedIds);
      for (const definition of this.scene.entities) {
        const decimal = parsed.bodyIdMap[definition.id]!;
        const bodyId = Number(BigInt(decimal));
        const handle = candidate.resolveBody(bodyId);
        const body = candidate.readBody(handle);
        const pose: Pose2D = { xMeters: body.x, yMeters: body.y, angleRadians: body.angle };
        entities.set(definition.id, { entityId: definition.id, bodyId, handle, isSensor: definition.isSensor, collected: collected.has(definition.id) });
        poses.set(definition.id, { previous: pose, current: pose, snap: true });
      }
      const previous = this.world;
      this.world = candidate; this.entities = entities; this.poses = poses;
      const state = parsed.canonicalEntityState;
      this.score = state.score; this.status = state.status; this.secondsRemaining = state.secondsRemaining;
      this.objective = state.objective; this.isGrounded = state.isGrounded; this.eventSequence = state.eventSequence;
      this.currentTick = parsed.tick; this.epoch = Math.max(this.epoch, parsed.physicsEpoch) + 1;
      previous.dispose();
    } catch (error) { candidate.dispose(); throw error; }
  }

  dispose(): void {
    this.world.dispose();
    this.entities.clear();
    this.poses.clear();
  }
}
