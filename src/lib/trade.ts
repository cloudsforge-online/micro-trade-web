/**
 * The `trade` surface, as this app is allowed to use it.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * EVERY ROUTE BELOW WAS READ OUT OF `trade/src/server.ts`, ONE AT A TIME, AND CARRIES THE LINE IT
 * WAS READ FROM.
 *
 * Not inferred from a sibling client, and not copied from `@cloudsforge/sdk` — that table is a
 * second reading of the same source and agreeing with it is evidence, not a shortcut. Eight
 * clients in this estate were built against a surface somebody imagined; one of them made every
 * on-chain escrow activation fail with a false diagnosis, one made every project page read "not
 * yet indexed" permanently, and one sent a bearer token to a route with no `authenticate()` call
 * and then had to explain a 403 that was never about authorisation.
 *
 * `trade` registers its routes through one `define(method, path, handler)` list
 * (`trade/src/server.ts:314-755`), so the surface is enumerable and the citations are stable.
 * `test/trade.test.ts` reads that file and fails if any line below is off by one.
 *
 * | Method | Path                        | Authenticates      | Idempotency-Key | Verified at             |
 * | ------ | --------------------------- | ------------------ | --------------- | ----------------------- |
 * | GET    | /v1/strategies              | **no**             | —               | trade/src/server.ts:342 |
 * | GET    | /v1/series                  | yes                | —               | trade/src/server.ts:373 |
 * | GET    | /v1/backtests               | yes                | —               | trade/src/server.ts:419 |
 * | GET    | /v1/backtests/:id           | yes                | —               | trade/src/server.ts:427 |
 * | POST   | /v1/backtests               | yes                | **required**    | trade/src/server.ts:464 |
 * | GET    | /v1/bots                    | yes                | —               | trade/src/server.ts:540 |
 * | GET    | /v1/bots/:id                | yes, via ownedBot  | —               | trade/src/server.ts:548 |
 * | GET    | /v1/bots/:id/fills          | yes, via ownedBot  | —               | trade/src/server.ts:553 |
 * | GET    | /v1/bots/:id/settlements    | yes, via ownedBot  | —               | trade/src/server.ts:571 |
 * | POST   | /v1/bots                    | yes                | **required**    | trade/src/server.ts:591 |
 * | POST   | /v1/bots/:id/actions        | yes, via ownedBot  | **required**    | trade/src/server.ts:651 |
 *
 * "via ownedBot" is not a stylistic note. Those four handlers contain no literal
 * `await authenticate(ctx, deps)` — they call `ownedBot(ctx, deps, SCOPE)`, which authenticates at
 * `trade/src/server.ts:806` and then 404s a bot belonging to somebody else
 * (`trade/src/server.ts:809-810`). A test that grepped each handler body for `authenticate(` would
 * declare all four unauthenticated and this client would then send them no token. The cross-check
 * in `test/trade.test.ts` therefore accepts either spelling and asserts which one each route uses.
 *
 * ── Three routes exist and are deliberately NOT called from a browser ─────────────────────────
 *
 *   * `POST /v1/series` (`trade/src/server.ts:378`) and `POST /v1/series/:id/bars`
 *     (`trade/src/server.ts:391`) both call `requireOperator` (`:343`, `:356`), which demands
 *     `trade:admin` or `role:admin` (`trade/src/server.ts:787-790`). Candle data is not a
 *     customer's to publish; the operator console is where that belongs.
 *   * `POST /v1/events` (`trade/src/server.ts:720`) is the inbound webhook. It is not a bearer
 *     surface at all — the credential is an HMAC over the raw bytes, and it answers **403** to an
 *     unsigned caller (`trade/src/server.ts:723-727`). A browser has no business holding that
 *     secret.
 *
 * `/livez`, `/readyz` and `/metrics` (`server.ts:307`, `:309`, `:317`) are the platform probes and
 * are not wrapped here either.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── Every mutation carries an Idempotency-Key, and that is a fact rather than a nicety ─────────
 *
 * All three POSTs this client makes call `idempotencyKeyOf` and answer **400** without the header
 * (`trade/src/server.ts:840-848`). That is the opposite of `mint`, which reads no such header
 * anywhere — so a client copied from micro-mint-web would fail every write with a message about a
 * header it had never heard of. See `src/lib/idempotency.ts` for when a key may be presented
 * twice, which is the part that is easy to get backwards.
 *
 * ── Amounts are strings, everywhere, and nothing here parses one with Number ──────────────────
 *
 * `backtestView` and `botView` (`trade/src/server.ts:822-838`) put every amount on the wire as a
 * decimal string, and the comment above them says why: "`JSON.stringify` **throws** on a bigint".
 * A position in a token's smallest units does not survive an IEEE 754 double. Shards are whole
 * units (100 Shards = 1 USD, `trade/src/money.ts:18`), so a Shard balance would survive one — but
 * `qty` and `priceScaled` would not, and one rule is easier to keep than two.
 */
