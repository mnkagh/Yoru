/* ==========================================================================
   MODULAR BUILDING SYSTEM
   --------------------------------------------------------------------------
   A Tokyo building is not a scaled cube. It is assembled from parts:

     BASE      kerb plinth, ground-floor shell
     FACADE    the wall plane, punched with window bays
     BAY       recessed / protruding / glass / balcony window modules
     GROUND    shopfront, entrance recess, shutter, noren, awning
     DETAIL    AC units, balcony rails, pipes, signboard, fire escape
     ROOF      flat slab, parapet, equipment, pitched tile, penthouse

   Each archetype (below) picks WHICH parts appear and with what rhythm.
   Districts pick WHICH archetypes, and re-weight their proportions.

   Parts are built as small geometries, baked into world space, and merged
   per material with BufferGeometryUtils.mergeGeometries. Result: a building
   with real architecture that still costs ONE draw call per material.

   Deliberately NOT a generic box generator. The whole point is that a
   traditional lowrise in Asakusa and a highrise in Shinjuku share no
   silhouette, no floor rhythm, and no roof.
   ========================================================================== */

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/* ---------------------------------------------------------------- units --
   One geometry per part, reused everywhere and mutated only by scale. */
const BOX = new THREE.BoxGeometry(1, 1, 1)
const CYL = new THREE.CylinderGeometry(1, 1, 1, 8)
const HIP = new THREE.ConeGeometry(0.72, 0.55, 4)      /* traditional roof */
const TANK = new THREE.CylinderGeometry(1, 1, 1, 10)

/* floors are 3.2m in Tokyo; everything vertical derives from that */
const FLOOR = 3.2

/* ------------------------------------------------------------ materials --
   Flat-shaded MeshBasicMaterials. `emissive` parts (glass, shopfront glow)
   are pushed into a second list so the night pass can brighten only those. */
export function makeBuildingMaterials(){
  const M = {
    /* structural concrete — the bulk of every facade */
    concrete:   new THREE.MeshBasicMaterial({ color: 0x2b2f36 }),
    concreteLt: new THREE.MeshBasicMaterial({ color: 0x3a4049 }),
    /* warm plaster / tile cladding */
    plaster:    new THREE.MeshBasicMaterial({ color: 0x4a4038 }),
    tile:       new THREE.MeshBasicMaterial({ color: 0x2e3a3a }),
    /* dark metal: railings, shutters, sign frames, AC casings */
    metal:      new THREE.MeshBasicMaterial({ color: 0x1a1d22 }),
    /* timber, for traditional districts */
    timber:     new THREE.MeshBasicMaterial({ color: 0x3a281a }),
    /* dark glazed glass — reads as a window when unlit */
    glassDark:  new THREE.MeshBasicMaterial({ color: 0x0c1018 }),
    /* lit interior: shopfronts, lobby glass, restaurant windows */
    glassLit:   new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
    glassCool:  new THREE.MeshBasicMaterial({ color: 0xbcd2f0 }),
    /* pitched roof tile, the Asakusa read */
    roofTile:   new THREE.MeshBasicMaterial({ color: 0x2a2018 }),
    /* rooftop plant: tanks, ducts, housings */
    plant:      new THREE.MeshBasicMaterial({ color: 0x23262e }),
    /* signage board — district signage is re-baked onto these */
    signBoard:  new THREE.MeshBasicMaterial({ color: 0x101318 }),
    /* cloth: awnings, noren */
    cloth:      new THREE.MeshBasicMaterial({ color: 0x6e2f24 })
  }
  M.emissiveMats = [M.glassLit, M.glassCool]
  return M
}

/* --------------------------------------------------------------- helpers */

function box(w, h, d, x, y, z, ry = 0){
  const g = BOX.clone()
  g.scale(w, h, d)
  if (ry) g.rotateY(ry)
  g.translate(x, y, z)
  return g
}
function cyl(r, h, x, y, z, geo = CYL){
  const g = geo.clone()
  g.scale(r, h, r)
  g.translate(x, y, z)
  return g
}
/* a pitched hip roof sitting on top of a w×d footprint at height y */
function hipRoof(w, d, y, x, z){
  const g = HIP.clone()
  g.scale(Math.max(w, d), 1, Math.max(w, d))
  g.rotateY(Math.PI / 4)
  g.translate(x, y, z)
  return g
}

/* Accumulator: collects geometries per material key, then merges once.
   This is what keeps a 40-part building at 1 draw call per material. */
class Parts {
  constructor(){ this.bins = new Map() }
  add(key, geo){
    if (!geo) return
    if (!this.bins.has(key)) this.bins.set(key, [])
    this.bins.get(key).push(geo)
  }
  addAll(key, geos){ geos.forEach(g => this.add(key, g)) }
  /* build real Meshes and parent them to `parent` */
  commit(parent, M, opts = {}){
    const out = []
    for (const [key, list] of this.bins){
      if (!list.length) continue
      const merged = mergeGeometries(list, false)
      if (!merged) continue
      merged.computeBoundingSphere()
      const mesh = new THREE.Mesh(merged, M[key] || M.concrete)
      mesh.name = 'bldg:' + key
      if (opts.noShadow !== true) mesh.matrixAutoUpdate = false
      mesh.updateMatrix()
      parent.add(mesh)
      out.push(mesh)
      list.forEach(g => g.dispose())
    }
    this.bins.clear()
    return out
  }
}

