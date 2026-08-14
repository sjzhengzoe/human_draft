import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import sharp from "sharp";

import { config } from "../config.mjs";
import { cosObjectKey, getCosObject } from "../lib/cos-storage.mjs";
import {
  createDish,
  replaceDishImage,
  updateDish,
} from "../domains/menu/dishes.mjs";
import {
  createMenuPlace,
  replaceMenuPlaceImage,
  updateMenuPlace,
} from "../domains/menu/places.mjs";
import { getSupabaseAdmin } from "../lib/supabase.mjs";

const projectRoot = resolve(import.meta.dirname, "../..");
const assetDirectory = resolve(projectRoot, "public/外食图片");
const applyChanges = process.argv.includes("--apply");
const verifyStorage = applyChanges || process.argv.includes("--verify-storage");

const OWNER_ANCHOR_PLACE_NAME = "公司饭堂";
const CATEGORY_NAME = "水果零食";
const PLACE_NAME = "饮品摊";
const PLACE_ASSET = "店铺 · 饮品摊.png";

const drinkItems = [
  {
    name: "苦尽甘来",
    filename: "饮品 · 苦尽甘来.png",
    mealPeriods: ["breakfast", "afternoon_tea"],
    mainIngredients: ["咖啡", "牛奶"],
    introduction: "咖啡苦香与牛奶甜感交融的拿铁。",
    cookingMethods: ["即食"],
    taste: "香",
  },
  {
    name: "美式咖啡",
    filename: "饮品 · 美式咖啡.png",
    mealPeriods: ["breakfast", "afternoon_tea"],
    mainIngredients: ["咖啡"],
    introduction: "清爽利落的美式咖啡。",
    cookingMethods: ["即食"],
    taste: "香",
  },
  {
    name: "椰子水",
    filename: "饮品 · 椰子水.png",
    mealPeriods: ["breakfast", "afternoon_tea"],
    mainIngredients: ["椰子水"],
    introduction: "清甜爽口的天然椰子水。",
    cookingMethods: ["即食"],
    taste: "甜",
  },
  {
    name: "牛奶",
    filename: "饮品 · 牛奶.png",
    mealPeriods: ["breakfast", "afternoon_tea"],
    mainIngredients: ["牛奶"],
    introduction: "醇香顺滑的纯牛奶。",
    cookingMethods: ["即食"],
    taste: "香",
  },
];

function assetPath(filename) {
  return resolve(assetDirectory, filename);
}

async function assertAsset(filename, { width, height }) {
  const path = assetPath(filename);
  const file = await stat(path);
  if (!file.isFile() || file.size === 0) throw new Error(`图片文件无效：${filename}`);
  const metadata = await sharp(path).metadata();
  if (
    metadata.format !== "png"
    || metadata.width !== width
    || metadata.height !== height
  ) {
    throw new Error(`图片规格错误：${filename}，需要 ${width} × ${height} PNG。`);
  }
  return path;
}

async function imageInput(filename) {
  return { buffer: await readFile(assetPath(filename)) };
}

async function findUnique(supabase, table, query, label) {
  let request = supabase.from(table).select(query.select);
  for (const [column, value] of Object.entries(query.equals)) {
    request = request.eq(column, value);
  }
  const { data, error } = await request;
  if (error) throw error;
  if (data.length !== 1) throw new Error(`需要唯一的“${label}”，当前找到 ${data.length} 个。`);
  return data[0];
}

async function listPlaceDishes(supabase, userId, placeId) {
  const { data, error } = await supabase
    .from("dishes")
    .select("id, name, image_path, place_sort_order")
    .eq("user_id", userId)
    .eq("place_id", placeId)
    .order("place_sort_order", { ascending: true });
  if (error) throw error;
  return data;
}

async function audit(supabase) {
  const ownerAnchor = await findUnique(supabase, "menu_places", {
    select: "id, user_id",
    equals: { name: OWNER_ANCHOR_PLACE_NAME, place_type: "outside" },
  }, OWNER_ANCHOR_PLACE_NAME);
  const category = await findUnique(supabase, "dining_scenes", {
    select: "id, name",
    equals: { user_id: ownerAnchor.user_id, name: CATEGORY_NAME },
  }, CATEGORY_NAME);
  const { data: places, error } = await supabase
    .from("menu_places")
    .select("id, user_id, name, outside_category_id, image_path")
    .eq("user_id", ownerAnchor.user_id)
    .eq("name", PLACE_NAME)
    .eq("place_type", "outside");
  if (error) throw error;
  if (places.length > 1) throw new Error(`“${PLACE_NAME}”存在重复店铺，请先人工确认。`);
  const place = places[0] || null;
  const dishes = place ? await listPlaceDishes(supabase, ownerAnchor.user_id, place.id) : [];
  return {
    userId: ownerAnchor.user_id,
    category,
    place,
    dishes,
    summary: {
      placeExists: Boolean(place),
      placeHasImage: Boolean(place?.image_path),
      category: category.name,
      drinkNames: dishes.map((dish) => dish.name),
      drinkImagesPresent: dishes.filter((dish) => dish.image_path).length,
    },
  };
}

