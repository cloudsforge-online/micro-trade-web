/**
 * Queue a backtest.
 *
 * `POST /v1/backtests` — `trade/src/server.ts:399`. **202 and a status URL; the run has not
 * happened.** The handler validates, claims an idempotency key, writes a `queued` row and enqueues
 * the job after the claim commits (`trade/src/server.ts:453-464`). So this screen navigates to the
 * status page rather than rendering a result, and the button never says "run" in the past tense.
 *
 * ── Three defaults on this form are the product's argument, not conveniences ──────────────────
 *
 *   * **Fee, 10 bps.** `readBps(body, 'feeBps', 10)` — `trade/src/server.ts:415`.
 *   * **Slippage, 5 bps.** `readBps(body, 'slippageBps', 5)` — `trade/src/server.ts:416`.
 *   * **Seed, 0.** `readSeed` defaults to zero rather than randomising, and says why
 *     (`trade/src/server.ts:836-850`): a random default "would make an omitted seed produce a run
 *     nobody can reproduce, which is the exact property this service promises not to have".
 *
 * They are shown, editable, and sent explicitly, so the number on the screen is the number the row
 * carries. Setting the fee to zero is allowed by the service and this form says what it costs you:
 * a result that cannot be compared with a live bot's.
 *
 * ── The client validates nothing the service does not ─────────────────────────────────────────
 *
 * The `min`, `max` and `step` on each parameter input come from the catalogue's own spec
 * (`trade/src/catalog.ts:41-50`), and out-of-range values are CLAMPED by `normaliseParams` rather
 * than refused (`trade/src/catalog.ts:195-226`) — with the adjustment returned in `notes`. So the
 * inputs advertise the range and the status page renders the notes; neither refuses what the
 * service would have accepted.
 */
import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Failed, Forbidden, Loading } from '../components/states.tsx'
import { ModelledNote } from '../components/tone.tsx'
import { MODELLED_LONG } from '../lib/format.ts'
import { useIdempotentMutation } from '../lib/mutation.ts'
import { useResource } from '../lib/resource.ts'
import {
  createBacktest,
  getSeries,
  getStrategies,
  type SeriesRecord,
  type Strategy,
  type StrategyId,
} from '../lib/trade.ts'

/** `trade/src/server.ts:415-416`. Restated here because the form sends them explicitly. */
const DEFAULT_FEE_BPS = 10
const DEFAULT_SLIPPAGE_BPS = 5

