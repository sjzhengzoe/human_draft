export function queryString(values: Record<string, string | undefined>): string {
  const parts = Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value as string)}`,
    );
  return parts.length ? `?${parts.join("&")}` : "";
}
