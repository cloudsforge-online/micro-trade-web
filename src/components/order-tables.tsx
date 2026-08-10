/**
 * The caller's own orders and the caller's own fills, as tables — with the cancel buttons.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * These live in `components/` rather than in a page because the terminal and the orders screen show
 * the SAME thing narrowed differently — one market versus all of them — and two copies of a table
 * that renders money is two chances to render it differently.
 *
 * ── A second cancel is a 409, and this shows it ───────────────────────────────────────────────
 *
 * `DELETE /v1/exchange/orders/:id` takes no `Idempotency-Key`: the order id in the path IS the key
 * (`trade/src/server.ts`). A cancel of an order that is already terminal answers **409** naming
 * the state it is in, and that refusal is rendered rather than swallowed — the service's own
 * reasoning is that "answering 200 to a cancel that cancelled nothing is how somebody comes to
 * believe they are flat when they are not". It is a fact about the order, so it is shown ON the row.
 *
 * ── Cancel-all takes a key even though it is naturally repeatable ─────────────────────────────
 *
 * `POST /v1/exchange/orders/cancel-all` does, and `trade/src/server.ts` explains the exception: a
 * retried mass cancel that already ran "would answer with an empty list, and 'we cancelled nothing'
 * is the wrong answer to give somebody who just hit the panic button and lost their connection". The
 * claim replays the first attempt's list, so what is shown here is what was really pulled.
 *
 * ── Money ─────────────────────────────────────────────────────────────────────────────────────
 *
 * Every amount is minor units on the wire and is formatted through `src/lib/units.ts` with THAT
 * MARKET'S decimals — looked up per row, because an orders list spans markets and neither an order
 * nor a fill carries its own decimals. Where the scale is not known the amount is printed VERBATIM
 * rather than scaled by a guess: a quantity shown with the wrong number of decimal places is worse
 * than an unformatted integer, because it looks right.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { Link } from 'react-router-dom'
import {
  cancelAllOrders,
  cancelOrder,
  type Market,
  type Order,
  type OwnFill,
} from '../lib/exchange.ts'
import { ORDER_STATUS_TERMS, explanationFor, orderTypeLabel, tifLabel } from '../lib/glossary.ts'
import { orderTone, roleWord, sideWord, timestamp } from '../lib/format.ts'
import { useIdempotentMutation, useMutation } from '../lib/mutation.ts'
import type { Resource } from '../lib/resource.ts'
import { units } from '../lib/units.ts'
import { Empty, Failed, Forbidden, Loading } from './states.tsx'
import { StateBadge } from './tone.tsx'
import { Explain, Explained } from './tooltip.tsx'

/**
 * The decimals a market uses, when the caller has the market. Absent means print verbatim.
 *
 * `byAsset` exists for the fee column alone: a fee is denominated in the asset its side RECEIVED,
 * so a row can be in base or in quote and the table has to know both. Under
 * `noUncheckedIndexedAccess` a miss is `undefined`, which is exactly the "print it verbatim" case.
 */
export interface Scale {
  readonly baseDecimals: number
  readonly quoteDecimals: number
  readonly byAsset: Readonly<Record<string, number>>
}

/**
 * Every market's scale, indexed by the id an order and a fill both carry.
 *
 * An orders list spans markets, and an amount rendered with another market's decimals is wrong in
 * the way that looks right — `12345678` shown as `123,456.78` on a market that counts satoshis. So
 * the lookup is by `marketId` rather than by symbol: `OwnFill` carries no symbol at all
 * (`fillView`, `trade/src/server.ts`), and an order's symbol is nullable.
 */
export interface Scales {
  readonly byMarketId: Readonly<Record<string, Scale>>
}

export function scalesOf(markets: readonly Market[]): Scales {
  const byMarketId: Record<string, Scale> = {}
  for (const market of markets) {
    byMarketId[market.id] = {
      baseDecimals: market.baseDecimals,
      quoteDecimals: market.quoteDecimals,
      byAsset: {
        [market.baseAsset]: market.baseDecimals,
        [market.quoteAsset]: market.quoteDecimals,
      },
    }
  }
  return { byMarketId }
}

/** An amount with the right decimals, or verbatim when this screen does not know them. */
function amount(value: string | null, decimals: number | undefined, missing: string) {
  if (value === null) return <span className="tw-absent">{missing}</span>
  if (decimals === undefined) return <span className="cf-num">{value}</span>
  return <span className="cf-num">{units(value, decimals)}</span>
}

