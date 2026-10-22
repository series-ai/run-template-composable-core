import { create } from "zustand";

export type CameraMode = "2d-ortho" | "3d-perspective";

export interface GameState {
  score: number;
  highScore: number;
  isPaused: boolean;
  isGameOver: boolean;
  cameraMode: CameraMode;

  // Actions
  addScore: (delta: number) => void;
  setPaused: (paused: boolean) => void;
  setGameOver: (over: boolean) => void;
  setCameraMode: (mode: CameraMode) => void;
  resetGame: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  score: 0,
  highScore: 0,
  isPaused: false,
  isGameOver: false,
  cameraMode: "2d-ortho",

  addScore: (delta: number) =>
    set((state: GameState) => {
      const nextScore = Math.max(0, state.score + delta);
      return {
        score: nextScore,
        highScore: Math.max(state.highScore, nextScore),
      };
    }),

  setPaused: (isPaused: boolean) => set({ isPaused }),
  setGameOver: (isGameOver: boolean) => set({ isGameOver }),
  setCameraMode: (cameraMode: CameraMode) => set({ cameraMode }),
  resetGame: () =>
    set(() => ({
      score: 0,
      isPaused: false,
      isGameOver: false,
    })),
}));
