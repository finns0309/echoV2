// A hanging chime as physics: three damped spherical pendulums (cord+bell /
// clapper / paper strip), driven by one wandering wind vector, the clapper
// ringing the rim. No DOM; each chime theme draws it its own way. Ported from
// echo's furin.js; the physics and its tuning are unchanged, only the state now
// lives per instance.

const G = 2400 // px/s² — sets the pendulum tempo (~1.7s bell period)
// Area/mass ratio decides who the wind talks to: the paper is the sail, the
// bead is dense glass the wind barely notices, the bell is heavy and only sways.
const LINKS = {
  bell: { len: 170, damp: 0.78, windK: 0.18 },
  clap: { len: 70, damp: 1.1, windK: 0.07 },
  paper: { len: 150, damp: 1.75, windK: 0.85 },
}
// Thread-tension tow: the paper drags the bead after it; the bead answers back.
// The two natural periods differ (~1.6s vs ~1.1s), so the tow drifts in and out
// of phase: the never-repeating cadence of a real chime.
const TOW_K = 15.0
const TOW_KV = 1.5
const TOW_BACK_RATIO = 0.12
const DEPTH_WIND = 0.78
const ENERGY_WIND_GAIN = 5.0
const ENERGY_WIND_MAX = 1.2
const ONSET_COOLDOWN_MS = 170
const STRIKE_GAP_MS = 150
const PSI_MAX = 0.42 // rad — paper twist cap; keeps the text readable
const REL_W_MAX = 2.9 // rad/s — clapper speed relative to the bell
// The clapper stem crosses the rim when its travel at mouth depth exceeds the
// opening minus the bead: asin((34−6.5)/74) ≈ 0.38 rad.
const STRIKE_ANG = 0.38

interface Axis {
  th: number
  w: number
}
interface Link {
  x: Axis // in-plane swing (rotateZ)
  z: Axis // depth swing (rotateX)
}
type LinkSpec = (typeof LINKS)[keyof typeof LINKS]

const mkLink = (thX: number, thZ: number): Link => ({ x: { th: thX, w: 0 }, z: { th: thZ, w: 0 } })

export interface StrikeEvent {
  intensity: number
  side: 1 | -1
  centroid: number
}

