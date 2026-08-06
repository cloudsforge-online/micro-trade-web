/**
 * TWO EVENTS IN ONE TICK, on the three controls in this bundle that commit something.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS ALONGSIDE `journeys.test.ts`, WHICH ALREADY HAS "DOUBLE-SUBMIT" SCENARIOS
 *
 * It exists because those scenarios do not test this. Every one of them separates the two presses
 * with `await s.settle(0)`:
 *
 *     s.clickNoFlush(commit)
 *     await s.settle(0)      // ← React renders HERE
 *     s.clickNoFlush(commit)
 *
 * `settle` is `act(async () => …)`, so React commits between the presses: `busy` is now `true` in
 * the new render closure and the `disabled` attribute is now on the DOM node. The second press is
 * refused by a guard that has already had a render to take effect in. That is a real scenario — a
 * human double-click is usually milliseconds apart — but it is the EASY half, and passing it says
 * nothing about the hard half.
 *
 * The hard half is two events dispatched with NO scheduling boundary between them: a trackpad
 * double-tap coalesced into one task, a synthetic re-dispatch, a wrapper that fires the handler
 * twice, an Enter key arriving on a form while the click is still being delivered. React batches
 * those: neither handler has been re-rendered, so BOTH read `busy === false` out of the render
 * closure they were created in, and BOTH proceed. `disabled={busy}` does not help either — the
 * attribute is not on the node until the commit, and there has been no commit.
 *
 * So each scenario below fires the two events with nothing awaited between them. Before the fix in
 * `src/lib/mutation.ts` every one of them sent TWO requests.
 *
 * ── And each is run twice, because the harness is not the app ─────────────────────────────────
 *
 * `src/main.tsx` mounts under `<StrictMode>`; `test/dom.ts` mounts without it. A latch held in a
 * ref is exactly the kind of thing StrictMode's double-invocation can change, so a proof that only
 * ran one way would be proving the guard in the mode the customer is not in. `strict: true` is the
 * option added to `MountOptions` for that, and `both()` below runs every scenario each way.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement as h, type ReactElement } from 'react'
import { MemoryRouter, Route, Routes as RouterRoutes } from 'react-router-dom'

import { withScreen, type Routes, type Screen } from './dom.ts'
import * as fx from './fixtures.ts'
import { ApiError } from '../src/lib/api.ts'
import { AuthProvider } from '../src/lib/auth.tsx'
import { useIdempotentMutation, useMutation } from '../src/lib/mutation.ts'
import { BotPage } from '../src/pages/bot.tsx'
import { NewBacktestPage } from '../src/pages/new-backtest.tsx'
import { NewBotPage } from '../src/pages/new-bot.tsx'

const ORIGIN = 'https://trade.cloudsforge.online'

const page = (element: ReactElement, path: string): ReactElement =>
  h(MemoryRouter, { initialEntries: [path] }, h(AuthProvider, null, element) as ReactElement)

const atRoute = (pattern: string, element: ReactElement, path: string): ReactElement =>
  h(
    MemoryRouter,
    { initialEntries: [path] },
    h(AuthProvider, null, h(RouterRoutes, null, h(Route, { path: pattern, element }))) as ReactElement,
  )

const signedIn = (routes: Routes): Routes => ({ 'GET /auth/me': { body: fx.ME }, ...routes })

const CATALOGUE: Routes = {
  'GET /v1/strategies': { body: { strategies: [fx.strategy()] } },
  'GET /v1/capabilities': { body: { liveTrading: true } },
  'GET /v1/series': {
    body: { series: [{ id: fx.SERIES_ID, symbol: 'CFG-USD', timeframe: '1h', bars: 5000 }] },
  },
}

/**
 * Run one scenario twice: as the harness mounts by default, and as `src/main.tsx` mounts.
 *
 * The name carries which run it was, so a failure report names the mode rather than leaving the
 * reader to guess which of the two identical-looking tests went red.
 */
function both(what: string, body: (strict: boolean) => Promise<void>): void {
  for (const strict of [false, true]) {
    it(`${what} — ${strict ? 'under <StrictMode>, as main.tsx mounts it' : 'plain'}`, () =>
      body(strict))
  }
}