/* ------------------------------------------------------- FACADE BAYS ----
   A window bay is the module that actually differentiates a Tokyo facade.
   `variant` controls whether it sits flush, recesses, or projects. */

function windowBay(out, M, opts){
  const {
    face,          /* 'front' (toward street, -z side) | 'side' (+x/-x) */
    dir,           /* which way the wall faces: -1 or +1 on that axis */
    w, d,          /* building footprint */
    y,             /* sill height */
    bw, bh,        /* bay size */
    inset,         /* how far it recesses into the wall */
    lit,           /* material key for the pane */
    frame
  } = opts

  const pane = face === 'front'
    ? box(bw, bh, 0.06, 0, y + bh / 2, dir * (d / 2 - inset), 0)
    : box(0.06, bh, bw, dir * (w / 2 - inset), y + bh / 2, 0, 0)

  if (face === 'front') pane.translate(0, 0, 0)
  out.add(lit, pane)

  if (frame){
    /* mullion cross + sill: what stops a window reading as a glowing hole */
    const fr = face === 'front'
      ? [
          box(bw + 0.12, 0.05, 0.1, 0, y + bh + 0.02, dir * (d / 2 - inset + 0.03)),
          box(bw + 0.18, 0.07, 0.14, 0, y - 0.02, dir * (d / 2 - inset + 0.05)),
          box(0.05, bh, 0.08, 0, y + bh / 2, dir * (d / 2 - inset + 0.02))
        ]
      : [
          box(0.1, 0.05, bw + 0.12, dir * (w / 2 - inset + 0.03), y + bh + 0.02, 0),
          box(0.14, 0.07, bw + 0.18, dir * (w / 2 - inset + 0.05), y - 0.02, 0),
          box(0.08, bh, 0.05, dir * (w / 2 - inset + 0.02), y + bh / 2, 0)
        ]
    out.addAll('metal', fr)
  }
}

/* a projecting balcony: slab + rail posts + top rail */
function balcony(out, M, face, dir, w, d, x, y, z){
  const bw = Math.min(w * 0.62, 2.4)
  const proj = 0.85
  if (face === 'front'){
    const zz = z + dir * (d / 2 + proj / 2)
    out.add('concreteLt', box(bw, 0.1, proj, x, y, zz))
    out.add('metal', box(bw, 0.05, 0.05, x, y + 0.5, zz + dir * (proj / 2)))
    for (let i = -2; i <= 2; i++)
      out.add('metal', box(0.04, 0.5, 0.04, x + i * bw / 5, y + 0.25, zz + dir * (proj / 2)))
  } else {
    const xx = x + dir * (w / 2 + proj / 2)
    out.add('concreteLt', box(proj, 0.1, bw, xx, y, z))
    out.add('metal', box(0.05, 0.05, bw, xx + dir * (proj / 2), y + 0.5, z))
    for (let i = -2; i <= 2; i++)
      out.add('metal', box(0.04, 0.5, 0.04, xx + dir * (proj / 2), y + 0.25, z + i * bw / 5))
  }
}

/* external AC condenser on a bracket — the signature Japanese detail */
function acUnit(out, x, y, z, ry = 0){
  out.add('metal', box(0.44, 0.32, 0.26, x, y, z, ry))
  out.add('plant', box(0.36, 0.24, 0.03, x, y, z + (ry ? 0 : 0.15), ry))
}

/* fire escape: two landings + a stringer, on residential archetypes.
   The stringer is built at the origin, rotated, and only THEN translated —
   rotating an already-translated geometry swings it metres away from the
   building, which is how a fire escape ended up hanging over the road. */
function fireEscape(out, x, y, z, dir, depth){
  for (let f = 0; f < 2; f++){
    const yy = y + f * FLOOR
    out.add('metal', box(0.5, 0.05, depth, x, yy, z + dir * (depth / 2 + 0.1)))
    /* the diagonal: centre, rotate, then place */
    const len = 2.4
    const g = new THREE.BoxGeometry(0.06, 0.06, len)
    g.rotateX(dir * 0.62)
    g.translate(x, yy - 0.9, z + dir * (depth / 2 + len / 2 * Math.cos(0.62)))
    out.add('metal', g)
  }
}

/* ------------------------------------------------------------ GROUND ----
   Ground floor is where a street reads as a street. Every archetype gets a
   DIFFERENT ground floor — that is most of the district identity. */

