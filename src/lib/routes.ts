/**
 * The route table, as data, in one place.
 *
 * Three files describe this app's addresses and all three have to agree:
 *
 *   1. `src/lib/routes.ts` — this file, from which the sub-navigation is derived,
 *   2. `src/app.tsx`       — which component renders at each path,
 *   3. `nginx.conf`        — which addresses are served the app shell at all.
 *
 * The third is the one that bites, and it bites late. nginx enumerates the real routes and 404s
 * everything else ON PURPOSE, so that a wrong address answers 404 rather than 200 — an app that
 * answers 200 for every address serves its "page not found" screen as a success, which crawlers
 * index and monitors call healthy, and a deploy that drops a route looks exactly like a deploy
 * that did not.
 *
 * The price of that honesty is this list, in triplicate, so `test/routes.test.ts` reads
 * `nginx.conf` and `app.tsx` and fails the build when either has drifted. "Remember to update
 * nginx.conf" is not a mechanism; a test is.
 *
 * This module deliberately imports nothing — not React, not the router — so the test that reads it
 * does not have to boot a browser to find out what the routes are.
 */

export interface AppRoute {
  /** The top-level path segment, without a leading slash. `''` is the index route. */
  readonly path: string
  /** The sub-navigation label, or null for a route that is reachable but not offered. */
  readonly label: string | null
  /** True when the route owns everything beneath it (`/backtests/<uuid>`). */
  readonly wildcard: boolean
  /**
   * True when the route renders without a session.
   *
   * Exactly one does, and it is read off the SERVICE rather than chosen: `GET /v1/strategies`
   * (`trade/src/server.ts`) makes no `authenticate()` call at all, and the comment above it
   * says why — "it is a product surface, the thing a prospective user reads before signing up, and
   * gating it behind a token would make the marketing page unable to render it". Putting it behind
   * the session gate would be this app demanding a token the service never wanted.
   */
  readonly public: boolean
}

export const ROUTES: readonly AppRoute[] = [
  // The strategy catalogue is the index because it is the only screen that answers "what can this
  // actually do, and what does each rule get wrong" — and it answers it to somebody who has not
  // signed in, which is who arrives at a product's front page. `GET /v1/strategies` is public.
  { path: '', label: 'Strategies', wildcard: false, public: true },
  // ── The exchange ────────────────────────────────────────────────────────────────────────────
  //
  // These three are the trading surface, and all three are gated even though two of them show
  // information that is not private: `GET /v1/exchange/markets`, `/depth`, `/ticker` and `/trades`
  // all run through `reader()` in `trade/src/server.ts`, which authenticates before it does
  // anything else. Rendering them without a session would be this app offering an address that can
  // only answer 401 — the same mistake in the opposite direction from gating `/v1/strategies`.
  //
  // Wildcard: `/markets/<symbol>` is the trading terminal, and it is the address a customer
  // bookmarks. A symbol carries a slash in no market this service defines (`BASE-QUOTE`), so one
  // segment beneath is all it ever needs — but the segment is dynamic, so nginx must serve
  // everything under it.
  { path: 'markets', label: 'Markets', wildcard: true, public: false },
  // Wildcard: `/orders/<uuid>` is one order with its event timeline and its own fills.
  { path: 'orders', label: 'Orders', wildcard: true, public: false },
  // No wildcard: custody is one page. There is nothing beneath it to address — a transfer has no
  // detail screen because the ledger's own row is the whole of it, and it is rendered in place.
  { path: 'balances', label: 'Balances', wildcard: false, public: false },
  // ── Research and automation ─────────────────────────────────────────────────────────────────
  // Wildcard: `/backtests/new` is the form and `/backtests/<uuid>` is the status page — the
  // address `POST /v1/backtests` puts in its `location` header (`trade/src/server.ts`), which
  // is what a customer polls while the run is queued.
  { path: 'backtests', label: 'Backtests', wildcard: true, public: false },
  // Wildcard for the same reason: `/bots/new` and `/bots/<uuid>`.
  { path: 'bots', label: 'Bots', wildcard: true, public: false },
]

/** What the sub-navigation renders, with the leading slash a `NavLink` wants. */
export const NAV: ReadonlyArray<{ to: string; label: string }> = ROUTES.filter(
  (route): route is AppRoute & { label: string } => route.label !== null,
).map((route) => ({ to: `/${route.path}`, label: route.label }))

/** Every path nginx has to serve the shell for, excluding the index. */
export const NON_INDEX_PATHS: readonly string[] = ROUTES.filter((r) => r.path !== '').map(
  (r) => r.path,
)

/**
 * A route this app owns, deep enough to prove the SPA fallback works.
 *
 * Passed to CI as the deep-link probe. It must be a REAL address — a probe against a path the app
 * does not own proves only that the 404 page renders, which is the opposite of what the check is
 * for. This one is a backtest status page, which is the address customers reload most: a queued
 * run is polled until it completes.
 */
export const DEEP_LINK_PATH = '/backtests/5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f'
