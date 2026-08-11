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
import { botTone, modeName, usd, shortId } from '../lib/format.ts'
import { useResource } from '../lib/resource.ts'
import { listBots, type Bot } from '../lib/trade.ts'

export function BotsPage() {
  const bots = useResource(
    (signal) => listBots(signal),
    (data) => data.bots.length,
    'We could not read your bots.',
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
        <strong>A bot on paper costs nothing to run.</strong> On a live bot we take a performance
        fee, 15% unless you set it lower, and only out of the ground it gains above its own
        high-water mark. The money you allocated is never touched, the mark never falls back, and
        the same climb is therefore never billed twice. A bot that goes nowhere is never billed.
      </p>

      {bots.state === 'loading' && <Loading label="Reading your bots" />}
      {bots.state === 'forbidden' && <Forbidden notice={bots.error ?? undefined} />}
      {bots.state === 'failed' && bots.error && (
        <Failed notice={bots.error} onRetry={bots.reload} />
      )}
      {bots.state === 'empty' && (
        <Empty
          title="Nothing is running for you"
          hint="A paper bot takes a rule you have already measured and works it against bars as they close, under identical costs, so the two records can be laid side by side. It is free to run."
          action={
            <Link className="cf-btn" to="/bots/new">
              Set one up
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
                <th scope="col">Equity (estimated)</th>
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
      <td className="cf-num">{usd(bot.allocation)}</td>
      {/*
        "marked", in the header, because that is what it is: a tick writes `equity` from the price
        it could get at the time (`trade/src/bots.ts`), against a position that is still open.
      */}
      <td className="cf-num">{usd(bot.equity)}</td>
      <td className="cf-num">{usd(bot.feeOwed)}</td>
    </tr>
  )
}
