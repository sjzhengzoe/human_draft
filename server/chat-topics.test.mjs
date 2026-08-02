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

test("chat topics migration separates official topics from user-owned topics", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/202608020003_chat_topics.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /create table if not exists public\.official_chat_topics/i);
  assert.match(migration, /create table if not exists public\.user_chat_topics/i);
  assert.match(migration, /user_id uuid not null references public\.app_users\(id\) on delete cascade/i);
  assert.match(migration, /official_topic_id uuid references public\.official_chat_topics\(id\) on delete set null/i);
  assert.match(migration, /alter table public\.official_chat_topics enable row level security/i);
  assert.match(migration, /alter table public\.user_chat_topics enable row level security/i);
  assert.match(migration, /最近有什么小事，让你觉得生活很可爱/);
});
