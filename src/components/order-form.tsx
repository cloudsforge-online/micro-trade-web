/**
 * THE ORDER TICKET. Every control on it is explained, and every one of them can cost money.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * ── The controls are built from the SERVICE'S vocabularies, not from a copy of the enums ──────
 *
 * `orderTypes`, `timeInForce` and `stpModes` arrive from `GET /v1/capabilities`
 * (`trade/src/server.ts`), which says why in as many words: "The browser builds its controls from
 * this rather than from a copy of the enums, so a deployment that gains a new order type gains the
 * control for it without a second release, and a browser can never offer a choice the engine will
 * refuse."
 *
 * ── The form ADVISES. The engine DECIDES. ─────────────────────────────────────────────────────
 *
 * `validatePlacement` (`trade/src/exchange.ts`) is the authority on every rule below, and this
 * form deliberately does not become a second authority on any of them: the submit button stays
 * enabled while a preflight note is showing, and a refusal is rendered with the service's own
 * sentence and its own code. A browser that pre-empts a rule can only ever pre-empt the version of
 * the rule it was written against, and the failure mode of getting that wrong is the worst one
 * available here — a customer who cannot place a legal order and is given no reason.
 *
 * What the preflight is FOR is the opposite case: an order that will be refused for a reason the
 * customer can fix before spending a round trip, spelled in the market's own units. "Quantity must
 * be a multiple of 0.001" is a better thing to read while typing than after pressing.
 *
 * ── Fields appear and disappear with the order type, and that is not the same as enforcement ──
 *
 * A market order that carries a price is refused (`price_not_allowed`), so the price box is not
 * shown for one. That is the type's own definition rather than a validation rule — a market order
 * has no price in the same sense that a circle has no corners — and a box that is only ever wrong
 * is not information.
 *
 * ── Idempotency ───────────────────────────────────────────────────────────────────────────────
 *
 * `POST /v1/exchange/orders` requires an `Idempotency-Key`. `useIdempotentMutation` mints one on
 * commit, KEEPS it when the outcome is unknown so a retry is a replay rather than a second order,
 * and drops it when the outcome is known so an edited ticket is a new intent
 * (`src/lib/mutation.ts`, `src/lib/idempotency.ts`). Every edit below calls `submit.reset()` for
 * that last reason: a changed quantity under a held key is a **409**, not a replay, and the
 * service is right to say so.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  placeOrder,
  type Market,
  type OrderBookCapabilities,
  type Order,
  type OwnFill,
  type PlacedOrderType,
  type Side,
  type StpMode,
  type TimeInForce,
} from '../lib/exchange.ts'
import {
  ORDER_TYPE_TERMS,
  STP_TERMS,
  TIF_TERMS,
  explanationFor,
  orderTypeLabel,
  stpLabel,
  tifLabel,
  type GlossaryKey,
} from '../lib/glossary.ts'
import { useIdempotentMutation } from '../lib/mutation.ts'
import {
  applyBps,
  bpsPercent,
  formatUnits,
  notionalOf,
  onStep,
  parseUnits,
  toMinor,
  units,
} from '../lib/units.ts'
import { Explain, Explained, Note } from './tooltip.tsx'

/** The wanted member of a served vocabulary, or its first, or the wanted one if it is empty. */
function preferred(available: readonly string[], wanted: string): string {
  if (available.includes(wanted)) return wanted
  return available[0] ?? wanted
}

/** A market order takes the book's price; only these two carry one. `trade/src/exchange.ts`. */
const NEEDS_PRICE: readonly string[] = ['limit', 'stop_limit']
/** A stop needs a trigger, and an order that is not a stop must not have one. */
const IS_STOP: readonly string[] = ['stop_limit', 'stop_market']

