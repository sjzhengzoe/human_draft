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
  `public/食物待打印/半荤 · 番茄炒鸡蛋.png`
- Naming format:
  `{分类} · {菜名}.png`
- Example:
  `半荤 · 番茄炒鸡蛋.png`
- Do not add style suffixes like `-水彩手绘` or `-透明` for final production dish images unless the user is explicitly comparing variants.

## Style Standard

Generate dishes to match the accepted tomato scrambled egg reference as closely as the subject allows:

- Default vessel after image generation: use a Japanese-style ceramic plate/bowl ("日式的盆") unless the user explicitly asks for another vessel.
- Prefer a shallow oval Japanese ceramic plate for most dishes: muted celadon gray-green, warm gray, or warm gray-blue glaze; subtle handmade speckled texture; thin irregular brown rim; quiet and low-saturation.
- Use a deeper Japanese ceramic bowl only when the dish naturally needs depth, such as soup, noodles, rice bowls, stews, or saucy dishes that would look wrong on a flat plate.
- The vessel should be tasteful and restrained, not bright, not patterned, not decorative, and never stronger than the food.
- Use a slightly front/top angle.
- Food pile centered on the plate; plate nearly fills the image width while leaving generous transparent padding.
- Soft watercolor menu illustration with translucent layered washes, visible paper-watercolor texture, and loose hand-painted edges.
- Warm but not glowing colors; moderate saturation, gentle contrast, and no glossy CG highlights.
- Pale beige/gray watercolor vessel shadow may remain inside/under the plate or bowl, but never as a hard rectangular block.
- No heavy black outlines, thick marker lines, anime rendering, photorealism, semi-realistic glossy digital painting, hard digital airbrush, props, text, labels, logos, watermark, people, chopsticks, clutter, or hard photo-frame backgrounds.

## Reference Matching Rules

Before generating a new final dish asset:

1. Inspect `public/食物待打印/半荤 · 番茄炒鸡蛋.png` visually when available.
2. Keep the new dish consistent with that reference in angle, scale, watercolor softness, contrast, shadow strength, and amount of transparent padding.
3. Use the updated Japanese ceramic vessel rule by default. If the tomato scrambled egg reference uses a simpler pale plate, keep the reference's softness and scale but replace the vessel direction with the quiet Japanese ceramic plate/bowl.
4. Do not let subject-specific words push the style away from the reference. For roasted, fried, grilled, or sauced dishes, avoid prompt words that imply glossy, oily, charred, dramatic, high-contrast, or hyper-detailed rendering unless the user explicitly wants that.
5. If the first result is sharper, darker, glossier, more saturated, more anime, more realistic, or uses a vessel that is too decorative or too bright, regenerate once with stricter reference-lock language before saving the final file.

## Prompt Shape

For a single dish, adapt this prompt:

```text
Create a printable A6 menu dish image.

Subject: {菜名}, {brief dish description if needed}.
Vessel: use a Japanese-style ceramic plate/bowl by default. For most dishes, use a shallow oval Japanese ceramic plate with muted celadon gray-green, warm gray, or warm gray-blue glaze, subtle handmade speckles, and a thin irregular brown rim. Use a deeper Japanese ceramic bowl only when the dish naturally needs depth. The vessel must be quiet and low-saturation, not patterned, not bright, and not decorative.
Reference lock: match the accepted tomato scrambled egg menu image style as closely as possible: slightly front/top view, centered food pile, translucent watercolor washes, loose soft edges, visible paper texture, pale beige-gray vessel shadow, gentle contrast, warm but not glowing color.
Composition: 3:2 landscape, vessel nearly fills the width, centered dish, generous transparent padding, readable when printed in a 78mm × 52mm menu image zone.
Style constraints: soft watercolor food illustration, matte watercolor, low-to-moderate saturation, no glossy highlights, no oily shine, no hard digital edges, no heavy black outline, not photorealistic, not semi-realistic glossy digital painting, not anime.
Background: perfectly flat removable chroma-key background for transparent PNG post-processing; final asset must be transparent background.
Avoid: text, labels, logos, watermark, people, chopsticks, dark background, cluttered props, hard rectangular frame, visible white background block, high contrast, hyper-detailed texture, dramatic lighting.
```

## Workflow

1. Use the `imagegen` skill / image generation tool for new dish art.
2. Inspect the tomato scrambled egg reference image and carry its visual traits into the prompt.
3. Use a flat chroma-key background for built-in image generation when transparency is required. Prefer `#ff00ff` for green dishes and `#00ff00` otherwise.
4. Keep or resize the final asset to `1536 × 1024px`.
5. Convert the background to transparency:
   - If the tool can produce transparent output, keep it as PNG with alpha.
   - Otherwise generate on a removable plain background and remove only edge-connected background pixels.
   - Validate with a checkerboard preview before using it.
6. Save the final PNG in `public/食物待打印/` using the standard filename.
7. Menu UI reads `public/食物待打印/` automatically; do not hard-code new food picker items.
8. If changing menu code or store defaults, run `npm run build`.

## Validation

Before finishing, confirm:

- `file {path}` reports PNG `RGBA`.
- The output remains `1536 × 1024px`.
- No obvious white rectangular background appears on a checkerboard preview.
- The dish remains readable at small A6 menu size.
- Build passes if code changed.
