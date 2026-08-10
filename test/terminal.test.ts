/**
 * THE TRADING SURFACE, IN A BROWSER, AGAINST STUBBED RESPONSES.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * These are doc 22 tier-1 scenarios in every respect except one: doc 22 has no rows for an order
 * book yet, because there was not one when it was written. `test/journeys.ts` is the catalogue of
 * the ids doc 22 DOES assign to this surface and a meta-test holds it to exactly those, so inventing
 * `BJ-TRD-14` here would be this repository writing entries in a register another repository keeps.
 * The scenarios live in their own file instead, under their own names, and the gap is recorded as an
 * issue against micro-org rather than papered over.
 *
 * Every rule doc 22 §3 imposes is kept regardless, because the rules are what make these worth
 * running:
 *
 *   * **No scenario asserts a business rule.** Not one of these checks that the engine refuses an
 *     under-sized order, matches by price-time priority, or holds the right escrow. Those are
 *     `trade`'s tests over `trade`'s code. What is asserted here is what a human can SEE relative to
 *     what the API returned in the same run, what the client SENT, and where the browser ended up.
 *   * **Elements are addressed by accessible role and name.** A markup change must not break these;
 *     an accessible-name change must.
 *   * **Nothing passes against a blank page.** `mount()` refuses to hand back a screen that rendered
 *     nothing, and several scenarios below additionally assert the number of requests that went out.
 *
 * ── The pair this file turns on ───────────────────────────────────────────────────────────────
 *
 * The gate has THREE answers and they are not two-and-a-half. "The book is off" quotes the service's
 * refusal; "we could not check" says exactly that and offers a retry; and an order-book block that is
 * ABSENT — a `trade` older than the exchange — reaches the first conclusion from silence. A bundle
 * that collapsed the middle case into either of the others would tell a customer their exchange is
 * switched off on the strength of a timeout, which is a claim about somebody else's deployment made
 * by a network error.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement as h, type ReactElement } from 'react'
import { MemoryRouter, Route, Routes as RouterRoutes } from 'react-router-dom'

import { withScreen, type Routes } from './dom.ts'
import * as fx from './fixtures.ts'
import { AuthProvider } from '../src/lib/auth.tsx'
import { BalancesPage } from '../src/pages/balances.tsx'
import { MarketPage } from '../src/pages/market.tsx'
import { MarketsPage } from '../src/pages/markets.tsx'
import { OrderPage } from '../src/pages/order.tsx'
import { OrdersPage } from '../src/pages/orders.tsx'

const ORIGIN = 'https://trade.cloudsforge.online'
const SYMBOL = 'BTC-USD'

const atRoute = (pattern: string, element: ReactElement, path: string): ReactElement =>
  h(
    MemoryRouter,
    { initialEntries: [path] },
    h(AuthProvider, null, h(RouterRoutes, null, h(Route, { path: pattern, element }))) as ReactElement,
  )

const page = (element: ReactElement, path: string): ReactElement =>
  h(MemoryRouter, { initialEntries: [path] }, h(AuthProvider, null, element) as ReactElement)

const marketAt = (symbol = SYMBOL) =>
  atRoute('/markets/:symbol', h(MarketPage), `/markets/${symbol}`)

const signedIn = (routes: Routes): Routes => ({ 'GET /auth/me': { body: fx.ME }, ...routes })

/**
 * The ladder's rows, cell by cell.
 *
 * Scoped rather than read off `s.text()` on purpose: the ticker at the top of the terminal prints
 * "24,999.00 / 25,001.00" too, so a document-order assertion over the whole page would be comparing
 * the ladder against the summary above it and would pass or fail for reasons that have nothing to
 * do with the book.
 */
function ladderRows(s: { allByRole: (r: 'table') => Element[]; textOf: (el: Element | null) => string }): string[][] {
  const table = s.allByRole('table').find((el) => /Order book/.test(s.textOf(el)))
  assert.ok(table, 'there is no order-book table on the page at all')
  return [...table.querySelectorAll('tbody tr')].map((row) =>
    [...row.querySelectorAll('th, td')].map((cell) => s.textOf(cell)),
  )
}

