/**
 * The price chart, drawn as candles, with the same numbers underneath as a table.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * Two rules are inherited from `src/components/equity.tsx`, and they are inherited because both
 * were learned the hard way in this repository:
 *
 *   1. **Money never becomes a JS number.** Every price arrives as an integer string of quote minor
 *      units. The high, the low and the span are `bigint`; the only float is the last division that
 *      turns a value into a y-coordinate, where the loss is a fraction of a pixel and is the point.
 *
 *   2. **A value that cannot be read is not a zero.** `BigInt('')` is `0n`, silently, and a chart is
 *      exactly where that goes unnoticed: the line still looks plausible. A bucket carrying an
 *      unreadable price is not plotted at the floor — the chart declines to draw and the table still
 *      renders every value verbatim, which is what a customer can quote to support.
 *
 * And one rule from the docs: `docs/ecosystem/14-testing-strategy.md` §11 makes the table view both
 * the accessibility fallback and the export path, and `docs/ecosystem/22-browser-journeys.md`
 * BJ-A11Y-08 makes it a release gate — "every chart has its table view … reachable by keyboard and
 * carrying the same numbers". An `aria-label` saying how many candles there are does not tell a
 * screen-reader user what any of them WERE.
 *
 * ── This chart describes the past and is not labelled MODELLED ────────────────────────────────
 *
 * `MODELLED` belongs to figures a simulation produced. These candles are trades that really
 * happened on this venue, aggregated by `trade/src/marketdata.ts`. Labelling them modelled would
 * be as wrong as leaving the label off a backtest.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import type { Candle } from '../lib/exchange.ts'
import { barTime } from '../lib/format.ts'
import { formatUnits, toMinor, units } from '../lib/units.ts'

const WIDTH = 720
const HEIGHT = 260
const PAD = { top: 12, right: 12, bottom: 20, left: 12 }

/** Every price on one candle, read once, or null if any of the four is not a decimal integer. */
interface Bar {
  readonly t: number
  readonly open: bigint
  readonly high: bigint
  readonly low: bigint
  readonly close: bigint
}

function readBar(candle: Candle): Bar | null {
  const open = toMinor(candle.open)
  const high = toMinor(candle.high)
  const low = toMinor(candle.low)
  const close = toMinor(candle.close)
  if (open === null || high === null || low === null || close === null) return null
  return { t: candle.t, open, high, low, close }
}

/** A price to a y-coordinate. Multiply first, divide once — the same shape as the equity curve. */
function project(value: bigint, low: bigint, span: bigint): number {
  if (span === 0n) return HEIGHT / 2
  const permille = Number(((value - low) * 1000n) / span) / 1000
  const usable = HEIGHT - PAD.top - PAD.bottom
  return PAD.top + usable - permille * usable
}

