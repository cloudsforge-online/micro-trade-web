/**
 * A state, rendered as a word, a glyph and a tone — in that order of importance.
 *
 * The word is never optional and the glyph is never the only non-colour channel. The estate's
 * reserved status hues sit ΔE 4.6 apart under protanopia, measured in micro-ui, which is why
 * status-web encodes every day three times. A badge that said what it meant only by being amber
 * would say nothing at all to a reader who cannot separate it from the green one.
 */
import type { ReactNode } from 'react'
import type { Tone } from '../lib/format.ts'
import { MODELLED } from '../lib/format.ts'

export function StateBadge({ tone, title }: { tone: Tone; title?: string | undefined }) {
  return (
    <span className={`tw-badge tw-badge--${tone.tone}`} title={title ?? tone.meaning}>
      <span className="tw-badge__glyph" aria-hidden="true">
        {tone.glyph}
      </span>
      <span className="tw-badge__word">{tone.word}</span>
    </span>
  )
}

/** A label and its value, as a definition pair. The value may be a node — a badge, a link. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="tw-fact">
      <dt className="tw-fact__label">{label}</dt>
      <dd className="tw-fact__value">{children}</dd>
    </div>
  )
}

/**
 * A value that may be absent, where absence is a real answer rather than a rendering problem.
 *
 * `missing` is the SENTENCE, not a dash. A backtest that has not completed has `metrics: null`
 * (`trade/src/backtests.ts:222` writes the column only on the `complete` branch), and rendering
 * that as a row of zeros would be a claim about a run that has not happened.
 */
export function Maybe({ value, missing }: { value: string | null; missing: string }) {
  if (value === null || value.length === 0) {
    return <span className="tw-absent">{missing}</span>
  }
  return <span className="cf-num">{value}</span>
}

/**
 * The label every modelled figure wears.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THIS IS NOT DECORATION AND IT IS NOT A DISCLAIMER IN A FOOTER.
 *
 * A backtest is a simulation over bars that have already happened. It is charged the fee and the
 * slippage the run was configured with — `trade/src/server.ts:487-488` defaults them to 10 and 5
 * basis points rather than to zero, because "a strategy that only works for free does not work" —
 * and it still describes only the past.
 *
 * So the label goes NEXT TO THE NUMBERS, on every surface that prints one, at the top of the block
 * rather than under it. `test/render.test.ts` requires `MODELLED` on every page that renders a
 * metric, and requires that no page puts a modelled figure next to a future tense.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
export function ModelledNote({ children }: { children?: ReactNode }) {
  return (
    <p className="tw-modelled" role="note">
      <span className="tw-modelled__flag" aria-hidden="true">
        ◐
      </span>
      <strong className="tw-modelled__lead">{MODELLED}</strong>{' '}
      {children}
    </p>
  )
}

/** The same, inline, for a table caption or a single figure. */
export function ModelledTag() {
  return <span className="tw-modelled-tag">{MODELLED}</span>
}
