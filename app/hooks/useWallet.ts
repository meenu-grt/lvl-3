/**
 * useWallet.ts — React hook wrapping a Midnight-compatible wallet's DApp
 * Connector API.
 *
 * Handles:
 *  - Detecting window.midnight (wallet extensions inject themselves here, may take a moment)
 *  - Connect / disconnect flow
 *  - Surfacing connection errors (wallet not installed, user rejected, network mismatch)
 *  - Exposing the connected wallet's unshielded address for display
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';

export type LinkState = 'idle' | 'linking' | 'linked' | 'failed';

// The Preprod network id string expected by the wallet's connect() call.
const EXPECTED_NETWORK_ID = 'preprod';

export interface UseWalletResult {
  state: LinkState;
  address: string | null;
  error: string | null;
  connectedAPI: ConnectedAPI | null;
  link: () => Promise<void>;
  unlink: () => void;
}

/** Polls for window.midnight for a short window — wallet extensions can take a moment to inject. */
function waitForWalletInjection(timeoutMs = 3000): Promise<Record<string, InitialAPI> | null> {
  return new Promise((resolve) => {
    if (window.midnight) {
      resolve(window.midnight);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      if (window.midnight) {
        clearInterval(interval);
        resolve(window.midnight);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        resolve(null);
      }
    }, 150);
  });
}

export function useWallet(): UseWalletResult {
  const [state, setState] = useState<LinkState>('idle');
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const connectedAPIRef = useRef<ConnectedAPI | null>(null);

  const unlink = useCallback(() => {
    connectedAPIRef.current = null;
    setState('idle');
    setAddress(null);
    setError(null);
  }, []);

  const link = useCallback(async () => {
    setState('linking');
    setError(null);

    const midnightApis = await waitForWalletInjection();
    if (!midnightApis) {
      setState('failed');
      setError('No Midnight-compatible wallet found. Install a Midnight wallet extension and reload.');
      return;
    }

    // Prefer Lace if present under its known key, otherwise take the first
    // injected wallet — any wallet implementing the Midnight DApp Connector
    // API works here.
    const initialAPI = midnightApis.mnLace ?? Object.values(midnightApis)[0];
    if (!initialAPI) {
      setState('failed');
      setError('No Midnight-compatible wallet found. Install a Midnight wallet extension and reload.');
      return;
    }

    try {
      const connectedAPI = await initialAPI.connect(EXPECTED_NETWORK_ID);
      const config = await connectedAPI.getConfiguration();

      if (config.networkId !== EXPECTED_NETWORK_ID) {
        setState('failed');
        setError(
          `Wallet is connected to "${config.networkId}", but this app expects "${EXPECTED_NETWORK_ID}". Switch your wallet's network and try again.`,
        );
        return;
      }

      const { unshieldedAddress } = await connectedAPI.getUnshieldedAddress();

      connectedAPIRef.current = connectedAPI;
      setAddress(unshieldedAddress);
      setState('linked');
    } catch (e: any) {
      setState('failed');
      if (e?.code === 'Rejected' || e?.type === 'DAppConnectorAPIError') {
        setError(e.reason ?? 'Connection request was rejected.');
      } else {
        setError(e?.message ?? 'Failed to connect to wallet.');
      }
    }
  }, []);

  // If the wallet disconnects externally (e.g. user locks it), reflect that in state.
  useEffect(() => {
    if (state !== 'linked' || !connectedAPIRef.current) return;
    let cancelled = false;
    const api = connectedAPIRef.current;

    const poll = setInterval(async () => {
      try {
        const connStatus = await api.getConnectionStatus();
        if (!cancelled && connStatus.status === 'disconnected') {
          unlink();
        }
      } catch {
        if (!cancelled) unlink();
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [state, unlink]);

  return {
    state,
    address,
    error,
    connectedAPI: connectedAPIRef.current,
    link,
    unlink,
  };
}
