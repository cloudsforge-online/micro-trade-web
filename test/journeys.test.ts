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
 *
 * ── The triple the exchange screens turn on ───────────────────────────────────────────────────
 *
 * BJ-TRD-14, -15 and -16 are the gate in front of every other exchange scenario, and it has THREE
 * answers rather than two and a half:
 *
 *   The book is OFF — `/v1/capabilities` says so and carries the service's own sentence, which the
 *   screen quotes verbatim rather than paraphrasing, and asks for no market data at all.
 *
 *   The order-book block is ABSENT — a `trade` older than the exchange — and the screen reaches the
 *   same conclusion from silence, because reading `capabilities.orderBook.enabled` off a document
 *   that has no such key throws inside render.
 *
 *   The capability read FAILED, and that is its own answer: "we could not check", with a retry.
 *   Collapsing it into the first tells a customer their exchange is switched off on the strength of
 *   a timeout, which is a claim about somebody else's deployment made by a network error. It is why
 *   doc 22 gates BJ-TRD-16 as well as BJ-TRD-14 — the two screens look similar, which is exactly
 *   the kind of pair a refactor collapses.
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
import { BalancesPage } from '../src/pages/balances.tsx'
import { BotPage } from '../src/pages/bot.tsx'
import { BotsPage } from '../src/pages/bots.tsx'
import { MarketPage } from '../src/pages/market.tsx'
import { MarketsPage } from '../src/pages/markets.tsx'
import { NewBacktestPage } from '../src/pages/new-backtest.tsx'
import { NewBotPage } from '../src/pages/new-bot.tsx'
import { OrderPage } from '../src/pages/order.tsx'
import { OrdersPage } from '../src/pages/orders.tsx'
import { StrategiesPage } from '../src/pages/strategies.tsx'

const ORIGIN = 'https://trade.cloudsforge.online'
const SYMBOL = 'BTC-USD'
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

const marketAt = (symbol = SYMBOL) => atRoute('/markets/:symbol', h(MarketPage), `/markets/${symbol}`)