export function OrderTicket({
  market,
  book,
  price,
  onPriceChange,
  onPlaced,
}: {
  market: Market
  book: OrderBookCapabilities
  /** Lifted, because pressing a rung of the ladder fills it. */
  price: string
  onPriceChange: (value: string) => void
  onPlaced: () => void
}) {
  const [side, setSide] = useState<Side>('buy')
  // Every default is `preferred(list, wanted)`: the engine's own vocabulary decides what exists,
  // and this only expresses which member is the gentlest starting point. A deployment that dropped
  // `limit` from its order types would get its first type selected rather than a blank control
  // bound to a value the select has no option for.
  const [type, setType] = useState<string>(() => preferred(book.orderTypes, 'limit'))
  const [stopPrice, setStopPrice] = useState('')
  const [sizeInQuote, setSizeInQuote] = useState(false)
  const [qty, setQty] = useState('')
  const [tif, setTif] = useState<string>(() => preferred(book.timeInForce, 'gtc'))
  const [postOnly, setPostOnly] = useState(false)
  const [reserve, setReserve] = useState(false)
  const [displayQty, setDisplayQty] = useState('')
  const [stp, setStp] = useState<string>(() => preferred(book.stpModes, 'cancel_taker'))
  const [clientOrderId, setClientOrderId] = useState('')
  const [expiresAt, setExpiresAt] = useState('')

  const submit = useIdempotentMutation(placeOrder, 'The order could not be placed.')

  // Every edit invalidates the held key: the ticket is a different intent now, and replaying the
  // old key against a changed body is a 409 rather than the order the customer just typed.
  const edited = <T,>(set: (value: T) => void) => {
    return (value: T) => {
      set(value)
      submit.reset()
    }
  }

  const takesPrice = NEEDS_PRICE.includes(type)
  const isStop = IS_STOP.includes(type)
  const canSpend = side === 'buy' && (type === 'market' || type === 'stop_market')
  const spending = canSpend && sizeInQuote
  const isLimit = type === 'limit'

  const preflight = check({
    market,
    type,
    side,
    price: takesPrice ? price : '',
    stopPrice: isStop ? stopPrice : '',
    qty,
    spending,
    postOnly,
    tif,
    reserve: isLimit && reserve,
    displayQty,
    clientOrderId,
    expiresAt,
  })

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const placed = await submit.run({
      symbol: market.symbol,
      side,
      type: type as PlacedOrderType,
      ...(takesPrice ? { price: minorOrRaw(price, market.quoteDecimals) } : {}),
      ...(isStop ? { stopPrice: minorOrRaw(stopPrice, market.quoteDecimals) } : {}),
      ...(spending
        ? { quoteQty: minorOrRaw(qty, market.quoteDecimals) }
        : { qty: minorOrRaw(qty, market.baseDecimals) }),
      tif: tif as TimeInForce,
      ...(postOnly ? { postOnly: true } : {}),
      stp: stp as StpMode,
      ...(isLimit && reserve && displayQty !== ''
        ? { displayQty: minorOrRaw(displayQty, market.baseDecimals) }
        : {}),
      ...(clientOrderId.trim() === '' ? {} : { clientOrderId: clientOrderId.trim() }),
      ...(tif === 'gtd' && expiresAt !== '' ? { expiresAt: new Date(expiresAt).getTime() } : {}),
    })
    if (placed) onPlaced()
  }

  return (
    <form className="tw-ticket" onSubmit={onSubmit}>
      <h2 className="tw-ticket__title">Place an order</h2>

      <fieldset className="tw-fieldset tw-ticket__side">
        <legend className="tw-fieldset__legend">Side</legend>
        <label className="tw-radio tw-radio--buy">
          <input
            type="radio"
            name="side"
            value="buy"
            checked={side === 'buy'}
            onChange={() => edited(setSide)('buy')}
          />
          <span>
            <strong>Buy {market.baseAsset}</strong> — you spend {market.quoteAsset}.
          </span>
        </label>
        <label className="tw-radio tw-radio--sell">
          <input
            type="radio"
            name="side"
            value="sell"
            checked={side === 'sell'}
            onChange={() => {
              edited(setSide)('sell')
              // A spend only sizes a market BUY (`quote_size_not_allowed`). Switching to sell with
              // it left on would compose a ticket the engine refuses for a reason that is nowhere
              // on the screen, because the control that caused it just disappeared.
              setSizeInQuote(false)
            }}
          />
          <span>
            <strong>Sell {market.baseAsset}</strong> — you receive {market.quoteAsset}.
          </span>
        </label>
      </fieldset>

      <label className="tw-field">
        <span className="tw-field__label">
          Order type <TermFor table={ORDER_TYPE_TERMS} value={type} />
        </span>
        <select
          className="cf-input"
          value={type}
          onChange={(e) => {
            edited(setType)(e.target.value)
            setPostOnly(false)
            setReserve(false)
            if (e.target.value !== 'limit' && tif === 'gtd') setTif('gtc')
          }}
        >
          {book.orderTypes.map((value) => (
            <option key={value} value={value}>
              {orderTypeLabel(value)}
            </option>
          ))}
        </select>
        <span className="tw-field__help">
          {type === 'market' || type === 'stop_market'
            ? 'Fills immediately against whatever the book is offering. You choose the size, the book chooses the price.'
            : 'Rests on the book at the price you name, and trades only at that price or better. It may wait, and it may never fill.'}
        </span>
      </label>

      {isStop && (
        <label className="tw-field">
          <span className="tw-field__label">
            <Explain term="stop_price">Trigger price</Explain> ({market.quoteAsset})
          </span>
          <input
            className="cf-input cf-num"
            inputMode="decimal"
            value={stopPrice}
            onChange={(e) => edited(setStopPrice)(e.target.value)}
          />
          <span className="tw-field__help">
            Nothing happens until the market trades through this price. Until then the order is{' '}
            <Explain term="pending_trigger" /> — it is not on the book, and nobody can see it.
          </span>
        </label>
      )}

      {takesPrice && (
        <label className="tw-field">
          <span className="tw-field__label">Limit price ({market.quoteAsset})</span>
          <input
            className="cf-input cf-num"
            inputMode="decimal"
            value={price}
            onChange={(e) => {
              onPriceChange(e.target.value)
              submit.reset()
            }}
          />
          <span className="tw-field__help">
            Per one whole {market.baseAsset}. Must be a multiple of the{' '}
            <Explain term="tick_size">tick size</Explain>,{' '}
            {units(market.tickSize, market.quoteDecimals, { trim: true })}
            {market.band && (
              <>
                , and inside the <Explain term="price_band">allowed range</Explain>{' '}
                {units(market.band.low, market.quoteDecimals)} –{' '}
                {units(market.band.high, market.quoteDecimals)}
              </>
            )}
            .
          </span>
        </label>
      )}

      {canSpend && (
        <fieldset className="tw-fieldset">
          <legend className="tw-fieldset__legend">Size this order by</legend>
          <label className="tw-radio">
            <input
              type="radio"
              name="sizeby"
              checked={!sizeInQuote}
              onChange={() => edited(setSizeInQuote)(false)}
            />
            <span>
              <strong>How much {market.baseAsset} to buy.</strong> The cost depends on what the book
              charges you.
            </span>
          </label>
          <label className="tw-radio">
            <input
              type="radio"
              name="sizeby"
              checked={sizeInQuote}
              onChange={() => edited(setSizeInQuote)(true)}
            />
            <span>
              <strong>How much {market.quoteAsset} to spend.</strong> You fix the money and take
              whatever quantity that buys. A market buy only — every other order is sized in{' '}
              {market.baseAsset}.
            </span>
          </label>
        </fieldset>
      )}

      <label className="tw-field">
        <span className="tw-field__label">
          {spending ? `Amount to spend (${market.quoteAsset})` : `Quantity (${market.baseAsset})`}
        </span>
        <input
          className="cf-input cf-num"
          inputMode="decimal"
          required
          value={qty}
          onChange={(e) => edited(setQty)(e.target.value)}
        />
        <span className="tw-field__help">
          {spending ? (
            <>
              Whole {market.quoteAsset} and fractions of it. This is the most you can spend, before
              fees.
            </>
          ) : (
            <>
              Must be a multiple of the <Explain term="lot_size">lot size</Explain>,{' '}
              {units(market.lotSize, market.baseDecimals, { trim: true })} {market.baseAsset}.
            </>
          )}
        </span>
      </label>

      <details className="tw-ticket__advanced">
        <summary>How long it lives, and how it behaves</summary>

        <label className="tw-field">
          <span className="tw-field__label">
            <Explain term="time_in_force" /> <TermFor table={TIF_TERMS} value={tif} />
          </span>
          <select className="cf-input" value={tif} onChange={(e) => edited(setTif)(e.target.value)}>
            {book.timeInForce.map((value) => (
              <option key={value} value={value}>
                {tifLabel(value)}
              </option>
            ))}
          </select>
          <span className="tw-field__help">
            What should happen to the part that cannot fill straight away: wait, cancel, or refuse
            to trade at all unless the whole thing goes through.
          </span>
        </label>

        {tif === 'gtd' && (
          <label className="tw-field">
            <span className="tw-field__label">
              <Explain term="expires_at">Expires at</Explain>
            </span>
            <input
              className="cf-input"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => edited(setExpiresAt)(e.target.value)}
            />
            <span className="tw-field__help">
              Your own clock, sent as an instant. The engine expires the order when it next looks at
              this market, so an order can outlive its expiry by moments — it will not trade after
              it.
            </span>
          </label>
        )}

        {isLimit && (
          <label className="tw-check">
            <input
              type="checkbox"
              checked={postOnly}
              onChange={(e) => edited(setPostOnly)(e.target.checked)}
            />
            <span>
              <strong>
                <Explain term="post_only" />
              </strong>{' '}
              {/*
                Not "this guarantees you the maker fee", however true it is of this one checkbox:
                the estate rule in `.github/workflows/ci.yml` bans the word from a screen outright,
                because a customer who has read it once about a fee reads it again about a return.
                "Only way to be sure" says the same thing and promises nothing.
              */}
              Refuse the order outright rather than let it trade immediately. It is the only way to
              be sure you pay the <Explain term="maker">maker</Explain> fee (
              {bpsPercent(market.makerFeeBps)}) instead of the{' '}
              <Explain term="taker">taker</Explain> fee ({bpsPercent(market.takerFeeBps)}).
            </span>
          </label>
        )}

        {isLimit && (
          <label className="tw-check">
            <input
              type="checkbox"
              checked={reserve}
              onChange={(e) => edited(setReserve)(e.target.checked)}
            />
            <span>
              <strong>
                <Explain term="reserve_order">Show only part of it</Explain>
              </strong>{' '}
              Publish a smaller size to the book and keep the rest back. The whole quantity is still
              held and still trades; the book simply does not advertise it.
            </span>
          </label>
        )}

        {isLimit && reserve && (
          <label className="tw-field">
            <span className="tw-field__label">
              <Explain term="published_size">Published size</Explain> ({market.baseAsset})
            </span>
            <input
              className="cf-input cf-num"
              inputMode="decimal"
              value={displayQty}
              onChange={(e) => edited(setDisplayQty)(e.target.value)}
            />
            <span className="tw-field__help">
              Between one lot and the full quantity, and a multiple of the lot size. It does not buy
              you priority: your order keeps the arrival time it had.
            </span>
          </label>
        )}

        <label className="tw-field">
          <span className="tw-field__label">
            <Explain term="self_trade_prevention" /> <TermFor table={STP_TERMS} value={stp} />
          </span>
          <select className="cf-input" value={stp} onChange={(e) => edited(setStp)(e.target.value)}>
            {book.stpModes.map((value) => (
              <option key={value} value={value}>
                {stpLabel(value)}
              </option>
            ))}
          </select>
          <span className="tw-field__help">
            What to do if this order would trade against one of your own. Trading with yourself
            costs you both fees and prints a trade that means nothing, so the engine always stops it
            — this chooses which side gives way.
          </span>
        </label>

        <label className="tw-field">
          <span className="tw-field__label">
            <Explain term="client_order_id">Your own reference</Explain>
          </span>
          <input
            className="cf-input"
            maxLength={64}
            value={clientOrderId}
            onChange={(e) => edited(setClientOrderId)(e.target.value)}
          />
          <span className="tw-field__help">
            Optional, up to 64 characters. It comes back on the order and on every fill, so your own
            records can find it again. It is not an{' '}
            <Explain term="idempotency_key">idempotency key</Explain> and it does not stop a
            duplicate.
          </span>
        </label>
      </details>

      <Cost
        market={market}
        side={side}
        price={takesPrice ? price : ''}
        qty={qty}
        spending={spending}
        postOnly={postOnly}
      />

      {preflight.length > 0 && (
        <ul className="tw-preflight" role="status">
          {preflight.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}

      {market.status !== 'active' && (
        <Note tone="warn">
          This market is not trading normally right now. Whatever you send will be judged against
          that state, and the engine will say so if it refuses.
        </Note>
      )}

      {submit.error && (
        <p className="tw-error" role="alert">
          {submit.error.message}
          {submit.error.requestId && (
            <>
              {' '}
              Quote this to support: <code className="cf-num tw-reqid">{submit.error.requestId}</code>
            </>
          )}
        </p>
      )}

      {submit.result && <Receipt order={submit.result.order} fills={submit.result.fills} market={market} />}

      <div className="tw-form__actions">
        {/*
          Enabled while a preflight note is showing, on purpose. The note is advice; `validatePlacement`
          is the authority, and a browser that refuses to send an order the engine would have accepted
          is a browser standing between a customer and their own money.
        */}
        <button
          className={`cf-btn cf-btn--primary tw-ticket__go tw-ticket__go--${side}`}
          type="submit"
          disabled={submit.busy}
        >
          {submit.busy
            ? 'Sending…'
            : `${side === 'buy' ? 'Buy' : 'Sell'} ${market.baseAsset}`}
        </button>
        <span className="tw-form__hint">
          This sends a real order to a real book. It can fill the instant it arrives.
        </span>
      </div>
    </form>
  )
}

