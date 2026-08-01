/**
 * The page an unknown address renders — **under a real 404**.
 *
 * nginx enumerates this app's routes and lets everything else fall through to
 * `error_page 404 /index.html`, which serves this bundle while KEEPING the 404 status. The usual
 * `try_files $uri /index.html` would answer 200 for every address in existence, which makes "page
 * not found" a success: crawlers index it, uptime checks call it healthy, and a deploy that drops
 * a route looks exactly like a deploy that did not.
 *
 * So this component renders inside the shell, with the navigation intact, and says what happened
 * rather than pretending the address was fine.
 */
import { Link } from 'react-router-dom'
import { NAV } from '../lib/routes.ts'

export function NotFoundPage() {
  return (
    <section className="tw-page">
      <div className="wt-state wt-state--empty" role="status">
        <span className="wt-state__icon" aria-hidden="true">
          ◇
        </span>
        <p className="wt-state__title">There is nothing at this address</p>
        <p className="wt-state__hint">
          The server answered 404 for it, which is the truth — this is the app shell rendered
          underneath that status, not a page pretending the address exists.
        </p>
        <div className="wt-state__action">
          {NAV.map((item) => (
            <Link key={item.to} className="cf-btn" to={item.to}>
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
