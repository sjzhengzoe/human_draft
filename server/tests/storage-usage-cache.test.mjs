import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("image storage usage is cached per user and deduplicates active requests", async () => {
  const source = await readFile(
    new URL("../../src/services/account.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /STORAGE_USAGE_CACHE_TTL_MS = 5 \* 60 \* 1000/);
  assert.match(source, /storageUsageCache\.uid !== uid/);
  assert.match(source, /storageUsageCache\.revision !== revision/);
  assert.match(source, /pendingStorageUsage\.uid === uid/);
  assert.match(source, /pendingStorageUsage\.revision === revision/);
  assert.match(source, /return pendingStorageUsage\.promise/);
});

test("successful image uploads and deletes invalidate storage usage", async () => {
  const source = await readFile(
    new URL("../../src/services/request.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /options\.method === "DELETE"\) invalidateImageStorageUsage\(\)/);
  assert.match(
    source,
    /response\.statusCode >= 200[\s\S]*?body\.data[\s\S]*?invalidateImageStorageUsage\(\)[\s\S]*?return body\.data/,
  );
});
