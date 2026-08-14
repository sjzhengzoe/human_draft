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

const COMPANY_PLACE_NAME = "公司饭堂";
const SNACK_PLACE_NAME = "零食小卖部";
const SNACK_CATEGORY_NAME = "水果零食";

const companyDishAssets = new Map([
  ["美餐", "饭堂 · 美餐.png"],
  ["水吧", "饭堂 · 水吧.png"],
  ["鸡蛋灌饼", "饭堂 · 鸡蛋灌饼.png"],
  ["煎饼果子/饭团", "饭堂 · 煎饼果子／饭团.png"],
  ["暖锅小灶", "饭堂 · 暖锅小灶.png"],
  ["每日优选", "饭堂 · 每日优选.png"],
  ["粤食记", "饭堂 · 粤食记.png"],
  ["川湘", "饭堂 · 川湘.png"],
  ["南粉北面", "饭堂 · 南粉北面.png"],
  ["沸沸工坊", "饭堂 · 沸沸工坊.png"],
  ["环球风味", "饭堂 · 环球风味.png"],
]);

const snackItems = [
  {
    name: "酸奶",
    filename: "零食 · 酸奶.png",
    mealPeriods: ["breakfast", "afternoon_tea"],
    mainIngredients: ["酸奶"],
    introduction: "清爽顺滑，适合早餐或下午茶。",
    cookingMethods: ["即食"],
    taste: "酸、甜",
  },
  {
    name: "红枣",
    filename: "零食 · 红枣.png",
    mealPeriods: ["breakfast", "afternoon_tea"],
    mainIngredients: ["红枣"],
    introduction: "自然甜香，随手补充能量。",
    cookingMethods: ["即食"],
    taste: "甜",
  },
  {
    name: "牛肉干",
    filename: "零食 · 牛肉干.png",
    mealPeriods: ["afternoon_tea"],
    mainIngredients: ["牛肉"],
    introduction: "有嚼劲的咸香肉类零食。",
    cookingMethods: ["即食"],
    taste: "咸、香",
  },
];

function assetPath(filename) {
  return resolve(assetDirectory, filename);
}

async function assertAsset(filename, dimensions) {
  const path = assetPath(filename);
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size === 0) {
    throw new Error(`图片文件无效：${filename}`);
  }
  if (dimensions) {
    const image = await sharp(path).metadata();
    if (
      image.format !== "png"
      || image.width !== dimensions.width
      || image.height !== dimensions.height
    ) {
      throw new Error(
        `图片规格错误：${filename}，需要 ${dimensions.width} × ${dimensions.height} PNG。`,
      );
    }
  }
  return path;
}

async function imageInput(filename) {
  return { buffer: await readFile(await assertAsset(filename)) };
}

async function findSingleCompanyPlace(supabase) {
  const { data, error } = await supabase
    .from("menu_places")
    .select("id, user_id, name, place_type, outside_category_id, image_path")
    .eq("name", COMPANY_PLACE_NAME)
    .eq("place_type", "outside");
  if (error) throw error;
  if (data.length !== 1) {
    throw new Error(`需要唯一的“${COMPANY_PLACE_NAME}”，当前找到 ${data.length} 个。`);
  }
  return data[0];
}

async function findSingleCategory(supabase, userId) {
  const { data, error } = await supabase
    .from("dining_scenes")
    .select("id, name")
    .eq("user_id", userId)
    .eq("name", SNACK_CATEGORY_NAME);
  if (error) throw error;
  if (data.length !== 1) {
    throw new Error(`需要唯一的“${SNACK_CATEGORY_NAME}”外食分类，当前找到 ${data.length} 个。`);
  }
  return data[0];
}

async function findPlaceByName(supabase, userId, name) {
  const { data, error } = await supabase
    .from("menu_places")
    .select("id, user_id, name, place_type, outside_category_id, image_path")
    .eq("user_id", userId)
    .eq("name", name)
    .eq("place_type", "outside");
  if (error) throw error;
  if (data.length > 1) throw new Error(`“${name}”存在重复店铺，请先人工确认。`);
  return data[0] || null;
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
  const companyPlace = await findSingleCompanyPlace(supabase);
  const category = await findSingleCategory(supabase, companyPlace.user_id);
  const snackPlace = await findPlaceByName(supabase, companyPlace.user_id, SNACK_PLACE_NAME);
  const companyDishes = await listPlaceDishes(supabase, companyPlace.user_id, companyPlace.id);
  const companyDishByName = new Map(companyDishes.map((dish) => [dish.name, dish]));
  const missingCompanyDishes = [...companyDishAssets.keys()]
    .filter((name) => !companyDishByName.has(name));
  if (missingCompanyDishes.length > 0) {
    throw new Error(`公司饭堂缺少快餐线：${missingCompanyDishes.join("、")}`);
  }

  const snackDishes = snackPlace
    ? await listPlaceDishes(supabase, companyPlace.user_id, snackPlace.id)
    : [];

  return {
    companyPlace,
    category,
    snackPlace,
    companyDishes,
    snackDishes,
    summary: {
      companyPlaceHasImage: Boolean(companyPlace.image_path),
      companyDishCount: companyDishes.length,
      companyDishImagesPresent: companyDishes.filter((dish) => dish.image_path).length,
      snackPlaceExists: Boolean(snackPlace),
      snackPlaceHasImage: Boolean(snackPlace?.image_path),
      snackDishNames: snackDishes.map((dish) => dish.name),
      snackDishImagesPresent: snackDishes.filter((dish) => dish.image_path).length,
    },
  };
}

