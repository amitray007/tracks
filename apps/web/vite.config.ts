import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiOrigin = process.env.TRACKS_API_ORIGIN
  ?? (process.env.PORTLESS_URL ? "https://api.tracks.localhost" : "http://127.0.0.1:4318");

export default defineConfig({
  plugins: [react()],
  server: {
    host: process.env.HOST ?? "127.0.0.1",
    proxy: {
      "/api": {
        target: apiOrigin,
        changeOrigin: true,
      },
    },
  },
});
