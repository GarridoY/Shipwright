import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import type { ExecutionLease } from '@shipwright/domain';
import type { createDatabase } from '../client.js';
import { executionLeases } from '../schema/index.js';

export interface AcquireExecutionLeaseInput {
  runId: string;
  owner: string;
  ttlMs: number;
}

export interface LeaseAcquisitionTransaction {
  releaseExpired(runId: string): Promise<void>;
  insert(input: AcquireExecutionLeaseInput): Promise<ExecutionLease>;
}

export interface LeaseAcquisitionStore {
  transaction<T>(operation: (transaction: LeaseAcquisitionTransaction) => Promise<T>): Promise<T>;
}

/** Retire expired leases and acquire their replacement atomically. */
export function createExecutionLeaseStore(db: ReturnType<typeof createDatabase>['db']): LeaseAcquisitionStore {
  return {
    transaction: (operation) => db.transaction((tx) => operation({
      async releaseExpired(runId) {
        await tx
          .update(executionLeases)
          .set({ releasedAt: sql<Date>`clock_timestamp()` })
          .where(and(
            eq(executionLeases.runId, runId),
            isNull(executionLeases.releasedAt),
            lte(executionLeases.expiresAt, sql<Date>`clock_timestamp()`),
          ));
      },
      async insert(input) {
        const [lease] = await tx
          .insert(executionLeases)
          .values({
            runId: input.runId,
            owner: input.owner,
            heartbeatAt: sql<Date>`clock_timestamp()`,
            expiresAt: sql<Date>`clock_timestamp() + (${input.ttlMs} * interval '1 millisecond')`,
            createdAt: sql<Date>`clock_timestamp()`,
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
  if (!Number.isSafeInteger(input.ttlMs) || input.ttlMs <= 0) {
    throw new RangeError('Execution lease TTL must be a positive safe integer');
  }

  return store.transaction(async (transaction) => {
    await transaction.releaseExpired(input.runId);
    return transaction.insert(input);
  });
}
