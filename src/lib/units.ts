/**
 * MONEY, IN INTEGER MINOR UNITS, WITH NO FLOAT ANYWHERE ON THE PATH.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * Every amount the exchange puts on the wire is an INTEGER, spelled as a decimal string, in the
 * smallest unit of its asset. `amountTo` in `trade/src/money.ts` writes them that way and the
 * comment above the views says why in one line: `JSON.stringify` **throws** on a bigint, and a
 * position in satoshis does not survive an IEEE 754 double.
 *
 * So this module is the only place in this bundle where a wire amount becomes something a person
 * reads, and the only place where something a person typed becomes a wire amount. It uses `bigint`
 * for all of it. There is no `Number(` in this file, no `parseFloat`, no `toFixed`, and
 * `test/exchange-units.test.ts` asserts that absence over the source — because the defect this
 * prevents is invisible: `Number('0.1') * 1e8` is `10000000.000000002`, and an order placed for
 * 10000000 satoshis instead of the 10000000 the customer typed is a quantity nobody chose.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── The three quantities on this surface, and what each one is measured in ────────────────────
 *
 *   * a QUANTITY is base-asset minor units. `BTC-USD` with `baseDecimals: 8` counts satoshis.
 *   * a PRICE is quote-asset minor units per ONE WHOLE base unit — `trade/src/matching.ts`
 *     states it: "Price is quoted in quote smallest-units per one whole base unit". A price of
 *     `2500000` on a market with `quoteDecimals: 2` is $25,000.00 per whole coin.
 *   * a NOTIONAL is quote-asset minor units: `qty * price / 10 ** baseDecimals`.
 *
 * That division is the one place a market could round money away, and it cannot: `markets.ts`
 * refuses to create a market unless `(lotSize * tickSize) % baseUnit === 0`, a CHECK constraint
 * named `markets_notional_exact` holds it in the database, and every quantity is a multiple of the
 * lot and every price a multiple of the tick. `notionalOf` below returns `null` rather than a
 * rounded answer if it is ever asked to divide something that does not divide, because a screen
 * that quietly truncates the cost of an order is worse than one that admits it cannot compute it.
 *
 * ── Why every function here answers `null` instead of throwing ────────────────────────────────
 *
 * These run inside render. `BigInt('')` is `0n` — silently, not a throw — so a component that
 * converts a wire value without checking has a path where a missing amount becomes a confident
 * nought; and `BigInt('n/a')` throws from inside render, which does not spoil one figure but takes
 * the whole page down. Both were live in this repository once (`test/money-unknown.test.ts` is the
 * report). The rule this bundle already keeps for Shards is kept here: print NO DIGIT when the
 * figure cannot be obtained.
 */

/** A decimal integer, optionally negative. What every amount on the exchange wire looks like. */
const MINOR = /^-?\d+$/

/**
 * A wire amount as a `bigint`, or `null` if it is not one.
 *
 * `null` covers the empty string, `undefined`, and anything a service would never send. It is not
 * a synonym for zero and no caller may treat it as one.
 */
export function toMinor(value: string | null | undefined): bigint | null {
  if (typeof value !== 'string' || !MINOR.test(value)) return null
  return BigInt(value)
}

/**
 * A `bigint` in minor units, as the decimal a person reads.
 *
 * Exact, by construction: the integer part and the fractional part are separated with `/` and `%`
 * on the bigint, and the fraction is zero-padded to `decimals` places. Nothing is rounded, because
 * nothing needs to be — the value already IS an integer number of minor units.
 *
 * `trim` drops trailing zeros from the fraction, for a column where `0.50000000` is noise. It never
 * drops a significant digit and never touches the integer part.
 */
export function formatUnits(
  minor: bigint,
  decimals: number,
  options: { group?: boolean; trim?: boolean } = {},
): string {
  const negative = minor < 0n
  const magnitude = negative ? -minor : minor
  const scale = 10n ** BigInt(decimals)
  const whole = magnitude / scale
  const sign = negative ? '-' : ''
  const integer = options.group === false ? whole.toString() : group(whole.toString())
  if (decimals === 0) return `${sign}${integer}`
  let fraction = (magnitude % scale).toString().padStart(decimals, '0')
  if (options.trim) fraction = fraction.replace(/0+$/, '')
  return fraction.length === 0 ? `${sign}${integer}` : `${sign}${integer}.${fraction}`
}

