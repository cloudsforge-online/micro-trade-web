/**
 * Create a bot.
 *
 * `POST /v1/bots` — `trade/src/server.ts:591`. It creates a `draft`: nothing is reserved and
 * nothing trades until `start`. **201 fresh, 200 on a replay** (`trade/src/server.ts:640`).
 *
 * ── The two things this form has to say out loud ──────────────────────────────────────────────
 *
 * **1. Paper is charged.** `PAPER_FEE_BPS = 10` and `PAPER_SLIPPAGE_BPS = 5`
 * (`trade/src/bots.ts:81-82`) match the backtest's defaults by construction, and
 * `trade/src/bots.ts:73-80` says why: the frozen service booked a zero fee in paper mode, "so a
 * paper bot beat the backtest of its own rule every time — which is the single comparison this
 * product exists to let somebody make". A form that let a customer believe paper was free would
 * undo that.
 *
 * **2. Live may be switched off underneath them.** `TRADE_LIVE_ENABLED` defaults to **false**
 * (`trade/src/env.ts:181`), it is read per tick rather than at boot (`trade/src/env.ts:11-16`), and
 * `startBot` refuses a live bot outright while it is off (`trade/src/bots.ts:562-564`). This form
 * used to be unable to know the deployment's setting, because no route exposed it, and said so
 * rather than guessing. `GET /v1/capabilities` (`trade/src/server.ts:361`) now reports it, so the
 * form asks before the customer commits and renders the service's OWN refusal sentence — not a
 * paraphrase, so the warning and the eventual failure cannot say different things.
 *
 * The performance fee field defaults to the service's own 1500 bps (`trade/src/server.ts:608`) and
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

/** `trade/src/server.ts:608`. Restated here because the form sends it explicitly. */
const DEFAULT_FEE_BPS = 1500

export function NewBotPage() {
  const navigate = useNavigate()

  const catalogue = useResource(
    (signal) => getStrategies(signal),
    (data) => data.strategies.length,
    'The strategy catalogue could not be loaded.',
  )
  const series = useResource(
    (signal) => getSeries(signal),
    (data) => data.series.length,
    'The available price series could not be loaded.',
  )
  // Unauthenticated, and asked BEFORE the form is submitted. This used to be unknowable — the note
  // below said so — and a customer learned that live was off by pressing start.
  const capabilities = useResource(
    (signal) => getCapabilities(signal),
    () => 1,
    'Whether this deployment allows live trading could not be checked.',
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
    return <Loading label="Loading the catalogue" />
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
          This creates a draft. Nothing is reserved and nothing trades until you start it.
        </p>
      </header>

      <form className="tw-form" onSubmit={onSubmit}>
        <label className="tw-field">
          <span className="tw-field__label">Name</span>
          <input
            className="tw-input"
            value={name}
            maxLength={120}
            required
            onChange={(e) => {
              setName(e.target.value)
              submit.reset()
            }}
          />
          <span className="tw-field__help">For you, on this list. 1–120 characters.</span>
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
              <strong>Paper.</strong> No money moves. It is still charged 10 bps of fee and 5 bps of
              slippage on every fill — the same as a backtest — so that comparing the two means
              something.
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
              <strong>Live.</strong> Starting it reserves your allocation at the ledger before the
              bot moves. Gains above the high-water mark are charged the performance fee below.
            </span>
          </label>
          {mode === 'live' && capabilities.data?.capabilities.liveTrading.enabled === false && (
            <p className="tw-field__note tw-field__note--warn" role="alert">
              <strong>Live trading is switched off on this deployment.</strong>{' '}
              {/* The engine's own sentence, verbatim, so this and the 409 cannot disagree. */}
              {capabilities.data.capabilities.liveTrading.refusal ??
                'Starting a live bot will be refused.'}{' '}
              You can still create this bot, but it will not trade until the switch is on.
            </p>
          )}
          {mode === 'live' && capabilities.data === null && (
            <p className="tw-field__note tw-field__note--warn" role="status">
              <strong>Whether live trading is switched on could not be checked.</strong> The kill
              switch is read on every tick, and starting a live bot while it is off is refused with
              a 409. This says "unknown" rather than "fine" — an unchecked switch is not an open one.
            </p>
          )}
        </fieldset>

        <label className="tw-field">
          <span className="tw-field__label">Strategy</span>
          <select
            className="tw-input"
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
            className="tw-input"
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
                  className="tw-input cf-num"
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
            className="tw-input cf-num"
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
            Whole Shards, sent as a decimal string. Must be positive. On a live bot this becomes a
            ledger reservation the moment you start it.
          </span>
        </label>

        <label className="tw-field">
          <span className="tw-field__label">Performance fee (basis points)</span>
          <input
            className="tw-input cf-num"
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
            {DEFAULT_FEE_BPS} bps — 15% — by default, charged only on gains above the bot’s
            high-water mark. It applies to a live bot; a paper bot is never billed.
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
            It is created as a draft — the column defaults to it (
            <code className="cf-num">trade/src/migrations.ts:245</code>). Starting it is a separate,
            deliberate action.
          </span>
        </div>
      </form>
    </section>
  )
}
