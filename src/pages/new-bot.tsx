/**
 * Create a bot.
 *
 * `POST /v1/bots` — `trade/src/server.ts`. It creates a `draft`: nothing is reserved and
 * nothing trades until `start`. **201 fresh, 200 on a replay** (`trade/src/server.ts`).
 *
 * ── The two things this form has to say out loud ──────────────────────────────────────────────
 *
 * **1. Paper is charged.** `PAPER_FEE_BPS = 10` and `PAPER_SLIPPAGE_BPS = 5`
 * (`trade/src/bots.ts`) match the backtest's defaults by construction, and
 * `trade/src/bots.ts` says why: the frozen service booked a zero fee in paper mode, "so a
 * paper bot beat the backtest of its own rule every time — which is the single comparison this
 * product exists to let somebody make". A form that let a customer believe paper was free would
 * undo that.
 *
 * **2. Live may be switched off underneath them.** `TRADE_LIVE_ENABLED` defaults to **false**
 * (`trade/src/env.ts`), it is read per tick rather than at boot (`trade/src/env.ts`), and
 * `startBot` refuses a live bot outright while it is off (`trade/src/bots.ts`). This form
 * used to be unable to know the deployment's setting, because no route exposed it, and said so
 * rather than guessing. `GET /v1/capabilities` (`trade/src/server.ts`) now reports it, so the
 * form asks before the customer commits and renders the service's OWN refusal sentence — not a
 * paraphrase, so the warning and the eventual failure cannot say different things.
 *
 * The performance fee field defaults to the service's own 1500 bps (`trade/src/server.ts`) and
 * is sent explicitly, so the number the customer agreed to is the number on the row.
 */
import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Failed, Forbidden, Loading } from '../components/states.tsx'
import { useIdempotentMutation } from '../lib/mutation.ts'
import { useResource } from '../lib/resource.ts'
import {
  createBot,
  getCapabilities,
  getSeries,
  getStrategies,
  type BotMode,
  type Strategy,
  type StrategyId,
} from '../lib/trade.ts'

/** `trade/src/server.ts`. Restated here because the form sends it explicitly. */
const DEFAULT_FEE_BPS = 1500

