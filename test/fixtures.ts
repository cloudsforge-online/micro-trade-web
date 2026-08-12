/**
 * The responses the scenarios are run against.
 *
 * Every shape is one `src/lib/trade.ts` declares, which was read out of `trade/src/` at the lines
 * that module cites. Typed against the client's own declarations so a drift between them is a type
 * error here rather than a scenario asserting a shape nothing produces.
 */
import type {
  Balance,
  Candle,
  Depth,
  Market,
  Order,
  OrderBookCapabilities,
  OrderEvent,
  OwnFill,
  PublicTrade,
  Ticker,
  Transfer,
} from '../src/lib/exchange.ts'
import type { Bot, Strategy, TradeCapabilities } from '../src/lib/trade.ts'

export const BOT_ID = '11111111-2222-3333-4444-555555555555'
export const BACKTEST_ID = '66666666-7777-8888-9999-000000000000'
export const SERIES_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
export const MARKET_ID = 'cccccccc-dddd-eeee-ffff-000000000000'
export const ORDER_ID = 'dddddddd-eeee-ffff-0000-111111111111'

export function strategy(over: Partial<Strategy> = {}): Strategy {
  return {
    id: 'sma_cross',
    name: 'Moving-average cross',
    family: 'trend',
    tagline: 'Buy when the fast average crosses the slow one.',
    weakness: 'It gives back most of a trend in a range-bound market.',
    params: [],
    ...over,
  }
}

export function bot(over: Partial<Bot> = {}): Bot {
  return {
    id: BOT_ID,
    userId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    name: 'First bot',
    mode: 'paper',
    status: 'draft',
    seriesId: SERIES_ID,
    strategyId: 'sma_cross',
    params: {},
    allocation: '100000',
    reservationEntryId: null,
    cash: '100000',
    position: '0',
    equity: '100000',
    // Null, because this bot is a draft and no tick has marked it. `insertBot` seeds `equity` from
    // the allocation — capital committed, not a valuation — so a fixture that claimed a price
    // source here would be a shape the service never writes (`trade/src/bots.ts`).
    equityPriceSource: null,
    highWaterMark: '100000',
    feeBps: 2000,
    feeOwed: '0',
    feePaid: '0',
    state: {},
    lastBarT: null,
    lastError: null,
    ...over,
  }
}

/* ══════════════════════════════ the exchange ══════════════════════════════ */

/**
 * BTC-USD, with the decimals that make the arithmetic in these scenarios legible.
 *
 * `baseDecimals: 8` and `quoteDecimals: 2` are the real pair for a coin against a fiat quote, and
 * they are chosen here for a second reason: they are DIFFERENT. A fixture where both scales are the
 * same passes for a screen that formats a quantity with the price's decimals, which is exactly the
 * defect that makes an order look a hundred times bigger than it is.
 *
 * Every amount is an integer count of minor units as a decimal string, the way the wire carries it.
 * `lotSize` 1000 satoshis and `tickSize` 100 cents satisfy the engine's `markets_notional_exact`
 * constraint (`lotSize * tickSize % 10^baseDecimals === 0`), so a notional computed from this
 * market is exact and `notionalOf` never has to decline.
 */
export function market(over: Partial<Market> = {}): Market {
  return {
    id: MARKET_ID,
    symbol: 'BTC-USD',
    baseAsset: 'BTC',
    quoteAsset: 'USD',
    baseDecimals: 8,
    quoteDecimals: 2,
    lotSize: '1000',
    tickSize: '100',
    minNotional: '1000',
    makerFeeBps: 10,
    takerFeeBps: 25,
    status: 'active',
    bandBps: 1000,
    referencePrice: '2500000',
    lastPrice: '2500000',
    lastTradedAt: '2026-08-07T12:00:00.000Z',
    band: { low: '2250000', high: '2750000' },
    ...over,
  }
}

export function ticker(over: Partial<Ticker> = {}): Ticker {
  return {
    marketId: MARKET_ID,
    last: '2500000',
    open: '2400000',
    high: '2600000',
    low: '2350000',
    baseVolume: '150000000',
    quoteVolume: '3750000000',
    trades: 412,
    changeBps: 416,
    ...over,
  }
}

/** A two-sided book: best bid 24,999.00, best ask 25,001.00, so the spread is 2.00. */
export function depth(over: Partial<Depth> = {}): Depth {
  return {
    bids: [
      { price: '2499900', qty: '50000000', orders: 3 },
      { price: '2499800', qty: '25000000', orders: 1 },
    ],
    asks: [
      { price: '2500100', qty: '40000000', orders: 2 },
      { price: '2500200', qty: '10000000', orders: 1 },
    ],
    ...over,
  }
}

export function trade(over: Partial<PublicTrade> = {}): PublicTrade {
  return {
    id: '99999999-0000-1111-2222-333333333333',
    seq: '4611686018427387904',
    price: '2500000',
    qty: '10000000',
    quoteQty: '250000',
    takerSide: 'buy',
    at: '2026-08-07T12:00:00.000Z',
    ...over,
  }
}

export function candle(over: Partial<Candle> = {}): Candle {
  return {
    t: 1_770_000_000,
    open: '2400000',
    high: '2600000',
    low: '2350000',
    close: '2500000',
    baseVolume: '150000000',
    quoteVolume: '3750000000',
    trades: 412,
    ...over,
  }
}

