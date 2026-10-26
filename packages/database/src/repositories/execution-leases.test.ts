import { describe, expect, it } from 'vitest';
import type { ExecutionLease } from '@shipwright/domain';
import {
  acquireExecutionLease,
  type AcquireExecutionLeaseInput,
  type LeaseAcquisitionStore,
  type LeaseAcquisitionTransaction,
} from './execution-leases.js';

class LeaseAlreadyHeldError extends Error {}
const now = new Date('2026-10-26T12:00:00.000Z');

class MemoryLeaseStore implements LeaseAcquisitionStore {
  readonly leases: ExecutionLease[] = [];
  now = new Date(now);
  delayBeforeInsertMs = 0;

  async transaction<T>(operation: (transaction: LeaseAcquisitionTransaction) => Promise<T>): Promise<T> {
    const snapshot = structuredClone(this.leases);
    const transaction: LeaseAcquisitionTransaction = {
      releaseExpired: async (runId) => {
        for (const lease of snapshot) {
          if (lease.runId === runId && lease.releasedAt === null && lease.expiresAt <= this.now) {
            lease.releasedAt = this.now;
          }
        }
      },
      insert: async (input) => {
        this.now = new Date(this.now.getTime() + this.delayBeforeInsertMs);
        if (snapshot.some((lease) => lease.runId === input.runId && lease.releasedAt === null)) {
          throw new LeaseAlreadyHeldError();
        }
        const lease: ExecutionLease = {
          id: `lease-${snapshot.length + 1}`,
          runId: input.runId,
          owner: input.owner,
          heartbeatAt: this.now,
          expiresAt: new Date(this.now.getTime() + input.ttlMs),
          releasedAt: null,
          createdAt: this.now,
        };
        snapshot.push(lease);
        return lease;
      },
    };

    const result = await operation(transaction);
    this.leases.splice(0, this.leases.length, ...snapshot);
    return result;
  }
}

const input = (overrides: Partial<AcquireExecutionLeaseInput> = {}): AcquireExecutionLeaseInput => ({
  runId: 'run-1',
  owner: 'worker-new',
  ttlMs: 60_000,
  ...overrides,
});

describe('execution lease acquisition', () => {
  it('reclaims an unreleased expired lease before creating a lease for the new owner', async () => {
    const store = new MemoryLeaseStore();
    store.leases.push({
      id: 'lease-expired',
      runId: 'run-1',
      owner: 'worker-crashed',
      heartbeatAt: new Date(now.getTime() - 120_000),
      expiresAt: new Date(now.getTime() - 1),
      releasedAt: null,
      createdAt: new Date(now.getTime() - 120_000),
    });

    const replacement = await acquireExecutionLease(store, input());

    expect(store.leases[0]?.releasedAt).toEqual(now);
    expect(replacement.owner).toBe('worker-new');
    expect(replacement.releasedAt).toBeNull();
  });

  it('rejects another owner while an unreleased lease has not expired', async () => {
    const store = new MemoryLeaseStore();
    const activeLease: ExecutionLease = {
      id: 'lease-active',
      runId: 'run-1',
      owner: 'worker-active',
      heartbeatAt: now,
      expiresAt: new Date(now.getTime() + 30_000),
      releasedAt: null,
      createdAt: now,
    };
    store.leases.push(activeLease);

    await expect(acquireExecutionLease(store, input())).rejects.toThrow(LeaseAlreadyHeldError);
    expect(store.leases).toEqual([activeLease]);
  });

  it('starts the lease TTL at insertion after a transaction delay', async () => {
    const store = new MemoryLeaseStore();
    store.delayBeforeInsertMs = 120_000;

    const lease = await acquireExecutionLease(store, input());

    expect(lease.heartbeatAt).toEqual(store.now);
    expect(lease.expiresAt.getTime()).toBeGreaterThan(store.now.getTime());
    expect(lease.expiresAt.getTime() - lease.heartbeatAt.getTime()).toBe(input().ttlMs);
  });
});
