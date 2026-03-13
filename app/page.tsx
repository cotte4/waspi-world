import Link from 'next/link';

export default function Home() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center"
      style={{ backgroundColor: '#0E0E14', fontFamily: '"Press Start 2P", monospace' }}
    >
      {/* Stars background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 80 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              width: i % 5 === 0 ? 2 : 1,
              height: i % 5 === 0 ? 2 : 1,
              left: `${(i * 137) % 100}%`,
              top: `${(i * 97) % 100}%`,
              opacity: 0.3 + (i % 4) * 0.1,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8 text-center px-6">
        {/* Logo */}
        <div>
          <h1
            className="text-5xl md:text-6xl font-bold mb-2"
            style={{ color: '#FFFFFF', letterSpacing: '0.05em' }}
          >
            WASPI
          </h1>
          <h2
            className="text-4xl md:text-5xl font-bold"
            style={{ color: '#F5C842', letterSpacing: '0.1em' }}
          >
            WORLD
          </h2>
        </div>

        {/* Tagline */}
        <p
          className="text-xs leading-7 max-w-sm"
          style={{ color: '#666688' }}
        >
          Mundo Abierto · Chat Social<br />
          Avatar + Clothing · E-commerce Real
        </p>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2 max-w-xs">
          {['2D OPEN WORLD', 'SOCIAL CHAT', 'STREETWEAR', 'TENKS'].map(tag => (
            <span
              key={tag}
              className="px-2 py-1 text-xs"
              style={{
                border: '1px solid rgba(245,200,66,0.3)',
                color: '#888899',
                fontSize: '7px',
              }}
            >
              {tag}
            </span>
          ))}
        </div>

        {/* CTA button */}
        <Link
          href="/play"
          className="enter-btn px-10 py-4 transition-colors duration-200"
          style={{
            background: '#F5C842',
            color: '#0E0E14',
            fontSize: '11px',
            letterSpacing: '0.1em',
            display: 'inline-block',
          }}
        >
          ▶ ENTRAR AL MUNDO
        </Link>

        {/* Sub info */}
        <p style={{ color: '#333344', fontSize: '7px' }}>
          WASD para moverse · ENTER para chatear
        </p>
      </div>
    </main>
  );
}