import { api } from './api.ts'

/* ══════════════════════════════ the catalogue ══════════════════════════════ */

/** `trade/src/catalog.ts:19-29`. Ten rules, each of which is a branch in `compileSignals`. */
export const STRATEGY_IDS = [
  'buy_hold',
  'sma_cross',
  'ema_cross',
  'macd_trend',
  'rsi_reversion',
  'bollinger_breakout',
  'donchian_breakout',
  'atr_trailing',
  'grid',
  'dca',
] as const

export type StrategyId = (typeof STRATEGY_IDS)[number]

/** `trade/src/catalog.ts:31-37`. */
export type StrategyFamily =
  | 'benchmark'
  | 'trend'
  | 'momentum'
  | 'mean_reversion'
  | 'volatility'
  | 'accumulation'

/** `trade/src/catalog.ts:41-50`. Parameters are periods and levels — never amounts. */
export interface StrategyParamSpec {
  readonly key: string
  readonly label: string
  readonly help: string
  readonly min: number
  readonly max: number
  readonly step: number
  readonly default: number
  readonly unit?: string
}

/**
 * `trade/src/catalog.ts:52-60`.
 *
 * `weakness` is on every entry and is not optional upstream. The service's own comment at
 * `catalog.ts:57` says why: "Stated on every entry, deliberately. A catalogue that only lists
 * upsides is advertising." This app renders it beside the tagline, at the same weight, on every
 * card — not behind a disclosure.
 */
export interface Strategy {
  readonly id: StrategyId
  readonly name: string
  readonly family: StrategyFamily
  readonly tagline: string
  readonly weakness: string
  readonly params: readonly StrategyParamSpec[]
}

/** `trade/src/catalog.ts:245-254`. */
export const TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d'] as const
export type Timeframe = (typeof TIMEFRAMES)[number]

/** `trade/src/series.ts:44-50`. A price series somebody has published bars for. */
export interface SeriesRecord {
  readonly id: string
  readonly symbol: string
  readonly assetCode: string
  readonly timeframe: Timeframe
  readonly source: string
}

/* ══════════════════════════════ backtests ══════════════════════════════ */

/** `trade/src/backtests.ts:38`. */
export type BacktestStatus = 'queued' | 'running' | 'complete' | 'failed'

/**
 * The metrics document, as `serialiseResult` stores it (`trade/src/backtest.ts:269-274`).
 *
 * Every `bigint` is canonicalised to a decimal STRING and every `number` stays a number — the
 * split is `trade/src/performance.ts:22-25`, and it is the fix for a bug that file records: the
 * frozen service reported profit factor in dollars for a while and "rendered as a profit factor of
 * 3067 next to ratios of 1.2". So:
 *
 *   * `…Shards` and `…Equity` are AMOUNTS, exact, as strings;
 *   * `…Bps` are PROPORTIONS in basis points, exact, as strings (10000 = 100%, or break-even for
 *     profit factor);
 *   * `cagr`, `sharpe`, `sortino`, `calmar` are STATISTICS and are plain numbers, because they
 *     involve a square root and nobody is paid a Sharpe.
 *
 * `null` until the run completes: the column is written only by the `complete` branch
 * (`trade/src/backtests.ts:222`).
 */
