import { useRef, useEffect } from "react";
import { GameViewport } from "./viewport/GameViewport";
import { useGameStore, GameState } from "./core/gameState";
import { gameBus } from "./core/eventBus";
import { globalFixedLoop } from "./core/frameLoop";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

function DemoScene() {
  const meshRef = useRef<THREE.Mesh>(null);
  const cameraMode = useGameStore((s: GameState) => s.cameraMode);

  // Rotate demo entity in the canvas frame loop (zero React re-renders)
  useFrame((_, delta) => {
    if (meshRef.current) {
      if (cameraMode === "3d-perspective") {
        meshRef.current.rotation.x += delta * 0.5;
        meshRef.current.rotation.y += delta * 0.8;
      } else {
        meshRef.current.rotation.z += delta * 0.5;
      }
    }
  });

  return (
    <>
      <ambientLight intensity={cameraMode === "3d-perspective" ? 0.7 : 1.0} />
      {cameraMode === "3d-perspective" && (
        <directionalLight position={[5, 8, 5]} intensity={1.2} />
      )}

      {/* Primary entity */}
      <mesh ref={meshRef} position={[0, 0, 0]}>
        {cameraMode === "2d-ortho" ? (
          <>
            <planeGeometry args={[2.5, 2.5]} />
            <meshBasicMaterial color="#3b82f6" />
          </>
        ) : (
          <>
            <boxGeometry args={[2, 2, 2]} />
            <meshStandardMaterial color="#6366f1" roughness={0.3} metalness={0.2} />
          </>
        )}
      </mesh>
    </>
  );
}

function HudOverlay() {
  const score = useGameStore((s: GameState) => s.score);
  const highScore = useGameStore((s: GameState) => s.highScore);
  const cameraMode = useGameStore((s: GameState) => s.cameraMode);
  const setCameraMode = useGameStore((s: GameState) => s.setCameraMode);
  const addScore = useGameStore((s: GameState) => s.addScore);

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 z-10">
      {/* Top Bar */}
      <div className="flex justify-between items-center bg-slate-900/80 backdrop-blur-md px-4 py-2.5 rounded-xl border border-slate-700/60 shadow-lg pointer-events-auto">
        <div className="flex items-center space-x-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Score</span>
          <span className="text-xl font-black text-amber-400 font-mono">{score}</span>
          <span className="text-xs text-slate-500 font-mono">(Best: {highScore})</span>
        </div>

        {/* Camera Toggle */}
        <div className="flex items-center space-x-2">
          <span className="text-xs text-slate-400 font-medium">Camera:</span>
          <button
            onClick={() => setCameraMode(cameraMode === "2d-ortho" ? "3d-perspective" : "2d-ortho")}
            className="px-2.5 py-1 text-xs font-semibold rounded bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white transition-all cursor-pointer"
          >
            {cameraMode === "2d-ortho" ? "2D Ortho" : "3D Perspective"}
          </button>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="flex justify-center space-x-3 pointer-events-auto pb-2">
        <button
          onClick={() => {
            addScore(10);
            gameBus.emit("game:score", { score: score + 10, delta: 10 });
          }}
          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-semibold rounded-lg shadow-md transition-all cursor-pointer"
        >
          +10 Points
        </button>
      </div>
    </div>
  );
}

export function App() {
  useEffect(() => {
    globalFixedLoop.start();
    gameBus.emit("game:start", { timestamp: Date.now() });

    return () => {
      globalFixedLoop.stop();
    };
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <HudOverlay />
      <GameViewport>
        <DemoScene />
      </GameViewport>
    </div>
  );
}

export default App;
