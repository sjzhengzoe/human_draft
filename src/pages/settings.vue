<template>
  <div class="settings-page">
    <header class="settings-header">
      <button class="settings-back" @click="goBack">
        <ArrowLeft class="settings-back__icon" :size="20" />
      </button>
      <h1 class="settings-title">设置</h1>
    </header>

    <div class="settings-content">
      <div class="settings-section">
        <div class="settings-section__title">通用</div>
        <div class="settings-list">
          <div class="settings-item">
            <span class="settings-item__label">关于</span>
            <div class="settings-item__right">
              <span class="settings-item__icp">粤ICP备2025373031号</span>
              <ChevronRight class="settings-item__arrow" :size="16" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ArrowLeft, ChevronRight } from "lucide-vue-next";
import { useRouter } from "vue-router";

const router = useRouter();

const goBack = () => {
  router.back();
};
</script>

<style lang="less" scoped>
.settings-page {
  min-height: 100vh;
  background: var(--page-bg);
}

.settings-header {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--panel-border);
  background: var(--panel-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  z-index: 100;
}

.settings-back {
  width: 36px;
  height: 36px;
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

.settings-back__icon {
  color: var(--text-primary);
}

.settings-title {
  position: absolute;
  left: 72px;
  right: 72px;
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 36px;
  text-align: center;
  pointer-events: none;
}

.settings-content {
  padding: 16px;
}

.settings-section {
  margin-bottom: 24px;
}

.settings-section__title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  padding: 8px 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.settings-list {
  background: var(--panel-bg);
  border-radius: 12px;
  border: 1px solid var(--panel-border);
  overflow: hidden;
}

.settings-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--panel-border);
  cursor: pointer;
  transition: background 0.2s;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.02);
  }
}

.settings-item__label {
  font-size: 15px;
  color: var(--text-primary);
}

.settings-item__right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-item__icp {
  font-size: 13px;
  color: var(--text-muted);
}

.settings-item__arrow {
  color: var(--text-muted);
}
</style>
