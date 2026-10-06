/* ==========================================================================
   VEHICLE SYSTEM — recognisable Tokyo silhouettes
   --------------------------------------------------------------------------
   A taxi is not a hatchback with a yellow box on the roof. Each type has
   its own real proportions, glasshouse, lights and details:

     TAXI       low sedan, tall greenhouse, roof lamp, dome light
     KEICAR     660cc micro-car: tall cabin, tiny bonnet, micro-sized
     HATCHBACK  compact 5-door, short bonnet, upright tail
     MINIVAN    tall one-box cabin, sliding-door line, high roof
     DELIVERY   box van: separate cab and load box, roof vent, roller door
     BUS        tall double-length body, window strip, route display
     TRUCK      cab + flat bed with headboard and cargo
     BICYCLE    frame triangle, wheels, bars, saddle, basket

   Geometry is built per type, then merged per material, so a bus costs one
   draw call per material exactly like a hatchback. Wheels are separate so
   they can roll.
   ========================================================================== */

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const BOX = new THREE.BoxGeometry(1, 1, 1)
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 12)
const SPH = new THREE.SphereGeometry(0.5, 10, 8)
const CONE = new THREE.ConeGeometry(0.5, 1, 10)

function box(w, h, d, x, y, z){ const g = BOX.clone(); g.scale(w,h,d); g.translate(x,y,z); return g }
function sph(r, x, y, z, sx = 1, sy = 1, sz = 1){ const g = SPH.clone(); g.scale(r*sx, r*sy, r*sz); g.translate(x,y,z); return g }
function cylZ(r, len, x, y, z){ const g = CYL.clone(); g.rotateX(Math.PI/2); g.scale(r, len, r); g.translate(x,y,z); return g }
function cylY(r, h, x, y, z){ const g = CYL.clone(); g.scale(r, h, r); g.translate(x,y,z); return g }
/* a wedge: the sloping bonnet and windscreen of a car, made by shearing
   a box, which is what actually makes a vehicle read as a vehicle */
function wedge(w, h, d, x, y, z, shear = 0.3){
  const g = BOX.clone()
  g.scale(w, h, d)
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++){
    const py = pos.getY(i)
    const t = (py + h/2) / h          /* 0 at bottom, 1 at top */
    pos.setX(i, pos.getX(i) * (1 + shear * t))
    pos.setZ(i, pos.getZ(i) * (1 - shear * t * 0.35))
  }
  g.computeVertexNormals()
  g.translate(x, y, z)
  return g
}

/* ------------------------------------------------------------------ MATS */
export function makeVehicleMaterials(){
  return {
    /* Japanese body colours: white, silver, black, plus taxi cream/green,
       kei-car yellow, van white, bus blue and cream */
    body: {
      white:  new THREE.MeshBasicMaterial({ color: 0xdcdcd6 }),
      silver: new THREE.MeshBasicMaterial({ color: 0x9aa2aa }),
      black:  new THREE.MeshBasicMaterial({ color: 0x14161a }),
      grey:   new THREE.MeshBasicMaterial({ color: 0x545a62 }),
      blue:   new THREE.MeshBasicMaterial({ color: 0x24386b }),
      red:    new THREE.MeshBasicMaterial({ color: 0x8c2a24 }),
      taxiCream: new THREE.MeshBasicMaterial({ color: 0xd9c98a }),
      taxiGreen: new THREE.MeshBasicMaterial({ color: 0x2c5a44 }),
      kei:    new THREE.MeshBasicMaterial({ color: 0xd8c84a }),
      busCream: new THREE.MeshBasicMaterial({ color: 0xd4d0c4 }),
      busBlue:  new THREE.MeshBasicMaterial({ color: 0x2a4470 }),
      truck:  new THREE.MeshBasicMaterial({ color: 0x3a4048 }),
      bike:   new THREE.MeshBasicMaterial({ color: 0x1a2028 })
    },
    glass:  new THREE.MeshBasicMaterial({ color: 0x0e141c }),
    glassLit: new THREE.MeshBasicMaterial({ color: 0x1a2838 }),
    tyre:   new THREE.MeshBasicMaterial({ color: 0x0a0c10 }),
    rim:    new THREE.MeshBasicMaterial({ color: 0x6a7078 }),
    /* driver and passenger skin/cloth, deliberately plain: a silhouette
       behind glass, not a portrait */
    skin: [0xd8b090, 0xc09878, 0xe4c4a8, 0xa88060].map(c => new THREE.MeshBasicMaterial({ color: c })),
    chrome: new THREE.MeshBasicMaterial({ color: 0xb8bec6 }),
    headlight: new THREE.MeshBasicMaterial({ color: 0xfff4d8 }),
    taillight: new THREE.MeshBasicMaterial({ color: 0xc4302a }),
    indicator: new THREE.MeshBasicMaterial({ color: 0xd89030 }),
    plate:  new THREE.MeshBasicMaterial({ color: 0xd8d4c8 }),
    /* taxi roof lamp — the single most legible taxi cue in Tokyo */
    taxiLamp: new THREE.MeshBasicMaterial({ color: 0xffe95a }),
    /* bus destination display: a lit panel, text re-baked by the caller */
    routePanel: new THREE.MeshBasicMaterial({ color: 0x0a0d12 }),
    routeLit: new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
    vanBox: new THREE.MeshBasicMaterial({ color: 0xe4e2da }),
    truckBed: new THREE.MeshBasicMaterial({ color: 0x2e343c })
  }
}