/**
 * The working orders, with a cancel on every row and a panic button over the lot.
 *
 * `orders` is the resource rather than the array, so the four states are rendered here once instead
 * of at each call site — an open-orders panel that shows "you have none" for a timeout is exactly
 * the failure `src/lib/resource.ts` exists to prevent, and it is worse here than anywhere: the
 * customer concludes they are flat.
 */
export function OpenOrders({
  orders,
  symbol,
  scales,
  onChanged,
}: {
  orders: Resource<{ orders: readonly Order[] }>
  /** Present on the terminal — the market cancel-all is scoped to. Absent means every market. */
  symbol?: string | undefined
  scales?: Scales | undefined
  onChanged: () => void
}) {
  const cancelAll = useIdempotentMutation(cancelAllOrders, 'The orders could not be cancelled.')

  // The FIRST read only. `state` goes back to loading on every reload — the terminal's five-second
  // poll, and every cancel that re-reads this list — and swapping a table somebody is reading for a
  // spinner twelve times a minute is the defect `src/pages/market.tsx` records at length.
  if (orders.state === 'loading' && orders.data === null) {
    return <Loading label="Reading your working orders" />
  }
  if (orders.state === 'forbidden') return <Forbidden notice={orders.error ?? undefined} />
  if (orders.error) {
    return (
      <Failed
        notice={orders.error}
        onRetry={orders.reload}
        title="We could not read your working orders"
      />
    )
  }
  // From the DATA rather than from `state`, for the same reason: mid-reload the state is 'loading'
  // again, and a list that is genuinely empty would flash its table header instead of its sentence.
  if ((orders.data?.orders.length ?? 0) === 0) {
    return (
      <Empty
        title="You have nothing working here"
        hint="An order appears on this list from the moment it is accepted until it fills, expires or is cancelled. A stop that has not triggered yet is on it too — it is held, but it is not on the book."
      />
    )
  }

  const rows = orders.data?.orders ?? []

  return (
    <>
      <div className="tw-scroll">
        <table className="tw-table tw-table--orders">
          <caption className="tw-table__caption">
            Everything of yours that is still live. <Explain term="remaining" /> is what has not
            traded yet; <Explain term="escrow">held</Explain> is what of yours is tied up in it.
          </caption>
          <thead>
            <tr>
              <th scope="col">Order</th>
              <th scope="col">Side</th>
              <th scope="col">Type</th>
              <th scope="col">Price</th>
              <th scope="col">Quantity</th>
              <th scope="col">
                <Explain term="filled_qty">Filled</Explain>
              </th>
              <th scope="col">
                <Explain term="remaining" />
              </th>
              <th scope="col">Held</th>
              <th scope="col">State</th>
              <th scope="col">Placed</th>
              <th scope="col">
                <span className="tw-sr">Cancel</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                scale={scales?.byMarketId[order.marketId]}
                onChanged={onChanged}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="tw-form__actions">
        <button
          type="button"
          className="cf-btn cf-btn--danger"
          disabled={cancelAll.busy}
          onClick={async () => {
            const done = await cancelAll.run(symbol)
            if (done) onChanged()
          }}
        >
          {cancelAll.busy
            ? 'Cancelling…'
            : symbol
              ? `Cancel everything on ${symbol}`
              : 'Cancel every working order'}
        </button>
        <span className="tw-form__hint">
          <Explain term="cancel_all" /> It pulls what is on the book. It does not close a position
          you already hold, and it does not undo a trade that has happened.
        </span>
      </div>

      {cancelAll.error && (
        <p className="tw-error" role="alert">
          {cancelAll.error.message}
          {cancelAll.error.requestId && (
            <>
              {' '}
              Quote this to support:{' '}
              <code className="cf-num tw-reqid">{cancelAll.error.requestId}</code>
            </>
          )}
        </p>
      )}
      {cancelAll.result && (
        <p className="tw-note" role="status">
          {cancelAll.result.cancelled.length === 0
            ? 'There was nothing left to cancel.'
            : `${cancelAll.result.cancelled.length} order(s) pulled.`}
        </p>
      )}
    </>
  )
}