/**
 * The tooltip for whichever member of a vocabulary is currently selected.
 *
 * Generic over the vocabulary's own key union rather than taking `Record<string, GlossaryKey>`,
 * because the tables are `Record<PlacedOrderType, …>` and friends — narrow on purpose, so that a
 * new member of a vocabulary fails typecheck until its explanation exists (`src/lib/glossary.ts`).
 */
function TermFor<K extends string>({
  table,
  value,
}: {
  table: Record<K, GlossaryKey>
  value: string
}) {
  const explanation = explanationFor(table, value)
  if (explanation === null) return null
  return <Explained explanation={explanation}>{explanation.term}</Explained>
}

/**
 * What this order is worth, and what it will cost in fees.
 *
 * ── Both fee rates are shown, because which one applies is not known yet ──────────────────────
 *
 * A fee is charged in the asset the side RECEIVES (`trade/src/matching.ts`): a buyer receives
 * base and pays in base, a seller receives quote and pays in quote. Whether it is the maker rate or
 * the taker rate depends on whether the order rests or crosses, which nobody can know before it is
 * sent — except for a post-only order, which cannot cross by definition. So both are shown, and
 * `applyBps` here is the arithmetic `trade/src/money.ts` uses, restated rather than approximated,
 * so the number shown before the commit and the number charged after it are the same computation.
 */