async function validateAllAssets() {
  const squareFilenames = [
    "店铺 · 公司饭堂.png",
    "店铺 · 零食小卖部.png",
  ];
  const landscapeFilenames = [
    ...companyDishAssets.values(),
    ...snackItems.map((item) => item.filename),
  ];
  await Promise.all([
    ...squareFilenames.map((filename) => assertAsset(filename, {
      width: 1536,
      height: 1536,
    })),
    ...landscapeFilenames.map((filename) => assertAsset(filename, {
      width: 1536,
      height: 1024,
    })),
  ]);
}

async function verifyStoredImages(supabase, state) {
  const snackNames = new Set(snackItems.map((item) => item.name));
  const records = [
    {
      name: state.companyPlace.name,
      path: state.companyPlace.image_path,
      width: 1536,
      height: 1536,
    },
    {
      name: state.snackPlace?.name,
      path: state.snackPlace?.image_path,
      width: 1536,
      height: 1536,
    },
    ...state.companyDishes
      .filter((dish) => companyDishAssets.has(dish.name))
      .map((dish) => ({
        name: dish.name,
        path: dish.image_path,
        width: 1536,
        height: 1024,
      })),
    ...state.snackDishes
      .filter((dish) => snackNames.has(dish.name))
      .map((dish) => ({
        name: dish.name,
        path: dish.image_path,
        width: 1536,
        height: 1024,
      })),
  ];
  if (records.length !== 16 || records.some((record) => !record.path)) {
    throw new Error("线上图片路径不完整，无法执行存储校验。");
  }

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
  console.log("存储校验完成：16 张图片均可下载，格式与尺寸正确。");
}

async function apply(supabase, initial) {
  await validateAllAssets();
  const userId = initial.companyPlace.user_id;

  await replaceMenuPlaceImage(
    supabase,
    userId,
    initial.companyPlace.id,
    await imageInput("店铺 · 公司饭堂.png"),
  );

  const companyDishByName = new Map(initial.companyDishes.map((dish) => [dish.name, dish]));
  for (const [name, filename] of companyDishAssets) {
    await replaceDishImage(
      supabase,
      userId,
      companyDishByName.get(name).id,
      await imageInput(filename),
    );
  }

  let snackPlace = initial.snackPlace;
  if (!snackPlace) {
    snackPlace = await createMenuPlace(
      supabase,
      userId,
      {
        name: SNACK_PLACE_NAME,
        outside_category_id: initial.category.id,
      },
      await imageInput("店铺 · 零食小卖部.png"),
    );
  } else {
    if (snackPlace.outside_category_id !== initial.category.id) {
      snackPlace = await updateMenuPlace(supabase, userId, snackPlace.id, {
        outside_category_id: initial.category.id,
      });
    }
    snackPlace = await replaceMenuPlaceImage(
      supabase,
      userId,
      snackPlace.id,
      await imageInput("店铺 · 零食小卖部.png"),
    );
  }

  const existingSnackDishes = await listPlaceDishes(supabase, userId, snackPlace.id);
  const snackDishByName = new Map(existingSnackDishes.map((dish) => [dish.name, dish]));
  for (const item of snackItems) {
    const existing = snackDishByName.get(item.name);
    const fields = {
      meal_periods: item.mealPeriods,
      main_ingredients: item.mainIngredients,
      introduction: item.introduction,
      cooking_methods: item.cookingMethods,
      taste: item.taste,
      flavor_options: [],
    };
    if (existing) {
      await updateDish(supabase, userId, existing.id, fields);
      await replaceDishImage(
        supabase,
        userId,
        existing.id,
        await imageInput(item.filename),
      );
      continue;
    }
    await createDish(
      supabase,
      userId,
      {
        name: item.name,
        place_id: snackPlace.id,
        ...fields,
      },
      await imageInput(item.filename),
    );
  }
}

async function main() {
  if (!config.supabaseUrl || !config.supabaseSecretKey) {
    throw new Error("请先配置 SUPABASE_URL 和 SUPABASE_SECRET_KEY。");
  }
  const supabase = getSupabaseAdmin();
  const initial = await audit(supabase);
  console.log("更新前审计：", JSON.stringify(initial.summary, null, 2));

  if (!applyChanges) {
    if (verifyStorage) await verifyStoredImages(supabase, initial);
    console.log("只读审计完成；添加 --apply 后才会上传图片并更新数据。");
    return;
  }

  await apply(supabase, initial);
  const final = await audit(supabase);
  const expectedSnackNames = snackItems.map((item) => item.name);
  const finalSnackByName = new Map(final.snackDishes.map((dish) => [dish.name, dish]));
  const verified = final.companyDishes
    .filter((dish) => companyDishAssets.has(dish.name))
    .every((dish) => Boolean(dish.image_path))
    && expectedSnackNames.every((name) => Boolean(finalSnackByName.get(name)?.image_path))
    && final.snackPlace?.outside_category_id === final.category.id
    && Boolean(final.companyPlace.image_path)
    && Boolean(final.snackPlace?.image_path);
  if (!verified) throw new Error("回读校验失败，线上数据未达到预期状态。");

  await verifyStoredImages(supabase, final);
  console.log("更新后校验：", JSON.stringify(final.summary, null, 2));
  console.log("线上外食店铺与图片更新完成。");
}

main().catch((error) => {
  console.error("外食数据更新失败：", error.message);
  process.exitCode = 1;
});
