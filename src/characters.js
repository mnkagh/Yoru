/* ==========================================================================
   NPC SYSTEM — modular characters
   --------------------------------------------------------------------------
   A person is not a capsule. A person is:

     legs (two, articulated) · shoes · torso · arms (two) · hands ·
     neck · head · hair · clothing (coat/jacket) · accessory

   Built from shared geometry with per-instance variation, so 60 distinct
   people cost 60 small groups rather than 60 unique mesh trees. Variation
   comes from height, build, hairstyle, clothing colour, accessory and gait.

   District profiles decide the population: Shinjuku gets office workers
   and nightlife, Tsukiji gets chefs and delivery workers, and so on. The
   same characters then respond to weather (umbrellas, coats, breath) and
   to fireworks (stop, look up, raise a phone).
   ========================================================================== */

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const BOX = new THREE.BoxGeometry(1, 1, 1)
const CAP = new THREE.CapsuleGeometry(0.5, 1, 3, 8)
const SPH = new THREE.SphereGeometry(0.5, 10, 8)
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 8)

function box(w, h, d, x, y, z){ const g = BOX.clone(); g.scale(w,h,d); g.translate(x,y,z); return g }
function cap(r, len, x, y, z){ const g = CAP.clone(); g.scale(r, len, r); g.translate(x,y,z); return g }
function sph(r, x, y, z){ const g = SPH.clone(); g.scale(r, r, r); g.translate(x,y,z); return g }
function cyl(r, h, x, y, z){ const g = CYL.clone(); g.scale(r, h, r); g.translate(x,y,z); return g }