/* ------------------------------------------------------------------ WHEEL */
function wheel(mats, r, w, x, y, z, out){
  out.push(cylZ(r, w, x, y, z, mats.tyre))
  out.push(cylZ(r * 0.55, w * 1.06, x, y, z, mats.rim))
}

/* ============================================================ VEHICLE BUILDS
   Each builder fills `bins` (material key -> geometry list) and returns
   wheel positions so they can be created as separate rolling meshes. */

/* common: four wheels, headlamps, tail lamps, plates, mirrors */
function wheelsAndLights(bins, M, opts){
  const { L, W, wheelR, wheelZ, front, rear } = opts
  const wx = W / 2
  wheel(bins, wheelR, 0.19,  wx, wheelR,  front, M)
  wheel(bins, wheelR, 0.19, -wx, wheelR,  front, M)
  wheel(bins, wheelR, 0.19,  wx, wheelR,  rear, M)
  wheel(bins, wheelR, 0.19, -wx, wheelR,  rear, M)
  /* bumpers */
  bins.chrome.push(box(W * 0.98, 0.12, 0.1, 0, 0.34, front + 0.02))
  bins.chrome.push(box(W * 0.98, 0.12, 0.1, 0, 0.34, rear - 0.02))
}

function taxi(bins, M, L, W){
  const H = 0.60
  /* low sedan body: bonnet, cabin, boot — three volumes, not one box */
  bins.body.push(box(W, H, L * 0.52, 0, H, -L * 0.12))            /* main mass */
  bins.body.push(wedge(W, 0.20, L * 0.30, 0, H + 0.08, L * 0.32, 0.22)) /* bonnet */
  bins.body.push(box(W, 0.18, L * 0.20, 0, H + 0.10, -L * 0.44))  /* boot */
  /* greenhouse: narrower than the body, inset, so it reads as a cabin */
  bins.glass.push(box(W * 0.80, 0.40, L * 0.34, 0, H + 0.30, -L * 0.04))
  bins.body.push(box(W * 0.86, 0.30, L * 0.30, 0, H + 0.34, -L * 0.06))
  /* pillars */
  for (const s of [-1, 1])
    bins.body.push(box(0.05, 0.30, 0.05, s * W * 0.40, H + 0.30, L * 0.10))
  /* the roof lamp: this is what says "taxi" from across a street */
  bins.taxiLamp.push(box(0.26, 0.10, 0.16, 0, H + 0.52, -L * 0.04))
  bins.chrome.push(box(0.24, 0.03, 0.14, 0, H + 0.575, -L * 0.04))
  /* door line + handles */
  bins.chrome.push(box(0.02, 0.02, L * 0.44, W / 2 + 0.005, H - 0.12, -L * 0.10))
  bins.chrome.push(box(0.06, 0.03, 0.12, W / 2 + 0.02, H + 0.08, L * 0.10))
  bins.chrome.push(box(0.06, 0.03, 0.12, W / 2 + 0.02, H + 0.08, -L * 0.18))
  /* mirrors */
  bins.body.push(box(0.10, 0.07, 0.05, W / 2 + 0.07, H + 0.26, L * 0.22))
  bins.headlight.push(box(0.16, 0.09, 0.05, W * 0.32, H - 0.04, L * 0.47))
  bins.headlight.push(box(0.16, 0.09, 0.05, -W * 0.32, H - 0.04, L * 0.47))
  bins.taillight.push(box(0.14, 0.10, 0.05, W * 0.34, H - 0.02, -L * 0.49))
  bins.taillight.push(box(0.14, 0.10, 0.05, -W * 0.34, H - 0.02, -L * 0.49))
  bins.plate.push(box(0.22, 0.07, 0.02, 0, 0.42, L * 0.50))
  bins.plate.push(box(0.22, 0.07, 0.02, 0, 0.42, -L * 0.50))
  return { wheelR: 0.26, front: L * 0.34, rear: -L * 0.32 }
}