/** Every read the market screen makes, answered. A scenario overrides the one it is about. */
const marketRoutes = (over: Routes = {}): Routes =>
  signedIn({
    'GET /v1/capabilities': { body: fx.capabilities() },
    [`GET /v1/exchange/markets/${SYMBOL}/depth`]: {
      body: { marketId: fx.MARKET_ID, symbol: SYMBOL, depth: fx.depth() },
    },
    [`GET /v1/exchange/markets/${SYMBOL}/ticker`]: { body: { ticker: fx.ticker() } },
    [`GET /v1/exchange/markets/${SYMBOL}/trades`]: {
      body: { marketId: fx.MARKET_ID, trades: [fx.trade()] },
    },
    [`GET /v1/exchange/markets/${SYMBOL}/candles`]: {
      body: { marketId: fx.MARKET_ID, interval: '1m', candles: [fx.candle()] },
    },
    [`GET /v1/exchange/markets/${SYMBOL}`]: {
      body: { market: fx.market(), bbo: { bid: '2499900', ask: '2500100' }, ticker: fx.ticker() },
    },
    'GET /v1/exchange/orders': { body: { orders: [] } },
    'GET /v1/exchange/fills': { body: { fills: [] } },
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
        assert.match(s.text(), /equity figure is an estimate, not cash in hand/i)
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

  /* ── BJ-TRD-14 … 17: the gate in front of every other exchange scenario ─────────────────────── */

  it('BJ-TRD-14 ★ T1: the book being off quotes the service and asks for no market data at all', async () => {
    await withScreen(
      marketAt(),
      {
        url: `${ORIGIN}/markets/${SYMBOL}`,
        storage: fx.SIGNED_IN,
        routes: signedIn({
          'GET /v1/capabilities': { body: fx.capabilities(fx.ORDER_BOOK_OFF) },
        }),
      },
      async (s) => {
        assert.ok(
          s.text().includes(fx.ORDER_BOOK_OFF.refusal as string),
          `the gate paraphrased the service instead of quoting it: ${s.text()}`,
        )
        // "Nothing is broken and nothing needs retrying" — the flag being off is the ORDINARY case
        // and the screen must not present it as a fault.
        assert.match(s.text(), /Nothing is broken/i)

        // And it asked for nothing else. A gate that renders the refusal AFTER firing six reads has
        // spent the customer's rate-limit quota to learn what one unauthenticated call already said.
        const exchange = s.api.wire.filter((w) => w.path.startsWith('/v1/exchange/'))
        assert.deepEqual(exchange, [], 'the gate read market data before it knew there was a book')
      },
    )
  })

  it('BJ-TRD-15 T1: an order-book block absent entirely reaches the same conclusion', async () => {
    // A `trade` older than the exchange answers `/v1/capabilities` with no `orderBook` key. Reading
    // `capabilities.orderBook.enabled` off that throws inside render; the bundle must instead
    // conclude "not switched on here", which is what the older service would say if it could.
    await withScreen(
      marketAt(),
      {
        url: `${ORIGIN}/markets/${SYMBOL}`,
        storage: fx.SIGNED_IN,
        routes: signedIn({ 'GET /v1/capabilities': { body: fx.capabilities(null) } }),
      },
      async (s) => {
        assert.match(s.text(), /no order book on this deployment/i)
        assert.match(s.text(), /does not report an exchange at all/i)
        s.clean('BJ-TRD-15')
      },
    )
  })

  it('BJ-TRD-16 ★ T1: a capability read that FAILED is its own answer, not the refusal', async () => {
    await withScreen(
      marketAt(),
      {
        url: `${ORIGIN}/markets/${SYMBOL}`,
        storage: fx.SIGNED_IN,
        routes: signedIn({
          'GET /v1/capabilities': { status: 503, body: fx.error('unavailable', 'nope') },
        }),
      },
      async (s) => {
        assert.match(s.text(), /could not check whether trading is switched on/i)
        // NOT the refusal. Telling somebody their exchange is off because a request timed out is a
        // claim about their deployment made by a network error.
        assert.doesNotMatch(s.text(), /no order book on this deployment/i)
        assert.ok(s.queryByRole('button', /try again|retry/i), 'a failed read offers no retry')
      },
    )
  })

  it('BJ-TRD-17 T1: the market screen opens when the book is on', async () => {
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: marketRoutes() },
      async (s) => {
        assert.ok(s.byRole('heading', /^BTC-USD$/), 'the market has no heading')
        assert.ok(s.byRole('heading', 'The book'))
        assert.ok(s.byRole('heading', 'Place an order'))
        s.clean('BJ-TRD-17')
      },
    )
  })

  /* ── BJ-TRD-18 … 24: the depth ladder ──────────────────────────────────────────────────────── */

  it('BJ-TRD-18 ★ T1: the asks are above the spread and the spread is above the bids', async () => {
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: marketRoutes() },
      async (s) => {
        // Price increases upward, so the two sides read as one axis and the gap between them is
        // visibly the spread. Asserted in DOCUMENT ORDER, which is what a screen reader follows too.
        const first = ladderRows(s).map((cells) => cells[0] ?? '')
        assert.equal(first.length, 5, `the ladder has ${first.length} rows, not four levels and a spread`)
        assert.match(first[0] as string, /^25,002\.00/, 'the asks are not worst-price-first')
        assert.match(first[1] as string, /^25,001\.00/)
        assert.match(first[2] as string, /^Spread/, 'the spread is not between the two sides')
        assert.match(first[3] as string, /^24,999\.00/, 'the best bid is not immediately below the spread')
        assert.match(first[4] as string, /^24,998\.00/, 'the bids are not best-price-first')
      },
    )
  })

  it('BJ-TRD-19 T1: the spread is a figure the reader can check against the two sides', async () => {
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: marketRoutes() },
      async (s) => {
        // 2500100 - 2499900 = 200 minor units = 2.00 quote. Computed by the page in bigint; this
        // asserts the printed result, which is the only part a customer sees.
        assert.match(s.text(), /2\.00 USD between the best bid and the best ask/)
      },
    )
  })

  it('BJ-TRD-20 T1: the total column accumulates in the base asset’s own decimals', async () => {
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: marketRoutes() },
      async (s) => {
        // 0.5 + 0.25 = 0.75 BTC cumulative on the bid side; 0.4 + 0.1 = 0.5 on the ask side, and the
        // ask side accumulates FROM THE BEST PRICE so the worst level carries the whole 0.5. If the
        // page were formatting quantities with the QUOTE decimals these would read 500000.00 and
        // the test would say so — which is why the fixture's two scales differ.
        const totals = ladderRows(s).map((cells) => [cells[1] ?? '', cells[2] ?? ''])
        assert.deepEqual(totals[0], ['0.1', '0.5'], 'the worst ask does not carry the cumulative total')
        assert.deepEqual(totals[1], ['0.4', '0.4'], 'the best ask should accumulate only itself')
        assert.deepEqual(totals[3], ['0.5', '0.5'])
        assert.deepEqual(totals[4], ['0.25', '0.75'])
      },
    )
  })

  it('BJ-TRD-21 T1: the published size caveat is on the screen, in words', async () => {
    // A reserve order publishes `displayQty` and hides the rest. A customer reading a thin book
    // that is not thin sizes their order wrongly, so this cannot live in a comment.
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: marketRoutes() },
      async (s) => {
        assert.match(s.text(), /a level can hold more than it shows — never less/i)
      },
    )
  })

  it('BJ-TRD-22 T1: an empty book is a state of the market, not a failure or a loading screen', async () => {
    await withScreen(
      marketAt(),
      {
        url: `${ORIGIN}/markets/${SYMBOL}`,
        storage: fx.SIGNED_IN,
        routes: marketRoutes({
          [`GET /v1/exchange/markets/${SYMBOL}/depth`]: {
            body: { marketId: fx.MARKET_ID, symbol: SYMBOL, depth: { bids: [], asks: [] } },
          },
        }),
      },
      async (s) => {
        assert.match(s.text(), /The book is empty/i)
        assert.match(s.text(), /the first limit order placed here becomes the book/i)
        assert.doesNotMatch(s.text(), /did not load/i)
      },
    )
  })

  it('BJ-TRD-23 T1: a one-sided book says there is no spread rather than printing one', async () => {
    await withScreen(
      marketAt(),
      {
        url: `${ORIGIN}/markets/${SYMBOL}`,
        storage: fx.SIGNED_IN,
        routes: marketRoutes({
          [`GET /v1/exchange/markets/${SYMBOL}/depth`]: {
            body: { marketId: fx.MARKET_ID, symbol: SYMBOL, depth: { bids: fx.depth().bids, asks: [] } },
          },
        }),
      },
      async (s) => {
        assert.match(s.text(), /Nothing is quoted on the selling side/i)
      },
    )
  })

  it('BJ-TRD-24 ★ T1: pressing a ladder price copies the decimal into the ticket and sends nothing', async () => {
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: marketRoutes() },
      async (s) => {
        // The accessible name carries the side in words, so a screen-reader user hearing the button
        // list can tell a bid from an ask without the colour.
        const bid = s.byRole('button', /24,999\.00 — copy this bid price into the order form/)
        const before = s.api.wire.length
        await s.click(bid)

        // As a DECIMAL. This assertion is the one that found the hundredfold price error in
        // `LadderRow` (it passed the wire amount, 2499900, straight into the field), which is why it
        // compares the exact string rather than merely checking the box is no longer empty.
        const price = s.byRole('textbox', /^Limit price/) as unknown as { value: string }
        assert.equal(price.value, '24999.00', 'the price did not reach the ticket')
        assert.equal(
          s.api.wire.length,
          before,
          'clicking a price in the ladder sent a request; exploring the book must be free',
        )
      },
    )
  })

  /* ── BJ-TRD-25 … 32: the order ticket ──────────────────────────────────────────────────────── */

  it('BJ-TRD-25 T1: the ticket builds its controls from the published vocabularies', async () => {
    // Not from a copy of the enums. A deployment that serves three order types must offer three,
    // and one that serves a type this bundle has never heard of must still offer it.
    await withScreen(
      marketAt(),
      {
        url: `${ORIGIN}/markets/${SYMBOL}`,
        storage: fx.SIGNED_IN,
        routes: marketRoutes({
          'GET /v1/capabilities': {
            body: fx.capabilities(fx.orderBook({ orderTypes: ['limit'], timeInForce: ['gtc', 'ioc'] })),
          },
        }),
      },
      async (s) => {
        const types = s.byRole('combobox', /^Order type/)
        assert.equal(types.querySelectorAll('option').length, 1)
        assert.equal(s.textOf(types.querySelector('option')), 'Limit')
      },
    )
  })

  it('BJ-TRD-26 T1: the cost is restated in the market’s own units before anything is sent', async () => {
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: marketRoutes() },
      async (s) => {
        await s.type(s.byRole('textbox', /^Limit price/), '25000.00')
        await s.type(s.byRole('textbox', /^Quantity/), '0.5')

        // 0.5 BTC at 25,000.00 is 12,500.00 USD. Both fee rates are shown because which one applies
        // is not knowable before the order arrives: 10 bps and 25 bps of the 0.5 BTC a buyer
        // receives are 0.00050000 and 0.00125000.
        assert.match(s.text(), /12,500\.00 USD/)
        assert.match(s.text(), /0\.00050000 – 0\.00125000 BTC/)
        assert.match(s.text(), /maker 0\.1% if it rests, taker 0\.25% if it trades on arrival/)
      },
    )
  })

  it('BJ-TRD-27 T1: a quantity off the lot grid is warned about and NOT blocked', async () => {
    // The note is advice; `validatePlacement` is the authority. A browser that refuses to send an
    // order the engine would have accepted is a browser standing between a customer and their money.
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: marketRoutes() },
      async (s) => {
        await s.type(s.byRole('textbox', /^Limit price/), '25000.00')

        // 0.000015 BTC is 1500 satoshis against a lot size of 1000, so it is expressible in this
        // market's decimals and still off its grid — which is the case doc 22 names. The warning is
        // asserted as well as the live button: a screen that silently accepted it would pass an
        // assertion about the button alone, and the customer would learn the rule from a 400.
        await s.type(s.byRole('textbox', /^Quantity/), '0.000015')
        assert.match(s.text(), /Quantity must be a multiple of the lot size, 0\.00001 BTC\./)
        assert.ok(
          !s.byRole('button', 'Buy BTC').hasAttribute('disabled'),
          'the preflight disabled the submit button',
        )

        // And a quantity finer than the market can express is the same shape of answer: said out
        // loud, and still sendable.
        await s.type(s.byRole('textbox', /^Quantity/), '0.000000015')
        assert.match(s.text(), /at most 8 decimal places/)
        assert.ok(
          !s.byRole('button', 'Buy BTC').hasAttribute('disabled'),
          'the preflight disabled the submit button',
        )
      },
    )
  })

  it('BJ-TRD-28 ★ T1: integer minor units on the wire, and one key under a double submit', async () => {
    let placements = 0
    await withScreen(
      marketAt(),
      {
        url: `${ORIGIN}/markets/${SYMBOL}`,
        storage: fx.SIGNED_IN,
        routes: marketRoutes({
          'POST /v1/exchange/orders': () => {
            placements += 1
            return { status: 201, body: { order: fx.order(), fills: [] } }
          },
        }),
      },
      async (s) => {
        await s.type(s.byRole('textbox', /^Limit price/), '24999.00')
        await s.type(s.byRole('textbox', /^Quantity/), '0.1')

        const go = s.byRole('button', 'Buy BTC')
        s.clickNoFlush(go)
        s.clickNoFlush(go)
        await s.settle()

        const sent = s.api.matching('POST /v1/exchange/orders')
        assert.equal(placements, sent.length)
        const keys = new Set(sent.map((w) => w.headers['idempotency-key']))
        assert.equal(
          keys.size,
          1,
          `a double submit produced ${keys.size} idempotency keys, so the service could not replay`,
        )
        assert.ok([...keys][0], 'the placement carried no idempotency key at all')

        // The wire body, which is the whole reason `src/lib/units.ts` exists: 0.1 BTC at eight
        // decimals is exactly 10000000 satoshis, and 24999.00 at two is 2499900 cents.
        const body = sent[0]?.json as Record<string, unknown>
        assert.equal(body['qty'], '10000000')
        assert.equal(body['price'], '2499900')
        assert.equal(body['symbol'], SYMBOL)
        assert.equal(body['side'], 'buy')
        assert.equal(typeof body['qty'], 'string', 'a quantity went over the wire as a JSON number')
      },
    )
  })

  it('BJ-TRD-29 T1: the receipt renders what the engine did, rather than a toast that disappears', async () => {
    await withScreen(
      marketAt(),
      {
        url: `${ORIGIN}/markets/${SYMBOL}`,
        storage: fx.SIGNED_IN,
        routes: marketRoutes({
          'POST /v1/exchange/orders': {
            status: 201,
            body: {
              order: fx.order({ status: 'filled', filledQty: '10000000', averagePrice: '2500000' }),
              fills: [fx.fill({ qty: '10000000' })],
            },
          },
        }),
      },
      async (s) => {
        await s.type(s.byRole('textbox', /^Limit price/), '24999.00')
        await s.type(s.byRole('textbox', /^Quantity/), '0.1')
        await s.click(s.byRole('button', 'Buy BTC'))
        await s.settle(20)

        // A `role="status"` receipt, which is announced and which STAYS. What the engine did with an
        // order is not something to show for four seconds and take away.
        const receipt = s.allByRole('status').map((el) => s.textOf(el)).join(' ')
        assert.match(receipt, /Filled\./)
        assert.match(receipt, /1 fill\(s\), 0\.1 BTC in total/)
        assert.match(receipt, /of 25,000\.00 USD/)
        // The order id is a link, so the trail that explains it is one press away.
        assert.ok(s.byRole('link', fx.ORDER_ID.slice(0, 8)))
      },
    )
  })

  it('BJ-TRD-30 ★ T1: the receipt survives the reload it triggers itself', async () => {
    // The companion to BJ-TRD-29. Placing an order re-reads all six resources, and every one of
    // those reads puts its resource back into the loading state — so a page that gates on
    // `state === 'loading'` rather than on having no data throws the ticket away at exactly the
    // moment the customer is reading the answer to what they just did.
    await withScreen(
      marketAt(),
      {
        url: `${ORIGIN}/markets/${SYMBOL}`,
        storage: fx.SIGNED_IN,
        routes: marketRoutes({
          'POST /v1/exchange/orders': { status: 201, body: { order: fx.order(), fills: [] } },
        }),
      },
      async (s) => {
        await s.type(s.byRole('textbox', /^Limit price/), '24999.00')
        await s.type(s.byRole('textbox', /^Quantity/), '0.1')
        await s.click(s.byRole('button', 'Buy BTC'))
        await s.settle(20)

        // The second round of reads went out…
        assert.ok(
          s.api.matching(`GET /v1/exchange/markets/${SYMBOL}/depth`).length >= 2,
          'the page did not re-read the book after placing an order',
        )
        // …and the ticket is the same ticket, not a fresh one.
        assert.equal((s.byRole('textbox', /^Quantity/) as unknown as { value: string }).value, '0.1')
        assert.equal(
          (s.byRole('textbox', /^Limit price/) as unknown as { value: string }).value,
          '24999.00',
        )
      },
    )
  })

  it('BJ-TRD-31 T1: a refresh that FAILS leaves the stale figures up and says they are stale', async () => {
    let reads = 0
    await withScreen(
      marketAt(),
      {
        url: `${ORIGIN}/markets/${SYMBOL}`,
        storage: fx.SIGNED_IN,
        routes: marketRoutes({
          [`GET /v1/exchange/markets/${SYMBOL}`]: () => {
            reads += 1
            return reads === 1
              ? {
                  body: {
                    market: fx.market(),
                    bbo: { bid: '2499900', ask: '2500100' },
                    ticker: fx.ticker(),
                  },
                }
              : { status: 503, body: fx.error('unavailable', 'The market data is unavailable.') }
          },
          'POST /v1/exchange/orders': { status: 201, body: { order: fx.order(), fills: [] } },
        }),
      },
      async (s) => {
        await s.type(s.byRole('textbox', /^Limit price/), '24999.00')
        await s.type(s.byRole('textbox', /^Quantity/), '0.1')
        await s.click(s.byRole('button', 'Buy BTC'))
        await s.settle(20)

        assert.ok(reads >= 2, 'the second read never happened, so this scenario proved nothing')
        assert.match(s.text(), /The last refresh failed/)
        assert.match(s.text(), /as it was a moment ago/)
        // A book five seconds old is worth more to somebody holding an open order than an error page
        // with nothing on it, so the whole screen is still there.
        assert.ok(s.byRole('heading', 'Place an order'), 'the ticket went away on a failed refresh')
        assert.match(s.text(), /25,000\.00/)
        assert.ok(s.byRole('button', 'Try again now'))
      },
    )
  })

  it('BJ-TRD-32 T1: a refused order keeps the ticket on screen and quotes the request id', async () => {
    await withScreen(
      marketAt(),
      {
        url: `${ORIGIN}/markets/${SYMBOL}`,
        storage: fx.SIGNED_IN,
        routes: marketRoutes({
          'POST /v1/exchange/orders': {
            status: 400,
            body: fx.error('below_min_notional', 'The order is worth less than this market accepts.'),
            requestId: 'req-terminal-1',
          },
        }),
      },
      async (s) => {
        await s.type(s.byRole('textbox', /^Limit price/), '24999.00')
        await s.type(s.byRole('textbox', /^Quantity/), '0.001')
        await s.click(s.byRole('button', 'Buy BTC'))

        const alert = s.allByRole('alert').map((el) => s.textOf(el)).join(' ')
        // The service's own sentence, verbatim: a browser that paraphrased a refusal would be
        // guessing at a rule it was written against rather than the one that ran. The rule itself is
        // `trade`'s and is cited in `ownedBy`.
        assert.match(alert, /worth less than this market accepts/)
        assert.match(alert, /req-terminal-1/)
        // And the form is still there, still holding what was typed.
        assert.ok(s.byRole('button', 'Buy BTC'))
        assert.equal((s.byRole('textbox', /^Quantity/) as unknown as { value: string }).value, '0.001')
      },
    )
  })

  /* ── BJ-TRD-33 … 38: every control explains itself, to a keyboard as well as to a mouse ─────── */

  it('BJ-TRD-33 ★ T1: the explanation is a real button in the tab order, not a title attribute', async () => {
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: marketRoutes() },
      async (s) => {
        const trigger = s.byRole('button', 'What does Spread mean?')
        assert.equal(trigger.tagName.toLowerCase(), 'button')
        assert.equal(trigger.getAttribute('type'), 'button')
        assert.ok(
          s.tabbables().includes(trigger),
          'the explanation is not reachable by keyboard, which is what a title attribute already was',
        )
        // And it is not ALSO a `title`: the attribute reaches no touch device and no keyboard
        // (`src/components/tooltip.tsx` records the full list), so carrying one here would be the
        // rejected mechanism kept alive beside the built one and free to drift from it.
        assert.ok(!trigger.hasAttribute('title'), 'the trigger carries a title attribute as well')
      },
    )
  })

  it('BJ-TRD-34 T1: opening one announces itself as a tooltip and describes its own trigger', async () => {
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: marketRoutes() },
      async (s) => {
        const trigger = s.byRole('button', 'What does Spread mean?')
        assert.equal(trigger.getAttribute('aria-expanded'), 'false')
        assert.equal(s.allByRole('tooltip').length, 0)

        await s.click(trigger)

        assert.equal(trigger.getAttribute('aria-expanded'), 'true')
        const bubble = s.allByRole('tooltip')
        assert.equal(bubble.length, 1)
        const id = trigger.getAttribute('aria-describedby')
        assert.ok(id, 'the open tooltip is not referenced by aria-describedby')
        assert.equal(bubble[0]?.getAttribute('id'), id)
        assert.match(s.textOf(bubble[0]), /gap between the best buy offer and the best sell offer/i)
      },
    )
  })

  it('BJ-TRD-35 T1: Escape dismisses it, per SC 1.4.13, without moving the pointer', async () => {
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: marketRoutes() },
      async (s) => {
        const trigger = s.byRole('button', 'What does Spread mean?')
        await s.click(trigger)
        assert.equal(s.allByRole('tooltip').length, 1)

        await s.press('Escape')

        assert.equal(s.allByRole('tooltip').length, 0)
        assert.equal(trigger.getAttribute('aria-expanded'), 'false')
      },
    )
  })

  it('BJ-TRD-36 T1: the trigger toggles, so the same control both opens and shuts', async () => {
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: marketRoutes() },
      async (s) => {
        const trigger = s.byRole('button', 'What does Spread mean?')
        await s.click(trigger)
        await s.click(trigger)
        assert.equal(s.allByRole('tooltip').length, 0)
      },
    )
  })

  it('BJ-TRD-37 T1: every trigger names its term, so a button list is navigable', async () => {
    // Thirty buttons all called "help" is a list nobody can navigate. Each name is a question about
    // its own term, which is what makes the rotor useful on this screen at all.
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: marketRoutes() },
      async (s) => {
        const triggers = s
          .allByRole('button')
          .map((el) => el.getAttribute('aria-label') ?? '')
          .filter((name) => name.startsWith('What does '))
        assert.ok(triggers.length >= 8, `only ${triggers.length} explanations on the market screen`)
        assert.equal(new Set(triggers).size, triggers.length, `two triggers share a name: ${triggers}`)
      },
    )
  })

  it('BJ-TRD-38 T1: what changes what an order DOES is explained in the open, not behind a bubble', async () => {
    // The rule `src/components/tooltip.tsx` states: a customer who never opens a single bubble must
    // still be able to place an order they understand. These sentences are `tw-field__help` text.
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: marketRoutes() },
      async (s) => {
        assert.equal(s.allByRole('tooltip').length, 0, 'a bubble was open before anything was pressed')
        const text = s.text()
        assert.match(text, /Rests on the book at the price you name/i)
        assert.match(text, /you spend USD/i)
        assert.match(text, /This sends a real order to a real book/i)
      },
    )
  })

  /* ── BJ-TRD-39 … 40: a reader who cannot tell red from green loses nothing ──────────────────── */

  it('BJ-TRD-39 ★ T1: the tape says which side crossed the spread, in words', async () => {
    await withScreen(
      marketAt(),
      {
        url: `${ORIGIN}/markets/${SYMBOL}`,
        storage: fx.SIGNED_IN,
        routes: marketRoutes({
          [`GET /v1/exchange/markets/${SYMBOL}/trades`]: {
            body: {
              marketId: fx.MARKET_ID,
              trades: [fx.trade(), fx.trade({ id: 'second', takerSide: 'sell' })],
            },
          },
        }),
      },
      async (s) => {
        assert.match(s.text(), /Bought/)
        assert.match(s.text(), /Sold/)
      },
    )
  })

  it('BJ-TRD-40 T1: the candle chart has a table view carrying the same numbers', async () => {
    // BJ-A11Y-08's property, applied to the candles. The drawing is optional; the numbers are not.
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: marketRoutes() },
      async (s) => {
        // The caption carries the extremes as a person reads them…
        assert.match(s.text(), /High 26,000\.00, low 23,500\.00 USD/)

        // …and the table carries every bucket as the WIRE holds it: unformatted minor units, because
        // that table is the export path as well as the fallback, and a comma in a number somebody is
        // about to paste into a spreadsheet is a defect rather than a courtesy.
        const table = s.allByRole('table').find((el) => /Bucket start/.test(s.textOf(el)))
        assert.ok(table, 'the chart has no table view at all')
        const cells = [...table.querySelectorAll('tbody td')].map((el) => s.textOf(el))
        assert.deepEqual(cells.slice(0, 5), ['2400000', '2600000', '2350000', '2500000', '150000000'])
      },
    )
  })

  /* ── BJ-TRD-41 … 44: the markets list, the orders surface and the balances screen ───────────── */

  it('BJ-TRD-41 T1: the market list links each market to its own screen and states the fees', async () => {
    await withScreen(
      page(h(MarketsPage), '/markets'),
      {
        url: `${ORIGIN}/markets`,
        storage: fx.SIGNED_IN,
        routes: signedIn({
          'GET /v1/capabilities': { body: fx.capabilities() },
          'GET /v1/exchange/markets': {
            body: { markets: [fx.market(), fx.market({ id: 'm2', symbol: 'LTC-USD', baseAsset: 'LTC' })] },
          },
        }),
      },
      async (s) => {
        assert.ok(s.byRole('link', 'BTC-USD'))
        assert.ok(s.byRole('link', 'LTC-USD'))
        // 10 and 25 bps, printed as percentages by the integer helper rather than by a float.
        assert.match(s.text(), /0\.1%/)
        assert.match(s.text(), /0\.25%/)
      },
    )
  })

  it('BJ-TRD-42 ★ T1: cancelling sends a DELETE and NO idempotency key, and names the order', async () => {
    await withScreen(
      page(h(OrdersPage), '/orders'),
      {
        url: `${ORIGIN}/orders`,
        storage: fx.SIGNED_IN,
        routes: signedIn({
          'GET /v1/capabilities': { body: fx.capabilities() },
          'GET /v1/exchange/markets': { body: { markets: [fx.market()] } },
          [`DELETE /v1/exchange/orders/${fx.ORDER_ID}`]: {
            body: { order: fx.order({ status: 'cancelled' }) },
          },
          'GET /v1/exchange/orders': { body: { orders: [fx.order()] } },
        }),
      },
      async (s) => {
        // The accessible name says WHICH order, because a table of working orders offers one of
        // these controls per row and "Cancel" heard eight times names nothing.
        const cancel = s.byRole('button', new RegExp(`^Cancel order ${fx.ORDER_ID.slice(0, 8)}$`))
        await s.click(cancel)
        const sent = s.api.matching(`DELETE /v1/exchange/orders/${fx.ORDER_ID}`)
        assert.equal(sent.length, 1)
        assert.equal(
          sent[0]?.headers['idempotency-key'],
          undefined,
          'the cancel carried a key; the service takes none and the order id in the path is it',
        )
      },
    )
  })

  it('BJ-TRD-43 T1: an order’s history is rendered as the engine wrote it, in order', async () => {
    await withScreen(
      atRoute('/orders/:id', h(OrderPage), `/orders/${fx.ORDER_ID}`),
      {
        url: `${ORIGIN}/orders/${fx.ORDER_ID}`,
        storage: fx.SIGNED_IN,
        routes: signedIn({
          'GET /v1/capabilities': { body: fx.capabilities() },
          [`GET /v1/exchange/markets/${SYMBOL}`]: {
            body: { market: fx.market(), bbo: { bid: '2499900', ask: '2500100' }, ticker: fx.ticker() },
          },
          [`GET /v1/exchange/orders/${fx.ORDER_ID}/events`]: {
            body: {
              orderId: fx.ORDER_ID,
              events: [
                fx.orderEvent(),
                fx.orderEvent({
                  seq: '2',
                  kind: 'reduced',
                  qty: '5000000',
                  detail: 'Self-trade prevention reduced this order against your own.',
                }),
              ],
            },
          },
          [`GET /v1/exchange/orders/${fx.ORDER_ID}`]: { body: { order: fx.order() } },
          'GET /v1/exchange/fills': { body: { fills: [] } },
        }),
      },
      async (s) => {
        s.before('Accepted onto the book', 'Reduced in size', 'the trail is out of order')
        // The engine's own sentence, verbatim. `reduced` is the event a customer has no other way to
        // understand: their size shrank with no fill against it.
        assert.match(s.text(), /Self-trade prevention reduced this order against your own\./)
      },
    )
  })

  it('BJ-TRD-44 T1: balances render the service’s own total rather than two strings added', async () => {
    await withScreen(
      page(h(BalancesPage), '/balances'),
      {
        url: `${ORIGIN}/balances`,
        storage: fx.SIGNED_IN,
        routes: signedIn({
          'GET /v1/capabilities': { body: fx.capabilities() },
          'GET /v1/exchange/markets': { body: { markets: [fx.market()] } },
          'GET /v1/exchange/balances': { body: { balances: [fx.balance()] } },
          'GET /v1/exchange/transfers': { body: { transfers: [fx.transfer()] } },
        }),
      },
      async (s) => {
        const text = s.text()
        assert.match(text, /7,500\.10/)
        assert.match(text, /2,499\.90/)
        assert.match(text, /10,000\.00/)
        // Held is not lost money and the screen says so, because "why can I not withdraw all of it"
        // is the question this page exists to answer.
        assert.match(text, /it is still yours, and you cannot spend it twice/i)
        assert.match(text, /anything held by an open order stays until that order is done/i)
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
    // `terminal` is here in the BJ-TRD-08 sense — "stop is terminal", a state machine the service
    // owns — and it predates the exchange screens by a release. The trading screen is called the
    // market screen throughout `journeys.ts` so that BJ-TRD-14 … 44 are not all demanded an
    // `ownedBy` for naming the thing they run against. Widening the pattern to spell out which
    // sense is meant would be loosening the guard to suit the prose.
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

/**
 * The depth ladder's rows, cell by cell.
 *
 * Scoped to the order-book table rather than read off `s.text()` on purpose: the ticker at the top
 * of the market screen prints "24,999.00 / 25,001.00" too, so a document-order assertion over the
 * whole page would be comparing the ladder against the summary above it and would pass or fail for
 * reasons that have nothing to do with the book.
 */
function ladderRows(s: Screen): string[][] {
  const table = s.allByRole('table').find((el) => /Order book/.test(s.textOf(el)))
  assert.ok(table, 'there is no order-book table on the page at all')
  return [...table.querySelectorAll('tbody tr')].map((row) =>
    [...row.querySelectorAll('th, td')].map((cell) => s.textOf(cell)),
  )
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
    feesPaidUsdCents: '40',
    bestTradeUsdCents: '900',
    worstTradeUsdCents: '-450',
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
