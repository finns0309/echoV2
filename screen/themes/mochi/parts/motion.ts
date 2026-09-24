// What the mochi does from moment to moment, as plain numbers: where it is, how
// high it is off the floor, how squashed, which way it looks, its eyes and mouth.
// No DOM here, so its habits can be tested.
//
// It rests (breathing, blinking, looking about), wanders along the floor in little
// hops, stops to talk when something arrives, sways and bounces to whatever plays,
// and at night, or after long enough with nothing to do, flattens out and sleeps.

export type Mode = 'rest' | 'walk' | 'talk' | 'dance' | 'sleep'
export type Eyes = 'open' | 'blink' | 'happy' | 'sleep' | 'wow'
export type Mouth = 'smile' | 'o' | 'flat'
export type Mark = '' | '!' | 'zzz' | '♪'

export interface Pose {
  /** Centre of its base, in px from the window's left edge. */
  x: number
  /** Height of its base above the floor, px. */
  lift: number
  /** >0 flatter and wider, <0 taller and narrower. */
  squash: number
  /** Degrees it leans, into a hop. */
  lean: number
  /** -1..1: where its face turns. */
  look: number
  eyes: Eyes
  mouth: Mouth
  mark: Mark
  mode: Mode
}

export interface World {
  /** Width of the floor it walks on, px. */
  width: number
  /** Something is being said: it stops and talks. */
  talking: boolean
  /** Something is playing: it dances when not talking. */
  playing: boolean
  /** 0..1, how loud what plays is right now. */
  energy: number
  /** Late at night it sleeps when there is nothing to do. */
  night: boolean
  /** While talking, where to look (-1..1): at what it is writing, say. Absent: at you. */
  lookAt?: number
}

const HOP_S = 0.5
const HOP_PX = 14
const STEP_PX = 26
const MARGIN = 90
const BORED_S = 120 // resting this long with nothing to do, it dozes off
const WAKE_S = 600 // a daytime nap lasts about this long

/** One hop, 0..1: crouch, fly, land. */
export function hop(phase: number, height = HOP_PX): { lift: number; squash: number; airborne: boolean } {
  if (phase < 0.15) return { lift: 0, squash: 0.2 * (phase / 0.15), airborne: false }
  if (phase < 0.85) {
    const u = (phase - 0.15) / 0.7
    return { lift: Math.sin(Math.PI * u) * height, squash: -0.1 * Math.sin(Math.PI * u), airborne: true }
  }
  return { lift: 0, squash: 0.22 * (1 - (phase - 0.85) / 0.15), airborne: false }
}

