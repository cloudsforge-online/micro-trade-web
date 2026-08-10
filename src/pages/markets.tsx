/**
 * Every market this exchange runs, and the rules each one trades under.
 *
 * `listMarkets` — the route and its reasoning are in `src/lib/exchange.ts`.
 *
 * ── Why the rules are on the LIST and not hidden on the trading screen ────────────────────────
 *
 * A market is not just a pair of assets: it is a lot size, a tick size, a minimum order value, two
 * fee rates and a price band, and every one of those can refuse an order. They are the reason a
 * perfectly sensible-looking order comes back rejected, and a customer who has never seen them
 * cannot form a guess as to why. So they are columns here, each with the sentence that explains it,
 * rather than a panel somebody has to go looking for.
 *
 * Nothing on this page is a price prediction and nothing is modelled — these are the live rules of
 * a live venue. The `MODELLED` label belongs to the backtester and deliberately does not appear.
 */
import { Link } from 'react-router-dom'
import { Empty, Failed, Forbidden, Loading } from '../components/states.tsx'
import { StateBadge } from '../components/tone.tsx'
import { Explain, Note } from '../components/tooltip.tsx'
import type { Market } from '../lib/exchange.ts'
import { listMarkets } from '../lib/exchange.ts'
import { bpsPercent, units } from '../lib/units.ts'
import { marketStatusTone } from '../lib/format.ts'
import { OrderBookGate, useOrderBook } from '../lib/orderbook.tsx'
import { useResource } from '../lib/resource.ts'

export function MarketsPage() {
  const gate = useOrderBook()

  return (
    <section className="tw-page">
      <header className="tw-page__head">
        <h1 className="tw-page__title">Markets</h1>
      </header>
      <OrderBookGate state={gate}>{() => <MarketList />}</OrderBookGate>
    </section>
  )
}

function MarketList() {
  const markets = useResource(
    (signal) => listMarkets(signal),
    (data) => data.markets.length,
    'We could not read the markets.',
  )

  return (
    <>
      <Note>
        You are trading against other people, not against us. Every order you place goes on to a
        public <Explain term="order_book" /> and is matched by{' '}
        <Explain term="price_time_priority" />: the best price first, and among equal prices whoever
        arrived first.
      </Note>

      {markets.state === 'loading' && <Loading label="Reading the markets" />}
      {markets.state === 'forbidden' && <Forbidden notice={markets.error ?? undefined} />}
      {markets.state === 'failed' && markets.error && (
        <Failed notice={markets.error} onRetry={markets.reload} />
      )}
      {markets.state === 'empty' && (
        <Empty
          title="This exchange runs no markets yet"
          hint="The order book is switched on, but nobody has created a market to trade on it. There is nothing to place an order against until one exists."
        />
      )}

      {markets.state === 'ok' && markets.data && (
        <div className="tw-scroll">
          <table className="tw-table tw-table--markets">
            <caption className="tw-table__caption">
              The live rules of each market. Every amount is in{' '}
              <Explain term="minor_units">minor units</Explain> and is exact. A market pairs a{' '}
              <Explain term="base_asset">base asset</Explain>, which is what you buy and sell, with a{' '}
              <Explain term="quote_asset">quote asset</Explain>, which is what you price it in. Fees
              are shown here as percentages; the engine states them in{' '}
              <Explain term="fee_bps">basis points</Explain>, and the allowed range is measured
              around a <Explain term="reference_price">reference price</Explain>.
            </caption>
            <thead>
              <tr>
                <th scope="col">Market</th>
                <th scope="col">State</th>
                <th scope="col">
                  <Explain term="last_price" />
                </th>
                <th scope="col">
                  <Explain term="price_band">Allowed range</Explain>
                </th>
                <th scope="col">
                  <Explain term="maker_taker_fee">Fees</Explain>
                </th>
                <th scope="col">
                  <Explain term="lot_size">Quantity step</Explain>
                </th>
                <th scope="col">
                  <Explain term="tick_size">Price step</Explain>
                </th>
                <th scope="col">
                  <Explain term="min_notional">Smallest order</Explain>
                </th>
              </tr>
            </thead>
            <tbody>
              {markets.data.markets.map((market) => (
                <MarketRow key={market.id} market={market} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function MarketRow({ market }: { market: Market }) {
  return (
    <tr>
      <th scope="row">
        <Link className="tw-market__link" to={`/markets/${encodeURIComponent(market.symbol)}`}>
          {market.symbol}
        </Link>
        <span className="tw-dim">
          {' '}
          {market.baseAsset} priced in {market.quoteAsset}
        </span>
      </th>
      <td>
        <StateBadge tone={marketStatusTone(market.status)} />
      </td>
      <td className="cf-num">
        {/*
          `lastPrice` is null on a market that has never traded, and that is a real answer rather
          than a zero: there is no price, because nobody has agreed one yet. Rendering 0.00 would
          claim the asset is worthless.
        */}
        {market.lastPrice === null ? (
          <span className="tw-absent">never traded</span>
        ) : (
          units(market.lastPrice, market.quoteDecimals)
        )}
      </td>
      <td className="cf-num">
        {market.band === null ? (
          <span className="tw-absent">no reference yet</span>
        ) : (
          <>
            {units(market.band.low, market.quoteDecimals)} –{' '}
            {units(market.band.high, market.quoteDecimals)}
            <span className="tw-dim"> (±{bpsPercent(market.bandBps)})</span>
          </>
        )}
      </td>
      <td className="cf-num">
        {bpsPercent(market.makerFeeBps)} / {bpsPercent(market.takerFeeBps)}
      </td>
      <td className="cf-num">
        {units(market.lotSize, market.baseDecimals, { trim: true })} {market.baseAsset}
      </td>
      <td className="cf-num">
        {units(market.tickSize, market.quoteDecimals, { trim: true })} {market.quoteAsset}
      </td>
      <td className="cf-num">
        {units(market.minNotional, market.quoteDecimals)} {market.quoteAsset}
      </td>
    </tr>
  )
}
