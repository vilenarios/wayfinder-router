/**
 * Temperature-Based Routing Strategy
 *
 * Selects gateways based on recent performance metrics ("temperature").
 * Gateways with better recent latency and success rates are more likely
 * to be selected, but slower gateways still have a chance to detect
 * when they improve.
 *
 * This strategy requires integration with the GatewayTemperatureCache
 * to track performance metrics over time.
 */

import type {
  GatewaysProvider,
  RoutingStrategy as SdkRoutingStrategy,
} from "@ar.io/wayfinder-core";
import type { GatewayTemperatureCache } from "../../cache/gateway-temperature.js";
import type { GatewayHealthCache } from "../../cache/gateway-health.js";
import type { Logger } from "../../types/index.js";

export interface TemperatureRoutingStrategyOptions {
  /** Provider for available gateways */
  gatewaysProvider: GatewaysProvider;
  /** Temperature cache for performance metrics */
  temperatureCache: GatewayTemperatureCache;
  /** Health cache for circuit breaker filtering (optional) */
  healthCache?: GatewayHealthCache;
  /** Logger */
  logger: Logger;
}

/**
 * Routing strategy that prefers gateways with better recent performance.
 *
 * Selection process:
 * 1. Get all available gateways from provider
 * 2. Filter out unhealthy gateways (circuit breaker open)
 * 3. Score remaining gateways by temperature (latency + success rate)
 * 4. Use weighted random selection (higher score = higher probability)
 */
export class TemperatureRoutingStrategy implements SdkRoutingStrategy {
  private gatewaysProvider: GatewaysProvider;
  private temperatureCache: GatewayTemperatureCache;
  private healthCache?: GatewayHealthCache;
  private logger: Logger;

  constructor(options: TemperatureRoutingStrategyOptions) {
    this.gatewaysProvider = options.gatewaysProvider;
    this.temperatureCache = options.temperatureCache;
    this.healthCache = options.healthCache;
    this.logger = options.logger;
  }

  /**
   * Select a gateway based on temperature (performance metrics)
   */
  async selectGateway(params: {
    gateways: URL[];
    path: string;
    subdomain?: string;
  }): Promise<URL> {
    let gateways = params.gateways;

    // If no gateways provided, fetch from provider
    if (!gateways || gateways.length === 0) {
      gateways = await this.gatewaysProvider.getGateways();
    }

    if (gateways.length === 0) {
      throw new Error("No gateways available for selection");
    }

    // Filter out unhealthy gateways if health cache is available
    let healthyGateways = gateways;
    if (this.healthCache) {
      healthyGateways = this.healthCache.filterHealthy(gateways);

      // If all gateways are unhealthy, fall back to all gateways
      // (better to try than to fail completely)
      if (healthyGateways.length === 0) {
        this.logger.warn(
          "All gateways unhealthy, falling back to unfiltered list",
          { totalGateways: gateways.length },
        );
        healthyGateways = gateways;
      }
    }

    // Use temperature-based weighted selection
    const selected = this.temperatureCache.selectWeighted(healthyGateways);

    this.logger.debug("Temperature-based gateway selection", {
      totalGateways: gateways.length,
      healthyGateways: healthyGateways.length,
      selected: selected.toString(),
      score: this.temperatureCache.getScore(selected.toString()),
      path: params.path,
      subdomain: params.subdomain,
    });

    return selected;
  }
}
