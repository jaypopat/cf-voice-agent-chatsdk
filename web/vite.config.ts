import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The web app lives in web/ and builds to web/dist, which the Worker serves
// as static assets (see wrangler.jsonc `assets.directory`).
export default defineConfig({
  root: import.meta.dirname,
  base: "/",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
