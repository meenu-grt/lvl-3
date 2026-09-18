# Product Proposal

## What is the product, and who uses it?

Focus Streak is a private habit-tracking app for anyone doing deep-focus work — students, remote workers, freelancers — who wants to build a public accountability streak without exposing how they actually spend their time. Today's habit trackers (Streaks, Forest, etc.) either keep everything on a private server you have to trust, or if they went on-chain, would expose every session length to anyone watching the contract. Focus Streak lets a user prove "I did a real focus session today" — publicly, verifiably, streak intact — without ever revealing whether that session was 15 minutes or 5 hours. Nobody, including the app itself, learns the real number.

## Why Midnight specifically?

A transparent chain can't do the core thing this product needs: checking "was this session at least 15 minutes?" without making the actual duration public the moment it's checked. On Ethereum or Solana, `effort_minutes` would have to sit in a public transaction for the contract to read it — there's no way to compute on a number without exposing it. Midnight's Compact contracts let `checkIn` take `effort_minutes` as a private circuit input: the zero-knowledge proof establishes the `>= 15` check happened correctly, and only the pass/fail result (a `+1` to the public streak) ever reaches the chain. The `logMinutes` circuit in the same contract shows the alternative — `disclose()` is how a user could choose to make a number public (say, for a public leaderboard) — which makes the contrast between "private by default" and "public on purpose" concrete rather than theoretical.

## Data Model

| Data Point | Type | Disclosed To |
|------------|------|---------------|
| `effort_minutes` (session length) | Private circuit input | No one |
| `streak_count` (qualifying check-ins) | Public ledger | Everyone |
| `total_minutes_logged` (only what users chose to disclose) | Public ledger | Everyone |
| Proof that `effort_minutes >= 15` | ZK proof | Chain (verifies without seeing the number) |

## Mainnet Feasibility

Realistic as a small, focused v1, with two gaps to close before Mainnet: first, streaks need to persist and reset based on real elapsed days (missed a day = streak resets), which means reading block time on-chain rather than trusting the client, similar to how a deadline would be enforced with Compact's block-time predicates. Second, a real product needs one contract instance shared across all users rather than one deployment per user, which means moving from a single `streak_count` to a `Map` keyed by each user's identity — a bigger but well-understood change, not a research problem. Nothing about the private-input pattern itself needs to change to reach Mainnet.
