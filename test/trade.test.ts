/**
 * THE ROUTE TABLE, CHECKED AGAINST THE SERVICE THAT SERVES IT.
 *
 * Every client in this estate that was built against an imagined surface passed its own tests.
 * That is the whole problem: a test that asserts "the client calls /v1/bots" is a test that the
 * client agrees with itself. So this file does not assert paths in the abstract — it reads
 * `trade/src/server.ts` from the sibling checkout and requires that each path and method this
 * bundle calls is REGISTERED there.
 *
 * ── Two things this file checks that micro-mint-web's equivalent does not ──────────────────────
 *
 * **1. Authentication has two spellings on trade, and only one of them is a literal
 * `authenticate()` call.** Four of the routes this app uses go through `ownedBot`
 * (`trade/src/server.ts`), which authenticates and then 404s somebody else's
 * bot. A check that grepped each handler body for `authenticate(` — which is exactly what
 * micro-mint-web's does, correctly, for a service where every handler calls it directly — would
 * declare all four UNAUTHENTICATED here, and a client built on that answer would send them no
 * bearer and get a 401 it could not explain. So the table below records HOW each route
 * authenticates and the check asserts that, not merely whether.
 *
 * **2. trade requires an `Idempotency-Key` on every mutation; mint requires none anywhere.** The
 * two clients are therefore not interchangeable in the one place it costs money. This file
 * asserts the requirement at the service, so nobody "fixes" this client by removing a header the
 * service answers 400 without.
 *
 * ── NOTHING IN HERE NAMES A POSITION IN A FILE THIS REPOSITORY DOES NOT OWN ───────────────────
 *
 * Not a line, and not a byte offset either. Every route is located by its `define(` and every
 * helper by its declaration, and every slice is bounded by the bracket that CLOSES the construct —
 * so a handler that grows takes its boundary with it. `test/service-source.ts` carries the reasoning
 * and micro-org#235 carries the receipts: thirty tests across this repository and micro-mint-web
 * went red for edits made in the services, one of them by reporting that a handler which plainly
 * authenticates does not. `micro-contracts@e0f226d`, "refactor: cite the file, never the line", is
 * the estate rule this file is now an instance of rather than an exception to.
 *
 * The matcher is not taken on trust: the last `describe` in this file exercises it against fixtures
 * — a handler that grows, a route quoted in a comment, a last route with helpers below it, a route
 * that is absent — because an assertion about somebody else's repository is worth exactly what the
 * slice behind it is worth.
 *
 * ── What happens without the sibling ──────────────────────────────────────────────────────────
 *
 * The service is a private repository. `pnpm test` must pass for somebody who has cloned only this
 * one, so a missing checkout SKIPS the cross-repository half — and, because a skipped test is an
 * unmeasured one, CI is where absence becomes a failure: the `check` job checks micro-trade out
 * and the workflow asserts the cross-check REALLY RAN by requiring the count in the output, then
 * renames a route to one the service does not serve and requires the suite to go red. Neither half
 * can go quiet on its own.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { readServiceSource } from './service-source.ts'

const here = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))

/** Where a micro-trade checkout is, in the order CI and a developer's machine put it. */
const TRADE_CANDIDATES = [
  process.env['CLOUDSFORGE_TRADE_DIR'],
  here('../trade/src/server.ts'),
  here('.trade/src/server.ts'),
].filter((v): v is string => Boolean(v))

const tradeServer = TRADE_CANDIDATES.find((p) => existsSync(p))

/**
 * How a route establishes who is calling.
 *
 *   'direct'    — the handler body contains `await authenticate(ctx, deps)`
 *   'ownedBot'  — the handler body calls `ownedBot(ctx, deps, …)`, which authenticates
 *   'reader'    — the handler calls `reader(ctx, deps)`, which authenticates, scopes a service
 *                 principal to the read scope, and meters the caller against `market.read`
 *   'writer'    — the handler calls `writer(ctx, deps, <action>)`, the same with a write scope and
 *                 the action's own rate bucket
 *   'none'      — none of those; the handler never learns who is calling
 *
 * `reader` and `writer` are the exchange's spelling of the same fact `ownedBot` was added for: a
 * route can be authenticated without the word `authenticate` appearing in its handler. A check that
 * grepped for the literal would call sixteen order-book routes open, and a client built on that
 * answer would send no bearer and receive a 401 it could not explain.
 */
type AuthKind = 'direct' | 'ownedBot' | 'reader' | 'writer' | 'none'

/**
 * The surface this bundle uses.
 *
 * Written down as DATA so the check below can be mechanical: each entry must be registered by the
 * service, and the service must serve nothing this table has never heard of. Neither direction
 * needs a line number, and a line number is what used to break this file whenever micro-trade was
 * edited in a way that moved its routes without changing them.
 *
 * `gated` is the fourth column and the newest. It records that micro-trade registered the route
 * through `exchangeRoute` rather than `define` — the wrapper that throws `ExchangeDisabledError`
 * before the handler runs when `TRADE_EXCHANGE_ENABLED` is off. This bundle shows or refuses a
 * whole product surface on the strength of that (`src/lib/orderbook.tsx`), so which registrar
 * declared each route is a fact this repository depends on and therefore a fact it checks.
 */
