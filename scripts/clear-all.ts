#!/usr/bin/env bun
/**
 * Clear All Data
 *
 * Clears all persistent data:
 * - Telemetry database (gateway stats and events)
 * - Content cache directory (if CONTENT_CACHE_PATH is set)
 *
 * Note: In-memory caches (ArNS, manifests, gateway health, temperature)
 * are cleared automatically when the server restarts.
 *
 * Usage:
 *   bun scripts/clear-all.ts [options]
 *
 * Options:
 *   --dry-run         Preview what would be deleted without making changes
 *   --telemetry-only  Only clear telemetry database
 *   --cache-only      Only clear content cache directory
 *   --yes, -y         Skip confirmation prompt
 *   --help            Show this help message
 */

import { existsSync, statSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import * as readline from "node:readline";

interface Options {
  dryRun: boolean;
  telemetryOnly: boolean;
  cacheOnly: boolean;
  skipConfirm: boolean;
  help: boolean;
  telemetryPath: string;
  cachePath: string;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    dryRun: false,
    telemetryOnly: false,
    cacheOnly: false,
    skipConfirm: false,
    help: false,
    telemetryPath: process.env.TELEMETRY_DB_PATH || "./data/telemetry.db",
    cachePath: process.env.CONTENT_CACHE_PATH || "",
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--telemetry-only":
        options.telemetryOnly = true;
        break;
      case "--cache-only":
        options.cacheOnly = true;
        break;
      case "--yes":
      case "-y":
        options.skipConfirm = true;
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
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function showHelp(): void {
  console.log(`
Clear All Data

Clears all persistent data:
- Telemetry database (gateway stats and events)
- Content cache directory (if CONTENT_CACHE_PATH is set)

Note: In-memory caches (ArNS, manifests, gateway health, temperature)
are cleared automatically when the server restarts.

Usage:
  bun scripts/clear-all.ts [options]

Options:
  --dry-run         Preview what would be deleted without making changes
  --telemetry-only  Only clear telemetry database
  --cache-only      Only clear content cache directory
  --yes, -y         Skip confirmation prompt
  --help, -h        Show this help message

Environment Variables:
  TELEMETRY_DB_PATH     Path to telemetry database (default: ./data/telemetry.db)
  CONTENT_CACHE_PATH    Path to content cache directory (default: empty = in-memory only)

Examples:
  bun scripts/clear-all.ts --dry-run
  bun scripts/clear-all.ts --yes
  bun scripts/clear-all.ts --telemetry-only
`);
}

function getDirSize(dirPath: string): { size: number; files: number } {
  let size = 0;
  let files = 0;

  function walkDir(currentPath: string) {
    const entries = readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else {
        size += statSync(fullPath).size;
        files++;
      }
    }
  }

  if (existsSync(dirPath)) {
    walkDir(dirPath);
  }

  return { size, files };
}

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

async function main(): Promise<void> {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  console.log("Wayfinder Router - Clear All Data\n");

  // Collect what will be cleared
  const actions: Array<{ type: string; path: string; size: number; details: string }> = [];

  // Check telemetry database
  if (!options.cacheOnly && existsSync(options.telemetryPath)) {
    const size = statSync(options.telemetryPath).size;
    const db = new Database(options.telemetryPath, { readonly: true });
    const statsCount = db
      .prepare("SELECT COUNT(*) as count FROM gateway_hourly_stats")
      .get() as { count: number };
    const eventsCount = db
      .prepare("SELECT COUNT(*) as count FROM gateway_events")
      .get() as { count: number };
    db.close();

    actions.push({
      type: "Telemetry DB",
      path: options.telemetryPath,
      size,
      details: `${statsCount.count.toLocaleString()} stats, ${eventsCount.count.toLocaleString()} events`,
    });
  }

  // Check content cache directory
  if (!options.telemetryOnly && options.cachePath && existsSync(options.cachePath)) {
    const { size, files } = getDirSize(options.cachePath);
    actions.push({
      type: "Content Cache",
      path: options.cachePath,
      size,
      details: `${files.toLocaleString()} files`,
    });
  }

  // Show what will be cleared
  if (actions.length === 0) {
    console.log("Nothing to clear.");
    if (!options.cachePath) {
      console.log("\nNote: CONTENT_CACHE_PATH is not set (using in-memory cache only)");
    }
    process.exit(0);
  }

  console.log("Data to be cleared:\n");
  let totalSize = 0;
  for (const action of actions) {
    console.log(`  ${action.type}:`);
    console.log(`    Path: ${action.path}`);
    console.log(`    Size: ${formatBytes(action.size)}`);
    console.log(`    Details: ${action.details}`);
    console.log("");
    totalSize += action.size;
  }
  console.log(`Total: ${formatBytes(totalSize)}\n`);

  if (options.dryRun) {
    console.log("[DRY RUN] No changes made. Run without --dry-run to execute.");
    process.exit(0);
  }

  // Confirm unless --yes flag
  if (!options.skipConfirm) {
    const confirmed = await confirm("Are you sure you want to delete this data?");
    if (!confirmed) {
      console.log("\nCancelled.");
      process.exit(0);
    }
    console.log("");
  }

  // Execute deletions
  for (const action of actions) {
    if (action.type === "Telemetry DB") {
      console.log(`Clearing telemetry database...`);
      const db = new Database(action.path);
      db.prepare("DELETE FROM gateway_hourly_stats").run();
      db.prepare("DELETE FROM gateway_events").run();
      db.run("VACUUM");
      db.close();
      console.log(`  Cleared and vacuumed: ${action.path}`);
    } else if (action.type === "Content Cache") {
      console.log(`Clearing content cache directory...`);
      rmSync(action.path, { recursive: true, force: true });
      console.log(`  Deleted: ${action.path}`);
    }
  }

  console.log("\nDone! Cleared all persistent data.");
  console.log("\nNote: Restart the server to clear in-memory caches.");
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
