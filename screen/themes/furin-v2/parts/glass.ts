// The bell, drawn: a flat colour laid a little off its brush outline, as a
// print slips its register, a sliver of ivory for the light, two clay strokes
// for the painting, and an ink rim. The colour is the season's, from Claude's
// palette. All in the bell's own frame (the cord's knot at 0,84, the mouth at
// y 178), which is the frame the physics was tuned in. Pure.
import { brush, chain, cubic, pressure, type Pt } from './brush'

/** The glass by season, from Claude's palette: heather, cactus, manilla, oat. */
export function glassOf(d: Date): { name: string; fill: string } {
  const m = d.getMonth()
  if (m >= 2 && m <= 4) return { name: 'heather', fill: '#cbcadb' }
  if (m >= 5 && m <= 7) return { name: 'cactus', fill: '#bcd1ca' }
  if (m >= 8 && m <= 10) return { name: 'manilla', fill: '#ebdbbc' }
  return { name: 'oat', fill: '#e3dacc' }
}

const P = (x: number, y: number): Pt => ({ x, y })

/** The silhouette, clockwise from the top: dome, right side, mouth, left side. */
const DOME_R = cubic(P(0, 84), P(28, 84), P(52, 100), P(56, 128))
const SIDE_R = cubic(P(56, 128), P(58, 150), P(52, 168), P(34, 178))
const MOUTH = chain(cubic(P(34, 178), P(25, 182), P(13, 179.5), P(0, 180.5), 8), cubic(P(0, 180.5), P(-13, 181.5), P(-25, 182), P(-34, 178), 8))
const SIDE_L = cubic(P(-34, 178), P(-52, 168), P(-57, 150), P(-55, 128))
const DOME_L = cubic(P(-55, 128), P(-52, 100), P(-28, 84), P(0, 84))

export const BELL = 'M -34 178 C -52 168 -57 150 -55 128 C -52 100 -28 84 0 84 C 28 84 52 100 56 128 C 58 150 52 168 34 178 C 25 182 13 179.5 0 180.5 C -13 181.5 -25 182 -34 178 Z'

/**
 * The outline in one stroke, the way a hand draws a bell: starting just right
 * of where the cord goes in, round and down and back up, lifting just short of
 * it, so the top is left open for the cord.
 */
export function outline(): string {
  const pts = chain(DOME_R.slice(2), SIDE_R, MOUTH, SIDE_L, DOME_L.slice(0, -2))
  // A right hand presses down the far side and round the mouth, and eases off
  // over the shoulders: thick to thin, never the even line of a pen.
  const swell = (t: number) => Math.exp(-(((t - 0.62) / 0.2) ** 2))
  return brush(pts, (t) => pressure(t) ** 0.8 * (1.6 + 3.9 * swell(t) + 1.1 * Math.sin(t * Math.PI * 5 + 0.7) ** 2))
}

/** The back of the rim, seen through the mouth. */
export function innerRim(): string {
  return brush(cubic(P(-29, 177.5), P(-15, 173.5), P(14, 173.5), P(29, 177.5)), (t) => 1.7 * pressure(t))
}

/** Two clay strokes painted round the lower glass, a wave as Edo painters left one. */
export function painting(): string[] {
  return [
    brush(cubic(P(-43, 152), P(-30, 139), P(-16, 150), P(-3, 141)), (t) => 4.6 * pressure(t)),
    brush(cubic(P(-24, 165), P(-11, 155), P(2, 165), P(15, 156)), (t) => 3.6 * pressure(t)),
  ]
}

/** The light on the glass: a flat ivory sliver, as an illustrator paints one. */
export const SHINE = 'M -44 124 C -43 108 -33 96 -19 91 C -30 100 -36 110 -38 124 C -39 128 -44 129 -44 124 Z'

/** The cord from the top of the window to the knot. */
export function cord(): string {
  return brush([P(0, -10), P(0.4, 30), P(-0.3, 60), P(0, 84)], (t) => 1.5 + 0.5 * pressure(t))
}