function OrderRow({
  order,
  scale,
  onChanged,
}: {
  order: Order
  scale?: Scale | undefined
  onChanged: () => void
}) {
  const cancel = useMutation(cancelOrder, 'The order could not be cancelled.')
  const status = explanationFor(ORDER_STATUS_TERMS, order.status)

  return (
    <>
      <tr>
        <th scope="row">
          <Link to={`/orders/${order.id}`}>{order.id.slice(0, 8)}</Link>
          {order.symbol && <span className="tw-dim"> {order.symbol}</span>}
        </th>
        <td className={`tw-side tw-side--${order.side}`}>{sideWord(order.side)}</td>
        <td>{orderTypeLabel(order.type)}</td>
        <td>{amount(order.price, scale?.quoteDecimals, 'at the book')}</td>
        <td>{amount(order.qty ?? order.quoteQty, scale?.baseDecimals, '—')}</td>
        <td>{amount(order.filledQty, scale?.baseDecimals, '—')}</td>
        <td>{amount(order.remaining, scale?.baseDecimals, '—')}</td>
        <td>
          {order.heldAsset === null ? (
            <span className="tw-absent">nothing</span>
          ) : (
            <>
              {amount(order.heldAmount, undefined, '—')} <span className="tw-dim">{order.heldAsset}</span>
            </>
          )}
        </td>
        <td>
          <Explained explanation={status}>
            <StateBadge tone={orderTone(order.status)} />
          </Explained>
        </td>
        <td>{timestamp(order.createdAt)}</td>
        <td>
          <button
            type="button"
            className="cf-btn cf-btn--quiet"
            disabled={cancel.busy}
            onClick={async () => {
              const done = await cancel.run(order.id)
              if (done) onChanged()
            }}
          >
            {cancel.busy ? 'Cancelling…' : 'Cancel'}
            <span className="tw-sr"> order {order.id.slice(0, 8)}</span>
          </button>
        </td>
      </tr>
      {cancel.error && (
        <tr>
          {/*
            On the row, not in a corner. A 409 here is a FACT ABOUT THIS ORDER — it is already
            filled, or already cancelled — and it belongs beside the order it is about.
          */}
          <td colSpan={11}>
            <p className="tw-error" role="alert">
              {cancel.error.message}
              {cancel.error.requestId && (
                <>
                  {' '}
                  Quote this to support:{' '}
                  <code className="cf-num tw-reqid">{cancel.error.requestId}</code>
                </>
              )}
            </p>
          </td>
        </tr>
      )}
    </>
  )
}

/**
 * Every order, live or finished, newest first.
 *
 * No cancel column: a history is read, and the working set has its own table with the buttons on
 * it. A cancel button on a filled order from last Tuesday is a button that can only ever 409.
 */
