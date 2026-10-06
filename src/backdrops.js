/* ==========================================================================
   DISTRICT BACKDROPS
   --------------------------------------------------------------------------
   Generic boxes behind the street read as "a city". What actually tells
   you where you are, from the far side of the road, is the thing each
   district is KNOWN for. So each district gets its own signature:

     ASAKUSA    five-tier pagoda, the great gate, tiled roofs, Fuji behind
     HARAJUKU   the shrine forest - a mass of tall dark trees
     SHINJUKU   towers with billboard crowns
     SHIBUYA    screen walls and stacked signage
     AKIHABARA  dense mid-rise with aerial clutter
     GINZA      low elegant blocks and a clock tower
     TSUKIJI    low market sheds, crates and extract fans
     NAKAMEGURO low-rise and trees
     ROPPONGI   the hill, with Tokyo Tower on it
     ODAIBA     the bay, the bridge and the skyline across the water

   Everything is built at the origin and placed, uses shared geometry, and
   is kept behind the street frontage so nothing ever enters the road.
   ========================================================================== */

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const BOX = new THREE.BoxGeometry(1, 1, 1)
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 8)
const CONE = new THREE.ConeGeometry(0.5, 1, 10)

function box(w, h, d, x, y, z){ const g = BOX.clone(); g.scale(w, h, d); g.translate(x, y, z); return g }
function cyl(r, h, x, y, z){ const g = CYL.clone(); g.scale(r, h, r); g.translate(x, y, z); return g }
function cone(r, h, x, y, z){ const g = CONE.clone(); g.scale(r, h, r); g.translate(x, y, z); return g }

/* colour sets, kept dark so they read as silhouette against the sky */
export function makeBackdropMaterials(){
  return {
    mass:   new THREE.MeshBasicMaterial({ color: 0x161c26 }),   /* dark mass */
    massLt: new THREE.MeshBasicMaterial({ color: 0x1e2632 }),
    roof:   new THREE.MeshBasicMaterial({ color: 0x2a2018 }),   /* tile */
    wood:   new THREE.MeshBasicMaterial({ color: 0x3a281a }),
    leaf:   new THREE.MeshBasicMaterial({ color: 0x22301f }),   /* forest */
    leafLt: new THREE.MeshBasicMaterial({ color: 0x2b3a26 }),
    screen: new THREE.MeshBasicMaterial({ color: 0x0d1420 }),   /* lit panel */
    glowA:  new THREE.MeshBasicMaterial({ color: 0x7fd4ff }),
    glowB:  new THREE.MeshBasicMaterial({ color: 0xff2e88 }),
    glowC:  new THREE.MeshBasicMaterial({ color: 0xffe95a }),
    metal:  new THREE.MeshBasicMaterial({ color: 0x22262e }),
    hill:   new THREE.MeshBasicMaterial({ color: 0x141a22 }),
    vermilion: new THREE.MeshBasicMaterial({ color: 0xa8341f })
  }
}

/* --------------------------------------------------------- the pagoda ----
   Five shrinking tiers with a finial: the single most recognisable
   silhouette in eastern Tokyo. */
function pagoda(M, floors = 5){
  const parts = []
  let y = 0, w = 9
  for (let i = 0; i < floors; i++){
    const h = 4.2
    /* body */
    parts.push({ m: 'wood', g: box(w * 0.72, h, w * 0.72, 0, y + h / 2, 0) })
    /* balcony rail */
    parts.push({ m: 'wood', g: box(w * 0.86, 0.3, w * 0.86, 0, y + h, 0) })
    /* the sweeping tiled roof, with a slight upturn suggested by a
       second, wider slab */
    parts.push({ m: 'roof', g: cone(w * 0.62, 1.9, 0, y + h + 0.95, 0) })
    parts.push({ m: 'roof', g: box(w * 1.16, 0.28, w * 1.16, 0, y + h + 0.16, 0) })
    y += h + 1.9
    w *= 0.86
  }
  /* the sorin: a stacked mast on top */
  parts.push({ m: 'metal', g: cyl(0.22, 5.5, 0, y + 2.4, 0) })
  for (let i = 0; i < 4; i++)
    parts.push({ m: 'metal', g: cyl(0.85 - i * 0.13, 0.22, 0, y + 1.1 + i * 1.0, 0) })
  parts.push({ m: 'glowC', g: new THREE.SphereGeometry(0.4, 8, 6).translate(0, y + 5.4, 0) })
  return parts
}

/* ------------------------------------------------- the great temple gate -
   Kaminarimon: two storeys, one enormous lantern in the middle. */
