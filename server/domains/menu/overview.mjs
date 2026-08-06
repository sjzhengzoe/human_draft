import { assertCondition } from "../../lib/errors.mjs";
import { listDiningScenes } from "../dining/service.mjs";
import { listCategories, listDishes } from "./dishes.mjs";
import { listMenuPlaces } from "./places.mjs";

function resolveCategoryId(requestedId, categories) {
  if (
    typeof requestedId === "string"
    && categories.some((category) => category.id === requestedId)
  ) {
    return requestedId;
  }
  return categories[0]?.id || "";
}

export async function getMenuOverview(supabase, userId, query = {}) {
  const recordType = query.record_type || "home";
  assertCondition(
    recordType === "home" || recordType === "outside",
    400,
    "INVALID_RECORD_TYPE",
    "用餐场景无效。",
  );

  const [categories, outsideCategories, homePlaces] = await Promise.all([
    listCategories(supabase, userId),
    listDiningScenes(supabase, userId),
    listMenuPlaces(supabase, userId, {
      place_type: "home",
      include_dishes: false,
    }),
  ]);
  const homePlaceId = homePlaces[0]?.id || "";
  const activeCategories = recordType === "outside" ? outsideCategories : categories;
  const categoryId = resolveCategoryId(query.category_id, activeCategories);
  const [dishes, outsidePlaces] = recordType === "home"
    ? [
      (await listDishes(supabase, userId, {
        place_id: homePlaceId || undefined,
        category_id: categoryId || undefined,
        record_type: "home",
        sort: "custom",
        page_size: 100,
      })).items,
      [],
    ]
    : [
      [],
      await listMenuPlaces(supabase, userId, {
        place_type: "outside",
        outside_category_id: categoryId || undefined,
      }),
    ];

  return {
    categories,
    outside_categories: outsideCategories,
    home_place_id: homePlaceId,
    active_filter: categoryId ? `${recordType}:${categoryId}` : recordType,
    active_record_type: recordType,
    dishes,
    outside_places: outsidePlaces,
  };
}