/** Every read the terminal makes, answered. Individual scenarios override the one they are about. */
const terminalRoutes = (over: Routes = {}): Routes =>
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
   THE GATE
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('whether this deployment has an exchange is asked, and the answer is not paraphrased', () => {
  it('quotes the service’s own refusal, and asks for no market data at all', async () => {
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

  it('reaches the same conclusion from an order-book block that is absent entirely', async () => {
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
        s.clean('capabilities without an orderBook block')
      },
    )
  })

  it('a capability read that FAILED is its own answer, not a refusal', async () => {
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

  it('opens the terminal when the book is on', async () => {
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: terminalRoutes() },
      async (s) => {
        assert.ok(s.byRole('heading', /^BTC-USD$/), 'the market has no heading')
        assert.ok(s.byRole('heading', 'The book'))
        assert.ok(s.byRole('heading', 'Place an order'))
        s.clean('the terminal with the book on')
      },
    )
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   THE LADDER
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the depth ladder', () => {
  it('puts the asks above the bids with the spread between them', async () => {
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: terminalRoutes() },
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

  it('states the spread as a figure the reader can check against the two sides', async () => {
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: terminalRoutes() },
      async (s) => {
        // 2500100 - 2499900 = 200 minor units = 2.00 quote. Computed by the page in bigint; this
        // asserts the printed result, which is the only part a customer sees.
        assert.match(s.text(), /2\.00 USD between the best bid and the best ask/)
      },
    )
  })

  it('accumulates the total column in the base asset’s own decimals', async () => {
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: terminalRoutes() },
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

  it('says the published size may be less than the real one, in words on the screen', async () => {
    // A reserve order publishes `displayQty` and hides the rest. A customer reading a thin book
    // that is not thin sizes their order wrongly, so this cannot live in a comment.
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: terminalRoutes() },
      async (s) => {
        assert.match(s.text(), /a level can hold more than it shows — never less/i)
      },
    )
  })

  it('an empty book is a state of the market, not a failure or a loading screen', async () => {
    await withScreen(
      marketAt(),
      {
        url: `${ORIGIN}/markets/${SYMBOL}`,
        storage: fx.SIGNED_IN,
        routes: terminalRoutes({
          [`GET /v1/exchange/markets/${SYMBOL}/depth`]: {
            body: {
              marketId: fx.MARKET_ID,
              symbol: SYMBOL,
              depth: { bids: [], asks: [] },
            },
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

  it('a one-sided book has no spread to report, and says that rather than printing one', async () => {
    await withScreen(
      marketAt(),
      {
        url: `${ORIGIN}/markets/${SYMBOL}`,
        storage: fx.SIGNED_IN,
        routes: terminalRoutes({
          [`GET /v1/exchange/markets/${SYMBOL}/depth`]: {
            body: {
              marketId: fx.MARKET_ID,
              symbol: SYMBOL,
              depth: { bids: fx.depth().bids, asks: [] },
            },
          },
        }),
      },
      async (s) => {
        assert.match(s.text(), /Nothing is quoted on the selling side/i)
      },
    )
  })

  it('every price is a button, and pressing one copies it into the ticket without sending anything', async () => {
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: terminalRoutes() },
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
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   THE TICKET
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the order ticket', () => {
  it('builds its controls from the vocabularies the deployment published', async () => {
    // Not from a copy of the enums. A deployment that serves three order types must offer three,
    // and one that serves a type this bundle has never heard of must still offer it.
    await withScreen(
      marketAt(),
      {
        url: `${ORIGIN}/markets/${SYMBOL}`,
        storage: fx.SIGNED_IN,
        routes: terminalRoutes({
          'GET /v1/capabilities': {
            body: fx.capabilities(
              fx.orderBook({ orderTypes: ['limit'], timeInForce: ['gtc', 'ioc'] }),
            ),
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

  it('restates the cost in the market’s own units before anything is sent', async () => {
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: terminalRoutes() },
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

  it('warns about a quantity off the lot grid WITHOUT blocking the send', async () => {
    // The note is advice; `validatePlacement` is the authority. A browser that refuses to send an
    // order the engine would have accepted is a browser standing between a customer and their money.
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: terminalRoutes() },
      async (s) => {
        await s.type(s.byRole('textbox', /^Limit price/), '25000.00')
        await s.type(s.byRole('textbox', /^Quantity/), '0.000000015')

        const go = s.byRole('button', 'Buy BTC')
        assert.ok(!go.hasAttribute('disabled'), 'the preflight disabled the submit button')
      },
    )
  })

  it('sends integer minor units, and one idempotency key under a double submit', async () => {
    let placements = 0
    await withScreen(
      marketAt(),
      {
        url: `${ORIGIN}/markets/${SYMBOL}`,
        storage: fx.SIGNED_IN,
        routes: terminalRoutes({
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

  it('renders what the engine did with it, rather than a toast that disappears', async () => {
    await withScreen(
      marketAt(),
      {
        url: `${ORIGIN}/markets/${SYMBOL}`,
        storage: fx.SIGNED_IN,
        routes: terminalRoutes({
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

  it('survives the reload it triggers itself, with what was typed still in the boxes', async () => {
    // The companion to the receipt scenario. Placing an order re-reads all six resources, and every
    // one of those reads puts its resource back into the loading state — so a page that gates on
    // `state === 'loading'` rather than on having no data throws the ticket away at exactly the
    // moment the customer is reading the answer to what they just did.
    await withScreen(
      marketAt(),
      {
        url: `${ORIGIN}/markets/${SYMBOL}`,
        storage: fx.SIGNED_IN,
        routes: terminalRoutes({
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

  it('a refresh that FAILS leaves the stale figures up and says they are stale', async () => {
    let reads = 0
    await withScreen(
      marketAt(),
      {
        url: `${ORIGIN}/markets/${SYMBOL}`,
        storage: fx.SIGNED_IN,
        routes: terminalRoutes({
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
        // with nothing on it, so the whole terminal is still there.
        assert.ok(s.byRole('heading', 'Place an order'), 'the ticket went away on a failed refresh')
        assert.match(s.text(), /25,000\.00/)
        assert.ok(s.byRole('button', 'Try again now'))
      },
    )
  })

  it('a refused order keeps the ticket on screen and quotes the request id', async () => {
    await withScreen(
      marketAt(),
      {
        url: `${ORIGIN}/markets/${SYMBOL}`,
        storage: fx.SIGNED_IN,
        routes: terminalRoutes({
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
        // guessing at a rule it was written against rather than the one that ran.
        assert.match(alert, /worth less than this market accepts/)
        assert.match(alert, /req-terminal-1/)
        // And the form is still there, still holding what was typed.
        assert.ok(s.byRole('button', 'Buy BTC'))
        assert.equal(
          (s.byRole('textbox', /^Quantity/) as unknown as { value: string }).value,
          '0.001',
        )
      },
    )
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   THE TOOLTIPS
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('every control explains itself, to a keyboard as well as to a mouse', () => {
  it('the explanation is a real button in the tab order, not a title attribute', async () => {
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: terminalRoutes() },
      async (s) => {
        const trigger = s.byRole('button', 'What does Spread mean?')
        assert.equal(trigger.tagName.toLowerCase(), 'button')
        assert.equal(trigger.getAttribute('type'), 'button')
        assert.ok(
          s.tabbables().includes(trigger),
          'the explanation is not reachable by keyboard, which is what a title attribute already was',
        )
      },
    )
  })

  it('opening one announces itself as a tooltip and describes its own trigger', async () => {
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: terminalRoutes() },
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

  it('Escape dismisses it, per SC 1.4.13, without moving the pointer', async () => {
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: terminalRoutes() },
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

  it('clicking the trigger again closes it, so the same control both opens and shuts', async () => {
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: terminalRoutes() },
      async (s) => {
        const trigger = s.byRole('button', 'What does Spread mean?')
        await s.click(trigger)
        await s.click(trigger)
        assert.equal(s.allByRole('tooltip').length, 0)
      },
    )
  })

  it('names the term in every trigger, so a button list is navigable', async () => {
    // Thirty buttons all called "help" is a list nobody can navigate. Each name is a question about
    // its own term, which is what makes the rotor useful on this screen at all.
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: terminalRoutes() },
      async (s) => {
        const triggers = s
          .allByRole('button')
          .map((el) => el.getAttribute('aria-label') ?? '')
          .filter((name) => name.startsWith('What does '))
        assert.ok(triggers.length >= 8, `only ${triggers.length} explanations on the terminal`)
        assert.equal(new Set(triggers).size, triggers.length, `two triggers share a name: ${triggers}`)
      },
    )
  })

  it('anything that changes what an order DOES is explained in the open, not behind a bubble', async () => {
    // The rule `src/components/tooltip.tsx` states: a customer who never opens a single bubble must
    // still be able to place an order they understand. These sentences are `tw-field__help` text.
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: terminalRoutes() },
      async (s) => {
        assert.equal(s.allByRole('tooltip').length, 0, 'a bubble was open before anything was pressed')
        const text = s.text()
        assert.match(text, /Rests on the book at the price you name/i)
        assert.match(text, /you spend USD/i)
        assert.match(text, /This sends a real order to a real book/i)
      },
    )
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   COLOUR IS NEVER THE ONLY CHANNEL
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('a reader who cannot tell red from green loses nothing', () => {
  it('the tape says which side crossed the spread, in words', async () => {
    await withScreen(
      marketAt(),
      {
        url: `${ORIGIN}/markets/${SYMBOL}`,
        storage: fx.SIGNED_IN,
        routes: terminalRoutes({
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

  it('the chart has a table view carrying the same numbers', async () => {
    // BJ-A11Y-08's property, applied to the candles. The drawing is optional; the numbers are not.
    await withScreen(
      marketAt(),
      { url: `${ORIGIN}/markets/${SYMBOL}`, storage: fx.SIGNED_IN, routes: terminalRoutes() },
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
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   THE OTHER FOUR SCREENS
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the market list', () => {
  it('links each market to its own terminal and states the fees from the response', async () => {
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
})

describe('the orders surface', () => {
  it('cancelling sends a DELETE and NO idempotency key, because the id in the path is the key', async () => {
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
        await s.click(s.byRole('button', /^Cancel order/))
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

  it('an order’s history is rendered as the engine wrote it, in order', async () => {
    await withScreen(
      atRoute('/orders/:id', h(OrderPage), `/orders/${fx.ORDER_ID}`),
      {
        url: `${ORIGIN}/orders/${fx.ORDER_ID}`,
        storage: fx.SIGNED_IN,
        routes: signedIn({
          'GET /v1/capabilities': { body: fx.capabilities() },
          [`GET /v1/exchange/markets/${SYMBOL}`]: {
            body: {
              market: fx.market(),
              bbo: { bid: '2499900', ask: '2500100' },
              ticker: fx.ticker(),
            },
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
})

describe('the balances screen', () => {
  it('renders the service’s own total rather than adding two decimal strings', async () => {
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