/**
 * A wire amount, straight to the decimal a person reads — or the string VERBATIM if it is not one.
 *
 * Verbatim rather than a dash, for the reason `src/lib/format.ts` gives for `shards`: a
 * wrong-looking number a customer can quote is worth more than a tidy `NaN`. A caller that wants
 * "unknown" rendered as absence tests `toMinor` for null itself and says so in words.
 *
 * `group: false` is for the one case where the output goes back INTO a field rather than onto the
 * screen: `parseUnits` refuses "24,999.00", so a grouped string handed to an input would be sent to
 * the service as raw text and refused there instead. The ladder's price buttons are that case.
 */
export function units(
  value: string,
  decimals: number,
  options?: { trim?: boolean; group?: boolean },
): string {
  const minor = toMinor(value)
  if (minor === null) return value
  return formatUnits(minor, decimals, {
    ...(options?.trim === undefined ? {} : { trim: options.trim }),
    ...(options?.group === undefined ? {} : { group: options.group }),
  })
}

/** Thousands separators on the integer part, and only there. */
function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * What somebody typed, as minor units — or `null` if it cannot be one.
 *
 * ── This function REFUSES excess precision rather than rounding it ────────────────────────────
 *
 * `0.123456789` on a market with eight decimals is not 0.12345679 and it is not 0.12345678: it is a
 * quantity this market cannot express, and the honest answer is to say so and let the form show the
 * customer why. Rounding here would mean the number in the box and the number on the order differ,
 * which is the same class of defect as a float — the customer agreed to one thing and the exchange
 * received another.
 *
 * Accepts `1`, `1.5`, `.5`, `1.`, and a leading `+`. Rejects an empty string, a bare `.`, anything
 * with a second point, exponent notation (`1e8` is a float's spelling and there is no float here),
 * and a negative — no amount on this surface is negative, and a minus typed into a quantity box is
 * a mistake worth refusing rather than silently interpreting.
 */
export function parseUnits(input: string, decimals: number): bigint | null {
  const text = input.trim().replace(/^\+/, '')
  if (!/^\d*\.?\d*$/.test(text) || text === '' || text === '.') return null
  const point = text.indexOf('.')
  const whole = point === -1 ? text : text.slice(0, point)
  const fraction = point === -1 ? '' : text.slice(point + 1)
  if (fraction.length > decimals) return null
  const digits = `${whole === '' ? '0' : whole}${fraction.padEnd(decimals, '0')}`
  return BigInt(digits)
}

/** Whether a value sits exactly on a market's grid — a lot for a quantity, a tick for a price. */
export function onStep(value: bigint, step: bigint): boolean {
  return step > 0n && value % step === 0n
}

/**
 * The nearest value AT OR BELOW `value` that sits on the grid.
 *
 * Down rather than to-nearest, everywhere, and for the same reason fees round down in the service
 * (`trade/src/money.ts`): rounding a customer's quantity UP spends money they did not offer.
 * Used only to suggest a correction, never applied to what is sent — the form shows the suggestion
 * and the customer presses it.
 */
export function floorToStep(value: bigint, step: bigint): bigint {
  if (step <= 0n) return value
  const remainder = value % step
  return remainder === 0n ? value : value - remainder
}

/**
 * `qty * price / 10 ** baseDecimals` — what an order is worth in the quote asset.
 *
 * `null` when the division is not exact, which on a well-formed market is impossible and on a
 * malformed one is the only honest answer. The engine's own `notionalOf` throws a `RangeError` in
 * that case (`trade/src/matching.ts`); a browser cannot throw out of render, so it declines to
 * print a figure instead.
 */
export function notionalOf(qty: bigint, price: bigint, baseDecimals: number): bigint | null {
  const baseUnit = 10n ** BigInt(baseDecimals)
  const product = qty * price
  if (product % baseUnit !== 0n) return null
  return product / baseUnit
}

/**
 * A fee, the way `applyBps` computes it in `trade/src/money.ts`: integer, rounded DOWN.
 *
 * Restated here rather than approximated, because this is the number a customer is shown before
 * they commit and the number they are charged afterwards, and those two must be the same arithmetic
 * rather than two arithmetics that agree today. Rounding down can never overcharge; the house eats
 * the remainder, which is the rule `money.ts` states.
 */
export function applyBps(amount: bigint, bps: number): bigint {
  return (amount * BigInt(bps)) / 10_000n
}

/** Basis points as a percentage a person reads: 150 → `1.5%`. Exact, on integers. */
export function bpsPercent(bps: number): string {
  const negative = bps < 0
  const magnitude = BigInt(Math.abs(Math.trunc(bps)))
  const whole = magnitude / 100n
  const fraction = (magnitude % 100n).toString().padStart(2, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${fraction === '' ? '' : `.${fraction}`}%`
}
