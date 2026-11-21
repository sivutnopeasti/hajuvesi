const NAV = [
  { href: '#map', label: 'Map' },
  { href: '#compare', label: 'Compare' },
  { href: '#formula', label: 'Formula' },
  { href: '#about', label: 'About' },
]

export function Header() {
  return (
    <header className="site-header">
      <div className="topbar">Development version</div>
      <div className="brand">
        <a href="#map" className="wordmark" aria-label="Hajuvesi, home">
          <span className="wordmark-main">HAJUVESI</span>
          <span className="wordmark-sub">MOLECULE MAP</span>
        </a>
        <nav aria-label="Main menu">
          <ul>
            {NAV.map((n, i) => (
              <li key={n.href}>
                <a href={n.href} className={i === 0 ? 'is-current' : ''}>
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  )
}
