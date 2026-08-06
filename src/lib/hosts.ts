/**
 * Where this app talks to, resolved at runtime.
 *
 * `cloudsforgeHosts()` reads `window.location.hostname` on every call, so one image serves
 * localhost, a preview deployment and production. Nothing here reads a build-time constant; see
 * the note in vite.config.ts and `test/no-build-time-config.test.ts`.
 *
 * ── The dev port disagreement, reported rather than papered over ───────────────────────────────
 *
 * The surface registry gives `trade` **devPort 4006** (`ui/packages/ui/src/surfaces.ts`, in
 * the block at `surfaces.ts`). The `trade` service binds **4000**: `trade/src/env.ts`
 * defaults `PORT` to 4000 and `trade/.env.example:44` sets it to 4000. Under `pnpm dev` the
 * registry value is the one this bundle calls, so a trade started from its own example
 * environment is not where this app looks.
 *
 * This is the same shape as `admin` (registry 3002, `admin-api` binds 4014), `emberkin` (registry
 * 3014, service binds 4100) and `create` (registry 4004, `mint` binds 4000) — the fifth instance
 * of a devPort that was an allocation pretending to be a fact. It is NOT fixed with a literal
 * port here: a hard-coded host is a second, unversioned copy of the registry, and the copy is the
 * one that goes stale. `surfaces.test.ts` in micro-ui pins only the services whose port is
 * distinctive, and trade's 4000 is the service-template default that half the estate shares — so
 * the registry cannot give every one of them its bound port and the entry really is an
 * allocation. What is missing is anything that MAKES it true, so the README says
 * `PORT=4006 pnpm dev`, in one line, next to the citation. Reported to micro-ui.
 *
 * None of this is visible in production: the bundle and trade share `trade.<apex>` there, so
 * `apiBase()` is `''` and every request is relative.
 */
import { cloudsforgeHosts, type CloudsForgeHosts, type SurfaceKey } from '@cloudsforge/ui'

/**
 * The surface this application IS.
 *
 * It selects the switcher entry marked current, and it names this app's own API host.
 * `ui/packages/ui/src/surfaces.ts` registers `trade` as a product with `inSwitcher: true`,
 * accent `#2a9e93`, glyph `◐` and subdomain `trade`.
 */
export const PRODUCT: SurfaceKey = 'trade'

/** The name reported to the observability ingest and shown in error copy. */
export const APP_NAME = 'trade-web'

/**
 * The base URL for this app's OWN API, which is `trade`.
 *
 * In production the SPA and `micro-trade` are the same origin — nginx serves the bundle, the
 * service serves `/v1` behind `trade.<apex>` — so the base is the empty string and requests stay
 * relative. Under `pnpm dev` the page is on Vite's port while the service is on the registry's dev
 * port, so the base is absolute and the request goes cross-origin.
 *
 * The difference is derived by COMPARING ORIGINS rather than by a `DEV` flag, because a flag is a
 * build-time constant and this repository has none: an image built for production and opened on
 * localhost would then point at a host that is not there.
 */
export function resolveApiBase(pageOrigin: string, hosts: CloudsForgeHosts, key: SurfaceKey): string {
  const own = hosts[key]
  // With no page origin there is nothing for a relative URL to resolve against, so the absolute
  // form is the only correct answer.
  if (!pageOrigin) return own
  // A surface may carry a basePath (the wallet is a path inside Hub), so compare ORIGINS rather
  // than whole URLs — otherwise every such surface would look cross-origin to itself.
  return new URL(own).origin === pageOrigin ? '' : own
}

/** The same four names `cloudsforgeHosts()` treats as development. Kept in step by test. */
export function isLocal(hostname: string): boolean {
  return (
    hostname === '' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.local')
  )
}

/**
 * Whether this bundle is being served from an address the surface registry knows.
 *
 * `cloudsforgeHosts()` derives the apex by stripping a KNOWN subdomain prefix. Served from an
 * unknown name, the whole name becomes the apex, and every CloudsForge URL derived from it —
 * `trade`, the account portal, Lantern — resolves one level too deep. The app still renders,
 * because unlike the operator console this one has a public catalogue worth showing and nothing
 * here is a security boundary; but it says so, once, in the shell.
 */
export function isRegisteredPlacement(pageOrigin: string, hostname: string, hosts: CloudsForgeHosts): boolean {
  if (isLocal(hostname)) return true
  if (!pageOrigin) return true
  try {
    return new URL(hosts[PRODUCT]).origin === pageOrigin
  } catch {
    return false
  }
}

/** Every CloudsForge base URL, for the current environment. */
export function hosts(): CloudsForgeHosts {
  return cloudsforgeHosts()
}

/** This app's API base, resolved now. Call it per request; never cache it in a module constant. */
export function apiBase(): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return resolveApiBase(origin, cloudsforgeHosts(), PRODUCT)
}

/** The page origin, or a stable placeholder when there is no document (tests, prerender). */
export function pageOrigin(): string {
  return typeof window === 'undefined' ? 'http://localhost' : window.location.origin
}

/** Whether the current address is one the registry knows. Read by the shell. */
export function placementIsKnown(): boolean {
  if (typeof window === 'undefined') return true
  return isRegisteredPlacement(window.location.origin, window.location.hostname, cloudsforgeHosts())
}