export interface BacktestMetrics {
  readonly startEquity: string
  readonly endEquity: string
  readonly totalReturnBps: string
  readonly holdReturnBps: string
  readonly maxDrawdownBps: string
  readonly exposureBps: string
  readonly winRateBps: string
  /** Gross profit over gross loss. **Zero is the sentinel for "no losing trade"**, not a value. */
  readonly profitFactorBps: string
  readonly feesPaidShards: string
  readonly bestTradeShards: string
  readonly worstTradeShards: string
  readonly trades: number
  readonly wins: number
  readonly losses: number
  readonly cagr: number
  readonly sharpe: number
  readonly sortino: number
  readonly calmar: number
}

/**
 * One backtest, as `backtestView` puts it on the wire (`trade/src/server.ts:822-824`).
 *
 * ── What is NOT here, and this app must not pretend otherwise ─────────────────────────────────
 *
 * The run also writes a decimated equity curve and the full fill list, into the `equity` and
 * `trades` columns (`trade/src/backtests.ts:223-224`, declared at `trade/src/migrations.ts:207-208`).
 * **Neither is selected.** `COLUMNS` at `trade/src/backtests.ts:77-78` lists sixteen columns and
 * those two are not among them, so no route serves them and there is nothing for this bundle to
 * draw a curve from. Reported to micro-trade; the screen says the curve is not served rather than
 * drawing one from the summary, which would be a picture of numbers that were never measured.
 */
export interface Backtest {
  readonly id: string
  readonly userId: string
  readonly status: BacktestStatus
  readonly seriesId: string
  readonly strategyId: StrategyId
  readonly params: Readonly<Record<string, number>>
  readonly seed: number
  /** Shards, as a decimal string. */
  readonly startCash: string
  readonly feeBps: number
  readonly slippageBps: number
  /** Unix seconds of the first and last bar the run actually read. Null until it completes. */
  readonly fromT: number | null
  readonly toT: number | null
  readonly resultDigest: string | null
  readonly metrics: BacktestMetrics | null
  /**
   * What was changed, and why the run may not be what was asked for.
   *
   * `normaliseParams` clamps a parameter into the catalogue's range and RETURNS the adjustment
   * rather than applying it silently (`trade/src/catalog.ts:195-226`), the queue route puts those
   * on the row (`trade/src/server.ts:509`), and the runner adds "this configuration produced no
   * trades at all" and "the newest 20000 bars were used" (`trade/src/backtests.ts:208-215`). Every
   * one of them changes what the numbers mean, so this app renders them where the numbers are.
   */
  readonly notes: readonly string[]
  readonly error: string | null
}

/* ══════════════════════════════ bots ══════════════════════════════ */

/** `trade/src/bots.ts:93-94`. */
export type BotMode = 'paper' | 'live'
export type BotStatus = 'draft' | 'running' | 'paused' | 'stopped' | 'errored'

/** One bot, as `botView` puts it on the wire (`trade/src/server.ts:827-838`). */
export interface Bot {
  readonly id: string
  readonly userId: string
  readonly name: string
  readonly mode: BotMode
  readonly status: BotStatus
  readonly seriesId: string
  readonly strategyId: StrategyId
  readonly params: Readonly<Record<string, number>>
  /** Shards committed. For a live bot this becomes a ledger reservation on start. */
  readonly allocation: string
  /** The ledger reservation, once one exists. Null on a paper bot, always. */
  readonly reservationEntryId: string | null
  readonly cash: string
  readonly position: string
  readonly equity: string
  /**
   * The highest equity this bot has ever been billed at.
   *
   * The performance fee is assessed against this and never against the allocation, which is what
   * stops the same climb being charged for twice — invariant 1 of `trade/src/fees.ts:26-30`.
   */
  readonly highWaterMark: string
  readonly feeBps: number
  readonly feeOwed: string
  readonly feePaid: string
  readonly state: Readonly<Record<string, number>>
  readonly lastBarT: number | null
  /**
   * Why the bot last did nothing.
   *
   * Carries `LIVE_DISABLED` when the deployment's kill switch is off underneath a live bot
   * (`trade/src/bots.ts:85-87`), which the service surfaces on the row rather than only logging
   * "a live bot that has gone quiet because an operator pulled the switch is indistinguishable
   * from one whose rule simply has not fired".
   */
  readonly lastError: string | null
}

