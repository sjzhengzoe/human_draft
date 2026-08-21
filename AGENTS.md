# Project Agent Guidance

## UI Component Rules

- All business dialogs, confirmations, and modal forms must use the global `app-dialog` component. Simple platform-level account session confirmations, such as login or logout, and native system permission prompts may use the corresponding WeChat native API. Do not create page-local fixed masks, modal panels, or duplicate dialog CSS.
- Centered `app-dialog` panels are only for confirmations, read-only presentation, and compact choices that do not open the keyboard. Do not put `input` or `textarea` controls in a centered dialog.
- A standalone short edit containing one field must use the global `app-field-editor` component. Pages pass the dialog title, input type, current value, placeholder, length limit, optional hint, and count visibility; pages must not duplicate a field-editing `app-dialog` or its input CSS. Treat fields with a maximum length of about 120 characters or less as short by default.
- In detail views, management lists, cards, and other display-first interfaces, editable values must render as normal text rather than persistent input boxes. Tapping the value opens `app-field-editor`. Inline inputs remain appropriate inside dedicated create/edit forms and multi-field page-level editors where continuous form entry is the primary task.
- A standalone short edit containing two closely related fields may use `app-dialog placement="bottom"`. Bottom dialogs must let `app-dialog` own keyboard-height movement; their inputs use `dialog-mode` or `adjust-position="{{false}}"` and must not add page-level keyboard spacers.
- Long or paragraph text, normally fields allowing 200–500 characters or more, must use a dedicated page or a page-level editing mode with enough reading and editing space. Use a multiline `textarea`, not a single-line `input`; do not put long text in a bottom dialog.
- Editing that combines images, dates, long text, multiple independent fields, or item management must use a dedicated page or page-level editor. Short fields may remain inline when they are part of that larger workflow. Do not split every field into its own dialog, and do not compress the complete workflow into either a centered or bottom dialog.
- Dialog content and action spacing must be defined by `app-dialog`, with custom body and custom action content sharing the component's horizontal alignment. Do not compensate with page-specific dialog padding.
- Image selection that requires cropping must use the shared `image-cropper` component. Do not implement page-local crop overlays or canvases; `image-cropper` owns the common `app-dialog` presentation and crop workflow.
- Reuse existing shared modal components before adding new dialog behavior. Native image preview and system pickers are exempt because they are platform controls rather than business dialogs.
- Short text-only utility buttons, such as undo actions, should size to their label plus balanced horizontal padding. Do not use a fixed width or an oversized minimum width unless the layout explicitly requires equal-width controls.
- Follow `docs/ui-icons.md`. Familiar, single-purpose utility actions such as settings, back, close, add, edit, delete, search, and filter should use the shared `app-icon` as icon-only controls without duplicate visible text. Every icon-only control must have an accurate `aria-label` and at least a `56rpx × 56rpx` hit area. Keep visible text when an icon would be ambiguous, business-specific, or consequential.
- Doodle Icons is the default and only business icon source. If a suitable icon is not already packaged in `app-icon`, search the complete original Doodle Icons library and add the original asset to the shared icon directory. Do not generate, draw, trace, or assemble replacement SVG paths, and do not use text glyphs, Unicode symbols, or Emoji such as `★`, `♡`, `×`, or `⚙` as visual substitutes for icons.
- Shared icon sizes may use `16rpx`, `24rpx`, `27rpx`, or `30rpx`. Reserve `16rpx` for non-interactive inline indicators inside compact controls, such as a small dropdown chevron; standalone or clickable icons continue to use at least `24rpx`, with hit areas sized independently.
- Before adding a short text button, badge, or generic status label, check whether an existing shared `app-icon` communicates the meaning clearly. When it does, use the icon without duplicate visible text and carry the meaning in the surrounding control's accessibility label.
- Selected tabs and mutually exclusive top-level filter tabs must use `--ui-color-action-primary` as a black background and `--ui-color-text-inverse` as white text. Do not use a white selected background with dark text, an underline-only selected state, or a feature accent color for the selected tab.

## UI Typography Rules

