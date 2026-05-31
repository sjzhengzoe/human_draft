---
name: flomo-xiaocelun-writing
description: Convert raw thoughts in flomo/text.md into 小策论 short-form posts, and clean Flomo import CSV/HTML notes into the user's reusable note style. Use when the user says 改成小策论, 更新 in the context of flomo/text.md, 小策论成稿, 整理想法, or asks to rewrite/整理 flomo_import_整理.csv/html notes into the user's 小策论/Area classification and short-line prose style.
---

# Flomo 小策论 Writing

Use this skill when editing `flomo/text.md` into a 小策论 post.

## Workflow

1. Read `flomo/text.md`, especially `## 想法`, `## 日常笔记`, and the local writing requirements.
2. Do not directly draft from a new thought. Start with Thought Partner style questions.
3. Ask one question at a time. Wait for the user's answer before asking the next.
4. Use questions to clarify:
   - the real judgment the user wants to express
   - what the user is not trying to say
   - the cost, opposite case, or hidden tradeoff
   - the final landing point
5. After the idea is clear, infer the strongest angle from the user's own wording.
6. Generate 5 title candidates before final drafting, unless the user explicitly asks to skip titles.
7. Pick the most accurate 5-second conclusion and use it as the note title in `## 日常笔记`.
8. After drafting, review the daily note once for quick reuse, layout, and redundancy before finalizing.
9. After writing the final daily note, clear the content under `## 想法`.

## Output Format In flomo/text.md

The default output should be a daily note for the user, not a social-media draft.
Social-media writing should be generated separately only when the user asks to publish or create an external-facing version.

The daily note block should prioritize reuse:

```text
#小策论/{category}
#Area/{area}        optional, only when there is a concrete domain

5 秒结论

字段：
内容
```

Choose the most fitting category:
- `#小策论/1.心智-个人主观内在世界`
- `#小策论/2.身体-个人客观外在世界`
- `#小策论/3.精神-集体主观内在世界`
- `#小策论/4.职业-集体客观外在世界`

Use `#Area/...` for concrete domains. Add Area child tags based on the actual scenario when useful, such as:
- `#Area/商业`
- `#Area/养猫`
- `#Area/健康`
- `#Area/装修`
- `#Area/摄影`
- `#Area/穿搭`

Rules:
- `#小策论/...` is the cognitive layer: what kind of understanding this note belongs to.
- `#Area/...` is the domain layer: where the note may be reused.
- A note can have both layers, but do not force an Area tag when the content is purely cognitive.
- The title must be the 5-second conclusion: future review should reveal the core judgment immediately.
- After the title, choose 1-2 fields, at most 3.
- Field names are not fixed. Read the content first, then choose a field that matches what the text is doing.
- Common fields include `为什么：`, `使用场景：`, `怎么做：`, `来源：`, `例子：`, `提醒：`.
- Create content-specific fields when clearer, e.g. `处理方式：`, `症状判断：`, `选择要点：`, `判断依据：`, `检查项：`.
- Do not force `为什么：` onto procedural, symptom, checklist, or selection notes.
- Fields are tools for future reuse, not a rigid template. Use only the fields that make the note easier to scan.

## Historical Note Cleanup Rules

Use these rules when整理 `flomo_import_整理.csv`, `flomo_import_整理.html`, or old Flomo export notes.

Work item by item:
- Read and understand each note before changing it.
- Do not use scripts or bulk replacement for semantic cleanup.
- Mechanical checks are allowed, but classification, title, fields, and paragraphing must be decided by meaning.
- If both CSV and HTML exist, keep them synchronized.
- Do not change the note count unless the user explicitly asks to delete or skip notes.

Tagging:
- Pure domain notes only use `#Area/...`. Do not force `#小策论/...` onto procedural, checklist, product-selection, symptom, size, setup, or how-to notes.
- Use both `#小策论/...` and `#Area/...` only when a concrete domain example produces a reusable cognitive principle.
- When both tags are used, choose the 小策论 category from the conclusion, not from the surface scenario.
- Examples of valid double-tag notes: a cat-training story that is really about patience; a cat-care observation that is really about understanding principles before blaming behavior.
- Remove accidental Area tags from purely cognitive notes.

Title:
- The title must let the user see the conclusion within 5 seconds.
- Avoid directory-like titles such as `水`, `猫粮`, `保健品`, `浴缸`, `空间尺寸`.
- For Area notes, write the title as a usable conclusion or action principle, e.g. `猫水碗选蓝绿色 至少 3 个 一天一换`.
- For 小策论 notes, write the title as the core judgment, distinction, or self-reminder.

Fields:
- Field names are not fixed. Choose the field after reading the note.
- Do not force `为什么：` when the note is not explaining a reason.
- Use content-specific fields such as `处理方式：`, `排查：`, `选择要点：`, `尺寸：`, `发布要点：`, `判断与检查项：`, `设计原则：`.
- Keep fields only when they make the note faster to reuse.

Paragraphing:
- Avoid 5 or more continuous body lines without a blank line when the meaning has changed.
- Add blank lines by semantic blocks: context, observation, reason, method, options, result, conclusion.
- Do not add blank lines between every sentence.
- Dense practical notes can stay compact if they are already easy to scan.

