/**
 * streak.test.ts — Tests for the Private Focus Streak contract
 *
 * Tests cover:
 *  1. Circuit logic     — checkIn / logMinutes / resetStreak behave
 *                         correctly, and invalid inputs are rejected by
 *                         the circuit's own asserts
 *  2. State transitions — streak_count and total_minutes_logged
 *                         accumulate correctly across multiple calls
 *  3. Privacy model     — effort_minutes never appears in the public
 *                         ledger when passed through checkIn(), and
 *                         different qualifying session lengths are
 *                         indistinguishable on-chain. The contrasting
 *                         logMinutes() circuit is checked too, since
 *                         disclosing a value on purpose is the point of
 *                         that circuit, not a leak.
 */

import {
  createConstructorContext,
  createCircuitContext,
  emptyZswapLocalState,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger } from '../managed/streak/contract/index.js';

const DUMMY_ADDRESS = '0'.repeat(64);
const DUMMY_KEY = '0'.repeat(64);

function freshState() {
  const contract = new Contract({});
  const ctx = createConstructorContext({}, DUMMY_ADDRESS);
  const init = contract.initialState(ctx);
  return { contract, contractState: init.currentContractState, privateState: init.currentPrivateState };
}

function readLedger(contractState: any) {
  return ledger(contractState.data ?? contractState);
}

function callCheckIn(contract: Contract<any>, contractState: any, privateState: any, minutes: bigint) {
  const ctx = createCircuitContext(DUMMY_ADDRESS, emptyZswapLocalState(DUMMY_KEY), contractState, privateState);
  const result = contract.circuits.checkIn(ctx, minutes);
  return { chargedState: result.context.currentQueryContext.state, privateState: result.context.currentPrivateState };
}

function callLogMinutes(contract: Contract<any>, contractState: any, privateState: any, minutes: bigint) {
  const ctx = createCircuitContext(DUMMY_ADDRESS, emptyZswapLocalState(DUMMY_KEY), contractState, privateState);
  const result = contract.circuits.logMinutes(ctx, minutes);
  return { chargedState: result.context.currentQueryContext.state, privateState: result.context.currentPrivateState };
}

function callResetStreak(contract: Contract<any>, contractState: any, privateState: any) {
  const ctx = createCircuitContext(DUMMY_ADDRESS, emptyZswapLocalState(DUMMY_KEY), contractState, privateState);
  const result = contract.circuits.resetStreak(ctx);
  return { chargedState: result.context.currentQueryContext.state, privateState: result.context.currentPrivateState };
}

