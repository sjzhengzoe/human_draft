import {
  createDish,
  deleteDish,
  getDishResponse,
  listCategories,
  listDishes,
  reorderDishes,
  replaceDishImage,
  swapDishSortOrders,
  updateDish,
  updatePrintStatus
} from "../domains/menu/dishes.mjs"
import { readMultipartImage } from "../http/multipart-image.mjs"
import { checkUserText } from "../domains/shared/content-security.mjs"
import {
  createMenuPlace,
  deleteMenuPlace,
  getMenuPlace,
  listMenuPlaces,
  reorderMenuPlaces,
  replaceMenuPlaceImage,
  updateMenuPlace
} from "../domains/menu/places.mjs"
import { getMenuOverview } from "../domains/menu/overview.mjs"
import {
  getMenuRanking,
  listMenuFavorites,
  listMenuSchedule,
  replaceMenuFavorites,
  replaceMenuScheduleMeal
} from "../domains/menu/schedule.mjs"

export function registerMenuRoutes(app, context) {
  const { authenticated, contentSecurity, getSupabaseAdmin } = context

  app.get("/api/menu-overview", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      ...await getMenuOverview(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.query || {}
      ),
      can_write: request.auth.user.can_write
    }
  }))

  app.get("/api/menu-schedule", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await listMenuSchedule(
      getSupabaseAdmin(),
      request.auth.user.uid,
      request.query || {}
    )
  }))

  app.put("/api/menu-schedule/meal", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      meal: await replaceMenuScheduleMeal(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.body || {}
      )
    }
  }))

  app.get("/api/menu-ranking", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await getMenuRanking(
      getSupabaseAdmin(),
      request.auth.user.uid,
      request.query || {}
    )
  }))

  app.get("/api/menu-favorites", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: { items: await listMenuFavorites(getSupabaseAdmin(), request.auth.user.uid) }
  }))

  app.put("/api/menu-favorites", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      items: await replaceMenuFavorites(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.body || {}
      )
    }
  }))

  app.get("/api/categories", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: { items: await listCategories(getSupabaseAdmin(), request.auth.user.uid) }
  }))

  app.get("/api/menu-places", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      items: await listMenuPlaces(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.query || {}
      )
    }
  }))

  app.get("/api/menu-places/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      place: await getMenuPlace(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.params.id
      )
    }
  }))

  app.put("/api/menu-places/reorder", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await reorderMenuPlaces(
      getSupabaseAdmin(),
      request.auth.user.uid,
      request.body || {}
    )
  }))

  app.post("/api/menu-places", { preHandler: authenticated }, async (request, reply) => {
    const { fields, image } = await readMultipartImage(request)
    await Promise.all([
      checkUserText(contentSecurity, request.auth.user.openid, fields.name),
      contentSecurity.checkImage(image)
    ])
    const place = await createMenuPlace(
      getSupabaseAdmin(),
      request.auth.user.uid,
      fields,
      image
    )
    return reply.code(201).send({ ok: true, data: { place } })
  })

  app.put("/api/menu-places/:id", { preHandler: authenticated }, async (request) => {
    await checkUserText(contentSecurity, request.auth.user.openid, request.body?.name)
    return {
      ok: true,
      data: {
        place: await updateMenuPlace(
          getSupabaseAdmin(),
          request.auth.user.uid,
          request.params.id,
          request.body || {}
        )
      }
    }
  })

  app.post("/api/menu-places/:id/image", { preHandler: authenticated }, async (request) => {
    const { image } = await readMultipartImage(request)
    await contentSecurity.checkImage(image)
    return {
      ok: true,
      data: {
        place: await replaceMenuPlaceImage(
          getSupabaseAdmin(),
          request.auth.user.uid,
          request.params.id,
          image
        )
      }
    }
  })

  app.delete("/api/menu-places/:id", { preHandler: authenticated }, async (request) => {
    await deleteMenuPlace(getSupabaseAdmin(), request.auth.user.uid, request.params.id)
    return { ok: true, data: { deleted: true } }
  })

  app.get("/api/dishes", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await listDishes(getSupabaseAdmin(), request.auth.user.uid, request.query || {})
  }))

  app.get("/api/dishes/:id", { preHandler: authenticated }, async (request) => {
    const supabase = getSupabaseAdmin()
    return {
      ok: true,
      data: {
        dish: await getDishResponse(
          supabase,
          request.auth.user.uid,
          request.params.id
        )
      }
    }
  })

  app.post("/api/dishes", { preHandler: authenticated }, async (request, reply) => {
    const { fields, image } = await readMultipartImage(request)
    await Promise.all([
      checkUserText(
        contentSecurity,
        request.auth.user.openid,
        fields.name,
        fields.main_ingredients,
        fields.introduction,
        fields.flavor_options
      ),
      contentSecurity.checkImage(image)
    ])
    const dish = await createDish(
      getSupabaseAdmin(),
      request.auth.user.uid,
      fields,
      image
    )
    return reply.code(201).send({ ok: true, data: { dish } })
  })

  app.post("/api/menu-dishes", { preHandler: authenticated }, async (request, reply) => {
    await checkUserText(
      contentSecurity,
      request.auth.user.openid,
      request.body?.name,
      request.body?.main_ingredients,
      request.body?.introduction,
      request.body?.flavor_options
    )
    const dish = await createDish(
      getSupabaseAdmin(),
      request.auth.user.uid,
      request.body || {},
      undefined
    )
    return reply.code(201).send({ ok: true, data: { dish } })
  })

  app.put("/api/dishes/print-status", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await updatePrintStatus(
      getSupabaseAdmin(),
      request.auth.user.uid,
      request.body || {}
    )
  }))

  app.put("/api/dishes/reorder", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await reorderDishes(
      getSupabaseAdmin(),
      request.auth.user.uid,
      request.body || {}
    )
  }))

  app.put("/api/dishes/order/swap", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await swapDishSortOrders(
      getSupabaseAdmin(),
      request.auth.user.uid,
      request.body || {}
    )
  }))

  app.put("/api/dishes/:id", { preHandler: authenticated }, async (request) => {
    await checkUserText(
      contentSecurity,
      request.auth.user.openid,
      request.body?.name,
      request.body?.main_ingredients,
      request.body?.introduction,
      request.body?.flavor_options
    )
    return {
      ok: true,
      data: {
        dish: await updateDish(
          getSupabaseAdmin(),
          request.auth.user.uid,
          request.params.id,
          request.body || {}
        )
      }
    }
  })

  app.post("/api/dishes/:id/image", { preHandler: authenticated }, async (request) => {
    const { image } = await readMultipartImage(request)
    await contentSecurity.checkImage(image)
    return {
      ok: true,
      data: {
        dish: await replaceDishImage(
          getSupabaseAdmin(),
          request.auth.user.uid,
          request.params.id,
          image
        )
      }
    }
  })

  app.delete("/api/dishes/:id", { preHandler: authenticated }, async (request) => {
    await deleteDish(getSupabaseAdmin(), request.auth.user.uid, request.params.id)
    return { ok: true, data: { deleted: true } }
  })
}
