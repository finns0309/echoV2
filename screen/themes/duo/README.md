# Duo

A foldable phone standing on the desk, after the iPhone Duo (announced September 2026): a passport-shaped cover display when folded, and a wider inside display when it opens like a book, with the hinge down the middle. echo's content appears the way a phone would show it.

New in echoV2, not ported. It is a mock for fun, not an adaptation for the real device.

## The phone

- **Body**: titanium in Night Sky, a thin bezel, and a large corner radius. Each half is 0.69 as wide as it is tall (the cover's shape), so open it is about 1.4 wide, as the inside display is.
- **Folding**: the left half (the leaf) swings on the hinge with CSS 3D. Its back is the cover display. Folded, it lies over the right half showing the cover; open, it shows the left half of the inside display. The half turning away darkens as it goes. The whole phone shifts so that what you see, folded or open, stays centred.
- **Window**: the `device` profile, 760×560 at the bottom right of the screen, with room to open to the left.
- **Tap**: a tap on the phone folds or opens it. The phone is `no-drag`; drag the window by the space around it.

## What it shows

Two slots: `card` (anything that arrives) and `media` (whatever plays, on a media timeline).

| | Folded (cover) | Open (inside) |
|---|---|---|
| a card | a notification on the Lock Screen, newest on top of a stack of three | a message thread from its sender: bubbles arrive at their `at` times, with the typing dots just before each |
| the Dynamic Island | upright along the left side, as on the Duo; a card opens it into a Live Activity (icon, name, first line) for a few seconds | |
| what plays | a Now Playing widget with the current line, the cover art blurred into the wallpaper | the player on the left: art, the current line bright and its neighbours dim, ♪ in a break |
| nothing on air | StandBy: black, the date in orange, a very large clock | a clock widget on the left, an empty chat on the right |

A card is read the way a phone reads one (`parts/card.ts`). The "app" is the speaker, else the title. The icon is the first character in the content's own colour, and the body is every block as text except the credit.

Inside the chat, a value is a bubble with a large rounded number and a green or red delta. Progress is a thin bar in the app's colour, a picture is an image bubble, an annotation is an outlined bubble, and a credit is a caption under the thread.

## Salience

- **Quiet**: no Live Activity; the notification slips in silently.
- **Attention**: the island opens with a red ring and shakes, and the phone opens by itself while the card is on air. It goes back to however the user left it after.

## A note on 3D

`backface-visibility: hidden` doesn't reach layers the browser composites on their own (blurs, glass, animated overlays). So the face turned away is also set `visibility: hidden` once the swing is over, and the back half is hidden while folded. Otherwise the inside display's square corners show around the cover's rounded ones.

## Files

- `manifest.ts`: the two slots, and the `device` profile.
- `parts/phone.ts`: the body, the leaf, the three screens.
- `parts/cover.ts`: Lock Screen, Now Playing, notifications, StandBy.
- `parts/island.ts`: the upright Dynamic Island.
- `parts/inside.ts`: Split View, with the player and the chat.
- `parts/card.ts`: a card as a notification (pure, tested).
- `theme.ts`: which slot goes where, the fold, the clock.
