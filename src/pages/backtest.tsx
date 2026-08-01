/**
 * One backtest: the status page a 202 points at, and the report once it completes.
 *
 * `GET /v1/backtests/:id` — `trade/src/server.ts:427`. A malformed id is a 400 and another
 * customer's id is a **404**, the same answer as "no such run", so ids cannot be enumerated.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS PAGE MAY NOT DO, AND WHY EACH ONE IS WRITTEN DOWN
 *
 * **1. It may not imply a return is expected.** Every figure here is the output of a simulation
 * over bars that have already happened. The block carries `MODELLED` at the top, before the first
 * number, and `test/render.test.ts` requires it.
 *
 * **2. It may not draw an equity curve.** The run computes one and stores it, in the `equity`
 * column (`trade/src/backtests.ts:228`, declared at `trade/src/migrations.ts:208`) — and no route
 * serves it. `COLUMNS` at `trade/src/backtests.ts:77-78` selects sixteen columns and neither
 * `equity` nor `trades` is among them. A curve interpolated from `startEquity` and `endEquity`
 * would be a picture of two numbers pretending to be a hundred. So the page says the curve is not
 * served, and the gap is reported to micro-trade rather than papered over.
 *
 * **3. It may not print a profit factor of 0.00× for a run that never lost.** Zero is the
 * SENTINEL for "gross loss was zero", because JSON cannot carry Infinity — the service says so at
 * the `profitFactorBps` line and adds that "a reader tells the two cases apart with `losses`"
 * (`trade/src/performance.ts:200-204`). `profitFactor()` in src/lib/format.ts is that reading.
 *
 * **4. It may not hide the notes.** `normaliseParams` clamps a parameter and RETURNS the
 * adjustment rather than applying it silently (`trade/src/catalog.ts:195-226`), and the runner
 * adds "this configuration produced no trades at all" and "the newest 20000 bars were used"
 * (`trade/src/backtests.ts:208-215`). Each changes what the numbers mean, so they render above
 * them.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { Link, useParams } from 'react-router-dom'
import { Failed, Forbidden, Loading } from '../components/states.tsx'
import { Fact, ModelledNote, StateBadge } from '../components/tone.tsx'
import {
  MODELLED_LONG,
  backtestTone,
  barTime,
  percent,
  profitFactor,
  ratio,
  rate,
  shards,
  signedShards,
} from '../lib/format.ts'
import { useResource } from '../lib/resource.ts'
import { getBacktest, getBacktestResult, type Backtest, type BacktestMetrics } from '../lib/trade.ts'
import { EquityCurve } from '../components/equity.tsx'

export function BacktestPage() {
  const { id = '' } = useParams()
  const run = useResource(
    (signal) => getBacktest(id, signal),
    () => 1,
    'That backtest could not be loaded.',
    [id],
  )

  // Fetched separately because the service serves it separately, and for the same reason: an
  // equity curve is decimated to hundreds of points and a fill list is unbounded, so the summary
  // must not carry them. A 409 here means the run has not finished — a state, not an error.
  const result = useResource(
    (signal) => getBacktestResult(id, signal),
    () => 1,
    'The equity curve could not be loaded.',
    [id],
  )

  if (run.state === 'loading') return <Loading label="Loading the run" />
  if (run.state === 'forbidden') return <Forbidden notice={run.error ?? undefined} />
  if (run.error) return <Failed notice={run.error} onRetry={run.reload} />
  if (!run.data) return <Loading label="Loading the run" />

  const backtest = run.data.backtest
  const tone = backtestTone(backtest.status)

  return (
    <section className="tw-page">
      <header className="tw-page__head">
        <h1 className="tw-page__title">
          {backtest.strategyId} <span className="cf-num tw-page__id">{backtest.id}</span>
        </h1>
        <StateBadge tone={tone} />
      </header>
      <p className="tw-page__lede">{tone.meaning}</p>

      <dl className="tw-facts">
        <Fact label="Series">
          <span className="cf-num">{backtest.seriesId}</span>
        </Fact>
        <Fact label="Starting cash">
          <span className="cf-num">{shards(backtest.startCash)} Shards</span>
        </Fact>
        <Fact label="Fee charged">
          <span className="cf-num">{backtest.feeBps} bps</span>
        </Fact>
        <Fact label="Slippage charged">
          <span className="cf-num">{backtest.slippageBps} bps</span>
        </Fact>
        <Fact label="Seed">
          <span className="cf-num">{backtest.seed}</span>
        </Fact>
        <Fact label="Parameters">
          <span className="cf-num">
            {Object.entries(backtest.params)
              .map(([k, v]) => `${k}=${v}`)
              .join('  ') || 'none'}
          </span>
        </Fact>
        <Fact label="Bars read">
          {backtest.fromT === null ? (
            <span className="tw-absent">not yet — the run has not read a bar</span>
          ) : (
            <span className="cf-num">
              {barTime(backtest.fromT)} → {barTime(backtest.toT)}
            </span>
          )}
        </Fact>
        <Fact label="Result digest">
          {backtest.resultDigest === null ? (
            <span className="tw-absent">not yet</span>
          ) : (
            <span className="cf-num" title={backtest.resultDigest}>
              {backtest.resultDigest.slice(0, 16)}…
            </span>
          )}
        </Fact>
      </dl>

      {backtest.status === 'complete' && (
        <>
          <h2 className="tw-section__title">Equity</h2>
          {result.state === 'loading' ? (
            <p className="tw-note">Loading the curve…</p>
          ) : result.data ? (
            <EquityCurve points={result.data.equity} />
          ) : (
            // The summary loaded and the curve did not. Say which, rather than showing an empty
            // chart that reads as "this run did nothing".
            <p className="tw-note" role="status">
              {result.error?.message ?? 'The curve is not available for this run.'}
            </p>
          )}
        </>
      )}

      {backtest.notes.length > 0 && <Notes notes={backtest.notes} />}

      {backtest.status === 'failed' && (
        <p className="tw-error" role="alert">
          <strong>This run did not finish.</strong>{' '}
          {backtest.error ?? 'The service recorded no reason, which is itself worth reporting.'}
        </p>
      )}

      {(backtest.status === 'queued' || backtest.status === 'running') && (
        <div className="tw-pending" role="status">
          <p>
            <strong>Nothing has been computed yet.</strong> The run was accepted and queued; a
            worker picks it up under a lease keyed on this run, so a deploy in the middle of it
            costs a restart rather than the result.
          </p>
          <button type="button" className="cf-btn" onClick={run.reload}>
            Check again
          </button>
        </div>
      )}

      {backtest.status === 'complete' && backtest.metrics && (
        <Report metrics={backtest.metrics} backtest={backtest} />
      )}

      <p className="tw-page__back">
        <Link to="/backtests">← All backtests</Link>
      </p>
    </section>
  )
}

function Notes({ notes }: { notes: readonly string[] }) {
  return (
    <div className="tw-notes" role="note">
      <h2 className="tw-notes__title">What was changed about this run</h2>
      <ul className="tw-notes__list">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  )
}

function Report({ metrics, backtest }: { metrics: BacktestMetrics; backtest: Backtest }) {
  return (
    <div className="tw-report">
      <h2 className="tw-report__title">Result</h2>

      {/* The label before the first figure, never after the last one. */}
      <ModelledNote>{MODELLED_LONG}</ModelledNote>

      <div className="tw-metrics">
        <Metric
          label="Total return"
          value={percent(metrics.totalReturnBps)}
          note={`Against buy-and-hold's ${percent(metrics.holdReturnBps)} over the same bars.`}
        />
        <Metric
          label="Max drawdown"
          value={percent(metrics.maxDrawdownBps)}
          note="Largest peak-to-trough fall, as a proportion of the peak. The answer to “how bad did it get”."
        />
        <Metric
          label="Fees paid"
          value={`${shards(metrics.feesPaidShards)} Shards`}
          note={`At ${backtest.feeBps} bps a fill, plus ${backtest.slippageBps} bps of slippage on the price.`}
        />
        <Metric
          label="Trades"
          value={String(metrics.trades)}
          note={`${metrics.wins} won, ${metrics.losses} lost, ${percent(metrics.winRateBps)} of closed trades won.`}
        />
        <Metric
          label="Profit factor"
          value={profitFactor(metrics)}
          note="Gross profit over gross loss. Break-even is 1.00×."
        />
        <Metric
          label="Exposure"
          value={percent(metrics.exposureBps)}
          note="Share of bars spent holding a position. A rule that is rarely in the market carries a different risk from one that always is."
        />
        <Metric
          label="Best trade"
          value={`${signedShards(metrics.bestTradeShards)} Shards`}
          note="Realised, on a close."
        />
        <Metric
          label="Worst trade"
          value={`${signedShards(metrics.worstTradeShards)} Shards`}
          note="Realised, on a close."
        />
      </div>

      <h3 className="tw-report__subtitle">Statistics about the distribution</h3>
      <p className="tw-report__note">
        These four are ratios, not amounts. They are annualised from the bar interval so a figure
        computed on five-minute bars is comparable with one computed on daily bars — a comparison
        that is only ever approximate, because high-frequency returns are far from normal.
      </p>
      <div className="tw-metrics">
        <Metric label="CAGR" value={rate(metrics.cagr)} note="Compound annual growth, modelled." />
        <Metric label="Sharpe" value={ratio(metrics.sharpe)} note="Return over total volatility." />
        <Metric
          label="Sortino"
          value={ratio(metrics.sortino)}
          note="Return over downside volatility only, against a zero target."
        />
        <Metric
          label="Calmar"
          value={ratio(metrics.calmar)}
          note="CAGR over max drawdown."
        />
      </div>

      <h3 className="tw-report__subtitle">The equity curve is not served</h3>
      <p className="tw-report__note">
        This run computed a decimated equity curve and the full fill list, and stored both. Neither
        is selected by any route on <code className="cf-num">trade</code>, so there is nothing here
        to draw from and this page does not draw one: a curve interpolated between the start and
        end equity would be a picture of two numbers pretending to be a hundred. Reported to
        micro-trade.
      </p>
      <dl className="tw-facts">
        <Fact label="Start equity">
          <span className="cf-num">{shards(metrics.startEquity)} Shards</span>
        </Fact>
        <Fact label="End equity">
          <span className="cf-num">{shards(metrics.endEquity)} Shards</span>
        </Fact>
      </dl>
    </div>
  )
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="tw-metric">
      <span className="tw-metric__label">{label}</span>
      <span className="tw-metric__value cf-num">{value}</span>
      <span className="tw-metric__note">{note}</span>
    </div>
  )
}
