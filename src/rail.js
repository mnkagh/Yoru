/* ==========================================================================
   RAIL SYSTEM — a train that actually runs
   --------------------------------------------------------------------------
   The old train was four boxes parked at a fixed position. This is a real
   event with a real cycle:

     APPROACH -> ARRIVE -> DWELL (doors open) -> DEPART -> PASS

   The consist physically moves along the track. It decelerates into the
   platform, stops, opens its doors for a fixed dwell, then accelerates
   away and wraps around. Headlights are on in darkness and in rain, the
   interior lights are on throughout, door lights glow at the platform,
   and roof-mounted AC units, bogies, doors and a destination display make
   it read as a Japanese commuter set rather than a box.

   Geometry is pooled: one consist, reused every cycle.
   ========================================================================== */

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const BOX = new THREE.BoxGeometry(1, 1, 1)
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10)

function box(w, h, d, x, y, z){ const g = BOX.clone(); g.scale(w,h,d); g.translate(x,y,z); return g }
function cylZ(r, len, x, y, z){ const g = CYL.clone(); g.rotateX(Math.PI/2); g.scale(r, len, r); g.translate(x,y,z); return g }

/* Where the elevated line runs. Far enough west that the shopfronts can
   still stand at the west kerb: the viaduct occupies RAIL_X +/- 2.7, so
   buildings ending at x -17 clear it exactly. Previously this was -14,
   which pushed every west-side building 22m back and left a black void
   down the middle of the road. */
export const RAIL_X = -20
/* Commuter car: 20m long, 2.9m wide, 3.6m tall — Yamanote-line scale. */
export const CAR = { L: 20, W: 2.9, H: 3.6, FLOOR_Y: 1.15 }

export function makeRailMaterials(){
  return {
    body: new THREE.MeshBasicMaterial({ color: 0x1c2434 }),      /* stainless band */
    bodyAlt: new THREE.MeshBasicMaterial({ color: 0x2a3242 }),   /* car 2 stripe */
    stripe: new THREE.MeshBasicMaterial({ color: 0x3f6fa8 }),
    window: new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),     /* lit interior */
    windowDark: new THREE.MeshBasicMaterial({ color: 0x0d131c }),
    door: new THREE.MeshBasicMaterial({ color: 0x8a9099 }),
    doorGlass: new THREE.MeshBasicMaterial({ color: 0xffcf90 }),
    bogie: new THREE.MeshBasicMaterial({ color: 0x14181f }),
    wheel: new THREE.MeshBasicMaterial({ color: 0x0a0c10 }),
    acUnit: new THREE.MeshBasicMaterial({ color: 0x6a7078 }),
    headlight: new THREE.MeshBasicMaterial({ color: 0xfff4d8 }),
    taillight: new THREE.MeshBasicMaterial({ color: 0xc4302a }),
    destination: new THREE.MeshBasicMaterial({ color: 0x0a0d12 }),
    destLit: new THREE.MeshBasicMaterial({ color: 0xffd9a0 })
  }
}

/* One car: body, window band, doors, bogies, roof AC, destination panel.
   `bins` is a Map of material key -> geometry list, exposed through a
   proxy so the builder below can write bins.body.push(...) directly. */