function shopfront(out, M, x, z, dir, w, opts = {}){
  const depth = 1.5
  const faceZ = z + dir * (opts.d / 2)
  const gw = Math.min(w * 0.86, 6.5)
  const gy = 0.15
  const gh = opts.h || 3.0

  /* recessed shopfront: a dark reveal, then lit glass set back inside it */
  out.add('concrete', box(gw + 0.5, gh + 0.35, 0.5, x, gy + gh / 2, faceZ - dir * 0.3))
  out.add(opts.lit || 'glassLit',
    box(gw, gh, 0.08, x, gy + gh / 2, faceZ - dir * 0.52))
  /* mullions divide the glass into a real shopfront rhythm */
  const bays = Math.max(2, Math.round(gw / 1.5))
  for (let i = 1; i < bays; i++)
    out.add('metal', box(0.07, gh, 0.14, x - gw / 2 + i * gw / bays, gy + gh / 2, faceZ - dir * 0.5))
  /* stall riser */
  out.add('concreteLt', box(gw + 0.2, 0.35, 0.3, x, gy + 0.16, faceZ - dir * 0.62))

  if (opts.shutter){
    /* closed roller shutter: horizontal ribs, the 2am face of a shop */
    for (let i = 0; i < 7; i++)
      out.add('metal', box(gw * 0.96, 0.16, 0.06, x, gy + 0.2 + i * 0.34, faceZ - dir * 0.46))
  }
  if (opts.awning){
    const ac = opts.awningColor || 'cloth'
    out.add(ac, box(gw + 0.4, 0.08, depth, x, gy + gh + 0.45, faceZ + dir * (depth / 2 - 0.1), 0))
    /* valance + two support arms */
    out.add(ac, box(gw + 0.4, 0.34, 0.06, x, gy + gh + 0.26, faceZ + dir * (depth - 0.16)))
    for (const s of [-1, 1])
      out.add('metal', box(0.05, 0.05, depth, x + s * gw / 2, gy + gh + 0.42, faceZ + dir * (depth / 2 - 0.1)))
  }
  if (opts.noren){
    /* split fabric curtain: four panels with gaps, over a doorway */
    const nw = gw * 0.42
    for (let i = 0; i < 4; i++)
      out.add('cloth', box(nw / 4 - 0.03, 0.72, 0.04, x - nw / 2 + (i + 0.5) * nw / 4, gy + gh - 0.42, faceZ - dir * 0.36))
    out.add('metal', box(nw + 0.16, 0.05, 0.09, x, gy + gh - 0.06, faceZ - dir * 0.36))
  }
  if (opts.door){
    /* glass entrance door, slightly proud of the reveal */
    out.add('glassCool', box(1.15, 2.15, 0.1, x + gw / 2 - 0.9, 1.2, faceZ - dir * 0.24))
    out.add('metal', box(1.3, 0.1, 0.2, x + gw / 2 - 0.9, 2.34, faceZ - dir * 0.24))
  }
}

function officeEntrance(out, x, z, dir, w, d){
  const faceZ = z + dir * (d / 2)
  out.add('concreteLt', box(3.0, 3.4, 0.5, x, 1.7, faceZ - dir * 0.28))
  out.add('glassCool', box(2.3, 2.5, 0.1, x, 1.45, faceZ - dir * 0.5))
  out.add('metal', box(2.6, 0.14, 0.7, x, 3.5, faceZ + dir * 0.16))
  out.add('metal', box(0.16, 3.0, 0.16, x - 1.4, 1.5, faceZ + dir * 0.3))
  out.add('metal', box(0.16, 3.0, 0.16, x + 1.4, 1.5, faceZ + dir * 0.3))
}

function serviceEntrance(out, x, z, dir, d){
  const faceZ = z + dir * (d / 2)
  out.add('metal', box(1.4, 2.3, 0.14, x, 1.15, faceZ - dir * 0.1))
  out.add('concreteLt', box(1.7, 0.18, 0.5, x, 2.4, faceZ + dir * 0.1))
}

function marketStall(out, x, z, dir, d){
  const faceZ = z + dir * (d / 2)
  /* open-front awning + counter + hanging goods: a market unit, not a shop */
  out.add('cloth', box(3.4, 0.07, 1.7, x, 2.7, faceZ + dir * 0.7))
  out.add('metal', box(3.5, 0.3, 0.06, x, 2.5, faceZ + dir * 1.5))
  out.add('concreteLt', box(3.2, 0.9, 0.7, x, 0.45, faceZ - dir * 0.1))
  out.add('metal', box(3.3, 0.07, 0.85, x, 0.94, faceZ - dir * 0.1))
  for (let i = -2; i <= 2; i++)
    out.add('glassLit', box(0.22, 0.5, 0.22, x + i * 0.62, 2.24, faceZ + dir * 1.4))
  /* crates on the pavement */
  for (let i = 0; i < 3; i++)
    out.add('timber', box(0.5, 0.3, 0.38, x - 1.1 + i * 1.1, 0.15, faceZ + dir * 1.5))
}

/* --------------------------------------------------------------- ROOF ---- */

function parapet(out, x, z, w, d, y, key = 'concreteLt'){
  const t = 0.16, h = 0.62
  out.addAll(key, [
    box(w + t, h, t, x, y + h / 2, z - d / 2 - t / 2),
    box(w + t, h, t, x, y + h / 2, z + d / 2 + t / 2),
    box(t, h, d, x - w / 2 - t / 2, y + h / 2, z),
    box(t, h, d, x + w / 2 + t / 2, y + h / 2, z)
  ])
}

