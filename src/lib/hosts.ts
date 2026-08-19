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
import { apiBaseFor, cloudsforgeHosts, type CloudsForgeHosts, type SurfaceKey } from '@cloudsforge/ui'
import { viewedHosts } from './viewed.ts'

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
 * ── IT IS `@cloudsforge/ui`'s NOW, AND THIS REPOSITORY HELD ONE OF SIXTEEN COPIES ───────────────
 *
 * The body used to live here, and in fifteen other frontends, eleven of them byte-identical. It
 * is a derivation from the registry, and the estate has been bitten three times by a second copy
 * of a registry derivation.
 *
 * The behaviour is unchanged in the case this surface was in and changes in exactly one way for
 * the case it has moved to. Same origin used to answer `''`, so requests stayed RELATIVE —
 * correct while `micro-trade` and this bundle shared `trade.<apex>`, and wrong now the bundle is
 * `<apex>/trade`: a relative `/v1/strategies` then resolves at the APEX ROOT, which is
 * micro-site's, and micro-site answers its SPA shell. 200, HTML body where JSON was expected,
 * every panel on the page in a failure state with a perfectly healthy network tab.
 *
 * `apiBaseFor` answers the surface's own MOUNT instead. See its comment in `@cloudsforge/ui` for
 * the argument and the tests, including a property test over the whole registry.
 *
 * Re-exported rather than deleted because the tests and `lib/api.ts` both name it, and a rename
 * across those for no behavioural reason is churn a reviewer has to read past.
 */
export const resolveApiBase = apiBaseFor

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

/**
 * This app's API base, resolved now. Call it per request; never cache it in a module constant.
 *
 * `viewedHosts()` rather than `cloudsforgeHosts()` is the whole of the in-place network view at
 * this layer (micro-org#459). It returns the map it was given, unchanged, until the reader picks
 * the other network in the bar, and the sibling estate's origins after that — so this line is a
 * no-op in development, in a preview deployment and for every reader who never touches the
 * switcher. The `-testnet` WEB hostnames are retired and 302 to their mainnet siblings, but `/v1`
 * on them is not: that path still answers from the testnet services, which is what makes reading
 * the other network from this page possible at all. See `lib/viewed.ts`.
 */
export function apiBase(): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return resolveApiBase(origin, viewedHosts(), PRODUCT)
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
