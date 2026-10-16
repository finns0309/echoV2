# Claude

An ivory page with a clay spark on it, in Claude's own look: warm paper, a serif voice, and the spark that turns while it thinks. The page draws no app around it: no input box, no buttons, no sidebar. There are only words, and the one spark that writes them.

New in echoV2, not ported. MuseV2's `claude` theme is the reference for the palette and the spinner.

## The page

The `device` profile: 760×560 at the bottom right of the screen. The page fills the window, rounded and hairline-edged, and everything on it grows with the window (`--cl-scale`). It is light or dark with the system, as Claude is:

| | Light | Dark |
|---|---|---|
| paper | `#faf9f5` | `#262624` |
| ink | near-black at 92% | ivory at 93% |
| the spark, the progress bar, the glint | clay `#d97757` | clay `#d97757` |

Latin is set in Charter, Han and kana in the serif of their own language (Hiragino Mincho for Japanese, Songti for Chinese), the small print in the system face.

## The spark

Eleven rays round a hub, uneven in length and spacing, as if cut by hand (`parts/spark.ts`, tested). It is one element that glides from place to place and grows or shrinks to fit each one, so the page never jumps. How it moves says what it is doing:

| | |
|---|---|
| resting | breathes; on an empty page it stirs every half a minute |
| thinking, writing | its rays ripple in and out, out of step, and it turns |
| listening | swells with the loudness (against what has been playing) and kicks a part turn on each beat |
| something worth a glance | bursts open and spins once |

## What it shows

Two slots: `card` (anything that arrives) and `media` (whatever plays, on a media timeline).

**Nothing on air.** Claude's empty page: the spark beside a serif greeting by the hour (Good morning, Coffee and Claude time?, Happy Friday, Good evening, Hello, night owl), written in as Claude streams.

**A card.** It is a reply. The conversation's title is the card's title, with the byline (and a speaker who isn't Claude) beside it. Then:

1. The spark moves to where the reply starts and thinks for a moment (1.4 s), a verb from Claude Code's spinner beside it with a clay glint sweeping across: *Pondering…*, *Noodling…*, *Clauding…*. The same card always thinks with the same verb.
2. It writes. The reply is laid out whole before a word shows and set in the middle of the page, so nothing moves while it is written. Words arrive a CJK character or a latin word at a time, each block no earlier than its `at`, and each after the one above it. The spark goes along with them like a pen: just after the last word, keeping up along a line and gliding back at each new one.
3. When it is written the spark drops under the reply and rests there.

How the blocks are set (`parts/message.ts`):

| Block | Set as |
|---|---|
| a short first line (12 characters or fewer, when more follows or it has a reading) | the reply's heading, its reading as ruby |
| text | a paragraph; `emphasis` in bold |
| annotation | a quote, with a rule down its left |
| attribution | a citation chip |
| value | its label small, the figure large in serif, the unit, and an olive ↑ or red ↓ pill; a figure that changes flashes clay |
| progress | its label and percentage over a thin clay bar that slides to its new length |
| image | a rounded picture, its `alt` as the caption |

A reply of a few words is set large, a longer one smaller, a page of them at reading size. One taller than the page scrolls under a fade at the top, keeping the pen in view.

**What plays.** With no card on, its line takes the greeting's place, in the same large serif, each line written in as the last fades up and away. The title and byline sit under it. In a break (before the first line, an intro, a long interlude) the title stands there instead and a listening verb glints under it (*Humming…*, *Vibing…*). Under a reply it drops to a status line at the foot of the page: ♪ and the line on the left, the title on the right.

## Salience

- **Quiet**: no thinking; the reply is written at once, smaller and in a paler ink.
- **Attention**: no thinking either. The spark bursts open and spins, and a clay edge glows once round the page.

## Files

- `manifest.ts`: the two slots, the `device` profile, the energy and onset signals.
- `parts/spark.ts`: the spark's shape (pure, tested) and how it moves.
- `parts/stream.ts`: when each word is written (pure, tested).
- `parts/message.ts`: a card as a reply, and where the pen is.
- `parts/page.ts`: the page, the home line, the status line, and the spark's glide.
- `parts/words.ts`: the greeting and the verbs (pure, tested).
- `theme.ts`: slots, signals, and which place the page is in each frame.