function roofPlant(out, x, z, w, d, y, rng){
  /* water tank on legs — Tokyo's most recognisable rooftop silhouette */
  if (rng() > 0.45){
    out.add('plant', cyl(0.62, 1.05, x + (rng() - 0.5) * w * 0.5, y + 1.5, z + (rng() - 0.5) * d * 0.4, TANK))
    for (let i = -1; i <= 1; i++)
      out.add('metal', box(0.07, 0.95, 0.07, x + (rng() - 0.5) * w * 0.5 + i * 0.4, y + 0.5, z))
  }
  /* duct run + HVAC housing */
  out.add('plant', box(1.5, 0.6, 0.9, x - w * 0.22, y + 0.3, z + d * 0.2))
  out.add('metal', box(0.5, 0.28, 3.0, x + w * 0.25, y + 0.2, z - d * 0.1))
  if (rng() > 0.6)
    out.add('plant', box(1.1, 0.75, 1.1, x + w * 0.3, y + 0.38, z + d * 0.28))
}

function antennaMast(out, x, z, y, h = 3.4){
  out.add('metal', cyl(0.055, h, x, y + h / 2, z, CYL))
  for (let i = 0; i < 3; i++)
    out.add('metal', box(0.5 - i * 0.12, 0.04, 0.04, x, y + h * (0.45 + i * 0.16), z))
  /* aviation light */
  out.add('glassLit', box(0.14, 0.14, 0.14, x, y + h + 0.08, z))
}

/* =========================================================== ARCHETYPES ==
   Eight archetypes. Each returns { height, group, parts } and each owns its
   own vertical rhythm, ground floor, roof and detail language.            */

const FLOOR_HEIGHT = FLOOR