function keicar(bins, M, L, W){
  const H = 0.62
  /* micro-car: the cabin is most of the car and the bonnet is a stub */
  bins.body.push(box(W, H, L * 0.66, 0, H, -L * 0.08))
  bins.glass.push(box(W * 0.88, 0.44, L * 0.44, 0, H + 0.28, -L * 0.02))
  bins.body.push(box(W * 0.92, 0.26, L * 0.40, 0, H + 0.34, -L * 0.04))
  bins.body.push(wedge(W, 0.12, L * 0.14, 0, H + 0.02, L * 0.32, 0.14))
  /* a kei car's cabin is boxier — flatter windscreen, upright pillars */
  for (const s of [-1, 1])
    bins.body.push(box(0.06, 0.34, 0.06, s * W * 0.44, H + 0.28, L * 0.18))
  bins.chrome.push(box(0.05, 0.02, L * 0.52, W / 2 + 0.005, H - 0.10, -L * 0.06))
  bins.headlight.push(box(0.13, 0.10, 0.05, W * 0.34, H - 0.06, L * 0.36))
  bins.headlight.push(box(0.13, 0.10, 0.05, -W * 0.34, H - 0.06, L * 0.36))
  bins.taillight.push(box(0.12, 0.12, 0.05, W * 0.36, H - 0.04, -L * 0.42))
  bins.taillight.push(box(0.12, 0.12, 0.05, -W * 0.36, H - 0.04, -L * 0.42))
  bins.plate.push(box(0.20, 0.08, 0.02, 0, 0.44, L * 0.38))
  bins.plate.push(box(0.20, 0.08, 0.02, 0, 0.44, -L * 0.42))
  return { wheelR: 0.22, front: L * 0.30, rear: -L * 0.28 }
}

function hatchback(bins, M, L, W){
  const H = 0.58
  bins.body.push(box(W, H, L * 0.56, 0, H, -L * 0.08))
  bins.body.push(wedge(W, 0.18, L * 0.28, 0, H + 0.06, L * 0.30, 0.24))
  /* the hatchback glasshouse extends to the tail — no separate boot */
  bins.glass.push(box(W * 0.84, 0.38, L * 0.40, 0, H + 0.28, -L * 0.10))
  bins.glass.push(wedge(W * 0.80, 0.34, 0.06, 0, H + 0.28, -L * 0.40, -0.30))
  bins.body.push(box(W * 0.88, 0.28, L * 0.36, 0, H + 0.32, -L * 0.12))
  bins.body.push(box(0.05, 0.28, 0.05, 0, H + 0.30, -L * 0.40))
  bins.chrome.push(box(0.05, 0.02, L * 0.46, W / 2 + 0.005, H - 0.12, -L * 0.08))
  bins.body.push(box(0.09, 0.06, 0.05, W / 2 + 0.06, H + 0.24, L * 0.18))
  bins.headlight.push(box(0.15, 0.08, 0.05, W * 0.33, H - 0.04, L * 0.45))
  bins.headlight.push(box(0.15, 0.08, 0.05, -W * 0.33, H - 0.04, L * 0.45))
  /* tall vertical tail lamps, the hatchback cue */
  bins.taillight.push(box(0.07, 0.30, 0.06, W * 0.42, H + 0.14, -L * 0.46))
  bins.taillight.push(box(0.07, 0.30, 0.06, -W * 0.42, H + 0.14, -L * 0.46))
  bins.plate.push(box(0.20, 0.07, 0.02, 0, 0.42, L * 0.48))
  bins.plate.push(box(0.20, 0.07, 0.02, 0, 0.46, -L * 0.48))
  return { wheelR: 0.25, front: L * 0.32, rear: -L * 0.30 }
}

