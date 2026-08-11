/**
 * A SCREEN SHOWING SOMEBODY'S OWN MONEY MUST DISTINGUISH "UNKNOWN" FROM "ZERO".
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * `BigInt('')` is `0n`.
 *
 * Not a throw and not a NaN — zero, silently. So a component that turns a wire value into a bigint
 * without checking it first has a path where a missing amount becomes a confident nought, and the
 * reader is given a number nobody computed. `BigInt('n/a')` is the other half of the same hole: it
 * THROWS, from inside render, which does not produce a wrong figure — it produces no page.
 *
 * Both were live in `src/components/equity.tsx`, and this file is what holds them shut. The rule it
 * enforces is the one `src/lib/format.ts` already states for the same situation ("A value this
 * function does not recognise is returned VERBATIM. A wrong-looking number a customer can quote is
 * worth more than a tidy NaN") and the one `micro-tessera-web` follows: print NO DIGIT when you
 * cannot obtain the figure.
 *
 * `src/lib/format.ts` is covered here too, because it is the other place a wire string becomes a
 * rendered amount, and "it looks fine" is not a proof.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement as h } from 'react'

import { withScreen } from './dom.ts'
import { EquityCurve } from '../src/components/equity.tsx'
import { groupDigits, percent, profitFactor, signedUsd, usd } from '../src/lib/format.ts'
import type { EquityPoint } from '../src/lib/trade.ts'

const point = (t: number, equity: string, hold: string): EquityPoint =>
  ({ t, equity, hold, priceScaled: '1000000' }) as EquityPoint

describe('the equity curve, when it cannot read an amount', () => {
  it('states no verdict it computed from a value it did not have', async () => {
    // Before the guard: `BigInt('')` made both equity values `0n`, both hold values real, and the
    // caption read "Finished behind buy-and-hold." — this component telling a customer their
    // strategy lost, on the strength of a number that never arrived.
    await withScreen(
      h(EquityCurve, { points: [point(1, '', '100000'), point(2, '', '120000')] }),
      { allowEmpty: true },
      async (s) => {
        assert.doesNotMatch(
          s.text(),
          /finished (behind|ahead|level)/i,
          'the chart delivered a verdict on a run whose equity it could not read — an empty ' +
            'string became 0n and the customer was told their strategy lost',
        )
        assert.match(s.text(), /cannot be drawn/i, 'nothing said why there is no curve')
        // And the values are still there to be quoted, exactly as they arrived.
        assert.match(s.text(), /120000/, 'the readable half of the data was thrown away too')
      },
    )
  })

  it('renders at all when an amount is not a number', async () => {
    // Before the guard this threw `SyntaxError: Cannot convert n/a to a BigInt` from inside render,
    // which does not spoil one figure — it takes the whole backtest report down.
    await withScreen(
      h(EquityCurve, { points: [point(1, '100000', '100000'), point(2, 'n/a', '120000')] }),
      { allowEmpty: true },
      async (s) => {
        assert.match(s.text(), /cannot be drawn/i, 'the page did not survive an unreadable amount')
        assert.match(s.text(), /n\/a/, 'the value a customer would quote to support is not shown')
        assert.doesNotMatch(s.text(), /finished (behind|ahead|level)/i, 'a verdict was still stated')
        s.clean('an unreadable equity point')
      },
    )
  })

  it('still draws the curve, and states the verdict, when every amount reads', async () => {
    await withScreen(
      h(EquityCurve, { points: [point(1, '100000', '100000'), point(2, '130000', '120000')] }),
      { allowEmpty: true },
      async (s) => {
        assert.match(s.text(), /finished ahead of buy-and-hold/i, 'the good path stopped working')
        assert.ok(s.document.querySelector('svg'), 'no curve was drawn for a readable run')
        assert.doesNotMatch(s.text(), /cannot be drawn/i)
      },
    )
  })

  it('a zero is still rendered as a zero — this is not a rule against nought', async () => {
    await withScreen(
      h(EquityCurve, { points: [point(1, '0', '0'), point(2, '0', '0')] }),
      { allowEmpty: true },
      async (s) => {
        assert.match(s.text(), /finished level with buy-and-hold/i, 'a real zero was treated as unknown')
        assert.doesNotMatch(s.text(), /cannot be drawn/i)
      },
    )
  })
})

describe('format.ts prints no digit for an amount it cannot read', () => {
  const MONEY = [
    [usd, 'usd'],
    [signedUsd, 'signedUsd'],
  ] as const
  const FORMATTERS = [...MONEY, [groupDigits, 'groupDigits'], [percent, 'percent']] as const

  it('an ABSENT amount produces no digit at all', () => {
    // The case the estate names explicitly: `BigInt('')` is `0n`, so an empty string is the one
    // input that could turn into a confident nought without anybody noticing.
    for (const [fn, name] of FORMATTERS) {
      for (const absent of ['', ' ', 'n/a', '—', 'null', 'undefined']) {
        const out = fn(absent)
        assert.doesNotMatch(
          out,
          /\d/,
          `${name}(${JSON.stringify(absent)}) produced ${JSON.stringify(out)} — a screen showing ` +
            `somebody's own money may not turn a value it does not have into a figure`,
        )
      }
    }
  })

  it('an amount that is MISSING ENTIRELY is a visible dash, not an empty cell', () => {
    // ══════════════════════════════════════════════════════════════════════════════════════════
    // THE micro-worlds DEFECT, ASSERTED HERE SO IT CANNOT HAPPEN TWICE.
    //
    // micro-worlds renamed `rewardShards`→`rewardWei`; worlds-web went on reading the old key,
    // and `undefined` rendered as nothing at all. 47 rows on mainnet showed a blank amount for a
    // year, and no test was red — because the tests pinned the FIELD NAME, and the field name they
    // pinned still existed in the test's own fixture.
    //
    // The money formatters here are the only defence that does not depend on remembering: an
    // amount this bundle failed to find comes out as a mark a person can see and report.
    // ══════════════════════════════════════════════════════════════════════════════════════════
    for (const [fn, name] of MONEY) {
      for (const missing of [undefined, null, '', '   ']) {
        assert.equal(fn(missing), '—', `${name} rendered a missing amount as something invisible`)
      }
    }
  })

  it('an UNRECOGNISED amount is returned verbatim, not reformatted and not zeroed', () => {
    // `src/lib/format.ts`: "A value this function does not recognise is returned VERBATIM. A
    // wrong-looking number a customer can quote is worth more than a tidy NaN." A shape this
    // bundle does not expect on the wire must arrive on screen intact so it can be reported.
    //
    // The empty string is not in this list for the money formatters: it is ABSENCE, and the test
    // above requires a dash for it. It stays in the list for the two that are not money.
    for (const [fn, name] of FORMATTERS) {
      for (const odd of ['n/a', '—', '1.5', '1e3', '0x10', '+5', '1_000', '99999999999999999999.']) {
        assert.equal(fn(odd), odd, `${name} rewrote a value it does not understand`)
      }
    }
    for (const [fn, name] of [[groupDigits, 'groupDigits'], [percent, 'percent']] as const) {
      for (const odd of ['', ' ']) {
        assert.equal(fn(odd), odd, `${name} rewrote a value it does not understand`)
      }
    }
  })

  it('a real zero is still a zero', () => {
    assert.equal(groupDigits('0'), '0')
    assert.equal(usd('0'), '$0.00')
    assert.equal(signedUsd('0'), '$0.00')
    assert.equal(percent('0'), '0.00%')
  })

  it('profitFactor tells "no losing trade" apart from a zero factor', () => {
    const base = { profitFactorBps: '0', losses: 0 } as Parameters<typeof profitFactor>[0]
    assert.equal(profitFactor(base), 'no losing trade')
    assert.equal(profitFactor({ ...base, losses: 3 }), '0.00×')
  })
})