export const ARCHETYPES = {

  /* A. OFFICE MIDRISE — 6–12 floors, repetitive bays, service balconies,
        AC banks, rooftop plant. The Shinjuku / Nishi-Shinjuku workhorse. */
  office(out, M, p, rng){
    const { x, z, w, d, dir } = p
    const floors = p.floors
    const h = floors * FLOOR_HEIGHT + 0.4
    /* base plinth + ground shell */
    out.add('concrete', box(w, h, d, x, h / 2, z))
    out.add('concreteLt', box(w + 0.3, 0.5, d + 0.3, x, 0.25, z))
    officeEntrance(out, x, z, dir, w, d)

    /* facade: a strict grid of bays, both faces */
    const perFloor = Math.max(2, Math.round(w / 1.9))
    const bw = (w / perFloor) * 0.62
    for (let f = 1; f < floors; f++){
      const y = 0.4 + f * FLOOR_HEIGHT + 0.5
      for (let i = 0; i < perFloor; i++){
        const bx = x - w / 2 + (i + 0.5) * w / perFloor
        windowBay(out, M, { face:'front', dir, w, d, y, bw, bh:1.35, inset:0.06,
          lit: rng() > 0.45 ? 'glassLit' : 'glassDark', frame:true })
      }
      /* one service balcony per two floors, offset from the window grid */
      if (f % 2 === 0 && w > 4)
        balcony(out, M, 'front', dir, w, d, x + (rng() - 0.5) * w * 0.3, y - 0.55, z)
      /* side elevation gets fewer, narrower bays */
      windowBay(out, M, { face:'side', dir:1, w, d, y, bw:1.1, bh:1.2, inset:0.05,
        lit: rng() > 0.55 ? 'glassLit' : 'glassDark', frame:false })
    }
    /* AC bank on the flank */
    for (let i = 0; i < 4; i++)
      acUnit(out, x + w / 2 + 0.18, 1.2 + i * FLOOR_HEIGHT, z + (rng() - 0.5) * d * 0.6)

    parapet(out, x, z, w, d, h)
    roofPlant(out, x, z, w, d, h, rng)
    if (rng() > 0.5) antennaMast(out, x + (rng() - 0.5) * w * 0.4, z, h + 0.6, 2.6)
    return h
  },

  /* B. RESIDENTIAL — 3–8 floors, every floor a balcony, AC units on every
        balcony, small recessed entrance, external stairs. */
  residential(out, M, p, rng){
    const { x, z, w, d, dir } = p
    const floors = p.floors
    const h = floors * FLOOR_HEIGHT + 0.3
    out.add('concrete', box(w, h, d, x, h / 2, z))
    out.add('concreteLt', box(w + 0.24, 0.42, d + 0.24, x, 0.21, z))
    serviceEntrance(out, x - w * 0.22, z, dir, d)
    /* intercom column beside the door */
    out.add('metal', box(0.16, 0.7, 0.1, x - w * 0.22 + 0.9, 1.3, z + dir * (d / 2 - 0.16)))

    const perFloor = Math.max(2, Math.round(w / 2.3))
    for (let f = 1; f < floors; f++){
      const y = 0.3 + f * FLOOR_HEIGHT
      /* a continuous balcony band, the defining Japanese apartment read */
      balcony(out, M, 'front', dir, w, d, x, y - 0.1, z)
      for (let i = 0; i < perFloor; i++){
        const bx = x - w / 2 + (i + 0.5) * w / perFloor
        windowBay(out, M, { face:'front', dir, w, d, y: y + 0.55, bw:(w / perFloor) * 0.6,
          bh:1.3, inset:0.04, lit: rng() > 0.4 ? 'glassLit' : 'glassDark', frame:true })
        /* sliding-door mullion: apartments have two panels, not one window */
        out.add('metal', box(0.05, 1.3, 0.07, bx, y + 1.2, z + dir * (d / 2 - 0.02)))
        /* condenser on the balcony rail — where they actually live */
        if (rng() > 0.45) acUnit(out, bx + 0.3, y + 0.5, z + dir * (d / 2 + 0.5))
      }
      /* laundry pole: the detail that says "apartment" instantly */
      if (rng() > 0.5)
        out.add('metal', box(2.0, 0.04, 0.04, x + (rng() - 0.5) * w * 0.4, y + 0.9, z + dir * (d / 2 + 0.8)))
    }
    fireEscape(out, x - w / 2 - 0.2, 1.0 + FLOOR_HEIGHT, z, dir, 1.4)
    parapet(out, x, z, w, d, h)
    roofPlant(out, x, z, w, d, h, rng)
    return h
  },

  /* C. COMMERCIAL — 3–8 floors, deep shopfront, vertical signage, canopies. */
  commercial(out, M, p, rng){
    const { x, z, w, d, dir } = p
    const floors = p.floors
    const gh = 3.4
    const h = floors * FLOOR_HEIGHT + 0.4
    out.add('concrete', box(w, h, d, x, h / 2, z))
    out.add('concreteLt', box(w + 0.3, 0.5, d + 0.3, x, 0.25, z))

    shopfront(out, M, x, z, dir, w, {
      d, h: gh, lit:'glassLit',
      awning: true, awningColor: rng() > 0.5 ? 'cloth' : 'tile',
      door: true, shutter: rng() > 0.55
    })
    /* vertical signboard: a projecting blade, not a flat decal */
    const sx = x + (rng() > 0.5 ? 1 : -1) * (w / 2 - 0.5)
    const sy = gh + 1.4
    out.add('signBoard', box(0.14, 3.2, 0.85, sx, sy, z + dir * (d / 2 + 0.42)))
    out.add('metal', box(0.08, 0.08, 0.5, sx, sy + 1.5, z + dir * (d / 2 + 0.2)))

    /* upper floors: wider glazing, thinner piers — commercial, not office */
    for (let f = 1; f < floors; f++){
      const y = gh + 0.5 + (f - 1) * FLOOR_HEIGHT
      const perFloor = Math.max(2, Math.round(w / 2.4))
      for (let i = 0; i < perFloor; i++){
        const bx = x - w / 2 + (i + 0.5) * w / perFloor
        windowBay(out, M, { face:'front', dir, w, d, y, bw:(w / perFloor) * 0.74, bh:1.7,
          inset:0.02, lit: rng() > 0.4 ? 'glassLit' : 'glassDark', frame:false })
      }
      /* a canopy every other floor breaks the flat wall */
      if (f % 2 === 0)
        out.add('tile', box(w * 0.9, 0.07, 0.6, x, y - 0.2, z + dir * (d / 2 + 0.3)))
    }
    /* ducting running up the flank */
    for (let f = 0; f < floors; f++)
      out.add('metal', box(0.34, FLOOR_HEIGHT * 0.9, 0.34, x - w / 2 - 0.24, 0.6 + f * FLOOR_HEIGHT, z + d * 0.3))
    parapet(out, x, z, w, d, h)
    roofPlant(out, x, z, w, d, h, rng)
    return h
  },

  /* D. HIGHRISE — 15+ floors, curtain wall, deep piers, big plant, mast. */
  highrise(out, M, p, rng){
    const { x, z, w, d, dir } = p
    const floors = p.floors
    const h = floors * FLOOR_HEIGHT
    out.add('concrete', box(w, h, d, x, h / 2, z))
    out.add('concreteLt', box(w + 0.5, 1.1, d + 0.5, x, 0.55, z))
    officeEntrance(out, x, z, dir, w, d)

    /* curtain wall: continuous horizontal ribbon per floor, with a
       mechanical floor every eight floors */
    const perFloor = Math.max(3, Math.round(w / 1.5))
    for (let f = 1; f < floors; f++){
      const y = 1.1 + f * FLOOR_HEIGHT
      const mech = f % 8 === 0
      if (mech){
        /* mechanical band: solid, darker, with louvres */
        out.add('metal', box(w + 0.16, FLOOR_HEIGHT * 0.8, d + 0.16, x, y + FLOOR_HEIGHT * 0.4, z))
        for (let i = 0; i < 6; i++)
          out.add('plant', box(w * 0.9, 0.1, 0.1, x, y + 0.5 + i * 0.32, z + dir * (d / 2 + 0.1)))
      } else {
        for (let i = 0; i < perFloor; i++){
          const bx = x - w / 2 + (i + 0.5) * w / perFloor
          windowBay(out, M, { face:'front', dir, w, d, y: y + 0.25, bw:(w / perFloor) * 0.88,
            bh:FLOOR_HEIGHT * 0.62, inset:0.02,
            lit: rng() > 0.55 ? 'glassCool' : 'glassDark', frame:false })
        }
        /* the flanking piers are what make a tower read as structure */
        out.add('concrete', box(0.5, FLOOR_HEIGHT, 0.4, x - w / 2 + 0.25, y + FLOOR_HEIGHT / 2, z + dir * (d / 2 + 0.06)))
        out.add('concrete', box(0.5, FLOOR_HEIGHT, 0.4, x + w / 2 - 0.25, y + FLOOR_HEIGHT / 2, z + dir * (d / 2 + 0.06)))
      }
    }
    /* setback: the top two floors pull in, so the tower tapers */
    const sw = w * 0.78, sd = d * 0.78
    out.add('concrete', box(sw, FLOOR_HEIGHT * 2, sd, x, h + FLOOR_HEIGHT, z))
    for (let f = 0; f < 2; f++)
      for (let i = 0; i < perFloor; i++){
        const bx = x - sw / 2 + (i + 0.5) * sw / perFloor
        windowBay(out, M, { face:'front', dir, w:sw, d:sd, y: h + FLOOR_HEIGHT * f + 1.0,
          bw:(sw / perFloor) * 0.85, bh:1.7, inset:0.02, lit:'glassCool', frame:false })
      }
    parapet(out, x, z, sw, sd, h + FLOOR_HEIGHT * 2)
    roofPlant(out, x, z, sw, sd, h + FLOOR_HEIGHT * 2, rng)
    antennaMast(out, x, z, h + FLOOR_HEIGHT * 2 + 0.6, 4.5)
    return h
  },

  /* E. TRADITIONAL LOWRISE — 1–3 floors, pitched tile roof, timber lattice,
        noren, lanterns. Asakusa, temple approach, old market street. */
  traditional(out, M, p, rng){
    const { x, z, w, d, dir } = p
    const floors = p.floors
    const h = floors * FLOOR_HEIGHT + 0.2
    out.add('timber', box(w, h, d, x, h / 2, z))
    out.add('concreteLt', box(w + 0.36, 0.55, d + 0.36, x, 0.27, z))
    /* ground floor is a shop with a noren, not glazing */
    shopfront(out, M, x, z, dir, w, {
      d, h:2.9, lit:'glassLit', noren: true, awning: false, door: true
    })
    /* shoji-style upper lattice: a grid of small timber members */
    const rows = 3, cols = 5
    for (let f = 1; f < floors; f++){
      const y = 2.9 + f * FLOOR_HEIGHT - 0.6
      for (let r = 0; r < rows; r++)
        out.add('timber', box(w * 0.86, 0.07, 0.12, x, y + r * 0.72, z + dir * (d / 2 + 0.05)))
      for (let cIdx = 0; cIdx <= cols; cIdx++)
        out.add('timber', box(0.08, rows * 0.72, 0.1, x - w * 0.43 + cIdx * w * 0.86 / cols, y + rows * 0.36, z + dir * (d / 2 + 0.05)))
      /* a lit paper panel behind the lattice */
      out.add('glassLit', box(w * 0.84, rows * 0.68, 0.05, x, y + rows * 0.36, z + dir * (d / 2 - 0.02)))
    }
    /* the pitched roof is the whole silhouette here. Traditional eaves
       overhang, but not by a fifth of the whole building. */
    out.add('roofTile', hipRoof(w * 1.09, d * 1.09, h + 0.55, x, z))
    out.add('timber', box(w * 1.14, 0.12, d * 1.14, x, h + 0.16, z))
    /* hanging lantern under the eave */
    out.add('glassLit', cyl(0.13, 0.26, x + w * 0.3, h - 0.35, z + dir * (d / 2 + 0.5)))
    return h + 1.1
  },

  /* F. MARKET BUILDING — open frontage, awning, service/loading detail. */
  market(out, M, p, rng){
    const { x, z, w, d, dir } = p
    const floors = p.floors
    const h = floors * FLOOR_HEIGHT + 0.3
    out.add('concrete', box(w, h, d, x, h / 2, z))
    out.add('concreteLt', box(w + 0.34, 0.5, d + 0.34, x, 0.25, z))
    marketStall(out, x, z, dir, d)
    /* service door to the side, with a roller shutter */
    serviceEntrance(out, x + w / 2 - 0.9, z, dir, d)
    out.add('metal', box(1.3, 2.2, 0.1, x + w / 2 - 0.9, 1.1, z + dir * (d / 2 - 0.02)))
    /* upper floors: plain utilitarian glazing, small windows, big vents */
    for (let f = 1; f < floors; f++){
      const y = 3.2 + (f - 1) * FLOOR_HEIGHT
      const perFloor = Math.max(2, Math.round(w / 2.8))
      for (let i = 0; i < perFloor; i++){
        const bx = x - w / 2 + (i + 0.5) * w / perFloor
        windowBay(out, M, { face:'front', dir, w, d, y, bw:(w / perFloor) * 0.5, bh:1.1,
          inset:0.08, lit: rng() > 0.5 ? 'glassLit' : 'glassDark', frame:true })
      }
      out.add('plant', box(0.9, 0.5, 0.5, x - w * 0.3, y + 1.9, z + dir * (d / 2 + 0.15)))
    }
    parapet(out, x, z, w, d, h)
    /* market roofs are working roofs: extract fans, water, crates */
    roofPlant(out, x, z, w, d, h, rng)
    for (let i = 0; i < 3; i++)
      out.add('timber', box(0.6, 0.4, 0.45, x - w * 0.3 + i * 0.9, h + 0.2, z + d * 0.25))
    return h
  },

  /* G. LUXURY RETAIL — stone/metal, recessed glazed frontage, clean lines.
        Ginza and Roppongi: wide bays, few mullions, no clutter. */
  luxe(out, M, p, rng){
    const { x, z, w, d, dir } = p
    const floors = p.floors
    const gh = 4.2
    const h = floors * FLOOR_HEIGHT + 0.6
    out.add('plaster', box(w, h, d, x, h / 2, z))
    /* stone base course */
    out.add('concreteLt', box(w + 0.4, 0.9, d + 0.4, x, 0.45, z))
    /* deep recessed glazed frontage, flush door — no shutter, no clutter */
    out.add('concrete', box(w * 0.94, gh + 0.5, 0.7, x, (gh + 0.5) / 2, z + dir * (d / 2 - 0.4)))
    out.add('glassLit', box(w * 0.86, gh, 0.08, x, gh / 2 + 0.15, z + dir * (d / 2 - 0.68)))
    for (let i = 1; i < 4; i++)
      out.add('metal', box(0.1, gh, 0.16, x - w * 0.43 + i * w * 0.86 / 4, gh / 2 + 0.15, z + dir * (d / 2 - 0.66)))
    out.add('metal', box(1.5, 0.12, 0.9, x + w * 0.22, gh + 0.42, z + dir * (d / 2 + 0.3)))
    for (const s of [-1, 1])
      out.add('metal', box(0.08, 0.08, 0.8, x + w * 0.22 + s * 0.6, gh + 0.4, z + dir * (d / 2 + 0.3)))
    /* upper floors: tall stone piers with recessed windows between */
    for (let f = 1; f < floors; f++){
      const y = gh + 0.6 + (f - 1) * FLOOR_HEIGHT
      const bays = Math.max(2, Math.round(w / 3.0))
      for (let i = 0; i <= bays; i++)
        out.add('plaster', box(0.34, FLOOR_HEIGHT * 0.92, 0.28,
          x - w / 2 + i * w / bays, y + FLOOR_HEIGHT * 0.46, z + dir * (d / 2 + 0.06)))
      for (let i = 0; i < bays; i++){
        const bx = x - w / 2 + (i + 0.5) * w / bays
        windowBay(out, M, { face:'front', dir, w, d, y: y + 0.5, bw:(w / bays) * 0.66,
          bh:1.8, inset:0.22, lit: rng() > 0.35 ? 'glassLit' : 'glassDark', frame:false })
      }
    }
    parapet(out, x, z, w, d, h, 'plaster')
    /* clean roof: minimal plant, one mast */
    out.add('plant', box(1.6, 0.7, 1.0, x + w * 0.2, h + 0.35, z))
    if (rng() > 0.5) antennaMast(out, x - w * 0.2, z, h + 0.6, 2.2)
    return h
  },

  /* H. NIGHTLIFE — narrow frontage, stacked signage, tiny entrances. */
  nightlife(out, M, p, rng){
    const { x, z, w, d, dir } = p
    const floors = p.floors
    const gh = 3.6
    const h = floors * FLOOR_HEIGHT + 0.4
    out.add('concrete', box(w, h, d, x, h / 2, z))
    out.add('concreteLt', box(w + 0.28, 0.46, d + 0.28, x, 0.23, z))
    /* a recessed door, not a shopfront: this is an entrance to a building */
    officeEntrance(out, x, z, dir, w, d)
    out.add('metal', box(1.0, 2.3, 0.1, x - w * 0.24, 1.15, z + dir * (d / 2 - 0.02)))

    /* stacked blade signs, one per floor, projecting further as they rise */
    for (let f = 0; f < floors; f++){
      const y = gh + f * FLOOR_HEIGHT * 0.92
      const proj = 0.5 + f * 0.16
      const sxx = x + (w / 2 - 0.35)
      out.add('signBoard', box(0.12, 0.62, proj * 1.9, sxx, y, z + dir * (d / 2 + proj)))
      out.add('glassLit', box(0.06, 0.42, proj * 1.7, sxx + dir * 0.04, y, z + dir * (d / 2 + proj)))
      out.add('metal', box(0.1, 0.07, proj, sxx, y + 0.36, z + dir * (d / 2 + proj * 0.5)))
    }
    /* a continuous lightbox band at first-floor level */
    out.add('signBoard', box(w * 0.9, 0.7, 0.14, x, gh + 0.5, z + dir * (d / 2 + 0.12)))
    out.add('glassLit', box(w * 0.86, 0.5, 0.08, x, gh + 0.5, z + dir * (d / 2 + 0.2)))

    /* small punched windows above */
    for (let f = 1; f < floors; f++){
      const y = gh + 1.4 + f * FLOOR_HEIGHT * 0.92
      const bays = Math.max(1, Math.round(w / 2.6))
      for (let i = 0; i < bays; i++){
        const bx = x - w / 2 + (i + 0.5) * w / bays
        windowBay(out, M, { face:'front', dir, w, d, y, bw:(w / bays) * 0.5, bh:1.0,
          inset:0.14, lit: rng() > 0.35 ? 'glassLit' : 'glassDark', frame:true })
      }
    }
    parapet(out, x, z, w, d, h)
    roofPlant(out, x, z, w, d, h, rng)
    return h
  }
}

