/**
 * contract.ts — deploy/join the streak contract, plus typed helpers for
 * checkIn / logMinutes / resetStreak, and for reading back public state.
 *
 * Uses the browser-side providers from providers.ts (backed by the
 * connected wallet) so proving, balancing, and submission all happen
 * through the wallet rather than a Node.js script.
 *
 * This contract declares no witnesses (see contract/streak.compact),
 * so — unlike products elsewhere in this series that need persistent
 * private state — there is no withWitnesses() step here at all.
 */
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { Contract, ledger } from './streak.js';
import { buildProviders } from './providers.js';

// ZK assets are served as static files from public/zk/streak — this must
// be re-copied (npm run copy-zk) every time the contract is recompiled. A
// stale copy here compiles and deploys fine but proves against the old
// circuit shape and fails opaquely at proof time.
const ZK_ASSETS_PATH = '/zk/streak';

export interface StreakState {
  streakCount: bigint;
  totalMinutesLogged: bigint;
}

/**
 * Client-side timeout wrapper. callTx / deployContract can hang
 * indefinitely waiting on indexer finalization with zero UI feedback
 * otherwise — this doesn't affect the actual transaction, it just stops a
 * spinner from spinning forever with no explanation.
 */
function withTimeout<T>(promise: Promise<T>, ms = 120_000, label = 'operation'): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function buildCompiledContract() {
  return CompiledContract.make('streak', Contract).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets(ZK_ASSETS_PATH),
  );
}

/** Deploys a fresh streak contract, starting at streak 0. */
export async function deployStreak(connectedAPI: ConnectedAPI) {
  const providers = await buildProviders(connectedAPI);
  const compiledContract = buildCompiledContract();
  return withTimeout(
    deployContract(providers as any, { compiledContract: compiledContract as any, args: [] } as any),
    120_000,
    'Deploy',
  );
}

/** Connects to an already-deployed streak contract by address. */
export async function joinStreak(connectedAPI: ConnectedAPI, contractAddress: string) {
  const providers = await buildProviders(connectedAPI);
  const compiledContract = buildCompiledContract();
  return withTimeout(
    findDeployedContract(providers as any, {
      contractAddress,
      compiledContract: compiledContract as any,
    } as any),
    120_000,
    'Join',
  );
}

/**
 * Checks in a completed focus session. `minutes` is a PRIVATE circuit
 * input — it is used only to generate the proof locally in the browser,
 * never included in the submitted transaction, never logged, and never
 * returned from this function. Only streak_count (a fixed +1) changes
 * on-chain.
 */
export async function checkIn(deployedContract: any, minutes: bigint) {
  const result: any = await withTimeout(deployedContract.callTx.checkIn(minutes), 120_000, 'Check in');
  return result.public;
}

/**
 * Logs minutes on purpose, publicly. Unlike checkIn(), the exact amount
 * IS written to the chain here — this circuit exists specifically to
 * contrast with checkIn() and demonstrate disclose() as an explicit
 * opt-in, not a default.
 */
export async function logMinutes(deployedContract: any, minutes: bigint) {
  const result: any = await withTimeout(deployedContract.callTx.logMinutes(minutes), 120_000, 'Log minutes');
  return result.public;
}

/** Resets the streak counter back to zero. */
export async function resetStreak(deployedContract: any) {
  const result: any = await withTimeout(deployedContract.callTx.resetStreak(), 120_000, 'Reset streak');
  return result.public;
}

/** Reads the public state of a streak contract: the streak count and the publicly-logged minute total. */
export async function readStreakState(connectedAPI: ConnectedAPI, contractAddress: string): Promise<StreakState | null> {
  const providers = await buildProviders(connectedAPI);
  const state = await providers.publicDataProvider.queryContractState(contractAddress as any);
  if (!state) return null;
  const publicState = ledger((state as any).data ?? state);
  return {
    streakCount: publicState.streak_count,
    totalMinutesLogged: publicState.total_minutes_logged,
  };
}
