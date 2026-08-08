const HIDDEN_HOME_MODULE_KEYS_STORAGE_KEY = "HIDDEN_HOME_MODULE_KEYS_V1"

const HOME_FEATURE_GROUPS = [
  {
    key: "creation",
    title: "内容创作",
    items: [
      {
        key: "text-card",
        icon: "notebook-pen",
        title: "图文卡片",
        path: "/pages/xiaohongshu/index",
        featured: true,
        available: true,
        requiresLogin: false
      }
    ]
  },
  {
    key: "inspiration",
    title: "生活灵感",
    items: [
      {
        key: "menu",
        icon: "cooking-pot",
        title: "我的菜单",
        path: "/pages/menu/index",
        available: true,
        requiresLogin: true
      },
      {
        key: "media",
        icon: "clapperboard",
        title: "影视片单",
        path: "/pages/media/index",
        available: true,
        requiresLogin: true
      },
      {
        key: "activities",
        icon: "sparkles",
        title: "活动清单",
        path: "/pages/activities/index",
        available: true,
        requiresLogin: true
      },
      {
        key: "chat-topics",
        icon: "messages-square",
        title: "聊天话题",
        path: "/pages/chat-topics/index",
        available: true,
        requiresLogin: true
      }
    ]
  },
  {
    key: "management",
    title: "日常管理",
    items: [
      {
        key: "exercise",
        icon: "dumbbell",
        title: "运动养宠",
        path: "/exercise/pages/index",
        available: true,
        requiresLogin: true
      },
      {
        key: "luggage",
        icon: "luggage",
        title: "行李清单",
        path: "/pages/luggage/index",
        available: true,
        requiresLogin: true
      },
      {
        key: "wardrobe",
        icon: "shirt",
        title: "衣物尺寸",
        path: "/pages/wardrobe/index",
        available: true,
        requiresLogin: true
      }
    ]
  },
  {
    key: "records",
    title: "人生记录",
    items: [
      {
        key: "key-moments",
        icon: "flag",
        title: "人生节点",
        path: "/pages/key-moments/index",
        available: true,
        requiresLogin: true
      },
      {
        key: "footprint",
        icon: "map-pinned",
        title: "全国足迹",
        path: "/pages/footprint/index",
        available: true,
        requiresLogin: false
      }
    ]
  }
]

function getAllModuleKeys() {
  return HOME_FEATURE_GROUPS.flatMap((group) => group.items.map((item) => item.key))
}

function getHiddenModuleKeys() {
  const stored = wx.getStorageSync(HIDDEN_HOME_MODULE_KEYS_STORAGE_KEY)
  if (!Array.isArray(stored)) return new Set()
  const hiddenKeys = new Set(stored.filter((key) => typeof key === "string"))
  const allKeys = getAllModuleKeys()
  if (allKeys.length > 0 && allKeys.every((key) => hiddenKeys.has(key))) {
    hiddenKeys.delete(allKeys[0])
  }
  return hiddenKeys
}

function saveHiddenModuleKeys(hiddenKeys) {
  const knownKeys = getAllModuleKeys()
  const storedKeys = knownKeys.filter((key) => hiddenKeys.has(key))
  if (storedKeys.length === 0) {
    wx.removeStorageSync(HIDDEN_HOME_MODULE_KEYS_STORAGE_KEY)
    return
  }
  wx.setStorageSync(HIDDEN_HOME_MODULE_KEYS_STORAGE_KEY, storedKeys)
}

function getVisibleHomeFeatureGroups() {
  const hiddenKeys = getHiddenModuleKeys()
  return HOME_FEATURE_GROUPS
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => !hiddenKeys.has(item.key))
        .map((item) => ({ ...item }))
    }))
    .filter((group) => group.items.length > 0)
}

function getHomeModuleSettingGroups() {
  const hiddenKeys = getHiddenModuleKeys()
  return HOME_FEATURE_GROUPS.map((group) => ({
    key: group.key,
    title: group.title,
    items: group.items.map((item) => ({
      key: item.key,
      icon: item.icon,
      title: item.title,
      visible: !hiddenKeys.has(item.key)
    }))
  }))
}

function setHomeModuleVisible(key, visible) {
  const allKeys = getAllModuleKeys()
  if (!allKeys.includes(key)) return false

  const hiddenKeys = getHiddenModuleKeys()
  if (visible) {
    hiddenKeys.delete(key)
  } else if (!hiddenKeys.has(key)) {
    const visibleCount = allKeys.filter((moduleKey) => !hiddenKeys.has(moduleKey)).length
    if (visibleCount <= 1) return false
    hiddenKeys.add(key)
  }

  saveHiddenModuleKeys(hiddenKeys)
  return true
}

module.exports = {
  HOME_FEATURE_GROUPS,
  getHomeModuleSettingGroups,
  getVisibleHomeFeatureGroups,
  setHomeModuleVisible
}
