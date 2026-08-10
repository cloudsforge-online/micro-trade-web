/**
 * THE TRADING TERMINAL: one market, everything about it, and the ticket that acts on it.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * ── Why this is one screen and not six ────────────────────────────────────────────────────────
 *
 * `GET /v1/exchange/markets/:symbol` serves the rules, the band, the top of the book and the day in
 * ONE response, and `trade/src/server.ts` gives the reason: "a client that has to make four calls
 * to draw one screen will make them in four different moments and draw a market that never
 * existed". The same judgement applies one level up. A customer deciding what to send needs the
 * book, the tape, their own working orders and their own balance in front of them at once —
 * splitting them across screens does not remove the inconsistency, it just hides it.
 *
 * The four surfaces that DO need their own call — depth, the tape, candles, the caller's own orders
 * and fills — are separate resources with separate states, so one of them failing costs the reader
 * that panel and not the page. A depth read that times out must not take the ticket down.
 *
 * ── Refreshing ────────────────────────────────────────────────────────────────────────────────
 *
 * Polled, not streamed, on a five-second timer the reader can switch off (`useAutoRefresh`,
 * `src/lib/orderbook.tsx`, which also carries the Rule 8 reasoning). There is no websocket on this
 * service to subscribe to, and inventing a one-second poll to imitate one would spend the
 * customer's own rate-limit quota (`RATE_RULES['market.read']`, `trade/src/ratelimit.ts`) to
 * redraw a book no human reads that fast.
 *
 * ── Every figure on this page is a real trade or a real order ─────────────────────────────────
 *
 * Nothing here is simulated, so nothing here carries `MODELLED`. That label belongs to the
 * backtester, and putting it on a live book would devalue it where it matters.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CandleChart } from '../components/candles.tsx'
import { DepthLadder } from '../components/ladder.tsx'
import { OrderTicket } from '../components/order-form.tsx'
import { Empty, Failed, Forbidden, Loading } from '../components/states.tsx'
import { Fact, StateBadge } from '../components/tone.tsx'
import { Explain, Note } from '../components/tooltip.tsx'
import { changeBps, changeTone, marketStatusTone, timestamp } from '../lib/format.ts'
import {
  getCandles,
  getDepth,
  getMarket,
  getTrades,
  listFills,
  listOrders,
  type Market,
  type OrderBookCapabilities,
  type PublicTrade,
} from '../lib/exchange.ts'
import { OrderBookGate, REFRESH_MS, useAutoRefresh, useOrderBook } from '../lib/orderbook.tsx'
import { useResource } from '../lib/resource.ts'
import { units } from '../lib/units.ts'
import { FillsTable, OpenOrders, scalesOf } from '../components/order-tables.tsx'

/** Deep enough to see the shape of a book, shallow enough to read. The route's own default. */
const DEPTH_LEVELS = 25
const TAPE_LENGTH = 30
const CANDLE_COUNT = 120

export function MarketPage() {
  const params = useParams<{ symbol: string }>()
  const symbol = params.symbol ?? ''
  const gate = useOrderBook()

  return (
    <section className="tw-page tw-page--terminal">
      <OrderBookGate state={gate}>{(book) => <Terminal symbol={symbol} book={book} />}</OrderBookGate>
    </section>
  )
}