export function NewBacktestPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()

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

  const strategies = catalogue.data?.strategies ?? []
  const available = series.data?.series ?? []

  const [strategyId, setStrategyId] = useState<StrategyId | ''>(
    (params.get('strategy') as StrategyId | null) ?? '',
  )
  const [seriesId, setSeriesId] = useState('')
  const [startCash, setStartCash] = useState('100000')
  const [feeBps, setFeeBps] = useState(String(DEFAULT_FEE_BPS))
  const [slippageBps, setSlippageBps] = useState(String(DEFAULT_SLIPPAGE_BPS))
  const [seed, setSeed] = useState('0')
  const [tuning, setTuning] = useState<Record<string, string>>({})

  const strategy: Strategy | undefined = useMemo(
    () => strategies.find((s) => s.id === strategyId),
    [strategies, strategyId],
  )

  const submit = useIdempotentMutation(createBacktest, 'The backtest could not be queued.')

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!strategy || !seriesId) return
    const numeric: Record<string, number> = {}
    for (const spec of strategy.params) {
      const raw = tuning[spec.key]
      const value = raw === undefined || raw === '' ? spec.default : Number(raw)
      if (Number.isFinite(value)) numeric[spec.key] = value
    }
    const queued = await submit.run({
      seriesId,
      strategyId: strategy.id,
      params: numeric,
      startCash: startCash.trim(),
      feeBps: Number(feeBps),
      slippageBps: Number(slippageBps),
      seed: Number(seed),
    })
    // Only on a real acceptance. A failed run leaves the form filled in, with the error beside the
    // button that caused it.
    if (queued) navigate(`/backtests/${queued.backtestId}`)
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
        <h1 className="tw-page__title">Run a backtest</h1>
        <p className="tw-page__lede">
          One rule, one series, one seed. The run is queued and answered with a status page — it
          does not happen inside this request.
        </p>
      </header>

      <ModelledNote>{MODELLED_LONG}</ModelledNote>

      <form className="tw-form" onSubmit={onSubmit}>
        <label className="tw-field">
          <span className="tw-field__label">Strategy</span>
          <select
            className="tw-input"
            value={strategyId}
            required
            onChange={(e) => {
              setStrategyId(e.target.value as StrategyId)
              setTuning({})
              // The payload has changed, so the held idempotency key must not be reused with it —
              // that combination is a 409 `idempotency_key_reuse` (`trade/src/idempotency.ts:151`).
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
        </label>

        {strategy && (
          <p className="tw-field__note">
            <strong>{strategy.tagline}</strong>{' '}
            <span className="tw-field__weakness">{strategy.weakness}</span>
          </p>
        )}

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
            {available.map((s: SeriesRecord) => (
              <option key={s.id} value={s.id}>
                {s.symbol} · {s.timeframe} · {s.source}
              </option>
            ))}
          </select>
          {available.length === 0 && (
            <span className="tw-field__help">
              No series has bars yet. Publishing them is an operator action —{' '}
              <code className="cf-num">POST /v1/series</code> requires{' '}
              <code className="cf-num">trade:admin</code>, so there is nothing to do about it from
              here.
            </span>
          )}
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
                <span className="tw-field__help">
                  {spec.help} Outside {spec.min}–{spec.max} the service clamps it and says so in the
                  run’s notes.
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <fieldset className="tw-fieldset">
          <legend className="tw-fieldset__legend">What the run is charged</legend>
          <p className="tw-fieldset__note">
            These are not zero by default and they are not decoration: a rule that only clears its
            costs at zero cost does not clear them.
          </p>

          <label className="tw-field">
            <span className="tw-field__label">Starting cash (Shards)</span>
            <input
              className="tw-input cf-num"
              inputMode="numeric"
              pattern="[0-9]+"
              value={startCash}
              required
              onChange={(e) => {
                setStartCash(e.target.value)
                submit.reset()
              }}
            />
            <span className="tw-field__help">
              Whole Shards, sent as a decimal string. 100 Shards is one US dollar. Must be
              positive.
            </span>
          </label>

          <label className="tw-field">
            <span className="tw-field__label">Fee (basis points)</span>
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
              Charged on every fill. The service’s default is {DEFAULT_FEE_BPS} bps. Set it to 0 and
              the result stops being comparable with a paper bot, which is charged{' '}
              {DEFAULT_FEE_BPS}.
            </span>
          </label>

          <label className="tw-field">
            <span className="tw-field__label">Slippage (basis points)</span>
            <input
              className="tw-input cf-num"
              type="number"
              min={0}
              max={5000}
              step={1}
              value={slippageBps}
              onChange={(e) => {
                setSlippageBps(e.target.value)
                submit.reset()
              }}
            />
            <span className="tw-field__help">
              The price moves against you by this much on every fill. Default{' '}
              {DEFAULT_SLIPPAGE_BPS} bps.
            </span>
          </label>

          <label className="tw-field">
            <span className="tw-field__label">Seed</span>
            <input
              className="tw-input cf-num"
              type="number"
              min={0}
              max={4294967295}
              step={1}
              value={seed}
              onChange={(e) => {
                setSeed(e.target.value)
                submit.reset()
              }}
            />
            <span className="tw-field__help">
              Kept so the run can be reproduced exactly. The default is 0 rather than a random
              number, deliberately — an omitted seed that randomised would produce a run nobody
              could repeat.
            </span>
          </label>
        </fieldset>

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
            {submit.busy ? 'Queueing…' : 'Queue this backtest'}
          </button>
          <span className="tw-form__hint">
            This queues a run. It does not compute one — the next screen is where the answer
            arrives.
          </span>
        </div>
      </form>
    </section>
  )
}