describe('Private Focus Streak Contract', () => {
  describe('Circuit logic', () => {
    it('starts at zero streak and zero logged minutes', () => {
      const { contractState } = freshState();
      const state = readLedger(contractState);
      expect(state.streak_count).toBe(0n);
      expect(state.total_minutes_logged).toBe(0n);
    });

    it('checkIn with a qualifying session increments streak_count by exactly 1', () => {
      const { contract, contractState, privateState } = freshState();
      const r = callCheckIn(contract, contractState, privateState, 20n);
      expect(readLedger(r.chargedState).streak_count).toBe(1n);
    });

    it('checkIn rejects a session shorter than the 15-minute minimum', () => {
      const { contract, contractState, privateState } = freshState();
      expect(() => callCheckIn(contract, contractState, privateState, 10n)).toThrow(/at least 15 minutes/);
    });

    it('checkIn accepts a session at exactly the 15-minute minimum', () => {
      const { contract, contractState, privateState } = freshState();
      const r = callCheckIn(contract, contractState, privateState, 15n);
      expect(readLedger(r.chargedState).streak_count).toBe(1n);
    });

    it('checkIn rejects a zero-minute session', () => {
      const { contract, contractState, privateState } = freshState();
      expect(() => callCheckIn(contract, contractState, privateState, 0n)).toThrow();
    });

    it('logMinutes adds the exact given amount to total_minutes_logged', () => {
      const { contract, contractState, privateState } = freshState();
      const r = callLogMinutes(contract, contractState, privateState, 42n);
      expect(readLedger(r.chargedState).total_minutes_logged).toBe(42n);
    });

    it('logMinutes rejects a zero amount', () => {
      const { contract, contractState, privateState } = freshState();
      expect(() => callLogMinutes(contract, contractState, privateState, 0n)).toThrow(/must be positive/);
    });

    it('resetStreak brings streak_count back to zero', () => {
      const { contract, contractState, privateState } = freshState();
      const r1 = callCheckIn(contract, contractState, privateState, 30n);
      const r2 = callResetStreak(contract, r1.chargedState, r1.privateState);
      expect(readLedger(r2.chargedState).streak_count).toBe(0n);
    });

    it('resetStreak does not affect total_minutes_logged', () => {
      const { contract, contractState, privateState } = freshState();
      const r1 = callLogMinutes(contract, contractState, privateState, 25n);
      const r2 = callResetStreak(contract, r1.chargedState, r1.privateState);
      expect(readLedger(r2.chargedState).total_minutes_logged).toBe(25n);
    });
  });

  describe('State transitions', () => {
    it('multiple qualifying check-ins accumulate the streak one at a time', () => {
      const { contract, contractState, privateState } = freshState();
      const r1 = callCheckIn(contract, contractState, privateState, 15n);
      const r2 = callCheckIn(contract, r1.chargedState, r1.privateState, 90n);
      const r3 = callCheckIn(contract, r2.chargedState, r2.privateState, 16n);
      expect(readLedger(r3.chargedState).streak_count).toBe(3n);
    });

    it('multiple logMinutes calls accumulate the public total', () => {
      const { contract, contractState, privateState } = freshState();
      const r1 = callLogMinutes(contract, contractState, privateState, 10n);
      const r2 = callLogMinutes(contract, r1.chargedState, r1.privateState, 20n);
      const r3 = callLogMinutes(contract, r2.chargedState, r2.privateState, 5n);
      expect(readLedger(r3.chargedState).total_minutes_logged).toBe(35n);
    });

    it('a streak can be reset and then built back up again', () => {
      const { contract, contractState, privateState } = freshState();
      const r1 = callCheckIn(contract, contractState, privateState, 20n);
      const r2 = callCheckIn(contract, r1.chargedState, r1.privateState, 20n);
      const r3 = callResetStreak(contract, r2.chargedState, r2.privateState);
      const r4 = callCheckIn(contract, r3.chargedState, r3.privateState, 20n);
      expect(readLedger(r4.chargedState).streak_count).toBe(1n);
    });
  });

  describe('Privacy model — private session length never exposed', () => {
    it('the ledger exposes only the two public fields, never effort_minutes', () => {
      const { contractState } = freshState();
      const publicState = readLedger(contractState);
      expect(Object.keys(publicState).sort()).toEqual(['streak_count', 'total_minutes_logged']);
      expect((publicState as any).effort_minutes).toBeUndefined();
    });

    it('a 15-minute session and a 500-minute session are indistinguishable on the public ledger', () => {
      const short = freshState();
      const shortResult = callCheckIn(short.contract, short.contractState, short.privateState, 15n);

      const long = freshState();
      const longResult = callCheckIn(long.contract, long.contractState, long.privateState, 500n);

      expect(readLedger(shortResult.chargedState)).toEqual(readLedger(longResult.chargedState));
    });

    it('effort_minutes is not serialised into contract state after checkIn', () => {
      const { contract, contractState, privateState } = freshState();
      const r = callCheckIn(contract, contractState, privateState, 777n);
      const stateStr = r.chargedState?.toString() ?? '';
      expect(stateStr).not.toContain('777');
    });

    it('by contrast, logMinutes DOES put the exact value on-chain — a deliberate disclose(), not a leak', () => {
      const { contract, contractState, privateState } = freshState();
      const r = callLogMinutes(contract, contractState, privateState, 63n);
      expect(readLedger(r.chargedState).total_minutes_logged).toBe(63n);
    });
  });
});
