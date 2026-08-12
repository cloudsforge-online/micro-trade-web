/**
 * The equity curve, which this estate computed, stored, and then served to nobody.
 *
 * `runBacktest` wrote `trades` and `equity` into columns that existed, and `COLUMNS` in
 * `trade/src/backtests.ts` selected neither — so no read path could reach them. Every ForgeTrade
 * report could say how deep a drawdown was and never when it happened, which is the one question a
 * curve exists to answer. `GET /v1/backtests/:id/result` (`trade/src/server.ts`) now serves it
 * and this draws it.
 *
 * ## Money never becomes a JS number
 *
 * Amounts arrive as decimal strings because `canonicalise` writes every bigint as a quoted string
 * (`trade/src/idempotency.ts`). Parsing one with `Number()` silently rounds above 2^53, and a
 * chart is exactly where that would go unnoticed — the line would still look plausible. So the
 * range is computed in `BigInt`, and the only division is the final one that turns a value into a
 * pixel, where the loss is a fraction of a pixel and is the point.
 *
 * ## Buy-and-hold is drawn beside it, always
 *
 * `hold` is what the same money would have been worth doing nothing. A strategy curve without it
 * is a number with no scale — the estate's own rule is that a strategy which only works for free
 * does not work, and the same honesty applies to one that only beats cash.
 *
 * ## And the same numbers, as a table
 *
 * `docs/ecosystem/14-testing-strategy.md` §11 makes the table view BOTH the accessibility fallback
 * and the export path, and `docs/ecosystem/22-browser-journeys.md` BJ-A11Y-08 makes it a
 * release-gate scenario: "every chart has its table view … reachable by keyboard and carrying the
 * same numbers".
 *
 * An `aria-label` on an `<svg role="img">` says how many points there are. It does not say what
 * any of them WERE, and a drawdown a reader cannot read the date of is the question the curve was
 * added to answer, asked again. So the same array is rendered as rows, in a `<details>` — closed
 * by default so the chart is still the chart, and reachable by keyboard because a `<summary>` is
 * focusable and operable without a pointer.
 *
 * The rows carry the values as they arrived, as strings. Formatting them would be a second opinion
 * about a number this component has gone to some trouble not to have one about.
 *
 * ## Every point here has ONE provenance, and it is not a quote
 *
 * A live bot's stored equity is marked against whatever pricing answered at that moment, and
 * `bots.equity_price_source` records which — a market of independent sources, or a figure an
 * operator set (micro-org#368, `trade/src/bots.ts`). A BACKTEST has no such column and needs none:
 * `runBacktest` walks bars and marks at `bar.c` (`trade/src/backtest.ts`), never calling pricing at
 * all, so a curve has one provenance by construction.
 *
 * That is stated on the chart rather than left to be inferred. "Marked at each bar's close" is a
 * narrower claim than the reader would otherwise make, and a curve that said nothing would be read
 * as prices somebody could have traded at.
 *
 * ## And a value it cannot read is not a zero
 *
 * `BigInt('')` is `0n`. Not a throw, not a NaN — zero. So a point that arrived without an amount
 * used to be PLOTTED AT ZERO and, worse, fed into the verdict in the caption: a curve with two
 * unreadable equity values rendered a cliff to the floor of the chart under the sentence "Finished
 * behind buy-and-hold." That is this component telling a customer their strategy lost, on the
 * strength of a number it never had. `BigInt('n/a')` does the opposite and THROWS, from inside
 * render, which takes the whole report down rather than one figure.
 *
 * `amount()` below is the only way a string becomes a bigint here, and it answers `null` for
 * anything that is not a decimal integer. When any point is unreadable the curve is not drawn and
 * the verdict is not stated — the table still renders, carrying every value verbatim, which is
 * `src/lib/format.ts`'s rule for the same situation ("A value this function does not recognise is
 * returned VERBATIM. A wrong-looking number a customer can quote is worth more than a tidy NaN")
 * and `micro-tessera-web`'s: print NO DIGIT rather than a digit you cannot stand behind.
 */
import type { EquityPoint } from '../lib/trade.ts'

const WIDTH = 720
const HEIGHT = 220
const PAD = { top: 12, right: 12, bottom: 22, left: 12 }

/** A decimal-integer amount as a bigint, or `null` when this is not one. Never a silent zero. */
function amount(value: string): bigint | null {
  return /^-?\d+$/.test(value) ? BigInt(value) : null
}

