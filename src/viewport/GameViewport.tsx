import React, { useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import { useGameStore, CameraMode, GameState } from "../core/gameState";
import { gameBus } from "../core/eventBus";

interface CameraRigProps {
  mode: CameraMode;
}

function CameraRig({ mode }: CameraRigProps) {
  const { size } = useThree();
  const aspect = size.width / (size.height || 1);

  // Notify event bus on viewport resize
  useEffect(() => {
    gameBus.emit("viewport:resize", {
      width: size.width,
      height: size.height,
      aspect,
    });
  }, [size.width, size.height, aspect]);

  if (mode === "2d-ortho") {
    // 2D Orthographic rig: centered, 10 units high, aspect-ratio corrected width
    const frustumHeight = 10;
    const frustumWidth = frustumHeight * aspect;

    return (
      <OrthographicCamera
        makeDefault
        position={[0, 0, 10]}
        left={-frustumWidth / 2}
        right={frustumWidth / 2}
        top={frustumHeight / 2}
        bottom={-frustumHeight / 2}
        near={0.1}
        far={100}
      />
    );
  }

  // 3D Perspective rig
  return (
    <PerspectiveCamera
      makeDefault
      fov={60}
      position={[0, 5, 10]}
      onUpdate={(camera) => camera.lookAt(0, 0, 0)}
      near={0.1}
      far={1000}
    />
  );
}

function ContextLossHandler() {
  const { gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;

    const handleLoss = (event: Event) => {
      event.preventDefault();
      console.warn("[GameViewport] WebGL Context Lost! Waiting for restoration...");
    };

    const handleRestore = () => {
      console.info("[GameViewport] WebGL Context Restored!");
      gameBus.emit("webgl:contextrestored", undefined);
    };

    canvas.addEventListener("webglcontextlost", handleLoss, false);
    canvas.addEventListener("webglcontextrestored", handleRestore, false);

    return () => {
      canvas.removeEventListener("webglcontextlost", handleLoss);
      canvas.removeEventListener("webglcontextrestored", handleRestore);
    };
  }, [gl]);

  return null;
}

export interface GameViewportProps {
  children?: React.ReactNode;
}

export function GameViewport({ children }: GameViewportProps) {
  const cameraMode = useGameStore((s: GameState) => s.cameraMode);

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-slate-950">
      <Canvas
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          preserveDrawingBuffer: false,
        }}
        dpr={[1, 2]} // clamp device pixel ratio for mobile performance
        flat={cameraMode === "2d-ortho"} // disable tone mapping for 2D crispness
      >
        <CameraRig mode={cameraMode} />
        <ContextLossHandler />
        {children}
      </Canvas>
    </div>
  );
}
