<template>
  <div class="materials-page usePx">
    <Header />

    <main class="materials-main">
      <section class="materials-panel">
        <div class="materials-panel__meta">当前功能区</div>
        <h1 class="materials-panel__title">素材</h1>
        <p class="materials-panel__sub">
          A4 底纸 210 × 297mm，虚线框按真实物理尺寸绘制
        </p>
      </section>

      <section class="paper-stage" aria-label="A4 尺寸素材参考">
        <div class="a4-sheet">
          <div
            v-for="item in materialItems"
            :key="item.name"
            class="size-box"
            :class="`size-box--${item.key}`"
            :style="{
              left: `${item.x}mm`,
              top: `${item.y}mm`,
              width: `${item.displayWidth ?? item.width}mm`,
              height: `${item.displayHeight ?? item.height}mm`,
            }"
          >
            <div class="size-box__name">{{ item.name }}</div>
            <div class="size-box__size">{{ item.width }} × {{ item.height }}mm</div>
          </div>
        </div>
      </section>
    </main>

    <div class="floating-actions">
      <button type="button" class="action-btn" title="打印" @click="handlePrint">
        <Printer class="action-btn__icon" :size="22" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import Header from "@/components/Header.vue";
import { Printer } from "lucide-vue-next";

const materialItems = [
  {
    key: "five-inch",
    name: "5 寸",
    width: 89,
    height: 127,
    x: 0,
    y: 0,
  },
  {
    key: "instax-wide",
    name: "Instax Wide",
    width: 108,
    height: 86,
    x: 102,
    y: 0,
  },
  {
    key: "instax-square",
    name: "Instax Square",
    width: 86,
    height: 72,
    x: 124,
    y: 86,
  },
  {
    key: "three-inch",
    name: "3 寸",
    width: 63,
    height: 89,
    displayWidth: 89,
    displayHeight: 63,
    x: 121,
    y: 158,
  },
  {
    key: "four-inch",
    name: "4 寸",
    width: 76,
    height: 102,
    x: 0,
    y: 127,
  },
  {
    key: "instax-mini",
    name: "Instax Mini",
    width: 54,
    height: 86,
    displayWidth: 86,
    displayHeight: 54,
    x: 0,
    y: 229,
  },
];

const handlePrint = () => {
  window.print();
};
</script>

<style lang="less" scoped>
.usePx.materials-page {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  padding: 60px 16px 84px;
  padding-bottom: calc(84px + env(safe-area-inset-bottom));
  box-sizing: border-box;
  overflow: hidden;
  background:
    radial-gradient(
      circle at 18% 8%,
      rgba(242, 163, 58, 0.12),
      transparent 28%
    ),
    radial-gradient(
      circle at 88% 12%,
      rgba(107, 145, 103, 0.12),
      transparent 30%
    ),
    #050508;
}

.usePx .materials-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  margin-top: 20px;
  overflow: hidden;
}

.usePx .materials-panel {
  flex: 0 0 auto;
  width: min(390px, 100%);
  margin: 0 auto 14px;
}

.usePx .materials-panel__meta {
  margin-bottom: 4px;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1;
}

.usePx .materials-panel__title {
  margin: 0;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
}

.usePx .materials-panel__sub {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.35;
}

.usePx .paper-stage {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 0;
  overflow: hidden;
  container-type: size;
}

.usePx .a4-sheet {
  position: relative;
  width: min(100cqw, 210mm, calc(100cqh * 210 / 297));
  aspect-ratio: 210 / 297;
  box-sizing: border-box;
  background: #ffffff;
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.35);
}

.usePx .a4-sheet::before {
  content: "A4 210 × 297mm";
  position: absolute;
  right: 5mm;
  bottom: 4mm;
  color: #777;
  font-size: 9px;
  line-height: 1;
}

.usePx .size-box {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: 0.35mm dashed #1f2937;
  background: rgba(255, 255, 255, 0.75);
  color: #111827;
  text-align: center;
}

.usePx .size-box__name {
  font-size: 10px;
  font-weight: 700;
  line-height: 1.3;
}

.usePx .size-box__size {
  margin-top: 1mm;
  font-size: 8px;
  line-height: 1.2;
}

.usePx .size-box--five-inch {
  border-color: #dc2626;
}

.usePx .size-box--four-inch {
  border-color: #2563eb;
}

.usePx .size-box--three-inch {
  border-color: #16a34a;
}

.usePx .size-box--instax-wide {
  border-color: #d97706;
}

.usePx .size-box--instax-square {
  border-color: #db2777;
}

.usePx .size-box--instax-mini {
  border-color: #7c3aed;
}

.usePx .floating-actions {
  position: fixed;
  bottom: calc(20px + env(safe-area-inset-bottom));
  left: 50%;
  z-index: 100;
  display: flex;
  gap: 12px;
  padding: 8px;
  border: 1px solid var(--panel-border);
  border-radius: 40px;
  background: rgba(17, 19, 31, 0.8);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  transform: translateX(-50%);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.usePx .action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s;

  &:active {
    transform: scale(0.95);
    background: rgba(99, 102, 241, 0.15);
  }
}

.usePx .action-btn__icon {
  color: var(--text-primary);
  line-height: 1;
}

@media print {
  @page {
    size: A4 portrait;
    margin: 0;
  }

  :global(body) {
    margin: 0;
    background: #ffffff;
  }

  :global(.header) {
    display: none !important;
  }

  .usePx.materials-page {
    position: static;
    display: block;
    width: 210mm;
    height: 297mm;
    padding: 0;
    overflow: visible;
    background: #ffffff;
  }

  .usePx .materials-main,
  .usePx .paper-stage {
    display: block;
    width: 210mm;
    height: 297mm;
    margin: 0;
    overflow: visible;
  }

  .usePx .materials-panel,
  .usePx .floating-actions {
    display: none;
  }

  .usePx .a4-sheet {
    width: 210mm;
    height: 297mm;
    box-shadow: none;
  }
}
</style>
