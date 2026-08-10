/**
 * What the exchange is holding for you, what is tied up, and how to move money in and out.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * ── `outcome` is the answer to "did my money move", and it is NOT the HTTP status ─────────────
 *
 * `POST /v1/exchange/transfers` commits the idempotency claim first and calls the ledger
 * afterwards, so a transfer can come back **`unresolved`**: the debit stands, a job will ask the
 * ledger again, and the customer must not be told either "done" or "it failed" when neither is
 * known (`trade/src/server.ts`, `trade/src/transfers.ts`). This screen renders all four
 * outcomes as themselves, and `unresolved` gets the longest sentence of the four because it is the
 * one nobody has a mental model for.
 *
 * Retrying under the same key is also the RECOVERY path: the stored response is the transfer id
 * alone, so a replay reads the CURRENT state and settles a transfer that a crash left pending.
 * `useIdempotentMutation` keeps the key exactly when the outcome is unknown, which is what makes
 * pressing the button again the right thing to do rather than a second withdrawal.
 *
 * ── Where the decimals come from ──────────────────────────────────────────────────────────────
 *
 * A balance carries an asset and an integer of minor units; it does not carry the decimals
 * (`balanceView`, `trade/src/server.ts`). The market list does — every market names its base and
 * quote asset and each one's decimals — so the scale is derived from there. An asset that appears
 * in no market is printed VERBATIM, in minor units, and labelled as such. That is the estate's rule
 * about money it cannot render: print no digit you cannot stand behind.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useState, type FormEvent } from 'react'
import { Empty, Failed, Forbidden, Loading } from '../components/states.tsx'
import { StateBadge } from '../components/tone.tsx'
import { Explain, Explained, Note } from '../components/tooltip.tsx'
import {
  createTransfer,
  listBalances,
  listMarkets,
  listTransfers,
  type Market,
  type Transfer,
  type TransferDirection,
} from '../lib/exchange.ts'
import { timestamp, transferTone } from '../lib/format.ts'
import { TRANSFER_STATUS_TERMS, explanationFor } from '../lib/glossary.ts'
import { useIdempotentMutation } from '../lib/mutation.ts'
import { OrderBookGate, useOrderBook } from '../lib/orderbook.tsx'
import { useResource } from '../lib/resource.ts'
import { parseUnits, units } from '../lib/units.ts'

export function BalancesPage() {
  const gate = useOrderBook()
  return (
    <section className="tw-page">
      <header className="tw-page__head">
        <h1 className="tw-page__title">Your exchange balances</h1>
      </header>
      <OrderBookGate state={gate}>{() => <Custody />}</OrderBookGate>
    </section>
  )
}

/** Asset code to decimals, from every market this exchange runs. A miss means "we do not know". */
function decimalsByAsset(markets: readonly Market[]): Record<string, number> {
  const table: Record<string, number> = {}
  for (const market of markets) {
    table[market.baseAsset] = market.baseDecimals
    table[market.quoteAsset] = market.quoteDecimals
  }
  return table
}

