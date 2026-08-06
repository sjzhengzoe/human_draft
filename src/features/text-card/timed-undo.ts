export function createTimedUndo<T>(duration = 5000) {
  let snapshot: T | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function clear() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    const current = snapshot;
    snapshot = undefined;
    return current;
  }

  return {
    start(nextSnapshot: T, onExpire: () => void) {
      clear();
      snapshot = nextSnapshot;
      timer = setTimeout(onExpire, duration);
    },
    clear,
  };
}
