const NAV = [
  { href: '#kartta', label: 'Kartta' },
  { href: '#vertailu', label: 'Vertailu' },
  { href: '#resepti', label: 'Resepti' },
  { href: '#tausta', label: 'Tausta' },
]

export function Header() {
  return (
    <header className="site-header">
      <div className="topbar">Kehitysversio</div>
      <div className="brand">
        <a href="#kartta" className="wordmark" aria-label="Hajuvesi, etusivu">
          <span className="wordmark-main">HAJUVESI</span>
          <span className="wordmark-sub">MOLEKYYLIKARTTA</span>
        </a>
        <nav aria-label="Päävalikko">
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
