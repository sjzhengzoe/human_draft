---
name: menu-dish-image-generation
description: Generate or document printable A6 menu dish images for project-flomo. Use when the user asks to 生菜图, 生成菜品图片, 菜的图片, 食物待打印, 菜单主图, 透明底菜图, or wants dish images matching the accepted tomato scrambled egg watercolor style and naming standard.
---

# Menu Dish Image Generation

Use this skill for foreground dish images used in the A6 landscape menu image area. This is separate from `menu-binder-background-design`, which is for page backgrounds.

## Standard Output

- Save final dish images under `public/食物待打印/`.
- Final canvas: `1536 × 1024px`, PNG, 3:2 landscape.
- Final file must have an alpha channel (`RGBA`) and a transparent background.
- Use the accepted reference style:
  `public/食物待打印/半荤 · 番茄炒鸡蛋-水彩手绘-透明.png`
- Naming format:
  `{分类} · {菜名}.png`
- Example:
  `半荤 · 番茄炒鸡蛋.png`
- Do not add style suffixes like `-水彩手绘` or `-透明` for final production dish images unless the user is explicitly comparing variants.

## Style Standard

Generate dishes as soft watercolor-style menu illustrations:

- White-paper watercolor feeling, but final background transparent.
- Warm, appetizing colors with moderate saturation for print.
- Soft hand-painted edges and light watercolor texture.
- Subject centered in a 3:2 composition.
- Simple white plate or minimal serving shape may remain visible.
- Preserve subtle dish/plate shadow only if it does not create a white rectangular block.
- Avoid photorealistic food photography, semi-realistic glossy digital painting, anime, characters, chopsticks, cluttered props, text, labels, logos, and hard photo-frame backgrounds.

## Prompt Shape

For a single dish, adapt this prompt:

```text
Create a printable A6 menu dish image.

Subject: {菜名}, {brief dish description if needed}.
Style: soft watercolor food illustration, hand-painted paper texture, warm appetizing colors, clean edges, not photorealistic, not semi-realistic glossy digital painting, not anime.
Composition: 3:2 landscape, centered dish on a simple white plate or minimal serving shape, generous padding, readable when printed in a 78mm × 52mm menu image zone.
Background: plain removable white or chroma-key background for transparent PNG post-processing; final asset must be transparent background.
Avoid: text, labels, logos, people, chopsticks, dark background, cluttered props, hard rectangular frame, visible white background block.
```

## Workflow

1. Use the `imagegen` skill / image generation tool for new dish art.
2. Keep or resize the final asset to `1536 × 1024px`.
3. Convert the background to transparency:
   - If the tool can produce transparent output, keep it as PNG with alpha.
   - Otherwise generate on a removable plain background and remove only edge-connected background pixels.
   - Validate with a checkerboard preview before using it.
4. Save the final PNG in `public/食物待打印/` using the standard filename.
5. If wiring into the menu UI, add the file to the `foodPickerItems` list in `src/pages/menu/App.vue`.
6. If changing menu code or store defaults, run `npm run build`.

## Validation

Before finishing, confirm:

- `file {path}` reports PNG `RGBA`.
- The output remains `1536 × 1024px`.
- No obvious white rectangular background appears on a checkerboard preview.
- The dish remains readable at small A6 menu size.
- Build passes if code changed.
