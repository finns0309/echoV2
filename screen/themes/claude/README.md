# Claude

An ivory page with a clay spark on it, in Claude's own look and in Claude's own shape. What arrives is a reply in one of the day's conversations, and what stays and changes is an artifact open beside them. The page draws nothing to press: no input box, no buttons. There are only words, the conversations they belong to, and the one spark that writes them.

New in echoV2, not ported. MuseV2's `claude` theme is the reference for the palette and the spinner.

## The page

The `device` profile: 760×560 at the bottom right of the screen. The page fills the window, rounded and hairline-edged, and everything on it grows with the window (`--cl-scale`). It is light or dark with the system, as Claude is:

The values are Claude's own, read off its pages: ink `#141413` on `#faf9f5`, warm greys for what is secondary, hairlines half a pixel wide, shadows you feel more than see.

| | Light | Dark |
|---|---|---|
| paper | `#faf9f5` | `#262624` |
| ink, secondary, tertiary | `#141413`, `#5e5d59`, `#8a8983` | `#faf9f5`, `#c2c0b6`, `#9a9890` |
| raised (artifact, attachment card) | `#ffffff` | `#30302e` |
| the spark, the progress bar, the glint | clay `#d97757` | clay `#d97757` |

Claude's serif is Anthropic's own and isn't on the Mac, and none of the serifs that are has a light weight, so the theme sets [Newsreader](https://github.com/productiontype/Newsreader) (OFL 1.1, `screen/tokens/fonts/`, Latin, variable weight and optical size, 132 KB) in its place: display lines at weight 330 with tight tracking, as Claude sets its headlines. Han and kana fall to the serif of their own language (Hiragino Mincho for Japanese, Songti Light for Chinese); the small print is the system face.

## The spark

Twelve rays round a small hub, each a long wedge from a narrow root to a square tip with its corners cut, uneven in length and angle and none quite aimed at the middle, as if cut from paper (the shape is `screen/primitives/spark`, tested; `parts/spark.ts` moves it). It is one element that glides from place to place and grows or shrinks to fit each one, so the page never jumps. How it moves says what it is doing:

| | |
|---|---|
| resting | breathes; on an empty page it stirs every half a minute |
| thinking, writing | its rays ripple in and out, out of step, and it turns |
| listening | swells with the loudness (against what has been playing) and kicks a part turn on each beat |
| something worth a glance | bursts open and spins once |

## What it shows

Three slots, told apart by timeline, as the scheduler places content:

| Slot | Timelines | Becomes |
|---|---|---|
| `chat` | self, wall | a reply in a conversation |
| `artifact` | none (a status that stays until removed or changed) | an artifact open beside the conversation |
| `media` | media | what plays |

So a status and a message can be on the page at once, as a conversation goes on beside an open artifact.

**Nothing on air.** Claude's empty page: the spark beside a serif greeting by the hour (Good morning, Coffee and Claude time?, Happy Friday, Good evening, Hello, night owl), written in as Claude streams, and under it the Recents: today's conversations, newest first, with how long ago each was last said.

**Conversations.** Every card belongs to the conversation of its topic: its title, else who said it. An untitled card from no one is a conversation of its own, named by how it starts, as Claude names a new chat (`parts/thread.ts`, tested). The page keeps them for as long as it is on screen, like a chat that was never saved: a restart or another theme starts the day afresh.

- The next card in the conversation on the page is written under the last one, which settles smaller and paler where it stands, its time above it. Up to five replies show; the page brings the newest up to about a quarter of the way down, the earlier ones fading under the top edge.
- A card from another conversation turns the page to that one: its last few replies already written, the new one written in under them.
- A card in rotation (said again with the same id) moves down to be the newest rather than repeating.
- On a page 1000 px wide or more, the Recents stand in a rail down the left under the wordmark, as Claude's sidebar does, the conversation on the page highlighted, the one being written turning the CLI's spinner (`· ✢ ✳ ✶ ✻ ✽`). With nothing said yet (a window that only takes what plays, say) there is no rail.

**A card.** It is a reply. The header carries the card's title, with the byline (and a speaker who isn't Claude) beside it. Then:

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

**An artifact.** A status (`none` timeline: a figure, a bar, a few lines) opens in a pane that slides in from the right, as Claude opens an artifact, and the conversation, or the empty page, makes room for it. A card on a raised sheet: a document icon, the title, the byline, a version, and when it last changed. Each change to it is the next version (v1, v2, v3…), the change time glints clay for a moment, a figure that moved flashes and a bar slides to its new length. When the status is taken down the pane closes. (`parts/artifact.ts`)

**What plays.** With no card on, the page listens along: the spark over the line, the line centred in the light serif in a space two lines tall (so a short line and a long one sit in the same place; a long one is set a size down), and under it what plays as Claude shows an attachment: a raised card with the cover, the title and the artist, and three clay bars moving. Each line is written in as the last is lifted out where it stood and fades up. In a break (before the first line, an intro, a long interlude) a listening verb glints in the line's place (*Humming…*, *Vibing…*). Under a reply it drops to a status line at the foot of the page: the cover and the line in the serif on the left, the title on the right.

## Salience

- **Quiet**: no thinking; the reply is written at once, smaller and in a paler ink.
- **Attention**: no thinking either. The spark bursts open and spins, and a clay edge glows once round the page.

## Files

- `manifest.ts`: the three slots, the `device` profile, the energy and onset signals.
- `parts/spark.ts`: how the spark moves (its shape is `screen/primitives/spark`).
- `parts/stream.ts`: when each word is written (pure, tested).
- `parts/message.ts`: a card as a reply, and where the pen is.
- `parts/thread.ts`: the day's conversations and the Recents (pure, tested).
- `parts/artifact.ts`: the artifact pane, and its versions.
- `parts/page.ts`: the page, its rail and pane, the thread, the home line, the status line, and the spark's glide.
- `parts/words.ts`: the greeting and the verbs (pure, tested).
- `theme.ts`: slots, signals, which conversation is on the page, and which place the page is in each frame.