export function createMochi(start: number, random: () => number = Math.random) {
  let x = start
  let target = start
  let mode: Mode = 'rest'
  let t = 0 // seconds alive
  let restLeft = 2 + random() * 3
  let bored = 0 // seconds with nothing to do
  let asleep = 0
  let hopAt = -1 // when the current hop began, or -1
  let hopHeight = HOP_PX
  let hops = 0 // more hops queued in place (a startle, a cheer)
  let blinkAt = 2 + random() * 3
  let alertUntil = -1
  let speakUntil = -1
  let beatUntil = -1

  function startHop(height = HOP_PX): void {
    hopAt = t
    hopHeight = height
  }

  return {
    /** A card arrived: a little hop to notice it, or for a loud one, two big ones and a "!". */
    notice(loud: boolean): void {
      bored = 0
      asleep = 0
      if (mode === 'sleep') mode = 'rest' // woken
      hops = loud ? 2 : 1
      hopHeight = loud ? HOP_PX * 2.4 : HOP_PX
      if (loud) alertUntil = t + 1.8
      if (hopAt < 0) startHop(hopHeight)
    },
    /** A new line to say: the mouth moves for a moment. */
    speak(): void {
      speakUntil = t + 1.1
    },
    /** A beat in what plays: a small bounce. */
    beat(strength: number): void {
      if (mode === 'dance' && hopAt < 0 && strength > 0.4) startHop(6 + strength * 6)
      beatUntil = t + 0.25
    },

    step(dt: number, w: World): Pose {
      t += dt
      const lo = Math.min(MARGIN, w.width / 2)
      const hi = Math.max(lo, w.width - MARGIN)
      x = Math.min(hi, Math.max(lo, x))

      // What it is doing now.
      const next: Mode = w.talking ? 'talk' : mode === 'sleep' ? 'sleep' : w.playing ? 'dance' : mode === 'dance' || mode === 'talk' ? 'rest' : mode
      if (next !== mode) {
        mode = next
        if (mode === 'rest') restLeft = 2 + random() * 3
      }
      if (w.talking || w.playing) bored = 0
      else if (mode === 'rest') bored += dt

      if (mode === 'rest') {
        restLeft -= dt
        if (restLeft <= 0) {
          if (w.night || bored > BORED_S) {
            mode = 'sleep'
            asleep = 0
          } else if (random() < 0.65) {
            const span = hi - lo
            let to = lo + random() * span
            if (Math.abs(to - x) < 120) to = x < lo + span / 2 ? Math.min(hi, x + 160) : Math.max(lo, x - 160)
            target = to
            mode = 'walk'
          } else restLeft = 2 + random() * 4
        }
      } else if (mode === 'sleep') {
        asleep += dt
        if (!w.night && asleep > WAKE_S) {
          mode = 'rest'
          bored = 0
          restLeft = 1
        }
      }

      // Hops: walking ones carry it along; others bounce in place.
      const dir = Math.sign(target - x) || 1
      if (mode === 'walk' && hopAt < 0) {
        if (Math.abs(target - x) < STEP_PX / 2) {
          mode = 'rest'
          restLeft = 2 + random() * 4
        } else startHop()
      }
      let lift = 0
      let squash = 0
      let lean = 0
      if (hopAt >= 0) {
        const phase = (t - hopAt) / HOP_S
        if (phase >= 1) {
          hopAt = -1
          if (hops > 0 && --hops > 0) startHop(hopHeight)
        } else {
          const h = hop(phase, hopHeight)
          lift = h.lift
          squash = h.squash
          if (mode === 'walk' && h.airborne) {
            x += (dir * STEP_PX * dt) / (HOP_S * 0.7)
            lean = dir * 6
          }
        }
      }

      // Breathing, and the rest of the face.
      if (hopAt < 0) {
        if (mode === 'sleep') squash = 0.3 + 0.02 * Math.sin(t * 1.2)
        else if (mode === 'dance') squash = 0.04 + w.energy * 0.16 * (0.5 + 0.5 * Math.sin(t * 6.2))
        else squash = 0.025 * Math.sin(t * 2.1)
      }
      if (t > blinkAt + 0.13) blinkAt = t + 2 + random() * 4
      const blinking = t >= blinkAt && t < blinkAt + 0.13
      const alert = t < alertUntil
      const eyes: Eyes =
        mode === 'sleep' ? 'sleep' : alert ? 'wow' : blinking ? 'blink' : mode === 'dance' ? 'happy' : 'open'
      const mouth: Mouth = mode === 'sleep' ? 'flat' : alert ? 'o' : t < speakUntil ? (Math.floor(t * 8) % 2 ? 'o' : 'smile') : 'smile'
      const look =
        mode === 'walk' ? dir * 0.8 : mode === 'talk' ? (w.lookAt ?? 0) : mode === 'dance' ? Math.sin(t * 1.5) * 0.6 : Math.sin(t * 0.37) * 0.5
      const mark: Mark = alert ? '!' : mode === 'sleep' ? 'zzz' : mode === 'dance' && t < beatUntil + 0.6 ? '♪' : ''
      return { x, lift, squash, lean, look, eyes, mouth, mark, mode }
    },
  }
}