function minivan(bins, M, L, W){
  const H = 0.78
  /* one-box: the cabin is the body. Sliding-door line + high roof. */
  bins.body.push(box(W, H, L * 0.62, 0, H, -L * 0.06))
  bins.glass.push(box(W * 0.90, 0.36, L * 0.30, 0, H + 0.30, L * 0.16))
  bins.glass.push(box(W * 0.90, 0.34, L * 0.40, 0, H + 0.32, -L * 0.06))
  bins.body.push(box(W * 0.94, 0.26, L * 0.56, 0, H + 0.36, -L * 0.04))
  /* the sliding-door rail and handle */
  bins.body.push(box(0.03, 0.03, L * 0.40, W / 2 + 0.005, H + 0.20, -L * 0.02))
  bins.chrome.push(box(0.04, 0.03, 0.10, W / 2 + 0.02, H + 0.08, L * 0.02))
  bins.body.push(box(0.09, 0.07, 0.05, W / 2 + 0.06, H + 0.24, L * 0.26))
  /* roof rails — the practical-cargo read */
  for (const s of [-1, 1])
    bins.chrome.push(box(0.05, 0.04, L * 0.44, s * W * 0.36, H + 0.50, -L * 0.06))
  bins.headlight.push(box(0.16, 0.12, 0.05, W * 0.36, H - 0.10, L * 0.42))
  bins.headlight.push(box(0.16, 0.12, 0.05, -W * 0.36, H - 0.10, L * 0.42))
  bins.taillight.push(box(0.09, 0.34, 0.06, W * 0.44, H + 0.02, -L * 0.44))
  bins.taillight.push(box(0.09, 0.34, 0.06, -W * 0.44, H + 0.02, -L * 0.44))
  bins.plate.push(box(0.22, 0.08, 0.02, 0, 0.46, L * 0.44))
  bins.plate.push(box(0.22, 0.08, 0.02, 0, 0.50, -L * 0.44))
  return { wheelR: 0.28, front: L * 0.30, rear: -L * 0.28 }
}

function deliveryVan(bins, M, L, W){
  const cabH = 0.78, boxH = 1.28
  /* a van is two volumes: cab, then a taller load box behind it */
  bins.body.push(box(W, cabH, L * 0.34, 0, cabH, L * 0.28))
  bins.glass.push(box(W * 0.88, 0.34, 0.10, 0, cabH + 0.22, L * 0.42))
  bins.vanBox.push(box(W * 1.02, boxH, L * 0.58, 0, boxH / 2 + 0.22, -L * 0.16))
  /* roof vent + a rear roller door line */
  bins.chrome.push(box(W * 0.40, 0.06, 0.24, 0, boxH + 0.24, -L * 0.16))
  bins.chrome.push(box(W * 0.86, 0.03, 0.03, 0, boxH * 0.72, -L * 0.45))
  bins.chrome.push(box(W * 0.86, 0.03, 0.03, 0, boxH * 0.42, -L * 0.45))
  bins.chrome.push(box(0.03, 0.03, L * 0.20, W / 2 + 0.005, 0.9, -L * 0.16))
  bins.body.push(box(0.09, 0.07, 0.05, W / 2 + 0.06, cabH + 0.22, L * 0.30))
  bins.headlight.push(box(0.15, 0.10, 0.05, W * 0.36, cabH - 0.14, L * 0.45))
  bins.headlight.push(box(0.15, 0.10, 0.05, -W * 0.36, cabH - 0.14, L * 0.45))
  bins.taillight.push(box(0.10, 0.22, 0.05, W * 0.46, 0.62, -L * 0.47))
  bins.taillight.push(box(0.10, 0.22, 0.05, -W * 0.46, 0.62, -L * 0.47))
  bins.plate.push(box(0.22, 0.08, 0.02, 0, 0.50, L * 0.46))
  bins.plate.push(box(0.22, 0.08, 0.02, 0, 0.54, -L * 0.48))
  return { wheelR: 0.30, front: L * 0.30, rear: -L * 0.26 }
}

