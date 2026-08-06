/**
 * The browser journeys of `docs/ecosystem/22-browser-journeys.md`, tiers 1 and 2, for this surface.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE ONE RULE. Doc 22 §3: **a browser scenario may never assert a business rule.**
 *
 * A game client once withheld four SKUs from its UI while the payment routes stayed live and
 * chargeable (14 §11); a client-side test of the hidden catalogue would have passed, green,
 * against the defect. So every scenario below asserts one of exactly three things (§3.1): what a
 * human can see relative to what the API returned in the SAME run, what the client SENT, or where
 * the browser ended up.
 *
 * ── The pair this surface turns on ─────────────────────────────────────────────────────────────
 *
 * BJ-TRD-08 and BJ-TRD-09 are the same shape and opposite answers, which is why doc 22 gates both:
 *
 *   A STOPPED bot has NO start button, because stop is terminal and `startBot` refuses it
 *   outright. A button that can only 409 teaches a customer that the product is unreliable.
 *
 *   A LIVE bot under a kill switch DOES get the button, and the 409 is rendered in full — because
 *   hiding it would remove a feature nobody could file a bug against, and the switch is an
 *   operator's temporary act rather than a property of the bot.
 *
 * Neither asserts the refusal. Both assert what the reader is shown; the refusals are
 * `trade/src/bots.ts`'s tests and are cited in `ownedBy`.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { createElement as h, type ReactElement } from 'react'
import { MemoryRouter, Route, Routes as RouterRoutes } from 'react-router-dom'

import { withScreen, type Routes, type Screen } from './dom.ts'
import * as fx from './fixtures.ts'
import { DOC22_IDS, SCENARIOS } from './journeys.ts'
import { App } from '../src/app.tsx'
import { AuthProvider } from '../src/lib/auth.tsx'
import { ROUTES } from '../src/lib/routes.ts'
import { BacktestPage } from '../src/pages/backtest.tsx'
import { BotPage } from '../src/pages/bot.tsx'
import { BotsPage } from '../src/pages/bots.tsx'
import { NewBacktestPage } from '../src/pages/new-backtest.tsx'
import { NewBotPage } from '../src/pages/new-bot.tsx'
import { StrategiesPage } from '../src/pages/strategies.tsx'

const ORIGIN = 'https://trade.cloudsforge.online'
const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))

const page = (element: ReactElement, path: string): ReactElement =>
  h(MemoryRouter, { initialEntries: [path] }, h(AuthProvider, null, element) as ReactElement)

const atRoute = (pattern: string, element: ReactElement, path: string): ReactElement =>
  h(
    MemoryRouter,
    { initialEntries: [path] },
    h(AuthProvider, null, h(RouterRoutes, null, h(Route, { path: pattern, element }))) as ReactElement,
  )

const signedIn = (routes: Routes): Routes => ({ 'GET /auth/me': { body: fx.ME }, ...routes })

const botAt = (path = `/bots/${fx.BOT_ID}`) => atRoute('/bots/:id', h(BotPage), path)

const botRoutes = (over: Routes = {}): Routes =>
  signedIn({
    [`GET /v1/bots/${fx.BOT_ID}/settlements`]: { body: { settlements: [] } },
    [`GET /v1/bots/${fx.BOT_ID}/fills`]: { body: { fills: [] } },
    [`GET /v1/bots/${fx.BOT_ID}`]: { body: { bot: fx.bot() } },
    ...over,
  })

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   6.6 Group F — Forge Trade
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('BJ-TRD — Forge Trade', () => {
  it('BJ-TRD-01 T2: the strategy catalogue renders anonymously, with no credential', async () => {
    const strategies = [
      fx.strategy({ id: 'sma_cross', name: 'Moving-average cross' }),
      fx.strategy({ id: 'rsi_reversion', name: 'RSI reversion', family: 'mean_reversion' }),
    ]
    await withScreen(
      page(h(StrategiesPage), '/'),
      { url: `${ORIGIN}/`, routes: { 'GET /v1/strategies': { body: { strategies } } } },
      async (s) => {
        for (const st of strategies) assert.ok(s.text().includes(st.name), `${st.name} has no row`)
        // `GET /v1/strategies` makes no `authenticate()` call, and a product's front page is where
        // a signed-out visitor arrives.
        for (const w of s.api.wire) {
          assert.equal(w.headers.authorization, undefined, `${w.path} carried a credential`)
        }
        assert.doesNotMatch(s.text(), /sign in to (see|read|view)/i, 'a public catalogue asks for a session')
        // Every strategy carries its weakness. A catalogue of rules with no downside stated is a
        // sales page.
        for (const st of strategies) assert.ok(s.text().includes(st.weakness), `${st.id} hides its weakness`)
        s.clean('BJ-TRD-01')
      },
    )
  })

  it('BJ-TRD-02 ★ T1: queuing a backtest goes to the status page, which says it has not run', async () => {
    await withScreen(
      h(App),
      {
        url: `${ORIGIN}/backtests/new`,
        storage: fx.SIGNED_IN,
        routes: signedIn({
          'GET /v1/strategies': { body: { strategies: [fx.strategy()] } },
          'GET /v1/capabilities': { body: { liveTrading: true } },
          'GET /v1/series': { body: { series: [{ id: fx.SERIES_ID, symbol: 'CFG-USD', timeframe: '1h', bars: 5000 }] } },
          'POST /v1/backtests': { status: 202, body: { backtestId: fx.BACKTEST_ID, status: 'queued' } },
          [`GET /v1/backtests/${fx.BACKTEST_ID}/result`]: { body: { fills: [], equity: [] } },
          [`GET /v1/backtests/${fx.BACKTEST_ID}`]: {
            body: { backtest: backtest({ status: 'queued', metrics: null }) },
          },
        }),
      },
      async (s) => {
        await s.settle(30)
        const commit = await arm(s, /queue|run|start/i)
        await s.click(commit)
        await s.settle(60)
        // The service answers 202. The browser is sent to the status address, not shown a report.
        const posted = s.api.matching('POST /v1/backtests')
        assert.equal(posted.length, 1)
        // The browser moved to the status address, which is proved by what is now on screen
        // rather than by `location.pathname`: react-router owns the address and happy-dom's
        // history is not where it keeps it, so a pathname assertion would be asserting the
        // harness rather than the app.
        // `some`, not a count: `matching` is a prefix match and `/result` hangs off the same
        // address, so counting would be counting the wrong thing.
        assert.ok(
          s.api.wire.some((w) => w.path === `/v1/backtests/${fx.BACKTEST_ID}`),
          'the 202 did not send the browser to the status page',
        )
        // And the status page says the run has not happened. `POST /v1/backtests` answers 202; a
        // screen that showed a report here would be reporting numbers nothing has computed.
        assert.match(s.text(), /QUEUED/i)
        assert.match(s.text(), /nothing has been computed yet/i)
        assert.doesNotMatch(s.text(), /total return/i, 'a queued run rendered a report')
      },
    )
  })

  it('BJ-TRD-03 T1: a queued run shows no report, and a complete one does', async () => {
    const said = async (status: string, metrics: unknown): Promise<string> => {
      let captured = ''
      await withScreen(
        atRoute('/backtests/:id', h(BacktestPage), `/backtests/${fx.BACKTEST_ID}`),
        {
          url: `${ORIGIN}/backtests/${fx.BACKTEST_ID}`,
          storage: fx.SIGNED_IN,
          routes: signedIn({
            [`GET /v1/backtests/${fx.BACKTEST_ID}/result`]: { body: { fills: [], equity: [] } },
            [`GET /v1/backtests/${fx.BACKTEST_ID}`]: {
              body: { backtest: backtest({ status: status as never, metrics: metrics as never }) },
            },
          }),
        },
        async (s) => {
          await s.settle(30)
          captured = s.text()
        },
      )
      return captured
    }

    const queued = await said('queued', null)
    // Not a report, and not a blank page: the run has not happened and the page says so.
    assert.match(queued, /queued|has not run|not started|waiting/i)
    assert.doesNotMatch(queued, /total return/i, 'a queued run rendered a report')

    const done = await said('complete', metrics())
    assert.match(done, /total return/i, 'a completed run rendered no report')
  })

  it('BJ-TRD-04 T1: another customer’s backtest id is a not-found screen, not a permission error', async () => {
    await withScreen(
      atRoute('/backtests/:id', h(BacktestPage), `/backtests/${fx.BACKTEST_ID}`),
      {
        url: `${ORIGIN}/backtests/${fx.BACKTEST_ID}`,
        storage: fx.SIGNED_IN,
        routes: signedIn({
          [`GET /v1/backtests/${fx.BACKTEST_ID}`]: {
            status: 404,
            body: fx.error('not_found', 'no backtest with that id'),
            requestId: 'req-404-bt',
          },
        }),
      },
      async (s) => {
        await s.settle(20)
        // A 404 is the same answer as "no such run", so ids cannot be enumerated. The copy must
        // not claim to know which of the two it was. The rule is the service's and is cited in
        // ownedBy; this asserts the sentence.
        assert.doesNotMatch(
          s.text(),
          /you do not have access|permission|forbidden|not yours/i,
          'the page told a caller that a run exists but is not theirs, which is how ids get ' +
            'enumerated',
        )
        assert.match(s.text(), /no backtest|not found|does not exist/i)
      },
    )
  })

  it('BJ-TRD-05 T2: /backtests/new renders the form, not a detail view for an id called "new"', async () => {
    await withScreen(
      h(App),
      {
        url: `${ORIGIN}/backtests/new`,
        storage: fx.SIGNED_IN,
        routes: signedIn({
          'GET /v1/strategies': { body: { strategies: [fx.strategy()] } },
          'GET /v1/capabilities': { body: { liveTrading: true } },
          'GET /v1/series': { body: { series: [] } },
        }),
      },
      async (s) => {
        await s.settle(30)
        // Nothing was fetched for a backtest called "new".
        assert.deepEqual(
          s.api.matching('GET /v1/backtests/new').map((w) => w.path),
          [],
          'the router read `new` as an id and asked the service for it',
        )
        assert.ok(s.allByRole('textbox').length + s.allByRole('combobox').length > 0, 'no form rendered')
      },
    )
  })

  it('BJ-TRD-06 ★ T1: a bot is created as a draft, and the page says nothing is reserved yet', async () => {
    await withScreen(
      botAt(),
      { url: `${ORIGIN}/bots/${fx.BOT_ID}`, storage: fx.SIGNED_IN, routes: botRoutes() },
      async (s) => {
        await s.settle(20)
        assert.match(s.text(), /draft/i, 'a draft bot does not say it is a draft')
        // Nothing is reserved and nothing trades until start. A paper bot never holds a ledger
        // reservation at all.
        assert.equal(fx.bot().reservationEntryId, null)
        assert.match(s.text(), /reserv/i, 'the page says nothing about the reservation')
      },
    )
  })

  it('BJ-TRD-07 T1: creating a bot sends an idempotency key that survives a retry of the same intent', async () => {
    await withScreen(
      page(h(NewBotPage), '/bots/new'),
      {
        url: `${ORIGIN}/bots/new`,
        storage: fx.SIGNED_IN,
        routes: signedIn({
          'GET /v1/strategies': { body: { strategies: [fx.strategy()] } },
          'GET /v1/capabilities': { body: { liveTrading: true } },
          'GET /v1/series': { body: { series: [{ id: fx.SERIES_ID, symbol: 'CFG-USD', timeframe: '1h', bars: 5000 }] } },
          'POST /v1/bots': (_w, n) =>
            n === 1
              ? { status: 503, body: fx.error('unavailable', 'the ledger did not answer'), requestId: 'req-1' }
              : { status: 201, body: { botId: fx.BOT_ID } },
        }),
      },
      async (s) => {
        await s.settle(20)
        const commit = await arm(s, /create|make/i)
        await s.click(commit)
        await s.settle(30)
        // A 503 is a retryable failure, and the RETRY of one intent must carry the SAME key —
        // otherwise a request that actually landed becomes a second bot on the second press.
        const again = s.allByRole('button').find((el) => /create|make/i.test(s.textOf(el)))
        assert.ok(again, 'a retryable failure left no way to retry')
        await s.click(again)
        await s.settle(30)

        const posted = s.api.matching('POST /v1/bots')
        assert.equal(posted.length, 2, 'the retry never happened')
        assert.equal(
          posted[0]?.headers['idempotency-key'],
          posted[1]?.headers['idempotency-key'],
          'a retry of one intent minted a second key. A key minted per fetch is not an ' +
            'idempotency key.',
        )
      },
    )
  })

  it('BJ-TRD-08 ★ T1: a stopped bot has no start button, and the page says why', async () => {
    await withScreen(
      botAt(),
      {
        url: `${ORIGIN}/bots/${fx.BOT_ID}`,
        storage: fx.SIGNED_IN,
        routes: botRoutes({
          [`GET /v1/bots/${fx.BOT_ID}`]: { body: { bot: fx.bot({ status: 'stopped' }) } },
        }),
      },
      async (s) => {
        await s.settle(20)
        // No start control at all — not a disabled one. A button that can only 409 teaches a
        // customer that the product is unreliable.
        const start = s.allByRole('button').filter((el) => /^start$/i.test(s.textOf(el)))
        assert.deepEqual(start.map((el) => s.textOf(el)), [], 'a stopped bot offered Start')
        assert.match(s.text(), /terminal/i, 'the page does not say why the control is gone')
        assert.match(s.text(), /create a new one/i, 'the reader is left with no next step')
      },
    )
  })

  it('BJ-TRD-09 ★ T1: a live bot under the kill switch IS offered the button, and the refusal renders in full', async () => {
    await withScreen(
      botAt(),
      {
        url: `${ORIGIN}/bots/${fx.BOT_ID}`,
        storage: fx.SIGNED_IN,
        routes: botRoutes({
          [`GET /v1/bots/${fx.BOT_ID}`]: {
            body: { bot: fx.bot({ mode: 'live', status: 'paused', lastError: 'LIVE_DISABLED' }) },
          },
          [`POST /v1/bots/${fx.BOT_ID}/actions`]: {
            status: 409,
            body: fx.error('bot_state', 'live trading is disabled on this deployment'),
            requestId: 'req-killswitch',
          },
        }),
      },
      async (s) => {
        await s.settle(20)
        // The opposite of BJ-TRD-08, deliberately. Hiding this control would remove a feature
        // nobody could file a bug against.
        const start = s.byRole('button', 'Start')
        assert.ok(!start.hasAttribute('disabled'), 'the kill switch hid the control instead of refusing it')
        await s.click(start)
        await s.settle(30)
        assert.match(s.text(), /live trading is disabled on this deployment/i)
        // And the switch itself is surfaced on the row rather than only logged: a live bot gone
        // quiet because an operator pulled the switch is otherwise indistinguishable from one
        // whose rule has not fired.
        assert.match(s.text(), /LIVE_DISABLED|kill switch/i)
      },
    )
  })

  it('BJ-TRD-10 T1: pause is not a flatten, and equity is labelled a mark', async () => {
    await withScreen(
      botAt(),
      {
        url: `${ORIGIN}/bots/${fx.BOT_ID}`,
        storage: fx.SIGNED_IN,
        routes: botRoutes({
          [`GET /v1/bots/${fx.BOT_ID}`]: { body: { bot: fx.bot({ status: 'running', position: '250' }) } },
        }),
      },
      async (s) => {
        await s.settle(20)
        assert.match(s.text(), /pause is not a flatten/i)
        assert.match(s.text(), /the position stays open/i)
        // A mark from the last tick, not a settlement. The difference is what a customer would
        // otherwise read as money they have.
        assert.match(s.text(), /equity is a mark, not a settlement/i)
      },
    )
  })

  it('BJ-TRD-11 T1: the bot list equity column is labelled a mark', async () => {
    await withScreen(
      page(h(BotsPage), '/bots'),
      {
        url: `${ORIGIN}/bots`,
        storage: fx.SIGNED_IN,
        routes: signedIn({ 'GET /v1/bots': { body: { bots: [fx.bot({ status: 'running' })] } } }),
      },
      async (s) => {
        await s.settle(20)
        assert.ok(s.text().includes('First bot'), 'the bot has no row')
        assert.match(
          s.text(),
          /mark/i,
          'the equity column is presented as a settlement. It is a mark from the last tick.',
        )
      },
    )
  })

  it('BJ-TRD-12 T1: one row per settlement, and no duplicate settlement id', async () => {
    const settlements = [
      settlement({ id: 'set-1', period: '1000' }),
      settlement({ id: 'set-2', period: '1001' }),
    ]
    await withScreen(
      botAt(),
      {
        url: `${ORIGIN}/bots/${fx.BOT_ID}`,
        storage: fx.SIGNED_IN,
        routes: botRoutes({
          [`GET /v1/bots/${fx.BOT_ID}/settlements`]: { body: { settlements } },
        }),
      },
      async (s) => {
        await s.settle(20)
        // Presentation against the response: one row per settlement it carried, and no id twice.
        // 05 journey 9's double-billing defect, asserted where a customer would see it.
        const rows = [...s.document.querySelectorAll('tbody tr')]
        const ids = rows.map((r) => s.textOf(r))
        assert.ok(rows.length >= settlements.length, 'a settlement is missing a row')
        assert.equal(
          new Set(ids).size,
          ids.length,
          'a settlement was rendered twice, which is what double billing looks like on screen',
        )
      },
    )
  })

  it('BJ-TRD-13 T1: another customer’s bot id is the owner-scoped not-found screen', async () => {
    await withScreen(
      botAt(),
      {
        url: `${ORIGIN}/bots/${fx.BOT_ID}`,
        storage: fx.SIGNED_IN,
        routes: signedIn({
          [`GET /v1/bots/${fx.BOT_ID}`]: {
            status: 404,
            body: fx.error('not_found', 'no bot with that id'),
            requestId: 'req-404-bot',
          },
        }),
      },
      async (s) => {
        await s.settle(20)
        assert.doesNotMatch(
          s.text(),
          /you do not have access|permission|forbidden|not yours/i,
          'the page distinguished "not yours" from "no such bot", which is how ids get enumerated',
        )
        assert.match(s.text(), /no bot|not found|does not exist/i)
      },
    )
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   6.19 Group S — the adversarial matrix
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('BJ-ADV — the adversarial matrix', () => {
  it('BJ-ADV-06-H1 T1: double-submitting a backtest sends one key', async () => {
    await withScreen(
      page(h(NewBacktestPage), '/backtests/new'),
      {
        url: `${ORIGIN}/backtests/new`,
        storage: fx.SIGNED_IN,
        routes: signedIn({
          'GET /v1/strategies': { body: { strategies: [fx.strategy()] } },
          'GET /v1/capabilities': { body: { liveTrading: true } },
          'GET /v1/series': { body: { series: [{ id: fx.SERIES_ID, symbol: 'CFG-USD', timeframe: '1h', bars: 5000 }] } },
          'POST /v1/backtests': {
            status: 202,
            body: { backtestId: fx.BACKTEST_ID, status: 'queued' },
            delayMs: 15,
          },
          [`GET /v1/backtests/${fx.BACKTEST_ID}`]: {
            body: { backtest: backtest({ status: 'queued', metrics: null }) },
          },
        }),
      },
      async (s) => {
        await s.settle(20)
        const commit = await arm(s, /queue|run|start/i)
        s.clickNoFlush(commit)
        await s.settle(0)
        s.clickNoFlush(commit)
        await s.settle(60)
        // The guarantee doc 22 H1 asks for is ONE EFFECT, and on this surface the mechanism is
        // the key rather than the button: `useIdempotentMutation` holds it in a ref "so the key
        // is readable by the very next call without waiting for a render", which is exactly the
        // double-click case. Whatever number of requests leave the browser, they are one intent.
        const posted = s.api.matching('POST /v1/backtests')
        assert.ok(posted.length >= 1, 'the form sent nothing')
        const keys = new Set(posted.map((p) => p.headers['idempotency-key']))
        assert.equal(keys.size, 1, `two presses queued ${keys.size} intents: ${[...keys].join(', ')}`)
      },
    )
  })

  it('BJ-ADV-06-H2 T1: once queued, the browser is on the status page and no form holds the intent', async () => {
    await withScreen(
      h(App),
      {
        url: `${ORIGIN}/backtests/new`,
        storage: fx.SIGNED_IN,
        routes: signedIn({
          'GET /v1/strategies': { body: { strategies: [fx.strategy()] } },
          'GET /v1/capabilities': { body: { liveTrading: true } },
          'GET /v1/series': { body: { series: [{ id: fx.SERIES_ID, symbol: 'CFG-USD', timeframe: '1h', bars: 5000 }] } },
          'POST /v1/backtests': { status: 202, body: { backtestId: fx.BACKTEST_ID, status: 'queued' } },
          [`GET /v1/backtests/${fx.BACKTEST_ID}`]: {
            body: { backtest: backtest({ status: 'queued', metrics: null }) },
          },
          [`GET /v1/backtests/${fx.BACKTEST_ID}/result`]: { body: { fills: [], equity: [] } },
        }),
      },
      async (s) => {
        await s.settle(30)
        const commit = await arm(s, /queue|run|start/i)
        await s.click(commit)
        await s.settle(40)
        assert.ok(
          s.api.wire.some((w) => w.path === `/v1/backtests/${fx.BACKTEST_ID}`),
          'the browser did not move to the status address',
        )
        assert.match(s.text(), /QUEUED/i)
        // The form is gone with the route, so there is nothing a back button could re-arm against
        // the settled intent.
        const again = s.allByRole('button').find((el) => /queue this backtest/i.test(s.textOf(el)))
        assert.equal(again, undefined, 'the queue form survived the navigation')
      },
    )
  })

  it('BJ-ADV-07-H1 T1: double-submitting a bot sends one key', async () => {
    await withScreen(
      page(h(NewBotPage), '/bots/new'),
      {
        url: `${ORIGIN}/bots/new`,
        storage: fx.SIGNED_IN,
        routes: signedIn({
          'GET /v1/strategies': { body: { strategies: [fx.strategy()] } },
          'GET /v1/capabilities': { body: { liveTrading: true } },
          'GET /v1/series': { body: { series: [{ id: fx.SERIES_ID, symbol: 'CFG-USD', timeframe: '1h', bars: 5000 }] } },
          'POST /v1/bots': { status: 201, body: { botId: fx.BOT_ID }, delayMs: 15 },
        }),
      },
      async (s) => {
        await s.settle(20)
        const commit = await arm(s, /create|make/i)
        s.clickNoFlush(commit)
        await s.settle(0)
        s.clickNoFlush(commit)
        await s.settle(60)
        const posted = s.api.matching('POST /v1/bots')
        assert.ok(posted.length >= 1, 'the form sent nothing')
        const keys = new Set(posted.map((p) => p.headers['idempotency-key']))
        assert.equal(keys.size, 1, `two presses created ${keys.size} intents`)
      },
    )
  })

  it('BJ-ADV-07-H4 T1: a failed bot creation states the failure and keeps the draft', async () => {
    await withScreen(
      page(h(NewBotPage), '/bots/new'),
      {
        url: `${ORIGIN}/bots/new`,
        storage: fx.SIGNED_IN,
        routes: signedIn({
          'GET /v1/strategies': { body: { strategies: [fx.strategy()] } },
          'GET /v1/capabilities': { body: { liveTrading: true } },
          'GET /v1/series': { body: { series: [{ id: fx.SERIES_ID, symbol: 'CFG-USD', timeframe: '1h', bars: 5000 }] } },
          'POST /v1/bots': {
            status: 422,
            body: fx.error('invalid_argument', 'that allocation is below the minimum'),
            requestId: 'req-bot-422',
          },
        }),
      },
      async (s) => {
        await s.settle(20)
        const commit = await arm(s, /create|make/i)
        await s.click(commit)
        await s.settle(30)
        assert.match(s.text(), /below the minimum/i)
        assert.match(s.text(), /req-bot-422/, 'no request id to quote')
        // The browser did not navigate: a failed create leaves the reader on their draft, which is
        // proved by the bot read the detail page would have made not happening.
        assert.deepEqual(s.api.matching(`GET /v1/bots/${fx.BOT_ID}`).map((w) => w.path), [])
      },
    )
  })

  it('BJ-ADV-08-H1 ★ T1: double-pressing a bot action sends one action', async () => {
    await withScreen(
      botAt(),
      {
        url: `${ORIGIN}/bots/${fx.BOT_ID}`,
        storage: fx.SIGNED_IN,
        routes: botRoutes({
          [`GET /v1/bots/${fx.BOT_ID}`]: { body: { bot: fx.bot({ status: 'paused' }) } },
          [`POST /v1/bots/${fx.BOT_ID}/actions`]: {
            status: 200,
            body: { bot: fx.bot({ status: 'running' }) },
            // 40ms, not 15. The `disabled` assertion below runs after `settle(0)`, which is an
            // `act()` around a zero-millisecond timer — and on a loaded machine that takes longer
            // than 15ms to come back, at which point the action has ALREADY completed, `busy` is
            // false again and the control is legitimately live. This test went red once that way
            // during a mutation run. The margin is the fix; the assertion is unchanged.
            delayMs: 40,
          },
        }),
      },
      async (s) => {
        await s.settle(20)
        const start = s.byRole('button', 'Start')
        s.clickNoFlush(start)
        await s.settle(0)
        assert.ok(start.hasAttribute('disabled'), 'the action control stayed live while in flight')
        s.clickNoFlush(start)
        await s.settle(60)
        assert.equal(
          s.api.matching(`POST /v1/bots/${fx.BOT_ID}/actions`).length,
          1,
          'two presses sent two actions',
        )
      },
    )
  })

  it('BJ-ADV-08-H4 ★ T1: a refused action leaves the bot rendered and states the refusal', async () => {
    await withScreen(
      botAt(),
      {
        url: `${ORIGIN}/bots/${fx.BOT_ID}`,
        storage: fx.SIGNED_IN,
        routes: botRoutes({
          [`GET /v1/bots/${fx.BOT_ID}`]: { body: { bot: fx.bot({ status: 'paused' }) } },
          [`POST /v1/bots/${fx.BOT_ID}/actions`]: {
            status: 409,
            body: fx.error('bot_state', 'this bot cannot start from that state'),
            requestId: 'req-action-409',
          },
        }),
      },
      async (s) => {
        await s.settle(20)
        await s.click(s.byRole('button', 'Start'))
        await s.settle(30)
        const alert = s.document.querySelector('[role="alert"]')
        assert.ok(alert, 'a refused action left nothing on screen')
        assert.match(s.textOf(alert), /cannot start from that state/i)
        // And the bot is still rendered — the refusal is beside the controls, not in place of the
        // page.
        assert.ok(s.text().includes('First bot'), 'a refused action blanked the bot')
      },
    )
  })

  it('BJ-ADV-08-H6 ★ T1: a slow action leaves every control disabled and the page painted', async () => {
    await withScreen(
      botAt(),
      {
        url: `${ORIGIN}/bots/${fx.BOT_ID}`,
        storage: fx.SIGNED_IN,
        routes: botRoutes({
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
        // Every action is disabled, not only the one pressed: Stop is irreversible and a Stop sent
        // while a Start is in flight is a race the customer cannot see.
        for (const name of ['Start', 'Pause', 'Stop']) {
          const button = s.queryByRole('button', name)
          if (button) assert.ok(button.hasAttribute('disabled'), `${name} stayed live mid-action`)
        }
        assert.ok(s.text().includes('First bot'), 'the page went away while an action was in flight')
        await s.settle(80)
      },
    )
  })

  it('BJ-ADV-22 ★ T1: the page paints while its read is slow', async () => {
    await withScreen(
      page(h(StrategiesPage), '/'),
      {
        url: `${ORIGIN}/`,
        routes: { 'GET /v1/strategies': { body: { strategies: [fx.strategy()] }, delayMs: 40 } },
        allowEmpty: true,
      },
      async (s) => {
        assert.match(s.text(), /loading|reading/i, 'the slow read is not marked pending')
        await s.settle(80)
        assert.ok(s.text().includes('Moving-average cross'), 'the slow read never landed')
      },
    )
  })

  it('BJ-ADV-23 ★ T1: every failure state offers a request id', async () => {
    const cases: ReadonlyArray<{ name: string; el: () => ReactElement; url: string; routes: Routes }> = [
      {
        name: 'the strategy catalogue',
        el: () => page(h(StrategiesPage), '/'),
        url: `${ORIGIN}/`,
        routes: {
          'GET /v1/strategies': { status: 500, body: fx.error('internal', 'it broke'), requestId: 'req-a' },
        },
      },
      {
        name: 'the bot read',
        el: () => botAt(),
        url: `${ORIGIN}/bots/${fx.BOT_ID}`,
        routes: signedIn({
          [`GET /v1/bots/${fx.BOT_ID}`]: {
            status: 500,
            body: fx.error('internal', 'it broke'),
            requestId: 'req-b',
          },
        }),
      },
      {
        name: 'the bot list',
        el: () => page(h(BotsPage), '/bots'),
        url: `${ORIGIN}/bots`,
        routes: signedIn({
          'GET /v1/bots': { status: 500, body: fx.error('internal', 'it broke'), requestId: 'req-c' },
        }),
      },
    ]
    for (const c of cases) {
      await withScreen(c.el(), { url: c.url, storage: fx.SIGNED_IN, routes: c.routes }, async (s) => {
        await s.settle(20)
        assert.match(s.text(), /req-[abc]/, `${c.name} failed without the request id to quote`)
      })
    }
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   6.20 Group T — accessibility
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('BJ-A11Y — accessibility', () => {
  it('BJ-A11Y-03 ★ T1: a failure is announced and is not colour-only', async () => {
    await withScreen(
      page(h(BotsPage), '/bots'),
      {
        url: `${ORIGIN}/bots`,
        storage: fx.SIGNED_IN,
        routes: signedIn({
          'GET /v1/bots': {
            status: 500,
            body: fx.error('internal', 'the bot list did not answer'),
            requestId: 'req-a11y',
          },
        }),
      },
      async (s) => {
        await s.settle(20)
        const alert = s.document.querySelector('[role="alert"]')
        assert.ok(alert, 'the failure is not a live region, so it is never announced')
        assert.ok(s.textOf(alert).length > 20, 'the failure has no sentence in it')
      },
    )
  })

  it('BJ-A11Y-08 ★ T1: the equity chart has a table view carrying the same numbers', async () => {
    const equity = [
      { t: 1_700_000_000, equity: '100000', hold: '100000' },
      { t: 1_700_003_600, equity: '101250', hold: '100400' },
      { t: 1_700_007_200, equity: '99875', hold: '100900' },
    ]
    await withScreen(
      atRoute('/backtests/:id', h(BacktestPage), `/backtests/${fx.BACKTEST_ID}`),
      {
        url: `${ORIGIN}/backtests/${fx.BACKTEST_ID}`,
        storage: fx.SIGNED_IN,
        routes: signedIn({
          [`GET /v1/backtests/${fx.BACKTEST_ID}`]: {
            body: { backtest: backtest({ status: 'complete', metrics: metrics() }) },
          },
          [`GET /v1/backtests/${fx.BACKTEST_ID}/result`]: { body: { fills: [], equity } },
        }),
      },
      async (s) => {
        await s.settle(30)
        const chart = s.document.querySelector('.tw-chart')
        assert.ok(chart, 'no equity chart rendered')

        // 14 §11 makes the table both the accessibility fallback and the EXPORT path, so it has to
        // carry the numbers rather than a summary of them. An aria-label saying "three points"
        // does not say what any of them were, and a drawdown a reader cannot date is the question
        // the curve was added to answer, asked again.
        const table = chart.querySelector('table')
        assert.ok(table, 'the chart has no table view')
        for (const point of equity) {
          const row = [...table.querySelectorAll('tbody tr')].find((tr) =>
            s.textOf(tr).includes(String(point.t)),
          )
          assert.ok(row, `the table has no row for bar ${point.t}`)
          assert.ok(s.textOf(row).includes(point.equity), `row ${point.t} lost its equity figure`)
          assert.ok(s.textOf(row).includes(point.hold), `row ${point.t} lost its buy-and-hold figure`)
        }

        // Reachable by keyboard: the disclosure's summary is in the tab order.
        const summary = chart.querySelector('summary')
        assert.ok(summary, 'the table is not behind a focusable control')
        assert.ok(
          s.tabbables().includes(summary),
          'the table view cannot be reached without a pointer',
        )
      },
    )
  })

  it('BJ-A11Y-10 T1: every state badge carries a word', async () => {
    await withScreen(
      botAt(),
      { url: `${ORIGIN}/bots/${fx.BOT_ID}`, storage: fx.SIGNED_IN, routes: botRoutes() },
      async (s) => {
        await s.settle(20)
        const badges = [...s.document.querySelectorAll('[class*="badge" i], [class*="tw-state" i]')]
        assert.ok(badges.length > 0, 'the page renders no state badges at all')
        for (const badge of badges) {
          if (badge.getAttribute('aria-hidden') === 'true') continue
          assert.ok(
            s.textOf(badge).length > 0,
            `a badge rendered with no text: ${badge.outerHTML.slice(0, 120)}`,
          )
        }
      },
    )
  })

  it('BJ-A11Y-12 T1: one main landmark, a reachable skip link, no skipped heading level', async () => {
    await withScreen(
      h(App),
      { url: `${ORIGIN}/`, routes: { 'GET /v1/strategies': { body: { strategies: [fx.strategy()] } } } },
      async (s) => {
        await s.settle(20)
        assert.equal(s.allByRole('main').length, 1)
        const skip = s.document.querySelector('a[href^="#"]')
        assert.ok(skip, 'no skip link')
        assert.ok(s.document.getElementById((skip.getAttribute('href') ?? '#').slice(1)))
        assert.equal(s.tabbables()[0], skip, 'the skip link is not first in the tab order')

        const levels = s.allByRole('heading').map((el) => Number(el.tagName.slice(1)))
        assert.equal(levels.filter((l) => l === 1).length, 1, 'a page has exactly one h1')
        let previous = 0
        for (const level of levels) {
          assert.ok(previous === 0 || level <= previous + 1, `heading order skips h${previous} → h${level}`)
          previous = level
        }
      },
    )
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   5.1 — the universal per-surface property
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('BJ-TRADE-404 — an unowned address answers 404', () => {
  const directives = readFileSync(at('nginx.conf'), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')

  it('BJ-TRADE-404 T2: nginx serves the shell through error_page 404, never try_files', () => {
    assert.match(directives, /error_page\s+404\s+\/index\.html/)
    assert.doesNotMatch(directives, /try_files\s+\$uri\s+(\$uri\/\s+)?\/index\.html/)
  })

  it('BJ-TRADE-404 T2: the not-found screen renders inside the shell', async () => {
    await withScreen(h(App), { url: `${ORIGIN}/nothing-here`, routes: {} }, async (s) => {
      assert.match(s.text(), /not found|nothing at this address|no page|does not exist/i)
      assert.ok(s.allByRole('link').length > 0, 'the not-found screen strands the reader')
      assert.ok(!ROUTES.map((r) => r.path).includes('nothing-here'))
    })
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   The meta-test. Doc 22 §3.2.
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the catalogue and this file agree', () => {
  it('every id doc 22 assigns to this surface is accounted for exactly once', () => {
    const ids = SCENARIOS.map((s) => s.id)
    assert.deepEqual([...new Set(ids)].sort(), [...ids].sort(), 'an id appears twice')
    assert.deepEqual([...ids].sort(), [...DOC22_IDS].sort())
  })

  it('a scenario whose outcome depends on a server rule carries an ownedBy path', () => {
    const REFUSAL = /\b(refus|denie|denial|reject|owner-scoped|terminal|kill switch|403|409|4xx)\w*/i
    for (const s of SCENARIOS) {
      if (s.blocked) continue
      if (!REFUSAL.test(s.what)) continue
      assert.ok(
        s.ownedBy,
        `${s.id} turns on a server-side refusal and names no test that owns it. Doc 22 §3.2.`,
      )
      assert.match(s.ownedBy.path, /^[a-z-]+\/src\/[\w./-]+\.ts$/)
    }
  })

  it('no scenario is marked implemented without a test named for it', () => {
    const source = readFileSync(at('test/journeys.test.ts'), 'utf8')
    for (const s of SCENARIOS) {
      if (s.blocked) continue
      assert.ok(
        new RegExp(`it\\('${s.id}[ ★]`).test(source),
        `${s.id} is in the catalogue as implemented and has no test named for it`,
      )
    }
  })

  it('every blocked scenario names its blocker and no blocker is a shrug', () => {
    for (const s of SCENARIOS) {
      if (!s.blocked) continue
      assert.ok(s.blocked.length > 60, `${s.id}'s blocker is too short to be a reason`)
      assert.ok(
        /doc 22|§|does not exist|no UI|tier 3|micro-beacon|not installed/i.test(s.blocked),
        `${s.id}'s blocker does not name a fact about the estate: ${s.blocked}`,
      )
    }
  })

  it('nothing here is tier 3 and implemented — tier 3 lives in micro-beacon', () => {
    for (const s of SCENARIOS) {
      if (s.tier !== 'T3') continue
      assert.ok(s.blocked, `${s.id} is tier 3 and not blocked; doc 22 §4 puts tier 3 in beacon`)
    }
  })
})