/** `trade/src/fills.ts:47-49`. */
export type FillSide = 'buy' | 'sell'
export type FillMode = 'paper' | 'live'
export type FillStatus = 'planned' | 'settled' | 'refused' | 'unresolved'

/** One fill, as `GET /v1/bots/:id/fills` renders it (`trade/src/server.ts:559-566`). */
export interface Fill {
  readonly id: string
  readonly botId: string
  readonly userId: string
  readonly barT: number
  readonly side: FillSide
  readonly mode: FillMode
  /** USD per whole unit at 10^6 scale, as a decimal string (`trade/src/money.ts:22`). */
  readonly priceScaled: string
  /** The same price as a human decimal, computed by the service (`trade/src/money.ts:202-207`). */
  readonly price: string
  /** Base-asset smallest units. */
  readonly qty: string
  /** Shards moved, SIGNED: negative on a buy, positive on a sell (`trade/src/fills.ts:60-61`). */
  readonly shards: string
  readonly feeShards: string
  readonly reason: string
  readonly status: FillStatus
  readonly entryId: string | null
  readonly error: string | null
}

/** `trade/src/fees.ts:102`. */
export type SettlementStatus = 'pending' | 'charged' | 'partial' | 'uncollectable'

/** One fee settlement (`trade/src/server.ts:577-586`; the record is `trade/src/fees.ts:104-117`). */
export interface Settlement {
  readonly id: string
  readonly botId: string
  readonly userId: string
  /** `floor(now / TRADE_SETTLEMENT_PERIOD_SECONDS)`. Half of the `(bot, period)` unique key. */
  readonly period: string
  readonly equity: string
  readonly highWaterMark: string
  /** Equity above the mark. The only thing a fee is ever charged on. */
  readonly gain: string
  readonly fee: string
  /** What was sent to the ledger. Lower than `fee` when the wallet could not cover it. */
  readonly attempted: string
  readonly collected: string
  readonly status: SettlementStatus
  readonly entryId: string | null
}

/**
 * One point on the equity curve, as it arrives.
 *
 * Money is a decimal STRING, never a number: `canonicalise` writes every bigint as a quoted string
 * (`trade/src/idempotency.ts:94`), and parsing one back into a JS number would silently round it
 * above 2^53. The chart scales these with BigInt arithmetic and only ever divides for pixels.
 *
 * `hold` is what buy-and-hold would have been worth over the same bars, which is the only
 * comparison that makes a return figure mean anything.
 */
export interface EquityPoint {
  readonly t: number
  readonly equity: string
  readonly hold: string
  readonly priceScaled: string
}

export interface BacktestFill {
  readonly t: number
  readonly side: 'buy' | 'sell'
  readonly priceScaled: string
  readonly qty: string
  readonly notionalShards: string
  readonly feeShards: string
  /** Absent on a buy — a buy realises nothing. */
  readonly pnlShards?: string
  readonly reason: string
}

/** What this deployment will let you do, as opposed to what the product describes. */
export interface TradeCapabilities {
  readonly liveTrading: {
    readonly enabled: boolean
    /** The service's own sentence, present only when it is switched off. */
    readonly refusal?: string
  }
}

