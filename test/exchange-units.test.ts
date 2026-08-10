/**
 * MONEY IS AN INTEGER, AND NOTHING ON THIS SURFACE IS ALLOWED TO FORGET IT.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * The exchange puts every amount on the wire as a decimal string holding an INTEGER count of an
 * asset's smallest unit. `amountTo` in `trade/src/money.ts` writes them and states the reason in one
 * sentence: "A JSON number is an IEEE 754 double and a large amount does not survive one — it does
 * not fail either, it comes back subtly wrong."
 *
 * "Subtly wrong" is what makes this worth a suite of its own rather than a couple of assertions
 * inside the render tests. A float defect on this path does not throw, does not log, and does not
 * look wrong on screen: `Number('0.1') * 1e8` is `10000000.000000002`, and the customer who typed
 * 0.1 BTC gets an order for a quantity nobody chose. There is no error state to observe. The only
 * way to know it has not happened is to prove the arithmetic never leaves the integers.
 *
 * So this file checks the same claim from three directions, and the three catch different mistakes:
 *
 *   1. BEHAVIOUR — the converters in `src/lib/units.ts` are exact over values a double cannot hold,
 *      refuse what they cannot express rather than rounding it, and round DOWN where they round.
 *   2. SOURCE — no module on the money path contains `Number(`, `parseFloat`, `parseInt`, `toFixed`
 *      or a unary `+`. This is the one that survives a future edit: a correct helper is easy to
 *      route around, and the routing-around is what would go unnoticed.
 *   3. THE SERVICE — the fee and notional arithmetic this bundle shows a customer BEFORE they
 *      commit is the same arithmetic micro-trade charges them AFTERWARDS. Two implementations that
 *      agree today and are checked by nothing are two implementations that will disagree.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import {
  applyBps,
  bpsPercent,
  floorToStep,
  formatUnits,
  notionalOf,
  onStep,
  parseUnits,
  toMinor,
  units,
} from '../src/lib/units.ts'

const here = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))
const read = (p: string) => readFileSync(here(p), 'utf8')

describe('a wire amount becomes a bigint, or nothing at all', () => {
  it('reads a plain integer', () => {
    assert.equal(toMinor('0'), 0n)
    assert.equal(toMinor('2500000'), 2_500_000n)
    assert.equal(toMinor('-1'), -1n)
  })

  it('reads an amount far past the safe integer, exactly', () => {
    // 21 million BTC in satoshis. `Number` cannot hold this: it is above 2^53, and the double
    // nearest to it is 2100000000000000000 — which is right by luck at this particular magnitude
    // and wrong one satoshi either side of it. The bigint is right at every magnitude.
    const supply = '2100000000000000001'
    assert.equal(toMinor(supply), 2_100_000_000_000_000_001n)
    assert.notEqual(BigInt(Number(supply)), 2_100_000_000_000_000_001n)
  })

  it('answers null — never zero — for anything that is not one', () => {
    // `BigInt('')` is 0n, silently. That is the defect this guard exists for: a missing amount that
    // renders as a confident nought is indistinguishable on screen from a real balance of nothing.
    assert.equal(toMinor(''), null)
    assert.equal(toMinor(null), null)
    assert.equal(toMinor(undefined), null)
    assert.equal(toMinor('1.5'), null)
    assert.equal(toMinor('1e8'), null)
    assert.equal(toMinor('0x10'), null)
    assert.equal(toMinor(' 1'), null)
    assert.equal(toMinor('n/a'), null)
  })
})

describe('minor units become the decimal a person reads, exactly', () => {
  it('places the point by integer division, not by scaling', () => {
    assert.equal(formatUnits(2_500_000n, 2), '25,000.00')
    assert.equal(formatUnits(10_000_000n, 8), '0.10000000')
    assert.equal(formatUnits(1n, 8), '0.00000001')
    assert.equal(formatUnits(0n, 8), '0.00000000')
  })

  it('is exact at a magnitude no double reaches', () => {
    assert.equal(formatUnits(2_100_000_000_000_000_001n, 8), '21,000,000,000.00000001')
  })

  it('keeps the sign on the whole figure, not on the fraction', () => {
    assert.equal(formatUnits(-1n, 8), '-0.00000001')
    assert.equal(formatUnits(-2_500_000n, 2), '-25,000.00')
  })

  it('groups the integer part and never the fraction', () => {
    assert.equal(formatUnits(123_456_789n, 2), '1,234,567.89')
    assert.equal(formatUnits(123_456_789n, 8), '1.23456789')
    assert.equal(formatUnits(123_456_789n, 2, { group: false }), '1234567.89')
  })

  it('trims trailing zeros without ever dropping a significant digit', () => {
    assert.equal(formatUnits(10_000_000n, 8, { trim: true }), '0.1')
    assert.equal(formatUnits(100_000_000n, 8, { trim: true }), '1')
    assert.equal(formatUnits(10_000_001n, 8, { trim: true }), '0.10000001')
  })

  it('has no point at all when the asset has no decimals', () => {
    assert.equal(formatUnits(7n, 0), '7')
  })

  it('hands back an unparseable wire value verbatim rather than a NaN', () => {
    // The rule `src/lib/format.ts` already keeps for Shards: a wrong-looking number a customer can
    // quote to support is worth more than a tidy dash that destroys the evidence.
    assert.equal(units('n/a', 8), 'n/a')
    assert.equal(units('10000000', 8, { trim: true }), '0.1')
  })
})

describe('what somebody typed becomes minor units, or is refused', () => {
  it('scales by padding digits, so 0.1 of eight decimals is exactly ten million', () => {
    // The whole point. `Number('0.1') * 1e8` is 10000000.000000002.
    assert.equal(parseUnits('0.1', 8), 10_000_000n)
    assert.equal(parseUnits('0.07', 2), 7n)
    assert.equal(parseUnits('1.1', 8), 110_000_000n)
    assert.equal(parseUnits('29.97', 2), 2997n)
  })

  it('accepts the shapes a person actually types', () => {
    assert.equal(parseUnits('1', 8), 100_000_000n)
    assert.equal(parseUnits('.5', 2), 50n)
    assert.equal(parseUnits('1.', 2), 100n)
    assert.equal(parseUnits('+1.5', 2), 150n)
    assert.equal(parseUnits('  1.5  ', 2), 150n)
  })

  it('REFUSES excess precision rather than rounding it', () => {
    // Rounding here would mean the number in the box and the number on the order differ, which is
    // the same class of defect as a float: the customer agreed to one thing and the exchange
    // received another. The form shows the refusal and offers a correction the customer presses.
    assert.equal(parseUnits('0.001', 2), null)
    assert.equal(parseUnits('0.123456789', 8), null)
    assert.equal(parseUnits('1.5', 0), null)
  })

  it('refuses a float’s spellings and a negative', () => {
    assert.equal(parseUnits('1e8', 8), null)
    assert.equal(parseUnits('1E8', 8), null)
    assert.equal(parseUnits('-1', 8), null)
    assert.equal(parseUnits('1.2.3', 8), null)
    assert.equal(parseUnits('', 8), null)
    assert.equal(parseUnits('.', 8), null)
    assert.equal(parseUnits('abc', 8), null)
    assert.equal(parseUnits('1,000', 2), null)
  })

  it('round-trips every amount it accepts', () => {
    // Typed -> minor -> displayed -> minor must be a fixed point. If it is not, some screen in this
    // bundle shows a figure that cannot be typed back in, which is how a customer ends up placing a
    // second order for a slightly different size than the one they meant to repeat.
    for (const [text, decimals] of [
      ['0.1', 8],
      ['1', 8],
      ['25000.00', 2],
      ['0.00000001', 8],
      ['21000000', 8],
      ['7', 0],
    ] as ReadonlyArray<readonly [string, number]>) {
      const minor = parseUnits(text, decimals)
      assert.notEqual(minor, null, `${text} should parse at ${decimals} decimals`)
      const shown = formatUnits(minor as bigint, decimals, { group: false })
      assert.equal(parseUnits(shown, decimals), minor, `${text} did not survive the round trip`)
    }
  })
})

describe('the market grid', () => {
  it('knows what sits on a step and what does not', () => {
    assert.equal(onStep(1000n, 100n), true)
    assert.equal(onStep(1050n, 100n), false)
    assert.equal(onStep(0n, 100n), true)
  })

  it('treats a step of zero as no grid rather than dividing by it', () => {
    assert.equal(onStep(1000n, 0n), false)
    assert.equal(floorToStep(1000n, 0n), 1000n)
  })

  it('corrects DOWNWARD, because rounding a quantity up spends money nobody offered', () => {
    assert.equal(floorToStep(1050n, 100n), 1000n)
    assert.equal(floorToStep(1000n, 100n), 1000n)
    assert.equal(floorToStep(99n, 100n), 0n)
  })
})

describe('what an order is worth, and what it costs', () => {
  it('divides the product by the base unit, exactly', () => {
    // 0.5 BTC at $25,000.00 with baseDecimals 8 and quoteDecimals 2:
    //   qty 50_000_000, price 2_500_000 -> 50_000_000 * 2_500_000 / 10^8 = 1_250_000 = $12,500.00
    assert.equal(notionalOf(50_000_000n, 2_500_000n, 8), 1_250_000n)
    assert.equal(formatUnits(notionalOf(50_000_000n, 2_500_000n, 8) as bigint, 2), '12,500.00')
  })

  it('declines to print a figure rather than truncate one', () => {
    // The engine's `notionalOf` throws a RangeError here (`trade/src/matching.ts`). A browser cannot
    // throw out of render, so it answers null and the screen says it cannot compute the cost.
    assert.equal(notionalOf(1n, 1n, 8), null)
  })

  it('charges a fee the way the service charges it: integer, rounded down', () => {
    assert.equal(applyBps(1_000_000n, 10), 1_000n)
    assert.equal(applyBps(1n, 10), 0n)
    assert.equal(applyBps(9_999n, 1), 0n)
    assert.equal(applyBps(10_000n, 1), 1n)
    assert.equal(applyBps(0n, 500), 0n)
  })

  it('reads basis points back as a percentage without a float', () => {
    assert.equal(bpsPercent(10), '0.1%')
    assert.equal(bpsPercent(150), '1.5%')
    assert.equal(bpsPercent(10_000), '100%')
    assert.equal(bpsPercent(0), '0%')
    assert.equal(bpsPercent(1), '0.01%')
    assert.equal(bpsPercent(-25), '-0.25%')
  })
})

/**
 * THE SOURCE SCAN.
 *
 * The behaviour tests above prove the helpers are exact. They cannot prove anybody used them: a
 * component that reaches for `Number(order.price)` to sort a column has bypassed every one of them,
 * and it will pass every test in this file that is not this one.
 *
 * Two lists, because "no float anywhere" is not quite the rule. A PIXEL is a float — an SVG
 * coordinate has to be one — and refusing that would mean no chart. The rule is that no float may
 * appear on the path an AMOUNT takes, and that a drawing may only reach one through an integer
 * division whose result is already a ratio.
 */