export function NewBotPage() {
  const navigate = useNavigate()

  const catalogue = useResource(
    (signal) => getStrategies(signal),
    (data) => data.strategies.length,
    'We could not read the list of strategies.',
  )
  const series = useResource(
    (signal) => getSeries(signal),
    (data) => data.series.length,
    'We could not read which price series are loaded.',
  )
  // Unauthenticated, and asked BEFORE the form is submitted. This used to be unknowable — the note
  // below said so — and a customer learned that live was off by pressing start.
  const capabilities = useResource(
    (signal) => getCapabilities(signal),
    () => 1,
    'We could not check whether live trading is switched on here.',
  )

  const strategies = catalogue.data?.strategies ?? []
  const available = series.data?.series ?? []

  const [name, setName] = useState('')
  const [mode, setMode] = useState<BotMode>('paper')
  const [strategyId, setStrategyId] = useState<StrategyId | ''>('')
  const [seriesId, setSeriesId] = useState('')
  const [allocation, setAllocation] = useState('100000')
  const [feeBps, setFeeBps] = useState(String(DEFAULT_FEE_BPS))
  const [tuning, setTuning] = useState<Record<string, string>>({})

  const strategy: Strategy | undefined = useMemo(
    () => strategies.find((s) => s.id === strategyId),
    [strategies, strategyId],
  )

  const submit = useIdempotentMutation(createBot, 'The bot could not be created.')

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!strategy || !seriesId) return
    const numeric: Record<string, number> = {}
    for (const spec of strategy.params) {
      const raw = tuning[spec.key]
      const value = raw === undefined || raw === '' ? spec.default : Number(raw)
      if (Number.isFinite(value)) numeric[spec.key] = value
    }
    const created = await submit.run({
      name: name.trim(),
      mode,
      seriesId,
      strategyId: strategy.id,
      params: numeric,
      allocation: allocation.trim(),
      feeBps: Number(feeBps),
    })
    if (created) navigate(`/bots/${created.botId}`)
  }

  if (catalogue.state === 'loading' || series.state === 'loading') {
    return <Loading label="Reading the strategies and series" />
  }
  if (catalogue.state === 'forbidden') return <Forbidden notice={catalogue.error ?? undefined} />
  if (series.state === 'forbidden') return <Forbidden notice={series.error ?? undefined} />
  if (catalogue.state === 'failed' && catalogue.error) {
    return <Failed notice={catalogue.error} onRetry={catalogue.reload} />
  }
  if (series.state === 'failed' && series.error) {
    return <Failed notice={series.error} onRetry={series.reload} />
  }

  return (
    <section className="tw-page">
      <header className="tw-page__head">
        <h1 className="tw-page__title">Create a bot</h1>
        <p className="tw-page__lede">
          Setting a bot up puts nothing at stake. It sits as a draft, holding no money and
          placing no trades, until you press start on the next screen.
        </p>
      </header>

      <form className="tw-form" onSubmit={onSubmit}>
        <label className="tw-field">
          <span className="tw-field__label">Name</span>
          <input
            className="cf-input"
            value={name}
            maxLength={120}
            required
            onChange={(e) => {
              setName(e.target.value)
              submit.reset()
            }}
          />
          <span className="tw-field__help">Something you will recognise on the list. Up to 120 characters.</span>
        </label>

        <fieldset className="tw-fieldset">
          <legend className="tw-fieldset__legend">Mode</legend>
          <label className="tw-radio">
            <input
              type="radio"
              name="mode"
              value="paper"
              checked={mode === 'paper'}
              onChange={() => {
                setMode('paper')
                submit.reset()
              }}
            />
            <span>
              <strong>Paper.</strong> Nothing leaves your account. Even so, it is
              still charged 10 bps of fee and 5 bps of
              slippage on every trade — matching a backtest exactly — so that setting one against
              the other tells you something real.
            </span>
          </label>
          <label className="tw-radio">
            <input
              type="radio"
              name="mode"
              value="live"
              checked={mode === 'live'}
              onChange={() => {
                setMode('live')
                submit.reset()
              }}
            />
            <span>
              <strong>Live.</strong> Pressing start puts your allocation on hold at the ledger
              before a single trade goes out. Whatever it makes above its high-water mark carries
              the performance fee set below.
            </span>
          </label>
          {mode === 'live' && capabilities.data?.capabilities.liveTrading.enabled === false && (
            <p className="tw-field__note tw-field__note--warn" role="alert">
              <strong>Live trading is turned off here.</strong>{' '}
              {/* The engine's own sentence, verbatim, so this and the 409 cannot disagree. */}
              {capabilities.data.capabilities.liveTrading.refusal ??
                'Starting a live bot will be refused.'}{' '}
              Set the bot up by all means; it will sit there without trading until whoever runs
              this deployment turns live trading back on.
            </p>
          )}
          {mode === 'live' && capabilities.data === null && (
            <p className="tw-field__note tw-field__note--warn" role="status">
              <strong>Whether live trading is on here could not be checked.</strong> That switch
              is consulted on every single tick, and a live bot asked to start while it is off gets
              turned away. We are calling this unknown rather than fine: a switch nobody could read
              is not a switch anybody has seen open.
            </p>
          )}
        </fieldset>

        <label className="tw-field">
          <span className="tw-field__label">Strategy</span>
          <select
            className="cf-input"
            value={strategyId}
            required
            onChange={(e) => {
              setStrategyId(e.target.value as StrategyId)
              setTuning({})
              submit.reset()
            }}
          >
            <option value="">Choose a strategy…</option>
            {strategies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {strategy && (
            <span className="tw-field__help">
              <strong>{strategy.tagline}</strong> {strategy.weakness}
            </span>
          )}
        </label>

        <label className="tw-field">
          <span className="tw-field__label">Price series</span>
          <select
            className="cf-input"
            value={seriesId}
            required
            onChange={(e) => {
              setSeriesId(e.target.value)
              submit.reset()
            }}
          >
            <option value="">Choose a series…</option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>
                {s.symbol} · {s.timeframe} · {s.source}
              </option>
            ))}
          </select>
        </label>

        {strategy && strategy.params.length > 0 && (
          <fieldset className="tw-fieldset">
            <legend className="tw-fieldset__legend">Parameters</legend>
            {strategy.params.map((spec) => (
              <label className="tw-field" key={spec.key}>
                <span className="tw-field__label">
                  {spec.label}
                  {spec.unit ? ` (${spec.unit})` : ''}
                </span>
                <input
                  className="cf-input cf-num"
                  type="number"
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  value={tuning[spec.key] ?? String(spec.default)}
                  onChange={(e) => {
                    setTuning((prev) => ({ ...prev, [spec.key]: e.target.value }))
                    submit.reset()
                  }}
                />
                <span className="tw-field__help">{spec.help}</span>
              </label>
            ))}
          </fieldset>
        )}

        <label className="tw-field">
          <span className="tw-field__label">Allocation (Shards)</span>
          <input
            className="cf-input cf-num"
            inputMode="numeric"
            pattern="[0-9]+"
            value={allocation}
            required
            onChange={(e) => {
              setAllocation(e.target.value)
              submit.reset()
            }}
          />
          <span className="tw-field__help">
            The capital this bot works with, in whole Shards above zero. On a live bot it turns
            into a ledger hold the instant you start it, and it comes back when you stop.
          </span>
        </label>

        <label className="tw-field">
          <span className="tw-field__label">Performance fee (basis points)</span>
          <input
            className="cf-input cf-num"
            type="number"
            min={0}
            max={5000}
            step={1}
            value={feeBps}
            onChange={(e) => {
              setFeeBps(e.target.value)
              submit.reset()
            }}
          />
          <span className="tw-field__help">
            {DEFAULT_FEE_BPS} bps, which is 15%, unless you lower it. We take it out of ground
            gained above this bot’s own high-water mark and out of nothing else. Live bots only —
            a paper bot never sees a bill.
          </span>
        </label>

        {submit.error && (
          <p className="tw-error" role="alert">
            {submit.error.message}
            {submit.error.requestId && (
              <>
                {' '}
                Quote this to support:{' '}
                <code className="cf-num tw-reqid">{submit.error.requestId}</code>
              </>
            )}
          </p>
        )}

        <div className="tw-form__actions">
          <button className="cf-btn cf-btn--primary" type="submit" disabled={submit.busy}>
            {submit.busy ? 'Creating…' : 'Create this bot'}
          </button>
          <span className="tw-form__hint">
            You get a draft. Starting it is a separate press, on a separate screen.
          </span>
        </div>
      </form>
    </section>
  )
}
