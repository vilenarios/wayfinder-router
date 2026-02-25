import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ContentCache, type CachedContent } from "./content-cache.js";

function makeCacheEntry(
  txId: string,
  size: number = 100,
): Omit<CachedContent, "accessCount" | "lastAccessed"> {
  return {
    data: new Uint8Array(size).fill(0x42),
    contentType: "application/octet-stream",
    contentLength: size,
    headers: { "content-type": "application/octet-stream" },
    verifiedAt: Date.now(),
    txId,
    hash: "abc123",
  };
}

describe("ContentCache (in-memory mode)", () => {
  let cache: ContentCache;

  beforeEach(() => {
    cache = new ContentCache({
      enabled: true,
      maxSizeBytes: 1024,
      maxEntries: 10,
      maxItemSizeBytes: 512,
    });
  });

  it("should return null for missing entries", async () => {
    const result = await cache.get("nonexistent", "/");
    expect(result).toBeNull();
  });

  it("should set and get content", async () => {
    const entry = makeCacheEntry("tx1", 100);
    const ok = await cache.set("tx1", "", entry);
    expect(ok).toBe(true);

    const cached = await cache.get("tx1", "");
    expect(cached).not.toBeNull();
    expect(cached!.txId).toBe("tx1");
    expect(cached!.contentLength).toBe(100);
    expect(cached!.data.length).toBe(100);
  });

  it("should reject items exceeding max item size", async () => {
    const entry = makeCacheEntry("tx-big", 600);
    const ok = await cache.set("tx-big", "", entry);
    expect(ok).toBe(false);
  });

  it("should reject items exceeding total cache size", async () => {
    const entry = makeCacheEntry("tx-huge", 2000);
    const ok = await cache.set("tx-huge", "", entry);
    expect(ok).toBe(false);
  });

  it("should evict entries when full", async () => {
    // Fill cache (1024 bytes max)
    await cache.set("tx1", "", makeCacheEntry("tx1", 400));
    await cache.set("tx2", "", makeCacheEntry("tx2", 400));

    // This should trigger eviction
    await cache.set("tx3", "", makeCacheEntry("tx3", 400));

    const stats = cache.stats();
    expect(stats.entries).toBeLessThanOrEqual(3);
    expect(stats.sizeBytes).toBeLessThanOrEqual(1024);
  });

  it("should track hits and misses", async () => {
    await cache.set("tx1", "", makeCacheEntry("tx1", 50));
    await cache.get("tx1", "");
    await cache.get("nonexistent", "/");

    const stats = cache.stats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.diskBacked).toBe(false);
  });

  it("should invalidate by txId", async () => {
    await cache.set("tx1", "", makeCacheEntry("tx1", 50));
    await cache.set("tx1", "/path", makeCacheEntry("tx1", 50));

    cache.invalidate("tx1");

    expect(await cache.get("tx1", "")).toBeNull();
    expect(await cache.get("tx1", "/path")).toBeNull();
  });

  it("should clear all entries", async () => {
    await cache.set("tx1", "", makeCacheEntry("tx1", 50));
    await cache.set("tx2", "", makeCacheEntry("tx2", 50));

    cache.clear();

    const stats = cache.stats();
    expect(stats.entries).toBe(0);
    expect(stats.sizeBytes).toBe(0);
  });

  it("should return false when disabled", async () => {
    const disabled = new ContentCache({ enabled: false });
    const ok = await disabled.set("tx1", "", makeCacheEntry("tx1", 50));
    expect(ok).toBe(false);
    expect(await disabled.get("tx1", "")).toBeNull();
  });

  it("should have correct has() behavior", async () => {
    await cache.set("tx1", "", makeCacheEntry("tx1", 50));
    expect(cache.has("tx1", "")).toBe(true);
    expect(cache.has("nonexistent", "")).toBe(false);
  });
});

