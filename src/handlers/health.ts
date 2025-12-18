/**
 * Health Check Handlers
 * Provides health, readiness, and metrics endpoints
 */

import type { Context } from 'hono';
import type { Logger, RouterConfig } from '../types/index.js';
import type { GatewaySelector } from '../services/gateway-selector.js';
import type { ArnsResolver } from '../services/arns-resolver.js';

export interface HealthHandlerDeps {
  gatewaySelector: GatewaySelector;
  arnsResolver: ArnsResolver;
  config: RouterConfig;
  logger: Logger;
  startTime: number;
}

/**
 * Create health check handler
 */
export function createHealthHandler(deps: HealthHandlerDeps) {
  return async (c: Context): Promise<Response> => {
    const uptimeMs = Date.now() - deps.startTime;

    return c.json({
      status: 'healthy',
      uptime: {
        ms: uptimeMs,
        human: formatUptime(uptimeMs),
      },
      version: process.env.npm_package_version || '0.1.0',
    });
  };
}

/**
 * Create readiness check handler
 * Returns 200 if the service is ready to accept traffic
 */
export function createReadyHandler(deps: HealthHandlerDeps) {
  return async (c: Context): Promise<Response> => {
    const { gatewaySelector, logger } = deps;

    try {
      // Check if we can reach at least one gateway
      const healthStats = gatewaySelector.healthStats();

      // Consider ready if we have gateway health tracking active
      // or if no gateways have been marked unhealthy yet
      const ready = healthStats.total === 0 || healthStats.healthy > 0;

      if (ready) {
        return c.json({
          status: 'ready',
          gateways: healthStats,
        });
      }

      logger.warn('Readiness check failed - no healthy gateways');

      return c.json(
        {
          status: 'not_ready',
          reason: 'No healthy gateways available',
          gateways: healthStats,
        },
        503,
      );
    } catch (error) {
      logger.error('Readiness check error', {
        error: error instanceof Error ? error.message : String(error),
      });

      return c.json(
        {
          status: 'error',
          reason: error instanceof Error ? error.message : 'Unknown error',
        },
        503,
      );
    }
  };
}

/**
 * Create metrics handler
 * Returns Prometheus-compatible metrics
 */
export function createMetricsHandler(deps: HealthHandlerDeps) {
  return async (_c: Context): Promise<Response> => {
    const { gatewaySelector, arnsResolver, startTime } = deps;

    const uptimeMs = Date.now() - startTime;
    const gatewayStats = gatewaySelector.healthStats();
    const arnsStats = arnsResolver.stats();

    // Format as Prometheus metrics
    const metrics = [
      '# HELP wayfinder_router_uptime_seconds Uptime in seconds',
      '# TYPE wayfinder_router_uptime_seconds gauge',
      `wayfinder_router_uptime_seconds ${uptimeMs / 1000}`,
      '',
      '# HELP wayfinder_router_gateways_total Total number of tracked gateways',
      '# TYPE wayfinder_router_gateways_total gauge',
      `wayfinder_router_gateways_total ${gatewayStats.total}`,
      '',
      '# HELP wayfinder_router_gateways_healthy Number of healthy gateways',
      '# TYPE wayfinder_router_gateways_healthy gauge',
      `wayfinder_router_gateways_healthy ${gatewayStats.healthy}`,
      '',
      '# HELP wayfinder_router_gateways_unhealthy Number of unhealthy gateways',
      '# TYPE wayfinder_router_gateways_unhealthy gauge',
      `wayfinder_router_gateways_unhealthy ${gatewayStats.unhealthy}`,
      '',
      '# HELP wayfinder_router_gateways_circuit_open Number of gateways with open circuits',
      '# TYPE wayfinder_router_gateways_circuit_open gauge',
      `wayfinder_router_gateways_circuit_open ${gatewayStats.circuitOpen}`,
      '',
      '# HELP wayfinder_router_arns_cache_size Number of cached ArNS resolutions',
      '# TYPE wayfinder_router_arns_cache_size gauge',
      `wayfinder_router_arns_cache_size ${arnsStats.size}`,
      '',
    ].join('\n');

    return new Response(metrics, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4',
      },
    });
  };
}

/**
 * Format uptime in human-readable form
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}