function cityBus(bins, M, L, W){
  const H = 1.55
  /* tall slab body with a continuous window strip — unmistakable */
  bins.body.push(box(W, H, L, 0, H + 0.16, 0))
  /* skirt and wheel arches */
  bins.body.push(box(W * 1.02, 0.30, L * 0.98, 0, 0.30, 0))
  /* window strip: two panes per side, continuous band */
  for (const s of [-1, 1]){
    bins.glassLit.push(box(0.06, 0.62, L * 0.74, s * W / 2 + s * 0.01, H + 0.30, -L * 0.02))
    bins.body.push(box(0.05, 0.64, 0.06, s * W / 2 + s * 0.02, H + 0.30, -L * 0.36))
    bins.body.push(box(0.05, 0.64, 0.06, s * W / 2 + s * 0.02, H + 0.30,  L * 0.30))
  }
  /* front windscreen, tall */
  bins.glassLit.push(box(W * 0.86, 0.80, 0.06, 0, H + 0.28, L * 0.50))
  /* route display above the windscreen */
  bins.routePanel.push(box(0.90, 0.20, 0.05, 0, H + 0.86, L * 0.50))
  bins.routeLit.push(box(0.84, 0.13, 0.03, 0, H + 0.86, L * 0.52))
  /* rear window */
  bins.glass.push(box(W * 0.80, 0.46, 0.05, 0, H + 0.30, -L * 0.50))
  /* destination side sign */
  bins.routePanel.push(box(0.05, 0.16, 0.44, W / 2 + 0.02, H + 0.84, L * 0.34))
  bins.routeLit.push(box(0.03, 0.10, 0.38, W / 2 + 0.04, H + 0.84, L * 0.34))
  /* doors on the kerb side */
  bins.glass.push(box(0.05, 0.96, 0.50, -W / 2 - 0.01, 0.86, L * 0.24))
  bins.body.push(box(0.04, 1.00, 0.04, -W / 2 - 0.02, 0.86, L * 0.02))
  bins.body.push(box(0.04, 1.00, 0.04, -W / 2 - 0.02, 0.86, L * 0.46))
  /* roof: AC pod, the detail every Japanese bus carries */
  bins.chrome.push(box(W * 0.72, 0.20, L * 0.36, 0, H + 0.26, -L * 0.14))
  /* headlamps, indicator, plate */
  bins.headlight.push(box(0.20, 0.12, 0.05, W * 0.36, 0.56, L * 0.51))
  bins.headlight.push(box(0.20, 0.12, 0.05, -W * 0.36, 0.56, L * 0.51))
  bins.indicator.push(box(0.12, 0.09, 0.05, W * 0.48, 0.62, L * 0.51))
  bins.indicator.push(box(0.12, 0.09, 0.05, -W * 0.48, 0.62, L * 0.51))
  bins.plate.push(box(0.24, 0.10, 0.02, 0, 0.50, L * 0.51))
  bins.plate.push(box(0.24, 0.10, 0.02, 0, 0.52, -L * 0.51))
  return { wheelR: 0.42, front: L * 0.34, rear: -L * 0.30 }
}

