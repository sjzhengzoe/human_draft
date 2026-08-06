export type TextCardContentFormat = "bracketed" | "numbered"

export type TextCardTextPart = {
  text: string
}

export type TextCardParagraph = {
  parts: TextCardTextPart[]
  isTitle: boolean
  isSpacer: boolean
}

type TextCardContentParserOptions = {
  format: TextCardContentFormat
  tags: string
}

export function createTextCardContentParser(options: TextCardContentParserOptions) {
  const normalizeText = (text: string) => {
    const normalized = text.replace(/\r\n/g, "\n").replace(/`/g, "")
    return options.format === "numbered"
      ? normalized.replace(/\u2800/g, " ")
      : normalized
  }

  const isPageBreakLine = (line: string) => {
    const text = line.trim()
    if (options.format === "numbered") {
      return text.startsWith("［") || /^\d{2}$/.test(text)
    }
    return (
      (text.startsWith("［") && text.endsWith("］")) ||
      (text.startsWith("[") && text.endsWith("]"))
    )
  }

  const trimEmptyLines = (lines: string[]) => {
    const result = [...lines]
    while (result[0] === "") result.shift()
    while (result[result.length - 1] === "") result.pop()
    return result
  }

  const getContentSlides = (content: string) => {
    const lines = normalizeText(content)
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => !line.trim().startsWith("#") && line.trim() !== "/")
    const slides = lines.reduce<string[][]>(
      (result, line) => {
        const currentSlide = result[result.length - 1]
        if (isPageBreakLine(line) && currentSlide.some(Boolean)) result.push([])
        result[result.length - 1].push(line)
        return result
      },
      [[]]
    )
    return slides.map((item) => item.join("\n").trim()).filter(Boolean)
  }

  const getParagraphs = (text: string): TextCardParagraph[] => {
    const lines = trimEmptyLines(
      normalizeText(text)
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => !line.startsWith("#") && line !== "/")
    )
    let hasTitle = false
    return lines.map((line) => {
      const isSpacer = line === ""
      const isTitle = !isSpacer && !hasTitle
      if (isTitle) hasTitle = true
      return {
        parts: isSpacer ? [] : [{ text: line }],
        isTitle,
        isSpacer
      }
    })
  }

  const getCopyableContent = (content: string) => {
    const rawLines = normalizeText(content)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => !line.startsWith("#") && line !== "/")
    const hasPageTitles = rawLines.some(isPageBreakLine)
    const lines = rawLines.filter((line) => !isPageBreakLine(line))
    if (!lines.length) return ""

    const titleIndex = lines.findIndex(Boolean)
    if (titleIndex < 0) return ""
    const bodyLines = hasPageTitles
      ? trimEmptyLines(lines)
      : trimEmptyLines(lines.slice(titleIndex + 1))
    return bodyLines.length
      ? [bodyLines.join("\n"), options.tags].join("\n\n")
      : options.tags
  }

  const appendPastedContent = (currentContent: string, pastedContent: string) => {
    const current = currentContent.trim()
    const pasted = pastedContent.trim()
    if (!current) return pasted

    const firstPastedLine = normalizeText(pasted)
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean)
    if (firstPastedLine && isPageBreakLine(firstPastedLine)) {
      return `${current}\n\n${pasted}`
    }

    const nextPage = getContentSlides(current).length + 1
    const pageTitle =
      options.format === "numbered"
        ? nextPage <= 99
          ? String(nextPage).padStart(2, "0")
          : `［第 ${nextPage} 页］`
        : `［第 ${nextPage} 张］`
    return `${current}\n\n${pageTitle}\n${pasted}`
  }

  return {
    appendPastedContent,
    getContentSlides,
    getCopyableContent,
    getParagraphs,
    normalizeText
  }
}