/* ══════════════════════════════ the calls ══════════════════════════════ */
/**
 * `GET /v1/backtests/:id/result` — `trade/src/server.ts:447`.
 *
 * The equity curve and the fill list. Separate from the summary at `:427` because an equity curve
 * is decimated to a few hundred points and a fill list is unbounded: putting both into the list
 * response would make the index page pay for a chart nobody has opened.
 *
 * **A 409 here is not an error to retry.** It means the run has not completed, and the body names
 * the state. It matters that this is distinct from a 200 with empty arrays: an empty fill list is
 * a real result — a strategy that never traded — and a reader must be able to tell that from
 * "it has not finished".
 */
export function getBacktestResult(
  id: string,
  signal?: AbortSignal,
): Promise<{ fills: readonly BacktestFill[]; equity: readonly EquityPoint[] }> {
  return api<{ fills: readonly BacktestFill[]; equity: readonly EquityPoint[] }>(
    `/v1/backtests/${encodeURIComponent(id)}/result`,
    { ...(signal ? { signal } : {}) },
  )
}

/**
 * `GET /v1/capabilities` — `trade/src/server.ts:361`.
 *
 * **Makes no `authenticate()` call**, like the catalogue: whether this deployment offers live
 * trading is a property of the deployment, not of the caller. Sent with `auth: false`.
 *
 * Read before a bot form is submitted, not after. `TRADE_LIVE_ENABLED` defaults to false and
 * nothing used to report it, so a customer could configure a live bot and discover only when it
 * declined to tick. When it is off, `refusal` is the engine's own sentence — rendered verbatim
 * rather than paraphrased, so the warning and the eventual failure cannot say different things.
 */
export function getCapabilities(signal?: AbortSignal): Promise<{ capabilities: TradeCapabilities }> {
  return api<{ capabilities: TradeCapabilities }>('/v1/capabilities', {
    auth: false,
    ...(signal ? { signal } : {}),
  })
}


/**
 * `GET /v1/strategies` — `trade/src/server.ts:342`.
 *
 * **Makes no `authenticate()` call.** The handler is a one-line body with no principal in it, and
 * the comment above it (`trade/src/server.ts:340-341`) says why: "It is a product surface — the
 * thing a prospective user reads before signing up — and gating it behind a token would make the
 * marketing page unable to render it."
 *
 * So this is sent with `auth: false` — not because a token would be refused, but because attaching
 * one to a route that never asked for it is how a client ends up reasoning about the wrong failure.
 */
export function getStrategies(signal?: AbortSignal): Promise<{ strategies: readonly Strategy[] }> {
  return api<{ strategies: readonly Strategy[] }>('/v1/strategies', {
    auth: false,
    ...(signal ? { signal } : {}),
  })
}

/**
 * `GET /v1/series` — `trade/src/server.ts:373`.
 *
 * Authenticates (`:337`) and then lists EVERY series, not the caller's — there is no per-user
 * filter, because a series is estate data rather than customer data (`listSeries`,
 * `trade/src/series.ts:119-124`). Ordered by symbol then timeframe by the service.
 */
export function getSeries(signal?: AbortSignal): Promise<{ series: readonly SeriesRecord[] }> {
  return api<{ series: readonly SeriesRecord[] }>('/v1/series', { ...(signal ? { signal } : {}) })
}

/**
 * `GET /v1/backtests` — `trade/src/server.ts:419`.
 *
 * At most 100, newest first (`trade/src/server.ts:423`). The `userId` query parameter is
 * deliberately NOT exposed: `ownerOf` honours it only for an admin principal and otherwise passes
 * it through `subjectUserId`, which refuses a mismatch (`trade/src/server.ts:793-799`) — so from
 * this bundle it can only ever be the caller's own id or a 403. Offering it would put an
 * act-as-anyone-shaped control in a customer app for no reachable behaviour.
 */
export function listBacktests(signal?: AbortSignal): Promise<{ backtests: readonly Backtest[] }> {
  return api<{ backtests: readonly Backtest[] }>('/v1/backtests', { ...(signal ? { signal } : {}) })
}