- Business UI text may use only `20rpx`, `23rpx`, and `25rpx`, except for the dedicated home-banner greeting described below. Do not introduce `24rpx` or any other business-text size.
- Use the global `--ui-font-size-small` (`20rpx`) only for compact secondary metadata inside dense repeated cards, such as short attribute labels and values, timestamps, counts, badges, and brief supporting copy. Compact icon action bars that must keep several actions directly visible may also use it. Do not use it for ordinary buttons, tabs, inputs, placeholders, dialogs, or primary body text.
- Use the global `--ui-font-size-base` (`23rpx`) for body text, regular attribute labels, input content, placeholders, buttons, tabs, tags, hints, empty states, dialog content, and other normal interface copy.
- Use `25rpx` only for page titles, section titles, card titles, dialog titles, and genuinely emphasized values. `25rpx` is the maximum general business-text size, including hero and display treatments.
- The home-banner greeting is the sole display-size exception: `.home-banner__greeting` must use the global `--ui-font-size-home-greeting` (`40rpx`). Do not reuse this variable for other text.
- Create hierarchy with font weight, color, spacing, and layout instead of additional font sizes. Icons, icon glyphs, and purely decorative symbols are exempt from the `20rpx` / `23rpx` / `25rpx` restriction.
- When changing typography, adjust related control height, card minimum height, padding, and vertical gaps so the visual density remains balanced.

## UI Color Rules

- Follow `docs/ui-colors.md` for all mini program UI color work.
- Business UI styles must use the semantic CSS variables from `src/styles/colors.less`. Do not add hexadecimal, RGB, RGBA, HSL, or HSLA literals to page or component `.less` files.
- Use shared semantic variables such as `--ui-color-text-primary`, `--ui-color-text-muted`, `--ui-color-action-primary`, `--ui-color-border`, and `--ui-color-background-subtle` according to meaning. Do not select a primitive neutral only because its current value looks right.
- Feature-specific colors must be centrally declared in `src/styles/colors.less`, use a feature prefix such as `--footprint-color-*` or `--media-color-*`, and represent a stable feature meaning rather than a page-local visual tweak.
- TypeScript APIs and Canvas rendering must use constants from `src/styles/colors.ts`. Do not repeat color strings inside page, component, service, or utility TypeScript files.
- Native controls that require a concrete color must receive a value exposed from page or component data using `UI_COLORS`; do not hard-code the value in WXML.
- Mini program JSON configuration cannot consume CSS variables. Keep its unavoidable literals aligned with `src/styles/colors.ts` and covered by `server/tests/ui-colors.test.mjs`.
- Before completing a color change, run `node --test server/tests/ui-colors.test.mjs` plus the focused feature tests and `pnpm run typecheck`.

## Mini Program Asset Packaging Rules

- Follow `docs/miniprogram-assets.md` when adding images or audio to the mini program.
- Keep only small, runtime-required package assets under `src/`. Treat 200 KB as the combined image-and-audio budget reported by WeChat Developer Tools, not as a per-file allowance.
- Put large, optional, archival, design-source, and print assets under `public/` so Nginx can serve them from `https://gufeifei.cn/`. Do not duplicate the same asset in both `src/` and `public/`.
- Before completing an asset change, run `node --test server/tests/miniprogram-package.test.mjs` and rescan code quality in WeChat Developer Tools.

## Pre-Launch Database and Cleanup Rules

- This project is not yet launched. Do not preserve backward compatibility for old application code, APIs, sessions, schemas, field layouts, or data formats unless the user explicitly changes this policy.
- Preserve all valid user business data and its meaning. Before changing storage, audit the live development database, record counts, dependencies, and representative user-visible results; never assume the database is empty.
- Direct changes to the development Supabase database are allowed when required by the task. Use a transaction or an abort-safe migration, verify the replacement data first, and recheck counts and representative results afterward.
- Migrate or transform existing business data into the final structure, switch every read and write to that structure, then remove the obsolete tables, columns, triggers, functions, routes, types, pages, dual writes, fallback reads, compatibility aliases, and legacy data formats in the same task. Do not leave a compatibility layer or redundant active copy behind.
- Ephemeral operational data such as sessions may be invalidated or cleared when an auth format changes. Never delete user business records merely to simplify a migration.
- Before destructive cleanup, resolve exact targets and report what exists in them. Delete only after replacement data and current application reads have been verified. State what was deleted and whether it is recoverable.
- Keep migrations repeat-safe when they may also be applied manually or when live migration history is incomplete. Do not expose database URLs, keys, tokens, user identifiers, or other credentials in logs or responses.
- In the final handoff for any database-affecting change, always include: business-data preservation, migration status, verification performed, deleted legacy structures, deployment status, and any required user action.

## Logging and Operational Monitoring Policy