const MONEY_PATH = [
  'src/lib/units.ts',
  'src/lib/exchange.ts',
  'src/components/order-form.tsx',
  'src/components/order-tables.tsx',
  'src/pages/market.tsx',
  'src/pages/markets.tsx',
  'src/pages/orders.tsx',
  'src/pages/order.tsx',
  'src/pages/balances.tsx',
]

/** The two modules that draw. Held to the weaker rule below, and to nothing weaker than that. */
const DRAWS = ['src/components/ladder.tsx', 'src/components/candles.tsx']

/** Comments stripped, so a module may keep explaining the defect it does not contain. */
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

const FLOATS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bNumber\s*\(/, 'Number('],
  [/\bparseFloat\s*\(/, 'parseFloat('],
  [/\bparseInt\s*\(/, 'parseInt('],
  [/\.toFixed\s*\(/, '.toFixed('],
  [/\bMath\.(round|floor|ceil)\s*\(/, 'Math.round/floor/ceil'],
  [/[=(,[]\s*\+[A-Za-z_$]/, 'unary + on an identifier'],
]

describe('no float touches an amount', () => {
  it('is reading files that exist and have code in them', () => {
    // Without this, every assertion below passes on an empty string for ever — which is exactly how
    // a guard against an invisible defect becomes invisible itself.
    for (const file of [...MONEY_PATH, ...DRAWS]) {
      assert.ok(existsSync(here(file)), `${file} is named by this suite and is not there`)
      assert.ok(read(file).length > 500, `${file} is too short to be the module this suite means`)
    }
  })

  for (const file of MONEY_PATH) {
    it(`${file} converts nothing to a double`, () => {
      const code = withoutComments(read(file))
      for (const [pattern, name] of FLOATS) {
        assert.doesNotMatch(
          code,
          pattern,
          `${file} contains ${name}. Every amount on this path is an integer count of an asset's ` +
            'smallest unit; a double silently loses satoshis above 2^53 and misplaces them below ' +
            'it. Use the bigint helpers in src/lib/units.ts.',
        )
      }
    })
  }

  for (const file of DRAWS) {
    it(`${file} reaches a number only through an integer division`, () => {
      const code = withoutComments(read(file))
      const conversions = [...code.matchAll(/\bNumber\s*\(/g)]
      assert.ok(
        conversions.length > 0,
        `${file} is in the drawing list because it converts a bigint to a coordinate. It no ` +
          'longer does, so move it to MONEY_PATH and hold it to the stricter rule.',
      )
      for (const match of conversions) {
        // The argument, bounded by the parenthesis that closes it — never a fixed window.
        const open = code.indexOf('(', match.index)
        let depth = 0
        let end = open
        for (let i = open; i < code.length; i++) {
          if (code[i] === '(') depth += 1
          else if (code[i] === ')') {
            depth -= 1
            if (depth === 0) {
              end = i
              break
            }
          }
        }
        const argument = code.slice(open + 1, end)
        assert.match(
          argument,
          /\d+n\b/,
          `${file} converts \`${argument}\` to a number, and there is no bigint literal in it. A ` +
            'drawing may only reach a float through an integer division that has already produced ' +
            'a ratio — e.g. `Number((value * 1000n) / peak) / 10`. Converting an amount directly ' +
            'is the defect this suite exists for.',
        )
        assert.match(
          argument,
          /\//,
          `${file} converts \`${argument}\`, which is a bigint that has not been divided. Only a ` +
            'ratio may cross into floating point.',
        )
      }
    })

    it(`${file} never prints what it converted`, () => {
      // The division above bounds the error to a fraction of a pixel. That is fine for a bar's
      // width and unacceptable for a figure, so the two must not meet: no line may both convert to
      // a number and format an amount.
      for (const line of withoutComments(read(file)).split('\n')) {
        if (!/\bNumber\s*\(/.test(line)) continue
        assert.doesNotMatch(
          line,
          /\b(?:units|formatUnits|amountOf|scaled)\s*\(/,
          `${file} formats an amount on the same line it makes a float: ${line.trim()}`,
        )
      }
    })
  }

  it('the form sends what the customer typed as an integer string, never as a number', () => {
    const code = withoutComments(read('src/components/order-form.tsx'))
    // `minorOrRaw` is the only conversion between the boxes and the request body. It parses with the
    // bigint parser and stringifies the bigint; the fall-through hands the SERVICE the raw text so
    // that micro-trade says what is wrong with it rather than this form guessing.
    assert.match(code, /function minorOrRaw\(value: string, decimals: number\): string/)
    assert.match(code, /const minor = parseUnits\(value, decimals\)/)
    assert.match(code, /return minor === null \? value\.trim\(\) : minor\.toString\(\)/)
  })
})

/**
 * THE SERVICE'S ARITHMETIC, READ FROM THE SERVICE.
 *
 * `applyBps` and `notionalOf` exist in this bundle because a customer is shown what an order will
 * cost before they press the button. That figure is only worth showing if it is the figure they are
 * charged, and micro-trade is a different repository with its own copy of the sums.
 *
 * Skipped without a sibling checkout, for the reason `test/trade.test.ts` gives at length: `pnpm
 * test` must pass for somebody who has cloned only this repository, and CI is where the absence
 * becomes a failure.
 */
const TRADE_CANDIDATES = [
  process.env['CLOUDSFORGE_TRADE_DIR'],
  here('../trade/src'),
  here('.trade/src'),
].filter((v): v is string => Boolean(v))

const tradeSrc = TRADE_CANDIDATES.map((p) => p.replace(/\/server\.ts$/, '')).find((p) =>
  existsSync(`${p}/money.ts`),
)

describe('the browser and the engine do the same arithmetic', { skip: !tradeSrc }, () => {
  const money = () => readFileSync(`${tradeSrc}/money.ts`, 'utf8')
  const matching = () => readFileSync(`${tradeSrc}/matching.ts`, 'utf8')

  it('found the service to read', () => {
    assert.ok(tradeSrc, 'this suite claimed to read micro-trade and did not')
    assert.match(money(), /export function applyBps/)
  })

  it('the engine divides basis points by ten thousand, on integers, rounding down', () => {
    assert.match(money(), /export const BPS_SCALE = 10_000n/)
    assert.match(money(), /return \(amount \* BigInt\(bps\)\) \/ BPS_SCALE/)
    // Which is character-for-character what `applyBps` in src/lib/units.ts computes, with the
    // scale inlined. The behaviour test above pins the browser half.
    assert.equal(applyBps(1_000_000n, 10), (1_000_000n * 10n) / 10_000n)
  })

  it('the engine states, in its own comment, that the remainder goes to the platform', () => {
    // The direction matters more than the operator: rounding a fee UP overcharges, and a preflight
    // that quoted the rounded-down figure while the engine rounded up would understate every cost
    // on this surface by up to one minor unit per fill.
    assert.match(money(), /rounded DOWN/)
    assert.match(money(), /applyBpsUp/)
  })

  it('the engine treats an inexact notional as an error, and this bundle as an unknown', () => {
    const source = matching()
    assert.match(source, /export function notionalOf/)
    assert.match(source, /if \(raw % rules\.baseUnit !== 0n\)/)
    assert.match(source, /throw new RangeError/)
    // Same predicate, different response, and the difference is deliberate: a browser that threw
    // out of render would take the whole page down over one figure it could not compute.
    assert.equal(notionalOf(1n, 1n, 8), null)
  })

  it('the engine prices in quote units per ONE WHOLE base unit, which is what notionalOf assumes', () => {
    // If this sentence ever stops being true, every cost estimate in this bundle is wrong by a
    // factor of 10^baseDecimals — and it would look plausible, because it would still be an integer.
    assert.match(matching(), /quote smallest-units per one whole base unit/)
    assert.match(matching(), /const raw = qty \* price/)
    assert.match(matching(), /return raw \/ rules\.baseUnit/)
  })

  it('the wire spelling of an amount is a string, and the service says why', () => {
    assert.match(money(), /export function amountTo\(value: bigint\): string/)
    assert.match(money(), /return value\.toString\(\)/)
    assert.match(money(), /IEEE 754 double/)
  })
})