function flatbedTruck(bins, M, L, W){
  const cabH = 0.86, bedY = 0.62
  /* cab, then a flat bed with a headboard — a working truck silhouette */
  bins.body.push(box(W, cabH, L * 0.30, 0, cabH, L * 0.30))
  bins.glass.push(box(W * 0.86, 0.34, 0.10, 0, cabH + 0.24, L * 0.42))
  bins.truckBed.push(box(W * 0.96, 0.12, L * 0.62, 0, bedY, -L * 0.16))
  /* headboard and side rails */
  bins.truckBed.push(box(W * 0.96, 0.44, 0.08, 0, bedY + 0.28, L * 0.12))
  for (const s of [-1, 1])
    bins.truckBed.push(box(0.07, 0.36, L * 0.60, s * W * 0.47, bedY + 0.24, -L * 0.16))
  /* cargo: strapped crates and a tarp, so the bed is not empty */
  bins.vanBox.push(box(W * 0.52, 0.40, 0.44, -W * 0.16, bedY + 0.26, -L * 0.02))
  bins.vanBox.push(box(W * 0.44, 0.32, 0.36, W * 0.24, bedY + 0.22, -L * 0.22))
  bins.chrome.push(box(W * 0.50, 0.04, 0.04, -W * 0.16, bedY + 0.46, -L * 0.02))
  bins.body.push(box(0.09, 0.07, 0.05, W / 2 + 0.06, cabH + 0.24, L * 0.30))
  bins.headlight.push(box(0.16, 0.11, 0.05, W * 0.36, cabH - 0.16, L * 0.46))
  bins.headlight.push(box(0.16, 0.11, 0.05, -W * 0.36, cabH - 0.16, L * 0.46))
  bins.taillight.push(box(0.10, 0.20, 0.05, W * 0.46, 0.52, -L * 0.48))
  bins.taillight.push(box(0.10, 0.20, 0.05, -W * 0.46, 0.52, -L * 0.48))
  bins.plate.push(box(0.22, 0.08, 0.02, 0, 0.46, L * 0.47))
  bins.plate.push(box(0.22, 0.08, 0.02, 0, 0.48, -L * 0.49))
  return { wheelR: 0.34, front: L * 0.30, rear: -L * 0.24 }
}

function bicycle(bins, M){
  /* a bicycle is a frame, two wheels, bars and a saddle — drawn as such */
  const R = 0.30
  /* wheels: rim + tyre, standing in the XZ plane, rolling about X */
  const rimG = new THREE.TorusGeometry(R, 0.018, 6, 18)
  for (const z of [0.44, -0.44]){
    const g = rimG.clone(); g.rotateY(Math.PI / 2); g.translate(0, R, z)
    bins.rim.push(g)
    const t = rimG.clone(); t.rotateY(Math.PI / 2); t.scale(1.06, 1.06, 1.06); t.translate(0, R, z)
    bins.tyre.push(t)
  }
  rimG.dispose()
  /* frame triangle */
  bins.bike.push(box(0.04, 0.04, 0.50, 0, 0.52, 0.04))
  bins.bike.push(box(0.04, 0.36, 0.04, 0, 0.42, 0.24))
  const seatStay = box(0.035, 0.42, 0.035, 0, 0.44, -0.28)
  seatStay.rotateX(0.42); bins.bike.push(seatStay)
  const downTube = box(0.035, 0.40, 0.035, 0, 0.44, 0.14)
  downTube.rotateX(-0.30); bins.bike.push(downTube)
  /* fork + handlebars + saddle + basket */
  const fork = box(0.03, 0.44, 0.03, 0, 0.42, 0.44)
  fork.rotateX(0.14); bins.bike.push(fork)
  bins.chrome.push(box(0.34, 0.03, 0.03, 0, 0.62, 0.40))
  bins.chrome.push(box(0.03, 0.03, 0.10, 0, 0.58, 0.40))
  bins.body.push(box(0.11, 0.05, 0.20, 0, 0.66, -0.26))
  bins.rim.push(box(0.22, 0.18, 0.20, 0, 0.60, 0.56))       /* front basket */
  /* rider legs, so a bicycle carries a person */
  bins.body.push(box(0.07, 0.30, 0.07, 0.06, 0.46, 0.14))
  bins.body.push(box(0.07, 0.26, 0.07, -0.06, 0.44, -0.04))
  return { wheelR: R, front: 0.44, rear: -0.44 }
}

/* ---------------------------------------------------------------- SPECS --
   Real dimensions in metres. A Japanese taxi is 4.6m long and 1.7m wide;
   a kei car is 3.4m; a city bus is 11m. Getting these right is most of
   what makes the street read as Tokyo. */