function makeBinProxy(bins){
  return new Proxy({}, {
    get(_, k){
      if (!bins.has(k)) bins.set(k, [])
      return bins.get(k)
    }
  })
}
function buildCar(rawBins, M, index){
  const bins = rawBins.__proxy || (rawBins.__proxy = makeBinProxy(rawBins))
  const { L, W, H, FLOOR_Y } = CAR
  const y0 = FLOOR_Y
  /* body: a slightly tumblehome slab, plus a roof cap */
  bins.body.push(box(W, H - 0.5, L, 0, y0 + (H - 0.5) / 2, 0))
  bins.body.push(box(W * 0.92, 0.28, L * 0.99, 0, y0 + H - 0.34, 0))
  /* skirt below the floor */
  bins.body.push(box(W * 0.96, 0.42, L * 0.98, 0, y0 - 0.2, 0))
  /* livery band along the waist */
  bins.stripe.push(box(W + 0.04, 0.20, L * 0.99, 0, y0 + 1.55, 0))

  /* window band: continuous panes either side, broken by door pillars */
  const doorZ = [-L * 0.32, 0, L * 0.32]
  for (const s of [-1, 1]){
    const segs = [[-L * 0.46, -L * 0.38], [-L * 0.24, -L * 0.06], [L * 0.06, L * 0.24], [L * 0.38, L * 0.46]]
    for (const [a, b] of segs)
      bins.window.push(box(0.05, 0.92, b - a, s * (W / 2 + 0.02), y0 + 2.15, (a + b) / 2))
    /* pillars between segments */
    for (const pz of [-L * 0.36, -L * 0.05, L * 0.05, L * 0.36])
      bins.body.push(box(0.06, 1.0, 0.10, s * (W / 2 + 0.03), y0 + 2.15, pz))
  }
  /* cab end windows at both extremes */
  for (const e of [-1, 1])
    bins.windowDark.push(box(W * 0.72, 0.78, 0.06, 0, y0 + 2.4, e * (L / 2 - 0.02)))

  /* three door pairs per side, with lit door glass */
  for (const dz of doorZ){
    for (const s of [-1, 1]){
      bins.door.push(box(0.05, 1.95, 1.28, s * (W / 2 + 0.04), y0 + 1.05, dz))
      bins.doorGlass.push(box(0.03, 0.80, 0.52, s * (W / 2 + 0.07), y0 + 1.72, dz))
      bins.doorGlass.push(box(0.03, 0.80, 0.52, s * (W / 2 + 0.07), y0 + 0.62, dz))
      /* door pocket recess */
      bins.body.push(box(0.05, 2.05, 1.42, s * (W / 2 - 0.01), y0 + 1.05, dz))
    }
  }

  /* bogies and wheels */
  for (const bz of [-L * 0.32, L * 0.32]){
    bins.bogie.push(box(W * 0.72, 0.52, 3.0, 0, y0 - 0.42, bz))
    for (const s of [-1, 1]){
      bins.wheel.push(cylZ(0.42, 0.14, s * 0.92, y0 - 0.52, bz - 0.95))
      bins.wheel.push(cylZ(0.42, 0.14, s * 0.92, y0 - 0.52, bz + 0.95))
    }
    /* traction motor + suspension detail */
    bins.bogie.push(box(0.5, 0.34, 1.1, 0, y0 - 0.44, bz))
  }

  /* roof: AC units, a pantograph-ish cable duct, aerial */
  bins.acUnit.push(box(1.9, 0.26, 2.4, 0, y0 + H - 0.16, -L * 0.22))
  bins.acUnit.push(box(1.9, 0.26, 2.4, 0, y0 + H - 0.16, L * 0.20))
  bins.body.push(box(0.30, 0.16, L * 0.60, 0.9, y0 + H - 0.14, 0))
  if (index === 0){
    /* the leading car carries the destination display and the cab */
    bins.destination.push(box(1.30, 0.26, 0.05, 0, y0 + 2.86, L / 2 + 0.01))
    bins.destLit.push(box(1.22, 0.18, 0.03, 0, y0 + 2.86, L / 2 + 0.03))
    for (const s of [-1, 1])
      bins.destination.push(box(0.05, 0.24, 1.0, s * (W / 2 + 0.03), y0 + 2.86, L / 2 - 0.7))
  }
}

/* ------------------------------------------------------------- THE TRACK --
   Rails, sleepers, ballast, a viaduct deck, a platform edge with tactile
   paving, and the signal that governs entry to the station. */
/* The guideway CURVES. Tokyo's elevated lines are never straight for
   long, and a gentle S through the districts is both accurate and what
   makes the line read as infrastructure rather than a wall. Every part of
   the track and the train takes its X from this one function. */
export function railX(z){
  return RAIL_X + Math.sin((z + 40) / 58) * 9 + Math.sin((z - 20) / 130) * 4
}
/* the bearing at a point, so the train and the rails both turn */
export function railHeading(z){
  const d = 0.5
  return Math.atan2(railX(z - d) - railX(z + d), 2 * d)
}