/* ── helpers ────────────────────────────────────────────────────────────────────────────────── */

/**
 * Choose a strategy and a series, and hand back the commit control.
 *
 * Both forms refuse outright without the two — `if (!strategy || !seriesId) return` at
 * `src/pages/new-bot.tsx` and the same line in `new-backtest.tsx`. A scenario that pressed the
 * button without them would send nothing, observe nothing, and assert an empty network log, which
 * is the quietest way for a form test to pass against a form that does not work.
 */
async function arm(s: Screen, name: RegExp): Promise<Element> {
  for (const select of s.allByRole('combobox')) {
    const first = [...select.querySelectorAll('option')].find((o) => (o.getAttribute('value') ?? '') !== '')
    if (first) await s.type(select, first.getAttribute('value') ?? '')
  }
  // Every empty `required` field is filled, because a browser refuses to submit a form that fails
  // constraint validation — silently, with no event for the page to handle. A scenario that left
  // one blank would press the button, observe nothing, and assert an empty network log.
  for (const field of s.allByRole('textbox')) {
    if (!field.hasAttribute('required')) continue
    if (((field as unknown as { value: string }).value ?? '') !== '') continue
    await s.type(field, 'Journey')
  }
  const commit = s.allByRole('button').find((el) => name.test(s.textOf(el)))
  assert.ok(commit, `no commit control matching ${String(name)}`)
  return commit
}

