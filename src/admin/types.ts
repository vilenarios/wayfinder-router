/**
 * Admin UI Types
 */

import type { Logger, RouterConfig } from "../types/index.js";
import type { GatewaySelector } from "../services/gateway-selector.js";
import type { ArnsResolver } from "../services/arns-resolver.js";
import type { ContentFetcher } from "../services/content-fetcher.js";
import type { TelemetryService } from "../telemetry/service.js";
import type { ContentCache } from "../cache/content-cache.js";
import type { GatewayPingService } from "../services/gateway-ping-service.js";
import type { BlocklistService } from "../moderation/blocklist-service.js";
import type { NetworkGatewayManager } from "../services/network-gateway-manager.js";
import type { WayfinderServices } from "../services/wayfinder-client.js";

export interface AdminDeps {
  config: RouterConfig;
  logger: Logger;
  version: string;
  startTime: number;
  gatewaySelector: GatewaySelector;
  arnsResolver: ArnsResolver;
  contentFetcher: ContentFetcher;
  telemetryService: TelemetryService | null;
  contentCache: ContentCache;
  pingService: GatewayPingService | null;
  blocklistService: BlocklistService | null;
  networkGatewayManager: NetworkGatewayManager | null;
  wayfinderServices: WayfinderServices;
}

export interface AdminConfig {
  enabled: boolean;
  port: number;
  host: string;
  token: string;
}
