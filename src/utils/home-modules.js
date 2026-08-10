const HIDDEN_HOME_MODULE_KEYS_STORAGE_KEY = "HIDDEN_HOME_MODULE_KEYS_V1"

const HOME_FEATURE_GROUPS = [
  {
    key: "inspiration",
    title: "生活灵感",
    items: [
      {
        key: "text-card",
        icon: "notebook-pen",
        title: "图文卡片",
        image: "/assets/home-modules/text-card-bold.png",
        decoration: "/assets/home-modules/decor-flora.png",
        path: "/pages/text-card/index",
        available: true,
        requiresLogin: false
      },
      {
        key: "menu",
        icon: "cooking-pot",
        title: "我的菜单",
        image: "/assets/home-modules/menu-bold.png",
        decoration: "/assets/home-modules/decor-cat.png",
        path: "/pages/menu/index",
        available: true,
        requiresLogin: true
      },
      {
        key: "media",
        icon: "clapperboard",
        title: "影视片单",
        image: "/assets/home-modules/media-bold.png",
        decoration: "/assets/home-modules/decor-cat-belly-up.png",
        path: "/pages/media/index",
        available: true,
        requiresLogin: true
      },
      {
        key: "activities",
        icon: "sparkles",
        title: "活动清单",
        image: "/assets/home-modules/activities-bold.png",
        path: "/pages/activities/index",
        available: true,
        requiresLogin: true
      },
      {
        key: "chat-topics",
        icon: "messages-square",
        title: "聊天话题",
        image: "/assets/home-modules/chat-topics-bold.png",
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
        image: "/assets/home-modules/exercise-bold.png",
        decoration: "/assets/home-modules/decor-frenchie-sleeping.png",
        path: "/exercise/pages/index",
        available: true,
        requiresLogin: true
      },
      {
        key: "luggage",
        icon: "luggage",
        title: "行李清单",
        image: "/assets/home-modules/luggage-bold.png",
        path: "/pages/luggage/index",
        available: true,
        requiresLogin: true
      },
      {
        key: "wardrobe",
        icon: "shirt",
        title: "衣物尺寸",
        image: "/assets/home-modules/wardrobe-bold.png",
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
        image: "/assets/home-modules/key-moments-bold.png",
        decoration: "/assets/home-modules/decor-cat-stretched.png",
        path: "/pages/key-moments/index",
        available: true,
        requiresLogin: true
      },
      {
        key: "footprint",
        icon: "map-pinned",
        title: "全国足迹",
        image: "/assets/home-modules/footprint-bold.png",
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