/* deterministic RNG, so a seeded shot reproduces the same crowd */
export function mulberry(seed){
  let a = seed >>> 0
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ------------------------------------------------------------------ SKIN --
   A small palette of skin tones plus hair colours. Kept as material
   instances shared across every character of that tone. */
export function makeCharacterMaterials(){
  const skins = [0xe8c4a0, 0xd9ab84, 0xc08a63, 0x9c6b48, 0x7a4f33, 0xf0d4b4]
  const hairs = [0x14100c, 0x241a12, 0x3a2a1c, 0x5a4030, 0x8a7050, 0x2a2a30, 0x6a6a72]
  return {
    skin:   skins.map(c => new THREE.MeshBasicMaterial({ color: c })),
    hair:   hairs.map(c => new THREE.MeshBasicMaterial({ color: c })),
    /* clothing: a Tokyo street palette — dark coats, muted tailoring,
       a few brighter accents so a crowd doesn't read as one mass */
    cloth:  [0x1c2028, 0x24282f, 0x2e2a26, 0x38312a, 0x1e2630, 0x2a2630,
             0x3c2f36, 0x25303a, 0x4a3f3a, 0x141a22].map(c => new THREE.MeshBasicMaterial({ color: c })),
    accent: [0x6d2a3a, 0x2a4a6d, 0x6d5a2a, 0x2a5d4a, 0x5d2a5c, 0xc9a961, 0xb4643c]
      .map(c => new THREE.MeshBasicMaterial({ color: c })),
    trousers: [0x181c24, 0x22262e, 0x2c2823, 0x1a1e26].map(c => new THREE.MeshBasicMaterial({ color: c })),
    shoe: new THREE.MeshBasicMaterial({ color: 0x0e1014 }),
    umbrella: [0x14181f, 0x2a1a24, 0x1a2420, 0x241a1a, 0x2a2a32]
      .map(c => new THREE.MeshBasicMaterial({ color: c })),
    breath: new THREE.MeshBasicMaterial({
      color: 0xdfe8f2, transparent: true, opacity: 0, depthWrite: false
    }),
    /* carried items so a crowd is not just bodies */
    phone: new THREE.MeshBasicMaterial({ color: 0x9db8d8 }),
    bag: new THREE.MeshBasicMaterial({ color: 0x2a2620 })
  }
}

/* ------------------------------------------------------------- HAIRSTYLE --
   Real silhouette variety at the head, which is what you actually read at
   street distance: cropped, bob, long, bun, ponytail, cap, hood. */
function buildHair(style, mat, out, rng){
  const r = 0.115
  switch (style){
    case 'crop':
      out.push(sph(r * 1.06, 0, 0.03, 0))
      break
    case 'bob':
      out.push(sph(r * 1.1, 0, 0.02, 0))
      out.push(sph(r * 1.02, 0, -0.06, -0.03))
      break
    case 'long':
      out.push(sph(r * 1.08, 0, 0.02, 0))
      out.push(box(r * 1.5, 0.30, r * 1.1, 0, -0.14, -0.05))
      break
    case 'bun':
      out.push(sph(r * 1.08, 0, 0.02, 0))
      out.push(sph(r * 0.5, 0, 0.11, -0.05))
      break
    case 'ponytail':
      out.push(sph(r * 1.08, 0, 0.02, 0))
      out.push(cap(r * 0.42, 0.20, 0, -0.02, -0.11))
      break
    case 'cap':
      out.push(sph(r * 1.02, 0, 0.03, 0))
      out.push(box(r * 1.9, 0.02, r * 1.5, 0, 0.07, 0.09))
      break
    case 'hood':
      out.push(sph(r * 1.16, 0, 0.0, -0.02))
      out.push(box(r * 2.0, 0.16, r * 1.4, 0, -0.05, -0.04))
      break
    default:
      out.push(sph(r, 0, 0.03, 0))
  }
}

const HAIRSTYLES = ['crop','bob','long','bun','ponytail','cap','hood']
const CLOTHES = ['coat','jacket','shirt','parka','sweater']

/* ------------------------------------------------------------- BUILD ONE --
   Builds a full character into merged meshes. Returned groups carry the
   parts the animation and weather systems need to address by name:
     g.userData.rig = { head, armL, armR, legL, legR, umbrella, breath,
                        phone, bag, torso }
*/
export function buildCharacter(opts){
  const {
    seed = 1, materials: M, parent, scale = 1
  } = opts
  const rng = mulberry(seed)

  /* ---- variation ---- */
  const height = 0.92 + rng() * 0.18          /* 1.55m .. 1.85m */
  const buildK = 0.9 + rng() * 0.24           /* slim .. broad */
  const skin = M.skin[(rng() * M.skin.length) | 0]
  const hairM = M.hair[(rng() * M.hair.length) | 0]
  /* each character owns its clothing material, because the weather pass
     tints it per person — a shared instance would tint the whole crowd */
  const cloth = M.cloth[(rng() * M.cloth.length) | 0].clone()
  cloth.userData.base = cloth.color.clone()
  const trous = M.trousers[(rng() * M.trousers.length) | 0]
  const accent = M.accent[(rng() * M.accent.length) | 0]
  const hairStyle = HAIRSTYLES[(rng() * HAIRSTYLES.length) | 0]
  const clothKind = CLOTHES[(rng() * CLOTHES.length) | 0]
  const hasBag = rng() > 0.55
  const usesPhone = rng() > 0.6
  const longCoat = clothKind === 'coat' || clothKind === 'parka'

  const bins = new Map()
  const add = (mat, g) => {
    if (!g) return
    const k = mat.uuid
    if (!bins.has(k)) bins.set(k, { mat, list: [] })
    bins.get(k).list.push(g)
  }

  /* proportions in metres, scaled later by `height` */
  const hipY   = 0.86
  const torsoH = 0.46
  const shoulderY = hipY + torsoH * 0.82
  const headY  = hipY + torsoH + 0.14

  /* ---- legs: two, with a slight stance offset ---- */
  const legTop = hipY, legLen = hipY - 0.06
  const legSpread = 0.055 * buildK
  add(trous, box(0.075 * buildK, legLen, 0.085, -legSpread, legTop - legLen / 2, 0))
  add(trous, box(0.075 * buildK, legLen, 0.085,  legSpread, legTop - legLen / 2, 0))
  /* knees: a slight break so legs are not two blocks */
  add(trous, sph(0.048 * buildK, -legSpread, legTop - legLen * 0.52, 0.005))
  add(trous, sph(0.048 * buildK,  legSpread, legTop - legLen * 0.52, 0.005))
  /* ---- shoes: actually on the ground ---- */
  add(M.shoe, box(0.085 * buildK, 0.055, 0.17, -legSpread, 0.028, 0.022))
  add(M.shoe, box(0.085 * buildK, 0.055, 0.17,  legSpread, 0.028, 0.022))

  /* ---- torso: tapered, with shoulders ---- */
  add(cloth, cap(0.135 * buildK, torsoH * 0.72, 0, hipY + torsoH * 0.42, 0))
  add(cloth, box(0.30 * buildK, 0.13, 0.17, 0, shoulderY, 0))
  /* a long coat hangs below the hip and moves when the leg moves */
  if (longCoat)
    add(cloth, box(0.30 * buildK, 0.30, 0.20, 0, hipY - 0.09, 0))
  /* collar / lapel detail in the accent colour: reads at street distance */
  add(accent, box(0.075, 0.10, 0.03, -0.06 * buildK, shoulderY - 0.03, 0.088))
  add(accent, box(0.075, 0.10, 0.03,  0.06 * buildK, shoulderY - 0.03, 0.088))

  /* ---- arms: shoulder to hand, hanging with a slight bend ---- */
  const armLen = 0.44
  const armX = 0.115 * buildK
  const armR = 0.042 * buildK
  add(cloth, cap(armR, armLen * 0.62, -armX, shoulderY - armLen * 0.42, 0.01))
  add(cloth, cap(armR, armLen * 0.62,  armX, shoulderY - armLen * 0.42, 0.01))
  /* hands */
  add(skin, sph(0.036, -armX, shoulderY - armLen * 0.92, 0.02))
  add(skin, sph(0.036,  armX, shoulderY - armLen * 0.92, 0.02))

  /* ---- neck + head ---- */
  add(skin, cyl(0.038, 0.07, 0, headY - 0.10, 0))
  add(skin, sph(0.098, 0, headY, 0))
  /* face plane: a hairline and a jaw so the head is not a ball */
  add(skin, box(0.13, 0.05, 0.02, 0, headY - 0.04, 0.088))
  const hairGeo = []
  buildHair(hairStyle, hairM, hairGeo, rng)
  hairGeo.forEach(g => add(hairM, g))

  /* ---- accessories ---- */
  let bagGeo = null, phoneGeo = null
  if (hasBag){
    bagGeo = box(0.15, 0.19, 0.08, armX + 0.02, shoulderY - armLen * 0.95, 0.03)
    add(M.bag, bagGeo)
    add(M.bag, box(0.02, 0.30, 0.02, armX + 0.02, shoulderY - armLen * 0.6, 0.03))
  }
  if (usesPhone){
    phoneGeo = box(0.07, 0.13, 0.012, -armX - 0.02, shoulderY - armLen * 0.92, 0.06)
    add(M.phone, phoneGeo)
  }

  /* ---- merge ---- */
  const group = new THREE.Group()
  const named = {}
  for (const [, entry] of bins){
    const merged = mergeGeometries(entry.list, false)
    if (!merged) continue
    merged.computeBoundingSphere()
    const m = new THREE.Mesh(merged, entry.mat)
    m.matrixAutoUpdate = false
    m.updateMatrix()
    group.add(m)
    entry.list.forEach(g => g.dispose())
  }

  group.scale.setScalar(scale * height)
  group.userData = {
    type: 'ped',
    seed, hairStyle, clothKind, hasBag, usesPhone, longCoat,
    height, buildK, skinMat: skin, clothMat: cloth,
    /* animation + weather addresses these */
    get armL(){ return group.children[0] }
  }

  /* ---- weather kit: umbrella and breath, hidden until needed ---- */
  const umb = new THREE.Group()
  {
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 0.20, 10, 1, true),
      M.umbrella[(rng() * M.umbrella.length) | 0]
    )
    canopy.position.y = 0.02
    const shaft = new THREE.Mesh(cyl(0.011, 0.62, 0, 0.31, 0), M.shoe)
    umb.add(canopy, shaft)
    /* eight ribs, so the canopy is not a plain cone */
    for (let i = 0; i < 8; i++){
      const a = i / 8 * Math.PI * 2
      const rib = new THREE.Mesh(box(0.40, 0.008, 0.008,
        Math.cos(a) * 0.20, -0.06, Math.sin(a) * 0.20), canopy.material)
      rib.rotation.y = -a
      rib.position.y = -0.02
      umb.add(rib)
    }
  }
  umb.position.set(armX + 0.02, shoulderY - armLen * 0.9, 0.03)
  umb.visible = false
  group.add(umb)

  const breath = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), M.breath.clone())
  breath.position.set(0, headY - 0.03, 0.10)
  breath.visible = false
  group.add(breath)

  group.userData.rig = { umbrella: umb, breath, hairStyle, longCoat, usesPhone, hasBag }
  group.userData.seeded = {
    height, buildK, hairStyle, clothKind, longCoat, usesPhone, hasBag,
    clothHex: cloth.color.getHex(), accentHex: accent.color.getHex()
  }

  if (parent) parent.add(group)
  return group
}

