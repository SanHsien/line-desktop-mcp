# Release artwork

- `line-agent-cover.png`: AI-generated concept illustration, created with the built-in image generation tool on 2026-09-11. It contains synthetic text/image cards; no real chat or official logo asset is used.
- `line-agent-cover-v3.png`: version-neutral sibling for v3.0.0, edited with the built-in image generation tool on 2026-09-12. The pill now says `Open Source`; the historical v2.0.0 cover remains unchanged.
- `workflow-{zh-TW,en,ja,th,id}.svg`: deterministic SVG workflow diagrams with localized labels.
- `performance.svg`: deterministic bars from the documented text-history timing samples. Warm MCP samples are shown separately from cold core timing.

The release headline is **Text + images. Context, faster.** The cover was visually checked for the exact project name, v2.0.0 badge and feature emphasis. SVGs contain no scripts, foreign objects, external URLs or embedded user data.

## Cover composition prompt

Use case: precise-object-edit. Edit target: attached existing open-source project banner. Rebrand it into a polished wide GitHub README cover for the new independent project LINE Agent MCP v1.0.0, emphasizing TWO features: organizing conversation context INCLUDING IMAGES, and FAST reading. Keep the clean white and mint-green 2.5D isometric visual style, wide 2:1 composition, generous whitespace and crisp typography. Replace the old main title with exact text "LINE Agent MCP". Replace the badge with exact text "v1.0.0 · Open Source". Replace the old slogan with exact text "Text + images. Context, faster." Do not include "29 tools" or any old version/name. Change the left conversation cards so text bubbles and unmistakable photo/image thumbnail cards are visibly interleaved; add a tasteful small lightning accent on the flowing connector. The center should visually combine a text card and an image card into one organized context stack, with the human confirmation and reply idea retained on the right at smaller scale. This is a concept illustration, not an actual application screenshot: no customer names, actual messages, model logos, official LINE logo/wordmark inside the icon, QR codes or private data. No invented benchmark claims. Preserve premium sharp finish and readable exact text.

## Final version edit prompt

Use case: text-localization / precise text edit. Edit target: the supplied LINE Agent MCP banner. Change ONLY the badge text from "v1.0.0 · Open Source" to exact "v2.0.0 · Open Source". Keep the entire rest of the image unchanged: title LINE Agent MCP, slogan Text + images. Context, faster., all image thumbnail cards, lightning symbol, human confirmation illustration, white/mint colors, proportions and layout. This now represents a major release in the existing repository, not a new first release.

The edit target was our previously generated concept banner. Earlier discarded variants are not included in the release.

## v3 version-neutral edit prompt

Use case: text-localization. Asset: existing LINE Agent MCP open-source project README cover. Input image 1 is the edit target. Change ONLY the text in the small pale green pill beneath the main title: replace 'v2.0.0 · Open Source' with exactly 'Open Source', centered in the existing pill. Keep all other content unchanged: main title 'LINE Agent MCP', subtitle 'Text + images. Context, faster.', green/white illustration, composition, characters, icons, background, shapes, aspect ratio and edge framing. Do not add any new text or elements. Preserve the existing clean high-resolution artwork.

The resulting v3 cover was visually checked for the exact title, subtitle and version-neutral pill. The built-in tool was used, not the CLI fallback.
