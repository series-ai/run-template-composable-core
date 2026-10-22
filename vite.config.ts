import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: {
      "@modules": path.resolve(__dirname, "./src/modules"),
      "@core": path.resolve(__dirname, "./src/core"),
      "@viewport": path.resolve(__dirname, "./src/viewport"),
    },
    dedupe: ["react", "react-dom", "three", "@react-three/fiber", "zustand"],
  },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          r3f: ["@react-three/fiber", "@react-three/drei"],
          vendor: ["react", "react-dom", "zustand"],
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
