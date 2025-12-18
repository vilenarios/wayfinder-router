/**
 * Wayfinder Router
 * Entry point for the lightweight ar.io gateway proxy
 */

import 'dotenv/config';
import { serve } from '@hono/node-server';
import pino from 'pino';

import { loadConfig, validateConfig } from './config.js';
import { createServer } from './server.js';
import type { Logger } from './types/index.js';

/**
 * Create pino logger with configuration
 */
function createLogger(level: string): Logger {
  // Note: pino-pretty transport disabled due to zone.js compatibility issues
  // with wayfinder-core. Use LOG_PRETTY=true to enable if needed.
  const usePretty =
    process.env.LOG_PRETTY === 'true' && process.env.NODE_ENV !== 'production';

  const pinoLogger = pino({
    level,
    transport: usePretty
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  });

  return {
    debug: (msg: string, ...args: unknown[]) => pinoLogger.debug(args[0] as object, msg),
    info: (msg: string, ...args: unknown[]) => pinoLogger.info(args[0] as object, msg),
    warn: (msg: string, ...args: unknown[]) => pinoLogger.warn(args[0] as object, msg),
    error: (msg: string, ...args: unknown[]) => pinoLogger.error(args[0] as object, msg),
    child: (_bindings: Record<string, unknown>) => {
      const childLogger = pinoLogger.child(_bindings);
      return {
        debug: (msg: string, ...args: unknown[]) => childLogger.debug(args[0] as object, msg),
        info: (msg: string, ...args: unknown[]) => childLogger.info(args[0] as object, msg),
        warn: (msg: string, ...args: unknown[]) => childLogger.warn(args[0] as object, msg),
        error: (msg: string, ...args: unknown[]) => childLogger.error(args[0] as object, msg),
        child: (__bindings: Record<string, unknown>) => createLogger(level),
      };
    },
  };
}

/**
 * Main entry point
 */
async function main() {
  // Load and validate configuration
  const config = loadConfig();
  const logger = createLogger(config.logging.level);

  try {
    validateConfig(config);
  } catch (error) {
    logger.error('Configuration validation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }

  logger.info('Starting Wayfinder Router', {
    port: config.server.port,
    host: config.server.host,
    baseDomain: config.server.baseDomain,
    mode: config.mode.default,
    verificationEnabled: config.verification.enabled,
    routingStrategy: config.routing.strategy,
    gatewaySource: config.routing.gatewaySource,
  });

  // Create server
  const { app, services } = createServer({ config, logger });

  // Initialize top staked gateways provider if using network source
  if (services.wayfinderServices.topStakedProvider) {
    logger.info('Initializing top staked gateways from ar.io network...');
    await services.wayfinderServices.topStakedProvider.initialize();
  }

  // Start server
  const server = serve({
    fetch: app.fetch,
    port: config.server.port,
    hostname: config.server.host,
  });

  logger.info('Wayfinder Router started', {
    url: `http://${config.server.host}:${config.server.port}`,
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info('Shutdown signal received', { signal });

    // Stop top staked gateways provider
    if (services.wayfinderServices.topStakedProvider) {
      logger.info('Stopping top staked gateways provider');
      services.wayfinderServices.topStakedProvider.stop();
    }

    // Stop telemetry service to flush pending events and close database
    if (services.telemetryService) {
      logger.info('Stopping telemetry service');
      services.telemetryService.stop();
    }

    // Close server
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });

    // Force exit after timeout
    setTimeout(() => {
      logger.warn('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