function Cost({
  market,
  side,
  price,
  qty,
  spending,
  postOnly,
}: {
  market: Market
  side: Side
  price: string
  qty: string
  spending: boolean
  postOnly: boolean
}) {
  if (spending) {
    const spend = parseUnits(qty, market.quoteDecimals)
    if (spend === null) return null
    return (
      <dl className="tw-cost">
        <div className="tw-fact">
          <dt className="tw-fact__label">You spend at most</dt>
          <dd className="tw-fact__value cf-num">
            {formatUnits(spend, market.quoteDecimals)} {market.quoteAsset}
          </dd>
        </div>
        <div className="tw-fact">
          <dt className="tw-fact__label">
            <Explain term="fee_asset">Fee taken in</Explain>
          </dt>
          <dd className="tw-fact__value">
            {market.baseAsset} — a buyer pays out of what they receive.
          </dd>
        </div>
      </dl>
    )
  }

  const quantity = parseUnits(qty, market.baseDecimals)
  const limit = parseUnits(price, market.quoteDecimals)
  if (quantity === null) return null
  if (limit === null) {
    return (
      <p className="tw-cost tw-cost--unknown">
        A market order has no price until it trades, so what it will cost cannot be shown here. The
        fills on the receipt are the answer, and they are exact.
      </p>
    )
  }

  const notional = notionalOf(quantity, limit, market.baseDecimals)
  if (notional === null) {
    // Impossible on a well-formed market — `markets_notional_exact` holds it in the database — and
    // the only honest answer on a malformed one. See `notionalOf` in `src/lib/units.ts`.
    return (
      <p className="tw-cost tw-cost--unknown">
        This quantity and price do not divide exactly into the quote asset, so no cost is shown
        rather than a rounded one.
      </p>
    )
  }

  // Charged in what the side receives: base for a buyer, quote for a seller.
  const receives = side === 'buy' ? quantity : notional
  const feeDecimals = side === 'buy' ? market.baseDecimals : market.quoteDecimals
  const feeAsset = side === 'buy' ? market.baseAsset : market.quoteAsset

  return (
    <dl className="tw-cost">
      <div className="tw-fact">
        <dt className="tw-fact__label">
          <Explain term="notional">Order value</Explain>
        </dt>
        <dd className="tw-fact__value cf-num">
          {formatUnits(notional, market.quoteDecimals)} {market.quoteAsset}
        </dd>
      </div>
      <div className="tw-fact">
        <dt className="tw-fact__label">
          <Explain term="maker_taker_fee">Fee</Explain>
        </dt>
        <dd className="tw-fact__value cf-num">
          {postOnly ? (
            <>
              {formatUnits(applyBps(receives, market.makerFeeBps), feeDecimals)} {feeAsset}{' '}
              <span className="tw-dim">
                (maker, {bpsPercent(market.makerFeeBps)} — post-only cannot take)
              </span>
            </>
          ) : (
            <>
              {formatUnits(applyBps(receives, market.makerFeeBps), feeDecimals)} –{' '}
              {formatUnits(applyBps(receives, market.takerFeeBps), feeDecimals)} {feeAsset}{' '}
              <span className="tw-dim">
                (maker {bpsPercent(market.makerFeeBps)} if it rests, taker{' '}
                {bpsPercent(market.takerFeeBps)} if it trades on arrival)
              </span>
            </>
          )}
        </dd>
      </div>
      <div className="tw-fact">
        <dt className="tw-fact__label">
          <Explain term="escrow">Held while it waits</Explain>
        </dt>
        <dd className="tw-fact__value cf-num">
          {side === 'buy'
            ? `${formatUnits(notional, market.quoteDecimals)} ${market.quoteAsset}`
            : `${formatUnits(quantity, market.baseDecimals)} ${market.baseAsset}`}
        </dd>
      </div>
    </dl>
  )
}

