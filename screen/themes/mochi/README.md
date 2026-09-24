# もち · mochi

A little rice-cake creature living along the bottom of the screen, a desktop pet in the line of Neko and Shimeji. echo's content becomes what it does: it says cards in a speech bubble, sways and hums to what plays, wanders when there is nothing, and sleeps at night.

New in echoV2, not ported.

## The window

The `overlay` profile: the whole screen, clicks passing through. Only the mochi and what it says are drawn. The first version is to watch, not to touch. Petting it or dragging it would need the window to take clicks just where the mochi is, which is a shell capability echo doesn't have yet.

## The creature

Drawn in SVG (`parts/body.ts`): a soft dome with a flat underside, a warm sheen on top, dot eyes, blush and a small mouth, and a shadow on the floor. Everything it feels is squash and stretch. It widens as it lowers, stretches in the air, and its shadow shrinks as it rises.

### Today's flavour

It is dressed as the season's wagashi (`parts/flavor.ts`, tested). Only its colours and a garnish change: the garnish is drawn at rest size and squashes with the body.

| When | Flavour |
|---|---|
| January | つきたて, fresh and white |
| February | うぐいす餅, pale green with a dusting |
| March to 10 April | 桜餅, pink, wrapped in a cherry leaf |
| 11 April to May | 草餅, green; 柏餅 (white, in an oak leaf) for Children's Day, 1–7 May |
| June to August | 水信玄餅, see-through |
| 1–18 September | お月見団子 |
| 19–27 September (autumn higan) | おはぎ, red bean, with light eyes |
| 28 September to 15 November | きなこ餅, dusted |
| 16–30 November | 栗餅, a piece of chestnut on top |
| December | いちご大福, a strawberry peeking out |

Its habits are plain numbers in `parts/motion.ts` (tested):

| | What it does |
|---|---|
| resting | breathes, blinks every few seconds, looks about |
| wandering | hops along the floor to somewhere else, leaning into each hop, face turned the way it goes |
| a card arrives | a little hop to notice it, then faces you and talks: its mouth moves with each new line |
| something loud | two big hops, wide eyes, a red "!" beside it |
| something plays | sways with the energy, hops on the beats, happy eyes, a ♪ beside it |
| nothing for two minutes, or late at night (23:00–6:00) | flattens into a pancake and sleeps, "zzz"; a card wakes it |

## What it says

A speech bubble over its head (`parts/bubble.ts`), kept on screen, its tail pointing at the mochi, in Hiragino Maru Gothic:

- who it is from and what it is about (speaker · title), with a dot in the card's own colour;
- a value as a number on a little sign, progress as a bar in the card's colour, and a picture;
- the text line it has reached by its `at`, with the emphasis in the card's colour and the reading as ruby.

What plays it only hums, in a lighter bubble: "♪" and the current line. It stops humming while it talks.

### Writing a word

A word card (a primary line with a reading, at most four characters, all kana and kanji) is also written out. A practice sheet appears beside the mochi, on whichever side has room: washi paper with the red guide lines of a calligraphy sheet. The mochi turns to it and sets the word down stroke by stroke in ink, in the right order. Each stroke takes as long as it is long, and the brush lifts between strokes and between characters (`parts/board.ts`).

The strokes come from [KanjiVG](https://kanjivg.tagaini.net) (CC BY-SA 3.0, © Ulrich Apel; see `parts/strokes/NOTICE.md`). `scripts/make-strokes.mjs` turns its XML into `parts/strokes/*.json`: 6,600 kana and kanji, coordinates to a tenth, one file per Unicode block of 256. A word loads only the blocks its characters are in, from the app itself (`parts/strokes.ts`). The XML isn't kept; to remake the data, download `kanjivg-<date>.xml.gz` from KanjiVG's releases, unzip it, and run `node scripts/make-strokes.mjs <file>`.

## Salience

- **Quiet**: a whisper; the bubble is smaller and paler.
- **Attention**: two big hops and a "!", and the bubble has a coloured edge and a shake.

## Files

- `manifest.ts`: `card` and `media` slots, the `overlay` profile, and the energy and onset signals.
- `parts/motion.ts`: its habits (pure, tested).
- `parts/flavor.ts`: the wagashi calendar (pure, tested).
- `parts/body.ts`: the drawing.
- `parts/bubble.ts`: the speech bubble, the hum, the mark.
- `parts/board.ts`: the practice sheet, and the writing.
- `parts/strokes.ts`: which cards are words (tested), and their strokes, loaded by block from `parts/strokes/`.
- `theme.ts`: slots, signals, the clock, and where it all goes each frame.
