/**
 * Every order you have placed, across every market — and every trade of yours that resulted.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * `GET /v1/exchange/orders` with `open=true` narrows to the WORKING SET (`pending_trigger` and
 * `open`); without it the same route is the history (`trade/src/orders.ts`). That is one route
 * and two very different questions, so this screen makes the choice explicit rather than picking
 * one and calling it "orders":
 *
 *   * **Working** is the question "what of mine is live right now" — and it is the one with the
 *     cancel buttons on it, because it is the only one where cancelling can do anything.
 *   * **All** is the question "what have I done" — a history, with no buttons, because a cancel on
 *     a filled order from last week is a control that can only ever answer 409.
 *
 * ── Why the markets are read as well ──────────────────────────────────────────────────────────
 *
 * An order carries `marketId` and a quantity in minor units; it does not carry the decimals those
 * minor units are counted in. Rendering a satoshi count with two decimal places produces a number
 * that looks like money and is wrong by six orders of magnitude, so the market list is read
 * alongside and the scale is looked up per row (`scalesOf`, `src/components/order-tables.tsx`).
 * If that read fails the amounts are printed VERBATIM — unformatted, and correct.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useState } from 'react'
import { FillsTable, OpenOrders, OrdersTable, scalesOf } from '../components/order-tables.tsx'
import { Explain, Note } from '../components/tooltip.tsx'
import { listFills, listMarkets, listOrders } from '../lib/exchange.ts'
import { OrderBookGate, useOrderBook } from '../lib/orderbook.tsx'
import { useResource } from '../lib/resource.ts'

const PAGE = 200

export function OrdersPage() {
  const gate = useOrderBook()
  return (
    <section className="tw-page">
      <header className="tw-page__head">
        <h1 className="tw-page__title">Your orders</h1>
      </header>
      <OrderBookGate state={gate}>{() => <Orders />}</OrderBookGate>
    </section>
  )
}

function Orders() {
  const [working, setWorking] = useState(true)

  const markets = useResource(
    (signal) => listMarkets(signal),
    (data) => data.markets.length,
    'We could not read the markets, so amounts below are shown unformatted.',
  )
  const orders = useResource(
    (signal) => listOrders({ open: working, limit: PAGE }, signal),
    (data) => data.orders.length,
    working ? 'We could not read your working orders.' : 'We could not read your orders.',
    [working],
  )
  const fills = useResource(
    (signal) => listFills({ limit: PAGE }, signal),
    (data) => data.fills.length,
    'We could not read your fills.',
  )

  // Absent rather than empty when the market read failed: `scales` being undefined is what makes
  // the tables print amounts verbatim, which is the honest answer when the decimals are unknown.
  const scales = markets.data ? scalesOf(markets.data.markets) : undefined

  return (
    <>
      <Note>
        An order is your INSTRUCTION; a fill is a trade that actually happened because of it. One
        order can produce many fills, at different prices, and the{' '}
        <Explain term="average_price" /> on the order is what you really paid across all of them.
      </Note>

      <div className="tw-tabs" role="group" aria-label="Which orders to show">
        <button
          type="button"
          className={`cf-btn ${working ? 'cf-btn--primary' : 'cf-btn--quiet'}`}
          aria-pressed={working}
          onClick={() => setWorking(true)}
        >
          Working now
        </button>
        <button
          type="button"
          className={`cf-btn ${working ? 'cf-btn--quiet' : 'cf-btn--primary'}`}
          aria-pressed={!working}
          onClick={() => setWorking(false)}
        >
          Everything, including finished
        </button>
      </div>

      {working ? (
        <OpenOrders orders={orders} scales={scales} onChanged={orders.reload} />
      ) : (
        <OrdersTable orders={orders} scales={scales} />
      )}

      <section className="tw-section" aria-labelledby="fills-heading">
        <h2 id="fills-heading" className="tw-section__title">
          Your fills
        </h2>
        <FillsTable fills={fills} scales={scales} />
      </section>
    </>
  )
}
