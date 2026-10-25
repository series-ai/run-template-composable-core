import { parseRoundCheckpoint } from './checkpoint.js';
/**
 * 3D Syncplay physics adapter and reference game rules.
 */

import {
  initPhysics3D,
  createPhysicsWorld3D,
  type PhysicsWorld3D,
  type PhysicsBodyHandle3D,
  type PhysicsBodyId3D,
  meters,
  metersPerSecond,
  metersPerSecondSquared,
  kilograms,
} from '@series-inc/rundot-syncplay/physics/3d';
import type {
  Pose3D,
  PosePair3D,
  PresentationFrame,
  RoundCheckpoint,
  GameStatus,
  InputCheckpointState,
  CanonicalEntityState3D,
} from './types.js';
import type { TickInput } from './input.js';
import { uint8ArrayToBase64, base64ToUint8Array } from './adapter2d.js';
import { CURRENT_CHECKPOINT_VERSION, computeChecksum } from './journal.js';
import { type SceneDefinition3D, ownScene, REFERENCE_SCENE_3D } from './scene.js';


function makeWorld(scene: SceneDefinition3D): PhysicsWorld3D {
  return createPhysicsWorld3D({ tickRate: 60, initialGravity: { x: metersPerSecondSquared(scene.gravity[0]), y: metersPerSecondSquared(scene.gravity[1]), z: metersPerSecondSquared(scene.gravity[2]) },
    capacity: { bodies: 64, joints: 16 } });
}

interface EntityRecord3D {
  readonly entityId: string;
  readonly bodyId: PhysicsBodyId3D;
  handle: PhysicsBodyHandle3D;
  isSensor?: boolean;
  collected?: boolean;
}

export class WorldAdapter3D {
  private world: PhysicsWorld3D;
  private readonly scene: SceneDefinition3D;
  private entities = new Map<string, EntityRecord3D>();
  private poses = new Map<string, { previous: Pose3D; current: Pose3D; snap: boolean }>();

  private currentTick = 0;
  private epoch = 1;
  private isGrounded = false;

  readonly runtimeIdentity: string;
  score = 0;
  status: GameStatus = 'ready';
  secondsRemaining: number | null = 60;
  objective = 'Collect all 5 energy orbs.';
  eventSequence = 0;

  private constructor(world: PhysicsWorld3D, scene: SceneDefinition3D) {
    this.world = world;
    this.scene = scene;
    const info = world.info();
    this.runtimeIdentity = `@series-inc/rundot-syncplay@6.0.0-rc.66:3d:abi=${info.worldAbiVersion}:digestRev=${info.digestAlgorithmRevision}:artifact=${info.artifactHash}:tickRate=${info.tickRate}:dt=${info.fixedDt}:substeps=${info.substeps}:iterations=${info.velocityIterations}:scene=${computeChecksum(JSON.stringify(scene))}:rules=v1:schema=v${CURRENT_CHECKPOINT_VERSION}`;
  }

  static async create(scene: SceneDefinition3D = REFERENCE_SCENE_3D): Promise<WorldAdapter3D> {
    scene = ownScene(scene);
    await initPhysics3D();
    const world = makeWorld(scene);

    const adapter = new WorldAdapter3D(world, scene);
    try { adapter.setupScene(); return adapter; }
    catch (error) { world.dispose(); throw error; }
  }

