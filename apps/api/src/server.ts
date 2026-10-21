import type { Server } from 'node:http';
// Only the config module is imported statically. Everything else is loaded
// after validation succeeds, because several modules read the configuration at
// import time - a missing variable would otherwise surface as a stack trace
// from inside the logger instead of the message below.
import { env, type AppEnv } from './config/env.js';

async function main(): Promise<void> {
  let config: AppEnv;
  try {
    config = env();
  } catch (error) {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }

  const [
    { createApp },
    { logger },
    { databaseReachable, disconnectPrisma },
    { purgeExpiredSessions },
    { cleanupOrphanedFiles },
    { allStorageKeys },
  ] = await Promise.all([
    import('./app.js'),
    import('./utils/logger.js'),
    import('./config/prisma.js'),
    import('./services/session.service.js'),
    import('./services/resumeStorage.service.js'),
    import('./repositories/resume.repository.js'),
  ]);

  const app = createApp();
  const reachable = await databaseReachable();

  if (reachable) {
    const purged = await purgeExpiredSessions().catch(() => 0);
    if (purged > 0) logger.info({ purged }, 'Removed expired sessions');

    // Files without a database row are user data we no longer have a reason to keep.
    try {
      const removed = await cleanupOrphanedFiles(await allStorageKeys());
      if (removed > 0) logger.info({ removed }, 'Removed orphaned resume files');
    } catch (error) {
      logger.warn({ err: error }, 'Orphaned file cleanup did not complete');
    }
  } else {
    logger.error(
      'Could not reach the database. The API will start, but every data route will fail. ' +
        'Check DATABASE_URL and run "npm run prisma:deploy".',
    );
  }

  const server: Server = app.listen(config.PORT, () => {
    logger.info(
      {
        port: config.PORT,
        environment: config.NODE_ENV,
        provider: config.LLM_PROVIDER,
        model: config.LLM_PROVIDER === 'mock' ? 'curated-fallback' : config.LLM_MODEL,
        database: reachable ? 'connected' : 'unreachable',
      },
      `API listening on http://localhost:${config.PORT}`,
    );
  });

  // Graceful shutdown: stop accepting connections, finish in-flight requests,
  // then release the database pool.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');

    const force = setTimeout(() => {
      logger.warn('Forcing shutdown after timeout');
      process.exit(1);
    }, 10_000);
    force.unref();

    server.close(() => {
      void disconnectPrisma().then(() => {
        clearTimeout(force);
        process.exit(0);
      });
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception - shutting down');
    shutdown('uncaughtException');
  });
}

void main();
