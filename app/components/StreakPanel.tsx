/**
 * StreakPanel.tsx — deploy/join a streak contract, check in a completed
 * focus session (private duration), log minutes publicly on purpose (for
 * contrast), reset the streak, and show the live public counters.
 *
 * PRIVACY-CRITICAL DETAIL: the minutes typed into the "Check In" field are
 * a PRIVATE circuit input. They are used only to generate the proof
 * locally in the browser and are deliberately cleared from component
 * state right after submission so they are never rendered back, logged,
 * or included in any result view — only the streak counter (a fixed +1)
 * changes on-chain. The "Log Minutes" field is the deliberate opposite:
 * whatever is typed there IS sent on-chain, on purpose, to show the
 * contrast with disclose().
 */
import { useState } from 'react';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import {
  checkIn,
  deployStreak,
  joinStreak,
  logMinutes,
  readStreakState,
  resetStreak,
  type StreakState,
} from '../chain/contract';

type Phase = 'idle' | 'deploying' | 'joining' | 'working' | 'confirmed' | 'failed';
type LastAction = 'checkin' | 'log' | 'reset' | null;

interface Props {
  connectedAPI: ConnectedAPI;
}

function friendlyError(e: any): string {
  const raw = String(e?.message ?? e ?? 'Unknown error');
  if (/not enough dust/i.test(raw)) {
    return 'Not enough tDUST to pay the transaction fee. Open your wallet, generate tDUST, then try again.';
  }
  if (/rejected/i.test(raw)) return 'Request was rejected in your wallet.';
  if (/timed out/i.test(raw)) return `${raw}. The transaction may still land — refresh in a moment.`;
  if (/proof server|proving/i.test(raw)) {
    return 'Proof generation failed. Check that your wallet is pointed at a running local proof server (http://127.0.0.1:6300).';
  }
  if (/failed to fetch|networkerror/i.test(raw)) {
    return 'Network request failed. Check your connection and that the indexer is reachable, then retry.';
  }
  if (/at least 15 minutes/i.test(raw)) {
    return 'That session was too short to count — the contract requires at least 15 minutes, proven without revealing the exact amount.';
  }
  return raw;
}

