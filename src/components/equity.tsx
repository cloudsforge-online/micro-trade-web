/**
 * The equity curve, which this estate computed, stored, and then served to nobody.
 *
 * `runBacktest` wrote `trades` and `equity` into columns that existed, and `COLUMNS` in
 * `trade/src/backtests.ts` selected neither — so no read path could reach them. Every ForgeTrade
 * report could say how deep a drawdown was and never when it happened, which is the one question a
 * curve exists to answer. `GET /v1/backtests/:id/result` (`trade/src/server.ts:447`) now serves it
 * and this draws it.
 *
 * ## Money never becomes a JS number
 *
 * Amounts arrive as decimal strings because `canonicalise` writes every bigint as a quoted string
 * (`trade/src/idempotency.ts:94`). Parsing one with `Number()` silently rounds above 2^53, and a
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
 */
import type { EquityPoint } from '../lib/trade.ts'

const WIDTH = 720
const HEIGHT = 220
const PAD = { top: 12, right: 12, bottom: 22, left: 12 }

/** Scale a bigint into the plot box without ever going through a float above 2^53. */
function project(value: bigint, min: bigint, span: bigint): number {
  if (span === 0n) return HEIGHT / 2
  // Multiply first, divide once: (value - min) / span, in permille, then to pixels.
  const permille = Number(((value - min) * 1000n) / span) / 1000
  const usable = HEIGHT - PAD.top - PAD.bottom
  return PAD.top + usable - permille * usable
}

function path(points: readonly EquityPoint[], pick: (p: EquityPoint) => string, min: bigint, span: bigint): string {
  const usable = WIDTH - PAD.left - PAD.right
  const step = points.length > 1 ? usable / (points.length - 1) : 0
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(PAD.left + i * step).toFixed(2)},${project(BigInt(pick(p)), min, span).toFixed(2)}`)
    .join(' ')
}

export function EquityCurve({ points }: { points: readonly EquityPoint[] }) {
  if (points.length < 2) {
    // Not a spinner and not an empty chart: a run this short produced no curve worth drawing, and
    // saying so is more useful than an axis with nothing on it.
    return <p className="tw-note">This run is too short to draw a curve — {points.length} point(s).</p>
  }

  const values = points.flatMap((p) => [BigInt(p.equity), BigInt(p.hold)])
  const min = values.reduce((a, b) => (b < a ? b : a))
  const max = values.reduce((a, b) => (b > a ? b : a))
  const span = max - min

  const first = points[0]
  const last = points[points.length - 1]
  const beatHold = first && last ? BigInt(last.equity) - BigInt(last.hold) : 0n

  return (
    <figure className="tw-chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="tw-chart__svg"
        role="img"
        aria-label={`Equity over ${points.length} points, drawn against buy and hold`}
        preserveAspectRatio="none"
      >
        <path d={path(points, (p) => p.hold, min, span)} className="tw-chart__hold" fill="none" />
        <path d={path(points, (p) => p.equity, min, span)} className="tw-chart__equity" fill="none" />
      </svg>
      <details className="tw-chart__table">
        <summary>The same points, as a table</summary>
        <table className="tw-table">
          <caption>
            Every point on the curve above, as it arrived. Amounts are decimal strings in Shards,
            unformatted, because this is the export path as well as the fallback.
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
          Modelled — not a promise.
        </span>
      </figcaption>
    </figure>
  )
}
