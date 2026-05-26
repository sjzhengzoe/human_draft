import { createRouter, createWebHistory, Router } from "vue-router";

// 初始化路由
const router: Router = createRouter({
  history: createWebHistory(`/`),
  routes: [
    {
      path: "/",
      redirect: "/douyin",
    },
    {
      path: "/douyin",
      component: () => import("@/pages/douyin/App.vue"),
    },
    {
      path: "/xiaohongshu",
      component: () => import("@/pages/xiaohongshu/App.vue"),
    },
    {
      path: "/menu",
      component: () => import("@/pages/menu/App.vue"),
    },
    {
      path: "/materials",
      component: () => import("@/pages/materials/App.vue"),
    },
    {
      path: "/settings",
      component: () => import("@/pages/settings.vue"),
    },
    {
      path: "/:pathMatch(.*)",
      redirect: "/",
    },
  ],
});

export default router;
