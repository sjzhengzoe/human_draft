let menuDataRevision = 0

export function getMenuDataRevision(): number {
  return menuDataRevision
}

export function markMenuDataChanged(): void {
  menuDataRevision += 1
}
