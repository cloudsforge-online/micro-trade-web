/**
 * The strategy catalogue. The public front page.
 *
 * `GET /v1/strategies` (`trade/src/server.ts:334`) makes no `authenticate()` call, so this renders
 * for somebody who has not signed in — which is who arrives at a product's front page.
 *
 * ── Every card carries its weakness, at the same weight as its tagline ────────────────────────
 *
 * `weakness` is a required field on every catalogue entry upstream (`trade/src/catalog.ts:52-60`)
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
    'The strategy catalogue could not be loaded.',
  )

  return (
    <section className="tw-page">
      <header className="tw-page__head">
        <h1 className="tw-page__title">Strategies</h1>
        <p className="tw-page__lede">
          Ten rules, each of which this service can actually evaluate. Test one against a series
          you already have before you commit anything to it.
        </p>
      </header>

      {/*
        THE PRODUCT'S CENTRAL CLAIM, ON THE FRONT PAGE RATHER THAN IN A FOOTNOTE.

        `trade/src/server.ts:415-416` defaults a backtest to 10 basis points of fee and 5 of
        slippage — not zero — and paper bots are charged the same (`PAPER_FEE_BPS`,
        `PAPER_SLIPPAGE_BPS`, `trade/src/bots.ts:82-83`). The service explains why at
        `trade/src/bots.ts:73-80`: the frozen version converted at the raw rate with a zero fee, so
        "a paper bot beat the backtest of its own rule every time, which is the single comparison
        this product exists to let somebody make".
      */}
      <p className="tw-claim">
        <strong>Fees and slippage are charged.</strong> A backtest costs{' '}
        <code className="cf-num">10&nbsp;bps</code> in fee and{' '}
        <code className="cf-num">5&nbsp;bps</code> in slippage by default, and paper trading is
        charged exactly the same, because a strategy that only works for free does not work. This
        is not an exchange: there is no order book and nothing here makes a market.
      </p>

      {strategies.state === 'loading' && <Loading label="Loading the catalogue" />}
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
        <span className="tw-card__weakness-label">Where it fails</span> {strategy.weakness}
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
                <span className="tw-params__range">
                  ({spec.min}–{spec.max})
                </span>
                <span className="tw-params__help">{spec.help}</span>
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="tw-params__none">No parameters. It does the one thing it says.</p>
      )}
      <p className="tw-card__action">
        <Link className="cf-btn" to={`/backtests/new?strategy=${encodeURIComponent(strategy.id)}`}>
          Backtest this
        </Link>
      </p>
    </li>
  )
}