/** Scale a bigint into the plot box without ever going through a float above 2^53. */
function project(value: bigint, min: bigint, span: bigint): number {
  if (span === 0n) return HEIGHT / 2
  // Multiply first, divide once: (value - min) / span, in permille, then to pixels.
  const permille = Number(((value - min) * 1000n) / span) / 1000
  const usable = HEIGHT - PAD.top - PAD.bottom
  return PAD.top + usable - permille * usable
}

function path(values: readonly bigint[], min: bigint, span: bigint): string {
  const usable = WIDTH - PAD.left - PAD.right
  const step = values.length > 1 ? usable / (values.length - 1) : 0
  return values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(PAD.left + i * step).toFixed(2)},${project(v, min, span).toFixed(2)}`)
    .join(' ')
}

export function EquityCurve({ points }: { points: readonly EquityPoint[] }) {
  if (points.length < 2) {
    // Not a spinner and not an empty chart: a run this short produced no curve worth drawing, and
    // saying so is more useful than an axis with nothing on it.
    return <p className="tw-note">This run is too short to draw a curve — {points.length} point(s).</p>
  }

  // Read every amount ONCE, and find out whether they could all be read, before anything is drawn
  // or claimed. `unreadable` is a count rather than a boolean so the note can say how many.
  const equities: bigint[] = []
  const holds: bigint[] = []
  for (const point of points) {
    const equity = amount(point.equity)
    const hold = amount(point.hold)
    if (equity === null || hold === null) continue
    equities.push(equity)
    holds.push(hold)
  }
  const unreadable = points.length - equities.length

  if (unreadable > 0) {
    // No curve and NO VERDICT. Both would be computed from values this component could not read,
    // and `BigInt('')` would have made them all zero without saying so. The table stays, because
    // the values as they arrived are exactly what a customer can quote to support.
    return (
      <figure className="tw-chart">
        <p className="tw-note" role="status">
          <strong>This curve cannot be drawn.</strong> {unreadable} of {points.length} point(s)
          carry an amount this page cannot read as a whole number of US cents. The points are below,
          exactly as they arrived — nothing here is being shown as a zero on their behalf.
        </p>
        <PointsTable points={points} />
      </figure>
    )
  }

  const values = [...equities, ...holds]
  const min = values.reduce((a, b) => (b < a ? b : a))
  const max = values.reduce((a, b) => (b > a ? b : a))
  const span = max - min

  const lastEquity = equities[equities.length - 1] ?? 0n
  const lastHold = holds[holds.length - 1] ?? 0n
  const beatHold = lastEquity - lastHold

  return (
    <figure className="tw-chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="tw-chart__svg"
        role="img"
        aria-label={`Equity over ${points.length} points, drawn against buy and hold`}
        preserveAspectRatio="none"
      >
        <path d={path(holds, min, span)} className="tw-chart__hold" fill="none" />
        <path d={path(equities, min, span)} className="tw-chart__equity" fill="none" />
      </svg>
      <PointsTable points={points} />
      <figcaption className="tw-chart__legend">
        <span className="tw-chart__key tw-chart__key--equity">Strategy</span>
        <span className="tw-chart__key tw-chart__key--hold">Buy and hold</span>
        <span className="tw-chart__caption">
          {points.length} points.{' '}
          {beatHold === 0n
            ? 'Finished level with buy-and-hold.'
            : beatHold > 0n
              ? 'Finished ahead of buy-and-hold.'
              : 'Finished behind buy-and-hold.'}{' '}
          Every point is marked at that bar&rsquo;s close, never at a quoted price. Modelled — not a
          promise.
        </span>
      </figcaption>
    </figure>
  )
}

/** The same points as rows — the accessibility fallback and the export path, values verbatim. */
function PointsTable({ points }: { points: readonly EquityPoint[] }) {
  return (
    <details className="tw-chart__table">
      <summary>The same points, as a table</summary>
      <table className="tw-table">
        <caption>
          Every point on the curve above, as it arrived. Amounts are decimal strings in whole US
          cents, unformatted, because this is the export path as well as the fallback — 1000000 is
          $10,000.00. Each row is marked at that bar&rsquo;s close; no figure here was priced by a
          quote.
        </caption>
        <thead>
          <tr>
            <th scope="col">Bar (unix seconds)</th>
            <th scope="col">Strategy</th>
            <th scope="col">Buy and hold</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.t}>
              <td className="cf-num">{point.t}</td>
              <td className="cf-num">{point.equity}</td>
              <td className="cf-num">{point.hold}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