const SURFACE: ReadonlyArray<{
  method: string
  path: string
  auth: AuthKind
  idempotent: boolean
  gated: boolean
}> = [
  { method: 'GET', path: '/v1/strategies', auth: 'none', idempotent: false, gated: false },
  { method: 'GET', path: '/v1/capabilities', auth: 'none', idempotent: false, gated: false },
  { method: 'GET', path: '/v1/series', auth: 'direct', idempotent: false, gated: false },
  { method: 'GET', path: '/v1/backtests', auth: 'direct', idempotent: false, gated: false },
  { method: 'GET', path: '/v1/backtests/:id', auth: 'direct', idempotent: false, gated: false },
  { method: 'GET', path: '/v1/backtests/:id/result', auth: 'direct', idempotent: false, gated: false },
  { method: 'POST', path: '/v1/backtests', auth: 'direct', idempotent: true, gated: false },
  { method: 'GET', path: '/v1/bots', auth: 'direct', idempotent: false, gated: false },
  { method: 'GET', path: '/v1/bots/:id', auth: 'ownedBot', idempotent: false, gated: false },
  { method: 'GET', path: '/v1/bots/:id/fills', auth: 'ownedBot', idempotent: false, gated: false },
  { method: 'GET', path: '/v1/bots/:id/settlements', auth: 'ownedBot', idempotent: false, gated: false },
  { method: 'POST', path: '/v1/bots', auth: 'direct', idempotent: true, gated: false },
  { method: 'POST', path: '/v1/bots/:id/actions', auth: 'ownedBot', idempotent: true, gated: false },

  // ── the exchange, all of it behind exchangeRoute ─────────────────────────────────────────────
  //
  // Read-only market data authenticates too. It is public in CONTENT — the tape names no
  // counterparty — but not in ACCESS, and the service's own note says why: the rate limiter has no
  // subject to meter an anonymous caller by. So `auth: 'reader'`, and `src/lib/exchange.ts` sends a
  // token to every one of them.
  { method: 'GET', path: '/v1/exchange/markets', auth: 'reader', idempotent: false, gated: true },
  { method: 'GET', path: '/v1/exchange/markets/:symbol', auth: 'reader', idempotent: false, gated: true },
  { method: 'GET', path: '/v1/exchange/markets/:symbol/depth', auth: 'reader', idempotent: false, gated: true },
  { method: 'GET', path: '/v1/exchange/markets/:symbol/ticker', auth: 'reader', idempotent: false, gated: true },
  { method: 'GET', path: '/v1/exchange/markets/:symbol/trades', auth: 'reader', idempotent: false, gated: true },
  { method: 'GET', path: '/v1/exchange/markets/:symbol/candles', auth: 'reader', idempotent: false, gated: true },
  { method: 'POST', path: '/v1/exchange/orders', auth: 'writer', idempotent: true, gated: true },
  { method: 'GET', path: '/v1/exchange/orders', auth: 'reader', idempotent: false, gated: true },
  { method: 'GET', path: '/v1/exchange/orders/:id', auth: 'reader', idempotent: false, gated: true },
  { method: 'GET', path: '/v1/exchange/orders/:id/events', auth: 'reader', idempotent: false, gated: true },
  // The one mutation with no key, and the service says why: the order id in the path IS the
  // idempotency key, and a second delete answers 409 naming the state the order is already in.
  // Answering 200 to a cancel that cancelled nothing is how somebody comes to believe they are flat
  // when they are not.
  { method: 'DELETE', path: '/v1/exchange/orders/:id', auth: 'writer', idempotent: false, gated: true },
  { method: 'POST', path: '/v1/exchange/orders/cancel-all', auth: 'writer', idempotent: true, gated: true },
  { method: 'GET', path: '/v1/exchange/fills', auth: 'reader', idempotent: false, gated: true },
  { method: 'GET', path: '/v1/exchange/balances', auth: 'reader', idempotent: false, gated: true },
  { method: 'POST', path: '/v1/exchange/transfers', auth: 'writer', idempotent: true, gated: true },
  { method: 'GET', path: '/v1/exchange/transfers', auth: 'reader', idempotent: false, gated: true },
]

/**
 * Routes trade serves that this bundle deliberately does NOT call, each with the reason.
 *
 * Enumerated rather than ignored, so that the "knows about everything the service serves" check
 * below can be exact in both directions: a route this app has never heard of should make somebody
 * look, and a route it has decided against should not.
 */
const DECLINED: ReadonlyArray<{ method: string; path: string; why: string }> = [
  { method: 'POST', path: '/v1/series', why: 'requireOperator — trade:admin or role:admin' },
  { method: 'POST', path: '/v1/series/:id/bars', why: 'requireOperator — trade:admin or role:admin' },
  { method: 'POST', path: '/v1/events', why: 'HMAC webhook; a browser holds no signing secret' },
  {
    method: 'POST',
    path: '/v1/exchange/markets/:symbol/status',
    // Halting a market and letting it back up is an operator action, and this is a customer
    // surface. It is DECLINED rather than absent so that the "knows about everything it serves"
    // check stays exact: a customer bundle growing a halt button should be a decision somebody
    // makes, not a diff nobody notices.
    why: 'requireOperator — halting a market is an operator action, not a customer one',
  },
]