- Follow `docs/logging-and-monitoring.md`. The current intentional operating model is AI-assisted, on-demand or periodic inspection of database events, with server journal inspection only when needed.
- Do not routinely recommend adding a centralized log platform, fixed log-query dashboard, Sentry, ELK, Grafana Loki, Tencent Cloud Log Service, or proactive email, SMS, WeChat, or similar alerting. These are explicitly deferred and are not current project requirements.
- Use `operational_events` as the primary source for persisted server 5xx errors, rate limits, storage-quota blocks, and runtime-control blocks. Use a returned `request_id` to investigate a user-reported failure.
- Use the `human-draft-server` systemd journal for startup failures, process crashes, database-event persistence failures, and detailed request logs that are not represented in `operational_events`.
- Periodic review by AI or an administrator is sufficient at the current scale. Reconsider a logging platform or proactive alerting only when concrete evidence shows a need, such as multiple production instances, materially increased event volume, repeated incidents found too late, a defined response-time requirement, or multiple operators needing concurrent access. Do not treat generic best practice alone as evidence.
- A task that changes existing logging behavior must preserve privacy: never record request bodies, tokens, credentials, or user private content. Do not broaden event collection without an explicit task requirement.

## Git Push and WeChat Mini Program Upload

When the user asks to commit/push code and upload the mini program, use this established release workflow instead of rediscovering the tooling each time.

- Unless the user specifies another destination, this project's confirmed push target is `git@github.com:sjzhengzoe/human_draft.git`, branch `main`. Do not create a feature branch or pull request for this routine release flow.
- A push to `main` automatically deploys the Node server and `public/` assets through `.github/workflows/deploy-to-tencent-cos.yml.yml`. The workflow pulls `origin/main` on the Tencent Cloud host, installs locked dependencies, runs the build, restarts `human-draft-server`, checks the local health endpoint, and reloads Nginx. After a successful `main` push, do not tell the user that a separate manual server deployment is still required.
- Treat the automatic deployment as complete only after verification. Prefer checking the GitHub Actions run when access is available; independently verify `https://www.gufeifei.cn/api/health`, and for new or changed public routes verify a representative live request. If verification fails or the workflow is still running, report that state instead of asking whether pushes deploy automatically.
- Before committing, run `git status -sb`, inspect the diff, stage only the intended files, run the relevant focused tests plus `pnpm run typecheck`, and run `git diff --check`.
- Use a short commit message that describes the actual change, then push with `git push origin main`. Verify that the working tree is clean and `main` matches `origin/main` afterward.
- Prefer the official WeChat Developer Tools CLI for uploads. Do not rely on clicking the GUI upload dialog because its NW.js confirmation buttons are unreliable under automation.
- The confirmed CLI service port is `9420`. The normal upload command is:
  `/Applications/wechatwebdevtools.app/Contents/MacOS/cli upload --port 9420 --project /Users/gufeifei/Sites/human_draft --version <version> --desc <description> --lang zh`
- If the CLI reports that the service port is disabled or cannot read the `.ide` port file, close WeChat Developer Tools first. If a stuck modal prevents normal exit and the user has authorized the upload, terminate only the main `wechatdevtools` app process, not helper processes. Then rerun the upload while confirming service-port enablement:
  `printf 'y\n' | /Applications/wechatwebdevtools.app/Contents/MacOS/cli upload --port 9420 --project /Users/gufeifei/Sites/human_draft --version <version> --desc <description> --lang zh`
- When the user does not provide a version, default to the Asia/Shanghai date as `YYYY.MM.DD`. If that version was already uploaded the same day, append `.HHmm`. Use a concise Chinese description of the changes unless the user provides one.
- Treat an upload as complete only when the CLI prints `✔ upload`. Report the uploaded version, description, package size, commit hash, push target, and whether the developer-tools service port was enabled.
- Uploading may replace the currently selected experience version. The user's explicit instruction to upload authorizes this expected replacement, but do not submit a production review or publish a production release unless separately requested.

## Project Skills

When renewing the gufeifei.cn HTTPS certificate on Tencent Cloud, use the project-local skill:

`skills/renew-nginx-certificate/SKILL.md`

Use it for requests involving:
- `更新腾讯云证书`
- `更新证书` or `更换证书` in this project
- Nginx certificate expiry or renewal
- a supplied `gufeifei.cn_nginx.zip`

Key rules from the skill:
- Validate hostname, dates, and certificate/CSR/private-key matching before deployment.
- Commit only public certificate files; never commit or expose the private key.
- Use the existing `ssh gufeifei` alias for authorized Tencent Cloud terminal work; never store SSH credentials in the repository.
- Keep the certificate in the repository and the private key protected under `/etc/nginx`.
- Test Nginx before reload and verify HTTPS without bypassing certificate checks.

