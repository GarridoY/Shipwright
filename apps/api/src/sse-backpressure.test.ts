import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { waitForResponseDrain } from './sse-backpressure.js';

function writableResponse() {
  const response = new EventEmitter() as EventEmitter & {
    destroyed: boolean;
    writableEnded: boolean;
    writable: boolean;
  };
  response.destroyed = false;
  response.writableEnded = false;
  response.writable = true;
  return response as ServerResponse & EventEmitter;
}

describe('waitForResponseDrain', () => {
  it('resumes after drain and removes its listeners', async () => {
    const response = writableResponse();
    const pending = waitForResponseDrain(response);

    response.emit('drain');

    await expect(pending).resolves.toBe(true);
    expect(response.listenerCount('drain')).toBe(0);
    expect(response.listenerCount('close')).toBe(0);
    expect(response.listenerCount('error')).toBe(0);
  });

  it('settles on disconnect without waiting for drain and removes its listeners', async () => {
    const response = writableResponse();
    const pending = waitForResponseDrain(response);

    response.destroyed = true;
    response.emit('close');

    await expect(pending).resolves.toBe(false);
    expect(response.listenerCount('drain')).toBe(0);
    expect(response.listenerCount('close')).toBe(0);
    expect(response.listenerCount('error')).toBe(0);
  });

  it('settles on response errors and does not listen when already unwritable', async () => {
    const response = writableResponse();
    const pending = waitForResponseDrain(response);
    response.emit('error', new Error('socket failed'));
    await expect(pending).resolves.toBe(false);

    response.writable = false;
    await expect(waitForResponseDrain(response)).resolves.toBe(false);
  });
});
