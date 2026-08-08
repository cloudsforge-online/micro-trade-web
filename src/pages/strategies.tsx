/**
 * The strategy catalogue. The public front page.
 *
 * `GET /v1/strategies` (`trade/src/server.ts`) makes no `authenticate()` call, so this renders
 * for somebody who has not signed in — which is who arrives at a product's front page.
 *
 * ── Every card carries its weakness, at the same weight as its tagline ────────────────────────
 *
 * `weakness` is a required field on every catalogue entry upstream (`trade/src/catalog.ts`)
 * and the service's own comment says why in one line: "Stated on every entry, deliberately. A
 * catalogue that only lists upsides is advertising." So it is rendered beside the tagline rather
 * than behind a disclosure, and `test/render.test.ts` asserts that no card can be drawn without it.
 */
import { Link } from 'react-router-dom'
import { Failed, Forbidden, Loading } from '../components/states.tsx'
import { familyName } from '../lib/format.ts'
import { useResource } from '../lib/resource.ts'
import { getStrategies, type Strategy } from '../lib/trade.ts'

export function StrategiesPage() {
  const strategies = useResource(
    (signal) => getStrategies(signal),
    (data) => data.strategies.length,
    'We could not read the list of strategies.',
  )

  return (
    <section className="tw-page">
      <header className="tw-page__head">
        {/*
          Not "Strategies". A heading that names the noun the page is made of tells a first-time
          visitor nothing they did not already know from clicking the link, and this is the front
          page of the product — the one place where the reader has not yet decided to be here.
        */}
        <h1 className="tw-page__title">Test a trading rule before you risk money on it</h1>
        {/*
          NO COUNT OF RULES IN THE LEDE. It said "Ten trading rules", which was true — measured
          2026-08-07, `GET /v1/strategies` returned exactly ten — and pinned by nothing. The fee
          and the slippage on this same page ARE pinned, by `test/render.test.ts`, straight to
          `DEFAULT_FEE_BPS` and `DEFAULT_SLIPPAGE_BPS`; the rule count had no such binding, so it
          was the one figure here that could go quietly wrong when `trade/src/catalog.ts` gained
          or lost an entry.

          It is removed rather than guarded. A test asserting "ten" would pin this page to a
          catalogue that is expected to grow, and would turn adding a strategy upstream into a red
          suite in a repository that does not own it. The cards below already state the quantity,
          and they state it from the response, which is the only version of the number that cannot
          be wrong.
        */}
        <p className="tw-page__lede">
          Every trading rule here is implemented and measured by the same engine. Choose a rule,
          run it across the bars you hold, and read what it did before you put anything behind it.
        </p>
      </header>

      {/*
        THE PRODUCT'S CENTRAL CLAIM, ON THE FRONT PAGE RATHER THAN IN A FOOTNOTE.

        `trade/src/server.ts` defaults a backtest to 10 basis points of fee and 5 of
        slippage — not zero — and paper bots are charged the same (`PAPER_FEE_BPS`,
        `PAPER_SLIPPAGE_BPS`, `trade/src/bots.ts`). The service explains why at
        `trade/src/bots.ts`: the frozen version converted at the raw rate with a zero fee, so
        "a paper bot beat the backtest of its own rule every time, which is the single comparison
        this product exists to let somebody make".
      */}
      <p className="tw-claim">
        <strong>Trading costs are charged, never assumed away.</strong> Both sides of every fill
        pay <code className="cf-num">10&nbsp;bps</code> of fee and give up{' '}
        <code className="cf-num">5&nbsp;bps</code> to slippage unless you change them, and a paper
        bot is billed the identical amounts.
        A strategy that only works for free does not work.
        This is also not an exchange: there is no order book here, and nothing you do sets a price
        for anyone else.
      </p>

      <section>
        <h2 className="tw-section__title">How a rule earns its place</h2>
        <ol className="tw-notes__list">
          <li>
            <strong>Measure it.</strong> A backtest acts on the bar after the one that triggered
            it, fills at that bar’s open, and pays the fee and the slippage going in and coming
            out. You get return set against buying and holding the same asset, the worst
            peak-to-trough fall, how much of the time it held a position, win rate, profit factor,
            CAGR, Sharpe, Sortino and Calmar — with the equity curve drawn, and the same points
            listed underneath so you can copy them out.
          </li>
          <li>
            <strong>Repeat it.</strong> Each run keeps the seed it used and a digest of what it
            produced. Feed in the same bars with the same seed and the digest matches, so a result
            can be checked rather than argued about. Change only the seed and you find out whether
            an edge survives a few basis points of execution noise.
          </li>
          <li>
            <strong>Promote what holds up.</strong> A paper bot runs your rule against bars as
            they close, under the same costs, so its record is directly comparable with the
            backtest it came from. A live bot reserves its allocation at the ledger before it
            trades, and is charged only on gains above its own high-water mark.
          </li>
        </ol>
        <p className="tw-note">
          Bars are loaded into a named series by an operator. This service subscribes to no market
          feed and holds no balances of its own.
        </p>
      </section>

      {strategies.state === 'loading' && <Loading label="Reading the strategy list" />}
      {strategies.state === 'forbidden' && <Forbidden notice={strategies.error ?? undefined} />}
      {strategies.state === 'failed' && strategies.error && (
        <Failed notice={strategies.error} onRetry={strategies.reload} />
      )}

      {strategies.state === 'ok' && strategies.data && (
        <ul className="tw-cards">
          {strategies.data.strategies.map((strategy) => (
            <StrategyCard key={strategy.id} strategy={strategy} />
          ))}
        </ul>
      )}
    </section>
  )
}