export function buildTrackway(parent, M){
  const g = new THREE.Group()
  const railMat = new THREE.MeshBasicMaterial({ color: 0x39424f })
  const sleeperMat = new THREE.MeshBasicMaterial({ color: 0x1a1d22 })
  const ballastMat = new THREE.MeshBasicMaterial({ color: 0x14161b })
  const deckMat = new THREE.MeshBasicMaterial({ color: 0x1b1f26 })
  const fenceMat = new THREE.MeshBasicMaterial({ color: 0x555c66 })
  /* The viaduct runs BEHIND the west building line, not through the
     street. It used to sit at x -14, which forced every west-side
     building 22m back and left a 45m black void down the middle of the
     road — the "black box" over the carriageway. */
  const SX = railX(-14)
  const Z0 = 12, Z1 = -180
  const len = Z0 - Z1, mid = (Z0 + Z1) / 2

  /* Every long member is built as short segments placed along the curve,
     so the viaduct genuinely bends instead of being one long box. */
  const SEG = 4                                    /* segment length */
  const nSeg = Math.floor(len / SEG)
  const pd = new THREE.Object3D()
  const at = z => railX(z)
  const place = (mesh, i, z, y, offX = 0) => {
    const h = railHeading(z)
    pd.position.set(at(z) + Math.cos(h) * offX, y, z - Math.sin(h) * offX)
    pd.rotation.set(0, h, 0)
    pd.scale.set(1, 1, 1)
    pd.updateMatrix()
    mesh.setMatrixAt(i, pd.matrix)
  }

  /* the viaduct: deck, ballast and the pier caps, all following the curve */
  const deckGeo  = new THREE.BoxGeometry(5.6, 0.55, SEG + 0.12)
  const deck = new THREE.InstancedMesh(deckGeo, deckMat, nSeg)
  const ballastGeo = new THREE.BoxGeometry(4.6, 0.5, SEG + 0.12)
  const ballast = new THREE.InstancedMesh(ballastGeo, ballastMat, nSeg)
  for (let i = 0; i < nSeg; i++){
    const z = Z0 - i * SEG - SEG / 2
    place(deck, i, z, -0.05)
    place(ballast, i, z, 0.25)
  }
  deck.instanceMatrix.needsUpdate = true
  ballast.instanceMatrix.needsUpdate = true
  g.add(deck, ballast)

  /* piers every 12m: this is an elevated line, not a cutting */
  const nPier = Math.floor(len / 12)
  const piers  = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 8.2, 1.5), deckMat, nPier)
  const pCaps  = new THREE.InstancedMesh(new THREE.BoxGeometry(4.4, 0.7, 2.6), deckMat, nPier)
  for (let i = 0; i < nPier; i++){
    const z = Z0 - 6 - i * 12
    place(piers, i, z, -4.6)
    place(pCaps, i, z, -0.5)
  }
  piers.instanceMatrix.needsUpdate = true
  pCaps.instanceMatrix.needsUpdate = true
  g.add(piers, pCaps)

  /* parapet walls and, above them, the noise barrier every Tokyo elevated
     line carries — this is what stops it looking like a bare wall */
  for (const s of [-1, 1]){
    const par = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 1.0, SEG + 0.12), deckMat, nSeg)
    const barMat = new THREE.MeshBasicMaterial({ color: 0x6d7684 })
    const bar = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 1.7, SEG + 0.12), barMat, nSeg)
    for (let i = 0; i < nSeg; i++){
      const z = Z0 - i * SEG - SEG / 2
      place(par, i, z, 0.6, s * 2.7)
      place(bar, i, z, 2.0, s * 2.85)
    }
    par.instanceMatrix.needsUpdate = true
    bar.instanceMatrix.needsUpdate = true
    g.add(par, bar)
    /* barrier posts */
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 1.8, 0.1),
      fenceMat, Math.floor(len / 4))
    for (let i = 0; i < posts.count; i++) place(posts, i, Z0 - i * 4, 2.0, s * 2.85)
    posts.instanceMatrix.needsUpdate = true
    g.add(posts)
  }

  /* sleepers and rails, instanced along the whole run */
  const nSleep = Math.floor(len / 0.65)
  const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(2.5, 0.14, 0.22), sleeperMat, nSleep)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < nSleep; i++) place(sleepers, i, Z0 - i * 0.65 - 0.3, 0.56)
  sleepers.instanceMatrix.needsUpdate = true
  g.add(sleepers)
  /* the two running rails, segmented so they follow the curve */
  for (const s of [-1, 1]){
    const rail = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.09, 0.14, SEG + 0.12), railMat, nSeg)
    for (let i = 0; i < nSeg; i++) place(rail, i, Z0 - i * SEG - SEG / 2, 0.70, s * 0.72)
    rail.instanceMatrix.needsUpdate = true
    g.add(rail)
  }

  /* the station: platform on the FAR side of the track, so the west kerb
     of the street stays clear and nothing overhangs the carriageway */
  const plat = new THREE.Mesh(new THREE.BoxGeometry(6.5, 1.05, 40), deckMat)
  plat.position.set(SX - 6.2, 0.52, -14)
  g.add(plat)
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.1, 40),
    new THREE.MeshBasicMaterial({ color: 0x2c3138 }))
  edge.position.set(SX - 2.95, 0.55, -14)
  g.add(edge)
  const tact = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 40),
    new THREE.MeshBasicMaterial({ color: 0x8a7524 }))
  tact.position.set(SX - 3.4, 1.06, -14)
  g.add(tact)
  const yellow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 40),
    new THREE.MeshBasicMaterial({ color: 0xc9a961, transparent: true, opacity: 0.5 }))
  yellow.position.set(SX - 3.75, 1.07, -14)
  g.add(yellow)

  /* station canopy: a curved roof on columns over the platform, with a
     lit strip underneath — this is what makes it read as a station
     rather than a slab beside the track */
  {
    const roofMat = new THREE.MeshBasicMaterial({ color: 0x2b323c })
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.4, 40, 24, 1, true, Math.PI * 0.12, Math.PI * 0.76),
      roofMat)
    roof.rotation.z = Math.PI / 2
    roof.position.set(SX - 6.2, 5.2, -14)
    roof.material.side = THREE.DoubleSide
    g.add(roof)
    /* lit strip under the canopy edge */
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 39),
      new THREE.MeshBasicMaterial({ color: 0xffe6bb }))
    strip.position.set(SX - 3.1, 4.6, -14)
    g.add(strip)
    /* columns */
    const colGeo = new THREE.CylinderGeometry(0.16, 0.16, 4.2, 8)
    const cols = new THREE.InstancedMesh(colGeo, deckMat, 10)
    for (let i = 0; i < 10; i++){
      pd.position.set(SX - 9.0, 3.1, -32 + i * 4)
      pd.rotation.set(0, 0, 0); pd.scale.set(1, 1, 1)
      pd.updateMatrix(); cols.setMatrixAt(i, pd.matrix)
    }
    cols.instanceMatrix.needsUpdate = true
    g.add(cols)
    /* a station sign board on the canopy */
    const signMat = new THREE.MeshBasicMaterial({ color: 0x0f1420 })
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 4.4), signMat)
    board.position.set(SX - 2.7, 3.6, -14)
    g.add(board)
    const boardLit = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 3.8),
      new THREE.MeshBasicMaterial({ color: 0x7fd4ff }))
    boardLit.position.set(SX - 2.62, 3.6, -14)
    g.add(boardLit)
  }

  parent.add(g)
  return { group: g, trackX: railX(-14), railX, zTop: Z0, zBot: Z1, platformZ: -14 }
}