export const VEHICLE_TYPES = {
  taxi:      { build: taxi,      L: 4.60, W: 1.70, mats: ['taxiCream','taxiGreen','black'], speed: [10, 14] },
  keicar:    { build: keicar,    L: 3.40, W: 1.48, mats: ['kei','white','red'],         speed: [7, 10] },
  hatchback: { build: hatchback, L: 4.00, W: 1.66, mats: ['white','silver','black','grey','red'], speed: [8, 12] },
  minivan:   { build: minivan,   L: 4.70, W: 1.74, mats: ['white','silver','grey'],    speed: [8, 11] },
  van:       { build: deliveryVan, L: 5.40, W: 2.00, mats: ['vanBox','white'],         speed: [7, 10] },
  bus:       { build: cityBus,   L: 11.0, W: 2.50, mats: ['busCream','busBlue'],       speed: [6, 9] },
  truck:     { build: flatbedTruck, L: 6.40, W: 2.30, mats: ['truck','white'],         speed: [6, 9] },
  bicycle:   { build: bicycle,   L: 1.70, W: 0.60, mats: ['bike'],                     speed: [3, 5] }
}

/* -------------------------------------------------------------- BUILD ONE */
/* A driver. Cars, vans, buses and trucks are empty boxes otherwise, and
   an empty car moving down a street is the single most obvious tell that
   nobody is inhabiting this world. Seated silhouette only: head, shoulders
   and torso behind the windscreen, in the driver's position. */
function driver(bins, M, kind, L, W){
  const isLeftHandDrive = true
  const sx = isLeftHandDrive ? -1 : 1
  if (kind === 'bicycle') return
  /* seat height by vehicle class: a bus driver sits much higher */
  const seatY = kind === 'bus' ? 1.62 : kind === 'truck' ? 1.18 : kind === 'van' ? 1.02 : 0.98
  const zFront = kind === 'bus' ? L * 0.40 : kind === 'truck' ? L * 0.32 : L * 0.16
  const jx = sx * W * 0.26
  /* torso */
  bins.body.push(box(0.34, 0.46, 0.24, jx, seatY + 0.28, zFront))
  /* shoulders */
  bins.body.push(box(0.42, 0.12, 0.26, jx, seatY + 0.50, zFront))
  /* head */
  bins.skin.push(sph(0.115, jx, seatY + 0.68, zFront))
  /* arms reaching the wheel */
  bins.skin.push(box(0.34, 0.09, 0.09, jx + sx * 0.02, seatY + 0.40, zFront + 0.20))
  /* a passenger or two in a car or taxi */
  if (kind === 'taxi' || kind === 'hatchback' || kind === 'kei' || kind === 'minivan'){
    const px = -sx * W * 0.24
    bins.body.push(box(0.32, 0.42, 0.22, px, seatY + 0.26, zFront - 0.18))
    bins.skin.push(sph(0.108, px, seatY + 0.62, zFront - 0.18))
  }
  /* buses and trucks carry a few more people */
  if (kind === 'bus'){
    for (let i = 0; i < 3; i++){
      const px = (i % 2 === 0 ? -1 : 1) * W * 0.24
      const pz = L * 0.10 - i * L * 0.13
      bins.body.push(box(0.32, 0.44, 0.22, px, seatY + 0.22, pz))
      bins.skin.push(sph(0.108, px, seatY + 0.58, pz))
    }
  }
}

function kind_passengers(type){
  if (type === 'bus') return 4
  if (type === 'taxi' || type === 'hatchback' || type === 'kei' || type === 'minivan') return 2
  return 1
}

