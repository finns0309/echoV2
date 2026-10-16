# 风铃 V2 · furin-v2

风铃 as Claude would draw it. The same Edo chime hanging from the top edge of a narrow transparent window, with the same physics and the same wind, but drawn the way Anthropic illustrates: confident black brush ink, flat colour laid a little off its line, a lot of air. The clapper is Claude's spark, and the paper strip is an ivory card written in Claude's type.

New in echoV2, a sibling of 风铃 rather than a port. 风铃 stays as it was.

## The drawing

Everything is SVG, drawn once (`parts/glass.ts`, `parts/brush.ts`, tested) and swung by the physics:

| | 风铃 | 风铃 V2 |
|---|---|---|
| bell | painted glass, gradients, reflections | a flat colour in a brush-ink outline, the colour slipped a few pixels off the line as a print slips its register; one sliver of ivory for the light; two clay strokes painted round it |
| line | none | one brush stroke, thick where a right hand presses (down the far side, round the mouth) and thin over the shoulders, left open at the top where the cord goes in |
| glass colour | the content's palette | the season's, from Claude's palette: heather (spring), cactus (summer), manilla (autumn), oat (winter) |
| clapper | a glass bead | the spark, turning with the clapper's swing and jumping when it strikes |
| strip | washi, brush script, a red seal | an ivory card with a hairline and a soft shadow, Newsreader over Hiragino Mincho or Songti, and the spark's glyph for a seal |
| a strike | a ring of light | three ink sound marks off the struck rim, the way a comic draws a ring |
| a strong gust | felt only | drawn: one long brush stroke curling past behind the chime, the way the wind blows |

A paper edge sits behind the ink, as a cut-out has one: lost on a light desktop, it keeps the line on a dark one.

`brush()` turns a centre line and a pressure curve into a filled outline, so a stroke can swell and taper as a pen line can't; every line in the drawing is one.

## What it shows

One block at a time on the card, about 22 characters, as 风铃 does (`parts/paper.ts`, tested): a long line uses its `short`, a reading sits beside the word as ruby, a figure stands upright when it is two digits, progress is a clay line down the card's edge, a picture is a small print with its caption.

- **A new line is written, not flipped.** The old writing fades, then the new goes down the card a character at a time, unhurried (a brush, not a keyboard), the reading coming once the word is down. Meanwhile the seal turns through the CLI's spinner (`· ✢ ✳ ✶ ✻ ✽`) and rests as ✻ when it is done.
- **The size fits the card.** A line is set as large as fits in one column (17 to 12 px); past that it takes two columns.
- **A status updating in place** is rewritten where it hangs.
- **Idle**: the card is wiped; the blank card and its resting seal still read as an object.

## Audio and salience

As 风铃: energy is the wind, an onset is a gust on the card, and the strikes come at the end of the chain (wind → card → thread → spark → glass). The physics is `screen/primitives/chime`, shared with 风铃.

- **Quiet**: no breath of wind; the writing is paler.
- **Attention**: the bell rings on both rims before the card is written, and the seal warms.

## Files

- `manifest.ts`: one slot, the `hanging` profile, the energy and onset signals.
- `parts/brush.ts`: brush strokes from a line and a pressure curve (pure, tested).
- `parts/glass.ts`: the bell's drawing and the season's colour (pure, tested).
- `parts/paper.ts`: what the card carries, and its type size (pure, tested).
- `parts/chime.ts`: markup, the writing, per-frame transforms, sound marks, gusts.
- `theme.ts`: picks the current block, writes it, drives the frame.
- `theme.css`: materials only. All motion is inline transforms.
