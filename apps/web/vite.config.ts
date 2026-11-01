import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // 개발 중에는 API와 공개 미디어를 wrangler dev(apps/edge)로 보낸다
  server: { proxy: { "/api": "http://localhost:8787", "/media": "http://localhost:8787" } },
});