/* ------------------------------------------------------------ THE CONSIST */
export function buildTrain(opts){
  const { materials: M, parent, cars = 4, seed = 1 } = opts
  const group = new THREE.Group()
  const meshes = []
  const doors = []
  /* one merged mesh per material PER CAR, so each car sits at its own
     offset along the consist rather than all four overlapping at z=0 */
  for (let ci = 0; ci < cars; ci++){
    const carBins = new Map()
    buildCar(carBins, M, ci)
    const cz = -ci * (CAR.L + 0.9)
    for (const [k, list] of carBins){
      if (!list.length) continue
      const merged = mergeGeometries(list, false)
      if (!merged) continue
      merged.translate(0, 0, cz)
      merged.computeBoundingSphere()
      const mesh = new THREE.Mesh(merged, M[k] || M.body)
      mesh.userData.matKey = k
      group.add(mesh)
      meshes.push(mesh)
      list.forEach(g => g.dispose && g.dispose())
    }
  }

  /* Door panels are separate so they can slide. One pair per car side. */
  const doorGeo = new THREE.BoxGeometry(0.06, 1.95, 1.28)
  const doorMeshes = []
  for (let c = 0; c < cars; c++){
    for (const s of [-1, 1]){
      for (const dz of [-CAR.L * 0.32, 0, CAR.L * 0.32]){
        const d = new THREE.Mesh(doorGeo, M.door)
        d.position.set(s * (CAR.W / 2 + 0.10), CAR.FLOOR_Y + 1.05, -c * (CAR.L + 0.9) + dz)
        d.userData = { closedX: d.position.x, openX: d.position.x + s * 1.15 }
        group.add(d)
        doorMeshes.push(d)
        doors.push(d)
      }
    }
  }

  /* headlights on the leading car, tail lights on the last */
  const headGeo = new THREE.SphereGeometry(0.17, 8, 8)
  const head = new THREE.Mesh(headGeo, M.headlight)
  head.position.set(0, CAR.FLOOR_Y + 1.0, CAR.L / 2 - 0.1)
  group.add(head)
  const tail = new THREE.Mesh(headGeo, M.taillight)
  tail.position.set(0, CAR.FLOOR_Y + 1.0, -(cars - 1) * (CAR.L + 0.9) - CAR.L / 2 + 0.1)
  group.add(tail)

  group.userData = {
    type: 'train', doorT: 0, doors, head, tail, cars,
    length: cars * (CAR.L + 0.9),
    /* the cycle state machine */
    phase: 'away', phaseT: 0, z: 0, speed: 0,
    /* interval and dwell, tuned so trains actually arrive while you watch */
    arriveFrom: 40, arriveTo: -14, dwell: 5.4, interval: 26
  }
  if (parent) parent.add(group)
  return group
}

