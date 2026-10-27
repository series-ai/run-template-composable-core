import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  base: "./",
  optimizeDeps: {
    exclude: ["@series-inc/rundot-syncplay"],
    esbuildOptions: { target: "es2022" },
  },
  plugins: [
    react(),
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
