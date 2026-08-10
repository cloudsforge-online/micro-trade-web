/**
 * The ORDER BOOK surface of `trade`, as this app is allowed to use it.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * EVERY ROUTE BELOW WAS READ OUT OF `trade/src/server.ts`, ONE AT A TIME, THE SAME WAY
 * `src/lib/trade.ts` WAS.
 *
 * | Method | Path                                       | Authenticates | Idempotency-Key |
 * | ------ | ------------------------------------------ | ------------- | --------------- |
 * | GET    | /v1/exchange/markets                       | reader        | —               |
 * | GET    | /v1/exchange/markets/:symbol               | reader        | —               |
 * | GET    | /v1/exchange/markets/:symbol/depth         | reader        | —               |
 * | GET    | /v1/exchange/markets/:symbol/ticker        | reader        | —               |
 * | GET    | /v1/exchange/markets/:symbol/trades        | reader        | —               |
 * | GET    | /v1/exchange/markets/:symbol/candles       | reader        | —               |
 * | POST   | /v1/exchange/orders                        | writer        | **required**    |
 * | GET    | /v1/exchange/orders                        | reader        | —               |
 * | GET    | /v1/exchange/orders/:id                    | reader        | —               |
 * | GET    | /v1/exchange/orders/:id/events             | reader        | —               |
 * | DELETE | /v1/exchange/orders/:id                    | writer        | **none**        |
 * | POST   | /v1/exchange/orders/cancel-all             | writer        | **required**    |
 * | GET    | /v1/exchange/fills                         | reader        | —               |
 * | GET    | /v1/exchange/balances                      | reader        | —               |
 * | POST   | /v1/exchange/transfers                     | writer        | **required**    |
 * | GET    | /v1/exchange/transfers                     | reader        | —               |
 *
 * `reader` and `writer` are HELPERS, not a laxer kind of authentication — each calls
 * `authenticate(ctx, deps)`, checks a scope for a service principal, and then spends a rate-limit
 * quota (`trade/src/server.ts`). They are named in the table because a check that grepped each
 * handler for a literal `authenticate(` would declare all sixteen unauthenticated and a client
 * built on that answer would send them no bearer; that is the defect micro-org#235 records, and
 * `test/trade.test.ts` asserts which spelling each route uses rather than merely whether.
 *
 * `DELETE /v1/exchange/orders/:id` is the one mutation with no key, and the service says why: "the
 * order id in the path IS the idempotency key". A second delete answers **409** naming the state the
 * order is already in, which is information the caller needs — a 200 for a cancel that cancelled
 * nothing is how somebody comes to believe they are flat when they are not.
 *
 * ── ONE ROUTE IS DELIBERATELY NOT CALLED FROM A BROWSER ───────────────────────────────────────
 *
 * `POST /v1/exchange/markets/:symbol/status` halts a market and lets it back up. It calls
 * `requireOperator` (`trade/src/server.ts`), which demands `trade:admin` or `role:admin`.
 * Halting a market is an incident control, it belongs on the operator console, and a customer app
 * that offered it would be offering a button that can only ever 403.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── THE WHOLE SURFACE IS BEHIND ONE FLAG, AND A 503 IS THE NORMAL ANSWER ──────────────────────
 *
 * Every route above is registered through `exchangeRoute` rather than `define`
 * (`trade/src/server.ts`), which refuses with `ExchangeDisabledError` — HTTP **503**, code
 * `exchange_disabled` — when `TRADE_EXCHANGE_ENABLED` is false. It is false by default.
 *
 * So a deployment without the order book is not a broken deployment, and this app must not present
 * it as one. `GET /v1/capabilities` reports `orderBook.enabled` and, when it is off, the service's
 * own refusal sentence; every screen here reads that BEFORE it asks for market data, and says the
 * order book is not switched on here rather than rendering a failure state over a 503 that is
 * working as designed. `isExchangeDisabled` below is the same judgement for the case where a
 * deployment is switched off between the capability read and the next call.
 *
 * ── EVERY AMOUNT IS AN INTEGER IN MINOR UNITS, AS A STRING, AND STAYS ONE ─────────────────────
 *
 * Quantities are base-asset minor units; prices are quote-asset minor units per ONE WHOLE base
 * unit; notionals, fees and balances are quote- or base-asset minor units. Nothing in this module
 * parses one, and `src/lib/units.ts` is the only place in this bundle that converts between a
 * minor-unit integer and something a person reads. `sequence` and `seq` are `bigserial` values and
 * arrive as strings for the same reason: the book's whole ordering rests on them and a JSON number
 * would round them above 2^53.
 */