function greatGate(M){
  const p = []
  p.push({ m: 'wood', g: box(16, 9, 5, 0, 4.5, 0) })
  p.push({ m: 'wood', g: box(13, 5.5, 4.4, 0, 11.6, 0) })
  /* the hipped roof, in two tiers */
  p.push({ m: 'roof', g: cone(11.5, 3.4, 0, 15.2, 0) })
  p.push({ m: 'roof', g: cone(9.5, 3.0, 0, 18.6, 0) })
  /* the lantern: the biggest in the city, lit from inside */
  p.push({ m: 'glowC', g: cyl(1.5, 3.0, 0, 9.5, 2.9) })
  p.push({ m: 'metal', g: cyl(1.62, 0.3, 0, 11.1, 2.9) })
  p.push({ m: 'metal', g: cyl(1.62, 0.3, 0, 7.9, 2.9) })
  /* flanking lanterns */
  p.push({ m: 'glowC', g: cyl(0.7, 1.4, -5.5, 8.4, 2.9) })
  p.push({ m: 'glowC', g: cyl(0.7, 1.4, 5.5, 8.4, 2.9) })
  /* the two guardian statues */
  for (const s of [-1, 1]){
    p.push({ m: 'wood', g: box(1.5, 3.2, 1.5, s * 10.5, 1.6, 3.2) })
    p.push({ m: 'wood', g: cyl(0.5, 0.6, s * 10.5, 3.5, 3.2) })
  }
  return p
}

/* --------------------------------------------------------------- forest --
   The Meiji shrine woods: a mass of tall trunks with dark canopies, seen
   as a single green-black block of trees behind low buildings. */
function forest(M, count = 26, spread = 40){
  const p = []
  for (let i = 0; i < count; i++){
    const a = (i / count) * Math.PI * 2
    const r = 8 + ((i * 37) % 100) / 100 * spread
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r * 0.7
    const h = 9 + ((i * 53) % 100) / 100 * 9
    p.push({ m: 'wood', g: cyl(0.28, h * 0.5, x, h * 0.25, z) })
    p.push({ m: i % 3 ? 'leaf' : 'leafLt',
             g: cone(2.4 + (i % 4) * 0.5, h * 0.62, x, h * 0.72, z) })
  }
  return p
}

/* ------------------------------------------------------------ billboards -
   Rooftop and wall-mounted advertising: the frame, the lit face and a
   gantry. This is what makes Shinjuku, Shibuya and Akihabara read. */
function billboards(M, seed = 1, count = 6){
  const p = []
  let s = seed
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
  const cols = ['screen', 'glowA', 'glowB', 'glowC']
  for (let i = 0; i < count; i++){
    const x = (i - (count - 1) / 2) * (9 + rnd() * 7)
    const y = 12 + rnd() * 26
    const z = (rnd() - 0.5) * 16
    const w = 4 + rnd() * 5, h = 3 + rnd() * 6
    /* support frame */
    p.push({ m: 'metal', g: box(0.3, h + 1.4, 0.3, x - w / 2, y + (h + 1.4) / 2 - h, z) })
    p.push({ m: 'metal', g: box(0.3, h + 1.4, 0.3, x + w / 2, y + (h + 1.4) / 2 - h, z) })
    p.push({ m: 'metal', g: box(w + 0.7, 0.3, 0.3, x, y + h / 2 + 1.0, z) })
    /* the lit face, and a dark frame around it */
    p.push({ m: 'screen', g: box(w + 0.5, h + 0.5, 0.4, x, y + h / 2, z) })
    p.push({ m: cols[(rnd() * cols.length) | 0], g: box(w, h, 0.2, x, y + h / 2, z + 0.3) })
  }
  return p
}

/* ---------------------------------------------------------- clock tower --
   The department store clock: a square tower, a lit face on all four
   sides, and a small cupola. */
function clockTower(M){
  const p = []
  p.push({ m: 'massLt', g: box(11, 34, 11, 0, 17, 0) })
  p.push({ m: 'mass', g: box(12.4, 1.2, 12.4, 0, 34.6, 0) })
  /* the clock stage, glazed on all four faces */
  p.push({ m: 'glowA', g: box(7.4, 7.4, 7.4, 0, 39.5, 0) })
  for (const s of [-1, 1]){
    p.push({ m: 'metal', g: box(8.2, 0.5, 0.5, 0, 39.5, s * 3.8) })
    p.push({ m: 'metal', g: box(0.5, 0.5, 8.2, s * 3.8, 39.5, 0) })
  }
  /* cupola */
  p.push({ m: 'roof', g: cone(6.4, 4.0, 0, 45.2, 0) })
  p.push({ m: 'metal', g: cyl(0.16, 4.5, 0, 49.2, 0) })
  return p
}

/* ------------------------------------------------------------ market row -
   Tsukiji: low sheds, roof extract fans, stacked crates and awnings. */