export function createChimePhysics(onStrike: (e: StrikeEvent) => void) {
  const B = mkLink(0.04, 0.015) // bell + cord
  const C = mkLink(0.015, 0) // clapper
  const T = mkLink(0.06, 0.02) // paper strip
  const P = { psi: 0.08, w: 0 } // paper twist (rotateY)
  let bellPsi = 0
  let windX = 0
  let windZ = 0
  let windMag = 0
  let windAudio = 0
  let windPuff = 0 // onset / line-change micro-gust envelope
  let energyTarget = 0
  let lastEnergyAt = 0
  let lastKickAt = 0
  let lastStrikeAt = 0
  let centroid = 0.5
  const seed = Math.random() * 100

  function updateWind(nowMs: number, dt: number): void {
    const t = nowMs / 1000
    const breeze = Math.sin(t * 0.31 + seed) * 0.42 + Math.sin(t * 0.83 + seed * 1.7) * 0.26 + Math.sin(t * 2.07 + seed * 0.6) * 0.12
    // Two gust envelopes on different clocks: idle stays mostly calm, with rare
    // moments where the chime genuinely stirs (and may ring once on its own).
    const gustA = Math.max(0, Math.sin(t * 0.043 + seed * 2.3) - 0.8) * 2.8
    const gustB = Math.max(0, Math.sin(t * 0.11 + seed * 4.1) - 0.93) * 2.3
    const gust = gustA + gustB
    // Audio wind: fast attack, slow release, so phrases swell and linger.
    const target = nowMs - lastEnergyAt < 300 ? energyTarget : 0
    const k = target > windAudio ? 0.1 : 0.018
    windAudio += (target - windAudio) * Math.min(1, k * (dt * 60))
    windPuff *= Math.exp(-dt * 4.5)
    windMag = breeze * (0.55 + gust * 0.5) + gust * 0.35 + windAudio * (0.7 + breeze * 0.25) + windPuff
    const heading = Math.sin(t * 0.127 + seed * 3.1) * 0.9 + Math.sin(t * 0.047 + seed * 1.3) * 0.65
    windX = windMag * Math.cos(heading)
    windZ = windMag * Math.sin(heading) * DEPTH_WIND
  }

  function stepPend(p: Axis, len: number, damp: number, force: number, h: number): void {
    const acc = -(G / len) * Math.sin(p.th) - damp * p.w + force * Math.cos(p.th)
    p.w += acc * h
    p.th += p.w * h
  }
  function stepLink(L: Link, k: LinkSpec, h: number, fx = 0, fz = 0): void {
    stepPend(L.x, k.len, k.damp, windX * k.windK + fx, h)
    stepPend(L.z, k.len, k.damp, windZ * k.windK + fz, h)
  }

  // Booster, not a hammer: push along the current relative motion, never
  // against it, so energy builds by resonance and strikes emerge on their own.
  function kickAligned(c: Axis, b: Axis, amount: number): void {
    const relW = c.w - b.w
    let dir = Math.abs(relW) > 0.12 ? Math.sign(relW) : -Math.sign(c.th - b.th)
    if (!dir) dir = Math.random() < 0.5 ? -1 : 1
    c.w += dir * amount
  }
  function capRel(c: Axis, b: Axis): void {
    const relW = c.w - b.w
    if (Math.abs(relW) > REL_W_MAX) c.w = b.w + Math.sign(relW) * REL_W_MAX
  }

  function collide(nowMs: number): void {
    // The mouth is round: the stem hits the rim when the 2D relative tilt leaves the cone.
    const relX = C.x.th - B.x.th
    const relZ = C.z.th - B.z.th
    const mag = Math.hypot(relX, relZ)
    if (mag <= STRIKE_ANG) return
    const nx = relX / mag
    const nz = relZ / mag
    C.x.th = B.x.th + nx * STRIKE_ANG
    C.z.th = B.z.th + nz * STRIKE_ANG
    const rvx = C.x.w - B.x.w
    const rvz = C.z.w - B.z.w
    const radial = rvx * nx + rvz * nz
    // Only an incoming bead rings; a bead resting on the rim just sits there.
    if (radial > 0.25 && nowMs - lastStrikeAt > STRIKE_GAP_MS) {
      lastStrikeAt = nowMs
      onStrike({ intensity: Math.min(1, radial / 3.2), side: nx >= 0 ? 1 : -1, centroid })
      P.w += (Math.random() - 0.5) * radial * 0.5
    }
    const rx = radial * nx
    const rz = radial * nz
    C.x.w = B.x.w + (rvx - rx) - rx * 0.45 // restitution
    C.z.w = B.z.w + (rvz - rz) - rz * 0.45
    B.x.w += rx * 0.08 // glass recoil
    B.z.w += rz * 0.08
    T.x.w += rx * 0.18 // the paper feels the jolt
    T.z.w += rz * 0.18
  }

  return {
    /** Audio loudness 0..1 becomes wind. */
    energy(value: number, nowMs: number): void {
      energyTarget = Math.min(ENERGY_WIND_MAX, value * ENERGY_WIND_GAIN)
      lastEnergyAt = nowMs
    },

    /** An onset hits the sail, not the bead; the strike, if any, comes last. */
    onset(velocity: number, spectralCentroid: number, nowMs: number): void {
      if (nowMs - lastKickAt < ONSET_COOLDOWN_MS) return
      lastKickAt = nowMs
      centroid = spectralCentroid
      kickAligned(T.x, C.x, 0.28 + velocity * 0.8)
      kickAligned(T.z, C.z, 0.18 + velocity * 0.42)
      P.w += (spectralCentroid - 0.5) * velocity * 2.2
      windPuff = Math.min(1, windPuff + velocity * 0.38)
    },

    /** Every new line of text sends a breath through the sail. */
    puff(): void {
      kickAligned(T.x, C.x, 0.55)
      kickAligned(T.z, C.z, 0.28)
      P.w += (Math.random() - 0.5) * 1.3
      windPuff = Math.min(1, windPuff + 0.35)
    },

    step(nowMs: number, dt: number): void {
      updateWind(nowMs, dt)
      const steps = dt > 0.022 ? 2 : 1
      const h = dt / steps
      const ts = nowMs / 1000
      for (let i = 0; i < steps; i++) {
        stepLink(B, LINKS.bell, h)
        const towX = TOW_K * (T.x.th - C.x.th) + TOW_KV * (T.x.w - C.x.w)
        const towZ = TOW_K * (T.z.th - C.z.th) + TOW_KV * (T.z.w - C.z.w)
        stepLink(C, LINKS.clap, h, towX, towZ)
        stepLink(T, LINKS.paper, h, -towX * TOW_BACK_RATIO, -towZ * TOW_BACK_RATIO)
        // Paper twist: wind turbulence as torque, the thread's wind-up as spring.
        const turb = Math.sin(ts * 1.7 + seed * 5.0) * 0.5 + Math.sin(ts * 0.61 + seed * 2.2) * 0.5
        const accPsi = -2.4 * P.psi - 1.5 * P.w + turb * (0.5 + Math.min(1.4, Math.abs(windMag)) * 1.1)
        P.w += accPsi * h
        P.psi += P.w * h
        collide(nowMs)
      }
      capRel(C.x, B.x)
      capRel(C.z, B.z)
      if (P.psi > PSI_MAX) {
        P.psi = PSI_MAX
        P.w *= -0.3
      } else if (P.psi < -PSI_MAX) {
        P.psi = -PSI_MAX
        P.w *= -0.3
      }
      // Bell twist: a slow drift, visible only through the glass parallax.
      bellPsi = Math.sin(ts * 0.083 + seed * 0.7) * 0.05 + Math.sin(ts * 0.031 + seed * 1.9) * 0.045 + windAudio * 0.03 * Math.sin(ts * 0.41)
    },

    get pose() {
      return { bell: B, clap: C, paper: T, paperPsi: P.psi, bellPsi, windMag, paperSpeed: T.x.w }
    },
  }
}

export type ChimePhysics = ReturnType<typeof createChimePhysics>
