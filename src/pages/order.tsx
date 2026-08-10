/**
 * One order, and the answer to "why did it do that".
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * `GET /v1/exchange/orders/:id/events` is append-only and served verbatim, and the service says
 * what it is for: "this is the surface that answers 'why did my order do that', and it answers it
 * with what was written at the time rather than with a state machine's guess reconstructed
 * afterwards" (`trade/src/server.ts`). So this page renders the trail as it arrived, in order,
 * with the detail line the engine wrote — not a re-derivation, and not a summary.
 *
 * That matters most for the events a customer did not cause. An order can be `reduced` because
 * somebody else's order met it under self-trade prevention; it can be `expired` because its
 * good-til-time passed; it can be `rejected` after acceptance. Each of those is somebody's money
 * changing hands or not changing hands, and each of them has one line here saying so.
 *
 * ── Somebody else's order is a 404, not a 403 ─────────────────────────────────────────────────
 *
 * The ownership filter is in the WHERE clause (`trade/src/orders.ts`) because "a 403 confirms the
 * id exists, which is enough to enumerate the exchange's order ids". So the not-found state here
 * says the order does not exist FOR YOU, which is exactly what the service knows and exactly what
 * it is prepared to say.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { Link, useParams } from 'react-router-dom'
import { FillsTable, scalesOf } from '../components/order-tables.tsx'
import { Empty, Failed, Forbidden, Loading } from '../components/states.tsx'
import { Fact, StateBadge } from '../components/tone.tsx'
import { Explain, Explained, Note } from '../components/tooltip.tsx'
import {
  cancelOrder,
  getMarket,
  getOrder,
  getOrderEvents,
  listFills,
  type Market,
  type Order,
  type OrderEvent,
  type OwnFill,
} from '../lib/exchange.ts'
import { orderTone, sideWord, timestamp } from '../lib/format.ts'
import {
  ORDER_STATUS_TERMS,
  explanationFor,
  orderEventLabel,
  orderTypeLabel,
  stpLabel,
  tifLabel,
} from '../lib/glossary.ts'
import { useMutation } from '../lib/mutation.ts'
import { OrderBookGate, useOrderBook } from '../lib/orderbook.tsx'
import { useResource, type Resource } from '../lib/resource.ts'
import { units } from '../lib/units.ts'

/** The two states in which a cancel can do anything. Everything else is terminal. */
const CANCELLABLE: readonly string[] = ['open', 'pending_trigger']

export function OrderPage() {
  const params = useParams<{ id: string }>()
  const id = params.id ?? ''
  const gate = useOrderBook()

  return (
    <section className="tw-page">
      <OrderBookGate state={gate}>{() => <OrderDetail id={id} />}</OrderBookGate>
    </section>
  )
}

function OrderDetail({ id }: { id: string }) {
  const order = useResource(
    (signal) => getOrder(id, signal),
    () => 1,
    'We could not read this order.',
    [id],
  )

  // The FIRST read only. `state` goes back to loading on every reload — the terminal's five-second
  // poll, and every cancel that re-reads this list — and swapping a table somebody is reading for a
  // spinner twelve times a minute is the defect `src/pages/market.tsx` records at length.
  if (order.state === 'loading' && order.data === null) return <Loading label="Reading the order" />
  if (order.state === 'forbidden') return <Forbidden notice={order.error ?? undefined} />
  if (order.error) {
    return (
      <Failed
        notice={order.error}
        onRetry={order.reload}
        title="We could not read this order"
      />
    )
  }
  if (!order.data) return <Loading label="Reading the order" />

  return <Body order={order.data.order} onChanged={order.reload} />
}