function marketRow(M, seed = 7){
  const p = []
  let s = seed
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
  for (let i = 0; i < 7; i++){
    const x = (i - 3) * (7 + rnd() * 3)
    const h = 4.5 + rnd() * 3.5
    const w = 6 + rnd() * 4
    p.push({ m: 'massLt', g: box(w, h, 9, x, h / 2, (rnd() - 0.5) * 8) })
    /* a shallow awning over the front */
    p.push({ m: 'metal', g: box(w + 0.6, 0.16, 2.4, x, h - 0.4, 5.2) })
    /* extract fans on the roof: the working-market tell */
    for (let f = 0; f < 2; f++)
      p.push({ m: 'metal', g: cyl(0.6, 0.5, x - w / 3 + f * (w / 1.6), h + 0.25, (rnd() - 0.5) * 4) })
    /* crates stacked outside */
    for (let c = 0; c < 3; c++)
      p.push({ m: 'wood', g: box(1.1, 0.7, 0.9, x - 2 + c * 1.3, 0.35, 6.4) })
  }
  return p
}

/* ---------------------------------------------------------- a low block -
   Ginza and Nakameguro: elegant, low, wide-fronted, with a stone base. */
function lowBlock(M, seed = 3){
  const p = []
  let s = seed
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
  for (let i = 0; i < 5; i++){
    const x = (i - 2) * (12 + rnd() * 6)
    const h = 8 + rnd() * 7
    const w = 10 + rnd() * 5
    p.push({ m: 'massLt', g: box(w, h, 14, x, h / 2, (rnd() - 0.5) * 10) })
    /* stone base course */
    p.push({ m: 'mass', g: box(w + 0.5, 1.6, 14.5, x, 0.8, 0) })
    /* a cornice */
    p.push({ m: 'mass', g: box(w + 0.8, 0.7, 14.8, x, h + 0.3, 0) })
    /* lit windows in a regular band */
    for (let k = 0; k < 3; k++)
      p.push({ m: 'screen', g: box(w * 0.72, 1.1, 0.2, x, 2.6 + k * 2.1, 7.1) })
  }
  return p
}

/* ------------------------------------------------------------ the hill --
   Roppongi sits on a rise; Tokyo Tower stands on top of it. */
function hill(M){
  const p = []
  p.push({ m: 'hill', g: cone(58, 20, 0, 6, -6, -46) })
  p.push({ m: 'hill', g: cone(40, 14, -46, 5, -5, -60) })
  return p
}

/* ---------------------------------------------------------------- build --
   Places one backdrop group behind the street. `z` is the district's
   stretch of street; everything is kept well beyond the frontage line so
   it can never appear in the carriageway. */
export function buildBackdrops(opts){
  const { parent, materials: M, districtAtZ, side, materials2 } = opts
  const side2 = side === undefined ? 1 : side
  const out = new THREE.Group()
  const built = {}

  const place = (parts, z, xOff = 0, yBase = 0) => {
    const bins = new Map()
    parts.forEach(p => {
      if (!bins.has(p.m)) bins.set(p.m, [])
      bins.get(p.m).push(p.g)
    })
    const g = new THREE.Group()
    for (const [k, list] of bins){
      const merged = mergeGeometries(list, false)
      if (!merged) continue
      merged.computeBoundingSphere()
      const m = new THREE.Mesh(merged, M[k] || M.mass)
      m.matrixAutoUpdate = false
      g.add(m)
      list.forEach(x => x.dispose())
    }
    g.position.set(side2 * xOff, yBase, z)
    g.rotation.y = side2 > 0 ? -Math.PI / 2 : Math.PI / 2
    out.add(g)
    return g
  }

  /* Each district: what it is actually known for, seen from the road. */
  built.asakusa = [
    place(pagoda(M), -128, 46, 0),
    place(greatGate(M), -136, 44, 0),
    place(lowBlock(M, 9), -122, 40, 0)
  ]
  built.harajuku = [
    place(forest(M, 30, 46), -34, 48, 0),
    place(lowBlock(M, 5), -30, 40, 0)
  ]
  built.shinjuku = [
    place(billboards(M, 11, 8), 0, 44, 0),
    place(lowBlock(M, 2), 4, 38, 0)
  ]
  built.shibuya = [
    place(billboards(M, 23, 7), -47, 44, 0),
    place(lowBlock(M, 13), -43, 38, 0)
  ]
  built.akihabara = [
    place(billboards(M, 31, 6), -118, 42, 0),
    place(lowBlock(M, 17), -114, 37, 0)
  ]
  built.ginza = [
    place(clockTower(M), -89, 48, 0),
    place(lowBlock(M, 29), -93, 40, 0)
  ]
  built.tsukiji = [
    place(marketRow(M), -103, 42, 0)
  ]
  built.nakameguro = [
    place(lowBlock(M, 41), -62, 38, 0)
  ]
  built.roppongi = [
    place(hill(M), -76, 40, 0),
    place(lowBlock(M, 37), -72, 36, 0)
  ]
  built.odaiba = [
    place(lowBlock(M, 43), -152, 42, 0)
  ]

  parent.add(out)
  const stats = {}
  for (const k in built) stats[k] = built[k].length
  void materials2
  return { group: out, districts: Object.keys(stats), parts: stats }
}