export function StreakPanel({ connectedAPI }: Props) {
  const [contractAddress, setContractAddress] = useState<string | null>(null);
  const [addressInput, setAddressInput] = useState('');
  const [deployedContract, setDeployedContract] = useState<any>(null);
  const [streak, setStreak] = useState<StreakState | null>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [lastAction, setLastAction] = useState<LastAction>(null);
  const [txId, setTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sessionMinutes, setSessionMinutes] = useState('20');
  const [logInput, setLogInput] = useState('30');

  const busy = phase === 'deploying' || phase === 'joining' || phase === 'working';

  const refresh = async (address: string) => {
    try {
      setStreak(await readStreakState(connectedAPI, address));
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const handleDeploy = async () => {
    setError(null);
    setPhase('deploying');
    try {
      const contract = await deployStreak(connectedAPI);
      const address = contract.deployTxData.public.contractAddress;
      setDeployedContract(contract);
      setContractAddress(address);
      setStreak({ streakCount: 0n, totalMinutesLogged: 0n });
      setPhase('idle');
    } catch (e) {
      setPhase('failed');
      setError(friendlyError(e));
    }
  };

  const handleJoin = async () => {
    const address = addressInput.trim();
    if (!address) {
      setError('Enter a contract address to link to.');
      return;
    }
    setError(null);
    setPhase('joining');
    try {
      const contract = await joinStreak(connectedAPI, address);
      setDeployedContract(contract);
      setContractAddress(address);
      await refresh(address);
      setPhase('idle');
    } catch (e) {
      setPhase('failed');
      setError(friendlyError(e));
    }
  };

  const handleCheckIn = async () => {
    if (!deployedContract) return;
    const minutes = BigInt(sessionMinutes || '0');
    if (minutes <= 0n) {
      setError('Enter a session length greater than zero.');
      return;
    }
    setError(null);
    setPhase('working');
    setLastAction('checkin');
    setTxId(null);
    try {
      const result = await checkIn(deployedContract, minutes);
      setTxId(result.txId);
      setPhase('confirmed');
      // Clear the private session length immediately — it has served its
      // purpose as a proof input and must not linger in UI state.
      setSessionMinutes('20');
      if (contractAddress) await refresh(contractAddress);
    } catch (e) {
      setPhase('failed');
      setError(friendlyError(e));
    }
  };

  const handleLogMinutes = async () => {
    if (!deployedContract) return;
    const minutes = BigInt(logInput || '0');
    if (minutes <= 0n) {
      setError('Enter a minute amount greater than zero.');
      return;
    }
    setError(null);
    setPhase('working');
    setLastAction('log');
    setTxId(null);
    try {
      const result = await logMinutes(deployedContract, minutes);
      setTxId(result.txId);
      setPhase('confirmed');
      if (contractAddress) await refresh(contractAddress);
    } catch (e) {
      setPhase('failed');
      setError(friendlyError(e));
    }
  };

  const handleReset = async () => {
    if (!deployedContract) return;
    setError(null);
    setPhase('working');
    setLastAction('reset');
    setTxId(null);
    try {
      const result = await resetStreak(deployedContract);
      setTxId(result.txId);
      setPhase('confirmed');
      if (contractAddress) await refresh(contractAddress);
    } catch (e) {
      setPhase('failed');
      setError(friendlyError(e));
    }
  };

  if (!deployedContract) {
    return (
      <div className="glass-card glass-card--wide">
        <h2 className="glass-card__title">Start a Streak</h2>
        <p className="glass-card__sub">
          Deploy a fresh streak contract, or link to one that already exists by address.
        </p>

        <button onClick={handleDeploy} disabled={busy} className="glow-btn glow-btn--full">
          {phase === 'deploying' ? <><span className="ring-spin" aria-hidden="true" /> Deploying…</> : 'Deploy New Streak'}
        </button>

        <div className="divider">
          <span>or</span>
        </div>

        <div className="field-row">
          <input
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            placeholder="Paste a contract address"
            className="glass-input"
            autoComplete="off"
            spellCheck={false}
          />
          <button onClick={handleJoin} disabled={busy} className="ghost-btn">
            {phase === 'joining' ? <span className="ring-spin" aria-hidden="true" /> : 'Link'}
          </button>
        </div>

        {error && (
          <p className="error-banner" role="alert" aria-live="assertive">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="panel-grid">
      <div className="glass-card glass-card--stat">
        <span className="stat-orb" aria-hidden="true">
          🔥
        </span>
        <span className="stat-number">{streak ? streak.streakCount.toString() : '—'}</span>
        <span className="stat-caption">Focus streak</span>
        <span className="stat-footnote">Each qualifying session adds exactly +1 — never the minute count</span>
      </div>

      <div className="glass-card glass-card--stat">
        <span className="stat-orb" aria-hidden="true">
          📖
        </span>
        <span className="stat-number">{streak ? streak.totalMinutesLogged.toString() : '—'}</span>
        <span className="stat-caption">Minutes logged publicly</span>
        <span className="stat-footnote">Only counts minutes you deliberately disclosed via "Log Minutes"</span>
      </div>

      <div className="glass-card glass-card--wide">
        <p className="glass-card__addr" title={contractAddress ?? ''}>
          {contractAddress}
        </p>

        <div className="action-block action-block--private">
          <span className="action-tag action-tag--private">Private input</span>
          <label htmlFor="session-minutes" className="action-label">
            Check in a focus session (must run ≥ 15 minutes to count)
          </label>
          <div className="field-row">
            <input
              id="session-minutes"
              type="number"
              min="1"
              value={sessionMinutes}
              onChange={(e) => setSessionMinutes(e.target.value)}
              className="glass-input"
              aria-label="Session length in minutes"
            />
            <button onClick={handleCheckIn} disabled={busy || !sessionMinutes} className="glow-btn">
              {phase === 'working' && lastAction === 'checkin' ? (
                <span className="ring-spin" aria-hidden="true" />
              ) : (
                'Check In'
              )}
            </button>
          </div>
          <p className="action-note">
            The number you type never leaves your browser except inside a zero-knowledge proof. The chain learns
            only that the streak advanced by exactly one — not how long the session actually was.
          </p>
        </div>

        <div className="action-block action-block--public">
          <span className="action-tag action-tag--public">Deliberately public</span>
          <label htmlFor="log-minutes" className="action-label">
            Log minutes publicly (e.g. for a leaderboard) — this value IS disclosed on-chain
          </label>
          <div className="field-row">
            <input
              id="log-minutes"
              type="number"
              min="1"
              value={logInput}
              onChange={(e) => setLogInput(e.target.value)}
              className="glass-input"
              aria-label="Minutes to log publicly"
            />
            <button onClick={handleLogMinutes} disabled={busy || !logInput} className="ghost-btn ghost-btn--accent">
              {phase === 'working' && lastAction === 'log' ? <span className="ring-spin" aria-hidden="true" /> : 'Log Minutes'}
            </button>
          </div>
          <p className="action-note">
            Unlike Check In, this circuit calls <code>disclose()</code> on purpose — the exact number you enter is
            written to the public ledger, by design, to contrast with the private path above.
          </p>
        </div>

        <div className="field-row field-row--end">
          <button onClick={handleReset} disabled={busy} className="ghost-btn">
            {phase === 'working' && lastAction === 'reset' ? <span className="ring-spin" aria-hidden="true" /> : 'Reset Streak'}
          </button>
          <button onClick={() => contractAddress && refresh(contractAddress)} disabled={busy} className="ghost-btn">
            Refresh
          </button>
        </div>

        {phase === 'working' && (
          <p className="status-line status-line--working" role="status" aria-live="polite">
            Building a zero-knowledge proof locally, then waiting for confirmation…
          </p>
        )}
        {phase === 'confirmed' && txId && (
          <p className="status-line status-line--ok" title={txId} role="status" aria-live="polite">
            Confirmed · tx {txId.slice(0, 10)}···{txId.slice(-6)}
          </p>
        )}
        {error && (
          <p className="error-banner" role="alert" aria-live="assertive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
