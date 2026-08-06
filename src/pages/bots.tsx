/**
 * Your bots.
 *
 * `GET /v1/bots` — `trade/src/server.ts`. At most 100, newest first, the caller's own.
 *
 * The equity column is a MARK, not a settlement: it is whatever the last tick computed against
 * whatever price was available then. It is labelled as such rather than presented as a balance.
 */
import { Link } from 'react-router-dom'
import { Empty, Failed, Forbidden, Loading } from '../components/states.tsx'
import { StateBadge } from '../components/tone.tsx'
import { botTone, modeName, shards, shortId } from '../lib/format.ts'
import { useResource } from '../lib/resource.ts'
import { listBots, type Bot } from '../lib/trade.ts'

export function BotsPage() {
  const bots = useResource(
    (signal) => listBots(signal),
    (data) => data.bots.length,
    'Your bots could not be loaded.',
  )

  return (
    <section className="tw-page">
      <header className="tw-page__head">
        <h1 className="tw-page__title">Bots</h1>
        <Link className="cf-btn cf-btn--primary" to="/bots/new">
          Create a bot
        </Link>
      </header>

      {/*
        The fee, stated where the bots are, not in a settings page nobody opens.
        `trade/src/server.ts` defaults `feeBps` to 1500 on creation, and `trade/src/fees.ts`
        states the model: "Trade is free until it makes money. Backtests, the strategy catalogue and
        paper trading never cost anything. The only charge is a share of a LIVE bot's gains,
        assessed against a HIGH-WATER MARK."
      */}
      <p className="tw-claim">
        <strong>A paper bot costs nothing.</strong> A live bot is charged a performance fee — 15% by
        default — on gains above its high-water mark, and on nothing else. It is never charged on
        the capital you committed, and never twice for the same climb.
      </p>

      {bots.state === 'loading' && <Loading label="Loading your bots" />}
      {bots.state === 'forbidden' && <Forbidden notice={bots.error ?? undefined} />}
      {bots.state === 'failed' && bots.error && (
        <Failed notice={bots.error} onRetry={bots.reload} />
      )}
      {bots.state === 'empty' && (
        <Empty
          title="You have no bots"
          hint="A paper bot runs the same rule with the same fee and slippage as a backtest, on bars as they close. It costs nothing."
          action={
            <Link className="cf-btn" to="/bots/new">
              Create one
            </Link>
          }
        />
      )}

      {bots.state === 'ok' && bots.data && (
        <div className="tw-scroll">
          <table className="tw-table">
            <thead>
              <tr>
                <th scope="col">Bot</th>
                <th scope="col">Mode</th>
                <th scope="col">State</th>
                <th scope="col">Strategy</th>
                <th scope="col">Allocated</th>
                <th scope="col">Equity (marked)</th>
                <th scope="col">Fee owed</th>
              </tr>
            </thead>
            <tbody>
              {bots.data.bots.map((bot) => (
                <Row key={bot.id} bot={bot} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Row({ bot }: { bot: Bot }) {
  return (
    <tr>
      <td>
        <Link to={`/bots/${bot.id}`}>{bot.name}</Link>{' '}
        <span className="cf-num tw-dim">{shortId(bot.id)}</span>
      </td>
      <td>{modeName(bot.mode)}</td>
      <td>
        <StateBadge tone={botTone(bot.status)} />
      </td>
      <td>{bot.strategyId}</td>
      <td className="cf-num">{shards(bot.allocation)}</td>
      {/*
        "marked", in the header, because that is what it is: a tick writes `equity` from the price
        it could get at the time (`trade/src/bots.ts`), against a position that is still open.
      */}
      <td className="cf-num">{shards(bot.equity)}</td>
      <td className="cf-num">{shards(bot.feeOwed)}</td>
    </tr>
  )
}
