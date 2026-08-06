/**
 * One bot: its position, its fills, its fee settlements, and the three actions.
 *
 * Four routes, all owner-scoped through `ownedBot` (`trade/src/server.ts:808-819`), which
 * authenticates at `:741` and answers **404** for somebody else's bot:
 *
 *   * `GET  /v1/bots/:id`             — `trade/src/server.ts:555`
 *   * `GET  /v1/bots/:id/fills`       — `trade/src/server.ts:560`
 *   * `GET  /v1/bots/:id/settlements` — `trade/src/server.ts:578`
 *   * `POST /v1/bots/:id/actions`     — `trade/src/server.ts:658`, Idempotency-Key required
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE THREE REFUSALS THIS SCREEN HAS TO RENDER RATHER THAN PREVENT
 *
 * Each is a 409 `bot_state` (`BotStateError`, mapped at `trade/src/server.ts:281-283`):
 *
 *   1. **A stopped bot cannot be restarted** — `trade/src/bots.ts:561`. Stop is terminal, so the
 *      start button is not offered on a stopped bot and the page says why instead of leaving a
 *      button that always fails.
 *   2. **A live bot cannot start while the deployment's kill switch is off** —
 *      `trade/src/bots.ts:562-564`. `TRADE_LIVE_ENABLED` defaults to false (`trade/src/env.ts:181`)
 *      and no route reports it, so this page CANNOT know in advance. The button is offered and the
 *      refusal is rendered in full. Guessing would be worse: a client that hid the button on a
 *      deployment where live was on would have removed a feature nobody could file a bug against.
 *   3. **Only a running bot can be paused** — `trade/src/bots.ts:611`.
 *
 * Pause is **not a flatten**, and the page says so: the position stays open by design
 * (`trade/src/bots.ts:602-608`), and a paused bot's equity is a mark from whenever it last ticked
 * against a position that may be worth anything by now.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { Link, useParams } from 'react-router-dom'
import { Empty, Failed, Forbidden, Loading } from '../components/states.tsx'
import { Fact, StateBadge } from '../components/tone.tsx'
import {
  barTime,
  botTone,
  fillTone,
  modeName,
  percent,
  settlementTone,
  shards,
  shortId,
  signedShards,
} from '../lib/format.ts'
import { useIdempotentMutation } from '../lib/mutation.ts'
import { useResource } from '../lib/resource.ts'
import {
  actOnBot,
  getBot,
  listFills,
  listSettlements,
  type Bot,
  type BotAction,
} from '../lib/trade.ts'

export function BotPage() {
  const { id = '' } = useParams()

  const bot = useResource((signal) => getBot(id, signal), () => 1, 'That bot could not be loaded.', [id])
  const fills = useResource(
    (signal) => listFills(id, signal),
    (data) => data.fills.length,
    'This bot’s fills could not be loaded.',
    [id],
  )
  const settlements = useResource(
    (signal) => listSettlements(id, signal),
    (data) => data.settlements.length,
    'This bot’s fee settlements could not be loaded.',
    [id],
  )

  const act = useIdempotentMutation(
    (key: string, action: BotAction) => actOnBot(key, id, action),
    'That action could not be completed.',
  )

  const run = async (action: BotAction) => {
    const done = await act.run(action)
    if (done) {
      bot.reload()
      fills.reload()
      settlements.reload()
    }
  }

  if (bot.state === 'loading') return <Loading label="Loading the bot" />
  if (bot.state === 'forbidden') return <Forbidden notice={bot.error ?? undefined} />
  if (bot.error) return <Failed notice={bot.error} onRetry={bot.reload} />
  if (!bot.data) return <Loading label="Loading the bot" />

  const record = bot.data.bot
  const tone = botTone(record.status)

  return (
    <section className="tw-page">
      <header className="tw-page__head">
        <h1 className="tw-page__title">{record.name}</h1>
        <StateBadge tone={tone} />
      </header>
      <p className="tw-page__lede">
        {modeName(record.mode)} · {record.strategyId} · {tone.meaning}
      </p>

      {/*
        The kill switch, surfaced on the row rather than only logged. `trade/src/bots.ts:84-87`:
        "a live bot that has gone quiet because an operator pulled the switch is indistinguishable
        from one whose rule simply has not fired".
      */}
      {record.lastError && (
        <p className="tw-note tw-note--warn" role="status">
          <span className="tw-note__icon" aria-hidden="true">
            ▲
          </span>
          <strong>The last tick did nothing.</strong> {record.lastError}
        </p>
      )}

      <Actions bot={record} busy={act.busy} error={act.error?.message ?? null} onRun={run} />

      <dl className="tw-facts">
        <Fact label="Allocated">
          <span className="cf-num">{shards(record.allocation)} Shards</span>
        </Fact>
        <Fact label="Cash">
          <span className="cf-num">{shards(record.cash)} Shards</span>
        </Fact>
        <Fact label="Position">
          <span className="cf-num">{shards(record.position)}</span>
        </Fact>
        <Fact label="Equity, marked">
          <span className="cf-num">{shards(record.equity)} Shards</span>
        </Fact>
        <Fact label="High-water mark">
          <span className="cf-num">{shards(record.highWaterMark)} Shards</span>
        </Fact>
        <Fact label="Performance fee">
          {/* `feeBps` is already basis points, so it goes to `percent` unscaled: 1500 → 15.00%. */}
          <span className="cf-num">{percent(String(record.feeBps))}</span>
        </Fact>
        <Fact label="Fee owed">
          <span className="cf-num">{shards(record.feeOwed)} Shards</span>
        </Fact>
        <Fact label="Fee paid">
          <span className="cf-num">{shards(record.feePaid)} Shards</span>
        </Fact>
        <Fact label="Last bar evaluated">
          <span className="cf-num">{barTime(record.lastBarT)}</span>
        </Fact>
        <Fact label="Ledger reservation">
          {record.reservationEntryId === null ? (
            <span className="tw-absent">
              none — a paper bot never reserves, and a live one reserves on start
            </span>
          ) : (
            <span className="cf-num">{record.reservationEntryId}</span>
          )}
        </Fact>
      </dl>

      <p className="tw-report__note">
        <strong>Equity is a mark, not a settlement.</strong> A tick writes it from the price the
        service could get at the time, against a position that is still open. The performance fee is
        assessed against the high-water mark above and never against the capital you committed —
        which is what stops the same climb being charged for twice.
      </p>

      <h2 className="tw-section__title">Fills</h2>
      {fills.state === 'loading' && <Loading label="Loading fills" />}
      {fills.state === 'forbidden' && <Forbidden notice={fills.error ?? undefined} />}
      {fills.state === 'failed' && fills.error && (
        <Failed notice={fills.error} onRetry={fills.reload} />
      )}
      {fills.state === 'empty' && (
        <Empty
          title="No fills yet"
          hint="A fill is booked when the rule fires on a closed bar. A bot that has not traded is not a bot that is broken."
        />
      )}
      {fills.state === 'ok' && fills.data && (
        <div className="tw-scroll">
          <table className="tw-table">
            <thead>
              <tr>
                <th scope="col">Bar</th>
                <th scope="col">Side</th>
                <th scope="col">State</th>
                <th scope="col">Price</th>
                <th scope="col">Quantity</th>
                <th scope="col">Shards</th>
                <th scope="col">Fee</th>
                <th scope="col">Why</th>
              </tr>
            </thead>
            <tbody>
              {fills.data.fills.map((fill) => (
                <tr key={fill.id}>
                  <td className="cf-num">{barTime(fill.barT)}</td>
                  <td>{fill.side === 'buy' ? 'Buy' : 'Sell'}</td>
                  <td>
                    <StateBadge tone={fillTone(fill.status)} />
                  </td>
                  {/* The service formats the price itself (`trade/src/money.ts:196-207`); this
                      bundle never divides a scaled integer by a power of ten in a float. */}
                  <td className="cf-num">{fill.price}</td>
                  <td className="cf-num">{shards(fill.qty)}</td>
                  <td className="cf-num">{signedShards(fill.shards)}</td>
                  <td className="cf-num">{shards(fill.feeShards)}</td>
                  <td>
                    {fill.reason}
                    {fill.error && <span className="tw-dim"> — {fill.error}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="tw-section__title">Fee settlements</h2>
      {settlements.state === 'loading' && <Loading label="Loading settlements" />}
      {settlements.state === 'forbidden' && <Forbidden notice={settlements.error ?? undefined} />}
      {settlements.state === 'failed' && settlements.error && (
        <Failed notice={settlements.error} onRetry={settlements.reload} />
      )}
      {settlements.state === 'empty' && (
        <Empty
          title="Nothing has been charged"
          hint="A settlement exists only when equity rose above the high-water mark in a period. A paper bot never produces one."
        />
      )}
      {settlements.state === 'ok' && settlements.data && (
        <div className="tw-scroll">
          <table className="tw-table">
            <thead>
              <tr>
                <th scope="col">Period</th>
                <th scope="col">State</th>
                <th scope="col">Equity</th>
                <th scope="col">Mark</th>
                <th scope="col">Gain</th>
                <th scope="col">Fee</th>
                <th scope="col">Attempted</th>
                <th scope="col">Collected</th>
              </tr>
            </thead>
            <tbody>
              {settlements.data.settlements.map((row) => (
                <tr key={row.id}>
                  <td className="cf-num">{row.period}</td>
                  <td>
                    <StateBadge tone={settlementTone(row.status)} />
                  </td>
                  <td className="cf-num">{shards(row.equity)}</td>
                  <td className="cf-num">{shards(row.highWaterMark)}</td>
                  <td className="cf-num">{shards(row.gain)}</td>
                  <td className="cf-num">{shards(row.fee)}</td>
                  {/* `attempted` is lower than `fee` when the wallet could not cover it. Showing
                      both is the only way a customer can see a partial collection happened. */}
                  <td className="cf-num">{shards(row.attempted)}</td>
                  <td className="cf-num">{shards(row.collected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="tw-page__back">
        <Link to="/bots">← All bots</Link>{' '}
        <span className="cf-num tw-dim">{shortId(record.id)}</span>
      </p>
    </section>
  )
}

function Actions({
  bot,
  busy,
  error,
  onRun,
}: {
  bot: Bot
  busy: boolean
  error: string | null
  onRun: (action: BotAction) => void
}) {
  // `stopped` is terminal — `startBot` refuses it outright (`trade/src/bots.ts:561`). Offering a
  // button that can only 409 teaches a customer that the product is unreliable.
  const terminal = bot.status === 'stopped'
  const canPause = bot.status === 'running'
  const canStart = !terminal && bot.status !== 'running'

  return (
    <div className="tw-actions">
      {terminal ? (
        <p className="tw-actions__note">
          This bot is stopped, which is terminal. It cannot be restarted — create a new one. Its
          fills and settlements stay here.
        </p>
      ) : (
        <>
          <button
            type="button"
            className="cf-btn cf-btn--primary"
            disabled={busy || !canStart}
            onClick={() => onRun('start')}
          >
            Start
          </button>
          <button
            type="button"
            className="cf-btn"
            disabled={busy || !canPause}
            onClick={() => onRun('pause')}
          >
            Pause
          </button>
          <button type="button" className="cf-btn cf-btn--danger" disabled={busy} onClick={() => onRun('stop')}>
            Stop
          </button>
          <p className="tw-actions__note">
            <strong>Pause is not a flatten.</strong> The position stays open, by design. Stop is
            terminal, settles the final fee, and cannot be undone.
            {bot.mode === 'live' && (
              <>
                {' '}
                Starting a live bot reserves {shards(bot.allocation)} Shards at the ledger before it
                moves.
              </>
            )}
          </p>
        </>
      )}
      {error && (
        <p className="tw-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