/* --------------------------------------------------- DISTRICT PROFILES --
   Which archetypes a district uses, with weight. Proportions (w, d,
   floors) come from the same profile so districts differ in massing as
   well as in style.                                              */
export const DISTRICT_PROFILES = {
  shinjuku:      { picks:[['highrise',3],['nightlife',3],['commercial',2],['office',2]],
                    w:[5,9],   d:[5,8],   floors:[12,26] },
  nishishinjuku: { picks:[['office',3],['nightlife',3],['commercial',2]],
                    w:[4,7],   d:[4,7],   floors:[6,14] },
  harajuku:      { picks:[['commercial',3],['luxe',1],['residential',1]],
                    w:[4,7],   d:[4,6],   floors:[3,8] },
  shibuya:       { picks:[['highrise',2],['commercial',3],['nightlife',2],['office',1]],
                    w:[5,9],   d:[5,8],   floors:[8,20] },
  nakameguro:    { picks:[['residential',3],['luxe',1],['market',1]],
                    w:[3.5,6], d:[4,6],   floors:[3,7] },
  roppongi:      { picks:[['luxe',3],['highrise',2],['office',1],['nightlife',1]],
                    w:[5,8],   d:[5,8],   floors:[6,15] },
  ginza:         { picks:[['luxe',3],['commercial',2],['office',1],['highrise',1]],
                    w:[6,10],  d:[6,9],   floors:[4,11] },
  tsukiji:       { picks:[['market',3],['traditional',2],['office',1],['residential',1]],
                    w:[4,8],   d:[4,7],   floors:[2,6] },
  akihabara:     { picks:[['commercial',3],['nightlife',2],['office',2]],
                    w:[4,7],   d:[4,7],   floors:[5,13] },
  asakusa:       { picks:[['traditional',3],['market',2],['residential',2]],
                    w:[3.5,6.5], d:[4,6], floors:[1,3] },
  /* ODAIBA — waterfront: big modern blocks, wide footprints, few floors.
     Horizontal rather than vertical, which is the whole point of Odaiba. */
  odaiba:        { picks:[['luxe',3],['office',2],['commercial',1]],
                    w:[10,18], d:[8,14],  floors:[3,8] }
}