export function CandleChart({
  candles,
  interval,
  quoteDecimals,
  quoteAsset,
}: {
  candles: readonly Candle[]
  interval: string
  quoteDecimals: number
  quoteAsset: string
}) {
  const bars: Bar[] = []
  for (const candle of candles) {
    const bar = readBar(candle)
    if (bar !== null) bars.push(bar)
  }
  const unreadable = candles.length - bars.length

  if (unreadable > 0 || bars.length === 0) {
    return (
      <figure className="tw-chart">
        <p className="tw-note" role="status">
          {bars.length === 0 ? (
            <>
              <strong>There is nothing to draw yet.</strong> No trade has printed in this window, so
              there are no candles — an untraded market is not a flat line at zero.
            </>
          ) : (
            <>
              <strong>This chart cannot be drawn.</strong> {unreadable} of {candles.length}{' '}
              candle(s) carry a price this page cannot read as a whole number of minor units. The
              values are below exactly as they arrived; nothing is being shown as a zero on their
              behalf.
            </>
          )}
        </p>
        <CandleTable candles={candles} interval={interval} quoteAsset={quoteAsset} />
      </figure>
    )
  }

  const low = bars.reduce((least, bar) => (bar.low < least ? bar.low : least), bars[0]!.low)
  const high = bars.reduce((most, bar) => (bar.high > most ? bar.high : most), bars[0]!.high)
  const span = high - low

  const usable = WIDTH - PAD.left - PAD.right
  const slot = usable / bars.length
  // A body at least one pixel wide, so a chart of three hundred candles is still a chart rather
  // than a smear, and at most twelve so a chart of four is not four billboards.
  const body = Math.max(1, Math.min(12, slot * 0.62))

  return (
    <figure className="tw-chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="tw-chart__svg tw-chart__svg--candles"
        role="img"
        aria-label={`${bars.length} ${interval} candles, from ${formatUnits(low, quoteDecimals)} to ${formatUnits(high, quoteDecimals)} ${quoteAsset}. The same figures are in the table below.`}
        preserveAspectRatio="none"
      >
        {bars.map((bar, index) => {
          const centre = PAD.left + slot * index + slot / 2
          const top = project(bar.high, low, span)
          const bottom = project(bar.low, low, span)
          const openY = project(bar.open, low, span)
          const closeY = project(bar.close, low, span)
          const up = bar.close >= bar.open
          // A doji — open equal to close — would otherwise be a zero-height rectangle, which draws
          // as nothing at all and reads as a gap in the data rather than as an unchanged price.
          const height = Math.max(1, Math.abs(closeY - openY))
          return (
            <g key={bar.t} className={`tw-candle tw-candle--${up ? 'up' : 'down'}`}>
              <line x1={centre} x2={centre} y1={top} y2={bottom} className="tw-candle__wick" />
              <rect
                x={centre - body / 2}
                y={Math.min(openY, closeY)}
                width={body}
                height={height}
                className="tw-candle__body"
              />
            </g>
          )
        })}
      </svg>
      <figcaption className="tw-chart__legend">
        <span className="tw-chart__caption">
          {bars.length} candles of {interval}. High {formatUnits(high, quoteDecimals)}, low{' '}
          {formatUnits(low, quoteDecimals)} {quoteAsset}. These are trades that happened, not a
          forecast.
        </span>
      </figcaption>
      <CandleTable candles={candles} interval={interval} quoteAsset={quoteAsset} />
    </figure>
  )
}

/**
 * The same candles as rows — the accessibility fallback and the export path.
 *
 * Closed by default, so the chart is still the chart, and reachable by keyboard because a
 * `<summary>` is focusable and operable without a pointer. The amounts are printed as they
 * arrived: this is the export path, and formatting them would be a second opinion about a number
 * this component has gone to some trouble not to have one about.
 */
function CandleTable({
  candles,
  interval,
  quoteAsset,
}: {
  candles: readonly Candle[]
  interval: string
  quoteAsset: string
}) {
  return (
    <details className="tw-chart__table">
      <summary>The same {interval} candles, as a table</summary>
      <table className="tw-table">
        <caption>
          Every bucket above. Prices are decimal strings of {quoteAsset} minor units, unformatted,
          because this is the export path as well as the fallback.
        </caption>
        <thead>
          <tr>
            <th scope="col">Bucket start</th>
            <th scope="col">Open</th>
            <th scope="col">High</th>
            <th scope="col">Low</th>
            <th scope="col">Close</th>
            <th scope="col">Volume</th>
            <th scope="col">Trades</th>
          </tr>
        </thead>
        <tbody>
          {candles.map((candle) => (
            <tr key={candle.t}>
              <th scope="row">{barTime(candle.t)}</th>
              <td className="cf-num">{candle.open}</td>
              <td className="cf-num">{candle.high}</td>
              <td className="cf-num">{candle.low}</td>
              <td className="cf-num">{candle.close}</td>
              <td className="cf-num">{candle.baseVolume}</td>
              <td className="cf-num">{candle.trades}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

/** Exported for the tape and the ticker, which print the same prices in the same shape. */
export function price(value: string | null, decimals: number, missing: string) {
  if (value === null) return <span className="tw-absent">{missing}</span>
  return <span className="cf-num">{units(value, decimals)}</span>
}
