import { defineConfig } from "vite";

export default defineConfig({
  // The existing deployment configuration uses PUBLIC_API_BASE_URL. Keep that
  // contract while allowing the conventional VITE_* variables as well.
  envPrefix: ["VITE_", "PUBLIC_"],
});