/** What actually happened, immediately, rather than a toast that disappears. */
function Receipt({
  order,
  fills,
  market,
}: {
  order: Order
  fills: readonly OwnFill[]
  market: Market
}) {
  return (
    <div className="tw-receipt" role="status">
      <p className="tw-receipt__lead">
        <strong>{receiptWord(order.status)}</strong> Your order is{' '}
        <Link to={`/orders/${order.id}`}>{order.id.slice(0, 8)}</Link>, and its whole history is on
        that page.
      </p>
      {fills.length === 0 ? (
        <p className="tw-receipt__body">
          {order.status === 'open'
            ? 'Nothing has traded yet. It is on the book, waiting.'
            : 'Nothing traded.'}
        </p>
      ) : (
        <p className="tw-receipt__body">
          {fills.length} fill(s), {units(order.filledQty, market.baseDecimals, { trim: true })}{' '}
          {market.baseAsset} in total
          {order.averagePrice !== null && (
            <>
              , at an <Explain term="average_price">average</Explain> of{' '}
              {units(order.averagePrice, market.quoteDecimals)} {market.quoteAsset}
            </>
          )}
          .
        </p>
      )}
    </div>
  )
}

function receiptWord(status: string): string {
  if (status === 'filled') return 'Filled.'
  if (status === 'open') return 'On the book.'
  if (status === 'pending_trigger') return 'Waiting for its trigger.'
  if (status === 'cancelled') return 'Cancelled.'
  if (status === 'expired') return 'Expired.'
  if (status === 'rejected') return 'Rejected.'
  return 'Sent.'
}

