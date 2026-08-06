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
 * ── What happens without the sibling ──────────────────────────────────────────────────────────
 *
 * The service is a private repository. `pnpm test` must pass for somebody who has cloned only this
 * one, so a missing checkout SKIPS the cross-repository half — and, because a skipped test is an
 * unmeasured one, CI is where absence becomes a failure: the `check` job checks micro-trade out
 * and the workflow asserts the cross-check REALLY RAN by requiring the count in the output, then
 * bends one citation by a line and requires the suite to go red. Neither half can go quiet on its
 * own.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

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
 *   'none'      — neither; the handler never learns who is calling
 */
type AuthKind = 'direct' | 'ownedBot' | 'none'

/**
 * The surface this bundle uses.
 *
 * Written down as DATA so the check below can be mechanical: each entry must be registered by the
 * service, and the service must serve nothing this table has never heard of. Neither direction
 * needs a line number, and a line number is what used to break this file whenever micro-trade was
 * edited in a way that moved its routes without changing them.
 */
const SURFACE: ReadonlyArray<{
  method: string
  path: string
  auth: AuthKind
  idempotent: boolean
}> = [
  { method: 'GET', path: '/v1/strategies', auth: 'none', idempotent: false },
  { method: 'GET', path: '/v1/capabilities', auth: 'none', idempotent: false },
  { method: 'GET', path: '/v1/series', auth: 'direct', idempotent: false },
  { method: 'GET', path: '/v1/backtests', auth: 'direct', idempotent: false },
  { method: 'GET', path: '/v1/backtests/:id', auth: 'direct', idempotent: false },
  { method: 'GET', path: '/v1/backtests/:id/result', auth: 'direct', idempotent: false },
  { method: 'POST', path: '/v1/backtests', auth: 'direct', idempotent: true },
  { method: 'GET', path: '/v1/bots', auth: 'direct', idempotent: false },
  { method: 'GET', path: '/v1/bots/:id', auth: 'ownedBot', idempotent: false },
  { method: 'GET', path: '/v1/bots/:id/fills', auth: 'ownedBot', idempotent: false },
  { method: 'GET', path: '/v1/bots/:id/settlements', auth: 'ownedBot', idempotent: false },
  { method: 'POST', path: '/v1/bots', auth: 'direct', idempotent: true },
  { method: 'POST', path: '/v1/bots/:id/actions', auth: 'ownedBot', idempotent: true },
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
]

const client = readFileSync(here('src/lib/trade.ts'), 'utf8')

