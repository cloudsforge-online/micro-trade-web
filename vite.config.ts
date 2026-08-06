import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * There is deliberately no `define`, no `envPrefix` and no `.env` file in this repository.
 *
 * A build-time constant is an environment baked into an image, and an image with an environment
 * baked into it has to be rebuilt to be promoted — which means the artefact that reaches
 * production is not the artefact that passed CI. Every host this app talks to is resolved at
 * RUNTIME from `window.location.hostname` by `cloudsforgeHosts()`, so one image serves localhost,
 * staging, a preview deployment and production. `test/no-build-time-config.test.ts` fails the
 * build if `import.meta.env.VITE_` ever reappears, and the `rules` job in CI greps for it again
 * so deleting the test does not delete the rule.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    // @cloudsforge/ui is a `link:` dependency, so its own node_modules holds a second copy of
    // React. Two copies means two dispatchers, and the shared bar would throw on its first
    // useState.
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // The linked package now ships BUILT output — its entry points name a committed `dist` — so
    // the old reason for this line ("shipped as TypeScript source until it is published") is no
    // longer why it is here. The setting is still right, for the reason that outlives it: `link:`
    // resolves to a working tree edited beside this one, and pre-bundling copies it into
    // node_modules/.vite, where it stays until the dep hash changes. A rebuild in micro-ui does
    // not change this repository's lockfile, so `pnpm dev` would keep serving yesterday's `dist`.
    exclude: ['@cloudsforge/ui'],
  },
  build: {
    // Named chunks and a real manifest of hashes: the assets are immutable-cached by nginx, and
    // that is only safe when every rebuild produces a new filename.
    sourcemap: true,
  },
  // ════════════════════════════════════════════════════════════════════════════════════════════
  // 5186 IS A VITE PORT, NOT THE REGISTRY'S `trade` ENTRY, AND THE DIFFERENCE MATTERS HERE.
  //
  // The registry's devPort names where the API answers, not where this bundle is served from —
  // the same distinction admin-web had to draw when its entry said 3002 and admin-api bound 4014,
  // and mint-web after it.
  //
  // `trade` says devPort **4006** (`ui/packages/ui/src/surfaces.ts`). The `trade` service
  // binds **4000**: `trade/src/env.ts` defaults `PORT` to 4000 and `trade/.env.example:44`
  // sets it to 4000. So under `pnpm dev` this app resolves `http://localhost:4006` and trade, run
  // with its own example environment, is not there. That is NOT papered over with a literal port
  // here — a hard-coded host is a second, unversioned copy of the registry and the copy is the
  // one that goes stale. Run trade with `PORT=4006`; the README says so in one line, and the
  // finding is reported to micro-ui, whose file the registry is.
  //
  // It is invisible in production, where this bundle and trade share `trade.<apex>` and every
  // request is relative. See src/lib/hosts.ts.
  // ════════════════════════════════════════════════════════════════════════════════════════════
  server: { port: 5186 },
  preview: { port: 5186 },
})
