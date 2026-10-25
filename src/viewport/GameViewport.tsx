import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import SpriteBatchView from '../modules/two-d/scene/SpriteBatchView';
import type { PresentationClock } from '../modules/two-d/scene/types';
import type { PresentationFrame } from '../modules/runtime/game-application/types';
import type { StarterApplication } from '../core/StarterApplication';
import type { SpriteScene } from '../modules/two-d/scene/SpriteScene';
import { REFERENCE_SCENE_2D, REFERENCE_SCENE_3D } from '../modules/runtime/game-application/scene';
import { ParticleSprites } from '../modules/two-d/scene/ParticleSprites';
import ParticleView from '../modules/two-d/scene/ParticleView';

const definitions2d = new Map(REFERENCE_SCENE_2D.entities.map((entity) => [entity.id, entity]));
const definitions3d = new Map(REFERENCE_SCENE_3D.entities.map((entity) => [entity.id, entity]));

function CameraRig({ dimension }: { dimension: '2d' | '3d' }) {
  const { camera, size } = useThree();
  useEffect(() => {
    if (camera instanceof THREE.OrthographicCamera) {
      Object.assign(camera, { manual: true });
      const aspect = size.width / Math.max(1, size.height); const worldHeight = 11;
      camera.left = -worldHeight * aspect / 2; camera.right = worldHeight * aspect / 2;
      camera.top = worldHeight / 2; camera.bottom = -worldHeight / 2;
      camera.position.set(1, 3.5, 20); camera.updateProjectionMatrix();
    } else { camera.position.set(11, 13, 16); camera.lookAt(0, 0, 0); }
  }, [camera, size, dimension]);
  return null;
}

function FrameBridge({ application, scene, clock, meshes, particles }: {
  application: StarterApplication; scene?: SpriteScene; clock: PresentationClock; meshes?: Map<string, THREE.Mesh>; particles?: { current: ParticleSprites | null };
}) {
  const { gl, camera } = useThree(); const quaternion = useMemo(() => new THREE.Quaternion(), []);
  const position = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    const loss = (event: Event): void => { event.preventDefault(); application.game?.setSuspended('context-lost', true); };
    const restore = (): void => { application.game?.setSuspended('context-lost', false); };
    gl.domElement.addEventListener('webglcontextlost', loss); gl.domElement.addEventListener('webglcontextrestored', restore);
    return () => { gl.domElement.removeEventListener('webglcontextlost', loss); gl.domElement.removeEventListener('webglcontextrestored', restore); };
  }, [application, gl]);
  useFrame((_, delta) => {
    const game = application.game; if (!game) return;
    application.pollInput(); game.pump(delta); const frame = game.getPresentation();
    clock.epoch = frame.epoch; clock.activeSeconds = (frame.currentTick + frame.alpha) / 60;
    clock.deltaSeconds = game.getView().isSuspended ? 0 : delta; clock.suspended = game.getView().isSuspended;
    if (particles?.current) particles.current.update(clock); else application.effects.update(clock);
    if (frame.dimension === '2d' && scene) {
      const player = frame.poses.find((pair) => pair.entityId === 'player');
      if (player && camera instanceof THREE.OrthographicCamera) {
        const halfWidth = (camera.right - camera.left) / 2;
        const target = THREE.MathUtils.clamp(player.current.xMeters + 1, -12 + halfWidth, 16 - halfWidth);
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, target, player.snap ? 1 : 1 - Math.exp(-8 * delta));
      }
      for (const pair of frame.poses) {
        const t = pair.snap ? 1 : frame.alpha;
        let angle = pair.current.angleRadians - pair.previous.angleRadians;
        angle = Math.atan2(Math.sin(angle), Math.cos(angle));
        scene.updateNode(pair.entityId, { visible: pair.visible, x: THREE.MathUtils.lerp(pair.previous.xMeters, pair.current.xMeters, t),
          y: THREE.MathUtils.lerp(pair.previous.yMeters, pair.current.yMeters, t), rotation: pair.previous.angleRadians + angle * t });
      }
    } else if (frame.dimension === '3d' && meshes) {
      for (const pair of frame.poses) {
        const mesh = meshes.get(pair.entityId); if (!mesh) continue;
        mesh.visible = pair.visible;
        const t = pair.snap ? 1 : frame.alpha;
        mesh.position.set(...pair.previous.positionMeters).lerp(position.set(...pair.current.positionMeters), t);
        mesh.quaternion.set(...pair.previous.orientation); quaternion.set(...pair.current.orientation); mesh.quaternion.slerp(quaternion, t);
      }
    }
  }, -100);
  return null;
}

