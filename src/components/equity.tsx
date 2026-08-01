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
