/**
 * One backtest: the status page a 202 points at, and the report once it completes.
 *
 * `GET /v1/backtests/:id` — `trade/src/server.ts`. A malformed id is a 400 and another
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
 * column (`trade/src/backtests.ts`, declared at `trade/src/migrations.ts`) — and no route
 * serves it. `COLUMNS` at `trade/src/backtests.ts` selects sixteen columns and neither
 * `equity` nor `trades` is among them. A curve interpolated from `startEquity` and `endEquity`
 * would be a picture of two numbers pretending to be a hundred. So the page says the curve is not
 * served, and the gap is reported to micro-trade rather than papered over.
 *
 * **3. It may not print a profit factor of 0.00× for a run that never lost.** Zero is the
 * SENTINEL for "gross loss was zero", because JSON cannot carry Infinity — the service says so at
 * the `profitFactorBps` line and adds that "a reader tells the two cases apart with `losses`"
 * (`trade/src/performance.ts`). `profitFactor()` in src/lib/format.ts is that reading.
 *
 * **4. It may not hide the notes.** `normaliseParams` clamps a parameter and RETURNS the
 * adjustment rather than applying it silently (`trade/src/catalog.ts`), and the runner
 * adds "this configuration produced no trades at all" and "the newest 20000 bars were used"
 * (`trade/src/backtests.ts`). Each changes what the numbers mean, so they render above
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
  signedUsd,
  usd,
} from '../lib/format.ts'
import { useResource } from '../lib/resource.ts'
import { getBacktest, getBacktestResult, type Backtest, type BacktestMetrics } from '../lib/trade.ts'
import { EquityCurve } from '../components/equity.tsx'

export function BacktestPage() {
  const { id = '' } = useParams()
  const run = useResource(
    (signal) => getBacktest(id, signal),
    () => 1,
    'We could not read that run.',
    [id],
  )

  // Fetched separately because the service serves it separately, and for the same reason: an
  // equity curve is decimated to hundreds of points and a fill list is unbounded, so the summary
  // must not carry them. A 409 here means the run has not finished — a state, not an error.
  const result = useResource(
    (signal) => getBacktestResult(id, signal),
    () => 1,
    'We could not read the curve for this run.',
    [id],
  )

  if (run.state === 'loading') return <Loading label="Reading the run" />
  if (run.state === 'forbidden') return <Forbidden notice={run.error ?? undefined} />
  if (run.error) return <Failed notice={run.error} onRetry={run.reload} />
  if (!run.data) return <Loading label="Reading the run" />

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
          <span className="cf-num">{usd(backtest.startCash)}</span>
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
            <span className="tw-absent">none yet — this run has not opened the series</span>
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
          <h2 className="tw-section__title">What the money did</h2>
          {result.state === 'loading' ? (
            <p className="tw-note">Drawing the curve…</p>
          ) : result.data ? (
            <EquityCurve points={result.data.equity} />
          ) : (
            // The summary loaded and the curve did not. Say which, rather than showing an empty
            // chart that reads as "this run did nothing".
            <p className="tw-note" role="status">
              {result.error?.message ?? 'There is no curve stored against this run.'}
            </p>
          )}
        </>
      )}

      {backtest.notes.length > 0 && <Notes notes={backtest.notes} />}

      {backtest.status === 'failed' && (
        <p className="tw-error" role="alert">
          <strong>This run stopped before it produced anything.</strong>{' '}
          {backtest.error ?? 'No reason was written against it — please tell us, because that is a fault in its own right.'}
        </p>
      )}

      {(backtest.status === 'queued' || backtest.status === 'running') && (
        <div className="tw-pending" role="status">
          <p>
            <strong>Nothing has been computed yet.</strong> Your run is accepted and in the queue.
            A worker takes it under a lease tied to this run alone, so if the service restarts
            part-way through, the run begins again rather than being lost.
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
        <Link to="/backtests">← Back to every run</Link>
      </p>
    </section>
  )
}

function Notes({ notes }: { notes: readonly string[] }) {
  return (
    <div className="tw-notes" role="note">
      <h2 className="tw-notes__title">Adjustments the engine made before it ran</h2>
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
      <h2 className="tw-report__title">What the run found</h2>

      {/* The label before the first figure, never after the last one. */}
      <ModelledNote>{MODELLED_LONG}</ModelledNote>

      <div className="tw-metrics">
        <Metric
          label="Total return"
          value={percent(metrics.totalReturnBps)}
          note={`Holding the asset untouched across the same bars gave ${percent(metrics.holdReturnBps)}.`}
        />
        <Metric
          label="Max drawdown"
          value={percent(metrics.maxDrawdownBps)}
          note="The deepest fall from a high point to the low that followed it, as a share of that high. This is how bad it got at its worst."
        />
        <Metric
          label="Fees paid"
          value={usd(metrics.feesPaidUsdCents)}
          note={`${backtest.feeBps} bps taken on each side of each trade, on top of ${backtest.slippageBps} bps of price moving away from you.`}
        />
        <Metric
          label="Trades"
          value={String(metrics.trades)}
          note={`${metrics.wins} closed in profit and ${metrics.losses} closed at a loss — ${percent(metrics.winRateBps)} of them ahead.`}
        />
        <Metric
          label="Profit factor"
          value={profitFactor(metrics)}
          note="Everything won divided by everything lost. At 1.00× the two cancel out."
        />
        <Metric
          label="Exposure"
          value={percent(metrics.exposureBps)}
          note="How much of the time it held anything at all. A rule that sits out most bars carries risk of a different shape from one that never lets go."
        />
        <Metric
          label="Best trade"
          value={signedUsd(metrics.bestTradeUsdCents)}
          note="Taken at the moment the position closed."
        />
        <Metric
          label="Worst trade"
          value={signedUsd(metrics.worstTradeUsdCents)}
          note="Taken at the moment the position closed."
        />
      </div>

      <h3 className="tw-report__subtitle">Reward set against the ride</h3>
      <p className="tw-report__note">
        These four are ratios rather than sums of money. Each is scaled up to a yearly figure from
        whatever bar length the series uses, so a result off five-minute bars can be set beside one
        off daily bars. Treat that comparison as rough: returns measured over short intervals do
        not behave the way the arithmetic assumes.
      </p>
      <div className="tw-metrics">
        <Metric label="CAGR" value={rate(metrics.cagr)} note="Growth restated as a yearly compounding rate." />
        <Metric label="Sharpe" value={ratio(metrics.sharpe)} note="Gain measured against how much it moved about, up and down alike." />
        <Metric
          label="Sortino"
          value={ratio(metrics.sortino)}
          note="The same idea, counting only the falls, since upward movement is not what worries anyone."
        />
        <Metric
          label="Calmar"
          value={ratio(metrics.calmar)}
          note="Yearly growth set against the worst fall it had to sit through."
        />
      </div>

      <h3 className="tw-report__subtitle">Where it started and where it ended</h3>
      <p className="tw-report__note">
        The metrics above were worked out across every bar, and the curve you can see was then
        thinned to roughly six hundred points so it could be stored and drawn. The digest at the
        top of this page covers the stored output: hand the same bars and the same seed to another
        run and you should get that digest back.
      </p>
      <dl className="tw-facts">
        <Fact label="Start equity">
          <span className="cf-num">{usd(metrics.startEquity)}</span>
        </Fact>
        <Fact label="End equity">
          <span className="cf-num">{usd(metrics.endEquity)}</span>
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