/**
 * `GET /v1/backtests/:id` — `trade/src/server.ts:427`.
 *
 * The status URL the 202 points at. A malformed id is a 400 (`uuidParam`,
 * `trade/src/server.ts:850-854`) and another customer's id is a **404**, not a 403
 * (`getOwnedBacktest` filters on `user_id`, and `:395` turns a null into `not found`) — the same
 * answer as "no such run", so ids cannot be enumerated.
 */
export function getBacktest(id: string, signal?: AbortSignal): Promise<{ backtest: Backtest }> {
  return api<{ backtest: Backtest }>(`/v1/backtests/${encodeURIComponent(id)}`, {
    ...(signal ? { signal } : {}),
  })
}

/**
 * `POST /v1/backtests` — `trade/src/server.ts:464`.
 *
 * **202 AND A STATUS URL. THE RUN HAS NOT HAPPENED YET.** The handler validates, claims an
 * idempotency key, writes a `queued` row and enqueues a job AFTER the claim commits
 * (`trade/src/server.ts:518-529`, and the reason is in the comment there: a job enqueued inside
 * the transaction would be visible to a worker before the row it names). The reply is 202 with a
 * `location` header and a `statusUrl` in the body (`:468-472`).
 *
 * `trade/src/backtests.ts:4-20` argues the case at length. The frozen service ran the backtest
 * inside the POST; a SIGTERM mid-run left a row marked `queued` that nothing would ever finish.
 *
 * So this client never renders a result because this call returned successfully. It renders
 * "queued", then polls `getBacktest`.
 */
export interface CreateBacktestInput {
  readonly seriesId: string
  readonly strategyId: StrategyId
  readonly params?: Readonly<Record<string, number>>
  /** Whole Shards, as a decimal string. Must be positive (`trade/src/server.ts:479`). */
  readonly startCash: string
  /**
   * Basis points, 0–5000 (`readBps`, `trade/src/server.ts:892-899`).
   *
   * **Defaulted by the service to 10 and 5, not to zero** (`trade/src/server.ts:480-481`). The
   * form sends them explicitly so the number on screen is the number that was charged.
   */
  readonly feeBps?: number
  readonly slippageBps?: number
  /**
   * 0–4294967295. **Defaulted to 0 rather than randomised**, deliberately: `readSeed`
   * (`trade/src/server.ts:901-915`) says a random default "would make an omitted seed produce a
   * run nobody can reproduce, which is the exact property this service promises not to have".
   */
  readonly seed?: number
}

export interface BacktestQueued {
  readonly backtestId: string
  readonly status: BacktestStatus
  /** Named in the BODY as well as the `location` header — `trade/src/server.ts:536`. */
  readonly statusUrl: string
  /** The clamps `normaliseParams` applied, if any. `trade/src/server.ts:536`. */
  readonly notes: readonly string[]
}

export function createBacktest(
  idempotencyKey: string,
  input: CreateBacktestInput,
): Promise<BacktestQueued> {
  return api<BacktestQueued>('/v1/backtests', {
    method: 'POST',
    body: input,
    headers: { 'idempotency-key': idempotencyKey },
  })
}

/**
 * `GET /v1/bots` — `trade/src/server.ts:540`.
 *
 * At most 100, newest first (`trade/src/server.ts:544`). Same `userId` reasoning as the backtest
 * list: not exposed.
 */
export function listBots(signal?: AbortSignal): Promise<{ bots: readonly Bot[] }> {
  return api<{ bots: readonly Bot[] }>('/v1/bots', { ...(signal ? { signal } : {}) })
}

/**
 * `GET /v1/bots/:id` — `trade/src/server.ts:548`.
 *
 * Authenticates through `ownedBot` (`trade/src/server.ts:801-812`), which calls `authenticate` at
 * `:741` and answers **404** for a bot that is not the caller's (`:744-745`).
 */
export function getBot(id: string, signal?: AbortSignal): Promise<{ bot: Bot }> {
  return api<{ bot: Bot }>(`/v1/bots/${encodeURIComponent(id)}`, { ...(signal ? { signal } : {}) })
}