export function OrdersTable({
  orders,
  scales,
}: {
  orders: Resource<{ orders: readonly Order[] }>
  scales?: Scales | undefined
}) {
  // The FIRST read only. `state` goes back to loading on every reload — the terminal's five-second
  // poll, and every cancel that re-reads this list — and swapping a table somebody is reading for a
  // spinner twelve times a minute is the defect `src/pages/market.tsx` records at length.
  if (orders.state === 'loading' && orders.data === null) {
    return <Loading label="Reading your orders" />
  }
  if (orders.state === 'forbidden') return <Forbidden notice={orders.error ?? undefined} />
  if (orders.error) {
    return <Failed notice={orders.error} onRetry={orders.reload} title="We could not read your orders" />
  }
  if ((orders.data?.orders.length ?? 0) === 0) {
    return (
      <Empty
        title="You have not placed an order yet"
        hint="Orders appear here the moment they are accepted, and they stay after they finish — this is the history, not the working set."
      />
    )
  }

  return (
    <div className="tw-scroll">
      <table className="tw-table tw-table--orders">
        <caption className="tw-table__caption">
          Newest first. <Explain term="average_price" /> is computed from the totals, not averaged
          across fills, so a set of differently-sized fills gives the right answer.
        </caption>
        <thead>
          <tr>
            <th scope="col">Order</th>
            <th scope="col">Market</th>
            <th scope="col">Side</th>
            <th scope="col">Type</th>
            <th scope="col">
              <Explain term="time_in_force">Life</Explain>
            </th>
            <th scope="col">Price</th>
            <th scope="col">
              <Explain term="filled_qty">Filled</Explain>
            </th>
            <th scope="col">
              <Explain term="average_price">Average</Explain>
            </th>
            <th scope="col">State</th>
            <th scope="col">Placed</th>
          </tr>
        </thead>
        <tbody>
          {(orders.data?.orders ?? []).map((order) => {
            const scale = scales?.byMarketId[order.marketId]
            return (
            <tr key={order.id}>
              <th scope="row">
                <Link to={`/orders/${order.id}`}>{order.id.slice(0, 8)}</Link>
              </th>
              <td>
                {order.symbol === null ? (
                  <span className="tw-absent">—</span>
                ) : (
                  <Link to={`/markets/${encodeURIComponent(order.symbol)}`}>{order.symbol}</Link>
                )}
              </td>
              <td className={`tw-side tw-side--${order.side}`}>{sideWord(order.side)}</td>
              <td>{orderTypeLabel(order.type)}</td>
              <td>{tifLabel(order.tif)}</td>
              <td>{amount(order.price, scale?.quoteDecimals, 'at the book')}</td>
              <td>{amount(order.filledQty, scale?.baseDecimals, '—')}</td>
              <td>{amount(order.averagePrice, scale?.quoteDecimals, 'never traded')}</td>
              <td>
                <Explained explanation={explanationFor(ORDER_STATUS_TERMS, order.status)}>
                  <StateBadge tone={orderTone(order.status)} />
                </Explained>
              </td>
              <td>{timestamp(order.createdAt)}</td>
            </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The caller's own fills.
 *
 * The fee column carries its own asset on every row, because the fee is charged in the asset the
 * side RECEIVES (`trade/src/matching.ts`): a buyer receives base and pays in base, a seller
 * receives quote and pays in quote. A column headed "Fee (USD)" would be wrong on half the rows,
 * and would be wrong in the direction that flatters us.
 */
export function FillsTable({
  fills,
  scales,
}: {
  fills: Resource<{ fills: readonly OwnFill[] }>
  scales?: Scales | undefined
}) {
  // The FIRST read only. `state` goes back to loading on every reload — the terminal's five-second
  // poll, and every cancel that re-reads this list — and swapping a table somebody is reading for a
  // spinner twelve times a minute is the defect `src/pages/market.tsx` records at length.
  if (fills.state === 'loading' && fills.data === null) return <Loading label="Reading your fills" />
  if (fills.state === 'forbidden') return <Forbidden notice={fills.error ?? undefined} />
  if (fills.error) {
    return <Failed notice={fills.error} onRetry={fills.reload} title="We could not read your fills" />
  }
  if ((fills.data?.fills.length ?? 0) === 0) {
    return (
      <Empty
        title="Nothing of yours has traded yet"
        hint="A fill is written when your order actually trades. An order sitting on the book has none, and that is not the same as an order that did nothing."
      />
    )
  }

  return (
    <div className="tw-scroll">
      <table className="tw-table tw-table--fills">
        <caption className="tw-table__caption">
          Every trade of yours, newest first. <Explain term="maker" /> means your order was already
          resting; <Explain term="taker" /> means it crossed the spread to trade — which is what the
          two fee rates are for.
        </caption>
        <thead>
          <tr>
            <th scope="col">Trade</th>
            <th scope="col">Order</th>
            <th scope="col">Side</th>
            <th scope="col">Role</th>
            <th scope="col">Price</th>
            <th scope="col">Size</th>
            <th scope="col">Value</th>
            <th scope="col">
              <Explain term="fee_asset">Fee</Explain>
            </th>
            <th scope="col">When</th>
          </tr>
        </thead>
        <tbody>
          {(fills.data?.fills ?? []).map((fill) => {
            const scale = scales?.byMarketId[fill.marketId]
            return (
            <tr key={fill.tradeId}>
              <th scope="row" className="cf-num">
                {fill.tradeId.slice(0, 8)}
              </th>
              <td>
                <Link to={`/orders/${fill.orderId}`}>{fill.orderId.slice(0, 8)}</Link>
              </td>
              <td className={`tw-side tw-side--${fill.side}`}>{sideWord(fill.side)}</td>
              <td>{roleWord(fill.role)}</td>
              <td>{amount(fill.price, scale?.quoteDecimals, '—')}</td>
              <td>{amount(fill.qty, scale?.baseDecimals, '—')}</td>
              <td>{amount(fill.quoteQty, scale?.quoteDecimals, '—')}</td>
              <td className="cf-num">
                {amount(fill.fee, scale?.byAsset[fill.feeAsset], '—')}{' '}
                <span className="tw-dim">{fill.feeAsset}</span>
              </td>
              <td>{timestamp(fill.at)}</td>
            </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