/* weighted pick from a profile. Exported so the street layout can choose
   an archetype per plot without duplicating the weighting. */
export function pickArchetype(profile, rng){
  const total = profile.picks.reduce((s, p) => s + p[1], 0)
  let r = rng() * total
  for (const [name, wgt] of profile.picks){
    r -= wgt
    if (r <= 0) return name
  }
  return profile.picks[0][0]
}

/* deterministic RNG so a seeded shot reproduces exactly */
export function mulberry(seed){
  let a = seed >>> 0
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ---------------------------------------------------------------- BUILD --
   Build ONE building. Returns the group and its height, so callers can
   place rooftop props, register hover volumes, or skip it. */
export function buildBuilding(opts){
  const {
    x, z, dir = -1, district, seed = 1,
    materials, parent, profile, archetype
  } = opts

  const M = materials
  const rng = mulberry(seed)
  const prof = profile || DISTRICT_PROFILES[district] || DISTRICT_PROFILES.shinjuku
  const name = archetype || pickArchetype(prof, rng)

  const w = prof.w[0] + rng() * (prof.w[1] - prof.w[0])
  const d = prof.d[0] + rng() * (prof.d[1] - prof.d[0])
  const floors = Math.round(prof.floors[0] + rng() * (prof.floors[1] - prof.floors[0]))

  const parts = new Parts()
  const h = ARCHETYPES[name](parts, M, { x, z, w, d, dir, floors }, rng)

  const group = new THREE.Group()
  group.position.set(0, 0, 0)
  group.userData = { type:'building', archetype: name, district, height: h, floors, w, d, x, z }
  const meshes = parts.commit(group, M)
  group.userData.meshes = meshes
  parent.add(group)
  return { group, height: h, archetype: name, floors, w, d }
}