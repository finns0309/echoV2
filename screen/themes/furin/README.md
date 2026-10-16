# 风铃 · furin

A desktop object first, a display second. An Edo-style glass bell (江戸風鈴) hangs from the top edge of a narrow transparent window. The current text is brushed vertically on the paper strip (短冊) tied under the clapper. A simulated breeze keeps the chain swaying when nothing is showing, so the widget reads as a living ornament even with zero text.

Ported from `../echo/renderer/furin.js`; the physics and its tuning are unchanged.

## What it shows

- **One block at a time**, on a strip about 22 characters tall. When the text is too long, it uses the block's `short`. If the strip shows the full text and the block has a `reading`, the reading sits beside it as ruby.
- **A new block flips the strip over**, and the text swaps while it's edge-on. The same text again only sends a breath of wind through it.
- **Idle**: the strip flips back to blank. The bare strip and its seal still read as a deliberate object.
- **Accent**: the glass takes `context.palette[0]` when the content has one.

## Audio mapping (when a pack emits signals)

| Signal | Effect |
|---|---|
| `energy` | Wind strength: the song literally is the wind. Fast attack, slow release. |
| `onset` | A gust on the sail. The beat hits the paper; the thread tows the clapper into the rim a beat later. Strikes are the end of the causal chain: wind → paper → thread → bead → glass. |
| `centroid` | Ring tint: bright sounds ring whiter, dark ones warmer. |

Strikes stay honest without audio too: any gust or text-change puff that pumps the paper enough rings the bell.

## Physics

Three damped spherical pendulums (cord+bell / clapper / paper), nested as DOM 3D transforms. Each link swings on two axes, in-plane (rotateZ) and depth (rotateX). One wind vector drives them, and its heading slowly wanders, so the chime traces ellipses instead of a flat arc. The paper is also a torsion oscillator (rotateY): wind turbulence is the torque, the thread's wind-up is the spring. The bell only drifts slowly, and is read through parallax between the inside-painted motif and the surface highlights.

## Files

- `screen/primitives/chime`: the pendulums, wind, collisions and strikes. No DOM; shared with 风铃 V2.
- `parts/chime.ts`: markup, per-frame transforms, strike rings.
- `theme.ts`: picks the current block, flips the strip, drives the frame.
- `theme.css`: materials only. All motion is inline transforms.