function Terminal({ symbol, book }: { symbol: string; book: OrderBookCapabilities }) {
  const [live, setLive] = useState(true)
  // Not called `setInterval`. The global of that name is a timer, this is a chart bucket, and one
  // of the two is forbidden to do domain work in this estate — a reader skimming for Rule 8
  // violations should not have to read the type to tell them apart.
  const [interval, chooseInterval] = useState(() => book.candleIntervals[0] ?? '1m')
  const [price, setPrice] = useState('')

  const overview = useResource(
    (signal) => getMarket(symbol, signal),
    () => 1,
    'We could not read this market.',
    [symbol],
  )
  const depth = useResource(
    (signal) => getDepth(symbol, DEPTH_LEVELS, signal),
    () => 1,
    'We could not read the order book.',
    [symbol],
  )
  const tape = useResource(
    (signal) => getTrades(symbol, TAPE_LENGTH, signal),
    (data) => data.trades.length,
    'We could not read the recent trades.',
    [symbol],
  )
  const candles = useResource(
    (signal) => getCandles(symbol, interval, CANDLE_COUNT, signal),
    () => 1,
    'We could not read the price history.',
    [symbol, interval],
  )
  const mine = useResource(
    (signal) => listOrders({ market: symbol, open: true, limit: 100 }, signal),
    (data) => data.orders.length,
    'We could not read your working orders.',
    [symbol],
  )
  const fills = useResource(
    (signal) => listFills({ market: symbol, limit: 50 }, signal),
    (data) => data.fills.length,
    'We could not read your fills.',
    [symbol],
  )

  // One function, so the timer holds one reference and the toggle has one thing to switch off.
  // Named for what it re-reads rather than for the timer, because the timer is the mechanism and
  // this is the intent.
  const reloadAll = useCallback(() => {
    overview.reload()
    depth.reload()
    tape.reload()
    candles.reload()
    mine.reload()
    fills.reload()
  }, [overview.reload, depth.reload, tape.reload, candles.reload, mine.reload, fills.reload])

  useAutoRefresh(reloadAll, REFRESH_MS, live)

  /*
   * ── A REFRESH MUST NEVER UNMOUNT THE TERMINAL ────────────────────────────────────────────────
   *
   * Every gate below is conditioned on there being NO DATA YET, not on the resource being in the
   * loading state, and the difference is the whole usability of this page. `useResource` sets
   * loading on every reload, including the ones this page fires itself: the five-second poll, and
   * `reloadAll` after an order is placed. Returning a spinner for those unmounts `OrderTicket` —
   * which is a state component — so React discards its state on the way out: the price and quantity
   * somebody was halfway through typing, the order type they had chosen, and the receipt for the
   * order they had just placed, all replaced by an empty ticket every five seconds.
   *
   * It was found by a scenario that placed an order and looked for its receipt (`test/terminal.test.ts`,
   * "renders what the engine did with it"): the POST went out, the engine answered, and the screen
   * showed a blank form.
   *
   * A refresh that FAILS is reported in place instead — the stale figures stay on screen with a
   * notice above them, because a book that is five seconds old is worth more to somebody holding an
   * open order than an error page with nothing on it.
   */
  if (overview.data === null) {
    if (overview.state === 'forbidden') return <Forbidden notice={overview.error ?? undefined} />
    if (overview.error) {
      return (
        <Failed
          notice={overview.error}
          onRetry={overview.reload}
          title={`We could not read ${symbol}`}
        />
      )
    }
    return <Loading label={`Reading ${symbol}`} />
  }

  const { market, bbo, ticker } = overview.data
  const stale = overview.error

  return (
    <>
      <header className="tw-page__head tw-terminal__head">
        <div>
          <h1 className="tw-page__title">{market.symbol}</h1>
          <p className="tw-page__lede">
            {market.baseAsset} priced in {market.quoteAsset}.{' '}
            <Link to="/markets">Every market</Link> · <Link to="/balances">Your balances</Link>
          </p>
        </div>
        <StateBadge tone={marketStatusTone(market.status)} />
        <label className="tw-check tw-terminal__live">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
          <span>
            Keep this up to date, every {REFRESH_MS / 1000} seconds. Turn it off on a metered
            connection, or to leave more of your{' '}
            <Explain term="rate_limit">request allowance</Explain> for placing orders; nothing else
            changes.
          </span>
        </label>
      </header>

      {stale && (
        // Said in the customer's terms rather than the transport's: what is on screen is a moment
        // old, and the two things they might act on it with are named.
        <Note tone="warn">
          The last refresh failed — {stale.message} Everything below is as it was a moment ago.
          Placing and cancelling still work.{' '}
          <button type="button" className="cf-btn cf-btn--quiet" onClick={reloadAll}>
            Try again now
          </button>
        </Note>
      )}

      <dl className="tw-ticker">
        <Fact label="Last">
          {ticker.last === null ? (
            <span className="tw-absent">never traded</span>
          ) : (
            <span className="cf-num">{units(ticker.last, market.quoteDecimals)}</span>
          )}
        </Fact>
        <Fact label="24h change">
          <span className={`cf-num tw-change tw-change--${changeTone(ticker.changeBps)}`}>
            {changeBps(ticker.changeBps)}
          </span>
        </Fact>
        <Fact label="24h high / low">
          {ticker.high === null || ticker.low === null ? (
            <span className="tw-absent">nothing traded</span>
          ) : (
            <span className="cf-num">
              {units(ticker.high, market.quoteDecimals)} / {units(ticker.low, market.quoteDecimals)}
            </span>
          )}
        </Fact>
        <Fact label="Best bid / ask">
          <span className="cf-num">
            {bbo.bid === null ? '—' : units(bbo.bid, market.quoteDecimals)} /{' '}
            {bbo.ask === null ? '—' : units(bbo.ask, market.quoteDecimals)}
          </span>
        </Fact>
        <Fact label="24h volume">
          <span className="cf-num">
            {units(ticker.baseVolume, market.baseDecimals, { trim: true })} {market.baseAsset}
          </span>
        </Fact>
        <Fact label="24h turnover">
          <span className="cf-num">
            {units(ticker.quoteVolume, market.quoteDecimals)} {market.quoteAsset}
          </span>
        </Fact>
        <Fact label="24h trades">
          <span className="cf-num">{ticker.trades}</span>
        </Fact>
        <Fact label="Last traded">{timestamp(market.lastTradedAt)}</Fact>
      </dl>
      <p className="tw-ticker__legend">
        <Explain term="last_price" /> · <Explain term="change_24h" /> ·{' '}
        <Explain term="high_low_24h" /> · <Explain term="bid" /> · <Explain term="ask" /> ·{' '}
        <Explain term="base_volume" /> · <Explain term="quote_volume" /> ·{' '}
        <Explain term="trade_count" />
      </p>

      <div className="tw-terminal">
        <section className="tw-terminal__book" aria-labelledby="book-heading">
          <h2 id="book-heading" className="tw-section__title">
            The book
          </h2>
          {/*
            `data === null` and not `state === 'loading'`, here and in the two panels below, for the
            reason the gate above the header gives at length: every five-second refresh puts each
            resource back into the loading state, and a spinner that appears over a book somebody is
            reading — twelve times a minute, for as long as the page is open — is a page that cannot
            be read. A spinner belongs to the FIRST read only; after that there is something to show.
          */}
          {depth.state === 'loading' && depth.data === null && <Loading label="Reading the book" />}
          {depth.state === 'forbidden' && <Forbidden notice={depth.error ?? undefined} />}
          {depth.error && depth.state !== 'forbidden' && (
            <Failed notice={depth.error} onRetry={depth.reload} title="The book did not load" />
          )}
          {depth.data && (
            <DepthLadder depth={depth.data.depth} market={market} onPickPrice={setPrice} />
          )}
        </section>

        <section className="tw-terminal__ticket" aria-labelledby="ticket-heading">
          <h2 id="ticket-heading" className="tw-sr">
            Order ticket
          </h2>
          <OrderTicket
            market={market}
            book={book}
            price={price}
            onPriceChange={setPrice}
            onPlaced={reloadAll}
          />
        </section>

        <section className="tw-terminal__tape" aria-labelledby="tape-heading">
          <h2 id="tape-heading" className="tw-section__title">
            <Explain term="tape" />
          </h2>
          {tape.state === 'loading' && tape.data === null && <Loading label="Reading the tape" />}
          {tape.state === 'forbidden' && <Forbidden notice={tape.error ?? undefined} />}
          {tape.error && tape.state !== 'forbidden' && (
            <Failed notice={tape.error} onRetry={tape.reload} title="The tape did not load" />
          )}
          {tape.state === 'empty' && (
            <Empty
              title="Nothing has traded here yet"
              hint="The tape starts at the first trade. An empty tape on a market with a book is a market where nobody has crossed the spread."
            />
          )}
          {tape.state === 'ok' && tape.data && <Tape market={market} trades={tape.data.trades} />}
        </section>
      </div>

      <section className="tw-section" aria-labelledby="chart-heading">
        <div className="tw-section__head">
          <h2 id="chart-heading" className="tw-section__title">
            Price history
          </h2>
          <label className="tw-field tw-field--inline">
            <span className="tw-field__label">
              <Explain term="candle_interval" />
            </span>
            <select
              className="cf-input"
              value={interval}
              onChange={(e) => chooseInterval(e.target.value)}
            >
              {book.candleIntervals.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
        {candles.state === 'loading' && candles.data === null && (
          <Loading label="Reading the price history" />
        )}
        {candles.state === 'forbidden' && <Forbidden notice={candles.error ?? undefined} />}
        {candles.error && candles.state !== 'forbidden' && (
          <Failed
            notice={candles.error}
            onRetry={candles.reload}
            title="The price history did not load"
          />
        )}
        {candles.data && (
          <CandleChart
            candles={candles.data.candles}
            interval={candles.data.interval}
            quoteDecimals={market.quoteDecimals}
            quoteAsset={market.quoteAsset}
          />
        )}
      </section>

      <section className="tw-section" aria-labelledby="working-heading">
        <h2 id="working-heading" className="tw-section__title">
          Your working orders on {market.symbol}
        </h2>
        <OpenOrders
          orders={mine}
          symbol={market.symbol}
          scales={scalesOf([market])}
          onChanged={reloadAll}
        />
      </section>

      <section className="tw-section" aria-labelledby="fills-heading">
        <h2 id="fills-heading" className="tw-section__title">
          Your fills on {market.symbol}
        </h2>
        <FillsTable fills={fills} scales={scalesOf([market])} />
      </section>
    </>
  )
}

/**
 * The tape.
 *
 * The side shown is the AGGRESSOR's — whoever crossed the spread to make the trade happen — which
 * is what makes a list of prices readable as pressure. It is not a counterparty: the public trade
 * view carries none, deliberately (`trade/src/server.ts`).
 */
function Tape({ market, trades }: { market: Market; trades: readonly PublicTrade[] }) {
  return (
    <table className="tw-table tw-table--tape">
      <caption className="tw-table__caption">
        Newest first. The side is whoever crossed the spread.
      </caption>
      <thead>
        <tr>
          <th scope="col">Price</th>
          <th scope="col">Size</th>
          <th scope="col">Side</th>
          <th scope="col">When</th>
        </tr>
      </thead>
      <tbody>
        {trades.map((trade) => (
          <tr key={trade.id} className={`tw-tape__row tw-tape__row--${trade.takerSide}`}>
            <th scope="row" className="cf-num">
              {units(trade.price, market.quoteDecimals)}
            </th>
            <td className="cf-num">{units(trade.qty, market.baseDecimals, { trim: true })}</td>
            <td>{trade.takerSide === 'buy' ? 'Bought' : 'Sold'}</td>
            <td>{timestamp(trade.at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