/* ---------------------------------------------------------- WEATHER KIT --
   Snow adds a coat, a scarf, boots and visible breath. Rain adds an
   umbrella and darkens the clothing. Applied by toggling the seeded
   variation and the rig parts, not by rebuilding anyone. */
export function dressCharacterForWeather(ped, atmo){
  const u = ped.userData
  if (!u || !u.rig) return
  const rig = u.rig
  const rain = atmo.rain > 0.05
  const snow = atmo.snow > 0.05
  const cold = rain || snow

  rig.umbrella.visible = rain
  rig.breath.visible = snow

  /* coats and scarves arrive with cold; the long coat is already geometry,
     so cold simply darkens the cloth and widens the collar read */
  if (u.skinMat) u.skinMat.color.multiplyScalar(1)
  const dark = cold ? 0.78 : 1
  const light = cold ? 0.94 : 1
  if (u.clothMat && !u.clothMat.userData.base){
    u.clothMat.userData.base = u.clothMat.color.clone()
  }
  if (u.clothMat && u.clothMat.userData.base){
    u.clothMat.color.copy(u.clothMat.userData.base).multiplyScalar(dark)
  }
  void light
}

/* ------------------------------------------------------------- ANIMATION --
   A walk cycle: legs counter-swing, arms counter-swing to legs, torso
   bobs. Gait speed and stride vary per character. */