/**
 * What somebody typed, as minor units — or their text unchanged if it is not a number.
 *
 * The fall-through is deliberate: `parseUnits` returns null for excess precision as well as for
 * nonsense, and sending the raw text lets the SERVICE say which it was, in its own words, rather
 * than this form guessing. The preflight below has already told the customer what is wrong with it.
 */
function minorOrRaw(value: string, decimals: number): string {
  const minor = parseUnits(value, decimals)
  return minor === null ? value.trim() : minor.toString()
}

/**
 * The preflight: the refusals a customer can fix before pressing, in this market's own units.
 *
 * Every rule here is a restatement of one in `validatePlacement` (`trade/src/exchange.ts`), and
 * none of them blocks the submit. Anything not restated here is still refused by the engine and
 * still rendered verbatim — this list is the subset that is worth knowing about while typing.
 */
function check(input: {
  market: Market
  type: string
  side: Side
  price: string
  stopPrice: string
  qty: string
  spending: boolean
  postOnly: boolean
  tif: string
  reserve: boolean
  displayQty: string
  clientOrderId: string
  expiresAt: string
}): string[] {
  const { market } = input
  const issues: string[] = []

  const lot = toMinor(market.lotSize)
  const tick = toMinor(market.tickSize)
  const minNotional = toMinor(market.minNotional)

  const quantity = input.spending
    ? null
    : input.qty.trim() === ''
      ? null
      : parseUnits(input.qty, market.baseDecimals)
  if (!input.spending && input.qty.trim() !== '' && quantity === null) {
    issues.push(
      `A quantity in ${market.baseAsset} has at most ${market.baseDecimals} decimal places, and this market cannot express more.`,
    )
  }
  if (quantity !== null && lot !== null && !onStep(quantity, lot)) {
    issues.push(
      `Quantity must be a multiple of the lot size, ${units(market.lotSize, market.baseDecimals, { trim: true })} ${market.baseAsset}.`,
    )
  }
  if (quantity !== null && quantity <= 0n) issues.push('Quantity must be greater than zero.')

  const limit = input.price.trim() === '' ? null : parseUnits(input.price, market.quoteDecimals)
  if (input.price.trim() !== '' && limit === null) {
    issues.push(
      `A price in ${market.quoteAsset} has at most ${market.quoteDecimals} decimal places.`,
    )
  }
  if (limit !== null && tick !== null && !onStep(limit, tick)) {
    issues.push(
      `Price must be a multiple of the tick size, ${units(market.tickSize, market.quoteDecimals, { trim: true })} ${market.quoteAsset}.`,
    )
  }
  if (limit !== null && market.band !== null) {
    const low = toMinor(market.band.low)
    const high = toMinor(market.band.high)
    if (low !== null && high !== null && (limit < low || limit > high)) {
      issues.push(
        `Price is outside the allowed range, ${units(market.band.low, market.quoteDecimals)} – ${units(market.band.high, market.quoteDecimals)} ${market.quoteAsset}. The engine refuses prices further than ${bpsPercent(market.bandBps)} from the last trade, which is what stops a mistyped order from clearing the book.`,
      )
    }
  }

  const stop = input.stopPrice.trim() === '' ? null : parseUnits(input.stopPrice, market.quoteDecimals)
  if (stop !== null && tick !== null && !onStep(stop, tick)) {
    issues.push(
      `The trigger price must be a multiple of the tick size, ${units(market.tickSize, market.quoteDecimals, { trim: true })} ${market.quoteAsset}.`,
    )
  }

  if (quantity !== null && limit !== null && minNotional !== null) {
    const notional = notionalOf(quantity, limit, market.baseDecimals)
    if (notional !== null && notional < minNotional) {
      issues.push(
        `This order is worth ${formatUnits(notional, market.quoteDecimals)} ${market.quoteAsset}, below this market's smallest order of ${units(market.minNotional, market.quoteDecimals)} ${market.quoteAsset}.`,
      )
    }
  }

  if (input.postOnly && (input.tif === 'ioc' || input.tif === 'fok')) {
    issues.push(
      'Post-only means the order rests on the book, so it cannot also be immediate-or-cancel or fill-or-kill. Choose one.',
    )
  }
  if (input.tif === 'gtd' && input.expiresAt === '') {
    issues.push('A good-til-time order needs an expiry.')
  }

  if (input.reserve) {
    const shown = input.displayQty.trim() === '' ? null : parseUnits(input.displayQty, market.baseDecimals)
    if (shown === null) {
      issues.push('A published size is needed, or turn showing only part of it back off.')
    } else if (quantity !== null && (shown <= 0n || shown > quantity)) {
      issues.push('The published size must be between one lot and the full quantity.')
    } else if (lot !== null && !onStep(shown, lot)) {
      issues.push('The published size must be a multiple of the lot size.')
    }
  }

  if (input.clientOrderId.length > 64) {
    issues.push('Your own reference can be at most 64 characters.')
  }

  return issues
}
