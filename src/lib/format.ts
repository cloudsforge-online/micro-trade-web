/**
 * Turning trade's facts into words, without inventing any.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THREE RULES. THE FIRST TWO ARE THIS ESTATE'S; THE THIRD IS THIS PRODUCT'S.
 *
 * **1. Never render a null as a zero.** A backtest that has not finished has `metrics: null`
 * (`trade/src/backtests.ts:222` writes the column only on the `complete` branch). Rendering that
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
  'These figures are a simulation over bars that have already happened, charged the fee and ' +
  'slippage shown. They describe the past. They are not a forecast, and nothing here implies a ' +
  'return.'

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
 * `bar.t` is validated as "a unix second" at `trade/src/server.ts:942`, and `fromT`/`toT` on a
 * backtest are the first and last of them (`trade/src/backtests.ts:96-97`). Multiplying by 1000 is
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
 * A Shards amount, grouped.
 *
 * The value arrives as a decimal string and stays one — `amountTo` puts it on the wire as a string
 * precisely so it is never a double (`trade/src/money.ts:187-194`), and putting it through
 * `Number` here to add commas would undo that in the one place a person reads it.
 *
 * A value this function does not recognise is returned VERBATIM. A wrong-looking number a customer
 * can quote is worth more than a tidy `NaN`.
 */
export function shards(value: string): string {
  const m = /^(-?)(\d+)$/.exec(value)
  if (!m) return value
  return `${m[1]}${(m[2] ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

/** The same, with an explicit sign on a positive value. For a signed column, where 0 is neutral. */
export function signedShards(value: string): string {
  if (!/^-?\d+$/.test(value)) return value
  if (value === '0') return '0'
  return value.startsWith('-') ? shards(value) : `+${shards(value)}`
}

/**
 * Basis points as a percentage, exactly.
 *
 * 10000 bps is 100%. The arithmetic is done on the STRING, in `bigint`, because that is the whole
 * reason the service sends a proportion as an exact integer rather than a float
 * (`trade/src/performance.ts:16-20`: "there is no reason to round it into a float — doing so is
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
  return `${sign}${shards(whole.toString())}.${frac}%`
}

/**
 * The profit factor, with the zero sentinel rendered as what it means.
 *
 * `profitFactorBps` is gross profit over gross loss, and a run with no losing trade has no defined
 * value — JSON cannot carry Infinity, so the service stores **zero** and says in the same comment
 * that "a reader tells the two cases apart with `losses`" (`trade/src/performance.ts:200-204`).
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
 * These really are floats on the wire (`trade/src/performance.ts:18-20`: "they are statistics about
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

/** The four backtest states — `trade/src/backtests.ts:38`. All four, including the two that pass. */
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
 * The five bot states — `trade/src/bots.ts:94`.
 *
 * `stopped` is terminal and says so: `startBot` refuses it outright with "a stopped bot cannot be
 * restarted — create a new one" (`trade/src/bots.ts:561`). A badge that read "stopped" without
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

/** The four fill states — `trade/src/fills.ts:49`. */
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
 * The four settlement states — `trade/src/fees.ts:102`.
 *
 * `uncollectable` is the honest one: the ledger said no, the row is retired, and the debt goes back
 * to `feeOwed`. `unresolved` is not in this list on purpose — an unknown outcome stays `pending`,
 * which is invariant 4 of `trade/src/fees.ts:42-51` ("an unknown outcome is not a refusal").
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

/** `trade/src/catalog.ts:31-37`, as a person reads them. */
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
 * the backtest uses, and the service explains why (`trade/src/bots.ts:73-80`) — the frozen version
 * converted at the raw rate with a zero fee, "so a paper bot beat the backtest of its own rule
 * every time, which is the single comparison this product exists to let somebody make".
 */
export function modeName(mode: 'paper' | 'live'): string {
  return mode === 'paper' ? 'Paper' : 'Live'
}