import { ApiError, api } from './api.ts'

/* ══════════════════════════════ the vocabularies ══════════════════════════════ */

/**
 * The order types a placement may name — `PLACED_ORDER_TYPES`, `trade/src/exchange.ts`.
 *
 * Served at runtime by `GET /v1/capabilities` as `orderBook.orderTypes`, and the service's comment
 * on that route says why: "The browser builds its controls from this rather than from a copy of the
 * enums, so a deployment that gains a new order type gains the control for it without a second
 * release, and a browser can never offer a choice the engine will refuse." These declarations are
 * the TYPE of what arrives, never the list — the list comes off the wire.
 */
export type PlacedOrderType = 'limit' | 'market' | 'stop_limit' | 'stop_market'

/** `trade/src/matching.ts`. */
export type TimeInForce = 'gtc' | 'ioc' | 'fok' | 'gtd'

/** `trade/src/matching.ts`. The TAKER's mode governs the interaction. */
export type StpMode = 'cancel_taker' | 'cancel_maker' | 'cancel_both' | 'decrement_and_cancel'

/** `trade/src/orders.ts`. `pending_trigger` is a stop that has not fired: held, but not on the book. */
export type OrderStatus =
  | 'pending_trigger'
  | 'open'
  | 'filled'
  | 'cancelled'
  | 'rejected'
  | 'expired'

/** `trade/src/orders.ts`. Append-only; this is the trail that answers "why did my order do that". */
export type OrderEventKind =
  | 'accepted'
  | 'triggered'
  | 'filled'
  | 'cancelled'
  | 'rejected'
  | 'expired'
  | 'reduced'

/** `trade/src/markets.ts`. */
export type MarketStatus = 'active' | 'post_only' | 'cancel_only' | 'halted'

export type Side = 'buy' | 'sell'
export type FillRole = 'maker' | 'taker'

/** `trade/src/transfers.ts`. `unresolved` is a real outcome, not a failure. */
export type TransferStatus = 'pending' | 'settled' | 'refused' | 'unresolved'
export type TransferDirection = 'deposit' | 'withdrawal'

/**
 * What `GET /v1/capabilities` reports about the order book — `trade/src/server.ts`.
 *
 * The four vocabularies are the engine's own frozen lists. A control built from them cannot offer a
 * choice the engine will refuse, and a deployment that gains a new order type gains the control
 * without this bundle being rebuilt.
 */
export interface OrderBookCapabilities {
  readonly enabled: boolean
  /** The service's own sentence, present only when the order book is switched off. */
  readonly refusal?: string
  readonly orderTypes: readonly PlacedOrderType[]
  readonly timeInForce: readonly TimeInForce[]
  readonly stpModes: readonly StpMode[]
  readonly candleIntervals: readonly string[]
}

/* ══════════════════════════════ the records ══════════════════════════════ */

/**
 * One market, as `marketView` puts it on the wire (`trade/src/server.ts`).
 *
 * `band` is served rather than left for the client to compute, and the service says why: so that
 * "the browser's fat-finger warning and the service's refusal are the same arithmetic". `null` means
 * the market has never traded and there is nothing to measure a price against yet.
 */
export interface Market {
  readonly id: string
  readonly symbol: string
  readonly baseAsset: string
  readonly quoteAsset: string
  readonly baseDecimals: number
  readonly quoteDecimals: number
  /** Base minor units. Every quantity must be a whole multiple of this. */
  readonly lotSize: string
  /** Quote minor units. Every price must be a whole multiple of this. */
  readonly tickSize: string
  /** Quote minor units. The smallest order the market will accept, measured in the quote asset. */
  readonly minNotional: string
  readonly makerFeeBps: number
  readonly takerFeeBps: number
  readonly status: MarketStatus
  readonly bandBps: number
  readonly referencePrice: string | null
  readonly lastPrice: string | null
  readonly lastTradedAt: string | null
  readonly band: { readonly low: string; readonly high: string } | null
}

/** The top of the book. Either side is null when nobody is quoting it. */
export interface Bbo {
  readonly bid: string | null
  readonly ask: string | null
}

