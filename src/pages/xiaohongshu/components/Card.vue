<template>
  <div class="card-box">
    <div class="card-box__preview custom-scrollbar">
      <Swiper
        ref="swiperRef"
        :modules="modules"
        :slides-per-view="1"
        :space-between="12"
        :speed="300"
        :touch-ratio="1"
        :breakpoints="breakpoints"
        class="card-swiper"
      >
        <SwiperSlide
          v-for="(item, idx) in slides"
          :key="idx"
          class="card-slide"
        >
          <div class="card-item">
            <div :id="`pic_${idx}`" class="pic-box pic-box--xiaohongshu">
              <div class="sub-title">{{ getSlideOrder(item, idx) }}</div>
              <div class="content-body">
                <p
                  v-for="(paragraph, i) in getParagraphs(item)"
                  :key="i"
                  class="content-paragraph"
                >
                  {{ paragraph }}
                </p>
              </div>
            </div>
          </div>
        </SwiperSlide>
      </Swiper>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useStore } from "../store";
import { Swiper, SwiperSlide } from "swiper/vue";
import "swiper/css";

const store = useStore();
const formData = computed(() => store.formData);
const slides = computed(() => getContentSlides(formData.value.content));
const getParagraphs = (text: string) =>
  getParagraphLines(removeFirstLine(text));
const getSlideOrder = (text: string, index: number) =>
  getFirstLine(text) || String(index + 1).padStart(2, "0");
const getParagraphLines = (text: string) =>
  normalizeText(text)
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n"),
    )
    .filter(Boolean);
const normalizeText = (text: string) => text.replace(/\r\n/g, "\n");
const pageNumberPattern = /^(?:0\d|1\d)$/;
const getFirstLine = (text: string) =>
  normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
const removeFirstLine = (text: string) => {
  const lines = normalizeText(text).split("\n");
  const firstContentLineIndex = lines.findIndex((line) => line.trim());

  if (firstContentLineIndex === -1) {
    return "";
  }

  return lines
    .filter((_, index) => index !== firstContentLineIndex)
    .join("\n")
    .trim();
};
const getContentSlides = (content: string) => {
  const lines = content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !line.trim().startsWith("#"));
  const slides = lines.reduce<string[][]>(
    (result, line) => {
      const currentSlide = result[result.length - 1];

      if (pageNumberPattern.test(line.trim()) && currentSlide.some(Boolean)) {
        result.push([]);
      }

      result[result.length - 1].push(line);
      return result;
    },
    [[]],
  );

  return slides.map((item) => item.join("\n").trim()).filter(Boolean);
};

const modules: any[] = [];
const breakpoints = {
  320: { slidesPerView: 1 },
  480: { slidesPerView: 1 },
  768: { slidesPerView: 2 },
  1024: { slidesPerView: 3 },
};
</script>

<style lang="less" scoped>
.card-box {
  width: 100%;
  display: flex;
  justify-content: center;
}

.card-box__preview {
  width: 100%;
  max-width: 100%;
  border-radius: 20px;
  overflow: hidden;
  max-height: 553px;
  box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.5);
}

.card-swiper {
  width: 100%;
  height: auto;
  border-radius: 16px;
}

.card-slide {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow: hidden;
}

.card-item {
  width: 300px;

  border-radius: 20px;
  overflow: hidden;
}

.pic-box {
  --fc_1: #1c1c1c;
  --fc_0: #ffffff;
  --fc_3: #5d5d5d;
  --fc_2: #111111;
  width: 300px;
  height: 400px;
  aspect-ratio: 3 / 4;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
  padding: 38px 43px 40px 22px;
  background: url("@/assets/background/theme_bg22.jpg") top/cover no-repeat;
  background-color: rgba(255, 251, 240, 0.5);
  font-family: "font_03_subset", "font_03_full", "font_6", serif;
  color: #252525;
  box-sizing: border-box;
}

.sub-title {
  margin: 0 0 13px;
  font-size: 11px;
  line-height: 1.72;
  text-align: left;
  letter-spacing: 0;
  color: #1a1a1a;
}

.content-body {
  font-size: 11px;
  line-height: 1.72;
  color: #1a1a1a;
}

.content-paragraph {
  margin: 0;
  text-align: left;
  text-justify: inter-ideograph;
  word-break: break-word;
  white-space: pre-line;
}

.content-paragraph + .content-paragraph {
  margin-top: 13px;
}
</style>