export function order(over: Partial<Order> = {}): Order {
  return {
    id: ORDER_ID,
    marketId: MARKET_ID,
    symbol: 'BTC-USD',
    sequence: '4611686018427387905',
    clientOrderId: null,
    side: 'buy',
    type: 'limit',
    price: '2499900',
    stopPrice: null,
    tif: 'gtc',
    postOnly: false,
    stp: 'cancel_taker',
    qty: '10000000',
    quoteQty: null,
    displayQty: null,
    remaining: '10000000',
    filledQty: '0',
    filledQuoteQty: '0',
    averagePrice: null,
    feeBase: '0',
    feeQuote: '0',
    heldAsset: 'USD',
    heldAmount: '249990',
    status: 'open',
    cancelReason: null,
    expiresAt: null,
    createdAt: '2026-08-07T12:00:00.000Z',
    updatedAt: '2026-08-07T12:00:00.000Z',
    ...over,
  }
}

export function orderEvent(over: Partial<OrderEvent> = {}): OrderEvent {
  return {
    seq: '1',
    kind: 'accepted',
    qty: '10000000',
    price: '2499900',
    detail: 'Accepted and resting on the book.',
    at: '2026-08-07T12:00:00.000Z',
    ...over,
  }
}

export function fill(over: Partial<OwnFill> = {}): OwnFill {
  return {
    tradeId: '88888888-9999-aaaa-bbbb-cccccccccccc',
    orderId: ORDER_ID,
    marketId: MARKET_ID,
    side: 'buy',
    role: 'maker',
    price: '2499900',
    qty: '5000000',
    quoteQty: '124995',
    // A buyer receives base and pays the fee in base (`trade/src/matching.ts`). 10 bps of 5000000
    // satoshis is 5000, computed the way `applyBps` computes it: integer, rounded down.
    fee: '5000',
    feeAsset: 'BTC',
    at: '2026-08-07T12:00:00.000Z',
    ...over,
  }
}

export function balance(over: Partial<Balance> = {}): Balance {
  return {
    asset: 'USD',
    available: '750010',
    held: '249990',
    // Served by the service rather than added here, and rendered rather than recomputed: every
    // client would otherwise "add two decimal strings as numbers to get it" (`trade/src/server.ts`).
    total: '1000000',
    ...over,
  }
}

export function transfer(over: Partial<Transfer> = {}): Transfer {
  return {
    id: '77777777-8888-9999-aaaa-bbbbbbbbbbbb',
    asset: 'USD',
    direction: 'deposit',
    amount: '1000000',
    status: 'settled',
    entryId: 'entry-1',
    error: null,
    createdAt: '2026-08-07T11:00:00.000Z',
    settledAt: '2026-08-07T11:00:01.000Z',
    ...over,
  }
}

/**
 * `GET /v1/capabilities` with the order book ON.
 *
 * The four vocabularies are the engine's frozen lists (`trade/src/exchange.ts`,
 * `trade/src/matching.ts`). The ticket builds its controls from these rather than from a copy of
 * the enums, so a fixture that trimmed one would be testing a deployment that does not exist.
 */
export function orderBook(over: Partial<OrderBookCapabilities> = {}): OrderBookCapabilities {
  return {
    enabled: true,
    orderTypes: ['limit', 'market', 'stop_limit', 'stop_market'],
    timeInForce: ['gtc', 'ioc', 'fok', 'gtd'],
    stpModes: ['cancel_taker', 'cancel_maker', 'cancel_both', 'decrement_and_cancel'],
    candleIntervals: ['1m', '5m', '1h', '1d'],
    ...over,
  }
}

/**
 * The same with the book OFF, carrying the service's own refusal sentence.
 *
 * `refusal` is present only when the flag is false (`trade/src/server.ts`), and the gate quotes it
 * verbatim — so this string is load-bearing: a scenario asserting the paraphrase instead would pass
 * against a bundle that had stopped quoting the service.
 */
export const ORDER_BOOK_OFF: OrderBookCapabilities = {
  enabled: false,
  refusal:
    'The order book is not enabled on this deployment. Set TRADE_EXCHANGE_ENABLED to turn it on.',
  orderTypes: [],
  timeInForce: [],
  stpModes: [],
  candleIntervals: [],
}

/**
 * `GET /v1/capabilities` as the whole document, with whatever order-book block is wanted.
 *
 * `null` means the block is ABSENT, which is a distinct case rather than a synonym for disabled: a
 * `trade` from before the exchange existed answers this route without the key at all, and the gate
 * has to reach the same conclusion from silence as it does from a refusal.
 */
export function capabilities(book: OrderBookCapabilities | null = orderBook()): {
  capabilities: TradeCapabilities
} {
  return {
    capabilities: {
      liveTrading: { enabled: true },
      ...(book === null ? {} : { orderBook: book }),
    },
  }
}

/** The estate's error envelope — nested, as `errorReply()` builds it in every service. */
export function error(code: string, message: string): { error: { code: string; message: string } } {
  return { error: { code, message } }
}

/** The two `cf.*` keys a signed-in browser holds. `src/lib/api.ts` reads exactly these. */
export const SIGNED_IN = {
  'cf.accessToken': 'access-token-stub',
  'cf.refreshToken': 'refresh-token-stub',
}

/** `GET /auth/me` as `identity/src/server.ts` returns it: the profile is nested. */
export const ME = {
  user: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', handle: 'trader', roles: ['customer'] },
  session: { id: 'session-1' },
  organisations: [],
}
