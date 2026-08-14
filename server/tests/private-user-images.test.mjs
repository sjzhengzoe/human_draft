import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createSignedUrlMap } from "../domains/shared/image-storage.mjs";

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

test("private image inventory is restricted to the service role", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/202608130002_private_image_inventory.sql",
  );
  assert.match(migration, /private_image_storage_inventory/);
  assert.match(migration, /from\s+storage\.objects/i);
  assert.match(migration, /objects\.bucket_id\s*=\s*any\(p_bucket_ids\)/i);
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute[\s\S]*to service_role/i);
});

test("personal image responses use signed URLs while avatars remain public", async () => {
  const [dishImages, activities, media, profile] = await Promise.all([
    readProjectFile("server/domains/menu/dish-images.mjs"),
    readProjectFile("server/domains/activities/service.mjs"),
    readProjectFile("server/domains/media/service.mjs"),
    readProjectFile("server/domains/auth/profile.mjs"),
  ]);

  assert.match(dishImages, /createSignedUrlMap/);
  assert.match(dishImages, /PRIVATE_IMAGE_CACHE_CONTROL_SECONDS/);
  assert.doesNotMatch(dishImages, /getPublicUrl/);
  assert.match(activities, /createSignedUrlMap/);
  assert.doesNotMatch(activities, /getPublicUrl/);
  assert.match(media, /createMediaCoverUrlMap/);
  assert.match(media, /toMediaCoverResponse/);
  assert.doesNotMatch(media, /cover_thumbnail_url/);
  assert.match(profile, /avatarBucket\)\.getPublicUrl/);
});

test("private image uploads do not outlive their signed access window in caches", async () => {
  const sharedStorage = await readProjectFile("server/domains/shared/image-storage.mjs");
  assert.match(sharedStorage, /PRIVATE_IMAGE_CACHE_CONTROL_SECONDS\s*=\s*"3600"/);
  assert.doesNotMatch(sharedStorage, /cacheControl:\s*"31536000"/);
});

test("private bucket rebuild keeps a verified backup until every object is restored", async () => {
  const rebuild = await readProjectFile(
    "server/scripts/rebuild-private-image-buckets.mjs",
  );
  assert.match(rebuild, /process\.argv\.includes\("--apply"\)/);
  assert.match(rebuild, /sha256/);
  assert.match(rebuild, /manifest\.json/);
  assert.match(rebuild, /\.remove\(/);
  assert.match(rebuild, /deleteBucket/);
  assert.match(rebuild, /createBucket/);
  assert.match(rebuild, /public:\s*false/);
  assert.doesNotMatch(rebuild, /emptyBucket/);
  assert.match(rebuild, /after\.count !== before\.count \|\| after\.bytes !== before\.bytes/);
  assert.match(rebuild, /publicResponse\.status < 400 \|\| !signedResponse\.ok/);
  assert.match(rebuild, /await rm\(backupRoot/);
});

test("signed image URL batches stay below the storage API limit", async () => {
  const requests = [];
  const supabase = {
    storage: {
      from(bucketName) {
        return {
          async createSignedUrls(paths, expiresIn) {
            requests.push({ bucketName, paths, expiresIn });
            return {
              data: paths.map((path) => ({ path, signedUrl: `signed:${path}` })),
              error: null,
            };
          },
        };
      },
    },
  };
  const paths = Array.from({ length: 205 }, (_, index) => `users/u/image-${index}.webp`);

  const urls = await createSignedUrlMap(supabase, {
    bucketName: "dish-images",
    paths: [paths[0], ...paths, ""],
    expiresIn: 21_600,
    errorMessage: "读取图片失败。",
  });

  assert.deepEqual(requests.map(({ paths: batch }) => batch.length), [100, 100, 5]);
  assert.equal(requests.every(({ bucketName }) => bucketName === "dish-images"), true);
  assert.equal(requests.every(({ expiresIn }) => expiresIn === 21_600), true);
  assert.equal(urls.size, 205);
  assert.equal(urls.get(paths[204]), `signed:${paths[204]}`);
});
