#!/usr/bin/env bun
/**
 * Clear Telemetry Database
 *
 * Clears gateway stats and events from the SQLite telemetry database.
 * Use --dry-run to preview what would be deleted.
 *
 * Usage:
 *   bun scripts/clear-telemetry.ts [options]
 *
 * Options:
 *   --dry-run     Preview what would be deleted without making changes
 *   --stats-only  Only clear gateway_hourly_stats table
 *   --events-only Only clear gateway_events table
 *   --path <path> Override TELEMETRY_DB_PATH (default: ./data/telemetry.db)
 *   --help        Show this help message
 */

import { existsSync, unlinkSync, statSync } from "node:fs";
import { Database } from "bun:sqlite";

interface Options {
  dryRun: boolean;
  statsOnly: boolean;
  eventsOnly: boolean;
  dbPath: string;
  help: boolean;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    dryRun: false,
    statsOnly: false,
    eventsOnly: false,
    dbPath: process.env.TELEMETRY_DB_PATH || "./data/telemetry.db",
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--stats-only":
        options.statsOnly = true;
        break;
      case "--events-only":
        options.eventsOnly = true;
        break;
      case "--path":
        options.dbPath = args[++i];
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
Clear Telemetry Database

Clears gateway stats and events from the SQLite telemetry database.

Usage:
  bun scripts/clear-telemetry.ts [options]

Options:
  --dry-run     Preview what would be deleted without making changes
  --stats-only  Only clear gateway_hourly_stats table
  --events-only Only clear gateway_events table
  --path <path> Override TELEMETRY_DB_PATH (default: ./data/telemetry.db)
  --help, -h    Show this help message

Examples:
  bun scripts/clear-telemetry.ts --dry-run
  bun scripts/clear-telemetry.ts --stats-only
  bun scripts/clear-telemetry.ts --path ./custom/path/telemetry.db
`);
}

function main(): void {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  console.log("Wayfinder Router - Clear Telemetry Database\n");

  // Check if database exists
  if (!existsSync(options.dbPath)) {
    console.log(`Database not found: ${options.dbPath}`);
    console.log("Nothing to clear.");
    process.exit(0);
  }

  // Get file size before
  const sizeBefore = statSync(options.dbPath).size;
  console.log(`Database: ${options.dbPath}`);
  console.log(`Size: ${formatBytes(sizeBefore)}\n`);

  // Open database
  const db = new Database(options.dbPath);

  try {
    // Get current counts
    const statsCount = db
      .prepare("SELECT COUNT(*) as count FROM gateway_hourly_stats")
      .get() as { count: number };
    const eventsCount = db
      .prepare("SELECT COUNT(*) as count FROM gateway_events")
      .get() as { count: number };

    console.log("Current data:");
    console.log(`  gateway_hourly_stats: ${statsCount.count.toLocaleString()} rows`);
    console.log(`  gateway_events: ${eventsCount.count.toLocaleString()} rows`);
    console.log("");

    if (options.dryRun) {
      console.log("[DRY RUN] Would delete:");
      if (!options.eventsOnly) {
        console.log(`  - ${statsCount.count.toLocaleString()} rows from gateway_hourly_stats`);
      }
      if (!options.statsOnly) {
        console.log(`  - ${eventsCount.count.toLocaleString()} rows from gateway_events`);
      }
      console.log("\nNo changes made. Run without --dry-run to execute.");
    } else {
      // Clear tables
      let deletedStats = 0;
      let deletedEvents = 0;

      if (!options.eventsOnly) {
        const result = db.prepare("DELETE FROM gateway_hourly_stats").run();
        deletedStats = result.changes;
        console.log(`Deleted ${deletedStats.toLocaleString()} rows from gateway_hourly_stats`);
      }

      if (!options.statsOnly) {
        const result = db.prepare("DELETE FROM gateway_events").run();
        deletedEvents = result.changes;
        console.log(`Deleted ${deletedEvents.toLocaleString()} rows from gateway_events`);
      }

      // Vacuum to reclaim space
      console.log("\nVacuuming database to reclaim space...");
      db.run("VACUUM");

      // Get file size after
      db.close();
      const sizeAfter = statSync(options.dbPath).size;
      const saved = sizeBefore - sizeAfter;

      console.log(`\nSpace reclaimed: ${formatBytes(saved)}`);
      console.log(`New size: ${formatBytes(sizeAfter)}`);
      console.log("\nDone!");
    }
  } finally {
    try {
      db.close();
    } catch {
      // Already closed
    }
  }
}

main();