When converting raw thoughts in `flomo/text.md` into 小策论 posts, use the project-local skill:

`skills/flomo-xiaocelun-writing/SKILL.md`

Use it for requests involving:
- `改成小策论`
- `小策论`
- `更新` when the active context is `flomo/text.md`
- `整理想法`
- turning raw notes into Douyin/Flomo short-line reflective prose

Key rules from the skill:
- Start with Thought Partner questions before drafting when `## 想法` contains new raw material.
- Ask one question at a time and wait for the user's answer.
- Preserve the user's original idea path; do not rewrite it into a different topic.
- Generate title candidates before final drafting unless the user explicitly skips that step.
- Use a category tag, then a short center-sentence title, then short-line prose.
- Prefer 3 body paragraphs, max 4; total body lines ideally 10-13, max 15, excluding blank lines.
- Each paragraph should usually be 3-4 lines; each line ideally 10-18 Chinese characters, max 22.
- Short lines are only rhythm accents; do not create consecutive tiny lines or fragment sentences mechanically.
- Clear `## 想法` after finalizing the 小策论.

When working on A6 landscape loose-leaf menu backgrounds, use the project-local skill:

`skills/menu-binder-background-design/SKILL.md`

Use it for requests involving:
- `菜谱背景图`
- `活页菜单背景`
- `A6 横版菜单背景`
- printable binder menu card backgrounds
- white-base cafe, retro, hand-drawn, food, dessert, or coffee shop menu background styles
- prompt writing for backgrounds that preserve the left binding area while keeping the right content area flexible

Key rules from the skill:
- Keep A6 landscape output at `1748 × 1240px` / `300dpi` unless the user asks otherwise.
- Preserve the left `16mm` binding safe area and divider position.
- Treat the binding area as a width/layout constraint, not as a forced pure-white strip. It may share subtle background treatment, but should not contain important motifs, text-like marks, or high-contrast details.
- Do not draw punch holes unless explicitly requested.
- Account for printer white margins. Avoid full-bleed tinted backgrounds that create obvious white borders after printing.
- Prefer a white/no-color visual base with added decoration, or make any paper tint/texture fade naturally to white/no-color on all four outer edges.
- Avoid fixed photo frames, text boxes, prices, logos, or fake menu text.
- Avoid full-page color fills, hard-edge paper textures, and decoration that depends on exact trimming.
- Keep the central-right content zone low-interference so foreground food image/text sizes can change.
- Use the current foreground zones to balance decoration without drawing them: image area `x=43mm y=13mm w=78mm h=52mm`, text area `x=43mm y=70mm w=78mm h=26mm`.
- Do not push all decoration to the far right edge. Distribute sparse motifs around the usable right-side page while respecting the image/text reference zones, so the left side of the display area does not feel empty.
- Save generated background assets under `public/菜谱背景图/`.
- Name background files from the secondary tab name plus two digits, e.g. `基础极简01.png`.
- If wiring a background into the UI, add it to the A6 background list with `name` matching the filename without extension and `src` using `encodeURI("/菜谱背景图/{filename}.png")`.
- Run `npm run build` after code changes.

When generating foreground dish images for the A6 menu image area, use the project-local skill:

`skills/menu-dish-image-generation/SKILL.md`

Use it for requests involving:
- `生成菜图`
- `生成菜品图片`
- `菜的图片`
- `菜单主图`
- `透明底菜图`
- `食物待打印`
- matching the accepted tomato scrambled egg watercolor dish image style

Key rules from the skill:
- Save final dish images under `public/食物待打印/`.
- Keep final dish images at `1536 × 1024px`, PNG, 3:2 landscape.
- Final files should be transparent-background `RGBA` PNGs.
- Match the accepted reference style: soft watercolor food illustration, warm appetizing colors, centered dish, print-friendly.
- Use final production names like `{分类} · {菜名}.png`, for example `半荤 · 番茄炒鸡蛋.png`.
- Do not add style suffixes like `-水彩手绘` or `-透明` unless generating comparison variants.
- Avoid photorealistic food photography, semi-realistic glossy digital painting, anime, text, logos, hard frames, and visible white background blocks.
- If wiring a dish into the menu UI, add it to `foodPickerItems` in `src/pages/menu/App.vue`.
- Run `npm run build` after code changes.
