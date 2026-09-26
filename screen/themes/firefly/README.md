# 流萤 · firefly

A swarm of fireflies over the whole screen. There is no bubble and no card: when something arrives they gather and spell it, then scatter again. What arrives is the creature.

New in echoV2, not ported.

## The window

The `overlay` profile: the whole screen, clicks passing through. Only the fireflies are drawn, on one canvas (`parts/sky.ts`).

## A firefly

A firefly's body is dark and only the lantern at its tail glows, and it is drawn that way. On a light desktop the bodies show, on a dark one the light does, so what they spell reads on either. The light is a soft sprite added up where they crowd, so a dense stroke glows more than a lone firefly. Bodies face the way they fly, and the lantern trails just behind.

## The swarm

`parts/swarm.ts` (pure, tested):

| | What they do |
|---|---|
| wandering | each on a heading that drifts, pulled toward the swarm's centre, pushed apart when close; the centre itself drifts about the middle of the screen |
| flashing | each on its own clock, 0.3–0.5 flashes a second: a short flash, then dark but for an ember |
| something arrives | each point of the text is given the nearest firefly still free; if there aren't enough, more fly in from the edges. They set off after a moment each, so the swarm gathers rather than jumps, and hold a steady glow with a slow flicker |
| it's gone | they let go, the ones that came in to help fly off the screen, and the swarm is back to its own size (70) |
| something plays | they come into step: see below |
| nothing for two and a half minutes, by day | they settle along the bottom of the screen, in the grass, glowing slowly. At night (19:00–5:00) fireflies are out, so they keep flying |

### In step

Some fireflies (*Pteroptyx* in Southeast Asia, *Photinus carolinus* in the Smokies) flash in unison, a whole tree at once. Here the beats of what plays do it. The swarm keeps a chorus every four beats, and on each beat a few more join it. Once in, a firefly flashes on the chorus instead of on its own clock. Over a dozen beats the whole swarm comes to flash as one. When the beats stop for three seconds, each goes back to its own clock and they drift apart. Fireflies holding a letter brighten on each beat instead.

## What they spell

`parts/glyphs.ts` (pure, tested) chooses the lines; `parts/letters.ts` turns them into points:

| Presentation | Spelt |
|---|---|
| text | the line it has reached by its `at`, one line at a time; a primary line's `reading` in small type above it |
| value | the label, small, over the figure with its unit and ↑↓ delta |
| progress | the label over a bar of fireflies, the filled part lit, the rest dim |
| what plays | its line, smaller and softer, when no card is on |
| `context.palette[0]` | the colour they glow while they spell it |

Each line is set in PingFang on a canvas nobody sees, and its inked pixels are sampled a point every tenth of the type size, rows offset like a honeycomb. A long line wraps (latin words kept whole) and shrinks if it runs past three rows. A formation takes at most 760 fireflies; beyond that the sampling gets coarser. A letter's glow keeps to its dot spacing, so small type stays readable. The block is centred where the swarm is, kept within the upper middle of the screen.

## Salience

- **Quiet**: they spell it dimmer.
- **Attention**: they gather at once, all lit.

## Files

- `manifest.ts`: `card` and `media` slots, the `overlay` profile, the energy and onset signals.
- `parts/swarm.ts`: the fireflies (pure, tested).
- `parts/glyphs.ts`: what to spell, wrapping, sampling (pure, tested).
- `parts/letters.ts`: lines of type → points.
- `parts/sky.ts`: the drawing.
- `theme.ts`: slots, signals, and what they spell each frame.