/**
 * Fill the two selects and any empty required field, and hand back the commit control.
 *
 * Both forms `return` early without a strategy and a series (`src/pages/new-bot.tsx:86`,
 * `src/pages/new-backtest.tsx:86`), and a browser will not submit a form that fails constraint
 * validation. A scenario that skipped this would press the button, send nothing, and assert "one
 * request" against a form that sent none — the quietest way for a double-submit test to pass.
 */
async function arm(s: Screen, name: RegExp): Promise<Element> {
  for (const select of s.allByRole('combobox')) {
    const first = [...select.querySelectorAll('option')].find(
      (o) => (o.getAttribute('value') ?? '') !== '',
    )
    if (first) await s.type(select, first.getAttribute('value') ?? '')
  }
  for (const field of s.allByRole('textbox')) {
    if (!field.hasAttribute('required')) continue
    if (((field as unknown as { value: string }).value ?? '') !== '') continue
    await s.type(field, 'Journey')
  }
  const commit = s.allByRole('button').find((el) => name.test(s.textOf(el)))
  assert.ok(commit, `no commit control matching ${String(name)}`)
  return commit
}

/** The two events, with NOTHING awaited between them. This is the whole point of the file. */
function twiceInOneTick(s: Screen, el: Element): void {
  s.clickNoFlush(el)
  s.clickNoFlush(el)
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   1. Starting a bot — the one that reserves capital at the ledger
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('two events in one tick: starting a bot', () => {
  const ACTIONS = `POST /v1/bots/${fx.BOT_ID}/actions`

  const botRoutes = (over: Routes = {}): Routes =>
    signedIn({
      [`GET /v1/bots/${fx.BOT_ID}/settlements`]: { body: { settlements: [] } },
      [`GET /v1/bots/${fx.BOT_ID}/fills`]: { body: { fills: [] } },
      [`GET /v1/bots/${fx.BOT_ID}`]: { body: { bot: fx.bot({ status: 'paused', mode: 'live' }) } },
      ...over,
    })

  both('two Start events in one tick send ONE action', async (strict) => {
    await withScreen(
      atRoute('/bots/:id', h(BotPage), `/bots/${fx.BOT_ID}`),
      {
        url: `${ORIGIN}/bots/${fx.BOT_ID}`,
        storage: fx.SIGNED_IN,
        strict,
        routes: botRoutes({
          [ACTIONS]: { status: 200, body: { bot: fx.bot({ status: 'running' }) }, delayMs: 15 },
        }),
      },
      async (s) => {
        await s.settle(20)
        twiceInOneTick(s, s.byRole('button', 'Start'))
        await s.settle(60)
        assert.equal(
          s.api.matching(ACTIONS).length,
          1,
          'two Start events in one tick sent two start actions, and starting a live bot reserves ' +
            'its whole allocation at the ledger before the status changes ' +
            '(trade/src/bots.ts:566-579) — this is a second hold placed on a real balance',
        )
      },
    )
  })

  /**
   * The same two events against the answer the real service gives a self-inflicted duplicate.
   *
   * `trade/src/idempotency.ts:150` raises `IdempotencyInFlightError` for "same key, claim exists,
   * no response yet", mapped to a 409 `idempotency_in_flight` at `trade/src/server.ts:278-280`.
   * The key IS held in a ref, so both same-tick requests carried the SAME key and the second one
   * got that 409 — `keepKeyAfter` returns true for it, `setError` fires, and whichever promise
   * settled last won. The customer's bot started, and the screen said it had not.
   *
   * With the latch there is no second request, so there is no 409 to render. Both halves are
   * asserted: the count, and the absence of the lie.
   */
  both('a bot that started is not reported as failed', async (strict) => {
    await withScreen(
      atRoute('/bots/:id', h(BotPage), `/bots/${fx.BOT_ID}`),
      {
        url: `${ORIGIN}/bots/${fx.BOT_ID}`,
        storage: fx.SIGNED_IN,
        strict,
        routes: botRoutes({
          [ACTIONS]: (_wire, n) =>
            n === 1
              ? { status: 200, body: { bot: fx.bot({ status: 'running' }) }, delayMs: 30 }
              : {
                  status: 409,
                  body: fx.error(
                    'idempotency_in_flight',
                    'that request is still being processed; retry with the same key',
                  ),
                  requestId: 'req-in-flight',
                },
        }),
      },
      async (s) => {
        await s.settle(20)
        twiceInOneTick(s, s.byRole('button', 'Start'))
        await s.settle(80)
        assert.equal(s.api.matching(ACTIONS).length, 1, 'a second request raced the first')
        const alert = s.document.querySelector('[role="alert"]')
        assert.equal(
          alert === null ? '' : s.textOf(alert),
          '',
          'the bot started and the screen reported a failure: the second of two same-tick ' +
            'requests carried the same key, collected the 409 idempotency_in_flight the service ' +
            'raises for it, and settled last — so the component told the customer their capital ' +
            'had not been committed when it had',
        )
      },
    )
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   2. Creating a bot — a bot with an allocation on it
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('two events in one tick: creating a bot', () => {
  both('two submit events in one tick create ONE bot', async (strict) => {
    await withScreen(
      page(h(NewBotPage), '/bots/new'),
      {
        url: `${ORIGIN}/bots/new`,
        storage: fx.SIGNED_IN,
        strict,
        routes: signedIn({
          ...CATALOGUE,
          'POST /v1/bots': { status: 201, body: { botId: fx.BOT_ID }, delayMs: 15 },
        }),
      },
      async (s) => {
        await s.settle(20)
        twiceInOneTick(s, await arm(s, /create|make/i))
        await s.settle(60)
        assert.equal(
          s.api.matching('POST /v1/bots').length,
          1,
          'two submit events in one tick posted two bot creations, and each carries an ' +
            'allocation (trade/src/server.ts:598) — the customer gets a duplicate bot on their ' +
            'list committing the same capital twice the moment either one is started',
        )
      },
    )
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   3. Queuing a backtest — no money, but a job and a bill for the compute
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('two events in one tick: queuing a backtest', () => {
  both('two submit events in one tick queue ONE run', async (strict) => {
    await withScreen(
      page(h(NewBacktestPage), '/backtests/new'),
      {
        url: `${ORIGIN}/backtests/new`,
        storage: fx.SIGNED_IN,
        strict,
        routes: signedIn({
          ...CATALOGUE,
          'POST /v1/backtests': {
            status: 202,
            body: { backtestId: fx.BACKTEST_ID, status: 'queued' },
            delayMs: 15,
          },
        }),
      },
      async (s) => {
        await s.settle(20)
        twiceInOneTick(s, await arm(s, /queue|run|start/i))
        await s.settle(60)
        assert.equal(
          s.api.matching('POST /v1/backtests').length,
          1,
          'two submit events in one tick queued two runs, so the same simulation is computed ' +
            'twice (trade/src/server.ts:529-534) and the customer gets two status pages for one ' +
            'question',
        )
      },
    )
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   4. The affordance is still an affordance
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the visible state survives the latch', () => {
  /**
   * The ref is the correctness guarantee; `busy` is the UI. Losing the second while fixing the
   * first would leave a control that silently swallows presses with no sign it is working, which
   * is its own defect — so the disabled state is asserted here rather than assumed.
   */
  both('the controls are still disabled while an action is in flight', async (strict) => {
    await withScreen(
      atRoute('/bots/:id', h(BotPage), `/bots/${fx.BOT_ID}`),
      {
        url: `${ORIGIN}/bots/${fx.BOT_ID}`,
        storage: fx.SIGNED_IN,
        strict,
        routes: signedIn({
          [`GET /v1/bots/${fx.BOT_ID}/settlements`]: { body: { settlements: [] } },
          [`GET /v1/bots/${fx.BOT_ID}/fills`]: { body: { fills: [] } },
          [`GET /v1/bots/${fx.BOT_ID}`]: { body: { bot: fx.bot({ status: 'paused' }) } },
          [`POST /v1/bots/${fx.BOT_ID}/actions`]: {
            status: 200,
            body: { bot: fx.bot({ status: 'running' }) },
            delayMs: 40,
          },
        }),
      },
      async (s) => {
        await s.settle(20)
        s.clickNoFlush(s.byRole('button', 'Start'))
        await s.settle(0)
        for (const name of ['Start', 'Pause', 'Stop']) {
          const button = s.queryByRole('button', name)
          if (button) assert.ok(button.hasAttribute('disabled'), `${name} stayed live mid-action`)
        }
        await s.settle(80)
      },
    )
  })

  /**
   * And the latch RELEASES. A latch taken and never given back turns a single failed attempt into
   * a control that is dead for the life of the page — the customer's only remedy a reload, on a
   * screen whose whole subject is money they have committed. The release is in a `finally` for
   * that reason, and this is the test that holds it there.
   */
  both('a failed action can be retried', async (strict) => {
    const ACTIONS = `POST /v1/bots/${fx.BOT_ID}/actions`
    await withScreen(
      atRoute('/bots/:id', h(BotPage), `/bots/${fx.BOT_ID}`),
      {
        url: `${ORIGIN}/bots/${fx.BOT_ID}`,
        storage: fx.SIGNED_IN,
        strict,
        routes: signedIn({
          [`GET /v1/bots/${fx.BOT_ID}/settlements`]: { body: { settlements: [] } },
          [`GET /v1/bots/${fx.BOT_ID}/fills`]: { body: { fills: [] } },
          [`GET /v1/bots/${fx.BOT_ID}`]: { body: { bot: fx.bot({ status: 'paused' }) } },
          [ACTIONS]: (_wire, n) =>
            n === 1
              ? { status: 503, body: fx.error('ledger_unavailable', 'the ledger is unreachable') }
              : { status: 200, body: { bot: fx.bot({ status: 'running' }) } },
        }),
      },
      async (s) => {
        await s.settle(20)
        await s.click(s.byRole('button', 'Start'))
        await s.settle(30)
        assert.match(s.text(), /unreachable/i, 'the failure was not reported at all')
        await s.click(s.byRole('button', 'Start'))
        await s.settle(30)
        const sent = s.api.matching(ACTIONS)
        assert.equal(sent.length, 2, 'the control was dead after one failure — the latch never released')
        // And the retry is a REPLAY, not a repeat: a 503 leaves the outcome unknown, so
        // `keepKeyAfter` keeps the key (`src/lib/idempotency.ts:94-98`) and the service can
        // recognise the second attempt as the same intent rather than committing capital twice.
        assert.equal(
          sent[0]?.headers['idempotency-key'],
          sent[1]?.headers['idempotency-key'],
          'the retry after an UNKNOWN outcome minted a new key, which is how a reservation ' +
            'gets placed twice',
        )
      },
    )
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   5. The hooks themselves, directly
   ══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * `useMutation` has NO CALLER in this bundle — every write goes through `useIdempotentMutation`,
 * because trade requires an `Idempotency-Key` on all three of them. So every scenario above
 * exercises the idempotent hook and none of them touches the plain one, and a fix to it would be
 * unfalsifiable: the source could be reverted to the state guard and the whole suite would stay
 * green.
 *
 * It is exported, and the next write added to this app will reach for it. A guard nothing proves
 * is a guard that will be quietly broken. These probes are how the plain hook is held to the same
 * bar as the one the pages use.
 *
 * They render a real component through the real harness — the hook is only meaningful inside
 * React's render and event machinery, and a probe that called `run()` on its own would be
 * asserting a promise rather than a control.
 */
const FILLER =
  'A probe component, mounted so the hook under test runs inside React rather than beside it.'

function PlainProbe({ fn }: { fn: () => Promise<string> }): ReactElement {
  const m = useMutation(fn, 'The probe failed.')
  return h(
    'section',
    null,
    h('p', null, FILLER),
    h('button', { type: 'button', disabled: m.busy, onClick: () => void m.run() }, 'Commit'),
    h('p', null, m.busy ? 'working' : 'idle'),
    m.error ? h('p', { role: 'alert' }, m.error.message) : null,
    m.result ? h('p', null, `result: ${m.result}`) : null,
  )
}

function KeyedProbe({ fn }: { fn: (key: string) => Promise<string> }): ReactElement {
  const m = useIdempotentMutation(fn, 'The probe failed.')
  return h(
    'section',
    null,
    h('p', null, FILLER),
    h('button', { type: 'button', disabled: m.busy, onClick: () => void m.run() }, 'Commit'),
    h('p', null, m.busy ? 'working' : 'idle'),
    m.error ? h('p', { role: 'alert' }, m.error.message) : null,
    m.result ? h('p', null, `result: ${m.result}`) : null,
  )
}

/** A `fn` that records every call and resolves after `delay`, so overlap is observable. */
function recorder(delay: number, outcome: (n: number) => 'ok' | Error) {
  const calls: string[] = []
  return {
    calls,
    fn: async (key?: string): Promise<string> => {
      calls.push(key ?? `call-${calls.length + 1}`)
      const n = calls.length
      await new Promise((r) => setTimeout(r, delay))
      const verdict = outcome(n)
      if (verdict instanceof Error) throw verdict
      return `done-${n}`
    },
  }
}

describe('useMutation, which no page calls yet', () => {
  both('two presses in one tick run the write ONCE', async (strict) => {
    const rec = recorder(20, () => 'ok')
    await withScreen(
      h(PlainProbe, { fn: () => rec.fn() }),
      { strict },
      async (s) => {
        twiceInOneTick(s, s.byRole('button', 'Commit'))
        await s.settle(60)
        assert.equal(
          rec.calls.length,
          1,
          'the plain hook let two same-tick presses through — it is the primitive the next write ' +
            'in this app will be built on, and it would carry this defect into it',
        )
        assert.match(s.text(), /result: done-1/, 'the one run did not report its result')
      },
    )
  })

  both('the latch is released after a failure, so the control still works', async (strict) => {
    const rec = recorder(5, (n) => (n === 1 ? new Error('the write blew up') : 'ok'))
    await withScreen(
      h(PlainProbe, { fn: () => rec.fn() }),
      { strict },
      async (s) => {
        await s.click(s.byRole('button', 'Commit'))
        await s.settle(30)
        assert.equal(s.textOf(s.document.querySelector('[role="alert"]')), 'The probe failed.')
        await s.click(s.byRole('button', 'Commit'))
        await s.settle(30)
        assert.equal(rec.calls.length, 2, 'one failure left the control dead for the life of the page')
      },
    )
  })

  both('the busy affordance is still rendered while the write is in flight', async (strict) => {
    const rec = recorder(40, () => 'ok')
    await withScreen(
      h(PlainProbe, { fn: () => rec.fn() }),
      { strict },
      async (s) => {
        s.clickNoFlush(s.byRole('button', 'Commit'))
        await s.settle(0)
        assert.match(s.text(), /working/, 'nothing on screen said the write was running')
        assert.ok(
          s.byRole('button', 'Commit').hasAttribute('disabled'),
          'the control stayed live mid-write: the ref is the guarantee, but a control that ' +
            'swallows presses with no sign it is working is its own defect',
        )
        await s.settle(80)
        assert.match(s.text(), /idle/, 'the busy state never cleared')
      },
    )
  })
})

describe('useIdempotentMutation, directly', () => {
  both('two presses in one tick run the write ONCE, under one key', async (strict) => {
    const rec = recorder(20, () => 'ok')
    await withScreen(
      h(KeyedProbe, { fn: (key: string) => rec.fn(key) }),
      { strict },
      async (s) => {
        twiceInOneTick(s, s.byRole('button', 'Commit'))
        await s.settle(60)
        assert.equal(rec.calls.length, 1, 'two same-tick presses ran the write twice')
        assert.match(String(rec.calls[0]), /^cf-trade-web-/, 'no idempotency key was minted')
      },
    )
  })

  both('an UNKNOWN outcome keeps the key and a KNOWN one drops it', async (strict) => {
    // 503 → unknown → replay under the same key. Then success → the intent is settled, so a
    // third press is a NEW intent and must not collide with the old fingerprint
    // (`trade/src/idempotency.ts:151`).
    // `keepKeyAfter` branches on `instanceof ApiError` (`src/lib/idempotency.ts:95`), so the probe
    // throws the real class rather than a look-alike.
    const keys: string[] = []
    await withScreen(
      h(KeyedProbe, {
        fn: async (key: string) => {
          keys.push(key)
          const n = keys.length
          await new Promise((r) => setTimeout(r, 5))
          if (n === 1) throw new ApiError(503, 'the ledger is unreachable', 'internal')
          return `done-${n}`
        },
      }),
      { strict },
      async (s) => {
        await s.click(s.byRole('button', 'Commit'))
        await s.settle(30)
        await s.click(s.byRole('button', 'Commit'))
        await s.settle(30)
        await s.click(s.byRole('button', 'Commit'))
        await s.settle(30)
        assert.equal(keys.length, 3, 'the control stopped working')
        assert.equal(
          keys[0],
          keys[1],
          'a 503 leaves the outcome UNKNOWN, and the retry minted a new key — which is how a ' +
            'ledger reservation gets placed twice',
        )
        assert.notEqual(
          keys[1],
          keys[2],
          'the intent settled and the key was reused, so the next attempt with an edited payload ' +
            'is a 409 idempotency_key_reuse the customer cannot act on',
        )
      },
    )
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   6. The harness option itself
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the strict option really mounts under StrictMode', () => {
  /**
   * Without this, `strict: true` could quietly become a no-op and every "under StrictMode" run
   * above would be a duplicate of its plain twin, passing for the wrong reason. StrictMode's
   * defining behaviour is that it renders each component twice; that is what is asserted.
   */
  it('double-invokes render, and the default mount does not', async () => {
    for (const [strict, expected] of [
      [false, 1],
      [true, 2],
    ] as const) {
      let renders = 0
      const Counter = (): ReactElement => {
        renders += 1
        return h('p', null, FILLER)
      }
      await withScreen(h(Counter), { strict }, async () => {
        assert.equal(
          renders,
          expected,
          `strict: ${strict} rendered ${renders} time(s) — the option is not doing what the ` +
            `scenarios above rely on it for`,
        )
      })
    }
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   7. What mutation testing found unguarded

   Each test below was written because a deliberate break of the production source left the suite
   GREEN. They are not extra coverage for its own sake: every one names a defect that could have
   been introduced without a single test noticing.
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('a KNOWN refusal drops the key', () => {
  /**
   * `keepKeyAfter` returning true for everything survived every test in this repository.
   *
   * A 422 is a DECISION: nothing was committed, and the customer's next act is to change a field.
   * Presenting the old key with the edited body is a 409 `idempotency_key_reuse`
   * (`trade/src/idempotency.ts:151`) that has nothing to do with the change they made — an error
   * they cannot act on, on a form they have just corrected.
   */
  both('after a refusal the next attempt is a NEW intent', async (strict) => {
    const keys: string[] = []
    await withScreen(
      h(KeyedProbe, {
        fn: async (key: string) => {
          keys.push(key)
          const n = keys.length
          await new Promise((r) => setTimeout(r, 5))
          if (n === 1) throw new ApiError(422, 'that allocation is below the minimum', 'invalid_argument')
          return `done-${n}`
        },
      }),
      { strict },
      async (s) => {
        await s.click(s.byRole('button', 'Commit'))
        await s.settle(30)
        await s.click(s.byRole('button', 'Commit'))
        await s.settle(30)
        assert.equal(keys.length, 2, 'the control stopped working after a refusal')
        assert.notEqual(
          keys[0],
          keys[1],
          'a refusal is a KNOWN outcome and its key must be thrown away — keeping it means the ' +
            'customer who fixes the field gets a 409 idempotency_key_reuse about the fix',
        )
      },
    )
  })
})

describe('every commit control shows it is working', () => {
  /**
   * Dropping `disabled` from the create and queue buttons, and from Pause, left the suite green:
   * nothing asserted the form buttons were ever disabled, and Pause was only ever tested on a bot
   * where `!canPause` disabled it anyway — so the `busy ||` half was doing nothing observable.
   */
  both('the create button is disabled and says so mid-flight', async (strict) => {
    await withScreen(
      page(h(NewBotPage), '/bots/new'),
      {
        url: `${ORIGIN}/bots/new`,
        storage: fx.SIGNED_IN,
        strict,
        routes: signedIn({
          ...CATALOGUE,
          'POST /v1/bots': { status: 201, body: { botId: fx.BOT_ID }, delayMs: 40 },
        }),
      },
      async (s) => {
        await s.settle(20)
        s.clickNoFlush(await arm(s, /create|make/i))
        await s.settle(0)
        const button = s.byRole('button', 'Creating')
        assert.ok(button.hasAttribute('disabled'), 'the create button stayed live mid-create')
        await s.settle(80)
      },
    )
  })

  both('the queue button is disabled and says so mid-flight', async (strict) => {
    await withScreen(
      page(h(NewBacktestPage), '/backtests/new'),
      {
        url: `${ORIGIN}/backtests/new`,
        storage: fx.SIGNED_IN,
        strict,
        routes: signedIn({
          ...CATALOGUE,
          'POST /v1/backtests': {
            status: 202,
            body: { backtestId: fx.BACKTEST_ID, status: 'queued' },
            delayMs: 40,
          },
        }),
      },
      async (s) => {
        await s.settle(20)
        s.clickNoFlush(await arm(s, /queue|run|start/i))
        await s.settle(0)
        const button = s.byRole('button', 'Queueing')
        assert.ok(button.hasAttribute('disabled'), 'the queue button stayed live mid-queue')
        await s.settle(80)
      },
    )
  })

  /**
   * Pause, on a RUNNING bot — the only state in which `canPause` is true, and therefore the only
   * state in which the `busy ||` half of its `disabled` is the thing doing the work. Every
   * existing scenario used a paused bot, where Pause is disabled for the other reason.
   */
  both('Pause is disabled while a pause is in flight', async (strict) => {
    await withScreen(
      atRoute('/bots/:id', h(BotPage), `/bots/${fx.BOT_ID}`),
      {
        url: `${ORIGIN}/bots/${fx.BOT_ID}`,
        storage: fx.SIGNED_IN,
        strict,
        routes: signedIn({
          [`GET /v1/bots/${fx.BOT_ID}/settlements`]: { body: { settlements: [] } },
          [`GET /v1/bots/${fx.BOT_ID}/fills`]: { body: { fills: [] } },
          [`GET /v1/bots/${fx.BOT_ID}`]: { body: { bot: fx.bot({ status: 'running' }) } },
          [`POST /v1/bots/${fx.BOT_ID}/actions`]: {
            status: 200,
            body: { bot: fx.bot({ status: 'paused' }) },
            delayMs: 40,
          },
        }),
      },
      async (s) => {
        const pause = s.byRole('button', 'Pause')
        assert.ok(!pause.hasAttribute('disabled'), 'a running bot cannot be paused — wrong fixture')
        s.clickNoFlush(pause)
        await s.settle(0)
        assert.ok(
          s.byRole('button', 'Pause').hasAttribute('disabled'),
          'Pause stayed live while a pause was in flight',
        )
        await s.settle(80)
      },
    )
  })
})

describe('editing the form after an UNKNOWN outcome starts a new intent', () => {
  /**
   * Removing `submit.reset()` from the allocation field left the suite green.
   *
   * It matters in exactly one sequence, and it is not a rare one: the attempt ends UNKNOWN (a 503
   * from the ledger), so the key is deliberately KEPT for a replay — and then the customer, seeing
   * an error, changes the allocation and presses again. Same key, different body, and the service
   * answers 409 `idempotency_key_reuse` (`trade/src/idempotency.ts:151`) rather than doing what
   * they asked. `reset()` is what makes the edit a new intent.
   */
  both('changing the allocation after a 503 mints a new key', async (strict) => {
    await withScreen(
      page(h(NewBotPage), '/bots/new'),
      {
        url: `${ORIGIN}/bots/new`,
        storage: fx.SIGNED_IN,
        strict,
        routes: signedIn({
          ...CATALOGUE,
          'POST /v1/bots': (_wire, n) =>
            n === 1
              ? { status: 503, body: fx.error('ledger_unavailable', 'the ledger is unreachable') }
              : { status: 201, body: { botId: fx.BOT_ID } },
        }),
      },
      async (s) => {
        await s.settle(20)
        const commit = await arm(s, /create|make/i)
        await s.click(commit)
        await s.settle(30)
        assert.match(s.text(), /unreachable/i, 'the 503 was not reported')

        const allocation = s
          .allByRole('textbox')
          .find((el) => (el as unknown as { value: string }).value === '100000')
        assert.ok(allocation, 'the allocation field is not where this test thinks it is')
        await s.type(allocation, '250000')
        await s.click(s.allByRole('button').find((el) => /create|make/i.test(s.textOf(el))) as Element)
        await s.settle(30)

        const posted = s.api.matching('POST /v1/bots')
        assert.equal(posted.length, 2, 'the second attempt was never sent')
        assert.equal(posted[1]?.json && (posted[1].json as { allocation: string }).allocation, '250000')
        assert.notEqual(
          posted[0]?.headers['idempotency-key'],
          posted[1]?.headers['idempotency-key'],
          'the edited payload went out under the key held for the ORIGINAL one, which the service ' +
            'answers 409 idempotency_key_reuse — an error about the customer’s own correction',
        )
      },
    )
  })
})

describe('the bot page re-reads exactly when the action changed something', () => {
  const READ = `GET /v1/bots/${fx.BOT_ID}`
  const routes = (action: Routes[string]): Routes =>
    signedIn({
      [`GET /v1/bots/${fx.BOT_ID}/settlements`]: { body: { settlements: [] } },
      [`GET /v1/bots/${fx.BOT_ID}/fills`]: { body: { fills: [] } },
      [READ]: { body: { bot: fx.bot({ status: 'paused' }) } },
      [`POST /v1/bots/${fx.BOT_ID}/actions`]: action,
    })

  /** `if (done)` — deleting the condition left the suite green. */
  both('a REFUSED action does not re-read the bot', async (strict) => {
    await withScreen(
      atRoute('/bots/:id', h(BotPage), `/bots/${fx.BOT_ID}`),
      {
        url: `${ORIGIN}/bots/${fx.BOT_ID}`,
        storage: fx.SIGNED_IN,
        strict,
        routes: routes({
          status: 409,
          body: fx.error('bot_state', 'this bot cannot start from that state'),
        }),
      },
      async (s) => {
        await s.settle(20)
        const before = s.api.matching(READ).length
        await s.click(s.byRole('button', 'Start'))
        await s.settle(40)
        assert.equal(
          s.api.matching(READ).length,
          before,
          'a refusal changed nothing, and the page re-read the bot anyway — three requests to be ' +
            'told the same thing, against a service that just declined',
        )
      },
    )
  })

  /** And the other half of the same condition: `if (false)` also left the suite green. */
  both('a SUCCESSFUL action re-reads the bot and shows the new state', async (strict) => {
    await withScreen(
      atRoute('/bots/:id', h(BotPage), `/bots/${fx.BOT_ID}`),
      {
        url: `${ORIGIN}/bots/${fx.BOT_ID}`,
        storage: fx.SIGNED_IN,
        strict,
        routes: signedIn({
          [`GET /v1/bots/${fx.BOT_ID}/settlements`]: { body: { settlements: [] } },
          [`GET /v1/bots/${fx.BOT_ID}/fills`]: { body: { fills: [] } },
          [READ]: (_wire, n) => ({
            body: { bot: fx.bot({ status: n <= (strict ? 2 : 1) ? 'paused' : 'running' }) },
          }),
          [`POST /v1/bots/${fx.BOT_ID}/actions`]: {
            status: 200,
            body: { bot: fx.bot({ status: 'running' }) },
          },
        }),
      },
      async (s) => {
        await s.settle(20)
        assert.match(s.text(), /PAUSED/, 'the fixture did not start paused')
        const before = s.api.matching(READ).length
        await s.click(s.byRole('button', 'Start'))
        await s.settle(40)
        assert.ok(
          s.api.matching(READ).length > before,
          'the bot started and the page never re-read it, so the badge still says PAUSED for a ' +
            'bot that is running and holding a ledger reservation',
        )
        assert.match(s.text(), /RUNNING/, 'the new state never reached the screen')
      },
    )
  })
})
