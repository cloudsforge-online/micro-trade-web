/**
 * The depth ladder: what is waiting to be bought and sold, and at what price.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * ── THE CUMULATIVE COLUMN IS THE POINT, AND IT IS COMPUTED IN `bigint` ────────────────────────
 *
 * A level tells you how much sits at ONE price. What a customer about to send a market order needs
 * is how much sits at that price OR BETTER, because that is what their order will eat through. That
 * running total is the only figure on this screen this app computes for itself rather than reading
 * off the wire, so it is computed the way the engine computes money: integer minor units, in
 * `bigint`, with no division anywhere. The only float in this file turns a total into a BAR WIDTH,
 * where a fraction of a pixel is the entire error budget.
 *
 * ── THE PUBLISHED SIZE IS NOT NECESSARILY THE REAL ONE, AND THE SCREEN SAYS SO ────────────────
 *
 * A reserve order publishes `displayQty` and hides the rest (`trade/src/marketdata.ts`), so a
 * level can be larger than it looks — never smaller. A customer who reads a thin book that is not
 * thin sizes their order wrongly, so the caption says it in words rather than this file saying it
 * in a comment.
 *
 * ── CLICKING A PRICE FILLS THE TICKET, IT DOES NOT SEND AN ORDER ──────────────────────────────
 *
 * Every price is a real `<button>`, so the ladder is operable from the keyboard, and pressing one
 * copies that price into the order form and nothing else. A ladder where a stray click spends money
 * is a ladder nobody can safely explore, and exploring it is how somebody learns to read it.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import type { Depth, DepthLevel, Market, Side } from '../lib/exchange.ts'
import { formatUnits, toMinor, units } from '../lib/units.ts'
import { Explain } from './tooltip.tsx'

/** One side of the book, with the running total already accumulated. */
interface Rung {
  readonly price: string
  readonly qty: string
  readonly orders: number
  /** Everything at this price or better, in base minor units. Null if a level was unreadable. */
  readonly cumulative: bigint | null
}

/**
 * Accumulate a side.
 *
 * Levels arrive best-first on both sides (`trade/src/marketdata.ts` orders bids descending and
 * asks ascending), so the running total is simply a prefix sum — no sorting, and no assumption
 * about the order that a re-sort here would hide if it were ever wrong.
 *
 * A level whose quantity is not a decimal integer stops the accumulation dead: from that point down
 * the total is `null` and the column prints nothing. It does not print the total so far under a
 * heading that claims it includes the row above it.
 */
function accumulate(levels: readonly DepthLevel[]): Rung[] {
  const rungs: Rung[] = []
  let running: bigint | null = 0n
  for (const level of levels) {
    const qty = toMinor(level.qty)
    running = running === null || qty === null ? null : running + qty
    rungs.push({ price: level.price, qty: level.qty, orders: level.orders, cumulative: running })
  }
  return rungs
}

/** A total as a share of the deepest total, in permille, for a bar width. Never above 100. */
function share(value: bigint | null, peak: bigint): number {
  if (value === null || peak <= 0n) return 0
  return Number((value * 1000n) / peak) / 10
}