describe('the client calls only routes it has cited', () => {
  it('every path in the client appears in the documented surface', () => {
    // Template literals in the client are `/v1/bots/${…}/fills`; reduce them to the `:id` spelling
    // the surface table uses so the two are comparable.
    const called = [...client.matchAll(/['"`](\/v1\/[^'"`]*)['"`]/g)]
      .map((m) => (m[1] ?? '').replace(/\$\{[^}]*\}/g, ':id'))
      .filter((p) => !p.includes('$'))
    assert.ok(called.length >= 9, `expected the call sites, found ${called.length}`)
    for (const path of new Set(called)) {
      assert.ok(
        SURFACE.some((r) => r.path === path),
        `src/lib/trade.ts calls ${path}, which is not in the verified surface`,
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

  it('sends an Idempotency-Key on exactly the three mutations that require one', () => {
    const wanted = SURFACE.filter((r) => r.idempotent).length
    assert.equal(wanted, 3, 'the surface table no longer names three mutations')
    const sent = [...client.matchAll(/'idempotency-key':\s*idempotencyKey/g)].length
    assert.equal(
      sent,
      wanted,
      `src/lib/trade.ts sends ${sent} idempotency keys for ${wanted} mutating routes`,
    )
  })

  it('sends no token to the one route that never asked for one', () => {
    const at = client.indexOf('export function getStrategies')
    assert.ok(at > 0, 'getStrategies is missing')
    assert.match(
      client.slice(at, at + 400),
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

  const source = readFileSync(tradeServer, 'utf8')
  const lines = source.split('\n')

  it('reads a server with a route table in it, so this cannot pass on an empty file', () => {
    const defines = lines.filter((l) => /^\s{4}define\('/.test(l))
    assert.ok(defines.length >= 14, `expected trade's route list, found ${defines.length} defines`)
  })

  /**
   * Where a route is registered, found by SEARCHING for it rather than by citing a line.
   *
   * This used to be a line number in the table above, and the line number is why this repository
   * kept turning red for edits made in a different one: `micro-trade` inserted seven lines near its
   * imports and every route below moved, so every citation here pointed at the wrong line while the
   * routes themselves were untouched. Nothing runs this suite when that service changes, so it
   * surfaced whenever somebody next tried to build — which is the worst possible moment.
   *
   * Searching costs one pass over a file already in memory and cannot go stale. What is actually
   * worth asserting is that the route EXISTS and that its handler behaves as this bundle believes;
   * neither of those is a fact about line 348.
   */
  const indexOfRoute = (method: string, path: string): number => {
    const re = new RegExp(`^\\s{4}define\\('${method}',\\s*'${path.replace(/[/:]/g, '\\$&')}'`)
    return lines.findIndex((l) => re.test(l))
  }

  for (const route of [...SURFACE, ...DECLINED]) {
    it(`${route.method} ${route.path} is registered in trade/src/server.ts`, () => {
      assert.ok(
        indexOfRoute(route.method, route.path) >= 0,
        `${route.method} ${route.path} is not registered in trade/src/server.ts at all`,
      )
    })
  }

  it('this bundle calls nothing trade does not serve, and knows about everything it does', () => {
    // Both directions. A route the service grew that neither table has heard of is not a failure
    // of the app, but it IS the moment somebody should look — the citations are only trustworthy
    // while somebody is re-reading them.
    const registered = lines
      .map((l) => /^\s{4}define\('([A-Z]+)',\s*'([^']+)'/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => `${m[1]} ${m[2]}`)
      .filter((r) => r.includes('/v1/'))
    const known = [...SURFACE, ...DECLINED].map((r) => `${r.method} ${r.path}`)
    assert.deepEqual(
      registered.filter((r) => !known.includes(r)),
      [],
      'trade serves a /v1 route this app has never read. Read it, then add or decline it here.',
    )
  })

  /**
   * The handler body for a route: from its `define(` to the next one, or to the end of the route
   * array.
   *
   * The second terminator is not decoration. `POST /v1/events` is the LAST entry in
   * `buildRoutes()`, so a scan that only stops at the next `define(` runs to the end of the FILE —
   * over `authenticate()`, `ownedBot()` and every helper below the array. The webhook then looks
   * like a bearer surface and `GET /v1/strategies` would too if it moved to the end. Caught by
   * this suite failing on a route whose handler plainly does not authenticate.
   */
  const bodyOf = (method: string, path: string): string => {
    const start = indexOfRoute(method, path)
    assert.ok(start >= 0, `${method} ${path} is not registered in trade/src/server.ts`)
    let end = lines.length
    for (let i = start + 1; i < lines.length; i++) {
      const text = lines[i] ?? ''
      if (/^\s{4}define\('/.test(text) || /^\s{2}\]$/.test(text)) {
        end = i
        break
      }
    }
    return lines.slice(start, end).join('\n')
  }

  it('each route authenticates the way this app believes it does', () => {
    // The defect this asserts against is a client sending a bearer to a handler that never wanted
    // one and then reasoning about a 403 that was never about authorisation — and its mirror, a
    // client withholding one from a handler that authenticates through a helper.
    for (const route of SURFACE) {
      const body = bodyOf(route.method, route.path)
      const direct = /await authenticate\(ctx, deps\)/.test(body)
      const viaHelper = /ownedBot\(ctx, deps/.test(body)
      const actual: AuthKind = direct ? 'direct' : viaHelper ? 'ownedBot' : 'none'
      assert.equal(
        actual,
        route.auth,
        `${route.method} ${route.path}: this app treats it as '${route.auth}' and the handler is '${actual}'`,
      )
    }
  })

  it('ownedBot really does authenticate, so the four routes that use it are not open', () => {
    // The whole 'ownedBot' branch above is worth nothing if the helper stops calling
    // `authenticate`. Pinned separately, at the line it is called from.
    const at = source.indexOf('async function ownedBot(')
    assert.ok(at > 0, 'ownedBot is gone from trade/src/server.ts')
    const helper = source.slice(at, at + 900)
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
    const at = source.indexOf('function idempotencyKeyOf(')
    assert.ok(at > 0, 'idempotencyKeyOf is gone')
    const fn = source.slice(at, at + 500)
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