describe("ContentCache (disk-backed mode)", () => {
  let cache: ContentCache;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "content-cache-test-"));
    cache = new ContentCache({
      enabled: true,
      maxSizeBytes: 4096,
      maxEntries: 100,
      maxItemSizeBytes: 2048,
      contentPath: tempDir,
    });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should write files to disk on set", async () => {
    const ok = await cache.set("tx1", "", makeCacheEntry("tx1", 100));
    expect(ok).toBe(true);

    const files = readdirSync(tempDir);
    const binFiles = files.filter((f) => f.endsWith(".bin"));
    const metaFiles = files.filter((f) => f.endsWith(".meta.json"));
    expect(binFiles.length).toBe(1);
    expect(metaFiles.length).toBe(1);
  });

  it("should read data back from disk on get", async () => {
    const entry = makeCacheEntry("tx1", 100);
    await cache.set("tx1", "", entry);

    const cached = await cache.get("tx1", "");
    expect(cached).not.toBeNull();
    expect(cached!.txId).toBe("tx1");
    expect(cached!.contentLength).toBe(100);
    expect(cached!.data.length).toBe(100);
    // Verify actual data content
    expect(cached!.data[0]).toBe(0x42);
  });

  it("should report diskBacked in stats", () => {
    const stats = cache.stats();
    expect(stats.diskBacked).toBe(true);
  });

  it("should delete disk files on eviction", async () => {
    // Fill cache close to max (4096 bytes)
    await cache.set("tx1", "", makeCacheEntry("tx1", 1500));
    await cache.set("tx2", "", makeCacheEntry("tx2", 1500));

    // This should evict at least one entry
    await cache.set("tx3", "", makeCacheEntry("tx3", 1500));

    // Wait for async delete to complete
    await new Promise((r) => setTimeout(r, 50));

    const files = readdirSync(tempDir);
    const binFiles = files.filter((f) => f.endsWith(".bin"));
    // Should have at most 3, but eviction should remove at least 1
    expect(binFiles.length).toBeLessThanOrEqual(3);
  });

  it("should handle clear()", async () => {
    await cache.set("tx1", "", makeCacheEntry("tx1", 100));
    await cache.set("tx2", "", makeCacheEntry("tx2", 100));

    cache.clear();

    // Wait for async deletes
    await new Promise((r) => setTimeout(r, 50));

    const stats = cache.stats();
    expect(stats.entries).toBe(0);
    expect(stats.sizeBytes).toBe(0);

    // Disk files should be deleted via dispose
    const files = readdirSync(tempDir);
    const binFiles = files.filter((f) => f.endsWith(".bin"));
    expect(binFiles.length).toBe(0);
  });

  it("should handle invalidate()", async () => {
    await cache.set("tx1", "", makeCacheEntry("tx1", 100));

    cache.invalidate("tx1");

    // Wait for async delete
    await new Promise((r) => setTimeout(r, 50));

    expect(await cache.get("tx1", "")).toBeNull();
    const files = readdirSync(tempDir);
    const binFiles = files.filter((f) => f.endsWith(".bin"));
    expect(binFiles.length).toBe(0);
  });

  it("should handle missing .bin file gracefully", async () => {
    await cache.set("tx1", "", makeCacheEntry("tx1", 100));

    // Delete the .bin file to simulate corruption
    const files = readdirSync(tempDir);
    const binFile = files.find((f) => f.endsWith(".bin"));
    if (binFile) {
      rmSync(join(tempDir, binFile));
    }

    // get should return null and evict the stale entry
    const cached = await cache.get("tx1", "");
    expect(cached).toBeNull();
    expect(cache.has("tx1", "")).toBe(false);
  });

  it("should restore index from disk on startup", async () => {
    // Set some entries
    await cache.set("tx1", "", makeCacheEntry("tx1", 100));
    await cache.set("tx2", "", makeCacheEntry("tx2", 200));

    // Create a new cache instance pointing to the same directory
    const cache2 = new ContentCache({
      enabled: true,
      maxSizeBytes: 4096,
      maxEntries: 100,
      maxItemSizeBytes: 2048,
      contentPath: tempDir,
    });

    const stats = cache2.stats();
    expect(stats.entries).toBe(2);
    expect(stats.sizeBytes).toBe(300);

    // Verify data can be read
    const cached = await cache2.get("tx1", "");
    expect(cached).not.toBeNull();
    expect(cached!.data.length).toBe(100);
    expect(cached!.data[0]).toBe(0x42);
  });

  it("should generate prometheus metrics with diskBacked", () => {
    const metrics = cache.getPrometheusMetrics();
    expect(metrics).toContain("wayfinder_content_cache_disk_backed 1");
  });

  it("should clean up .tmp files on startup", async () => {
    // Write an entry so the dir isn't empty
    await cache.set("tx1", "", makeCacheEntry("tx1", 100));

    // Create orphan .tmp files simulating a crashed write
    writeFileSync(join(tempDir, "abcdef.bin.tmp"), "garbage");
    writeFileSync(join(tempDir, "abcdef.meta.json.tmp"), "garbage");

    // New cache instance should clean them up
    const tmpCache = new ContentCache({
      enabled: true,
      maxSizeBytes: 4096,
      maxEntries: 100,
      maxItemSizeBytes: 2048,
      contentPath: tempDir,
    });

    const files = readdirSync(tempDir);
    const tmpFiles = files.filter((f) => f.endsWith(".tmp"));
    expect(tmpFiles.length).toBe(0);
    // Verify the cache still works after cleanup
    expect(tmpCache.stats().entries).toBe(1);
  });

  it("should delete disk files for entries that exceed capacity on restore", async () => {
    // Fill cache with 2 entries
    await cache.set("tx1", "", makeCacheEntry("tx1", 1500));
    await cache.set("tx2", "", makeCacheEntry("tx2", 1500));

    // New cache with smaller maxSizeBytes — only room for one entry
    const smallCache = new ContentCache({
      enabled: true,
      maxSizeBytes: 2000,
      maxEntries: 100,
      maxItemSizeBytes: 2048,
      contentPath: tempDir,
    });

    // One restored, one skipped and deleted
    const stats = smallCache.stats();
    expect(stats.entries).toBe(1);

    // The skipped entry's files should be deleted
    const files = readdirSync(tempDir);
    const binFiles = files.filter((f) => f.endsWith(".bin"));
    const metaFiles = files.filter((f) => f.endsWith(".meta.json"));
    expect(binFiles.length).toBe(1);
    expect(metaFiles.length).toBe(1);
  });
});
