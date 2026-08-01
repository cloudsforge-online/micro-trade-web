/**
 * WHAT THIS APP IS AND IS NOT ALLOWED TO SAY.
 *
 * These are read out of the SOURCE of each page rather than out of a rendered DOM, for the reason
 * `test/browser-stubs.ts` gives: jsdom is a second browser implementation to keep current, and a
 * test that renders a component in it proves the component renders in jsdom. What is being
 * asserted here is not layout — it is which sentences a page is capable of putting on screen.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE PRODUCT'S TWO CLAIMS, EACH ENFORCED
 *
 * **1. Fees and slippage are charged.** The service defaults a backtest to 10 bps of fee and 5 of
 * slippage rather than to zero (`trade/src/server.ts:415-416`), and paper trading is charged the
 * same (`trade/src/bots.ts:81-82`) — because the frozen version booked a zero fee in paper mode
 * and "a paper bot beat the backtest of its own rule every time, which is the single comparison
 * this product exists to let somebody make" (`trade/src/bots.ts:73-80`). A UI that hid the charge,
 * or offered paper as "free practice", would undo that in the one place a customer looks.
 *
 * **2. Nothing here implies a return is expected.** Every figure a backtest produces describes a
 * simulation over bars that have already happened. Every page that prints one carries `MODELLED`
 * — the estate's voice, one string — and no page may put a modelled figure next to a future tense
 * or a promise.
 *
 * **3. This is not an exchange.** No order book, no market making. Asserted as an absence, because
 * the vocabulary is what would arrive first.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))
const read = (p: string): string => readFileSync(at(p), 'utf8')

const PAGES = readdirSync(at('src/pages')).filter((f) => f.endsWith('.tsx'))

/** Pages that print a figure produced by a backtest. */
const METRIC_PAGES = ['backtest.tsx', 'backtests.tsx', 'new-backtest.tsx']

describe('the page set is the one this test thinks it is', () => {
  it('found every page', () => {
    assert.deepEqual(
      PAGES.sort(),
      [
        'backtest.tsx',
        'backtests.tsx',
        'bot.tsx',
        'bots.tsx',
        'new-backtest.tsx',
        'new-bot.tsx',
        'not-found.tsx',
        'strategies.tsx',
      ],
      'a page was added or removed; the rules below have to be applied to it deliberately',
    )
  })
})

describe('a modelled number says so, on the surface where it is shown', () => {
  for (const page of METRIC_PAGES) {
    it(`${page} carries the modelled label`, () => {
      const source = read(`src/pages/${page}`)
      assert.match(
        source,
        /Modelled(Note|Tag)|MODELLED/,
        `${page} prints a backtest figure and never says it is modelled`,
      )
    })
  }

  it('the label is rendered above the numbers on the report, not after them', () => {
    // A disclaimer under a table is a disclaimer people scroll past. The check is positional: the
    // ModelledNote has to appear before the first Metric in the report component.
    const source = read('src/pages/backtest.tsx')
    const label = source.indexOf('<ModelledNote>')
    const firstMetric = source.indexOf('<Metric')
    assert.ok(label > 0, 'the report renders no modelled label')
    assert.ok(firstMetric > 0, 'the report renders no metric')
    assert.ok(label < firstMetric, 'the modelled label is rendered after the numbers it qualifies')
  })

  it('no page promises a return, in any of the shapes that would arrive first', () => {
    const FORBIDDEN = [
      /\bguarantee[sd]?\b/i,
      /\bwill (?:earn|make|return|profit|grow)\b/i,
      /\bexpected returns?\b/i,
      /\byou (?:will|can expect to) (?:earn|make|profit)\b/i,
      /\bbeat the market\b/i,
      /\brisk[- ]free\b/i,
      /\bpassive income\b/i,
      /\bproven (?:strategy|returns?)\b/i,
    ]
    for (const page of PAGES) {
      const source = read(`src/pages/${page}`)
      for (const pattern of FORBIDDEN) {
        assert.doesNotMatch(source, pattern, `${page} matches ${pattern}`)
      }
    }
  })

  it('a run that has not completed renders a dash rather than a zero', () => {
    // `metrics` is null until the run completes — trade/src/backtests.ts:222 writes the column only
    // on the complete branch. A zero there is a claim about a run that has not happened.
    const list = read('src/pages/backtests.tsx')
    assert.match(list, /run\.metrics \? percent\(run\.metrics\.totalReturnBps\) : '—'/)
    assert.match(list, /run\.metrics \? percent\(run\.metrics\.maxDrawdownBps\) : '—'/)
  })

  it('the report is only rendered when the run actually completed', () => {
    const detail = read('src/pages/backtest.tsx')
    assert.match(detail, /backtest\.status === 'complete' && backtest\.metrics/)
  })

  it('the queued state says nothing has been computed', () => {
    const detail = read('src/pages/backtest.tsx')
    assert.match(detail, /Nothing has been computed yet/)
  })
})

