import Link from 'next/link';

const FEATURES = [
  {
    icon: '🗺️',
    title: 'OPEN WORLD',
    desc: 'Zonas, vecindad, bosque y secretos por descubrir',
    color: '#46B3FF',
    border: 'rgba(70,179,255,0.3)',
  },
  {
    icon: '💬',
    title: 'CHAT SOCIAL',
    desc: 'Hablá con otros jugadores en tiempo real',
    color: '#39FF14',
    border: 'rgba(57,255,20,0.3)',
  },
  {
    icon: '👟',
    title: 'STREETWEAR',
    desc: 'Comprá ropa física real con tus TENKS ganados',
    color: '#F5C842',
    border: 'rgba(245,200,66,0.3)',
  },
  {
    icon: '⚔️',
    title: 'MINIJUEGOS',
    desc: 'Zombies, pesca, minería, skills y progresión',
    color: '#FF6B35',
    border: 'rgba(255,107,53,0.3)',
  },
];

const STEPS = [
  { n: '01', label: 'CREÁ TU AVATAR', color: '#F5C842' },
  { n: '02', label: 'EXPLORÁ EL MUNDO', color: '#46B3FF' },
  { n: '03', label: 'COMPRÁ ROPA REAL', color: '#39FF14' },
];

export default function Home() {
  return (
    <>
      <style>{`
        @keyframes worldGlow {
          0%,100% { color:#F5C842; text-shadow:0 0 20px #F5C842aa,0 0 40px #F5C84255; }
          45%      { color:#FFa020; text-shadow:0 0 28px #FFa020cc,0 0 60px #FFa02044; }
        }
        @keyframes ctaPulse {
          0%,100% { box-shadow:0 0 18px #F5C84266,0 0 40px #F5C84222; }
          50%      { box-shadow:0 0 30px #F5C842aa,0 0 60px #F5C84255; }
        }
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(12px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes gridPulse {
          0%,100% { opacity:0.5; }
          50%     { opacity:0.8; }
        }
        @keyframes arrowBounce {
          0%,100% { transform:translateX(0); }
          50%     { transform:translateX(4px); }
        }
        .wl-logo-waspi {
          font-size:clamp(2rem,6vw,3.6rem);
          color:#fff;
          letter-spacing:.12em;
          line-height:1;
          text-shadow:0 0 30px rgba(255,255,255,.1);
          animation:fadeUp .5s ease both;
        }
        .wl-logo-world {
          font-size:clamp(1.6rem,5vw,3rem);
          letter-spacing:.18em;
          line-height:1.1;
          animation:worldGlow 3.5s ease-in-out infinite, fadeUp .5s .1s ease both;
        }
        .wl-tagline {
          margin-top:10px;
          font-size:7px;
          color:#555566;
          letter-spacing:.08em;
          line-height:2;
          animation:fadeUp .5s .15s ease both;
        }
        .wl-features {
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:10px;
          width:100%;
          max-width:680px;
          animation:fadeUp .5s .2s ease both;
        }
        .wl-card {
          display:flex;
          flex-direction:column;
          gap:6px;
          padding:14px 16px;
          background:rgba(255,255,255,.025);
          transition:background .2s, border-color .2s;
        }
        .wl-card:hover { background:rgba(255,255,255,.05); }
        .wl-card-icon  { font-size:18px; line-height:1; }
        .wl-card-title { font-size:8px; letter-spacing:.06em; }
        .wl-card-desc  { font-size:6px; color:#55556a; line-height:1.9; }
        .wl-steps {
          display:flex;
          align-items:center;
          gap:10px;
          flex-wrap:wrap;
          justify-content:center;
          animation:fadeUp .5s .3s ease both;
        }
        .wl-step { display:flex; align-items:center; gap:8px; }
        .wl-step-n {
          display:inline-flex; align-items:center; justify-content:center;
          width:28px; height:28px; font-size:6px;
          border:1px solid; flex-shrink:0;
        }
        .wl-step-label { font-size:6px; color:#7777aa; letter-spacing:.05em; white-space:nowrap; }
        .wl-step-arrow { font-size:10px; color:#333344; margin:0 2px; }
        .wl-cta {
          display:inline-flex; align-items:center; gap:10px;
          padding:16px 36px;
          background:#F5C842; color:#0E0E14;
          font-family:'Press Start 2P',monospace;
          font-size:11px; letter-spacing:.1em; text-decoration:none;
          animation:fadeUp .5s .4s ease both, ctaPulse 2.5s 1s ease-in-out infinite;
          transition:transform .15s, filter .15s;
        }
        .wl-cta:hover { transform:scale(1.04); filter:brightness(1.15); }
        .wl-cta-arrow { display:inline-block; animation:arrowBounce 1.2s ease-in-out infinite; }
        .wl-footer {
          font-size:6px; color:#282838; letter-spacing:.08em; text-align:center;
          animation:fadeUp .5s .5s ease both;
        }
        .wl-grid {
          position:fixed; inset:0; pointer-events:none; z-index:0;
          background-image:
            linear-gradient(rgba(245,200,66,.035) 1px,transparent 1px),
            linear-gradient(90deg,rgba(245,200,66,.035) 1px,transparent 1px);
          background-size:40px 40px;
          animation:gridPulse 7s ease-in-out infinite;
        }
        .wl-radial {
          position:fixed; inset:0; pointer-events:none; z-index:0;
          background:radial-gradient(ellipse 60% 55% at 50% 50%,
            rgba(245,200,66,.07) 0%,
            rgba(70,179,255,.03) 45%,
            transparent 70%);
        }
        .wl-scanlines {
          position:fixed; inset:0; pointer-events:none; z-index:1;
          background:repeating-linear-gradient(
            0deg, transparent, transparent 3px,
            rgba(0,0,0,.15) 3px, rgba(0,0,0,.15) 4px);
        }
        @media (max-width:520px) {
          .wl-features { grid-template-columns:1fr; }
          .wl-steps { flex-direction:column; align-items:flex-start; }
          .wl-step-arrow { display:none; }
        }
      `}</style>

      <div className="wl-grid" />
      <div className="wl-radial" />
      <div className="wl-scanlines" />

      <main style={{
        position: 'relative',
        zIndex: 2,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"Press Start 2P", monospace',
        backgroundColor: '#0E0E14',
        padding: '32px 24px',
        gap: '28px',
        overflowY: 'auto',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center' }}>
          <div className="wl-logo-waspi">WASPI</div>
          <div className="wl-logo-world">WORLD</div>
          <p className="wl-tagline">MUNDO ABIERTO 2D&nbsp;·&nbsp;STREETWEAR&nbsp;·&nbsp;SOCIAL</p>
        </div>

        {/* Feature cards */}
        <div className="wl-features">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="wl-card"
              style={{ border: `1px solid ${f.border}` }}
            >
              <span className="wl-card-icon">{f.icon}</span>
              <span className="wl-card-title" style={{ color: f.color }}>{f.title}</span>
              <span className="wl-card-desc">{f.desc}</span>
            </div>
          ))}
        </div>

        {/* Steps */}
        <div className="wl-steps">
          {STEPS.map((s, i) => (
            <div key={s.n} className="wl-step">
              <span
                className="wl-step-n"
                style={{ color: s.color, borderColor: s.color + '55' }}
              >
                {s.n}
              </span>
              <span className="wl-step-label">{s.label}</span>
              {i < STEPS.length - 1 && <span className="wl-step-arrow">→</span>}
            </div>
          ))}
        </div>

        {/* CTA */}
        <Link href="/play" className="wl-cta">
          <span className="wl-cta-arrow">▶</span> ENTRAR AL MUNDO
        </Link>

        {/* Footer hint */}
        <p className="wl-footer">
          WASD MOVERSE&nbsp;&nbsp;·&nbsp;&nbsp;ENTER CHATEAR&nbsp;&nbsp;·&nbsp;&nbsp;T SKILLS
        </p>
      </main>
    </>
  );
}