Public-facing caution:
- Daily notes are for the user first. External-facing posts should be generated separately when publishing.
- For health, pet illness, medicine, and similar sensitive topics, keep wording as personal notes or observation. For public versions, avoid sounding like direct medical/veterinary instruction and add appropriate caution when needed.

## Title Rules

- The title is the first non-tag line after all tags.
- Make it a clear center sentence, key sentence, or action principle.
- Prefer positive guidance when possible.
- For concept explanations, use `概念名：一句话解释`.
- For life observations, use a judgment sentence.
- Keep it visually suitable for Douyin image layout:
  - preferably 1 line
  - ideally 12-18 Chinese characters
  - avoid exceeding 20 Chinese characters
- Avoid abstract, slogan-like, over-summarized, or chicken-soup phrasing.

## Body Style

Write like the user's own reflective prose:
- start from a real feeling or daily observation
- preserve the user's original meaning and key images
- keep the self-dialogue feel: `好像`, `慢慢意识到`, `其实`, `原来`
- be gentle and plain, not like a dry takeaway article
- do not over-rewrite the user's topic into a different topic
- do not turn it into a list of tips or a method unless the user wants that
- readability and patience matter more than completeness
- keep the piece light enough that someone wants to keep reading
- prefer a small lived realization over a fully reasoned explanation
- do not make the writing too rational, report-like, or conclusion-heavy

## Learned Style From The User's Flomo Export

The user's stronger 小策论 entries usually follow this shape:
- Start from a concrete trigger: `看到...`, `听到...`, `最近...`, `以前...`, `和...聊天`, `买/做/尝试...的时候`.
- Move from the first reaction or old assumption into a clearer distinction: `以前会觉得...`, `但后来发现...`, `于是意识到...`.
- End by naming the real issue, boundary, or action principle, not by writing a grand summary.

Common title patterns:
- `好的 X 不是 A 而是 B`
- `X 的主要矛盾 不是 A 而是 B`
- `别把 A 误判成 B`
- `X：一句话解释`
- A plain judgment sentence that keeps the key distinction visible.

Common sentence patterns to reuse when natural:
- `真正的问题不是 A 而是 B`
- `不是为了 A 而是 B`
- `看起来在 A 实际上在 B`
- `与其 A 不如 B`
- `先 A 再 B`
- `这才是...`

Tone rules from the export:
- Prefer plain judgment over literary mood.
- Allow gentle self-correction: `我很容易...`, `后来才发现...`, `慢慢意识到...`.
- Keep the writing close to everyday reasoning, with concrete nouns and small examples.
- For abstract topics like business, AI, notes, learning, or relationships, anchor the idea in how the user looks at something or does something.
- Avoid motivational slogans, over-polished metaphors, and abstract words piled together without a concrete distinction.
- Do not explain every link in the logic chain; leave some space for the reader to connect it.
- Avoid turning the final paragraph into a checklist unless the user's raw thought is explicitly a checklist.
- If the draft feels correct but boring, cut explanation before adding more wording.

You may trim, merge, or lightly supplement wording when:
- a sentence is not smooth
- a word is inaccurate
- an expression is redundant
- the rhythm is too fragmented

But preserve the user's original idea path unless the user explicitly changes the direction.

## Douyin Layout Rules

Layout quality is more important than mechanically satisfying numbers.
The layout rules serve visual beauty only. Do not force fixed paragraph count, line count, or line length if doing so makes the writing stiff, wordy, or less like the user's voice.

- Use one semantic line per visual line.
- Separate paragraphs with blank lines.
- 3 paragraphs is usually best; use at most 4.
- Total body lines: ideally 10-13, max 15, excluding blank lines.
- Each paragraph: usually 3-4 lines, occasionally 5.
- Each line: ideally 10-18 Chinese characters, max 22.
- Avoid cutting sentences into tiny fragments just to increase line count.
- Do not make all lines similar length.
- Short lines are only rhythm accents.
- Do not place two consecutive lines under 8 Chinese characters.
- Very short phrases like `就会觉得`, `反而到了现在`, `但慢慢意识到`, `后来才发现` should usually merge into adjacent lines.
- Prefer complete semantic lines with varied rhythm, e.g. `中长行 / 短行 / 中长行`.
- Use blank lines only between paragraphs, not between every sentence.

After drafting, do a final layout and redundancy pass:
- Read the post as it will appear on the Douyin image.
- Remove repeated meaning, especially repeated conclusions in the final paragraph.
- Merge lines that only exist to slow the rhythm but add no meaning.
- If two adjacent lines say the same thing in different words, keep the more concrete one.
- If the ending explains too much, cut it back to the key judgment or action question.
- Prefer a slightly shorter, cleaner post over a fuller post with redundant transitions.
- Ask whether the post feels patient-readable; if it feels too long, too rational, or too eager to prove itself, cut it.

## Common Mistakes To Avoid

- Do not skip the question phase when `## 想法` has new raw material.
- Do not delete or replace the user's original meaning.
- Do not make every line short.
- Do not write a hard summary when the user wants emotional prose.
- Do not over-explain the conclusion.
- Do not keep redundant expressions just because they sound smooth.
- Do not preserve paragraph/line targets at the cost of natural voice.
- Do not make an abstract thought feel like a lesson plan.
- Do not leave `## 想法` filled after finalizing the post.

## Final Response

After editing, tell the user:
- that `flomo/text.md` was updated
- the selected title
- whether `## 想法` was cleared
- any important note about format, only if relevant
