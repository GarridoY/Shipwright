const keepAlive = setInterval(() => undefined, 60_000);
console.info('Shipwright worker ready. No jobs are configured yet.');

await new Promise<void>((resolve) => {
  const stop = (signal: NodeJS.Signals) => {
    clearInterval(keepAlive);
    console.info(`Worker received ${signal}; shutting down cleanly.`);
    resolve();
  };
  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));
});
