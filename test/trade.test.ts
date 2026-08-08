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
    assert.ok(
      service.registrations.length >= 14,
      `expected trade's route list, found ${service.registrations.length} registrations`,
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
    `    define('POST', '/v1/hooks', async (ctx, deps) => {`,
    `      if (!verifyEventSignature(raw, deps.eventAcceptSecrets, presented)) {`,
    `        return errorReply(403, 'bad_signature', ctx.requestId)`,
    `      }`,
    `      return { status: 202, body: { marker: 'LAST_HANDLER' } }`,
    `    }),`,
    `  ]`,
    `}`,
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
      ['GET /v1/first', 'POST /v1/second', 'POST /v1/hooks'],
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
