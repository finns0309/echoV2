# 晨报 · gazette

A front page on newsprint. The other themes began as ways to show one line at a time; this one shows a morning's worth of things at once, laid out as a paper would: a lead story, stories beside and under it, and a literary box for whatever is playing.

New in echoV2, not ported.

## The page

- **Masthead**: ECHO in a didone, with ears either side. The left ear has the issue number (the day of the year) and the weekday. The right ear has a vermilion seal, 朝刊 until three in the afternoon and 夕刊 after, and the time. Under it is a heavy rule and a hairline, then the dateline in kanji numerals with the era year (二〇二六年（令和八年）九月二十三日).
- **Tiers**: the lead (slot `lead`) runs across the left. Two stories (`col2`, `col3`) sit under it, split by a rule. A rail on the right holds one story (`col1`) and, at its foot, the literary box (`verse`). Rules separate everything, as on a real page. When the window is taller than it is wide, the page becomes a single column and `col3` is left out.
- **Paper**: fractal-noise grain, and edges a shade older than the middle. No fold: across the whole page it read as a line through the type.
- **Nothing on the page**: 本日休刊, set vertically.

## A story

A presentation's parts map onto a paper's:

| Presentation | On the page |
|---|---|
| `context.title` | section kicker, with a small square in the content's own colour |
| primary text | headline in Mincho; a short one (12 characters or fewer) is set larger in the lead |
| `emphasis` | sesame dots over the characters (傍点), in red |
| `reading` | ruby above the headline |
| secondary text | the dek, indented one character |
| value | figure: caption over a rule, the number in a didone, ▲▼ for the delta |
| progress | a printed chart: tick marks every tenth, the fill hatched |
| image | halftone photo, with the dot screen at 45° |
| annotation | the editor's aside, after ◇ |
| attribution, byline | credit line in 【】 |

Everything is printed at once: a page doesn't reveal itself line by line, so `at` is ignored for stories.

## Motion

- **Printing**: a new story comes off the roller from top to bottom. A shadow line moves down with the edge, and the ink is soft at first. The red plate starts a hair out of register and settles into place. The story it replaces lifts off, fading and blurring.
- **Restating**: the same story with new numbers is not printed again. Figures count from the old value to the new and are struck like a stamp; a chart's fill slides to its new length.
- **The literary box**: each line is set as it arrives, and the two before it fade to grey above it. During an instrumental break it reads 〜 間奏 〜. The cover is a halftone.

## Salience

- **Quiet**: grey ink and a light cut for the headline.
- **Attention**: the headline is reversed out of a black band (黒ベタ白抜き), and the kicker gets a red 速報 tag. While any story on the page is urgent, 号外 is stamped on the masthead, with a mottled mask so it reads as a hand stamp.

## Halftone, briefly

The picture is blurred a little. A radial-gradient dot screen is multiplied over it, and the whole figure gets `contrast(16)`, which thresholds the sum. Where the picture is dark, more of each dot's gradient falls under the threshold, so the dots grow. Multiplying the figure onto the paper turns its white into paper.

## Files

- `manifest.ts`: five slots. `lead` is `main`; `col1`–`col3` are `side`; `verse` is `ambient` and takes only media timelines.
- `parts/masthead.ts`: the date, issue and edition words (pure, tested).
- `parts/story.ts`: sets a presentation as a story, and restates one in place.
- `parts/verse.ts`: the literary box.
- `theme.ts`: the page, which slot goes where, and the layout classes (`has-lead`, `has-lower`, `has-rail`, `verse-only`, `is-idle`, `extra`).

## Scheduling note

Several stories can share one page only because the ambient rule is decided per slot (CONTRACT §5, rule 9). The morning's quiet stories fill the columns beside an important one, and the song in the literary box doesn't keep them off the page.
