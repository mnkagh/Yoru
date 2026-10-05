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

/* Commuter car: 20m long, 2.9m wide, 3.6m tall — Yamanote-line scale. */
const CAR = { L: 20, W: 2.9, H: 3.6, FLOOR_Y: 1.15 }

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
export function buildTrackway(parent, M){
  const g = new THREE.Group()
  const railMat = new THREE.MeshBasicMaterial({ color: 0x39424f })
  const sleeperMat = new THREE.MeshBasicMaterial({ color: 0x1a1d22 })
  const ballastMat = new THREE.MeshBasicMaterial({ color: 0x14161b })
  const deckMat = new THREE.MeshBasicMaterial({ color: 0x1b1f26 })
  const X = -14
  const Z0 = 12, Z1 = -152
  const len = Z0 - Z1, mid = (Z0 + Z1) / 2

  /* ballast bed and the concrete viaduct deck the track sits on */
  const ballast = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.5, len), ballastMat)
  ballast.position.set(X, 0.25, mid)
  const deck = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.55, len), deckMat)
  deck.position.set(X, -0.05, mid)
  /* parapet walls either side of the viaduct */
  for (const s of [-1, 1]){
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.9, len), deckMat)
    p.position.set(X + s * 2.7, 0.6, mid)
    g.add(p)
  }
  g.add(ballast, deck)

  /* sleepers and rails, instanced along the whole run */
  const nSleep = Math.floor(len / 0.65)
  const slGeo = new THREE.BoxGeometry(2.5, 0.14, 0.22)
  const sleepers = new THREE.InstancedMesh(slGeo, sleeperMat, nSleep)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < nSleep; i++){
    dummy.position.set(X, 0.56, Z0 - i * 0.65 - 0.3)
    dummy.rotation.set(0,0,0)
    dummy.updateMatrix()
    sleepers.setMatrixAt(i, dummy.matrix)
  }
  sleepers.instanceMatrix.needsUpdate = true
  g.add(sleepers)
  for (const s of [-1, 1]){
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, len), railMat)
    rail.position.set(X + s * 0.72, 0.70, mid)
    g.add(rail)
  }

  /* platform: a real edge with tactile paving and a yellow line */
  const plat = new THREE.Mesh(new THREE.BoxGeometry(6.5, 1.05, 34), deckMat)
  plat.position.set(X + 5.4, 0.52, -14)
  g.add(plat)
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.1, 34),
    new THREE.MeshBasicMaterial({ color: 0x2c3138 }))
  edge.position.set(X + 2.2, 0.55, -14)
  g.add(edge)
  const tact = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 34),
    new THREE.MeshBasicMaterial({ color: 0x8a7524 }))
  tact.position.set(X + 2.6, 1.06, -14)
  g.add(tact)
  const yellow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 34),
    new THREE.MeshBasicMaterial({ color: 0xc9a961, transparent: true, opacity: 0.5 }))
  yellow.position.set(X + 2.95, 1.07, -14)
  g.add(yellow)

  parent.add(g)
  return { group: g, trackX: X, zTop: Z0, zBot: Z1, platformZ: -14 }
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

  tr.position.set(opts.trackX === undefined ? -14 : opts.trackX, 0, u.z)

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