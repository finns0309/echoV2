# 流体 · plasma

Text floating over a slowly flowing, domain-warped fluid. The fluid is the background, the idle state and the rhythm all at once.

Ported from echo's `stage` layout: `renderStage` in `app.js`, the §STAGE and wave-reveal CSS, plus the plasma shader from `fx.js`.

## What it shows

- **One block at a time, center screen.** Each new block becomes a card. Its characters wave in one by one (blur, rise and scale, 42 ms apart), while the previous card drifts up, blurs out early and fades late, so a departing line dissipates instead of sliding off.
- **A reading** (kana under a kanji word) floats under the card in a smaller, quieter line.
- **Every change pulses the fluid.** The flow briefly speeds up and then eases back. Because the shader's time is an accumulated phase, a pulse never jumps the field to a new position.
- **Idle**: just the fluid. Nothing floats.
- **Accent**: `context.palette[0]` (hex) tints the fluid's mid-tone. The dark and bright stops stay fixed, so contrast survives any color. Without a palette it uses the original hot magenta.
- **Type scale**: grows with the window diagonal. It stays at 1.0 up to 900 px, then follows a gentle power curve up to 3.2×.

## Files

- `parts/plasma.frag.glsl`: the shader, verbatim from the old version.
- `parts/field.ts`: WebGL setup and the beat-modulated phase. It is driven by the host's frame clock and capped at about 60 fps.
- `parts/cards.ts`: the floating cards.
- `theme.ts`: picks the current block, sets the scale and the accent.

## Changes from the old version

- The tray's 流体画质 (quality) submenu is gone. The shell no longer knows about specific themes. Quality is fixed at the original look: 3 octaves at half resolution.
- The old version showed a ♪ card between lyric lines. That was lyric-specific, so here the stage simply stays empty between blocks.
