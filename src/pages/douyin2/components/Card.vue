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
        <SwiperSlide v-for="(page, idx) in pages" :key="idx" class="card-slide">
          <div class="card-item">
            <div :id="`pic_${idx}`" class="pic-box pic-box--douyin">
              <div class="content-body">
                <template v-for="(paragraph, i) in page" :key="i">
                  <div
                    v-if="paragraph.isSpacer"
                    class="content-spacer"
                    aria-hidden="true"
                  />
                  <p
                    v-else
                    :class="[
                      'content-paragraph',
                      { 'content-paragraph--title': paragraph.isTitle },
                    ]"
                  >
                    <span
                      v-for="(part, partIndex) in paragraph.parts"
                      :key="partIndex"
                      :class="[
                        {
                          'content-title-text': paragraph.isTitle,
                          'content-emphasis': part.emphasis,
                        },
                      ]"
                    >
                      {{ part.text }}
                    </span>
                  </p>
                </template>
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

type TextPart = {
  text: string;
  emphasis: boolean;
};
type Paragraph = {
  parts: TextPart[];
  isTitle: boolean;
  isSpacer: boolean;
};

const store = useStore();
const formData = computed(() => store.formData);
const pages = computed<Paragraph[][]>(() =>
  getContentSlides(formData.value.content)
    .map((slide) => getParagraphs(slide))
    .filter((page) => page.some((paragraph) => !paragraph.isSpacer)),
);

function getParagraphs(text: string) {
  let hasTitle = false;

  return getParagraphLines(text).map((line) => {
    const isSpacer = line === "";
    const isTitle = !isSpacer && !hasTitle;

    if (isTitle) {
      hasTitle = true;
    }

    return {
      parts: isSpacer ? [] : parseEmphasis(line),
      isTitle,
      isSpacer,
    };
  });
}

function getParagraphLines(text: string) {
  const lines = normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !line.startsWith("#") && line !== "/");

  return trimEmptyLines(lines);
}
function normalizeText(text: string) {
  return text.replace(/\r\n/g, "\n");
}
function getContentSlides(content: string) {
  const lines = normalizeText(content)
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !line.trim().startsWith("#") && line.trim() !== "/");
  const slides = lines.reduce<string[][]>(
    (result, line) => {
      const currentSlide = result[result.length - 1];

      if (isPageBreakLine(line) && currentSlide.some(Boolean)) {
        result.push([]);
      }

      result[result.length - 1].push(line);
      return result;
    },
    [[]],
  );

  return slides.map((item) => item.join("\n").trim()).filter(Boolean);
}
function isPageBreakLine(line: string) {
  return line.trim().startsWith("［");
}
function trimEmptyLines(lines: string[]) {
  const result = [...lines];

  while (result[0] === "") {
    result.shift();
  }

  while (result[result.length - 1] === "") {
    result.pop();
  }

  return result;
}
function parseEmphasis(text: string) {
  return text
    .split(/(`.*?`)/g)
    .filter(Boolean)
    .map((part) => {
      const emphasis = part.startsWith("`") && part.endsWith("`");
      return {
        text: emphasis ? part.slice(1, -1) : part,
        emphasis,
      };
    })
    .filter((part) => part.text);
}

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
  font-family: "font_6";
  color: #252525;
  box-sizing: border-box;
}

.content-body {
  font-size: 12px;
  line-height: 1.72;
  color: #000;
}

.content-paragraph {
  margin: 0;
  text-align: left;
  text-justify: inter-ideograph;
  word-break: break-word;
  white-space: pre-line;
}

.content-spacer {
  height: 13px;
}

.content-paragraph--title {
  position: relative;
  color: #111111;
  font-weight: 700;
  line-height: 1.5;
  padding-left: 0;
  padding-bottom: 9px;
}

.content-paragraph--title + .content-paragraph {
  margin-top: 20px;
}

.content-paragraph--title + .content-spacer {
  height: 20px;
}

.content-title-text,
.content-emphasis {
  display: inline;
  color: #111111;
  font-weight: 700;
}

.content-title-text {
  font-size: 14px;
}

.content-emphasis {
  font-size: 12px;
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
  text-decoration-skip-ink: auto;
}
</style>