const client = readFileSync(here('src/lib/trade.ts'), 'utf8')

/**
 * The exchange half of the client, which is a separate module for a reason worth restating here.
 *
 * `src/lib/trade.ts` is the modelling surface — strategies, series, backtests, bots — and it is
 * unconditional: every deployment serves it. `src/lib/exchange.ts` is the order book, and every one
 * of its routes can answer 503 `exchange_disabled`. Keeping them apart is what lets a page import
 * one without importing the other, and it is why the scans below read both files rather than one.
 */
const exchangeClient = readFileSync(here('src/lib/exchange.ts'), 'utf8')

/** Both halves, for the scans that are about the client as a whole. */
const callers = [
  { file: 'src/lib/trade.ts', source: client },
  { file: 'src/lib/exchange.ts', source: exchangeClient },
]

/**
 * A path with its parameter names erased.
 *
 * The client writes `/v1/exchange/markets/${encodeURIComponent(symbol)}/depth` and the surface table
 * writes `/v1/exchange/markets/:symbol/depth`. Comparing those needs one normal form, and it has to
 * erase the NAME as well as the shape: micro-trade calls the segment `:symbol` on the market routes
 * and `:id` on the order routes, and a client template carries no name at all.
 */
const shapeOf = (path: string): string =>
  path.replace(/\$\{[^}]*\}/g, '·').replace(/:[A-Za-z]+/g, '·')

/**
 * The client read the same structural way the service is.
 *
 * `readServiceSource` is not really about the service — it is about reading TypeScript by its
 * shape, and the client deserves it for the same reason. The `auth: false` check below used to be
 * `client.slice(at, at + 400)`, which is a window rather than a function: four hundred characters
 * from `getStrategies` runs past its closing brace and into the doc comment of the next export, so
 * it could be satisfied by a NEIGHBOUR. Same defect as micro-org#235, one repository closer to
 * home.
 */
const clientSource = readServiceSource('src/lib/trade.ts', client)

