/**
 * One bot: its position, its fills, its fee settlements, and the three actions.
 *
 * Four routes, all owner-scoped through `ownedBot` (`trade/src/server.ts`), which
 * authenticates and answers **404** for somebody else's bot:
 *
 *   * `GET  /v1/bots/:id`             — `trade/src/server.ts`
 *   * `GET  /v1/bots/:id/fills`       — `trade/src/server.ts`
 *   * `GET  /v1/bots/:id/settlements` — `trade/src/server.ts`
 *   * `POST /v1/bots/:id/actions`     — `trade/src/server.ts`, Idempotency-Key required
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE THREE REFUSALS THIS SCREEN HAS TO RENDER RATHER THAN PREVENT
 *
 * Each is a 409 `bot_state` (`BotStateError`, mapped at `trade/src/server.ts`):
 *
 *   1. **A stopped bot cannot be restarted** — `trade/src/bots.ts`. Stop is terminal, so the
 *      start button is not offered on a stopped bot and the page says why instead of leaving a
 *      button that always fails.
 *   2. **A live bot cannot start while the deployment's kill switch is off** —
 *      `trade/src/bots.ts`. `TRADE_LIVE_ENABLED` defaults to false (`trade/src/env.ts`)
 *      and no route reports it, so this page CANNOT know in advance. The button is offered and the
 *      refusal is rendered in full. Guessing would be worse: a client that hid the button on a
 *      deployment where live was on would have removed a feature nobody could file a bug against.
 *   3. **Only a running bot can be paused** — `trade/src/bots.ts`.
 *
 * Pause is **not a flatten**, and the page says so: the position stays open by design
 * (`trade/src/bots.ts`), and a paused bot's equity is a mark from whenever it last ticked
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
  groupDigits,
  modeName,
  percent,
  settlementTone,
  shortId,
  signedUsd,
  usd,
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

  const bot = useResource((signal) => getBot(id, signal), () => 1, 'We could not read that bot.', [id])
  const fills = useResource(
    (signal) => listFills(id, signal),
    (data) => data.fills.length,
    'We could not read what this bot has traded.',
    [id],
  )
  const settlements = useResource(
    (signal) => listSettlements(id, signal),
    (data) => data.settlements.length,
    'We could not read what this bot has been charged.',
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

  if (bot.state === 'loading') return <Loading label="Reading the bot" />
  if (bot.state === 'forbidden') return <Forbidden notice={bot.error ?? undefined} />
  if (bot.error) return <Failed notice={bot.error} onRetry={bot.reload} />
  if (!bot.data) return <Loading label="Reading the bot" />

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
        The kill switch, surfaced on the row rather than only logged. `trade/src/bots.ts`:
        "a live bot that has gone quiet because an operator pulled the switch is indistinguishable
        from one whose rule simply has not fired".
      */}
      {record.lastError && (
        <p className="tw-note tw-note--warn" role="status">
          <span className="tw-note__icon" aria-hidden="true">
            ▲
          </span>
          <strong>Its most recent pass placed nothing.</strong> {record.lastError}
        </p>
      )}

      <Actions bot={record} busy={act.busy} error={act.error?.message ?? null} onRun={run} />

      <dl className="tw-facts">
        <Fact label="Allocated">
          <span className="cf-num">{usd(record.allocation)}</span>
        </Fact>
        <Fact label="Cash">
          <span className="cf-num">{usd(record.cash)}</span>
        </Fact>
        <Fact label="Position">
          <span className="cf-num">{groupDigits(record.position)}</span>
        </Fact>
        <Fact label="Equity, estimated">
          <span className="cf-num">{usd(record.equity)}</span>
        </Fact>
        <Fact label="High-water mark">
          <span className="cf-num">{usd(record.highWaterMark)}</span>
        </Fact>
        <Fact label="Performance fee">
          {/* `feeBps` is already basis points, so it goes to `percent` unscaled: 1500 → 15.00%. */}
          <span className="cf-num">{percent(String(record.feeBps))}</span>
        </Fact>
        <Fact label="Fee owed">
          <span className="cf-num">{usd(record.feeOwed)}</span>
        </Fact>
        <Fact label="Fee paid">
          <span className="cf-num">{usd(record.feePaid)}</span>
        </Fact>
        <Fact label="Last bar evaluated">
          <span className="cf-num">{barTime(record.lastBarT)}</span>
        </Fact>
        <Fact label="Ledger reservation">
          {record.reservationEntryId === null ? (
            <span className="tw-absent">
              nothing held — paper bots never hold anything, and a live one takes its hold at start
            </span>
          ) : (
            <span className="cf-num">{record.reservationEntryId}</span>
          )}
        </Fact>
      </dl>

      <p className="tw-report__note">
        <strong>The equity figure is an estimate, not cash in hand.</strong> Each pass records it
        from whatever price was available at that moment, against a position still open. The
        performance fee is worked out against the high-water mark above, never against the capital
        you put in — which is precisely what stops one climb being billed twice.
      </p>

      <h2 className="tw-section__title">Every trade it made</h2>
      {fills.state === 'loading' && <Loading label="Reading its trades" />}
      {fills.state === 'forbidden' && <Forbidden notice={fills.error ?? undefined} />}
      {fills.state === 'failed' && fills.error && (
        <Failed notice={fills.error} onRetry={fills.reload} />
      )}
      {fills.state === 'empty' && (
        <Empty
          title="It has not traded"
          hint="A trade is written down only when the rule fires on a bar that has closed. Quiet is a verdict, not a fault — some rules wait a long while."
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
                <th scope="col">Cash</th>
                <th scope="col">Fee</th>
                <th scope="col">What triggered it</th>
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
                  {/* The service formats the price itself (`trade/src/money.ts`); this
                      bundle never divides a scaled integer by a power of ten in a float. */}
                  <td className="cf-num">{fill.price}</td>
                  <td className="cf-num">{groupDigits(fill.qty)}</td>
                  <td className="cf-num">{signedUsd(fill.usdCents)}</td>
                  <td className="cf-num">{usd(fill.feeUsdCents)}</td>
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

      <h2 className="tw-section__title">What it has been charged</h2>
      {settlements.state === 'loading' && <Loading label="Reading its charges" />}
      {settlements.state === 'forbidden' && <Forbidden notice={settlements.error ?? undefined} />}
      {settlements.state === 'failed' && settlements.error && (
        <Failed notice={settlements.error} onRetry={settlements.reload} />
      )}
      {settlements.state === 'empty' && (
        <Empty
          title="You owe nothing on this bot"
          hint="A charge appears only when a period ends with equity above the high-water mark. Paper bots never produce one at all."
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
                  <td className="cf-num">{usd(row.equity)}</td>
                  <td className="cf-num">{usd(row.highWaterMark)}</td>
                  <td className="cf-num">{signedUsd(row.gain)}</td>
                  <td className="cf-num">{usd(row.fee)}</td>
                  {/* `attempted` is lower than `fee` when the wallet could not cover it. Showing
                      both is the only way a customer can see a partial collection happened. */}
                  <td className="cf-num">{usd(row.attempted)}</td>
                  <td className="cf-num">{usd(row.collected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="tw-page__back">
        <Link to="/bots">← Back to every bot</Link>{' '}
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
  // `stopped` is terminal — `startBot` refuses it outright (`trade/src/bots.ts`). Offering a
  // button that can only 409 teaches a customer that the product is unreliable.
  const terminal = bot.status === 'stopped'
  const canPause = bot.status === 'running'
  const canStart = !terminal && bot.status !== 'running'

  return (
    <div className="tw-actions">
      {terminal ? (
        <p className="tw-actions__note">
          This bot has been stopped, and stopping is final. Build a new one if you want the rule
          running again; everything it traded and everything it was charged stays on this page.
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
            <strong>Pause is not a flatten.</strong> Whatever it bought,
            the position stays open — that is deliberate, not an oversight. Stopping is final: it
            works out the last fee owed and cannot be taken back.
            {bot.mode === 'live' && (
              <>
                {' '}
                Starting this one puts {usd(bot.allocation)} on hold at the ledger
                before it trades anything.
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