export function buildVehicle(opts){
  const { type, materials: M, seed = 1, parent } = opts
  const spec = VEHICLE_TYPES[type] || VEHICLE_TYPES.hatchback
  let a = seed >>> 0
  const rng = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const bins = new Map()
  const key = (k) => {
    if (!bins.has(k)) bins.set(k, [])
    return bins.get(k)
  }
  /* the builders index bins by material *name*; alias 'body' to the chosen
     body colour so a taxi is cream and a bus is blue-cream */
  const bodyMat = M.body[spec.mats[(rng() * spec.mats.length) | 0]]
  const liveBins = new Proxy({}, {
    get(_, k){
      /* the driver and passengers get their own tone, chosen per vehicle */
      if (k === 'skin') return key('__skin' + ((seed >>> 8) % 4))
      if (k === 'body'){
        if (!bins.has('__body')) bins.set('__body', [])
        return bins.get('__body')
      }
      return key(k)
    }
  })
  const w = spec.build(liveBins, M, spec.L, spec.W)
  /* occupants: nobody drives an empty car */
  driver(liveBins, M, type, spec.L, spec.W)

  const group = new THREE.Group()
  const bodyGroup = new THREE.Group()
  for (const [k, list] of bins){
    if (!list.length) continue
    const merged = mergeGeometries(list, false)
    if (!merged){ continue }
    merged.computeBoundingSphere()
    const mat = k === '__body' ? bodyMat
      : (k.indexOf('__skin') === 0 ? M.skin[Number(k.slice(6)) % M.skin.length]
      : (M[k] || M.chrome))
    const mesh = new THREE.Mesh(merged, mat)
    mesh.matrixAutoUpdate = false
    mesh.updateMatrix()
    bodyGroup.add(mesh)
    list.forEach(g => g.dispose && g.dispose())
  }
  group.add(bodyGroup)

  /* wheels as separate meshes so they roll */
  const wheels = []
  if (w.wheelR > 0.2 && type !== 'bicycle'){
    const tyre = M.tyre, rim = M.rim
    for (const sx of [-1, 1]){
      for (const sz of [w.front, w.rear]){
        const g = new THREE.CylinderGeometry(w.wheelR, w.wheelR, 0.19, 12)
        g.rotateX(Math.PI / 2)
        const m = new THREE.Mesh(g, tyre)
        m.position.set(sx * spec.W / 2, w.wheelR, sz)
        group.add(m)
        const g2 = new THREE.CylinderGeometry(w.wheelR * 0.52, w.wheelR * 0.52, 0.21, 10)
        g2.rotateX(Math.PI / 2)
        const m2 = new THREE.Mesh(g2, rim)
        m2.position.copy(m.position)
        group.add(m2)
        wheels.push(m, m2)
      }
    }
  }

  /* headlights and taillights are addressed by the night pass so they can
     be dimmed in daylight and lit at night */
  const lights = []
  bodyGroup.traverse(o => {
    if (o.isMesh && o.material === M.headlight) lights.push({ mesh: o, kind: 'head' })
    if (o.isMesh && o.material === M.taillight) lights.push({ mesh: o, kind: 'tail' })
  })

  group.userData = {
    type: 'vehicle', kind: type, dir: 1,
    /* occupants are geometry now: nobody drives an empty car */
    hasDriver: type === 'bicycle' ? false : true,
    passengers: kind_passengers(type),
    speed: spec.speed[0] + rng() * (spec.speed[1] - spec.speed[0]),
    wheels, lights, headMat: M.headlight, tailMat: M.taillight,
    bodyMat, wheelR: w.wheelR, bodyGroup,
    /* surface state, driven by weather */
    wet: 0, rolling: 0
  }
  if (parent) parent.add(group)
  return group
}

/* Apply weather to a vehicle: rain darkens and glosses the body and puts
   spray behind the wheels; snow accumulates on the roof and bed. */
export function dressVehicleForWeather(v, atmo){
  const u = v.userData
  if (!u || !u.bodyMat) return
  const rain = clamp01(atmo.rain) * 1.7
  const snow = clamp01(atmo.snow) * 1.7
  const k = Math.min(1, rain)
  const target = 1 - k * 0.34 - Math.min(0.4, snow * 0.22)
  u.wet = lerpN(u.wet, target, 0.06)
  if (u.bodyMat.userData.base){
    u.bodyMat.color.copy(u.bodyMat.userData.base).multiplyScalar(u.wet)
  }
}
function clamp01(v){ return Math.max(0, Math.min(1, v || 0)) }
function lerpN(a, b, t){ return a + (b - a) * t }