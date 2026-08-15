function parsedStructuredText(value) {
  const trimmed = value.trim();
  if (!trimmed || !["[", "{"].includes(trimmed[0])) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_error) {
    return null;
  }
}

export function collectUserText(...values) {
  const collected = [];
  const seen = new Set();
  const visit = (value) => {
    if (typeof value === "string") {
      const structured = parsedStructuredText(value);
      if (structured) {
        visit(structured);
        return;
      }
      const text = value.trim();
      if (text && !seen.has(text)) {
        seen.add(text);
        collected.push(text);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value).forEach(visit);
    }
  };
  values.forEach(visit);
  return collected;
}

export async function checkUserText(contentSecurity, openId, ...values) {
  const text = collectUserText(...values).join("\n");
  if (text) await contentSecurity.checkText(openId, text);
}