describe('fees and slippage are visible, because that is the product', () => {
  it('the front page states that both are charged, with the numbers', () => {
    const source = read('src/pages/strategies.tsx')
    assert.match(source, /10&nbsp;bps/, 'the default fee is not on the front page')
    assert.match(source, /5&nbsp;bps/, 'the default slippage is not on the front page')
    assert.match(source, /only works for free does not work/)
  })

  it('the backtest form shows both, editable, rather than hiding them', () => {
    const source = read('src/pages/new-backtest.tsx')
    assert.match(source, /Fee \(basis points\)/)
    assert.match(source, /Slippage \(basis points\)/)
    assert.match(source, /const DEFAULT_FEE_BPS = 10/)
    assert.match(source, /const DEFAULT_SLIPPAGE_BPS = 5/)
  })

  it('the report prints what was charged next to what was made', () => {
    const source = read('src/pages/backtest.tsx')
    assert.match(source, /Fees paid/)
    assert.match(source, /Fee charged/)
    assert.match(source, /Slippage charged/)
  })

  it('paper is never described as free', () => {
    // The one sentence that would undo `trade/src/bots.ts:73-80`.
    for (const page of PAGES) {
      const source = read(`src/pages/${page}`)
      assert.doesNotMatch(source, /paper (?:is|trading is) free/i, `${page} calls paper free`)
      assert.doesNotMatch(source, /free practice/i, `${page} calls paper free practice`)
    }
  })

  it('the bot form says paper is charged the same as a backtest', () => {
    const source = read('src/pages/new-bot.tsx')
    // Two substrings rather than one sentence: JSX wraps the prose and a single regex over it is
    // a test that fails on a reformat rather than on a change of meaning.
    assert.match(source, /still charged 10 bps of fee/)
    assert.match(source, /5 bps of\s+slippage/)
  })

  it('the bots page states the performance fee and what it is assessed against', () => {
    const source = read('src/pages/bots.tsx')
    assert.match(source, /high-water mark/)
    assert.match(source, /15%/)
  })
})

describe('this is not an exchange, and the vocabulary stays out', () => {
  it('no page uses order-book or market-making language', () => {
    const FORBIDDEN = [/order book/i, /orderbook/i, /\bmarket[- ]mak/i, /\bbid[/-]ask\b/i, /\bdepth chart\b/i]
    for (const page of PAGES) {
      const source = read(`src/pages/${page}`)
      for (const pattern of FORBIDDEN) {
        // The one legitimate mention is the front page saying it does NOT have one.
        if (page === 'strategies.tsx' && /there is no order book/i.test(source)) continue
        assert.doesNotMatch(source, pattern, `${page} matches ${pattern}`)
      }
    }
  })

  it('the front page says so outright', () => {
    assert.match(read('src/pages/strategies.tsx'), /not an exchange/i)
  })
})

describe('the catalogue states what each rule gets wrong', () => {
  it('a strategy card cannot be drawn without its weakness', () => {
    // `weakness` is required on every catalogue entry upstream (trade/src/catalog.ts:52-60), and
    // the service's comment says why: "A catalogue that only lists upsides is advertising."
    const source = read('src/pages/strategies.tsx')
    assert.match(source, /strategy\.weakness/)
    assert.match(source, /Where it fails/)
  })

  it('the weakness is not hidden behind a disclosure', () => {
    const source = read('src/pages/strategies.tsx')
    const at = source.indexOf('strategy.weakness')
    const surrounding = source.slice(Math.max(0, at - 400), at)
    assert.doesNotMatch(surrounding, /<details|<summary|aria-expanded/)
  })
})

describe('the refusals the service owns are rendered, not pre-empted', () => {
  it('the bot page hides the start button only for the state that is genuinely terminal', () => {
    // `stopped` is refused outright by startBot (trade/src/bots.ts:561) — a button there could
    // only ever 409. Every other refusal is rendered when it happens, because this bundle cannot
    // know it in advance.
    const source = read('src/pages/bot.tsx')
    assert.match(source, /const terminal = bot\.status === 'stopped'/)
  })

  it('the live kill switch is described rather than guessed at', () => {
    // TRADE_LIVE_ENABLED defaults to false (trade/src/env.ts:181) and no route reports it. A
    // client that hid the live option on a deployment where live was ON would have removed a
    // feature nobody could file a bug against.
    const source = read('src/pages/new-bot.tsx')
    assert.match(source, /kill switch/i)
    assert.match(source, /cannot check it before you commit|you will find out when you press start/i)
  })

  it('pause is described as not a flatten, wherever it is offered', () => {
    const source = read('src/pages/bot.tsx')
    assert.match(source, /Pause is not a flatten/)
  })
})

describe('no page calls /v1 directly; every call goes through the cited client', () => {
  it('the pages import from src/lib/trade.ts and nowhere else', () => {
    for (const page of PAGES) {
      const source = read(`src/pages/${page}`)
      assert.doesNotMatch(source, /['"`]\/v1\//, `${page} names a /v1 path; that belongs in lib/trade.ts`)
      assert.doesNotMatch(source, /\bapi</, `${page} calls api() directly rather than a cited wrapper`)
    }
  })
})

describe('the failure states show the request id', () => {
  it('every mutation renders its error with the id beside it', () => {
    for (const page of ['new-backtest.tsx', 'new-bot.tsx']) {
      const source = read(`src/pages/${page}`)
      assert.match(source, /submit\.error\.requestId/, `${page} drops the request id on a failure`)
    }
  })
})