/* ── fixtures that need the page's own types ────────────────────────────────────────────────── */

function backtest(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: fx.BACKTEST_ID,
    userId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    status: 'complete',
    seriesId: fx.SERIES_ID,
    strategyId: 'sma_cross',
    params: {},
    seed: 1,
    startCash: '100000',
    feeBps: 10,
    slippageBps: 5,
    fromT: 1_700_000_000,
    toT: 1_700_007_200,
    resultDigest: 'digest-1',
    metrics: metrics(),
    notes: [],
    error: null,
    ...over,
  }
}

function metrics(): Record<string, unknown> {
  return {
    startEquity: '100000',
    endEquity: '101250',
    totalReturnBps: '125',
    holdReturnBps: '90',
    maxDrawdownBps: '210',
    exposureBps: '6000',
    winRateBps: '5500',
    profitFactorBps: '13000',
    feesPaidShards: '40',
    bestTradeShards: '900',
    worstTradeShards: '-450',
    trades: 20,
    wins: 11,
    losses: 9,
    cagr: 0.12,
    sharpe: 0.9,
    sortino: 1.1,
    calmar: 0.6,
  }
}

function settlement(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'set-1',
    botId: fx.BOT_ID,
    userId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    period: '1000',
    equity: '101000',
    highWaterMark: '100000',
    gain: '1000',
    fee: '200',
    attempted: '200',
    collected: '200',
    status: 'charged',
    entryId: 'entry-1',
    ...over,
  }
}
