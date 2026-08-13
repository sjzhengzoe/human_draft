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

test("personal image responses use signed URLs while avatars remain public", async () => {
  const [dishImages, activities, media, profile] = await Promise.all([
    readProjectFile("server/domains/menu/dish-images.mjs"),
    readProjectFile("server/domains/activities/service.mjs"),
    readProjectFile("server/domains/media/service.mjs"),
    readProjectFile("server/domains/auth/profile.mjs"),
  ]);

  assert.match(dishImages, /createSignedUrlMap/);
  assert.doesNotMatch(dishImages, /getPublicUrl/);
  assert.match(activities, /createSignedUrlMap/);
  assert.doesNotMatch(activities, /getPublicUrl/);
  assert.match(media, /createMediaCoverUrlMap/);
  assert.match(media, /toMediaCoverResponse/);
  assert.match(profile, /avatarBucket\)\.getPublicUrl/);
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
