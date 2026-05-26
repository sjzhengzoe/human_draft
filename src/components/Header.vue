<template>
  <div>
    <header class="header">
      <div class="header__left">
        <button
          type="button"
          class="header__btn"
          @click="toggleTabPanel"
          title="选项"
        >
          <PanelLeft class="header__btn-icon" :size="18" />
        </button>
      </div>
      <div class="header__right">
        <button
          type="button"
          class="header__btn"
          @click="router.push('/settings')"
          title="设置"
        >
          <Settings class="header__btn-icon" :size="18" />
        </button>
      </div>
    </header>

    <!-- 侧边栏遮罩 -->
    <Transition name="fade">
      <div
        v-if="showTabPanel"
        class="sidebar-overlay"
        @click="closeTabPanel"
      ></div>
    </Transition>

    <!-- 左侧滑出面板 -->
    <Transition name="slide-left">
      <div v-if="showTabPanel" class="sidebar-panel">
        <div class="sidebar-panel__header">
          <span class="sidebar-panel__title">功能区</span>
          <button class="sidebar-panel__close" @click="closeTabPanel">
            <X class="sidebar-panel__close-icon" :size="18" />
          </button>
        </div>
        <div class="sidebar-panel__content">
          <div class="sidebar-menu">
            <button
              v-for="item in menuItems"
              :key="item.path"
              :class="[
                'sidebar-menu__item',
                { 'sidebar-menu__item--active': route.path === item.path },
              ]"
              @click="selectFeature(item.path)"
            >
              <component
                :is="item.icon"
                class="sidebar-menu__icon"
                :size="18"
              />
              <span class="sidebar-menu__label">{{ item.label }}</span>
              <ChevronRight class="sidebar-menu__arrow" :size="16" />
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  PanelLeft,
  Settings,
  X,
  ChevronRight,
  BookHeart,
  Video,
  Utensils,
  Ruler,
} from "lucide-vue-next";

const router = useRouter();
const route = useRoute();

const showTabPanel = ref(false);

const menuItems: { path: string; label: string; icon: unknown }[] = [
  { path: "/douyin", label: "抖音模板", icon: Video },
  { path: "/xiaohongshu", label: "小红书模板", icon: BookHeart },
  { path: "/menu", label: "菜单", icon: Utensils },
  { path: "/materials", label: "素材", icon: Ruler },
];

const toggleTabPanel = () => {
  showTabPanel.value = !showTabPanel.value;
};

const closeTabPanel = () => {
  showTabPanel.value = false;
};

const selectFeature = (path: string) => {
  if (route.path !== path) {
    router.push(path);
  }
  closeTabPanel();
};
</script>

<style lang="less" scoped>
.header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  z-index: 200;
  background: rgba(5, 5, 8, 0.85);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
}

.header__left,
.header__right {
  display: flex;
  align-items: center;
}

.header__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.05);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
}

.header__btn-icon {
  color: var(--text-primary);
}

// 侧边栏遮罩
.sidebar-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 300;
}

// 左侧滑出面板
.sidebar-panel {
  position: fixed;
  top: 0;
  left: 0;
  width: 75%;
  max-width: 320px;
  height: 100vh;
  background: var(--panel-bg);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-right: 1px solid var(--panel-border);
  z-index: 400;
  overflow-y: auto;
}

.sidebar-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  border-bottom: 1px solid var(--panel-border);
  position: sticky;
  top: 0;
  background: var(--panel-bg);
}

.sidebar-panel__title {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
}

.sidebar-panel__close {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
}

.sidebar-panel__close-icon {
  color: var(--text-primary);
}

.sidebar-panel__content {
  padding: 12px 0;
}

.sidebar-menu__item {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 16px 20px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 15px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  &--active {
    background: rgba(99, 102, 241, 0.12);
    color: var(--accent);

    .sidebar-menu__icon {
      color: var(--accent);
    }

    .sidebar-menu__arrow {
      color: var(--accent);
    }
  }
}

.sidebar-menu__icon {
  color: var(--text-secondary);
}

.sidebar-menu__label {
  flex: 1;
}

.sidebar-menu__arrow {
  color: var(--text-muted);
}

// 过渡动画
.slide-left-enter-active,
.slide-left-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-left-enter-from,
.slide-left-leave-to {
  transform: translateX(-100%);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
