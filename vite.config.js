import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repository = process.env.GITHUB_REPOSITORY?.split("/")[1];

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || (process.env.GITHUB_ACTIONS && repository ? `/${repository}/` : "/"),
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: true },
  envPrefix: ["VITE_", "TAURI_"],
  build: { outDir: process.env.VITE_OUT_DIR || "dist", target: ["es2020", "safari14"] },
});
