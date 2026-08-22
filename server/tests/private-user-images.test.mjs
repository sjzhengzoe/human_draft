import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createSignedUrlMap,
  getUserImageStorageUsage,
} from "../domains/shared/image-storage.mjs";
import {
  cosObjectKey,
  setCosStorageTestAdapter,
} from "../lib/cos-storage.mjs";

const projectRoot = new URL("../../", import.meta.url);

async function readProjectFile(path) {
  return readFile(new URL(path, projectRoot), "utf8");
}

test("personal image migration makes only account-associated buckets private", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/202608130001_private_user_images.sql",
  );

  assert.match(migration, /update\s+storage\.buckets[\s\S]*?set\s+public\s*=\s*false/i);
  for (const bucket of ["dish-images", "activity-images", "media-covers"]) {
    assert.match(migration, new RegExp(`['\"]${bucket}['\"]`));
  }
  assert.doesNotMatch(migration, /user-avatars/);
  assert.doesNotMatch(migration, /delete\s+from|truncate|drop\s+table|storage\.objects/i);
});

test("COS image asset ledger is private and replaces Storage inventory RPCs", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/20260814120830_cos_image_assets.sql",
  );
  assert.match(migration, /create table public\.image_assets/i);
  assert.match(migration, /primary key/i);
  assert.match(migration, /references public\.app_users\(id\) on delete cascade/i);
  assert.match(migration, /create index image_assets_user_module_idx[\s\S]*user_id, module/i);
  assert.match(migration, /alter table public\.image_assets enable row level security/i);
  assert.match(migration, /get_user_image_storage_usage/i);
  assert.match(migration, /revoke all on table public\.image_assets from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert, update, delete[\s\S]*to service_role/i);
  assert.match(migration, /drop function if exists public\.private_image_storage_inventory/i);
  assert.match(migration, /drop function if exists public\.admin_image_storage_inventory/i);
});

test("personal image responses and uploaded avatars use signed URLs", async () => {
  const [dishImages, activities, media, profile] = await Promise.all([
    readProjectFile("server/domains/menu/dish-images.mjs"),
    readProjectFile("server/domains/activities/service.mjs"),
    readProjectFile("server/domains/media/service.mjs"),
    readProjectFile("server/domains/auth/profile.mjs"),
  ]);

  assert.match(dishImages, /createSignedUrlMap/);
  assert.match(dishImages, /uploadStandardImage/);
  assert.doesNotMatch(dishImages, /getPublicUrl/);
  assert.match(activities, /createSignedUrlMap/);
  assert.doesNotMatch(activities, /getPublicUrl/);
  assert.match(media, /createMediaCoverUrlMap/);
  assert.match(media, /toMediaCoverResponse/);
  assert.doesNotMatch(media, /cover_thumbnail_url/);
  assert.match(profile, /resolveUserAvatarUrl/);
  assert.match(profile, /createSignedUrlMap/);
  assert.doesNotMatch(profile, /getPublicUrl/);
});

test("private image uploads do not outlive their signed access window in caches", async () => {
  const sharedStorage = await readProjectFile("server/domains/shared/image-storage.mjs");
  assert.match(sharedStorage, /PRIVATE_IMAGE_CACHE_CONTROL_SECONDS\s*=\s*"18000"/);
  assert.doesNotMatch(sharedStorage, /cacheControl:\s*"31536000"/);
});

test("COS keeps the logical bucket in every object key", () => {
  assert.equal(
    cosObjectKey("dish-images", "/users/u/example.webp"),
    "dish-images/users/u/example.webp",
  );
  assert.equal(
    cosObjectKey("key-moment-images/", "users/u/moment.webp"),
    "key-moment-images/users/u/moment.webp",
  );
});

test("signed image URLs come directly from COS without Supabase Storage", async () => {
  const requests = [];
  setCosStorageTestAdapter({
    async getSignedObjectUrl(key, expiresIn) {
      requests.push({ key, expiresIn });
      return `signed:${key}`;
    },
  });
  const paths = Array.from({ length: 205 }, (_, index) => `users/u/image-${index}.webp`);

  const urls = await createSignedUrlMap({
    bucketName: "dish-images",
    paths: [paths[0], ...paths, ""],
    expiresIn: 21_600,
    errorMessage: "读取图片失败。",
  });

  assert.equal(requests.length, 205);
  assert.equal(requests.every(({ key }) => key.startsWith("dish-images/users/u/")), true);
  assert.equal(requests.every(({ expiresIn }) => expiresIn === 21_600), true);
  assert.equal(urls.size, 205);
  assert.equal(urls.get(paths[204]), `signed:dish-images/${paths[204]}`);

  const reusedUrls = await createSignedUrlMap({
    bucketName: "dish-images",
    paths,
    expiresIn: 21_600,
    errorMessage: "读取图片失败。",
  });
  assert.equal(requests.length, 205);
  assert.equal(reusedUrls.get(paths[0]), `signed:dish-images/${paths[0]}`);
});

test("storage usage is aggregated from the authenticated user's asset ledger", async () => {
  const calls = [];
  const supabase = {
    async rpc(name, params) {
      calls.push({ name, params });
      return {
        data: [
          { module: "menu", image_count: 1, used_bytes: 1024 },
          { module: "activities", image_count: 0, used_bytes: 0 },
          { module: "media", image_count: 1, used_bytes: 2048 },
          { module: "wardrobe", image_count: 0, used_bytes: 0 },
          { module: "key_moments", image_count: 0, used_bytes: 0 },
          { module: "avatars", image_count: 0, used_bytes: 0 },
        ],
        error: null,
      };
    },
  };

  const usage = await getUserImageStorageUsage(supabase, "user-1");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "get_user_image_storage_usage");
  assert.equal(calls[0].params.p_uid, "user-1");
  assert.equal(usage.plan, "public_beta");
  assert.equal(usage.used_bytes, 3072);
  assert.equal(usage.image_count, 2);
  assert.equal(usage.quota_bytes, 100 * 1024 * 1024);
  assert.equal(usage.warning_bytes, 80 * 1024 * 1024);
  assert.equal(usage.remaining_bytes, 100 * 1024 * 1024 - 3072);
  assert.equal(usage.is_near_limit, false);
  assert.equal(usage.modules.find((item) => item.key === "menu").used_bytes, 1024);
  assert.equal(usage.modules.find((item) => item.key === "media").image_count, 1);
});
