/**
 * The tooltip, built rather than borrowed — and built as a DISCLOSURE, not a `title` attribute.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * `@cloudsforge/ui` has no tooltip primitive. It has the bar, the footer, the consent banner, the
 * skip link and the tokens; the estate's other surfaces have never needed one, because none of them
 * has forty controls that each spend money. This one does, so the primitive is here.
 *
 * ── Why not `title=""`, which is one attribute and no code ────────────────────────────────────
 *
 * Because it reaches roughly nobody who needs it:
 *
 *   * it never appears on a touch device — there is no hover — and that is most readers;
 *   * it is not reachable by keyboard at all, in any browser;
 *   * it waits about a second and then vanishes on its own, so a long sentence cannot be read;
 *   * screen readers treat it inconsistently, and several ignore it when the element has any other
 *     accessible name.
 *
 * A control whose explanation is only available to a mouse user who knows to hover and wait is a
 * control that is not explained. The whole point of `src/lib/glossary.ts` is that somebody who has
 * never traded can operate this screen, and that person is exactly the one who will not know to
 * hover.
 *
 * ── What this is instead ──────────────────────────────────────────────────────────────────────
 *
 * A real button, in the tab order, with an accessible name of its own, that toggles a
 * `role="tooltip"` region referenced by `aria-describedby`. It also opens on hover and on focus,
 * because a mouse user should not have to click — but the click is what makes it reachable, and the
 * hover is the convenience rather than the mechanism.
 *
 * Escape closes it, per WCAG 2.2 SC 1.4.13 ("Content on Hover or Focus": dismissable, hoverable,
 * persistent). It is NOT dismissed by moving the pointer through it, so a reader can select the
 * text; and it never covers the control it describes.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { GLOSSARY, type Explanation, type GlossaryKey } from '../lib/glossary.ts'

/**
 * A term with its explanation attached.
 *
 * `children` overrides the printed word — the glossary's `term` is the canonical spelling, but a
 * column header often wants a shorter one, and the explanation is the same either way.
 */
export function Explain({ term, children }: { term: GlossaryKey; children?: ReactNode | undefined }) {
  return <Explained explanation={GLOSSARY[term]}>{children ?? GLOSSARY[term].term}</Explained>
}

/**
 * The same, for an explanation looked up at runtime.
 *
 * `explanationFor` answers null for a vocabulary member this bundle has never heard of — a
 * deployment ahead of this release — and this component renders the word alone in that case rather
 * than an empty bubble. A tooltip that opens on nothing teaches a reader that the tooltips are not
 * worth opening.
 */
export function Explained({
  explanation,
  children,
}: {
  explanation: Explanation | null
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const wrapper = useRef<HTMLSpanElement | null>(null)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    // Escape, at the document, because the bubble may have taken focus and the browser sends the
    // key to whatever holds it. SC 1.4.13 requires the dismissal to work without moving the
    // pointer, and a handler on the trigger alone does not.
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (explanation === null) return <span className="tw-explain">{children}</span>

  return (
    <span
      className="tw-explain"
      ref={wrapper}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={close}
      onBlur={(event) => {
        // Only when focus has left the whole construct: the bubble is inside it and may be
        // selected, and closing on the trigger's own blur would snatch the text away mid-read.
        const next = event.relatedTarget as Node | null
        if (!next || !wrapper.current?.contains(next)) close()
      }}
    >
      <span className="tw-explain__label">{children}</span>
      <button
        type="button"
        className="tw-explain__trigger"
        // The name is a question naming the TERM rather than the word "help", so a screen-reader
        // user hearing the button list knows which one belongs to which control. Thirty buttons all
        // called "help" is a list nobody can navigate.
        aria-label={`What does ${explanation.term} mean?`}
        aria-expanded={open}
        {...(open ? { 'aria-describedby': id } : {})}
        onClick={() => setOpen((was) => !was)}
        onFocus={() => setOpen(true)}
      >
        <span aria-hidden="true">?</span>
      </button>
      {open && (
        <span className="tw-explain__bubble" role="tooltip" id={id}>
          <strong className="tw-explain__term">{explanation.term}</strong>
          <span className="tw-explain__body">{explanation.plain}</span>
        </span>
      )}
    </span>
  )
}

/**
 * A block of explanation that is always visible, for the things too important to hide.
 *
 * The rule this keeps: anything that CHANGES WHAT AN ORDER DOES is explained in the open, and only
 * the vocabulary is behind a tooltip. A customer who never opens a single bubble must still be able
 * to place an order they understand.
 */
export function Note({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | undefined
  children: ReactNode
}) {
  return (
    <p className={`tw-note tw-note--${tone === 'warn' ? 'warn' : 'info'}`}>
      <span className="tw-note__icon" aria-hidden="true">
        {tone === 'warn' ? '▲' : 'ℹ'}
      </span>
      {children}
    </p>
  )
}
