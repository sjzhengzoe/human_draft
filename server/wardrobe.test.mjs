import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createWardrobeCategory,
  swapWardrobeCategorySortOrders,
  swapWardrobeItemSortOrders,
} from "./lib/wardrobe.mjs";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const SOURCE_ID = "10000000-0000-4000-8000-000000000002";
const TARGET_ID = "10000000-0000-4000-8000-000000000003";

function createRpcSupabase() {
  const calls = [];
  return {
    calls,
    rpc(name, args) {
      calls.push({ name, args });
      const response = {
        data: name === "create_wardrobe_category_at_end"
          ? {
              id: SOURCE_ID,
              user_id: args.p_user_id,
              name: args.p_name,
              fields: args.p_fields,
              sort_order: 1000,
            }
          : null,
        error: null,
      };
      return {
        single: async () => response,
        then: (resolve, reject) => Promise.resolve(response).then(resolve, reject),
      };
    },
  };
}

test("wardrobe category creation scopes data to the authenticated user", async () => {
  const supabase = createRpcSupabase();
  const category = await createWardrobeCategory(supabase, USER_ID, {
    name: " T 恤 ",
    fields: [{ name: "肩宽" }, { name: "胸围" }],
  });

  assert.equal(supabase.calls.length, 1);
  assert.equal(supabase.calls[0].name, "create_wardrobe_category_at_end");
  assert.equal(supabase.calls[0].args.p_user_id, USER_ID);
  assert.equal(supabase.calls[0].args.p_name, "T 恤");
  assert.deepEqual(category.fields.map((field) => field.name), ["肩宽", "胸围"]);
  category.fields.forEach((field) => {
    assert.match(field.id, /^[0-9a-f-]{36}$/i);
  });
});

test("wardrobe category fields reject duplicate names", async () => {
  const supabase = createRpcSupabase();
  await assert.rejects(
    createWardrobeCategory(supabase, USER_ID, {
      name: "长裤",
      fields: [{ name: "裤长" }, { name: "裤长" }],
    }),
    (error) => error?.statusCode === 400 && error?.code === "DUPLICATE_FIELD",
  );
  assert.equal(supabase.calls.length, 0);
});

test("wardrobe sort swaps always include the authenticated user scope", async () => {
  const supabase = createRpcSupabase();
  await swapWardrobeCategorySortOrders(supabase, USER_ID, {
    source_id: SOURCE_ID,
    target_id: TARGET_ID,
  });
  await swapWardrobeItemSortOrders(supabase, USER_ID, {
    source_id: SOURCE_ID,
    target_id: TARGET_ID,
  });

  assert.deepEqual(
    supabase.calls.map((call) => [call.name, call.args.p_user_id]),
    [
      ["swap_wardrobe_category_sort_orders", USER_ID],
      ["swap_wardrobe_item_sort_orders", USER_ID],
    ],
  );
});

test("wardrobe migration keeps records user-owned and images private", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/202607120001_personal_wardrobe.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /wardrobe_categories[\s\S]*?user_id uuid not null references public\.app_users/i);
  assert.match(migration, /wardrobe_items[\s\S]*?user_id uuid not null references public\.app_users/i);
  assert.match(migration, /'wardrobe-images',[\s\S]*?false,/i);
  assert.match(migration, /hashtextextended\('public\.wardrobe_items:sort_order:' \|\| p_user_id::text, 0\)/);
  assert.match(migration, /unique \(user_id, sort_order\) deferrable initially immediate/i);
});
