let imageStorageRevision = 0

export function getImageStorageRevision(): number {
  return imageStorageRevision
}

export function invalidateImageStorageUsage(): void {
  imageStorageRevision += 1
}
