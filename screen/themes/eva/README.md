# 新世纪 · eva

The desktop becomes the black void of an anime intertitle. Each block of text is slammed on screen as an ultra-bold Mincho title card, in the 次回予告 language: huge type, bleed, asymmetry, hard cuts, no easing. Nothing else.

An earlier version also had A.T.-field hexagons rippling on audio onsets, a warning-stripes lock-on ceremony and a fake episode number in the corner. All of it was subtracted: every extra mark on the void competed with the type, and the purity is the theme.

Ported from `../echo/renderer/eva.js`. The layout engine and its tuning are unchanged.

## What it shows

- **One block per card.** A repeated block holds its card instead of re-slamming it.
- **Motion discipline.** Cuts are instant and holds are long. The single allowed animation is the 100 ms two-step slam a card lands with.
- **New content** gets a hard cut to 「待機 / ACTIVITY : NONE」 until its first block arrives. Idle shows the same standby card.
- **Status and other non-text blocks** go through `toText` and become an ordinary card.

## Two layers

| Layer | File | Decides |
|---|---|---|
| Layout engine | `parts/layout.ts` | Given a line and a template, set it well: word-safe breaks, measured fit, per-template composition. |
| Director grammar | `grammar.ts` | Which template each card gets, where it breaks, which few cards earn the white card, which word goes red. |

Until the director's answer arrives, or when there is no API key, or when the content is short (under 4 blocks), a content-aware heuristic picks the template. The heuristic never picks whisper or the white card; strong statements are the director's call. A late answer only upgrades the cards that haven't been cut to yet.

## Templates

`whisper` · `stack` · `vert` · `corner` · `dual` · `giant` · `bleed`, plus `repeat`. The engine picks `repeat` on its own when the text is the same unit repeated, e.g. 你说 你说 你说.

## Director output format

One line per block:

```text
<index> <template> [inv] [/break]... [.emphasis]
```

- **Identical text gets identical direction.** This keeps the visual rhyme across repeated lines.
- **At most 3 white cards** per piece of content.
- **Breaks and emphasis must be verbatim substrings** of the block. Anything else is dropped.
