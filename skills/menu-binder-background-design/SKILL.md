---
name: menu-binder-background-design
description: Create, refine, or generate prompts/assets for A6 landscape loose-leaf menu background images. Use when the user asks for 菜谱背景图, 活页菜单背景, A6 横版菜单背景, coffee/cafe/retro/hand-drawn food menu styles, printable binder menu card backgrounds, or asks how to describe/generate backgrounds that preserve a left binding area while leaving flexible image and text content zones.
---

# Menu Binder Background Design

## Core Spec

Use this skill for printable background images behind menu cards, not for designing the foreground food photo or text.

Default canvas:
- A6 landscape: `148 × 105mm`
- 300dpi: `1748 × 1240px`
- White or visually no-color base unless the user asks otherwise
- Left binding safe area: `16mm` from the left edge; this is a width/layout constraint, not a requirement that the strip must be pure white
- Keep the vertical binding divider fixed at the existing position and visual weight unless the user asks to change it
- Do not draw punch holes unless the user explicitly asks
- Consider the binding area in the background design. It may share subtle paper tone, very light texture, or low-contrast decoration, but do not place important focal motifs, text-like marks, or high-contrast details where holes or binding hardware may interfere

The right side is the display area for a food photo and dish text, but it must remain flexible. Avoid drawing fixed rectangles, photo frames, text boxes, labels, prices, logos, fake menu text, or hard placeholders unless explicitly requested.

Current foreground content reference areas:
- Food image area: `x=43mm`, `y=13mm`, `w=78mm`, `h=52mm`, with about `1mm` corner radius.
- Text area: `x=43mm`, `y=70mm`, `w=78mm`, `h=26mm`.
- These measurements describe where foreground content currently sits. Use them to balance decoration, avoid visual collisions, and prevent the left side of the display area from feeling empty.
- Do not draw boxes, frames, outlines, crop marks, labels, or placeholders for these areas unless explicitly requested.
- Decoration should be aware of both the image and text zones: it may lightly frame the overall composition through corner/edge accents, nearby small motifs, or soft background rhythm, but should not lock the foreground layout to these exact dimensions.

## Design Rules

Account for real printer margins:
- Many printers leave white/unprinted margins even when "borderless" is selected. Avoid full-bleed tinted backgrounds that would make the printed white border obvious.
- Prefer a white/no-color visual base with added decorative elements.
- If using any paper tint, color wash, grain, or texture, make all four outer edges fade naturally to white/no-color so printer margins blend in.
- Do not rely on an edge-to-edge background color to carry the design.
- Do not put important decoration flush against the trim edge unless it fades out naturally.

Preserve compatibility with changing foreground layouts:
- Keep the central-right content zone calm and low contrast.
- Put decoration on edges, corners, background texture, or sparse accents, but do not push everything to the far right edge. Balance the whole usable right-side page while respecting the image and text reference areas.
- Use subtle motifs: hand-drawn food ingredients, cafe tableware, fruit, light linework, paper grain, small vintage marks, soft border fragments.
- Avoid high-density patterns behind likely image/text areas.
- Avoid decoration that implies exact photo/text dimensions.
- Avoid large dark blocks, strong gradients, full-page colored paper fills, heavy frames, or text-like marks.

Good visual directions:
- 白底复古咖啡厅菜单
- 日式喫茶店
- 手绘果蔬
- 法式甜品店
- 温暖生活感
- 轻纸张纹理
- 克制的小色块或细线点缀

## Prompt Template

When the user wants a prompt, produce a self-contained prompt like this:

```text
请基于这张 A6 横版活页菜单背景生成新的背景图。

画布保持 A6 横版，300dpi，1748 × 1240px。整体以白色或视觉上的无色底为主，适合打印成活页菜单卡。

左侧 16mm 是活页装订安全区，请保留原有竖向分隔线的位置和宽度。不要画打孔孔位。活页区只是宽度限制，不要求纯白底；可以延续轻微纸纹或低对比装饰，但不要放重要图案、文字感元素或高对比细节。设计右侧展示区时要意识到左侧是装订区。

需要考虑实际打印可能产生白边：不要做满版有底色的背景。背景四周必须自然过渡到白色/无色，或者完全不要背景色，只添加装饰元素。不要让纸纹、色块或底色硬贴到画布边缘。

当前前景内容参考位置：菜品图片区在 x=43mm, y=13mm, w=78mm, h=52mm；文字区在 x=43mm, y=70mm, w=78mm, h=26mm。请根据这些位置去安排装饰的疏密和重心，避免只把装饰堆在最右边导致左侧展示区过空。不要画出图片框、文字框、矩形占位、边界线或标签；这些尺寸只是设计参考，不是要框死布局。

右侧是菜品图片和文字的展示区域，但不要画死固定的图片框、文字框、矩形占位框或明确边界。后续图片和文字的大小、位置可能调整，所以背景要有兼容性：中间主要内容区域保持干净、低干扰，装饰可以围绕图片区和文字区的周边、角落、边缘、轻微底纹或局部点缀来形成平衡，而不是只集中在右边缘。

风格方向：{style_direction}。可以加入 {motifs}，但不要喧宾夺主。

不要出现文字、英文假字、价格、logo、真实菜单内容。不要使用深色大面积背景、满版色底或硬边纸张底色。不要让装饰覆盖右侧中部主要内容区。
```

Fill `{style_direction}` and `{motifs}` with the user's desired style. If unspecified, suggest 3-4 variants.

## Generating Assets In The Project

When asked to generate actual background images for `project-flomo`:

1. Inspect the current base/reference image if provided, usually under `public/菜谱背景图/`.
2. Check the current CSS before generating if foreground layout may have changed. Current default is image `43,13,78,52mm` and text `43,70,78,26mm`.
3. Keep output size `1748 × 1240px` and 300dpi when possible.
4. Save generated backgrounds under:
   `public/菜谱背景图/`
5. Name files from the secondary tab name plus a two-digit number:
   - `基础极简01.png`
   - `复古咖啡厅01.png`
   - `日式喫茶01.png`
6. If adding the background to the UI, add an entry to the A6 background list with `name` matching the filename without extension and `src` using `encodeURI("/菜谱背景图/{filename}.png")`.
7. If post-processing generated images, preserve the fixed divider position but do not automatically erase the whole binding strip to pure white unless the requested style calls for it. Keep the binding area compatible with punching and binding.
8. Check that all four outer edges fade to white/no-color or have no background color, so printer margins will not create an obvious white border.
9. Run `npm run build` after code changes.

## Style Variant Examples

Use concise style variables rather than changing the core spec:

```text
风格变量：日式喫茶店，细线手绘，淡奶油白底，少量番茄红和橄榄绿点缀。
```

```text
风格变量：复古甜品店，轻微纸张纹理，手绘水果和小餐具，颜色克制，不要卡通。
```

```text
风格变量：现代咖啡厅菜单，白底，浅灰纸纹，边角有咖啡杯、面包和植物线稿，整体安静高级。
```

## Response Shape

If the user asks how to describe the background, return:
- One reusable master prompt
- 3-4 short style variables
- Any important constraints to keep unchanged

If the user asks to generate backgrounds, return:
- File paths created
- Style names
- Whether the UI config was updated
- Build/test result if code changed
