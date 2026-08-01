/**
 * Turning exact integers into words without losing the exactness.
 *
 * `trade/src/performance.ts:12-20` sends every proportion as an exact `bigint` in basis points,
 * and gives the reason: computing max drawdown in doubles "for a large equity and a small fall
 * loses the fall entirely". A client that reads those back through `Number` to print them has
 * handed the rounding straight back.
 *
 * So `percent()` and `shards()` do their arithmetic on the STRING, and this file proves it with
 * values a double cannot hold.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MODELLED,
  backtestTone,
  barTime,
  botTone,
  fillTone,
  percent,
  profitFactor,
  ratio,
  rate,
  relative,
  settlementTone,
  shards,
  signedShards,
  timestamp,
} from '../src/lib/format.ts'
import {
  type BacktestMetrics,
  type BacktestStatus,
  type BotStatus,
  type FillStatus,
  type SettlementStatus,
} from '../src/lib/trade.ts'

describe('basis points as a percentage, exactly', () => {
  it('renders whole percentages', () => {
    assert.equal(percent('10000'), '100.00%')
    assert.equal(percent('0'), '0.00%')
    assert.equal(percent('1500'), '15.00%')
  })

  it('keeps two places, so 0.01% does not render as 0%', () => {
    // The exact failure `trade/src/performance.ts:16-20` describes: a 0.1% drawdown and a 10% one
    // must not differ by a rounding step.
    assert.equal(percent('1'), '0.01%')
    assert.equal(percent('10'), '0.10%')
    assert.equal(percent('1000'), '10.00%')
  })

  it('keeps the sign on a loss', () => {
    assert.equal(percent('-2350'), '-23.50%')
    assert.equal(percent('-1'), '-0.01%')
  })

  it('groups the whole part, so a large return is readable', () => {
    assert.equal(percent('123456789'), '1,234,567.89%')
  })

  it('survives a value no double can hold', () => {
    // 2^53 is where a double starts skipping integers. The arithmetic here is bigint, so this is
    // exact — and the test would fail by exactly one if anybody changed it to Number().
    assert.equal(percent('9007199254740993'), '90,071,992,547,409.93%')
  })

  it('returns anything it does not recognise verbatim', () => {
    // A wrong-looking value a customer can quote is worth more than a tidy NaN.
    assert.equal(percent('not a number'), 'not a number')
    assert.equal(percent(''), '')
  })
})

describe('Shards, as an amount', () => {
  it('groups in threes', () => {
    assert.equal(shards('1000'), '1,000')
    assert.equal(shards('1000000'), '1,000,000')
    assert.equal(shards('100'), '100')
    assert.equal(shards('0'), '0')
  })

  it('groups a value beyond a double, unchanged', () => {
    assert.equal(shards('123456789012345678901234567890'), '123,456,789,012,345,678,901,234,567,890')
  })

  it('keeps a negative sign outside the grouping', () => {
    assert.equal(shards('-1234567'), '-1,234,567')
  })

  it('returns a non-numeric value verbatim', () => {
    assert.equal(shards('n/a'), 'n/a')
  })

  it('signs a positive value only where the sign carries meaning', () => {
    // A fill's `shards` is signed: negative on a buy, positive on a sell
    // (`trade/src/fills.ts:60-61`). A bare "1,000" in that column does not say which.
    assert.equal(signedShards('1000'), '+1,000')
    assert.equal(signedShards('-1000'), '-1,000')
    assert.equal(signedShards('0'), '0')
  })
})

describe('the profit factor sentinel', () => {
  const metrics = (profitFactorBps: string, losses: number): BacktestMetrics =>
    ({ profitFactorBps, losses }) as BacktestMetrics

  it('reads zero-with-no-losses as what it means, not as the worst possible result', () => {
    // `trade/src/performance.ts` stores zero because JSON cannot carry Infinity, and says a reader
    // tells the two cases apart with `losses`. Printing 0.00× for a run that never lost would
    // report the best outcome as the worst.
    assert.equal(profitFactor(metrics('0', 0)), 'no losing trade')
  })

  it('reads zero-with-losses as a real zero', () => {
    assert.equal(profitFactor(metrics('0', 4)), '0.00×')
  })

  it('renders a ratio in basis points as a multiple', () => {
    assert.equal(profitFactor(metrics('10000', 3)), '1.00×')
    assert.equal(profitFactor(metrics('30670', 3)), '3.06×')
    assert.equal(profitFactor(metrics('12345', 3)), '1.23×')
  })
})

describe('statistics, which really are floats', () => {
  it('renders a ratio to two places', () => {
    assert.equal(ratio(1.2345), '1.23')
    assert.equal(ratio(0), '0.00')
    assert.equal(ratio(-0.5), '-0.50')
  })

  it('renders a non-finite ratio as absent rather than as NaN', () => {
    assert.equal(ratio(Number.NaN), '—')
    assert.equal(ratio(Number.POSITIVE_INFINITY), '—')
  })

  it('renders CAGR as a signed percentage, because 0.12 is 12%', () => {
    assert.equal(rate(0.12), '+12.00%')
    assert.equal(rate(-0.0834), '-8.34%')
    assert.equal(rate(0), '+0.00%')
  })
})

describe('time', () => {
  it('renders a bar timestamp from UNIX SECONDS, not milliseconds', () => {
    // `bar.t` is validated as "a unix second" at trade/src/server.ts:935. Forgetting the ×1000
    // renders every bar as 1970, which looks like a data problem rather than a units one.
    const rendered = barTime(1_767_225_600)
    assert.match(rendered, /2026/, `${rendered} is not in 2026 — the seconds were read as millis`)
  })

  it('renders an absent bar as a dash', () => {
    assert.equal(barTime(null), '—')
  })

  it('returns an unparseable timestamp verbatim rather than "Invalid Date"', () => {
    assert.equal(timestamp('yesterday-ish'), 'yesterday-ish')
    assert.equal(timestamp(null), '—')
  })

  it('says "just now" rather than "0 seconds ago"', () => {
    const now = new Date('2026-08-01T12:00:00Z')
    assert.equal(relative(new Date('2026-08-01T11:59:58Z'), now), 'just now')
    assert.equal(relative(new Date('2026-08-01T11:59:00Z'), now), '60 seconds ago')
    assert.equal(relative(new Date('2026-08-01T13:00:00Z'), now), 'in 60 minutes')
  })
})

describe('every state has a word and a glyph, never a colour alone', () => {
  const BACKTEST: readonly BacktestStatus[] = ['queued', 'running', 'complete', 'failed']
  const BOT: readonly BotStatus[] = ['draft', 'running', 'paused', 'stopped', 'errored']
  const FILL: readonly FillStatus[] = ['planned', 'settled', 'refused', 'unresolved']
  const SETTLEMENT: readonly SettlementStatus[] = ['pending', 'charged', 'partial', 'uncollectable']

  const check = (tone: { word: string; glyph: string; meaning: string }, label: string) => {
    assert.ok(tone.word.length > 0, `${label} has no word`)
    assert.ok(tone.glyph.length > 0, `${label} has no glyph`)
    // The meaning is rendered in the badge's title, so an empty one is a tooltip that says nothing.
    assert.ok(tone.meaning.length > 10, `${label} has no meaning`)
  }

  it('covers all four backtest states', () => {
    for (const s of BACKTEST) check(backtestTone(s), s)
  })

  it('covers all five bot states', () => {
    for (const s of BOT) check(botTone(s), s)
  })

  it('covers all four fill states', () => {
    for (const s of FILL) check(fillTone(s), s)
  })

  it('covers all four settlement states', () => {
    for (const s of SETTLEMENT) check(settlementTone(s), s)
  })

  it('says stop is terminal, because startBot refuses a stopped bot outright', () => {
    // trade/src/bots.ts:561. A badge reading "stopped" without that sentence leaves a customer
    // hunting for a start button that will always 409.
    assert.match(botTone('stopped').meaning, /cannot be restarted/i)
  })

  it('says pause is not a flatten, because the position stays open by design', () => {
    // trade/src/bots.ts:602-608.
    assert.match(botTone('paused').meaning, /position stays open|not a flatten/i)
  })

  it('says an unresolved fill is not a refusal', () => {
    // Invariant 4 of trade/src/fees.ts: "an unknown outcome is not a refusal".
    assert.match(fillTone('unresolved').meaning, /not a refusal/i)
  })
})

describe('the modelled label is one string', () => {
  it('says it is not a promise, in the estate’s voice', () => {
    // Exported as a constant precisely so it cannot drift into six softer paraphrases across six
    // screens, which is how "past performance" becomes "expected return" one edit at a time.
    assert.equal(MODELLED, 'Modelled — not a promise.')
  })
})