function Custody() {
  const markets = useResource(
    (signal) => listMarkets(signal),
    (data) => data.markets.length,
    'We could not read the markets, so amounts below are shown in minor units.',
  )
  const balances = useResource(
    (signal) => listBalances(signal),
    (data) => data.balances.length,
    'We could not read your balances.',
  )
  const transfers = useResource(
    (signal) => listTransfers(50, signal),
    (data) => data.transfers.length,
    'We could not read your transfers.',
  )

  const decimals = decimalsByAsset(markets.data?.markets ?? [])
  const assets = Object.keys(decimals).sort()

  return (
    <>
      <Note>
        Money on the exchange is separate from money in your account: it has to be moved in before
        it can trade and moved out to leave. What is{' '}
        <Explain term="balance_held">held</Explain> is committed to orders you have already placed
        — it is still yours, and you cannot spend it twice.
      </Note>

      {balances.state === 'loading' && <Loading label="Reading your balances" />}
      {balances.state === 'forbidden' && <Forbidden notice={balances.error ?? undefined} />}
      {balances.error && balances.state !== 'forbidden' && (
        <Failed
          notice={balances.error}
          onRetry={balances.reload}
          title="We could not read your balances"
        />
      )}
      {balances.state === 'empty' && (
        <Empty
          title="The exchange is holding nothing for you"
          hint="Nothing is wrong: a balance appears the first time you move something in. Until then there is nothing to trade with."
        />
      )}
      {balances.state === 'ok' && balances.data && (
        <div className="tw-scroll">
          <table className="tw-table tw-table--balances">
            <caption className="tw-table__caption">
              <Explain term="balance_available">Available</Explain> is what you can spend right
              now. <Explain term="balance_held">Held</Explain> is committed to open orders.{' '}
              <Explain term="balance_total">Total</Explain> is the two added up by the service, so
              every client shows the same figure.
            </caption>
            <thead>
              <tr>
                <th scope="col">Asset</th>
                <th scope="col">Available</th>
                <th scope="col">Held</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {balances.data.balances.map((balance) => {
                const places = decimals[balance.asset]
                return (
                  <tr key={balance.asset}>
                    <th scope="row">
                      {balance.asset}
                      {places === undefined && (
                        <span className="tw-dim"> (minor units — no market prices this asset)</span>
                      )}
                    </th>
                    <td className="cf-num">{show(balance.available, places)}</td>
                    <td className="cf-num">{show(balance.held, places)}</td>
                    <td className="cf-num">{show(balance.total, places)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <TransferForm
        assets={assets}
        decimals={decimals}
        onDone={() => {
          balances.reload()
          transfers.reload()
        }}
      />

      <section className="tw-section" aria-labelledby="transfers-heading">
        <h2 id="transfers-heading" className="tw-section__title">
          Money in and out
        </h2>
        {transfers.state === 'loading' && <Loading label="Reading your transfers" />}
        {transfers.state === 'forbidden' && <Forbidden notice={transfers.error ?? undefined} />}
        {transfers.error && transfers.state !== 'forbidden' && (
          <Failed
            notice={transfers.error}
            onRetry={transfers.reload}
            title="We could not read your transfers"
          />
        )}
        {transfers.state === 'empty' && (
          <Empty
            title="You have not moved anything yet"
            hint="Every move in or out is recorded here with the outcome the ledger gave it, including the ones that are still being worked out."
          />
        )}
        {transfers.state === 'ok' && transfers.data && (
          <div className="tw-scroll">
            <table className="tw-table tw-table--transfers">
              <caption className="tw-table__caption">
                Newest first. A transfer that is still{' '}
                <Explain term="transfer_unresolved">unresolved</Explain> has not been given an
                answer by the ledger yet; it is not lost, and it is not a failure.
              </caption>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Direction</th>
                  <th scope="col">Asset</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Ledger entry</th>
                </tr>
              </thead>
              <tbody>
                {transfers.data.transfers.map((transfer) => (
                  <TransferRow
                    key={transfer.id}
                    transfer={transfer}
                    places={decimals[transfer.asset]}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

function TransferRow({ transfer, places }: { transfer: Transfer; places: number | undefined }) {
  return (
    <>
      <tr>
        <th scope="row">{timestamp(transfer.createdAt)}</th>
        <td>
          <Explain term={transfer.direction === 'deposit' ? 'transfer_in' : 'transfer_out'} />
        </td>
        <td>{transfer.asset}</td>
        <td className="cf-num">{show(transfer.amount, places)}</td>
        <td>
          <Explained explanation={explanationFor(TRANSFER_STATUS_TERMS, transfer.status)}>
            <StateBadge tone={transferTone(transfer.status)} />
          </Explained>
        </td>
        <td>
          {transfer.entryId === null ? (
            <span className="tw-absent">none yet</span>
          ) : (
            <code className="cf-num">{transfer.entryId.slice(0, 8)}</code>
          )}
        </td>
      </tr>
      {transfer.error !== null && (
        <tr>
          <td colSpan={6}>
            {/* The ledger's own words. This is the only account of why a transfer was refused, and
                a paraphrase of it would be a second one. */}
            <p className="tw-error" role="status">
              {transfer.error}
            </p>
          </td>
        </tr>
      )}
    </>
  )
}

function TransferForm({
  assets,
  decimals,
  onDone,
}: {
  assets: readonly string[]
  decimals: Record<string, number>
  onDone: () => void
}) {
  const [direction, setDirection] = useState<TransferDirection>('deposit')
  // Empty until the reader picks one, and DERIVED rather than seeded, because the asset list
  // arrives after the first render — a `useState(assets[0])` would be stuck on '' forever and the
  // select would show a blank option bound to a value it does not have.
  const [picked, setAsset] = useState('')
  const [amount, setAmount] = useState('')
  const asset = picked === '' ? (assets[0] ?? '') : picked

  const submit = useIdempotentMutation(createTransfer, 'The transfer could not be made.')
  const places = decimals[asset]

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    // Parsed against THIS asset's decimals when they are known; sent as typed when they are not, so
    // the service refuses it in its own words rather than this form guessing a scale.
    const minor = places === undefined ? null : parseUnits(amount, places)
    const done = await submit.run({
      direction,
      asset: asset.trim().toUpperCase(),
      amount: minor === null ? amount.trim() : minor.toString(),
    })
    if (done) onDone()
  }

  return (
    <form className="tw-form tw-transfer" onSubmit={onSubmit}>
      <h2 className="tw-section__title">Move money</h2>

      <fieldset className="tw-fieldset">
        <legend className="tw-fieldset__legend">Which way</legend>
        <label className="tw-radio">
          <input
            type="radio"
            name="direction"
            checked={direction === 'deposit'}
            onChange={() => {
              setDirection('deposit')
              submit.reset()
            }}
          />
          <span>
            <strong>
              <Explain term="transfer_in">In</Explain>
            </strong>{' '}
            Move money from your account onto the exchange so it can trade.
          </span>
        </label>
        <label className="tw-radio">
          <input
            type="radio"
            name="direction"
            checked={direction === 'withdrawal'}
            onChange={() => {
              setDirection('withdrawal')
              submit.reset()
            }}
          />
          <span>
            <strong>
              <Explain term="transfer_out">Out</Explain>
            </strong>{' '}
            Take money off the exchange. Only what is available moves — anything held by an open
            order stays until that order is done or cancelled.
          </span>
        </label>
      </fieldset>

      <label className="tw-field">
        <span className="tw-field__label">Asset</span>
        {assets.length > 0 ? (
          <select
            className="cf-input"
            value={asset}
            onChange={(e) => {
              setAsset(e.target.value)
              submit.reset()
            }}
          >
            {assets.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="cf-input"
            value={asset}
            required
            onChange={(e) => {
              setAsset(e.target.value)
              submit.reset()
            }}
          />
        )}
        <span className="tw-field__help">
          {assets.length > 0
            ? 'Every asset this exchange runs a market in.'
            : 'No market names an asset yet, so type the code the ledger uses.'}
        </span>
      </label>

      <label className="tw-field">
        <span className="tw-field__label">Amount</span>
        <input
          className="cf-input cf-num"
          inputMode="decimal"
          required
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value)
            submit.reset()
          }}
        />
        <span className="tw-field__help">
          {places === undefined ? (
            <>
              In <Explain term="minor_units">minor units</Explain>, as a whole number — nothing here
              knows how many decimal places {asset || 'this asset'} has.
            </>
          ) : (
            <>
              Up to {places} decimal place{places === 1 ? '' : 's'}. More than that is refused
              rather than rounded: a rounded amount is not the amount you asked for.
            </>
          )}
        </span>
      </label>

      {submit.error && (
        <p className="tw-error" role="alert">
          {submit.error.message}
          {submit.error.requestId && (
            <>
              {' '}
              Quote this to support: <code className="cf-num tw-reqid">{submit.error.requestId}</code>
            </>
          )}
        </p>
      )}

      {submit.result && <Outcome result={submit.result} places={places} />}

      <div className="tw-form__actions">
        <button className="cf-btn cf-btn--primary" type="submit" disabled={submit.busy}>
          {submit.busy ? 'Moving…' : direction === 'deposit' ? 'Move it in' : 'Move it out'}
        </button>
        <span className="tw-form__hint">
          This moves real money between your account and the exchange.
        </span>
      </div>
    </form>
  )
}

/** All four outcomes, as themselves. `unresolved` gets the most words because it deserves them. */
function Outcome({
  result,
  places,
}: {
  result: { transfer: Transfer; outcome: string }
  places: number | undefined
}) {
  const { transfer, outcome } = result
  return (
    <div className="tw-receipt" role="status">
      <p className="tw-receipt__lead">
        <strong>{outcomeWord(outcome)}</strong> {show(transfer.amount, places)} {transfer.asset}.
      </p>
      {outcome === 'unresolved' && (
        <p className="tw-receipt__body">
          The ledger has not told us yet whether this went through. Your side of it stands and a job
          will ask again. Pressing the button once more is safe and is the right thing to do: it
          replays the same request rather than making a second one, and it will report whatever the
          answer turns out to be.
        </p>
      )}
      {outcome === 'pending' && (
        <p className="tw-receipt__body">
          Accepted and not settled yet. It will appear in the list below either way.
        </p>
      )}
      {transfer.error !== null && <p className="tw-receipt__body">{transfer.error}</p>}
    </div>
  )
}

function outcomeWord(outcome: string): string {
  if (outcome === 'settled') return 'Done.'
  if (outcome === 'pending') return 'Accepted.'
  if (outcome === 'refused') return 'Refused —'
  if (outcome === 'unresolved') return 'We do not know yet:'
  return 'Sent:'
}

/** An amount with this asset's decimals, or verbatim in minor units when they are unknown. */
function show(value: string, places: number | undefined): string {
  return places === undefined ? value : units(value, places)
}
