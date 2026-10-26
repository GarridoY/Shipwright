import { and, eq, isNull, lte } from 'drizzle-orm';
import type { ExecutionLease } from '@shipwright/domain';
import type { createDatabase } from '../client.js';
import { executionLeases } from '../schema/index.js';

export interface AcquireExecutionLeaseInput {
  runId: string;
  owner: string;
  expiresAt: Date;
  now?: Date;
}

export interface LeaseAcquisitionTransaction {
  releaseExpired(runId: string, now: Date): Promise<void>;
  insert(input: Required<Pick<AcquireExecutionLeaseInput, 'runId' | 'owner' | 'expiresAt'>> & { now: Date }): Promise<ExecutionLease>;
}

export interface LeaseAcquisitionStore {
  transaction<T>(operation: (transaction: LeaseAcquisitionTransaction) => Promise<T>): Promise<T>;
}

/** Retire expired leases and acquire their replacement atomically. */
export function createExecutionLeaseStore(db: ReturnType<typeof createDatabase>['db']): LeaseAcquisitionStore {
  return {
    transaction: (operation) => db.transaction((tx) => operation({
      async releaseExpired(runId, now) {
        await tx
          .update(executionLeases)
          .set({ releasedAt: now })
          .where(and(
            eq(executionLeases.runId, runId),
            isNull(executionLeases.releasedAt),
            lte(executionLeases.expiresAt, now),
          ));
      },
      async insert(input) {
        const [lease] = await tx
          .insert(executionLeases)
          .values({
            runId: input.runId,
            owner: input.owner,
            heartbeatAt: input.now,
            expiresAt: input.expiresAt,
            createdAt: input.now,
          })
          .returning();
        if (!lease) throw new Error('Execution lease insert returned no row');
        return lease;
      },
    })),
  };
}

export async function acquireExecutionLease(
  store: LeaseAcquisitionStore,
  input: AcquireExecutionLeaseInput,
): Promise<ExecutionLease> {
  const now = input.now ?? new Date();
  if (input.expiresAt <= now) throw new RangeError('Execution lease expiry must be after acquisition time');

  return store.transaction(async (transaction) => {
    await transaction.releaseExpired(input.runId, now);
    return transaction.insert({
      runId: input.runId,
      owner: input.owner,
      expiresAt: input.expiresAt,
      now,
    });
  });
}