describe('the client calls only routes it has cited', () => {
  it('every path in the client appears in the documented surface', () => {
    // Template literals in the client are `/v1/bots/${…}/fills`; `shapeOf` reduces both sides to
    // one normal form so the two are comparable without either having to spell the other's
    // parameter names.
    const shapes = new Set(SURFACE.map((r) => shapeOf(r.path)))
    let seen = 0
    for (const { file, source } of callers) {
      const called = [...source.matchAll(/['"`](\/v1\/[^'"`]*)['"`]/g)]
        .map((m) => shapeOf(m[1] ?? ''))
        .filter((p) => !p.includes('$'))
      assert.ok(called.length >= 9, `expected the call sites in ${file}, found ${called.length}`)
      seen += called.length
      for (const path of new Set(called)) {
        assert.ok(shapes.has(path), `${file} calls ${path}, which is not in the verified surface`)
      }
    }
    assert.ok(seen >= 25, `expected the whole client surface, found ${seen} call sites`)
  })

  it('every customer route in the surface is actually reachable from the client', () => {
    // The other direction, and the one that catches a route added to this table and to nothing
    // else. A surface entry nothing calls is a citation with no code behind it, which is how a
    // table drifts into fiction while every test stays green.
    const called = new Set(
      callers.flatMap(({ source }) =>
        [...source.matchAll(/['"`](\/v1\/[^'"`]*)['"`]/g)].map((m) => shapeOf(m[1] ?? '')),
      ),
    )
    for (const route of SURFACE) {
      assert.ok(
        called.has(shapeOf(route.path)),
        `${route.method} ${route.path} is in the surface table and no client function calls it`,
      )
    }
  })

  it('says where it read the surface from', () => {
    // The FILE, not a line in it. A line number here was a promise this repository could not keep:
    // it names a position in a file that a different repository is free to edit, and it went stale
    // every time micro-trade grew an import. What is worth asserting is that the client points a
    // reader at the source of truth; `the cited lines are…` below proves the routes are really
    // there.
    assert.ok(
      client.includes('trade/src/server.ts'),
      'src/lib/trade.ts no longer says which service source it was read from',
    )
  })

  it('sends an Idempotency-Key on exactly the mutations that require one', () => {
    const wanted = SURFACE.filter((r) => r.idempotent).length
    // Six: three on the modelling side (queue a backtest, create a bot, act on a bot) and three on
    // the exchange (place an order, cancel everything, move money). Pinned as a number so that a
    // route arriving with `idempotent: false` copied from the line above it is a failure here
    // rather than a duplicate charge in production.
    assert.equal(wanted, 6, `the surface table names ${wanted} mutations, not six`)
    const sent = callers.reduce(
      (total, { source }) =>
        total + [...source.matchAll(/'idempotency-key':\s*idempotencyKey/g)].length,
      0,
    )
    assert.equal(sent, wanted, `the client sends ${sent} idempotency keys for ${wanted} mutations`)
  })

  it('the one keyless mutation is the cancel, and it is keyless on purpose', () => {
    // DELETE /v1/exchange/orders/:id takes no key because the order id in the path IS one. This is
    // asserted from both ends — the table says so, and the service is checked below — because the
    // tempting "fix" when somebody notices the asymmetry is to add a key here, which would make
    // every cancel carry a fresh one and turn a retry into a second cancel attempt.
    const keyless = SURFACE.filter((r) => r.method !== 'GET' && !r.idempotent)
    assert.deepEqual(
      keyless.map((r) => `${r.method} ${r.path}`),
      ['DELETE /v1/exchange/orders/:id'],
    )
  })

  it('sends no token to the one route that never asked for one', () => {
    // The function, brace to brace — not a count of characters after it. A missing `getStrategies`
    // throws out of `functionBody` naming the file, rather than handing back '' for the assertion
    // to pass over.
    assert.match(
      clientSource.functionBody('getStrategies'),
      /auth: false/,
      'getStrategies calls an unauthenticated route and must not send a token',
    )
  })
})

describe('every route this bundle names is really registered by the service', () => {
  if (tradeServer === undefined) {
    // NOT a silent pass. It says which check did not run, and CI makes the absence fatal.
    it('SKIPPED: no micro-trade checkout — CI checks one out and requires this to run', () => {
      assert.ok(true)
    })
    return
  }

  /**
   * The service, parsed rather than sliced. See `test/service-source.ts` for why every anchor in
   * here is a construct and never a position — it is the whole of micro-org#235.
   */
  const service = readServiceSource(tradeServer, readFileSync(tradeServer, 'utf8'))
  const bodyOf = (method: string, path: string): string => service.routeBody(method, path)

  it('reads a server with a route table in it, so this cannot pass on an empty file', () => {
    // The floor is the number of routes both tables name, plus the four the service registers and
    // this bundle has no business with (/livez, /readyz, /metrics and the strategy catalogue is
    // already counted). Expressed against the tables rather than as a literal, so adding a route
    // above raises the floor with it and a parser that has quietly stopped recognising a registrar
    // — which is exactly what `exchangeRoute` would have been — shows up here first.
    const named = SURFACE.length + DECLINED.length
    assert.ok(
      service.registrations.length >= named,
      `expected at least the ${named} routes these tables name, found ${service.registrations.length}`,
    )
  })

  it('every order-book route is registered through exchangeRoute, not through define', () => {
    // THE ASSERTION BEHIND THE WHOLE GATE. `src/lib/orderbook.tsx` shows or refuses this product's
    // entire trading surface on one reading of GET /v1/capabilities, and the promise underneath is
    // that a deployment with TRADE_EXCHANGE_ENABLED off cannot serve any of these routes at all.
    // That promise lives in one wrapper in the service: `exchangeRoute` checks the flag and throws
    // ExchangeDisabledError before the handler runs. A route moved back to a bare `define` would
    // still work, still answer, and quietly become reachable on a deployment this app has just told
    // the customer has no exchange.
    //
    // The service made the same argument when it chose to check the flag at declaration: "Eighteen
    // copies of one `if` is eighteen chances to forget it, and the one that gets forgotten will be
    // a mutating route — a placement or a withdrawal — because those are the ones written last."
    for (const route of [...SURFACE.filter((r) => r.gated), ...DECLINED].filter((r) =>
      r.path.startsWith('/v1/exchange/'),
    )) {
      assert.equal(
        service.route(route.method, route.path).registrar,
        'exchangeRoute',
        `${route.method} ${route.path} is no longer behind the exchange flag`,
      )
    }
  })

  it('and nothing outside the exchange is gated by it', () => {
    // The mirror. A backtest route wrapped in `exchangeRoute` would vanish on every default
    // deployment — the flag is off by default — and this app would go on offering the page.
    for (const route of SURFACE.filter((r) => !r.gated)) {
      assert.equal(
        service.route(route.method, route.path).registrar,
        'define',
        `${route.method} ${route.path} is now behind the exchange flag, and this app does not know`,
      )
    }
  })

  it('the exchange wrapper really does refuse when the flag is off', () => {
    // `registrar: 'exchangeRoute'` is worth nothing if the wrapper stops checking. Read as the
    // DECLARATION, bounded by the end of its own initialiser — it is a const arrow, so
    // `functionBody` cannot find it and would throw "no longer declares a function", which reads as
    // a deletion that did not happen.
    const wrapper = service.declarationBody('exchangeRoute')
    assert.match(wrapper, /deps\.exchangeEnabled/, 'exchangeRoute no longer reads the flag')
    assert.match(wrapper, /throw new ExchangeDisabledError\(\)/, 'it no longer refuses')
    // Before the handler, not after it. A check that ran afterwards would have already placed the
    // order it was supposed to prevent.
    assert.ok(
      wrapper.indexOf('ExchangeDisabledError') < wrapper.indexOf('return handleRoute'),
      'the flag is checked after the handler has already run',
    )
  })

  for (const route of [...SURFACE, ...DECLINED]) {
    it(`${route.method} ${route.path} is registered in trade/src/server.ts`, () => {
      // `routeBody` throws — naming the route, the resolved file and every route the file DOES
      // register — rather than returning an empty string for the rest of the suite to assert over.
      assert.ok(bodyOf(route.method, route.path).length > 0)
    })
  }

  it('this bundle calls nothing trade does not serve, and knows about everything it does', () => {
    // Both directions. A route the service grew that neither table has heard of is not a failure
    // of the app, but it IS the moment somebody should look — the citations are only trustworthy
    // while somebody is re-reading them.
    //
    // Read from the PARSED registrations, so a `define('GET', '/v1/…'` that micro-trade quoted in
    // a comment — which sources in this estate do on purpose, this one included — cannot be
    // counted as a route the service serves and fail this check naming something imaginary.
    const registered = service.registrations
      .map((r) => `${r.method} ${r.path}`)
      .filter((r) => r.includes('/v1/'))
    const known = [...SURFACE, ...DECLINED].map((r) => `${r.method} ${r.path}`)
    assert.deepEqual(
      registered.filter((r) => !known.includes(r)),
      [],
      'trade serves a /v1 route this app has never read. Read it, then add or decline it here.',
    )
  })

  it('each route authenticates the way this app believes it does', () => {
    // The defect this asserts against is a client sending a bearer to a handler that never wanted
    // one and then reasoning about a 403 that was never about authorisation — and its mirror, a
    // client withholding one from a handler that authenticates through a helper.
    for (const route of SURFACE) {
      const body = bodyOf(route.method, route.path)
      // Ordered from most specific to least. `reader(` and `writer(` are tested BEFORE the literal
      // `authenticate(` because both helpers contain one — a handler that calls `reader` does not
      // itself call `authenticate`, but a future one that does both should be reported as the
      // helper it uses rather than as 'direct'.
      const actual: AuthKind = /await reader\(ctx, deps\)/.test(body)
        ? 'reader'
        : /await writer\(ctx, deps, '[a-z.]+'\)/.test(body)
          ? 'writer'
          : /await authenticate\(ctx, deps\)/.test(body)
            ? 'direct'
            : /ownedBot\(ctx, deps/.test(body)
              ? 'ownedBot'
              : 'none'
      assert.equal(
        actual,
        route.auth,
        `${route.method} ${route.path}: this app treats it as '${route.auth}' and the handler is '${actual}'`,
      )
    }
  })

  it('reader and writer really authenticate, so the exchange routes are not open', () => {
    // Same reasoning as `ownedBot` below: the sixteen routes marked 'reader' or 'writer' are only
    // as authenticated as these two helpers are. Both are read as FUNCTIONS, brace to brace.
    for (const name of ['reader', 'writer']) {
      const helper = service.functionBody(name)
      assert.match(helper, /await authenticate\(ctx, deps\)/, `${name} no longer authenticates`)
      assert.match(helper, /requireScope\(principal, /, `${name} no longer scopes a service caller`)
      assert.match(helper, /await enforceRate\(/, `${name} no longer meters the caller`)
    }
  })

  it('cancelling is metered more generously than placing, and that is deliberate', () => {
    // It must never be harder to get out than it was to get in. The browser says so in its glossary
    // (`rate_limit`, src/lib/glossary.ts) and this is where that sentence is checked against the
    // service rather than believed: placing uses the `order.place` bucket and cancelling — both the
    // single and the mass cancel — uses `order.cancel`.
    assert.match(bodyOf('POST', '/v1/exchange/orders'), /writer\(ctx, deps, 'order\.place'\)/)
    assert.match(bodyOf('DELETE', '/v1/exchange/orders/:id'), /writer\(ctx, deps, 'order\.cancel'\)/)
    assert.match(
      bodyOf('POST', '/v1/exchange/orders/cancel-all'),
      /writer\(ctx, deps, 'order\.cancel'\)/,
    )
  })

  it('every route that reads the caller’s own rows scopes the query to that caller', () => {
    // A 404 rather than somebody else's order. The handler has to pass the principal's own id into
    // the query rather than trusting the path, and this is the shape micro-trade uses throughout.
    const OWNED = [
      'GET /v1/exchange/orders',
      'GET /v1/exchange/orders/:id',
      'GET /v1/exchange/orders/:id/events',
      'GET /v1/exchange/fills',
      'GET /v1/exchange/balances',
      'GET /v1/exchange/transfers',
    ]
    for (const entry of OWNED) {
      const [method, path] = entry.split(' ') as [string, string]
      const body = bodyOf(method, path)
      assert.match(
        body,
        /const principal = await reader\(ctx, deps\)/,
        `${entry} does not keep the principal it authenticated`,
      )
      assert.match(
        body,
        /ownerOf\(ctx, principal\)/,
        `${entry} never narrows to the caller; another customer's rows would be readable`,
      )
    }
  })

  it('ownerOf lets an ordinary customer name only themselves', () => {
    // The helper every owned read narrows through, and the one place a mistake would make one
    // customer's orders readable by another. `subjectUserId` is what refuses a `?userId=` from a
    // principal with no authority over it; the admin and service branches are separate and
    // deliberate. Pinned here because this bundle's entire "your orders" surface is one call away
    // from it, and because a browser NEVER sends `?userId=` — so a regression would be invisible
    // from this side until somebody else found it.
    const helper = service.functionBody('ownerOf')
    assert.match(helper, /isAdmin\(principal\) && requested/, 'the admin branch has moved')
    assert.match(
      helper,
      /subjectUserId\(principal, requested\)/,
      'a non-admin caller is no longer held to their own subject',
    )
  })

  it('ownedBot really does authenticate, so the four routes that use it are not open', () => {
    // The whole 'ownedBot' branch above is worth nothing if the helper stops calling
    // `authenticate`, so the helper is pinned separately — as the FUNCTION, brace to brace.
    //
    // This read `source.slice(at, at + 900)`, and nine hundred characters is not a function. The
    // real `ownedBot` is a little over four hundred, so the window ran five hundred characters past
    // its closing brace and graded the comment and body of `backtestView` as though they were part
    // of it. Delete the `authenticate` call from `ownedBot` and this would have kept passing on
    // whatever the window ran into — a guard that cannot fail, which is worse than none because it
    // is believed. It would also have gone red the moment micro-trade grew the helper past the
    // window, for no reason belonging to this repository. Both are micro-org#235.
    const helper = service.functionBody('ownedBot')
    assert.match(helper, /await authenticate\(ctx, deps\)/, 'ownedBot no longer authenticates')
    assert.match(
      helper,
      /getOwnedBot\(deps\.sql, uuidParam\(ctx, 'id'\), userId\)/,
      'ownedBot no longer scopes the lookup to the caller',
    )
  })

  it('every route called without a token really makes no authenticate() call', () => {
    // The line comes from SURFACE, never from a literal. This check used to say bodyOf(334), and
    // when trade's table moved, 334 became the /metrics handler — which also makes no
    // authenticate() call, so the check went on PASSING while grading a completely different
    // function. A guard that cannot fail is worse than no guard, because it is believed.
    const open = SURFACE.filter((r) => r.auth === 'none')
    assert.ok(open.length >= 1, 'the unauthenticated routes have vanished from the surface')
    for (const route of open) {
      assert.doesNotMatch(
        bodyOf(route.method, route.path),
        /authenticate\(/,
        `${route.method} ${route.path} now authenticates; it is called with auth: false`,
      )
    }
  })

  it('every mutating route this app calls requires an Idempotency-Key', () => {
    // The opposite of micro-mint-web's assertion, and it has to be, because trade is the opposite
    // service: `idempotencyKeyOf` throws a BadRequestError when the header is absent.
    for (const route of SURFACE.filter((r) => r.idempotent)) {
      assert.match(
        bodyOf(route.method, route.path),
        /idempotencyKeyOf\(ctx\)/,
        `${route.method} ${route.path} no longer reads an idempotency key`,
      )
    }
  })

  it('the key requirement is a 400 and the window is 8 to 200 characters', () => {
    // The function, not `slice(at, at + 500)`. Same defect as `ownedBot` above: the real
    // `idempotencyKeyOf` is about three hundred characters, so the old window overran it into
    // `uuidParam`, and `throw new BadRequestError` is a sentence BOTH of them contain — so the
    // second assertion below could have been satisfied entirely by the neighbour.
    const fn = service.functionBody('idempotencyKeyOf')
    assert.match(fn, /key\.length < 8 \|\| key\.length > 200/, 'the length window moved')
    assert.match(fn, /throw new BadRequestError/, 'a missing key is no longer a 400')
  })

  it('the two operator routes really do require an operator, which is why they are declined', () => {
    for (const route of DECLINED.filter((r) => r.path.startsWith('/v1/series'))) {
      assert.match(
        bodyOf(route.method, route.path),
        /requireOperator\(principal\)/,
        `${route.method} ${route.path} no longer requires an operator`,
      )
    }
  })

  it('the webhook is a MAC surface rather than a bearer one, which is why it is declined', () => {
    // The line comes from DECLINED, never from a literal repeated here. A magic number in a check
    // is a second, unversioned copy of a citation: when trade's route table moved, this one still
    // said 655 and silently graded the WRONG handler — the same defect as a CI step that hardcodes
    // the line it mutates and then passes against a file it never changed.
    const webhook = DECLINED.find((r) => r.path === '/v1/events')
    if (!webhook) throw new Error('the webhook is no longer declined; say why, or call it')
    const body = bodyOf(webhook.method, webhook.path)
    assert.match(body, /verifyEventSignature\(raw, deps\.eventAcceptSecrets, presented\)/)
    assert.doesNotMatch(body, /authenticate\(/, 'the webhook now takes a bearer token')
  })
})

/**
 * THE MATCHER ITSELF, CHECKED — because everything above is only as true as it is.
 *
 * Every assertion in this file now rests on `test/service-source.ts` handing back the right span of
 * somebody else's file. If that slice is wrong, the suite does not fall silent: it says a specific,
 * false thing about micro-trade, which is precisely what micro-org#235 is a report of. So the
 * matcher is exercised against FIXTURES rather than against the service — the properties below have
 * to hold for a file this repository controls, or the answers it gives about one it does not are
 * worth nothing. These run whether or not a micro-trade checkout is present.
 */
describe('the matcher reads by structure, and says so when it cannot', () => {
  /**
   * A miniature server with the three shapes that have burned this estate: a route followed by
   * another, a route quoted in a COMMENT, and a LAST route with a helper below it that
   * authenticates.
   */
  const FIXTURE = [
    `const helpText = "define('GET', '/v1/imaginary', handler) is how a route is declared"`,
    ``,
    `function buildRoutes(): Route[] {`,
    `  return [`,
    `    define('GET', '/v1/first', async (ctx, deps) => {`,
    `      const principal = await authenticate(ctx, deps)`,
    `      if (!/^[A-Z0-9]{2,12}$/.test(ctx.params['symbol'] ?? '')) throw new BadRequestError('no')`,
    `      return { status: 200, body: { marker: 'FIRST_HANDLER', who: principal } }`,
    `    }),`,
    `    define('POST', '/v1/second', async (ctx) => {`,
    `      return { status: 201, body: { marker: 'SECOND_HANDLER' } }`,
    `    }),`,
    `    // define('GET', '/v1/ghost', async () => ({ status: 200 })), — moved to micro-ledger`,
    `    exchangeRoute('GET', '/v1/exchange/gated', async (ctx, deps) => {`,
    `      await reader(ctx, deps)`,
    `      return { status: 200, body: { marker: 'GATED_HANDLER' } }`,
    `    }),`,
    `    define('POST', '/v1/hooks', async (ctx, deps) => {`,
    `      if (!verifyEventSignature(raw, deps.eventAcceptSecrets, presented)) {`,
    `        return errorReply(403, 'bad_signature', ctx.requestId)`,
    `      }`,
    `      return { status: 202, body: { marker: 'LAST_HANDLER' } }`,
    `    }),`,
    `  ]`,
    `}`,
    ``,
    `const exchangeRoute = (method: string, path: string, handleRoute: RouteHandler): Route =>`,
    `  define(method, path, async (ctx, deps) => {`,
    `    if (!deps.exchangeEnabled) throw new ExchangeDisabledError()`,
    `    return handleRoute(ctx, deps)`,
    `  })`,
    ``,
    `async function afterTheArray(ctx: RequestContext, deps: ServerDeps): Promise<{ ok: boolean }> {`,
    `  const principal = await authenticate(ctx, deps)`,
    `  return { ok: principal !== null }`,
    `}`,
  ].join('\n')

  const fixture = readServiceSource('fixture/server.ts', FIXTURE)

  it('finds the registrations, and neither a commented-out one nor one quoted in a string', () => {
    // Both exclusions are house rules rather than fussiness. Sources in this estate quote deleted
    // code in comments deliberately — micro-trade's own server does — and a raw-text scan counts
    // those as routes the service serves, which fails the "knows about everything it does" check
    // above naming a path that does not exist.
    assert.deepEqual(
      fixture.registrations.map((r) => `${r.method} ${r.path}`),
      ['GET /v1/first', 'POST /v1/second', 'GET /v1/exchange/gated', 'POST /v1/hooks'],
    )
  })

  it('records which registrar declared each route', () => {
    // The gate check above rests entirely on this. A parser that recognised `exchangeRoute(` as a
    // registration but reported every route as `define` would let an order-book route silently lose
    // its flag check while `every order-book route is registered through exchangeRoute` stayed
    // green — a guard that cannot fail, which is worse than none.
    assert.deepEqual(
      fixture.registrations.map((r) => `${r.registrar} ${r.path}`),
      [
        'define /v1/first',
        'define /v1/second',
        'exchangeRoute /v1/exchange/gated',
        'define /v1/hooks',
      ],
    )
  })

  it('bounds an exchangeRoute at its own closing parenthesis too', () => {
    // The wrapper is one more level of nesting than `define`, so the boundary is one more `)` out.
    // Getting that wrong would run the gated handler into the next route, which is micro-org#235
    // with a new registrar.
    const gated = fixture.routeBody('GET', '/v1/exchange/gated')
    assert.match(gated, /GATED_HANDLER/)
    assert.doesNotMatch(gated, /SECOND_HANDLER/, 'it ran backwards into the route above')
    assert.doesNotMatch(gated, /LAST_HANDLER/, 'it ran into the route below')
  })

  it('reads a const arrow to the end of its own initialiser', () => {
    // `exchangeRoute` is a CONST, and its initialiser is a concise arrow whose outermost bracket is
    // the parenthesis of a call, not a brace. Brace-matching the first `{` after the name returns
    // the inner handler and stops before the `)` that closes `define(`, so an assertion about the
    // whole wrapper would be graded against a fragment of it.
    const wrapper = fixture.declarationBody('exchangeRoute')
    assert.match(wrapper, /if \(!deps\.exchangeEnabled\) throw new ExchangeDisabledError\(\)/)
    assert.match(wrapper, /return handleRoute\(ctx, deps\)/, 'the initialiser was cut short')
    assert.doesNotMatch(wrapper, /afterTheArray/, 'it ran into the declaration below')
    assert.doesNotMatch(wrapper, /LAST_HANDLER/, 'it ran backwards into the route table')
  })

  it('throws for a const the file no longer declares, and says which matcher to use', () => {
    assert.throws(
      () => fixture.declarationBody('reader'),
      /fixture\/server\.ts no longer declares a top-level const called reader/,
    )
    // And the mirror: asking `functionBody` for a const must not answer with something else's body.
    assert.throws(
      () => fixture.functionBody('exchangeRoute'),
      /no longer declares a function called exchangeRoute/,
    )
  })

  it('bounds a handler at its own closing parenthesis, however far it grows', () => {
    // THE REGRESSION TEST FOR THE FIX. Any boundary expressed as a COUNT — n lines after the match,
    // n characters after the match — passes on the fixture as written and fails here, because the
    // only thing that changed is how big the first handler is. That is micro-org#235 reproduced in
    // one repository: the assertion breaks on an edit that changed nothing it was asserting.
    const filler = Array.from(
      { length: 300 },
      (_, i) => `      const grown${i} = { nested: { deep: [1, 2, 3] } , tag: 'GROWN_INTO_FIRST' }`,
    ).join('\n')
    const grown = readServiceSource(
      'fixture/server.ts',
      FIXTURE.replace(
        `      const principal = await authenticate(ctx, deps)`,
        `      const principal = await authenticate(ctx, deps)\n${filler}`,
      ),
    )

    const first = grown.routeBody('GET', '/v1/first')
    const second = grown.routeBody('POST', '/v1/second')
    assert.match(first, /GROWN_INTO_FIRST/, 'the handler lost its own body')
    assert.doesNotMatch(first, /SECOND_HANDLER/, 'the first handler ran into the second')
    assert.doesNotMatch(second, /GROWN_INTO_FIRST/, 'the second handler picked up the first')
    assert.match(second, /SECOND_HANDLER/, 'the second handler lost its own body')
  })

  it('stops the LAST route at the route array rather than at the end of the file', () => {
    // The exact defect micro-mint-web shipped: its `bodyOf` terminated only at the NEXT `define(`,
    // and `POST /v1/events` is the last route micro-mint registers — so the webhook's "body" was
    // every helper below the array, `authenticate` among them. The check that the webhook takes no
    // bearer was one edit in a different repository away from failing, and the failure would have
    // read as "mint-web is wrong about the webhook".
    const webhook = fixture.routeBody('POST', '/v1/hooks')
    assert.match(webhook, /LAST_HANDLER/)
    assert.doesNotMatch(webhook, /afterTheArray/, 'the last route swallowed the helpers below it')
    assert.doesNotMatch(webhook, /await authenticate\(ctx, deps\)/, 'and their authentication')
  })

  it('throws for a route the file does not register, naming the route and the file', () => {
    // A matcher that finds nothing and returns '' is worse than the line numbers were:
    // `assert.doesNotMatch('', /authenticate\(/)` passes, and it passes for ever. The message also
    // reports what WAS found, so a reader can tell "micro-trade dropped the route" from "the
    // matcher stopped understanding the file" without opening either.
    assert.throws(
      () => fixture.routeBody('GET', '/v1/nope'),
      (error: Error) => {
        assert.match(error.message, /GET \/v1\/nope is not registered in fixture\/server\.ts/)
        assert.match(error.message, /GET \/v1\/first/, 'it does not say what it did find')
        return true
      },
    )
  })

  it('throws for a helper the file no longer declares', () => {
    assert.throws(
      () => fixture.functionBody('ownedBot'),
      /fixture\/server\.ts no longer declares a function called ownedBot/,
    )
  })

  it('finds a registration the formatter has wrapped across lines', () => {
    // The other way a positional matcher accuses the wrong repository: micro-trade reformats, the
    // `define(` no longer sits on one line at four spaces of indent, and this suite reports that a
    // route the service still serves has been withdrawn. Nothing about a route is a fact about
    // where its arguments were broken.
    const wrapped = readServiceSource(
      'fixture/wrapped.ts',
      [
        `function buildRoutes(): Route[] {`,
        `  return [`,
        `    define(`,
        `      'PUT',`,
        `      '/v1/wrapped/:id/page',`,
        `      async (ctx, deps) => {`,
        `        const principal = await authenticate(`,
        `          ctx,`,
        `          deps,`,
        `        )`,
        `        return { status: 200, body: { principal } }`,
        `      },`,
        `    ),`,
        `  ]`,
        `}`,
      ].join('\n'),
    )
    assert.deepEqual(
      wrapped.registrations.map((r) => `${r.method} ${r.path}`),
      ['PUT /v1/wrapped/:id/page'],
    )
    // …and the needle this suite asserts with still answers, because whitespace is flattened and
    // the trailing comma a formatter adds when it wraps is undone.
    assert.match(
      wrapped.routeBody('PUT', '/v1/wrapped/:id/page'),
      /await authenticate\(ctx, deps\)/,
      'a reformatted call would have been read as an unauthenticated handler',
    )
  })

  it('reads a function to its own closing brace, past a braced return type', () => {
    // `ownedBot` is declared `): Promise<{ principal: Principal; bot: BotRecord }> {`. Brace-
    // matching the first `{` after the parameters returns the TYPE, and every assertion about the
    // helper would then be made against an object type that contains no code at all.
    const helper = fixture.functionBody('afterTheArray')
    assert.match(helper, /await authenticate\(ctx, deps\)/, 'the return type was read as the body')
    assert.match(helper, /return \{ok: principal !== null\}/)
    assert.doesNotMatch(helper, /buildRoutes/, 'the helper ran backwards into the route table')
  })
})