function Body({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const symbol = order.symbol ?? ''

  // The market is read for its DECIMALS. Without them every amount below is an integer count of
  // minor units, which is correct but unreadable; with the wrong ones it is readable and wrong.
  const market = useResource(
    (signal) => getMarket(symbol, signal),
    () => 1,
    'We could not read this order’s market, so amounts are shown unformatted.',
    [symbol],
  )
  const events = useResource(
    (signal) => getOrderEvents(order.id, signal),
    (data) => data.events.length,
    'We could not read this order’s history.',
    [order.id],
  )
  const fills = useResource(
    (signal) => listFills({ ...(symbol === '' ? {} : { market: symbol }), limit: 200 }, signal),
    (data) => data.fills.filter((fill) => fill.orderId === order.id).length,
    'We could not read this order’s fills.',
    [order.id, symbol],
  )

  const cancel = useMutation(cancelOrder, 'The order could not be cancelled.')
  const venue: Market | null = market.data?.market ?? null
  const scales = venue ? scalesOf([venue]) : undefined
  const quote = venue?.quoteDecimals
  const base = venue?.baseDecimals

  return (
    <>
      <header className="tw-page__head">
        <h1 className="tw-page__title">
          {sideWord(order.side)} {orderTypeLabel(order.type)}
          {order.symbol !== null && (
            <>
              {' '}
              on <Link to={`/markets/${encodeURIComponent(order.symbol)}`}>{order.symbol}</Link>
            </>
          )}
        </h1>
        <p className="tw-page__lede">
          <code className="cf-num">{order.id}</code> · <Link to="/orders">All your orders</Link>
        </p>
      </header>

      <dl className="tw-facts">
        <Fact label="State">
          <Explained explanation={explanationFor(ORDER_STATUS_TERMS, order.status)}>
            <StateBadge tone={orderTone(order.status)} />
          </Explained>
        </Fact>
        <Fact label="Price">
          {order.price === null ? (
            <span className="tw-absent">whatever the book offered</span>
          ) : (
            <span className="cf-num">{scaled(order.price, quote)}</span>
          )}
        </Fact>
        <Fact label="Trigger">
          {order.stopPrice === null ? (
            <span className="tw-absent">none — this is not a stop</span>
          ) : (
            <span className="cf-num">{scaled(order.stopPrice, quote)}</span>
          )}
        </Fact>
        <Fact label="Quantity">
          <span className="cf-num">{scaled(order.qty ?? order.quoteQty, base)}</span>
        </Fact>
        <Fact label="Filled">
          <span className="cf-num">{scaled(order.filledQty, base)}</span>
        </Fact>
        <Fact label="Remaining">
          <span className="cf-num">{scaled(order.remaining, base)}</span>
        </Fact>
        <Fact label="Average price">
          {order.averagePrice === null ? (
            <span className="tw-absent">never traded</span>
          ) : (
            <span className="cf-num">{scaled(order.averagePrice, quote)}</span>
          )}
        </Fact>
        <Fact label="Fees paid">
          <span className="cf-num">
            {scaled(order.feeBase, base)}
            {venue ? ` ${venue.baseAsset}` : ''} + {scaled(order.feeQuote, quote)}
            {venue ? ` ${venue.quoteAsset}` : ''}
          </span>
        </Fact>
        <Fact label="Held">
          {order.heldAsset === null ? (
            <span className="tw-absent">nothing — this order is finished</span>
          ) : (
            <span className="cf-num">
              {order.heldAmount} {order.heldAsset}
            </span>
          )}
        </Fact>
        <Fact label="Life">{tifLabel(order.tif)}</Fact>
        <Fact label="If it met your own order">{stpLabel(order.stp)}</Fact>
        <Fact label="Publishes">
          {order.displayQty === null ? (
            <span className="tw-absent">all of it</span>
          ) : (
            <span className="cf-num">{scaled(order.displayQty, base)}</span>
          )}
        </Fact>
        <Fact label="Your reference">
          {order.clientOrderId === null ? (
            <span className="tw-absent">none</span>
          ) : (
            <code className="cf-num">{order.clientOrderId}</code>
          )}
        </Fact>
        <Fact label="Arrival rank">
          <Explain term="sequence">
            <span className="cf-num">{order.sequence}</span>
          </Explain>
        </Fact>
        <Fact label="Placed">{timestamp(order.createdAt)}</Fact>
        <Fact label="Expires">
          {order.expiresAt === null ? (
            <span className="tw-absent">it does not</span>
          ) : (
            timestamp(order.expiresAt)
          )}
        </Fact>
      </dl>

      {order.cancelReason !== null && (
        <Note tone="warn">
          {/* The engine's own reason, verbatim. A paraphrase of why an order died is a second
              account of an event that already has one. */}
          <strong>Why it ended:</strong> {order.cancelReason}
        </Note>
      )}

      {CANCELLABLE.includes(order.status) && (
        <div className="tw-form__actions">
          <button
            type="button"
            className="cf-btn cf-btn--danger"
            disabled={cancel.busy}
            onClick={async () => {
              const done = await cancel.run(order.id)
              if (done) onChanged()
            }}
          >
            {cancel.busy ? 'Cancelling…' : 'Cancel this order'}
          </button>
          <span className="tw-form__hint">
            Cancelling pulls what has not traded. Anything already filled has happened and stays
            happened.
          </span>
        </div>
      )}
      {cancel.error && (
        <p className="tw-error" role="alert">
          {cancel.error.message}
          {cancel.error.requestId && (
            <>
              {' '}
              Quote this to support: <code className="cf-num tw-reqid">{cancel.error.requestId}</code>
            </>
          )}
        </p>
      )}

      <section className="tw-section" aria-labelledby="events-heading">
        <h2 id="events-heading" className="tw-section__title">
          <Explain term="order_events">What happened to it</Explain>
        </h2>
        {events.state === 'loading' && <Loading label="Reading the history" />}
        {events.state === 'forbidden' && <Forbidden notice={events.error ?? undefined} />}
        {events.error && events.state !== 'forbidden' && (
          <Failed
            notice={events.error}
            onRetry={events.reload}
            title="The history did not load"
          />
        )}
        {events.state === 'empty' && (
          <Empty
            title="This order has no history yet"
            hint="Every order gets an acceptance line the moment it is taken. An empty trail means this one has only just arrived."
          />
        )}
        {events.state === 'ok' && events.data && (
          <ol className="tw-timeline">
            {events.data.events.map((event) => (
              <Event key={event.seq} event={event} baseDecimals={base} quoteDecimals={quote} />
            ))}
          </ol>
        )}
      </section>

      <section className="tw-section" aria-labelledby="order-fills-heading">
        <h2 id="order-fills-heading" className="tw-section__title">
          The trades it produced
        </h2>
        <FillsTable fills={onlyThisOrder(fills, order.id)} scales={scales} />
      </section>
    </>
  )
}

/**
 * The fills belonging to this order.
 *
 * `GET /v1/exchange/fills` narrows by market rather than by order (`trade/src/server.ts`), so the
 * filter is here — and it is the same predicate the resource's own `count` uses, which is what
 * keeps the four states honest. A fills read that FAILED still says so; it does not become "this
 * order never traded", which is a different and much more alarming sentence.
 */
function onlyThisOrder(
  fills: Resource<{ fills: readonly OwnFill[] }>,
  orderId: string,
): Resource<{ fills: readonly OwnFill[] }> {
  if (!fills.data) return fills
  return { ...fills, data: { fills: fills.data.fills.filter((fill) => fill.orderId === orderId) } }
}

function Event({
  event,
  baseDecimals,
  quoteDecimals,
}: {
  event: OrderEvent
  baseDecimals: number | undefined
  quoteDecimals: number | undefined
}) {
  return (
    <li className={`tw-timeline__item tw-timeline__item--${event.kind}`}>
      <p className="tw-timeline__head">
        <strong>{orderEventLabel(event.kind)}</strong> <span className="tw-dim">{timestamp(event.at)}</span>
      </p>
      <p className="tw-timeline__body">
        {event.qty !== '0' && (
          <>
            <span className="cf-num">{scaled(event.qty, baseDecimals)}</span>
            {event.price !== null && (
              <>
                {' at '}
                <span className="cf-num">{scaled(event.price, quoteDecimals)}</span>
              </>
            )}
            {'. '}
          </>
        )}
        {event.detail ?? ''}
      </p>
    </li>
  )
}

/** An amount with this market's decimals, or verbatim while they are unknown. Never guessed. */
function scaled(value: string | null, decimals: number | undefined): string {
  if (value === null) return '—'
  return decimals === undefined ? value : units(value, decimals)
}
