#!/usr/bin/env bun
/**
 * Show Telemetry Stats
 *
 * Displays summary of telemetry data stored in the SQLite database.
 *
 * Usage:
 *   bun scripts/show-stats.ts [options]
 *
 * Options:
 *   --path <path> Override TELEMETRY_DB_PATH (default: ./data/telemetry.db)
 *   --json        Output as JSON
 *   --help        Show this help message
 */

import { existsSync, statSync } from "node:fs";
import { Database } from "bun:sqlite";

interface Options {
  dbPath: string;
  json: boolean;
  help: boolean;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    dbPath: process.env.TELEMETRY_DB_PATH || "./data/telemetry.db",
    json: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--path":
        options.dbPath = args[++i];
        break;
      case "--json":
        options.json = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
    }
  }

  return options;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function showHelp(): void {
  console.log(`
Show Telemetry Stats

Displays summary of telemetry data stored in the SQLite database.

Usage:
  bun scripts/show-stats.ts [options]

Options:
  --path <path> Override TELEMETRY_DB_PATH (default: ./data/telemetry.db)
  --json        Output as JSON
  --help, -h    Show this help message

Examples:
  bun scripts/show-stats.ts
  bun scripts/show-stats.ts --json
  bun scripts/show-stats.ts --path ./custom/path/telemetry.db
`);
}

interface GatewayStats {
  gateway: string;
  totalRequests: number;
  successRate: number;
  avgLatencyMs: number;
  firstSeen: string;
  lastSeen: string;
}

function main(): void {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  // Check if database exists
  if (!existsSync(options.dbPath)) {
    if (options.json) {
      console.log(JSON.stringify({ error: "Database not found", path: options.dbPath }));
    } else {
      console.log(`Database not found: ${options.dbPath}`);
    }
    process.exit(1);
  }

  const fileSize = statSync(options.dbPath).size;
  const db = new Database(options.dbPath, { readonly: true });

  try {
    // Get table counts
    const statsCount = db
      .prepare("SELECT COUNT(*) as count FROM gateway_hourly_stats")
      .get() as { count: number };
    const eventsCount = db
      .prepare("SELECT COUNT(*) as count FROM gateway_events")
      .get() as { count: number };

    // Get unique gateways
    const gatewaysResult = db
      .prepare("SELECT COUNT(DISTINCT gateway) as count FROM gateway_hourly_stats")
      .get() as { count: number };

    // Get date range
    const dateRange = db
      .prepare(`
        SELECT
          MIN(hour_bucket) as earliest,
          MAX(hour_bucket) as latest
        FROM gateway_hourly_stats
      `)
      .get() as { earliest: string | null; latest: string | null };

    // Get top gateways by request count
    const topGateways = db
      .prepare(`
        SELECT
          gateway,
          SUM(total_requests) as total_requests,
          ROUND(SUM(successful_requests) * 100.0 / NULLIF(SUM(total_requests), 0), 1) as success_rate,
          ROUND(SUM(latency_sum) / NULLIF(SUM(latency_count), 0), 0) as avg_latency_ms,
          MIN(hour_bucket) as first_seen,
          MAX(hour_bucket) as last_seen
        FROM gateway_hourly_stats
        GROUP BY gateway
        ORDER BY total_requests DESC
        LIMIT 10
      `)
      .all() as Array<{
        gateway: string;
        total_requests: number;
        success_rate: number;
        avg_latency_ms: number;
        first_seen: string;
        last_seen: string;
      }>;

    // Get total requests
    const totals = db
      .prepare(`
        SELECT
          SUM(total_requests) as total_requests,
          SUM(successful_requests) as successful_requests,
          SUM(client_errors) as client_errors,
          SUM(server_errors) as server_errors,
          SUM(timeouts) as timeouts,
          SUM(bytes_transferred) as bytes_transferred
        FROM gateway_hourly_stats
      `)
      .get() as {
        total_requests: number;
        successful_requests: number;
        client_errors: number;
        server_errors: number;
        timeouts: number;
        bytes_transferred: number;
      };

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            database: {
              path: options.dbPath,
              sizeBytes: fileSize,
              statsRows: statsCount.count,
              eventsRows: eventsCount.count,
            },
            summary: {
              uniqueGateways: gatewaysResult.count,
              dateRange: {
                earliest: dateRange.earliest,
                latest: dateRange.latest,
              },
              totals: {
                requests: totals.total_requests || 0,
                successful: totals.successful_requests || 0,
                clientErrors: totals.client_errors || 0,
                serverErrors: totals.server_errors || 0,
                timeouts: totals.timeouts || 0,
                bytesTransferred: totals.bytes_transferred || 0,
              },
            },
            topGateways: topGateways.map((g) => ({
              gateway: g.gateway,
              totalRequests: g.total_requests,
              successRate: g.success_rate,
              avgLatencyMs: g.avg_latency_ms,
              firstSeen: g.first_seen,
              lastSeen: g.last_seen,
            })),
          },
          null,
          2,
        ),
      );
    } else {
      console.log("Wayfinder Router - Telemetry Stats\n");
      console.log(`Database: ${options.dbPath}`);
      console.log(`Size: ${formatBytes(fileSize)}\n`);

      console.log("Tables:");
      console.log(`  gateway_hourly_stats: ${statsCount.count.toLocaleString()} rows`);
      console.log(`  gateway_events: ${eventsCount.count.toLocaleString()} rows`);
      console.log("");

      console.log("Summary:");
      console.log(`  Unique gateways: ${gatewaysResult.count}`);
      if (dateRange.earliest && dateRange.latest) {
        console.log(`  Date range: ${dateRange.earliest} to ${dateRange.latest}`);
      }
      console.log("");

      if (totals.total_requests) {
        console.log("Totals:");
        console.log(`  Total requests: ${(totals.total_requests || 0).toLocaleString()}`);
        console.log(`  Successful: ${(totals.successful_requests || 0).toLocaleString()}`);
        console.log(`  Client errors: ${(totals.client_errors || 0).toLocaleString()}`);
        console.log(`  Server errors: ${(totals.server_errors || 0).toLocaleString()}`);
        console.log(`  Timeouts: ${(totals.timeouts || 0).toLocaleString()}`);
        console.log(
          `  Bytes transferred: ${formatBytes(totals.bytes_transferred || 0)}`,
        );
        console.log("");
      }

      if (topGateways.length > 0) {
        console.log("Top Gateways (by request count):");
        console.log(
          "  Gateway".padEnd(45) +
            "Requests".padStart(12) +
            "Success %".padStart(12) +
            "Avg Latency".padStart(14),
        );
        console.log("  " + "-".repeat(80));
        for (const g of topGateways) {
          const gateway = g.gateway.length > 42 ? g.gateway.slice(0, 39) + "..." : g.gateway;
          console.log(
            `  ${gateway.padEnd(45)}${g.total_requests.toLocaleString().padStart(12)}${(g.success_rate?.toFixed(1) || "N/A").padStart(11)}%${((g.avg_latency_ms?.toFixed(0) || "N/A") + " ms").padStart(14)}`,
          );
        }
      }
    }
  } finally {
    db.close();
  }
}

main();
