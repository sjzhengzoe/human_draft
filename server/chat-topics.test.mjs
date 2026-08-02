import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeTopicContent } from "./lib/chat-topics.mjs";

test("chat topic content is trimmed and limited", () => {
  assert.equal(normalizeTopicContent("  最近最开心的事是什么？  "), "最近最开心的事是什么？");
  assert.throws(
    () => normalizeTopicContent("   "),
    (error) => error?.code === "TOPIC_CONTENT_REQUIRED",
  );
  assert.throws(
    () => normalizeTopicContent("话".repeat(121)),
    (error) => error?.code === "TOPIC_CONTENT_TOO_LONG",
  );
});

test("official topic lists prioritize recently edited topics", async () => {
  const source = await readFile(new URL("./lib/chat-topics.mjs", import.meta.url), "utf8");
  const updatedAtDescending = source.match(
    /\.order\("updated_at", \{ ascending: false \}\)/g,
  ) || [];
  assert.equal(updatedAtDescending.length, 2);
});

test("chat topics migration separates official topics from user-owned topics", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/202608020003_chat_topics.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /create table if not exists public\.official_chat_topics/i);
  assert.match(migration, /create table if not exists public\.user_chat_topics/i);
  assert.match(migration, /user_id uuid not null references public\.app_users\(id\) on delete cascade/i);
  assert.match(migration, /official_topic_id uuid references public\.official_chat_topics\(id\) on delete set null/i);
  assert.match(migration, /official_topic_id uuid references public\.official_chat_topics\(id\) on delete set null/i);
  assert.match(migration, /alter table public\.official_chat_topics enable row level security/i);
  assert.match(migration, /alter table public\.user_chat_topics enable row level security/i);
  assert.match(migration, /最近有什么小事，让你觉得生活很可爱/);
});

test("chat topic preference migration stores per-user hidden official topics", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/202608020004_chat_topic_preferences.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /create table if not exists public\.user_hidden_official_chat_topics/i);
  assert.match(migration, /user_id uuid not null references public\.app_users\(id\) on delete cascade/i);
  assert.match(migration, /official_topic_id uuid not null references public\.official_chat_topics\(id\) on delete cascade/i);
  assert.match(migration, /primary key \(user_id, official_topic_id\)/i);
  assert.match(migration, /enable row level security/i);
});

test("additional official chat topic migration seeds twenty questions", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/202608020005_more_chat_topics.sql", import.meta.url),
    "utf8",
  );
  const seededIds = migration.match(/20000000-0000-4000-8000-0000000000\d{2}/g) || [];
  assert.equal(new Set(seededIds).size, 20);
  assert.match(migration, /on conflict do nothing/i);
});

test("curated official chat topic migration seeds fifty unique questions", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/202608020006_curated_chat_topics.sql", import.meta.url),
    "utf8",
  );
  const seededIds = migration.match(/20000000-0000-4000-8000-0000000000\d{2}/g) || [];
  const questions = [...migration.matchAll(/, '([^']+？)', \d+\)/g)].map((match) => match[1]);
  assert.equal(new Set(seededIds).size, 50);
  assert.equal(new Set(questions).size, 50);
  assert.match(migration, /on conflict do nothing/i);
});