async function validateAssets() {
  await Promise.all([
    assertAsset(PLACE_ASSET, { width: 1536, height: 1536 }),
    ...drinkItems.map((item) => assertAsset(item.filename, {
      width: 1536,
      height: 1024,
    })),
  ]);
}

async function apply(supabase, initial) {
  await validateAssets();
  let place = initial.place;
  if (!place) {
    place = await createMenuPlace(
      supabase,
      initial.userId,
      { name: PLACE_NAME, outside_category_id: initial.category.id },
      await imageInput(PLACE_ASSET),
    );
  } else {
    if (place.outside_category_id !== initial.category.id) {
      place = await updateMenuPlace(supabase, initial.userId, place.id, {
        outside_category_id: initial.category.id,
      });
    }
    place = await replaceMenuPlaceImage(
      supabase,
      initial.userId,
      place.id,
      await imageInput(PLACE_ASSET),
    );
  }

  const existingDishes = await listPlaceDishes(supabase, initial.userId, place.id);
  const dishByName = new Map(existingDishes.map((dish) => [dish.name, dish]));
  for (const item of drinkItems) {
    const fields = {
      meal_periods: item.mealPeriods,
      main_ingredients: item.mainIngredients,
      introduction: item.introduction,
      cooking_methods: item.cookingMethods,
      taste: item.taste,
      flavor_options: [],
    };
    const existing = dishByName.get(item.name);
    if (existing) {
      await updateDish(supabase, initial.userId, existing.id, fields);
      await replaceDishImage(
        supabase,
        initial.userId,
        existing.id,
        await imageInput(item.filename),
      );
      continue;
    }
    await createDish(
      supabase,
      initial.userId,
      { name: item.name, place_id: place.id, ...fields },
      await imageInput(item.filename),
    );
  }
}

async function verify(supabase, state) {
  const expectedNames = drinkItems.map((item) => item.name).sort();
  const matchingDishes = state.dishes.filter((dish) => expectedNames.includes(dish.name));
  const actualNames = matchingDishes.map((dish) => dish.name).sort();
  if (
    !state.place
    || state.place.outside_category_id !== state.category.id
    || !state.place.image_path
    || JSON.stringify(actualNames) !== JSON.stringify(expectedNames)
    || matchingDishes.some((dish) => !dish.image_path)
  ) {
    throw new Error("回读校验失败，饮品摊数据未达到预期状态。");
  }
  if (!verifyStorage) return;

  const records = [
    { name: PLACE_NAME, path: state.place.image_path, width: 1536, height: 1536 },
    ...matchingDishes.map((dish) => ({
      name: dish.name,
      path: dish.image_path,
      width: 1536,
      height: 1024,
    })),
  ];
  await Promise.all(records.map(async (record) => {
    const data = await getCosObject(cosObjectKey(config.dishBucket, record.path));
    const metadata = await sharp(data).metadata();
    if (
      metadata.format !== "webp"
      || metadata.width !== record.width
      || metadata.height !== record.height
    ) {
      throw new Error(`线上图片规格错误：${record.name}`);
    }
  }));
  console.log("存储校验完成：5 张图片均可下载，格式与尺寸正确。");
}

async function main() {
  if (!config.supabaseUrl || !config.supabaseSecretKey) {
    throw new Error("请先配置 SUPABASE_URL 和 SUPABASE_SECRET_KEY。");
  }
  const supabase = getSupabaseAdmin();
  const initial = await audit(supabase);
  console.log("更新前审计：", JSON.stringify(initial.summary, null, 2));

  if (!applyChanges) {
    if (initial.place) await verify(supabase, initial);
    console.log("只读审计完成；添加 --apply 后才会上传图片并更新数据。");
    return;
  }

  await apply(supabase, initial);
  const final = await audit(supabase);
  await verify(supabase, final);
  console.log("更新后校验：", JSON.stringify(final.summary, null, 2));
  console.log("饮品摊与饮品图片更新完成。");
}

main().catch((error) => {
  console.error("饮品摊更新失败：", error.message);
  process.exitCode = 1;
});