function StrategyCard({ strategy }: { strategy: Strategy }) {
  return (
    <li className="tw-card">
      <div className="tw-card__head">
        <h2 className="tw-card__title">{strategy.name}</h2>
        <span className="tw-chip">{familyName(strategy.family)}</span>
      </div>
      <p className="tw-card__tagline">{strategy.tagline}</p>
      {/*
        Same visual weight as the tagline, not a caption under it. The catalogue's own contract is
        that a rule states what it gets wrong.
      */}
      <p className="tw-card__weakness">
        {/*
          The colon is in the text rather than in a `::after`, so a screen reader announces the
          break between the label and the sentence the same way a sighted reader sees it. Without
          it this runs together as "WHERE IT FAILS TAKES THE FULL DRAWDOWN…".
        */}
        <span className="tw-card__weakness-label">Where it fails:</span> {strategy.weakness}
      </p>
      {strategy.params.length > 0 ? (
        <dl className="tw-params">
          {strategy.params.map((spec) => (
            <div className="tw-params__row" key={spec.key}>
              <dt className="tw-params__label">{spec.label}</dt>
              <dd className="tw-params__value">
                <code className="cf-num">
                  {spec.default}
                  {spec.unit ? ` ${spec.unit}` : ''}
                </code>{' '}
                {/*
                  `cf-num` as well as the range class: this span renders two bare digits beside the
                  default above it, which IS a `cf-num`, and the design system's `.cf-num` is where
                  `font-variant-numeric: tabular-nums` lives. Without it the two sit in different
                  figure widths in the same row of the same card. It is the shared class rather
                  than a local `font-variant-numeric` for the same reason everything else here is.
                */}
                <span className="tw-params__range cf-num">
                  ({spec.min}–{spec.max})
                </span>
                <span className="tw-params__help">{spec.help}</span>
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="tw-params__none">Nothing to tune. This rule has one behaviour and holds it.</p>
      )}
      <p className="tw-card__action">
        <Link className="cf-btn" to={`/backtests/new?strategy=${encodeURIComponent(strategy.id)}`}>
          Measure this rule
        </Link>
      </p>
    </li>
  )
}
