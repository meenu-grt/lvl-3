import { useWallet } from './hooks/useWallet';
import { ConnectButton } from './components/ConnectButton';
import { StreakPanel } from './components/StreakPanel';
import './styles.css';

export function App() {
  const wallet = useWallet();

  return (
    <div className="app-shell">
      <div className="aurora" aria-hidden="true" />

      <header className="top-strip">
        <div className="brand-mark">
          <span className="brand-glyph">◆</span>
          <span className="brand-name">Focus Streak</span>
        </div>
        <div className="top-strip__right">
          {wallet.state === 'linked' && <span className="net-chip">Preprod</span>}
          <ConnectButton {...wallet} />
        </div>
      </header>

      <main className="stage">
        <section className="hero">
          <h1 className="hero__title">
            Prove the <em>session</em> happened.
            <br />
            Not how long it ran.
          </h1>
          <p className="hero__sub">
            Every check-in advances a public streak by exactly one, gated by a zero-knowledge proof that the
            session cleared a 15-minute minimum — without ever putting the real duration on-chain.
          </p>
        </section>

        {wallet.state === 'linked' && wallet.connectedAPI ? (
          <StreakPanel connectedAPI={wallet.connectedAPI} />
        ) : (
          <div className="glass-card glass-card--wide glass-card--center">
            <p>Link any Midnight-compatible wallet to deploy a streak or check in a session.</p>
          </div>
        )}
      </main>

      <footer className="foot-note">
        Built on Midnight. Session minutes are a private circuit input in <code>checkIn()</code> — only the streak
        counter moves on-chain.
      </footer>
    </div>
  );
}
