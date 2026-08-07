let mediaDataRevision = 0

export function getMediaDataRevision(): number {
  return mediaDataRevision
}

export function markMediaDataChanged(): number {
  mediaDataRevision += 1
  return mediaDataRevision
}
