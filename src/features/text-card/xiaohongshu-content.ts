export type XiaohongshuSlide = {
  order: string;
  paragraphs: string[];
};

export const XIAOHONGSHU_BLANK_LINE = "\u2800";
const XIAOHONGSHU_TAGS =
  "#日记复兴计划[话题]# #一些有感而发[话题]# #文字复兴单元[话题]# #文字[话题]# #随便记录点什么[话题]# #日常记录[话题]# #记录真实生活[话题]#";
const DOUYIN_TAGS = "#文字的力量 #记录真实生活 #思考 #讨论";

export function getXiaohongshuCopyableContent(content: string) {
  return [getCopyableBody(content), XIAOHONGSHU_BLANK_LINE, XIAOHONGSHU_TAGS].join("\n");
}

export function getDouyinCopyableContent(content: string) {
  return [getCopyableBody(content), XIAOHONGSHU_BLANK_LINE, DOUYIN_TAGS].join("\n");
}

export function appendPastedEntry(currentContent: string, pastedEntry: string) {
  const current = currentContent.trim();
  return current ? [current, pastedEntry].join("\n\n") : pastedEntry;
}

export function createPastedEntry(content: string, order: string) {
  const lines = normalizeText(content)
    .split("\n")
    .map((line) => line.trimEnd());

  trimEmptyEdges(lines);
  if (!lines.length) return "";

  const firstContentLineIndex = lines.findIndex((line) => line.trim());
  if (
    firstContentLineIndex >= 0 &&
    lines[firstContentLineIndex].trim().startsWith("#")
  ) {
    lines.splice(firstContentLineIndex, 1);
  }

  const body = lines.join("\n").trim();
  return body ? `${order}\n${body}` : order;
}

export function getNextSlideOrder(content: string) {
  return String(getContentSlides(content).length + 1).padStart(2, "0");
}

export function getContentSlides(content: string): XiaohongshuSlide[] {
  const lines = normalizeText(content)
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !line.trim().startsWith("#"));

  const slideLines = lines.reduce<string[][]>(
    (result, line) => {
      const currentSlide = result[result.length - 1];
      if (
        (/^\d{2}$/.test(line.trim()) || line.trim().startsWith("［")) &&
        currentSlide.some(Boolean)
      ) {
        result.push([]);
      }
      result[result.length - 1].push(line);
      return result;
    },
    [[]],
  );

  return slideLines
    .map((item, index) => createSlide(item.join("\n"), index))
    .filter((slide) => slide.paragraphs.length);
}

function getCopyableBody(content: string) {
  const lines = normalizeText(content)
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !line.trim().startsWith("#"));

  trimEmptyEdges(lines);
  return lines
    .map((line) => (line.trim() ? line : XIAOHONGSHU_BLANK_LINE))
    .join("\n");
}

function createSlide(text: string, index: number): XiaohongshuSlide {
  const firstLine = getFirstLine(text) || "";
  const hasOrderLine = /^\d{2}$/.test(firstLine);
  return {
    order: hasOrderLine ? firstLine : String(index + 1).padStart(2, "0"),
    paragraphs: getParagraphLines(hasOrderLine ? removeFirstLine(text) : text),
  };
}

function getParagraphLines(text: string) {
  return normalizeText(text)
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n"),
    )
    .filter(Boolean);
}

function getFirstLine(text: string) {
  return normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
}

function removeFirstLine(text: string) {
  const lines = normalizeText(text).split("\n");
  const firstContentLineIndex = lines.findIndex((line) => line.trim());
  if (firstContentLineIndex === -1) return "";
  return lines
    .filter((_, index) => index !== firstContentLineIndex)
    .join("\n")
    .trim();
}

function trimEmptyEdges(lines: string[]) {
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
}

function normalizeText(text: string) {
  return text.replace(/\r\n/g, "\n");
}
