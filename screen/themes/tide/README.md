# 夜潮 · tide

The behavior of surf, none of its materials. An earlier prototype drew an actual beach (sand, foam lace, engraved text, fake sheen) and read as plastic: everything had a real-world reference to fall short of. This one keeps only what waves *do*. It renders them in 流体's language: abstract, continuous multi-scale fields (domain-warped fbm, no hard edges, no cells), light on a near-black base, nothing pretending to be lit.

Ported from `../echo/renderer/tide.js`. The shader and its tuning are unchanged.

## What it shows

- **A wave**: a glowing front that runs up fast and decelerates, then drains back, slow at first and then faster. Luminous filaments trail it, dense near the front and thinning behind, stretched on the backwash. Where it has been, an afterglow dies out.
- **The text**: plain white light, written unit by unit as it is "spoken". If the block has `timing`, that timing is used. Otherwise it is synthesized: the first 70% of the gap to the next block, spread over the units, weighted by length.
- **A block change**: a wave whose front reaches the text exactly when the next block starts, and never before the old block's last unit has been spoken. Where the front crosses the old text it flares, then the flow drags it into streaks. The new text is written under the water, and the backwash leaves it standing in the afterglow.
- **Dynamics**: the audio energy at launch decides how far a wave reaches and how thick its filaments are. Between blocks, small waves that never reach the text keep the breathing going. Without audio, energy rests at a middle value.
- **Idle**: only waves. That's the screensaver.
- **Accent**: `context.palette[0]` colors the light. A dark color is brightened, because the glow needs a bright stop.

## Files

- `parts/tide.frag.glsl`: the shader, verbatim.
- `parts/waves.ts`: when the block-change waves launch. Pure logic, tested.
- `parts/engine.ts`: text rasterization, the per-unit "spoken at" maps, live waves, uniforms.
- `theme.ts`: turns a presentation into timed lines and feeds the engine.

One stateless fragment pass: the waterline is a known function of time, so "when was this point last covered" is solved analytically, with no feedback buffers. The shader runs on the wall clock, so waves keep rolling while content is paused. Block waves launch when the content clock crosses their start.
