import type { ServerResponse } from 'node:http';

/** Resolve on drain or any terminal socket condition, and remove all listeners on settlement. */
export function waitForResponseDrain(response: ServerResponse): Promise<boolean> {
  if (response.destroyed || response.writableEnded || !response.writable) return Promise.resolve(false);
  return new Promise((resolve) => {
    const finish = (drained: boolean) => {
      response.off('drain', onDrain);
      response.off('close', onClose);
      response.off('error', onError);
      resolve(drained && !response.destroyed && !response.writableEnded && response.writable);
    };
    const onDrain = () => finish(true);
    const onClose = () => finish(false);
    const onError = () => finish(false);
    response.once('drain', onDrain);
    response.once('close', onClose);
    response.once('error', onError);
  });
}