/** The rolling 24 hours — `tickerView`, `trade/src/server.ts`. */
export interface Ticker {
  readonly marketId: string
  readonly last: string | null
  readonly open: string | null
  readonly high: string | null
  readonly low: string | null
  readonly baseVolume: string
  readonly quoteVolume: string
  readonly trades: number
  /** The change over the window in basis points, integer. Zero when the window has no open. */
  readonly changeBps: number
}

/**
 * One price level — `depthView`, `trade/src/server.ts`.
 *
 * `qty` is the PUBLISHED size and not necessarily the real one: a reserve order publishes
 * `displayQty` and hides the rest (`trade/src/marketdata.ts`). The depth ladder in this app
 * says so on the screen rather than in a comment, because a customer reading a thin book that is
 * not thin will size their order wrongly.
 */
export interface DepthLevel {
  readonly price: string
  readonly qty: string
  readonly orders: number
}

export interface Depth {
  readonly bids: readonly DepthLevel[]
  readonly asks: readonly DepthLevel[]
}

/**
 * One printed trade — `publicTradeView`, `trade/src/server.ts`.
 *
 * The tape carries no counterparty at all. `takerSide` is the aggressor's side, which is what makes
 * a tape readable as pressure rather than as a list of prices.
 */
export interface PublicTrade {
  readonly id: string
  readonly seq: string
  readonly price: string
  readonly qty: string
  readonly quoteQty: string
  readonly takerSide: Side
  readonly at: string
}

/** One candle — `candleView`, `trade/src/server.ts`. `t` is the bucket start, in unix seconds. */
export interface Candle {
  readonly t: number
  readonly open: string
  readonly high: string
  readonly low: string
  readonly close: string
  readonly baseVolume: string
  readonly quoteVolume: string
  readonly trades: number
}

/**
 * One order, as `orderView` puts it on the wire (`trade/src/server.ts`).
 *
 * `averagePrice` is computed from the TOTALS rather than averaged across fills — an average of
 * averages is wrong whenever the fills were different sizes (`trade/src/orders.ts`) — and is
 * null when the order has never traded.
 *
 * `heldAsset`/`heldAmount` are the escrow this order still owns. A terminal order holds nothing;
 * `src/pages/orders.tsx` renders the pair because "what of mine is tied up in this" is the question
 * a customer actually has, and the balances screen can only answer it in aggregate.
 */
