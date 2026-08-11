/**
 * Turning trade's facts into words, without inventing any.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THREE RULES. THE FIRST TWO ARE THIS ESTATE'S; THE THIRD IS THIS PRODUCT'S.
 *
 * **1. Never render a null as a zero.** A backtest that has not finished has `metrics: null`
 * (`trade/src/backtests.ts` writes the column only on the `complete` branch). Rendering that
 * as a row of zeros would be a claim that a run which has not happened produced nothing.
 *
 * **2. Never colour alone.** The estate's reserved status hues sit ΔE 4.6 apart under protanopia
 * (measured in micro-ui). Every state below carries a word and a glyph, and the tone is third.
 *
 * **3. A MODELLED NUMBER SAYS SO, ON THE SURFACE WHERE IT IS SHOWN.** Every figure a backtest
 * produces describes a simulation over bars that have already happened. `MODELLED` below is the
 * one sentence used for it, and `test/render.test.ts` requires it to appear on every screen that
 * prints a metric. Nothing in this bundle may put a backtest figure next to a future tense.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { formatUnits, toMinor } from './units.ts'
import type {
  FillRole,
  MarketStatus,
  OrderStatus,
  Side,
  TransferStatus,
} from './exchange.ts'
import type {
  BacktestMetrics,
  BacktestStatus,
  BotStatus,
  FillStatus,
  SettlementStatus,
  StrategyFamily,
} from './trade.ts'

/**
 * The estate's voice for a figure that was computed rather than realised.
 *
 * One string, exported, so it cannot drift into six softer paraphrases across six screens — which
 * is how "past performance" becomes "expected return" one edit at a time.
 */
export const MODELLED = 'Modelled — not a promise.'

/** The longer form, for the one place per screen that explains rather than labels. */
export const MODELLED_LONG =
  'Every figure here comes from replaying bars that have already closed, with the fee and the ' +
  'slippage shown taken off each trade. It is a record of what a rule would have done, on prices ' +
  'that are already history. Read none of it as a forecast.'

/* ══════════════════════════════ time ══════════════════════════════ */

/**
 * An ISO timestamp from the service, as a full local date and time.
 *
 * An unparseable value is returned VERBATIM rather than replaced with "Invalid Date": if a service
 * ever puts something unexpected on the wire, a customer seeing the actual string can report it,
 * and one seeing "Invalid Date" can only report that the site is broken.
 */
