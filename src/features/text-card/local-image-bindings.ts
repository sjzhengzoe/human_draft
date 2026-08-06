type StoredImageBindings = {
  version: 2;
  bindings: Array<{
    pageKey: string;
    path: string;
  }>;
};

export function createLocalImageBindingsStore(storageKey: string) {
  function getStoredImagePaths(pageKeys: string[]) {
    const value: unknown = wx.getStorageSync(storageKey);
    if (Array.isArray(value)) {
      return pageKeys.map((_, index) =>
        typeof value[index] === "string" ? value[index] : "",
      );
    }

    if (!isStoredImageBindings(value)) return pageKeys.map(() => "");
    const pathByPageKey = new Map(
      value.bindings.map((binding) => [binding.pageKey, binding.path]),
    );
    return pageKeys.map((pageKey) => pathByPageKey.get(pageKey) || "");
  }

  function persistLocalImagePaths(paths: string[], pageKeys: string[]) {
    const bindings = paths.flatMap((path, index) => {
      const pageKey = pageKeys[index];
      return path && pageKey ? [{ pageKey, path }] : [];
    });

    if (bindings.length) {
      const value: StoredImageBindings = { version: 2, bindings };
      wx.setStorageSync(storageKey, value);
      return;
    }
    wx.removeStorageSync(storageKey);
  }

  function saveLocalImageFile(tempFilePath: string) {
    return new Promise<string>((resolve, reject) => {
      wx.saveFile({
        tempFilePath,
        success: (result) => resolve(result.savedFilePath),
        fail: reject,
      });
    });
  }

  function removeLocalImageFile(filePath: string) {
    wx.removeSavedFile({
      filePath,
      fail: (error) => console.warn("删除图文模板本地图片失败", error),
    });
  }

  return {
    getStoredImagePaths,
    persistLocalImagePaths,
    removeLocalImageFile,
    saveLocalImageFile,
  };
}

function isStoredImageBindings(value: unknown): value is StoredImageBindings {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredImageBindings>;
  return (
    candidate.version === 2 &&
    Array.isArray(candidate.bindings) &&
    candidate.bindings.every(
      (binding) =>
        Boolean(binding) &&
        typeof binding.pageKey === "string" &&
        typeof binding.path === "string",
    )
  );
}
