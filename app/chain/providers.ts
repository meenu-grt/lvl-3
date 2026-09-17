/**
 * providers.ts — builds the ContractProviders set for browser-side contract
 * deployment and circuit calls, using the connected Midnight-compatible
 * wallet for proving, balancing, and submission instead of a Node.js
 * script wallet.
 *
 * The streak contract declares no witnesses (see contract/streak.compact —
 * effort_minutes is a plain private circuit input, not persistent private
 * state), so unlike later levels in this series this file needs no
 * PrivateStateProvider beyond an in-memory placeholder to satisfy the
 * shape midnight-js expects.
 */
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { dappConnectorProofProvider } from '@midnight-ntwrk/midnight-js-dapp-connector-proof-provider';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import type { MidnightProvider, WalletProvider } from '@midnight-ntwrk/midnight-js-types';
import { fromHex, toHex } from '@midnight-ntwrk/midnight-js-utils';

const CIRCUIT_IDS = ['checkIn', 'logMinutes', 'resetStreak'] as const;
type CircuitId = (typeof CIRCUIT_IDS)[number];

/**
 * Public Midnight indexer endpoints, keyed by network id.
 *
 * We deliberately do NOT use the `indexerUri` returned by the wallet's
 * getConfiguration(). Some wallets point that at their own hosted
 * indexer, which requires an API key and answers unauthenticated queries
 * with 401 Unauthorized. The wallet needs that endpoint for its own
 * syncing; this app only needs public contract state, so it reads that
 * from the network's public indexer instead.
 */
const PUBLIC_INDEXERS: Record<string, { http: string; ws: string }> = {
  preprod: {
    http: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    ws: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  },
  preview: {
    http: 'https://indexer.preview.midnight.network/api/v4/graphql',
    ws: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
  },
  undeployed: {
    http: 'http://localhost:8088/api/v4/graphql',
    ws: 'ws://localhost:8088/api/v4/graphql/ws',
  },
};

function resolveIndexer(networkId: string, walletHttp: string, walletWs: string) {
  const known = PUBLIC_INDEXERS[networkId];
  if (known) return known;
  console.warn(`Unknown network id "${networkId}" — falling back to the wallet's indexer endpoint.`);
  return { http: walletHttp, ws: walletWs };
}

/**
 * Builds a WalletProvider + MidnightProvider pair backed by the connected
 * wallet's balancing/signing/submission methods, plus a ProofProvider that
 * delegates proof generation to the wallet (proving happens locally in the
 * browser, not on any server this app runs).
 */
export async function buildProviders(connectedAPI: ConnectedAPI) {
  const config = await connectedAPI.getConfiguration();

  // The wallet's own network id decides which network we're really
  // talking to — set it globally before any contract operation, or
  // midnight-js throws "Network ID has not been configured".
  setNetworkId(config.networkId);

  const indexer = resolveIndexer(config.networkId, config.indexerUri, config.indexerWsUri);

  // FetchZkConfigProvider defaults to cross-fetch's `fetch` and calls it as
  // `this.fetchFunc(url, opts)` internally — since `this` there is the
  // provider instance (not `window`), the browser's native fetch throws
  // "Illegal invocation". Passing a pre-bound window.fetch avoids that.
  const zkConfigProvider = new FetchZkConfigProvider<CircuitId>(
    `${window.location.origin}/zk/streak`,
    window.fetch.bind(window),
  );

  const walletAndMidnightProvider: WalletProvider & MidnightProvider = {
    getCoinPublicKey() {
      throw new Error('getCoinPublicKey called before wallet addresses were resolved');
    },
    getEncryptionPublicKey() {
      throw new Error('getEncryptionPublicKey called before wallet addresses were resolved');
    },
    async balanceTx(tx) {
      const { tx: balanced } = await connectedAPI.balanceUnsealedTransaction(serializeTx(tx));
      return deserializeFinalizedTx(balanced);
    },
    async submitTx(tx) {
      await connectedAPI.submitTransaction(serializeTx(tx));
      return tx.identifiers().at(-1) as any;
    },
  };

  const { shieldedCoinPublicKey, shieldedEncryptionPublicKey } = await connectedAPI.getShieldedAddresses();
  walletAndMidnightProvider.getCoinPublicKey = () => shieldedCoinPublicKey;
  walletAndMidnightProvider.getEncryptionPublicKey = () => shieldedEncryptionPublicKey;

  const proofProvider = await dappConnectorProofProvider(connectedAPI, zkConfigProvider, ledger.CostModel.initialCostModel());

  return {
    privateStateProvider: noopPrivateStateProvider(),
    publicDataProvider: indexerPublicDataProvider(indexer.http, indexer.ws, window.WebSocket as any),
    zkConfigProvider,
    proofProvider,
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
}

/**
 * The streak contract declares no witnesses, so the browser never
 * actually needs to persist anything here. midnight-js still requires a
 * PrivateStateProvider on the providers object, so this satisfies that
 * shape with in-memory no-ops.
 */
function noopPrivateStateProvider(): any {
  const store = new Map<string, unknown>();
  const signingKeys = new Map<string, unknown>();
  return {
    setContractAddress: () => {},
    set: async (id: string, state: unknown) => void store.set(id, state),
    get: async (id: string) => (store.has(id) ? store.get(id) : null),
    remove: async (id: string) => void store.delete(id),
    clear: async () => store.clear(),
    setSigningKey: async (address: string, key: unknown) => void signingKeys.set(address, key),
    getSigningKey: async (address: string) => (signingKeys.has(address) ? signingKeys.get(address) : null),
    removeSigningKey: async (address: string) => void signingKeys.delete(address),
    clearSigningKeys: async () => signingKeys.clear(),
    exportPrivateStates: async () => {
      throw new Error('Export is not supported: this contract has no private state.');
    },
    importPrivateStates: async () => {
      throw new Error('Import is not supported: this contract has no private state.');
    },
    exportSigningKeys: async () => {
      throw new Error('Export is not supported.');
    },
    importSigningKeys: async () => {
      throw new Error('Import is not supported.');
    },
  };
}

function serializeTx(tx: unknown): string {
  return toHex((tx as { serialize: () => Uint8Array }).serialize());
}

function deserializeFinalizedTx(hex: string): ledger.FinalizedTransaction {
  return ledger.Transaction.deserialize('signature', 'proof', 'binding', fromHex(hex)) as any;
}