  private setupScene(): void {
    this.entities.clear();
    this.poses.clear();

    const entitySpecs = this.scene.entities;

    const res = this.world.edit((ops) => {
      const handles: PhysicsBodyHandle3D[] = [];
      for (const spec of entitySpecs) {
        if (spec.shape.type === 'box') {
          const body = ops.createBody({
            shape: {
              type: 'box',
              halfX: meters(spec.shape.halfX),
              halfY: meters(spec.shape.halfY),
              halfZ: meters(spec.shape.halfZ),
            },
            position: {
              x: meters(spec.position[0]),
              y: meters(spec.position[1]),
              z: meters(spec.position[2]),
            },
            kind: spec.kind,
            sensor: spec.isSensor,
            mass: spec.massKg !== undefined ? kilograms(spec.massKg) : undefined,
            friction: spec.friction,
          });
          handles.push(body as unknown as PhysicsBodyHandle3D);
        } else {
          const body = ops.createBody({
            shape: {
              type: 'sphere',
              radius: meters(spec.shape.radius),
            },
            position: {
              x: meters(spec.position[0]),
              y: meters(spec.position[1]),
              z: meters(spec.position[2]),
            },
            kind: spec.kind,
            sensor: spec.isSensor,
            mass: spec.massKg !== undefined ? kilograms(spec.massKg) : undefined,
            friction: spec.friction,
          });
          handles.push(body as unknown as PhysicsBodyHandle3D);
        }
      }
      return handles;
    });

    for (let i = 0; i < entitySpecs.length; i += 1) {
      const spec = entitySpecs[i]!;
      const handle = res.created[i]!;
      const bodyId = handle.id;

      this.entities.set(spec.id, {
        entityId: spec.id,
        bodyId,
        handle,
        isSensor: spec.isSensor,
        collected: false,
      });

      const motion = this.world.readMotion(handle);
      const initialPose: Pose3D = {
        positionMeters: [motion.position.x, motion.position.y, motion.position.z],
        orientation: [
          motion.orientation.x,
          motion.orientation.y,
          motion.orientation.z,
          motion.orientation.w,
        ],
      };

      this.poses.set(spec.id, {
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
    this.objective = 'Collect all 5 energy orbs.';
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
  getScene(): SceneDefinition3D {
    return this.scene;
  }

  /**
   * Checks whether the player stands on ground by inspecting contact normal.
   */
  private checkGrounded(
    playerHandle: PhysicsBodyHandle3D,
    groundId: PhysicsBodyId3D | undefined,
    x: number,
    y: number,
    z: number,
  ): boolean {
    if (groundId === undefined) {
      return false;
    }

    const hits = this.world.raycast({
      x: meters(x),
      y: meters(y),
      z: meters(z),
      dx: 0,
      dy: -1,
      dz: 0,
      maxDistance: meters(0.65),
      excludeBody: playerHandle,
    });

    for (const hit of hits) {
      if (hit.bodyId === groundId && hit.normal.y > 0.7) {
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

    const motion = this.world.readMotion(playerRecord.handle);
    const groundId = this.entities.get('ground')?.bodyId;
    this.isGrounded = this.checkGrounded(
      playerRecord.handle,
      groundId,
      motion.position.x,
      motion.position.y,
      motion.position.z,
    );

    // Observe collisions from Syncplay
    const latestOutputs = this.world.latest();
    for (const contact of latestOutputs.contacts) {
      const involvesPlayer =
        contact.bodyA === playerRecord.bodyId || contact.bodyB === playerRecord.bodyId;
      if (!involvesPlayer) {
        continue;
      }

      const otherBodyId =
        contact.bodyA === playerRecord.bodyId ? contact.bodyB : contact.bodyA;

      // Collectible orb contacts
      if (contact.type === 'enter') {
        for (let i = 0; i < 5; i += 1) {
          const orbRecord = this.entities.get(`orb_${i}`);
          if (orbRecord && orbRecord.bodyId === otherBodyId && !orbRecord.collected) {
            orbRecord.collected = true;
            this.score += 100;
            this.eventSequence += 1;

            this.world.setBodyTransform(orbRecord.handle, {
              position: { x: meters(-999), y: meters(-999), z: meters(-999) },
              orientation: { x: 0, y: 0, z: 0, w: 1 },
            });
          }
        }
      }
    }

    // Check victory condition
    let allCollected = true;
    for (let i = 0; i < 5; i += 1) {
      if (!this.entities.get(`orb_${i}`)?.collected) {
        allCollected = false;
        break;
      }
    }

    if (allCollected && this.status === 'running') {
      this.status = 'results';
      this.objective = 'Mission Complete! All energy orbs recovered.';
    }

    // Apply player velocity in 3D
    if (this.status === 'running') {
      let moveX = 0;
      let moveZ = 0;

      if (input.isHeld('left')) {
        moveX -= 1;
      }
      if (input.isHeld('right')) {
        moveX += 1;
      }
      if (input.isHeld('up')) {
        moveZ -= 1;
      }
      if (input.isHeld('down')) {
        moveZ += 1;
      }

      const length = Math.hypot(moveX, moveZ);
      const speed = input.isHeld('action') ? 8.0 : 5.0;

      let vx = 0;
      let vz = 0;
      if (length > 0) {
        vx = (moveX / length) * speed;
        vz = (moveZ / length) * speed;
      }

      let vy = motion.linearVelocity.y;
      if (input.wasPressed('jump') && this.isGrounded) {
        vy = metersPerSecond(6.5);
        this.isGrounded = false;
      }

      this.world.setBodyLinearVelocity(playerRecord.handle, {
        x: metersPerSecond(vx),
        y: metersPerSecond(vy),
        z: metersPerSecond(vz),
      });
    }

    // Step Syncplay world
    this.world.step();
    this.currentTick += 1;

    // Update entity poses
    for (const [entityId, record] of this.entities.entries()) {
      const nextMotion = this.world.readMotion(record.handle);
      const poseState = this.poses.get(entityId);
      if (!poseState) {
        continue;
      }

      const nextPose: Pose3D = {
        positionMeters: [
          nextMotion.position.x,
          nextMotion.position.y,
          nextMotion.position.z,
        ],
        orientation: [
          nextMotion.orientation.x,
          nextMotion.orientation.y,
          nextMotion.orientation.z,
          nextMotion.orientation.w,
        ],
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
    const posePairs: PosePair3D[] = [];

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
      dimension: '3d',
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
      if (this.entities.get(`orb_${i}`)?.collected) {
        collectedIds.push(`orb_${i}`);
      }
    }

    const canonical: CanonicalEntityState3D = {
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
      dimension: '3d',
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
   * Restores checkpoint and re-resolves fresh handles without Number() on BigInt.
   * Disposes and recreates world on native restore failure.
   */
  restoreCheckpoint(checkpoint: RoundCheckpoint): void {
    const expected = new Map([...this.entities].map(([id, record]) => [id, record.bodyId.toString()]));
    const sensors = new Set(this.scene.entities.filter((entity) => entity.isSensor).map((entity) => entity.id));
    const parsed = parseRoundCheckpoint(checkpoint, '3d', this.runtimeIdentity, expected, sensors);
    const candidate = makeWorld(this.scene);
    try {
      candidate.restore(base64ToUint8Array(parsed.physicsCheckpointBase64));
      if (candidate.digest().toString() !== parsed.physicsDigest || candidate.info().frame !== BigInt(parsed.tick) ||
          candidate.info().bodyCount !== this.scene.entities.length) throw new Error('Saved physics state does not match.');
      const entities = new Map<string, EntityRecord3D>();
      const poses = new Map<string, { previous: Pose3D; current: Pose3D; snap: boolean }>();
      const collected = new Set(parsed.canonicalEntityState.collectedIds);
      for (const definition of this.scene.entities) {
        const decimal = parsed.bodyIdMap[definition.id]!;
        const bodyId = BigInt(decimal) as PhysicsBodyId3D;
        const handle = candidate.resolveBody(bodyId);
        const body = candidate.readBody(handle);
        const pose: Pose3D = { positionMeters: [body.position.x, body.position.y, body.position.z], orientation: [body.orientation.x, body.orientation.y, body.orientation.z, body.orientation.w] };
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