export function DepthLadder({
  depth,
  market,
  onPickPrice,
}: {
  depth: Depth
  market: Market
  onPickPrice: (price: string) => void
}) {
  const bids = accumulate(depth.bids)
  const asks = accumulate(depth.asks)

  // One scale across both sides, so a book with fifty bids and one ask LOOKS like one, which is the
  // single most useful thing a ladder can tell somebody at a glance.
  const deepest = [...bids, ...asks].reduce<bigint>(
    (peak, rung) => (rung.cumulative !== null && rung.cumulative > peak ? rung.cumulative : peak),
    0n,
  )

  const bestBid = toMinor(depth.bids[0]?.price ?? null)
  const bestAsk = toMinor(depth.asks[0]?.price ?? null)
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null

  return (
    <div className="tw-ladder">
      <table className="tw-table tw-table--ladder">
        <caption className="tw-table__caption">
          <Explain term="order_book" />. Quantities are the{' '}
          <Explain term="published_size">published size</Explain>: an order may be hiding part of
          itself, so a level can hold more than it shows — never less. Press a price to copy it into
          the ticket.
        </caption>
        <thead>
          <tr>
            <th scope="col">Price ({market.quoteAsset})</th>
            <th scope="col">Size ({market.baseAsset})</th>
            <th scope="col">
              <Explain term="cumulative_depth">Total</Explain>
            </th>
            <th scope="col">Orders</th>
          </tr>
        </thead>
        {/*
          Asks are rendered `.slice().reverse()` — worst price at the top, best just above the
          spread — which is the arrangement every venue uses and the one that makes the spread the
          middle of the picture rather than a seam between two lists that both count upwards.
        */}
        <tbody className="tw-ladder__side tw-ladder__side--ask">
          {asks
            .slice()
            .reverse()
            .map((rung) => (
              <LadderRow
                key={`ask-${rung.price}`}
                rung={rung}
                side="sell"
                market={market}
                peak={deepest}
                onPickPrice={onPickPrice}
              />
            ))}
        </tbody>
        <tbody className="tw-ladder__spread">
          <tr>
            <td colSpan={4}>
              {spread === null ? (
                <span className="tw-absent">
                  {/*
                    One-sided or empty. That is a real state of a real book and not a loading state:
                    a market nobody is quoting on the other side has no spread to report.
                  */}
                  Nothing is quoted on {bestBid === null ? 'the buying' : 'the selling'} side, so
                  there is no spread to measure.
                </span>
              ) : (
                <>
                  <Explain term="spread" />{' '}
                  <strong className="cf-num">
                    {formatUnits(spread, market.quoteDecimals)} {market.quoteAsset}
                  </strong>{' '}
                  <span className="tw-dim">
                    between the best bid and the best ask. Crossing it is what a market order pays.
                  </span>
                </>
              )}
            </td>
          </tr>
        </tbody>
        <tbody className="tw-ladder__side tw-ladder__side--bid">
          {bids.map((rung) => (
            <LadderRow
              key={`bid-${rung.price}`}
              rung={rung}
              side="buy"
              market={market}
              peak={deepest}
              onPickPrice={onPickPrice}
            />
          ))}
        </tbody>
      </table>
      {bids.length === 0 && asks.length === 0 && (
        <p className="tw-note" role="status">
          The book is empty. Nobody is offering to buy or sell at any price, so a market order has
          nothing to trade against — the first limit order placed here becomes the book.
        </p>
      )}
    </div>
  )
}

function LadderRow({
  rung,
  side,
  market,
  peak,
  onPickPrice,
}: {
  rung: Rung
  side: Side
  market: Market
  peak: bigint
  onPickPrice: (price: string) => void
}) {
  const width = share(rung.cumulative, peak)
  return (
    <tr className={`tw-ladder__row tw-ladder__row--${side === 'buy' ? 'bid' : 'ask'}`}>
      <th scope="row">
        {/* The bar is drawn behind the row by an element with no text, so no screen reader reads a
            width aloud and no assistive technology is told a percentage means a price. */}
        <span className="tw-ladder__bar" style={{ width: `${width}%` }} aria-hidden="true" />
        <button
          type="button"
          className="tw-ladder__price cf-num"
          /*
           * The DECIMAL, not the wire amount.
           *
           * `rung.price` is quote minor units — 2499900 for 24,999.00 — and the ticket's price box
           * holds what a person types, which the form converts on submit. Handing the minor amount
           * to the field puts "2499900" in it, and pressing Buy then sends an order priced at
           * 2,499,900.00: a hundredfold error, made by a control whose entire purpose is to save the
           * customer from mistyping a price. Ungrouped because `parseUnits` refuses "24,999.00".
           */
          onClick={() => onPickPrice(units(rung.price, market.quoteDecimals, { group: false }))}
        >
          {/* `units` prints an unreadable amount VERBATIM rather than as a zero — the rule
              `src/lib/units.ts` states, and the defect `test/money-unknown.test.ts` records. */}
          {units(rung.price, market.quoteDecimals)}
          <span className="tw-sr">
            {' '}
            — copy this {side === 'buy' ? 'bid' : 'ask'} price into the order form
          </span>
        </button>
      </th>
      <td className="cf-num">{units(rung.qty, market.baseDecimals, { trim: true })}</td>
      <td className="cf-num">
        {rung.cumulative === null ? (
          <span className="tw-absent">—</span>
        ) : (
          formatUnits(rung.cumulative, market.baseDecimals, { trim: true })
        )}
      </td>
      <td className="cf-num">{rung.orders}</td>
    </tr>
  )
}
