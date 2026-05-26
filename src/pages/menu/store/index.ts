import { defineStore } from "pinia";

const DEFAULT_IMAGE_URL = "/img/食物默认图.png";
const MENU_FORM_DATA_CARDS = "MENU_FORM_DATA_CARDS";
const MENU_LAYOUT_MODE = "MENU_LAYOUT_MODE";
const MENU_IMAGE_DB_NAME = "MENU_IMAGE_DB";
const MENU_IMAGE_STORE_NAME = "cardImages";
const CARD_COUNT = 10;
const DEFAULT_CARD_TYPES = [
  "家常",
  "快手",
  "汤羹",
  "主食",
  "素菜",
  "肉菜",
  "凉菜",
  "早餐",
  "外食",
  "轻食",
];

type MenuLayoutMode =
  | "four"
  | "instaxWidePortrait"
  | "threeInch"
  | "threeInchLandscape"
  | "fourInch"
  | "fourInchLandscape"
  | "fiveInch"
  | "fiveInchLandscape"
  | "sixInch"
  | "sixInchLandscape"
  | "instaxMiniLandscape"
  | "instaxMini";

type MenuCardData = {
  imageUrl: string;
  dishName: string;
  ingredients: string;
};

type StoredMenuCardData = Pick<MenuCardData, "dishName" | "ingredients">;
type StoredMenuCardImage = Pick<MenuCardData, "imageUrl"> & { index: number };

const DEFAULT_CARD_TEXTS: StoredMenuCardData[] = [
  { dishName: "家常·番茄炒鸡蛋", ingredients: "番茄、鸡蛋、小葱" },
  { dishName: "快手·青椒肉丝", ingredients: "青椒、猪肉" },
  { dishName: "汤羹·紫菜蛋花汤", ingredients: "紫菜、鸡蛋" },
  { dishName: "主食·咖喱鸡饭", ingredients: "鸡肉、土豆、米饭" },
  { dishName: "素菜·蒜蓉西兰花", ingredients: "西兰花、蒜" },
  { dishName: "肉菜·红烧排骨", ingredients: "排骨、葱姜" },
  { dishName: "凉菜·拍黄瓜", ingredients: "黄瓜、蒜" },
  { dishName: "早餐·火腿煎蛋", ingredients: "火腿、鸡蛋" },
  { dishName: "外食·寿司拼盘", ingredients: "米饭、海苔" },
  { dishName: "轻食·鸡胸沙拉", ingredients: "鸡胸、生菜" },
];

function formatDishName(dishName: string, index: number) {
  const name = dishName.trim();
  if (!name) return "";
  if (name.includes("·")) return name;

  return `${DEFAULT_CARD_TYPES[index % DEFAULT_CARD_TYPES.length]}·${name}`;
}

function createDefaultCards(): MenuCardData[] {
  return Array.from({ length: CARD_COUNT }, (_, index) => ({
    imageUrl: DEFAULT_IMAGE_URL,
    ...DEFAULT_CARD_TEXTS[index],
  }));
}

function loadLayoutMode(): MenuLayoutMode {
  const mode = localStorage.getItem(MENU_LAYOUT_MODE);
  if (
    mode === "four" ||
    mode === "instaxWidePortrait" ||
    mode === "threeInch" ||
    mode === "threeInchLandscape" ||
    mode === "fourInch" ||
    mode === "fourInchLandscape" ||
    mode === "fiveInch" ||
    mode === "fiveInchLandscape" ||
    mode === "sixInch" ||
    mode === "sixInchLandscape" ||
    mode === "instaxMiniLandscape" ||
    mode === "instaxMini"
  ) {
    return mode;
  }
  return "instaxMini";
}

function loadCards(): MenuCardData[] {
  const rawCards = localStorage.getItem(MENU_FORM_DATA_CARDS);

  if (rawCards) {
    try {
      const cards = JSON.parse(rawCards) as Partial<StoredMenuCardData>[];
      if (Array.isArray(cards)) {
        return createDefaultCards().map((card, index) => ({
          ...card,
          dishName: cards[index]?.dishName?.trim()
            ? formatDishName(cards[index].dishName || "", index)
            : card.dishName,
          ingredients: cards[index]?.ingredients?.trim() || card.ingredients,
        }));
      }
    } catch (err) {
      console.error("读取菜单数据失败:", err);
    }
  }

  const legacyDishName = localStorage.getItem("MENU_FORM_DATA_DISH_NAME");
  const legacyIngredients = localStorage.getItem("MENU_FORM_DATA_INGREDIENTS");

  if (legacyDishName || legacyIngredients) {
    return createDefaultCards().map((card) => ({
      ...card,
      dishName: legacyDishName ? formatDishName(legacyDishName, 0) : card.dishName,
      ingredients: legacyIngredients || card.ingredients,
    }));
  }

  return createDefaultCards();
}

function openImageDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MENU_IMAGE_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MENU_IMAGE_STORE_NAME)) {
        db.createObjectStore(MENU_IMAGE_STORE_NAME, { keyPath: "index" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveCardImage(index: number, imageUrl: string) {
  const db = await openImageDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(MENU_IMAGE_STORE_NAME, "readwrite");
    const store = transaction.objectStore(MENU_IMAGE_STORE_NAME);
    store.put({ index, imageUrl });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  db.close();
}

async function loadCardImages(): Promise<StoredMenuCardImage[]> {
  const db = await openImageDb();

  const images = await new Promise<StoredMenuCardImage[]>((resolve, reject) => {
    const transaction = db.transaction(MENU_IMAGE_STORE_NAME, "readonly");
    const store = transaction.objectStore(MENU_IMAGE_STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result as StoredMenuCardImage[]);
    request.onerror = () => reject(request.error);
  });

  db.close();
  return images;
}

const useStore = defineStore("menuStore", {
  state: () => ({
    formData: {
      layoutMode: loadLayoutMode(),
      cards: loadCards(),
    },
  }),
  actions: {
    setLayoutMode(mode: MenuLayoutMode) {
      this.formData.layoutMode = mode;
      localStorage.setItem(MENU_LAYOUT_MODE, mode);
    },
    setCardImage(index: number, imageUrl: string) {
      const card = this.formData.cards[index];
      if (!card) return;

      card.imageUrl = imageUrl;
      saveCardImage(index, imageUrl).catch((err) => {
        console.error("保存菜单图片失败:", err);
      });
    },
    setCardText(index: number, dishName: string, ingredients: string) {
      const card = this.formData.cards[index];
      if (!card) return;

      card.dishName = formatDishName(dishName, index) || "未分类·未命名菜单";
      card.ingredients = ingredients.trim();
      this.persistCards();
    },
    persistCards() {
      const cards = this.formData.cards.map(({ dishName, ingredients }) => ({
        dishName,
        ingredients,
      }));
      localStorage.setItem(MENU_FORM_DATA_CARDS, JSON.stringify(cards));
    },
    async hydrateCardImages() {
      try {
        const images = await loadCardImages();
        images.forEach(({ index, imageUrl }) => {
          const card = this.formData.cards[index];
          if (card && imageUrl) {
            card.imageUrl = imageUrl;
          }
        });
      } catch (err) {
        console.error("读取菜单图片失败:", err);
      }
    },
  },
});

export { DEFAULT_IMAGE_URL, useStore };
export type { MenuCardData, MenuLayoutMode };