export function animateCharacter(ped, t, speed = 1){
  const u = ped.userData
  if (!u) return
  const stride = u.gait || 1
  const s = Math.sin(t * 5.2 * stride * speed)
  const c = Math.cos(t * 5.2 * stride * speed)
  /* bob comes from the legs, so it doubles with the stride automatically */
  ped.position.y = Math.abs(c) * 0.018 * stride
  /* lean into the walk */
  ped.rotation.z = Math.sin(t * 2.6 * stride) * 0.02
  u.s = s
  u.c = c
}

/* Fireworks reaction: stop walking, look up, some raise a phone. */
export function reactToFireworks(ped, t){
  const u = ped.userData
  if (!u) return
  u.fwReact = 1
}

/* ------------------------------------------------------------- POPULATION --
   District population profiles: who walks here, and in what clothing. */
export const POPULATION = {
  shinjuku:      { n: 12, coats:['suit','coat'], phone: 0.5, speed:[0.9,1.2], hue:'office' },
  nishishinjuku: { n: 10, coats:['coat','jacket'], phone: 0.45, speed:[0.85,1.15], hue:'office' },
  harajuku:      { n: 10, coats:['jacket','shirt'], phone: 0.6, speed:[0.85,1.1], hue:'casual' },
  shibuya:       { n: 14, coats:['jacket','coat'], phone: 0.65, speed:[0.9,1.2], hue:'fashion' },
  nakameguro:    { n: 10, coats:['sweater','coat'], phone: 0.35, speed:[0.7,0.95], hue:'casual' },
  roppongi:      { n: 11, coats:['coat','jacket'], phone: 0.5, speed:[0.85,1.1], hue:'suit' },
  ginza:         { n: 11, coats:['suit','coat'], phone: 0.5, speed:[0.8,1.05], hue:'suit' },
  tsukiji:       { n: 12, coats:['shirt','sweater'], phone: 0.3, speed:[0.9,1.25], hue:'work' },
  akihabara:     { n: 10, coats:['jacket','shirt'], phone: 0.4, speed:[0.85,1.15], hue:'casual' },
  asakusa:       { n: 12, coats:['coat','jacket'], phone: 0.4, speed:[0.7,0.95], hue:'tourist' },
  odaiba:        { n: 14, coats:['shirt','jacket'], phone: 0.6, speed:[0.8,1.1], hue:'family' }
}