export function timestamp(iso: string | null): string {
  if (iso === null || iso.length === 0) return '—'
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  return at.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/**
 * A bar timestamp, which arrives as UNIX SECONDS rather than as an ISO string.
 *
 * `bar.t` is validated as "a unix second" at `trade/src/server.ts`, and `fromT`/`toT` on a
 * backtest are the first and last of them (`trade/src/backtests.ts`). Multiplying by 1000 is
 * the whole conversion, and forgetting it renders every bar as 1970 — which looks like a data
 * problem rather than a units one.
 */
export function barTime(seconds: number | null): string {
  if (seconds === null) return '—'
  return timestamp(new Date(seconds * 1000).toISOString())
}

/** "just now", "12 seconds ago", "3 minutes ago", "in 2 hours". Never a bare number. */
export function relative(at: Date, now: Date): string {
  const ms = at.getTime() - now.getTime()
  const abs = Math.abs(ms)
  if (abs < 5_000) return 'just now'
  const [value, unit] = pick(abs)
  const plural = value === 1 ? unit : `${unit}s`
  return ms < 0 ? `${value} ${plural} ago` : `in ${value} ${plural}`
}

function pick(ms: number): [number, string] {
  const seconds = Math.round(ms / 1000)
  if (seconds < 90) return [seconds, 'second']
  const minutes = Math.round(seconds / 60)
  if (minutes < 90) return [minutes, 'minute']
  const hours = Math.round(minutes / 60)
  if (hours < 36) return [hours, 'hour']
  return [Math.round(hours / 24), 'day']
}

/* ══════════════════════════════ amounts and proportions ══════════════════════════════ */

/**
 * A COUNT — not money. Thousands separators on a whole number, and nothing else.
 *
 * The value arrives as a decimal string and stays one — `amountTo` puts it on the wire as a string
 * precisely so it is never a double (`trade/src/money.ts`), and putting it through
 * `Number` here to add commas would undo that in the one place a person reads it.
 *
 * A value this function does not recognise is returned VERBATIM. A wrong-looking number a customer
 * can quote is worth more than a tidy `NaN`.
 *
 * This is what is left of `shards()` after micro-org#418 (see `usd` below): the grouping was always
 * correct and the unit never was. Its callers are the two figures on this surface that are NOT
 * money — a bot's open position and a fill's quantity, both in base-asset smallest units.
 */
export function groupDigits(value: string): string {
  const m = /^(-?)(\d+)$/.exec(value)
  if (!m) return value
  return `${m[1]}${(m[2] ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

/**
 * MONEY. An integer number of US cents from the service, as dollars.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THIS REPLACED `shards()`, AND THE UNIT IS THE POINT RATHER THAN THE NAME.
 *
 * micro-trade called this unit a "Shard" and printed the integer bare, so an allocation of 1,000,000
 * cents rendered as `1,000,000 Shards` — which is $10,000.00. SHARD was retired
 * (`contracts/packages/chain/src/index.ts`, `RETIRED_ASSETS`) and micro-org#418 re-denominated the
 * service. It was the IDENTITY and not a re-basing: the peg is fixed at 100 Shards to the dollar
 * and SHARD has `decimals: 0`, so one Shard was exactly one cent and no stored number moved
 * (`trade/src/money.ts` carries the argument in full).
 *
 * That is why this is a different function rather than `shards()` with new copy on top. The old one
 * printed the integer AS THE AMOUNT; this one reads it as minor units and puts the point in. A
 * relabel would have left `1,000,000` on the screen under the word "dollars", which is a hundred
 * times the truth — the single worst outcome available to a rename of a money surface.
 *
 * The split is `formatUnits(cents, 2)` from `src/lib/units.ts` — the same bigint arithmetic the
 * exchange half of this bundle uses for every quote amount, rather than a second implementation
 * that agrees with it today. There is no `Number` on this path.
 *
 * ── An absent value is a DASH, and never a zero and never a blank ─────────────────────────────
 *
 * `BigInt('')` is `0n`, so the obvious spelling turns a missing amount into a confident zero, and
 * returning the input verbatim turns `undefined` into an empty cell that looks like a layout bug.
 * Both hide a renamed field: micro-worlds renamed `rewardShards`→`rewardWei`, worlds-web kept
 * reading the old name, and 47 rows on mainnet rendered a blank amount for a year because nothing
 * was ever red. A dash is VISIBLE, and `test/render.test.ts` asserts the dollar amounts on these
 * pages rather than the field names that carry them, so the same mistake here fails a test.
 *
 * A value that is neither absent nor an integer is returned VERBATIM, for the reason `timestamp()`
 * gives: a customer who can quote the actual value can report it, and one who sees `$NaN` can only
 * report that the site is broken.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
export function usd(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim().length === 0) return '—'
  const cents = toMinor(value)
  if (cents === null) return value
  const negative = cents < 0n
  return `${negative ? '-' : ''}$${formatUnits(negative ? -cents : cents, 2)}`
}

/**
 * The same, with an explicit sign on a positive value. For a signed column, where 0 is neutral.
 *
 * A fill's cash movement, a settlement's gain and a backtest's best and worst trade are all signed,
 * and a column where the losses carry a minus and the wins carry nothing reads as though the wins
 * were absent.
 */
export function signedUsd(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim().length === 0) return '—'
  const cents = toMinor(value)
  if (cents === null) return value
  if (cents === 0n) return '$0.00'
  return cents < 0n ? `-$${formatUnits(-cents, 2)}` : `+$${formatUnits(cents, 2)}`
}

/**
 * Basis points as a percentage, exactly.
 *
 * 10000 bps is 100%. The arithmetic is done on the STRING, in `bigint`, because that is the whole
 * reason the service sends a proportion as an exact integer rather than a float
 * (`trade/src/performance.ts`: "there is no reason to round it into a float — doing so is
 * what let a 0.1% drawdown and a 10% one differ by a rounding step"). Reading it back through
 * `Number` here would give the rounding back for free.
 *
 * Two decimal places, always, so a column of them aligns and 0.01% does not render as 0%.
 */
export function percent(bps: string): string {
  const m = /^(-?)(\d+)$/.exec(bps)
  if (!m) return bps
  const sign = m[1] ?? ''
  const value = BigInt(m[2] ?? '0')
  const whole = value / 100n
  const frac = (value % 100n).toString().padStart(2, '0')
  return `${sign}${groupDigits(whole.toString())}.${frac}%`
}

/**
 * The profit factor, with the zero sentinel rendered as what it means.
 *
 * `profitFactorBps` is gross profit over gross loss, and a run with no losing trade has no defined
 * value — JSON cannot carry Infinity, so the service stores **zero** and says in the same comment
 * that "a reader tells the two cases apart with `losses`" (`trade/src/performance.ts`).
 * A screen that printed `0.00×` for a run that never lost would be reporting the best possible
 * outcome as the worst one.
 */
export function profitFactor(metrics: BacktestMetrics): string {
  if (metrics.profitFactorBps === '0') {
    return metrics.losses === 0 ? 'no losing trade' : '0.00×'
  }
  const m = /^(-?)(\d+)$/.exec(metrics.profitFactorBps)
  if (!m) return metrics.profitFactorBps
  const value = BigInt(m[2] ?? '0')
  return `${m[1] ?? ''}${value / 10000n}.${((value % 10000n) / 100n).toString().padStart(2, '0')}×`
}

/**
 * A statistic — Sharpe, Sortino, Calmar, CAGR.
 *
 * These really are floats on the wire (`trade/src/performance.ts`: "they are statistics about
 * a distribution, not amounts, and nobody is paid a Sharpe"), so `Number` is correct here and
 * nowhere else in this file.
 */
export function ratio(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return value.toFixed(2)
}

/** CAGR is a proportion expressed as a float — 0.12 is 12%. Two places, and a sign. */
export function rate(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`
}

/** The first eight characters of a uuid — what a phrase names and what a table shows. */
export function shortId(id: string): string {
  return id.slice(0, 8)
}

/* ══════════════════════════════ state, never by colour alone ══════════════════════════════ */

export interface Tone {
  readonly tone: 'good' | 'warn' | 'crit' | 'mute' | 'busy'
  readonly glyph: string
  readonly word: string
  /** What this state means for the customer, in one sentence. Rendered, not just typed. */
  readonly meaning: string
}

/** The four backtest states — `trade/src/backtests.ts`. All four, including the two that pass. */
export function backtestTone(status: BacktestStatus): Tone {
  switch (status) {
    case 'queued':
      return {
        tone: 'mute',
        glyph: '○',
        word: 'QUEUED',
        meaning: 'Accepted and waiting for a worker. Nothing has been computed yet.',
      }
    case 'running':
      return {
        tone: 'busy',
        glyph: '◐',
        word: 'RUNNING',
        meaning: 'A worker holds this run under a lease.',
      }
    case 'complete':
      return {
        tone: 'good',
        glyph: '●',
        word: 'COMPLETE',
        meaning: 'The run finished. Every figure below is modelled, not realised.',
      }
    case 'failed':
      return {
        tone: 'crit',
        glyph: '■',
        word: 'FAILED',
        meaning: 'The run did not finish. The reason is on the row.',
      }
  }
}

/**
 * The five bot states — `trade/src/bots.ts`.
 *
 * `stopped` is terminal and says so: `startBot` refuses it outright with "a stopped bot cannot be
 * restarted — create a new one" (`trade/src/bots.ts`). A badge that read "stopped" without
 * that sentence would leave a customer looking for a start button that will always 409.
 */
export function botTone(status: BotStatus): Tone {
  switch (status) {
    case 'draft':
      return {
        tone: 'mute',
        glyph: '○',
        word: 'DRAFT',
        meaning: 'Created. Nothing is reserved and nothing is trading.',
      }
    case 'running':
      return {
        tone: 'good',
        glyph: '●',
        word: 'RUNNING',
        meaning: 'Evaluating each closed bar and acting when the rule fires.',
      }
    case 'paused':
      return {
        tone: 'warn',
        glyph: '◷',
        word: 'PAUSED',
        meaning: 'Not evaluating. The position stays open — pause is not a flatten.',
      }
    case 'stopped':
      return {
        tone: 'mute',
        glyph: '□',
        word: 'STOPPED',
        meaning: 'Terminal. A stopped bot cannot be restarted; create a new one.',
      }
    case 'errored':
      return {
        tone: 'crit',
        glyph: '■',
        word: 'ERRORED',
        meaning: 'The last tick failed. The reason is on the row.',
      }
  }
}

/** The four fill states — `trade/src/fills.ts`. */
export function fillTone(status: FillStatus): Tone {
  switch (status) {
    case 'planned':
      return {
        tone: 'mute',
        glyph: '○',
        word: 'PLANNED',
        meaning: 'Booked against the bar. Not yet settled.',
      }
    case 'settled':
      return { tone: 'good', glyph: '●', word: 'SETTLED', meaning: 'Cash and position moved.' }
    case 'refused':
      return {
        tone: 'crit',
        glyph: '⊘',
        word: 'REFUSED',
        meaning: 'The ledger declined it. Nothing moved.',
      }
    case 'unresolved':
      return {
        tone: 'warn',
        glyph: '▲',
        word: 'UNRESOLVED',
        meaning: 'The outcome is unknown. It is not a refusal and is retried under the same key.',
      }
  }
}

/**
 * The four settlement states — `trade/src/fees.ts`.
 *
 * `uncollectable` is the honest one: the ledger said no, the row is retired, and the debt goes back
 * to `feeOwed`. `unresolved` is not in this list on purpose — an unknown outcome stays `pending`,
 * which is invariant 4 of `trade/src/fees.ts` ("an unknown outcome is not a refusal").
 */
export function settlementTone(status: SettlementStatus): Tone {
  switch (status) {
    case 'pending':
      return {
        tone: 'busy',
        glyph: '◐',
        word: 'PENDING',
        meaning: 'Assessed and not yet resolved. Retried under its original key.',
      }
    case 'charged':
      return { tone: 'good', glyph: '●', word: 'CHARGED', meaning: 'Collected in full.' }
    case 'partial':
      return {
        tone: 'warn',
        glyph: '◑',
        word: 'PARTIAL',
        meaning: 'The wallet covered part of it. The remainder stays owed.',
      }
    case 'uncollectable':
      return {
        tone: 'crit',
        glyph: '⊘',
        word: 'UNCOLLECTABLE',
        meaning: 'The ledger refused it. The debt returns to what this bot owes.',
      }
  }
}

/** `trade/src/catalog.ts`, as a person reads them. */
export function familyName(family: StrategyFamily): string {
  switch (family) {
    case 'benchmark':
      return 'Benchmark'
    case 'trend':
      return 'Trend'
    case 'momentum':
      return 'Momentum'
    case 'mean_reversion':
      return 'Mean reversion'
    case 'volatility':
      return 'Volatility'
    case 'accumulation':
      return 'Accumulation'
  }
}

/**
 * A bot's mode, spelled out.
 *
 * `paper` is not "free practice": paper execution is charged the same 10 bps fee and 5 bps slippage
 * the backtest uses, and the service explains why (`trade/src/bots.ts`) — the frozen version
 * converted at the raw rate with a zero fee, "so a paper bot beat the backtest of its own rule
 * every time, which is the single comparison this product exists to let somebody make".
 */
export function modeName(mode: 'paper' | 'live'): string {
  return mode === 'paper' ? 'Paper' : 'Live'
}

/* ══════════════════════════════ the exchange's own states ══════════════════════════════ */

/**
 * The six order states — `trade/src/orders.ts`.
 *
 * `pending_trigger` is the one that has to be a state of its own rather than a flavour of `open`,
 * and the engine's comment says why: a stop that has not fired is HELD but not on the book, so it
 * cannot be traded with and nobody else can see it — while the money for it is already set aside.
 * A screen that showed it as "open" would have a customer looking for it in a ladder it is not in.
 */
export function orderTone(status: OrderStatus): Tone {
  switch (status) {
    case 'pending_trigger':
      return {
        tone: 'busy',
        glyph: '◷',
        word: 'WAITING',
        meaning: 'A stop that has not fired. Not on the book, and its escrow is already held.',
      }
    case 'open':
      return {
        tone: 'good',
        glyph: '●',
        word: 'OPEN',
        meaning: 'On the book and available to trade. Part of it may already have filled.',
      }
    case 'filled':
      return {
        tone: 'good',
        glyph: '■',
        word: 'FILLED',
        meaning: 'Completely traded. Nothing remains and no escrow is held.',
      }
    case 'cancelled':
      return {
        tone: 'mute',
        glyph: '□',
        word: 'CANCELLED',
        meaning: 'Taken off the book. Anything it traded before that still stands.',
      }
    case 'rejected':
      return {
        tone: 'crit',
        glyph: '⊘',
        word: 'REJECTED',
        meaning: 'Never accepted. Nothing traded and nothing was ever held.',
      }
    case 'expired':
      return {
        tone: 'mute',
        glyph: '◌',
        word: 'EXPIRED',
        meaning: 'The time you set ran out and the exchange cancelled the remainder.',
      }
  }
}

/**
 * The four market states — `trade/src/markets.ts`.
 *
 * All four are rendered as themselves rather than collapsed into "open" and "closed", because the
 * two middle ones change what the ORDER FORM may do: `post_only` refuses anything that would trade
 * immediately and `cancel_only` refuses everything new. A customer reading "closed" over a market
 * that is happily accepting resting orders has been told the wrong thing.
 */
export function marketStatusTone(status: MarketStatus): Tone {
  switch (status) {
    case 'active':
      return { tone: 'good', glyph: '●', word: 'TRADING', meaning: 'Open. Orders can trade.' }
    case 'post_only':
      return {
        tone: 'warn',
        glyph: '◑',
        word: 'POST ONLY',
        meaning: 'Only orders that rest on the book are accepted; anything that would trade now is refused.',
      }
    case 'cancel_only':
      return {
        tone: 'warn',
        glyph: '◷',
        word: 'CANCEL ONLY',
        meaning: 'You can withdraw orders. Nothing new is accepted.',
      }
    case 'halted':
      return {
        tone: 'crit',
        glyph: '■',
        word: 'HALTED',
        meaning: 'Trading is stopped. Existing orders stay where they are.',
      }
  }
}

/**
 * The four transfer states — `trade/src/transfers.ts`.
 *
 * `unresolved` is not a failure and must never be rendered as one. The claim commits before the
 * ledger is called, so "we asked and did not hear back" is a real, expected outcome that a job
 * resolves later under the original key. Telling a customer their deposit failed when it may still
 * land is how somebody sends it twice.
 */
export function transferTone(status: TransferStatus): Tone {
  switch (status) {
    case 'pending':
      return {
        tone: 'busy',
        glyph: '◐',
        word: 'PENDING',
        meaning: 'Accepted and not finished. Nobody has said it failed.',
      }
    case 'settled':
      return { tone: 'good', glyph: '●', word: 'SETTLED', meaning: 'Done. The balance reflects it.' }
    case 'refused':
      return {
        tone: 'crit',
        glyph: '⊘',
        word: 'REFUSED',
        meaning: 'It did not happen and nothing moved.',
      }
    case 'unresolved':
      return {
        tone: 'warn',
        glyph: '▲',
        word: 'UNKNOWN',
        meaning: 'The outcome is not known yet. It is retried under the same key, so nothing is charged twice.',
      }
  }
}

/** Buy and Sell, capitalised the one way, so two screens cannot spell the same side differently. */
export function sideWord(side: Side): string {
  return side === 'buy' ? 'Buy' : 'Sell'
}

/** Which side of a fill the caller was on — `trade/src/matching.ts`. */
export function roleWord(role: FillRole): string {
  return role === 'maker' ? 'Maker' : 'Taker'
}

/**
 * A 24-hour change, from the integer basis points the ticker carries.
 *
 * Signed always, including the zero case, because a column of changes where "0.00%" has no sign and
 * everything else does reads as a missing value rather than as flat. `changeBps` is a NUMBER on the
 * wire rather than a string — it is a proportion computed by the service, not an amount — so this
 * is one of the two places in this bundle where integer arithmetic on a `number` is correct.
 */
export function changeBps(bps: number): string {
  if (!Number.isFinite(bps)) return '—'
  const whole = Math.trunc(Math.abs(bps) / 100)
  const frac = (Math.abs(bps) % 100).toString().padStart(2, '0')
  return `${bps < 0 ? '-' : '+'}${whole}.${frac}%`
}

/** Which way a change points, for a tone that never stands alone: the sign is always printed too. */
export function changeTone(bps: number): 'good' | 'crit' | 'mute' {
  if (!Number.isFinite(bps) || bps === 0) return 'mute'
  return bps > 0 ? 'good' : 'crit'
}
