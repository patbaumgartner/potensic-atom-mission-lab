import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// sql.js ships a UMD browser build; let esbuild pre-bundle it so the default
// import gets proper CJS interop. The wasm asset is resolved separately via a
// `?url` import and passed through locateFile, so no exclude is needed.
export default defineConfig({
  // On GitHub Pages the app is served from a repo subpath; the deploy workflow
  // sets VITE_BASE. Local dev/build stay at the root.
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  test: {
    globals: true,
    // Hook tests that use renderHook need jsdom; they declare it per-file via
    // @vitest-environment jsdom. All other tests run in node.
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // UI-integration files are validated by browser E2E, not unit tests:
      // the React shell, the Leaflet map view, the app entry point, and the
      // browser wasm loader all require a live DOM/map and are excluded here.
      exclude: [
        "src/App.tsx",
        "src/main.tsx",
        "src/components/icons.tsx",
        "src/components/StatCard.tsx",
        "src/features/mission/Sidebar.tsx",
        "src/features/mission/MapToolbar.tsx",
        "src/features/mission/MapView.tsx",
        "src/features/mission/paramFields.tsx",
        "src/features/mission/paramList.tsx",
        "src/features/mission/panels/**",
        "src/features/mission/useMissionLibrary.ts",
        "src/features/potensic/sqlLoader.ts",
        // These hooks need a live browser / navigator API and are validated via E2E:
        "src/hooks/useMissionImport.ts",
        "src/hooks/useLocationSearch.ts",
      ],
      thresholds: {
        statements: 100,
        functions: 100,
        lines: 100,
        branches: 100,
      },
    },
  },
});