function FlatWorld({ application }: { application: StarterApplication }) {
  const art = application.art;
  const clock = useMemo<PresentationClock>(() => ({ epoch: 1, activeSeconds: 0, deltaSeconds: 0, suspended: true }), []);
  const scene = useMemo(() => {
    const next = art.createScene(); const frame = application.game!.getPresentation();
    for (const pair of frame.poses) {
      const definition = definitions2d.get(pair.entityId);
      if (!definition) throw new Error(`Missing view definition: ${pair.entityId}`);
      const [width, height] = definition.render.size;
      const role = definition.render.atlasRole;
      next.registerSprite(pair.entityId, { profileId: 'flat-2d', atlasId: 'garden',
        frameId: role === 'player' ? 'player' : role === 'star' ? 'star' : role === 'obstacle' ? 'box' : 'grass',
        scaleX: width / 1.28, scaleY: height / 1.28, layerRank: definition.render.layerRank });
    }
    return next;
  }, [application, art]);
  const particles = useRef<ParticleSprites | null>(null);
  useEffect(() => {
    const binding = new ParticleSprites(scene, application.effects, { id: 'reward', atlasId: 'garden', frameId: 'star', layerRank: 4 });
    particles.current = binding;
    return () => { binding.dispose(); particles.current = null; };
  }, [application, scene]);
  return <>
    <FrameBridge application={application} scene={scene} clock={clock} particles={particles} />
    <SpriteBatchView scene={scene} clock={clock} textures={art.textures} />
  </>;
}

function SpatialWorld({ application }: { application: StarterApplication }) {
  const meshes = useRef(new Map<string, THREE.Mesh>());
  const initial = useMemo<PresentationFrame>(() => application.game!.getPresentation(), [application]);
  const clock = useMemo<PresentationClock>(() => ({ epoch: 1, activeSeconds: 0, deltaSeconds: 0, suspended: true }), []);
  return <>
    <FrameBridge application={application} meshes={meshes.current} clock={clock} />
    <ParticleView emitter={application.effects} renderOrder={1000} />
    <hemisphereLight args={['#b8dfe7', '#37685b', 2.2]} />
    <directionalLight position={[5, 12, 6]} intensity={2.5} />
    {initial.poses.map((pair) => {
      const id = pair.entityId; const definition = definitions3d.get(id);
      if (!definition) throw new Error(`Missing view definition: ${id}`);
      const orb = definition.render.role === 'orb';
      const size = [...definition.render.size] as [number, number, number];
      return <mesh key={id} ref={(mesh) => { if (mesh) meshes.current.set(id, mesh); else meshes.current.delete(id); }}>
        {definition.render.shape === 'sphere' ? <sphereGeometry args={[size[0] / 2, 24, 16]} /> : <boxGeometry args={size} />}
        <meshStandardMaterial color={definition.render.color}
          roughness={0.6} metalness={0.08} emissive={orb ? '#956019' : '#000000'} emissiveIntensity={orb ? 0.5 : 0} />
      </mesh>;
    })}
    <gridHelper args={[40, 40, '#80af93', '#527f69']} position={[0, 0.01, 0]} />
  </>;
}

export default function GameViewport({ application }: { application: StarterApplication }) {
  const dimension = application.game!.getView().dimension; const flat = dimension === '2d';
  return <Canvas orthographic={flat} dpr={[1, 2]} flat={flat} linear={false}
    onCreated={({ gl }) => { gl.domElement.tabIndex = 0; }}
    camera={{ near: 0.1, far: 150, position: flat ? [0, 3.5, 20] : [11, 13, 16], fov: 48 }}
    gl={{ antialias: true, alpha: false, powerPreference: 'high-performance',
      toneMapping: flat ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace }}>
    <color attach="background" args={[flat ? '#669eae' : '#b6d7d8']} />
    <CameraRig dimension={dimension} />
    {flat ? <FlatWorld application={application} /> : <SpatialWorld application={application} />}
  </Canvas>;
}
