/**
 * ConnectButton.tsx — wallet connect/disconnect control.
 *
 * Shows a "Link Wallet" pill when disconnected, a spinner while linking,
 * the connected address plus an unlink control when linked, and a retry
 * affordance on failure.
 */
import type { UseWalletResult } from '../hooks/useWallet';

function truncateAddress(address: string): string {
  if (address.length <= 18) return address;
  return `${address.slice(0, 8)}···${address.slice(-6)}`;
}

export function ConnectButton({ state, address, error, link, unlink }: UseWalletResult) {
  if (state === 'linked' && address) {
    return (
      <div className="wallet-pill wallet-pill--linked">
        <span className="wallet-pulse" aria-hidden="true" />
        <span className="wallet-pill__addr" title={address}>
          {truncateAddress(address)}
        </span>
        <button onClick={unlink} className="wallet-pill__unlink" aria-label="Disconnect wallet">
          ×
        </button>
      </div>
    );
  }

  if (state === 'linking') {
    return (
      <button className="wallet-pill wallet-pill--busy" disabled>
        <span className="ring-spin" aria-hidden="true" />
        Linking…
      </button>
    );
  }

  if (state === 'failed') {
    return (
      <div className="wallet-pill wallet-pill--error">
        <span title={error ?? ''}>Connection failed</span>
        <button onClick={link} className="wallet-pill__retry">
          Retry
        </button>
      </div>
    );
  }

  return (
    <button onClick={link} className="glow-btn">
      Link Wallet
    </button>
  );
}