/** `GET /v1/bots/:id/fills` — `trade/src/server.ts:553`. At most 200, newest first. */
export function listFills(id: string, signal?: AbortSignal): Promise<{ fills: readonly Fill[] }> {
  return api<{ fills: readonly Fill[] }>(`/v1/bots/${encodeURIComponent(id)}/fills`, {
    ...(signal ? { signal } : {}),
  })
}

/** `GET /v1/bots/:id/settlements` — `trade/src/server.ts:571`. At most 200, newest first. */
export function listSettlements(
  id: string,
  signal?: AbortSignal,
): Promise<{ settlements: readonly Settlement[] }> {
  return api<{ settlements: readonly Settlement[] }>(
    `/v1/bots/${encodeURIComponent(id)}/settlements`,
    { ...(signal ? { signal } : {}) },
  )
}

/**
 * `POST /v1/bots` — `trade/src/server.ts:591`.
 *
 * Creates a bot in `draft`. It reserves nothing and trades nothing — that is what `start` does.
 * **201 fresh, 200 on a replay** (`trade/src/server.ts:640`).
 */
export interface CreateBotInput {
  /** 1–120 characters (`requireString`, `trade/src/server.ts:597`). */
  readonly name: string
  readonly mode: BotMode
  readonly seriesId: string
  readonly strategyId: StrategyId
  readonly params?: Readonly<Record<string, number>>
  /** Whole Shards, as a decimal string. Must be positive (`trade/src/server.ts:607`). */
  readonly allocation: string
  /**
   * The performance fee, in basis points. **The service defaults it to 1500 — fifteen per cent**
   * (`trade/src/server.ts:608`), charged on gains above the high-water mark and on nothing else.
   * Sent explicitly, so the number the form showed is the number the row carries.
   */
  readonly feeBps?: number
}

export function createBot(idempotencyKey: string, input: CreateBotInput): Promise<{ botId: string }> {
  return api<{ botId: string }>('/v1/bots', {
    method: 'POST',
    body: input,
    headers: { 'idempotency-key': idempotencyKey },
  })
}

/**
 * `POST /v1/bots/:id/actions` — `trade/src/server.ts:651`.
 *
 * One route with an `action` rather than three, and the service says why (`:578-585`): the three
 * share their whole precondition set, and "the idempotency key is required here too: `start`
 * reserves capital at the ledger, and a retried start without a key would be a second
 * reservation."
 *
 * The three refusals this app has to render, each a **409 `bot_state`**
 * (`BotStateError` → `trade/src/server.ts:274-276`):
 *
 *   * `start` on a `stopped` bot — "a stopped bot cannot be restarted — create a new one"
 *     (`trade/src/bots.ts:561`). Stop is terminal.
 *   * `start` on a `live` bot while the deployment's kill switch is off
 *     (`trade/src/bots.ts:562-564`, the switch is `TRADE_LIVE_ENABLED`, **default false**,
 *     `trade/src/env.ts:181`).
 *   * `pause` on anything that is not `running` (`trade/src/bots.ts:611`).
 *
 * `stop` may answer with `deferred` set (`trade/src/server.ts:693-698`), which means the final fee
 * settlement could not be assessed on this pass and is owed. It is rendered, not swallowed.
 */
export type BotAction = 'start' | 'pause' | 'stop'

export interface BotActionResult {
  readonly botId: string
  readonly status: string
  /** Present on `stop` when the final settlement was deferred. `trade/src/fees.ts` invariant 4. */
  readonly deferred?: string
}

export function actOnBot(
  idempotencyKey: string,
  id: string,
  action: BotAction,
): Promise<BotActionResult> {
  return api<BotActionResult>(`/v1/bots/${encodeURIComponent(id)}/actions`, {
    method: 'POST',
    body: { action },
    headers: { 'idempotency-key': idempotencyKey },
  })
}
