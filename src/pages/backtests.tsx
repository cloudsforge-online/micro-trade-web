/**
 * Your backtests.
 *
 * `GET /v1/backtests` — `trade/src/server.ts`. At most 100, newest first, and the
 * caller's own: `ownerOf` (`trade/src/server.ts`) resolves the subject from the token.
 *
 * The `userId` query parameter that route accepts is deliberately not offered here. It is honoured
 * only for an admin principal and is otherwise passed through `subjectUserId`, which refuses a
 * mismatch — so from a customer bundle it can only ever be the caller's own id or a 403. An
 * act-as-anyone-shaped control with no reachable behaviour is worse than no control.
 *
 * No mark-provenance column, and that is not an omission: `runBacktest` marks at each bar's close
 * and never calls pricing (`trade/src/backtest.ts`), so every run on this list has the same
 * provenance and it is stated once above the table. A live bot has a column instead, because its
 * mark could have come from a market or from a price an operator set — micro-org#368.
 */
import { Link } from 'react-router-dom'
import { Empty, Failed, Forbidden, Loading } from '../components/states.tsx'
import { ModelledTag, StateBadge } from '../components/tone.tsx'
import { backtestTone, barTime, percent, shortId, usd } from '../lib/format.ts'
import { useResource } from '../lib/resource.ts'
import { listBacktests, type Backtest } from '../lib/trade.ts'

export function BacktestsPage() {
  const runs = useResource(
    (signal) => listBacktests(signal),
    (data) => data.backtests.length,
    'We could not read your runs.',
  )

  return (
    <section className="tw-page">
      <header className="tw-page__head">
        <h1 className="tw-page__title">Backtests</h1>
        <Link className="cf-btn cf-btn--primary" to="/backtests/new">
          Run a backtest
        </Link>
      </header>

      {runs.state === 'loading' && <Loading label="Reading your runs" />}
      {runs.state === 'forbidden' && <Forbidden notice={runs.error ?? undefined} />}
      {runs.state === 'failed' && runs.error && (
        <Failed notice={runs.error} onRetry={runs.reload} />
      )}
      {runs.state === 'empty' && (
        <Empty
          title="No runs on this account"
          hint="Choose a rule and the bars to put it through, and the report will be waiting here. Running one costs you nothing."
          action={
            <Link className="cf-btn" to="/backtests/new">
              Start one
            </Link>
          }
        />
      )}

      {runs.state === 'ok' && runs.data && (
        <>
          {/*
            The label sits ABOVE the table, not under it. Every number in the return column is the
            output of a simulation over bars that have already happened.
          */}
          <p className="tw-table__caption">
            Both figures in this table come out of a simulation over bars that already closed, and
            each run is marked at those closes rather than at any quoted price. <ModelledTag />
          </p>
          <div className="tw-scroll">
            <table className="tw-table">
              <thead>
                <tr>
                  <th scope="col">Run</th>
                  <th scope="col">Strategy</th>
                  <th scope="col">State</th>
                  <th scope="col">Window</th>
                  <th scope="col">Start</th>
                  <th scope="col">Return</th>
                  <th scope="col">Max drawdown</th>
                </tr>
              </thead>
              <tbody>
                {runs.data.backtests.map((run) => (
                  <Row key={run.id} run={run} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

function Row({ run }: { run: Backtest }) {
  const tone = backtestTone(run.status)
  return (
    <tr>
      <td>
        <Link className="cf-num" to={`/backtests/${run.id}`}>
          {shortId(run.id)}
        </Link>
      </td>
      <td>{run.strategyId}</td>
      <td>
        <StateBadge tone={tone} />
      </td>
      <td className="cf-num">
        {run.fromT === null ? '—' : `${barTime(run.fromT)} → ${barTime(run.toT)}`}
      </td>
      <td className="cf-num">{usd(run.startCash)}</td>
      {/*
        `metrics` is null until the run completes — `trade/src/backtests.ts` writes the column
        only on the complete branch. A dash is the honest answer; a zero would be a claim about a
        run that has not happened.
      */}
      <td className="cf-num">{run.metrics ? percent(run.metrics.totalReturnBps) : '—'}</td>
      <td className="cf-num">{run.metrics ? percent(run.metrics.maxDrawdownBps) : '—'}</td>
    </tr>
  )
}
