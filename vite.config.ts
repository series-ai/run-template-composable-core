import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { rundotMultiplayerPlugin } from "@series-inc/rundot-game-sdk/vite";
import { DevSyncplayAuthorityRoom } from "@series-inc/rundot-syncplay/node";

export default defineConfig({
  base: "./",
  optimizeDeps: {
    exclude: ["@series-inc/rundot-syncplay"],
    esbuildOptions: { target: "es2022" },
  },
  plugins: [
    react(),
    // Copies the deterministic room config into the build; on `npm run dev` it also runs a local room authority.
    rundotMultiplayerPlugin({ configPath: "rundot/rooms.config.json", deterministicRoomClass: DevSyncplayAuthorityRoom }),
  ],
  resolve: {
    alias: {
      "@modules": path.resolve(__dirname, "./src/modules"),
      "@core": path.resolve(__dirname, "./src/core"),
      "@viewport": path.resolve(__dirname, "./src/viewport"),
    },
    dedupe: ["react", "react-dom", "three", "@react-three/fiber"],
  },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          r3f: ["@react-three/fiber"],
          vendor: ["react", "react-dom"],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 3000,
    host: true,
  },
});