/* ------------------------------------------------------------ THE CYCLE --
   Called every frame. Returns the train's phase so the audio and the
   door glow can follow it. */
export function updateTrain(tr, dt, opts = {}){
  const u = tr.userData
  const onSound = opts.onSound
  let arrived = false, departed = false, doorsOpen = false

  u.phaseT += dt
  switch (u.phase){
    case 'away':
      /* parked far down the line, running */
      if (u.phaseT > u.interval){ u.phase = 'approach'; u.phaseT = 0; if (onSound) onSound('approach') }
      break
    case 'approach': {
      /* decelerate into the platform: speed falls from line speed to rest */
      const t = clamp01(u.phaseT / 7.5)
      const ease = 1 - (1 - t) * (1 - t)
      const line = 26
      u.speed = line * (1 - ease)
      u.z += u.speed * dt * 0.42
      if (t >= 1){ u.phase = 'dwell'; u.phaseT = 0; u.speed = 0; u.z = u.arriveTo
        arrived = true; if (onSound) onSound('arrive') }
      break
    }
    case 'dwell':
      u.speed = 0
      doorsOpen = u.phaseT > 0.9 && u.phaseT < u.dwell - 1.4
      if (u.phaseT > u.dwell){ u.phase = 'depart'; u.phaseT = 0; departed = true; if (onSound) onSound('depart') }
      break
    case 'depart': {
      const t = clamp01(u.phaseT / 6.0)
      u.speed = 22 * t * t
      u.z -= u.speed * dt * 0.42
      if (t >= 1){ u.phase = 'away'; u.phaseT = 0; u.speed = 0; if (onSound) onSound('away') }
      break
    }
  }

  /* The train sits on the curve: X and heading both come from the same
     functions the track was built from, so it can never drift off. */
  const x = typeof opts.railX === 'function' ? opts.railX(u.z) : (opts.trackX === undefined ? RAIL_X : opts.trackX)
  tr.position.set(x, 0, u.z)
  tr.rotation.y = typeof opts.railHeading === 'function'
    ? opts.railHeading(u.z)
    : Math.PI
  /* a slight lean into the curve, as a real bogie does */
  tr.rotation.z = Math.sin((u.z + 40) / 58) * 0.012

  /* doors slide, and only at the platform */
  const target = doorsOpen ? 1 : 0
  u.doorT = lerpN(u.doorT, target, 0.12)
  for (const d of u.doors){
    d.position.x = lerpN(d.userData.closedX, d.userData.openX, u.doorT)
  }

  return { phase: u.phase, doorsOpen, arrived, departed, z: u.z, speed: u.speed }
}
function clamp01(v){ return Math.max(0, Math.min(1, v)) }
function lerpN(a, b, t){ return a + (b - a) * t }