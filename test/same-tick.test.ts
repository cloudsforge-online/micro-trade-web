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
import { AuthProvider } from '../src/lib/auth.tsx'
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
   * no response yet", mapped to a 409 `idempotency_in_flight` at `trade/src/server.ts:271-273`.
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
            'allocation (trade/src/server.ts:591) — the customer gets a duplicate bot on their ' +
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
            'twice (trade/src/server.ts:522-527) and the customer gets two status pages for one ' +
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