export interface Order {
  readonly id: string
  readonly marketId: string
  readonly symbol: string | null
  /** A `bigserial` as a string: arrival rank, and the book's entire tie-break. */
  readonly sequence: string
  readonly clientOrderId: string | null
  readonly side: Side
  readonly type: PlacedOrderType
  readonly price: string | null
  readonly stopPrice: string | null
  readonly tif: TimeInForce
  readonly postOnly: boolean
  readonly stp: StpMode
  readonly qty: string | null
  readonly quoteQty: string | null
  readonly displayQty: string | null
  readonly remaining: string
  readonly filledQty: string
  readonly filledQuoteQty: string
  readonly averagePrice: string | null
  readonly feeBase: string
  readonly feeQuote: string
  readonly heldAsset: string | null
  readonly heldAmount: string
  readonly status: OrderStatus
  readonly cancelReason: string | null
  readonly expiresAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

/** One entry in an order's own history — `orderEventView`, `trade/src/server.ts`. */
export interface OrderEvent {
  readonly seq: string
  readonly kind: OrderEventKind
  readonly qty: string
  readonly price: string | null
  readonly detail: string | null
  readonly at: string
}

/**
 * One of the caller's own fills — `fillView`, `trade/src/server.ts`.
 *
 * `fee` is charged in the asset the side RECEIVES (`feeAsset`), which is the rule that makes escrow
 * exact with no fee term: a buyer receives base and pays in base, a seller receives quote and pays
 * in quote (`trade/src/matching.ts`). A screen that assumed the fee was always quote-denominated
 * would misreport half of every trade.
 */
export interface OwnFill {
  readonly tradeId: string
  readonly orderId: string
  readonly marketId: string
  readonly side: Side
  readonly role: FillRole
  readonly price: string
  readonly qty: string
  readonly quoteQty: string
  readonly fee: string
  readonly feeAsset: string
  readonly at: string
}

/**
 * One asset in exchange custody — `balanceView`, `trade/src/server.ts`.
 *
 * `total` is derived by the service because every client wants it "and each of them would otherwise
 * add two decimal strings as numbers to get it". This app renders the service's `total` rather than
 * adding the two itself, for exactly that reason.
 */
export interface Balance {
  readonly asset: string
  readonly available: string
  readonly held: string
  readonly total: string
}

/** One movement across the custody boundary — `transferView`, `trade/src/server.ts`. */
export interface Transfer {
  readonly id: string
  readonly asset: string
  readonly direction: TransferDirection
  readonly amount: string
  readonly status: TransferStatus
  readonly entryId: string | null
  readonly error: string | null
  readonly createdAt: string
  readonly settledAt: string | null
}

/* ══════════════════════════════ the 503 that is not a failure ══════════════════════════════ */

/** How the service spells the order book being switched off. `trade/src/server.ts`. */
export const EXCHANGE_DISABLED_CODE = 'exchange_disabled'

/**
 * Whether a caught error is "the order book is not switched on here" rather than a fault.
 *
 * Tested on the CODE and not on the status, because 503 is also what a service answers while it is
 * genuinely unwell, and telling a customer their exchange is off when it is merely restarting is as
 * wrong as the reverse.
 */
export function isExchangeDisabled(err: unknown): boolean {
  return err instanceof ApiError && err.code === EXCHANGE_DISABLED_CODE
}

/* ══════════════════════════════ market data ══════════════════════════════ */

/**
 * `GET /v1/exchange/markets` — `trade/src/server.ts`.
 *
 * Authenticated, like every route here. The CONTENT is public — the tape carries no counterparty —
 * but the ACCESS is not, and `trade/src/marketdata.ts` gives the reason: the rate limiter has no
 * subject to meter an anonymous caller by.
 */
export function listMarkets(signal?: AbortSignal): Promise<{ markets: readonly Market[] }> {
  return api<{ markets: readonly Market[] }>('/v1/exchange/markets', {
    ...(signal ? { signal } : {}),
  })
}

/**
 * `GET /v1/exchange/markets/:symbol` — `trade/src/server.ts`.
 *
 * Four facts in one response — the rules, the band, the top of the book, the day — because, in the
 * service's words, "a client that has to make four calls to draw one screen will make them in four
 * different moments and draw a market that never existed". The path segment takes a symbol or a
 * uuid.
 */
export function getMarket(
  symbol: string,
  signal?: AbortSignal,
): Promise<{ market: Market; bbo: Bbo; ticker: Ticker }> {
  return api<{ market: Market; bbo: Bbo; ticker: Ticker }>(
    `/v1/exchange/markets/${encodeURIComponent(symbol)}`,
    { ...(signal ? { signal } : {}) },
  )
}

/** `GET /v1/exchange/markets/:symbol/depth` — `trade/src/server.ts`. Default 50 levels, max 500. */
export function getDepth(
  symbol: string,
  limit: number,
  signal?: AbortSignal,
): Promise<{ marketId: string; symbol: string; depth: Depth }> {
  return api<{ marketId: string; symbol: string; depth: Depth }>(
    `/v1/exchange/markets/${encodeURIComponent(symbol)}/depth`,
    { query: { limit }, ...(signal ? { signal } : {}) },
  )
}

/** `GET /v1/exchange/markets/:symbol/ticker` — `trade/src/server.ts`. The rolling 24 hours. */
export function getTicker(symbol: string, signal?: AbortSignal): Promise<{ ticker: Ticker }> {
  return api<{ ticker: Ticker }>(`/v1/exchange/markets/${encodeURIComponent(symbol)}/ticker`, {
    ...(signal ? { signal } : {}),
  })
}

/** `GET /v1/exchange/markets/:symbol/trades` — `trade/src/server.ts`. Newest first. */
export function getTrades(
  symbol: string,
  limit: number,
  signal?: AbortSignal,
): Promise<{ marketId: string; trades: readonly PublicTrade[] }> {
  return api<{ marketId: string; trades: readonly PublicTrade[] }>(
    `/v1/exchange/markets/${encodeURIComponent(symbol)}/trades`,
    { query: { limit }, ...(signal ? { signal } : {}) },
  )
}

/**
 * `GET /v1/exchange/markets/:symbol/candles` — `trade/src/server.ts`.
 *
 * An interval the service does not know is a **400** naming the ones it does
 * (`isCandleInterval`), so the caller passes one out of
 * `capabilities.orderBook.candleIntervals` rather than a literal of its own.
 */
export function getCandles(
  symbol: string,
  interval: string,
  limit: number,
  signal?: AbortSignal,
): Promise<{ marketId: string; interval: string; candles: readonly Candle[] }> {
  return api<{ marketId: string; interval: string; candles: readonly Candle[] }>(
    `/v1/exchange/markets/${encodeURIComponent(symbol)}/candles`,
    { query: { interval, limit }, ...(signal ? { signal } : {}) },
  )
}

/* ══════════════════════════════ orders ══════════════════════════════ */

/**
 * A placement, exactly as `placementFrom` reads it (`trade/src/server.ts`).
 *
 * Every amount is a decimal string of minor units. `qty` and `quoteQty` are mutually exclusive and
 * exactly one must be present (`size_ambiguous`), and `quoteQty` sizes a market BUY only
 * (`quote_size_not_allowed`) — the form enforces neither by itself; it renders the service's own
 * refusal, because a browser that pre-empts a rule can only ever pre-empt the version of the rule it
 * was written against.
 */
export interface PlaceOrderInput {
  readonly symbol: string
  readonly side: Side
  readonly type: PlacedOrderType
  readonly price?: string
  readonly stopPrice?: string
  readonly qty?: string
  readonly quoteQty?: string
  readonly tif?: TimeInForce
  readonly postOnly?: boolean
  readonly stp?: StpMode
  readonly displayQty?: string
  readonly clientOrderId?: string
  /** Epoch milliseconds or an ISO-8601 instant. Refused when it is already in the past. */
  readonly expiresAt?: string | number
}

/**
 * `POST /v1/exchange/orders` — `trade/src/server.ts`.
 *
 * **201 fresh, 200 on a replay.** The claim and the placement share one transaction, so there is no
 * instant in which a key is claimed for a trade that did not happen. A key reused with so much as a
 * different quantity is a **409**, not a replay, "because the alternative is answering a customer's
 * second, different order with the receipt for their first one".
 *
 * `fills` is filtered to the caller's own side. A placement can print trades belonging to other
 * customers — a stop of theirs that this order's price fired — and those are not this caller's to
 * see.
 */
export function placeOrder(
  idempotencyKey: string,
  input: PlaceOrderInput,
): Promise<{ order: Order; fills: readonly OwnFill[] }> {
  return api<{ order: Order; fills: readonly OwnFill[] }>('/v1/exchange/orders', {
    method: 'POST',
    body: input,
    headers: { 'idempotency-key': idempotencyKey },
  })
}

/**
 * `GET /v1/exchange/orders` — `trade/src/server.ts`.
 *
 * The caller's own, newest first. `open` narrows to `pending_trigger` and `open`, which is the
 * working set; without it the list is the history. The `userId` parameter is deliberately not
 * exposed here for the same reason as on the backtest list: `ownerOf` honours it only for an admin
 * principal and otherwise refuses a mismatch, so from this bundle it can only ever be the caller's
 * own id or a 403.
 */
export function listOrders(
  options: { market?: string | undefined; open?: boolean | undefined; limit: number },
  signal?: AbortSignal,
): Promise<{ orders: readonly Order[] }> {
  return api<{ orders: readonly Order[] }>('/v1/exchange/orders', {
    query: {
      limit: options.limit,
      ...(options.market ? { market: options.market } : {}),
      ...(options.open ? { open: 'true' } : {}),
    },
    ...(signal ? { signal } : {}),
  })
}

/**
 * `GET /v1/exchange/orders/:id` — `trade/src/server.ts`.
 *
 * Somebody else's order is a **404**, not a 403: the ownership filter is in the WHERE clause, and
 * `trade/src/orders.ts` says why — "a 403 confirms the id exists, which is enough to enumerate
 * the exchange's order ids".
 */
export function getOrder(id: string, signal?: AbortSignal): Promise<{ order: Order }> {
  return api<{ order: Order }>(`/v1/exchange/orders/${encodeURIComponent(id)}`, {
    ...(signal ? { signal } : {}),
  })
}

/**
 * `GET /v1/exchange/orders/:id/events` — `trade/src/server.ts`.
 *
 * Append-only and served verbatim: "this is the surface that answers 'why did my order do that',
 * and it answers it with what was written at the time rather than with a state machine's guess
 * reconstructed afterwards."
 */
export function getOrderEvents(
  id: string,
  signal?: AbortSignal,
): Promise<{ orderId: string; events: readonly OrderEvent[] }> {
  return api<{ orderId: string; events: readonly OrderEvent[] }>(
    `/v1/exchange/orders/${encodeURIComponent(id)}/events`,
    { ...(signal ? { signal } : {}) },
  )
}

/**
 * `DELETE /v1/exchange/orders/:id` — `trade/src/server.ts`.
 *
 * **No `Idempotency-Key`, on purpose**: the order id in the path is the key. A second cancel of the
 * same order is a **409** naming the state it is already in, and this app renders that rather than
 * hiding it — "answering 200 to a cancel that cancelled nothing is how somebody comes to believe
 * they are flat when they are not".
 */
export function cancelOrder(id: string): Promise<{ order: Order }> {
  return api<{ order: Order }>(`/v1/exchange/orders/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

/**
 * `POST /v1/exchange/orders/cancel-all` — `trade/src/server.ts`.
 *
 * The panic button. It takes a key even though mass cancellation is naturally repeatable, and the
 * service explains the exception: a retried mass cancel that has already run "would answer with an
 * empty list, and 'we cancelled nothing' is the wrong answer to give somebody who just hit the panic
 * button and lost their connection". The claim replays the FIRST attempt's list, so this app can
 * show what was really pulled.
 *
 * Omit `symbol` to cancel across every market.
 */
export function cancelAllOrders(
  idempotencyKey: string,
  symbol?: string,
): Promise<{ cancelled: readonly Order[] }> {
  return api<{ cancelled: readonly Order[] }>('/v1/exchange/orders/cancel-all', {
    method: 'POST',
    body: symbol ? { symbol } : {},
    headers: { 'idempotency-key': idempotencyKey },
  })
}

/** `GET /v1/exchange/fills` — `trade/src/server.ts`. The caller's own fills, newest first. */
export function listFills(
  options: { market?: string | undefined; limit: number },
  signal?: AbortSignal,
): Promise<{ fills: readonly OwnFill[] }> {
  return api<{ fills: readonly OwnFill[] }>('/v1/exchange/fills', {
    query: { limit: options.limit, ...(options.market ? { market: options.market } : {}) },
    ...(signal ? { signal } : {}),
  })
}

/* ══════════════════════════════ custody ══════════════════════════════ */

/** `GET /v1/exchange/balances` — `trade/src/server.ts`. Available, held, and the total. */
export function listBalances(signal?: AbortSignal): Promise<{ balances: readonly Balance[] }> {
  return api<{ balances: readonly Balance[] }>('/v1/exchange/balances', {
    ...(signal ? { signal } : {}),
  })
}

/**
 * `POST /v1/exchange/transfers` — `trade/src/server.ts`.
 *
 * **`outcome` is the answer to "did my money move", and it is not the HTTP status.** The claim
 * commits first and the ledger is called afterwards, so a transfer can come back `unresolved`: the
 * debit stands, a job will ask the ledger again, and the customer must not be told either "done" or
 * "it failed" when neither is known. This app renders all four outcomes as themselves.
 *
 * A retry of the same request under the same key is also the RECOVERY path: the stored response is
 * the transfer id alone, so a replay reads the current state and settles a transfer a crash left
 * pending.
 */
export function createTransfer(
  idempotencyKey: string,
  input: { direction: TransferDirection; asset: string; amount: string },
): Promise<{ transfer: Transfer; outcome: TransferStatus }> {
  return api<{ transfer: Transfer; outcome: TransferStatus }>('/v1/exchange/transfers', {
    method: 'POST',
    body: input,
    headers: { 'idempotency-key': idempotencyKey },
  })
}

/** `GET /v1/exchange/transfers` — `trade/src/server.ts`. Newest first. */
export function listTransfers(
  limit: number,
  signal?: AbortSignal,
): Promise<{ transfers: readonly Transfer[] }> {
  return api<{ transfers: readonly Transfer[] }>('/v1/exchange/transfers', {
    query: { limit },
    ...(signal ? { signal } : {}),
  })
}
