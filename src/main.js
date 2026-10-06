import * as THREE from 'three'
import maplibregl from 'maplibre-gl'
import { createAtmosphere } from './atmosphere.js'
import { MEDIA } from './media.js'
import { DISTRICTS, resolveWorld, districtForTour, conciergeRecommend } from './data/tokyoWorld.js'
import { makeBuildingMaterials, buildBuilding, pickArchetype, ARCHETYPES, DISTRICT_PROFILES } from './buildings.js'
import {
  makeCharacterMaterials, buildCharacter, dressCharacterForWeather,
  animateCharacter, mulberry
} from './characters.js'
import { makeVehicleMaterials, buildVehicle, dressVehicleForWeather, VEHICLE_TYPES } from './vehicles.js'
import { makeRailMaterials, buildTrackway, buildTrain, updateTrain } from './rail.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

const REDUCED_Q = matchMedia('(prefers-reduced-motion: reduce)')
let REDUCED = REDUCED_Q.matches
/* the browser preference is the source of truth, and it can change mid-session (§47) */
REDUCED_Q.addEventListener('change', e => {
  REDUCED = e.matches
  document.body.classList.toggle('reduced', REDUCED)
})
const IS_TOUCH = matchMedia('(pointer: coarse)').matches
const lerp = (a,b,t)=>a+(b-a)*t
const clamp = THREE.MathUtils.clamp
const smooth = t=>t*t*(3-2*t)
const easeOut = t=>1-Math.pow(1-t,3)

/* A ?shot=1 URL turns the page into a self-driving camera: it enters the world,
   flies to a requested scroll position and atmosphere, waits for the transition
   to settle, then writes a PNG data URL into the DOM. preserveDrawingBuffer is
   only enabled on this path, so it never costs anything in normal use. */
const SHOT = new URLSearchParams(location.search).get('shot')
/* assigned when ?shot=1; the render loop calls this to know when to capture */
let shotCapture = null

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('scene'), antialias: !IS_TOUCH, powerPreference:'high-performance', preserveDrawingBuffer: !!SHOT })
renderer.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? 1.5 : 2))
renderer.setSize(innerWidth, innerHeight)
renderer.setClearColor(0x05070d, 1)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x05070d)
scene.fog = new THREE.FogExp2(0x05070d, 0.012)

const camera = new THREE.PerspectiveCamera(50, innerWidth/innerHeight, 0.1, 500)
camera.position.set(0, 2.3, 12)

const rtOpts = { type: THREE.HalfFloatType }
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, rtOpts))
composer.addPass(new RenderPass(scene, camera))
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.65, 0.62)
if(!IS_TOUCH) composer.addPass(bloom)
composer.addPass(new OutputPass())

const GradeShader = {
  uniforms:{
    tDiffuse:{value:null}, time:{value:0}, amount:{value:0.0012},
    grain:{value:0.045}, vig:{value:0.55},
    uTint:{value:new THREE.Vector3(1,1,1)},
    uExposure:{value:1}
  },
  vertexShader:'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader:[
    'varying vec2 vUv;',
    'uniform sampler2D tDiffuse; uniform float time, amount, grain, vig, uExposure;',
    'uniform vec3 uTint;',
    'float rand(vec2 c){ return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453); }',
    'void main(){',
    ' vec2 d = vUv - 0.5; float r2 = dot(d,d);',
    ' vec2 off = d * amount * (0.4 + r2*2.5);',
    ' float cr = texture2D(tDiffuse, vUv+off).r;',
    ' float cg = texture2D(tDiffuse, vUv).g;',
    ' float cb = texture2D(tDiffuse, vUv-off).b;',
    ' vec3 col = vec3(cr,cg,cb) * uTint * uExposure;',
    ' col += (rand(vUv*vec2(1920.0,1080.0)+fract(time)*100.0)-0.5)*grain;',
    ' col *= 1.0 - r2*vig;',
    ' gl_FragColor = vec4(col,1.0);',
    '}'
  ].join('\n')
}
const gradePass = new ShaderPass(GradeShader)
composer.addPass(gradePass)

const pointer = new THREE.Vector2(0,0)
const pointerPx = { x: innerWidth/2, y: innerHeight/2 }
const raycaster = new THREE.Raycaster()
const clock = new THREE.Clock()
const currentLook = new THREE.Vector3(0, 2.2, -20)
let trans = null
function startTransition(){
  trans = { t: 0, fromPos: camera.position.clone(), fromLook: currentLook.clone() }
}

function canvasTex(w, h, draw){
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  draw(cv.getContext('2d'), w, h)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return { tex, cv, ctx: cv.getContext('2d') }
}

function windowTexture(w, h, lit, warm, accent, wood, base){
  return canvasTex(w, h, (ctx)=>{
    ctx.fillStyle = base || (wood ? '#4a2f1f' : '#2a2f3a'); ctx.fillRect(0,0,w,h)
    if (wood){
      /* horizontal timber slats give traditional districts a different
         facade rhythm than modern glass offices */
      ctx.strokeStyle = 'rgba(40,22,12,0.9)'; ctx.lineWidth = 1.6
      for (let y = 3; y < h; y += 7){ ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
    }
    const cols = 6, rows = Math.round(h/w*cols*1.6)
    const cw = w/cols, rh = h/rows
    for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){
      const roll = Math.random()
      if (roll < lit){
        ctx.fillStyle = roll < 0.1 && accent ? accent : (roll < 0.4 ? warm : '#ffd9a0')
        ctx.globalAlpha = 0.55 + Math.random()*0.45
      } else {
        ctx.fillStyle = '#0b0e16'
        ctx.globalAlpha = 0.9
      }
      ctx.fillRect(x*cw+cw*0.18, y*rh+rh*0.24, cw*0.64, rh*0.52)
    }
    ctx.globalAlpha = 1
  }).tex
}

function neonTexture(text, color, w=256, h=72, font=44){
  const { tex } = canvasTex(w, h, (ctx)=>{
    ctx.clearRect(0,0,w,h)
    ctx.font = 'bold '+font+'px "Arial Narrow", Arial, sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.shadowColor = color; ctx.shadowBlur = 20
    ctx.strokeStyle = color; ctx.lineWidth = 1.6
    ctx.strokeText(text, w/2, h/2)
    ctx.shadowBlur = 6
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.92
    ctx.fillText(text, w/2, h/2)
  })
  return tex
}

const city = new THREE.Group()
scene.add(city)

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(240, 500),
  new THREE.MeshBasicMaterial({ color: 0x070a11 })
)
ground.rotation.x = -Math.PI/2
ground.position.set(0, 0, -90)
city.add(ground)

const asphalt = new THREE.Mesh(
  new THREE.PlaneGeometry(18, 260),
  new THREE.MeshBasicMaterial({ color: 0x0a0e18 })
)
asphalt.rotation.x = -Math.PI/2
asphalt.position.set(0, 0.01, -90)
city.add(asphalt)

/* snow cover: a cool translucent sheet over the street, visible only in snow */
const snowSheet = new THREE.Mesh(
  new THREE.PlaneGeometry(22, 260),
  new THREE.MeshBasicMaterial({ color: 0xdfe8f2, transparent: true, opacity: 0, depthWrite: false })
)
snowSheet.rotation.x = -Math.PI/2
snowSheet.position.set(0, 0.035, -90)
city.add(snowSheet)

/* Facade archetypes: each district gets its own window language, so the
   architecture reads differently long before anyone reads a label.
   This is the first lever of the visual-bible building dressing. */
  const bMats = [
  new THREE.MeshBasicMaterial({ map: windowTexture(64,128,0.34,'#ffb36b',null,false,'#20262e') }),
  new THREE.MeshBasicMaterial({ map: windowTexture(64,128,0.22,'#9db8ff',null,false,'#1c242c') }),
  new THREE.MeshBasicMaterial({ map: windowTexture(64,128,0.45,'#ffd9a0',null,false,'#2a251e') })
]
const FACADES = {
  office:  [windowTexture(64,128,0.30,'#9db8ff',null,false,'#20262e'), windowTexture(64,128,0.22,'#b8c8ff',null,false,'#1a2028')],
  warm:    [windowTexture(64,128,0.30,'#ffb36b',null,false,'#2a2520'), windowTexture(64,128,0.20,'#ffc98a',null,false,'#241f1a')],
  luxe:    [windowTexture(64,128,0.24,'#e8dcc0',null,false,'#3a362e'), windowTexture(64,128,0.16,'#f0e8d8',null,false,'#332f28')],
  neon:    [windowTexture(64,128,0.30,'#ffd9a0','#ff2e88',false,'#161c24'), windowTexture(64,128,0.22,'#ffd9a0','#7fd4ff',false,'#121820')],
  electric:[windowTexture(64,128,0.32,'#7fd4ff','#ff2e88',false,'#101c28'), windowTexture(64,128,0.24,'#9adfff','#ffe95a',false,'#0e1824')],
  market:  [windowTexture(64,128,0.30,'#7fd4ff','#ffb36b',false,'#1c3030'), windowTexture(64,128,0.20,'#bfe8ff',null,false,'#182828')],
  traditional:[windowTexture(64,128,0.18,'#ffca8a',null,true,'#2e1c10'), windowTexture(64,128,0.12,'#ffb36b',null,true,'#261810')],
  residential:[windowTexture(64,128,0.26,'#ffc98a',null,false,'#2e2820'), windowTexture(64,128,0.18,'#ffb36b',null,false,'#28221b')]
}
const DISTRICT_FACADE = {
  shinjuku: 'office', nishishinjuku: 'warm', harajuku: 'neon', shibuya: 'neon',
  nakameguro: 'residential', roppongi: 'luxe', ginza: 'luxe', tsukiji: 'market',
  akihabara: 'electric', asakusa: 'traditional'
}
const allBuildingMats = [...bMats]
const facadeCache = {}
function facadeMatsFor(z){
  const set = DISTRICT_FACADE[districtAtZ(z)] || 'office'
  if (!facadeCache[set]){
    facadeCache[set] = FACADES[set].map(t => {
      const m = new THREE.MeshBasicMaterial({ map: t })
      allBuildingMats.push(m)
      return m
    })
  }
  return facadeCache[set]
}

/* Buildings are real modular architecture now: assembled from base, facade
   bays, ground-floor shopfront, detail and roof modules, then merged per
   material so a 40-part building still costs one draw call per material.
   The eight archetypes and their district weighting live in buildings.js. */
const buildingGeo = new THREE.BoxGeometry(1,1,1)
const buildingMats = makeBuildingMaterials()
/* the snow/facade wash must also reach the new structural materials */
allBuildingMats.push(buildingMats.concrete, buildingMats.concreteLt,
  buildingMats.plaster, buildingMats.tile, buildingMats.metal,
  buildingMats.timber, buildingMats.glassDark, buildingMats.glassLit,
  buildingMats.glassCool, buildingMats.roofTile, buildingMats.plant,
  buildingMats.signBoard, buildingMats.cloth)
const bldgGroups = []
let bldgSeed = 20260106
function addBuilding(x, z, w, h, d, mat){
  /* legacy far-skyline path: a plain slab is correct at that distance and
     keeps the draw count down. Kept for the background ring only. */
  const m = new THREE.Mesh(buildingGeo, mat)
  m.scale.set(w, h, d)
  m.position.set(x, h/2, z)
  city.add(m)
  return m
}

const farBuildings = []
let farLayerMats = []
let backgroundLayers = null
/* District massing: the street must read as different parts of Tokyo,
   not one repeated block. Heights, widths and street width vary by
   district; landmarks and street character are added per district below. */
/* ------------------------------------------------------------ districts --
   The journey runs down one street. Z ranges are chosen so the last
   district (Odaiba) is a waterfront: the street opens out, the buildings
   stop, and the bay begins. */
function districtAtZ(z){
  if (z > 6) return 'shinjuku'
  if (z > -26) return 'nishishinjuku'
  if (z > -40) return 'harajuku'
  if (z > -54) return 'shibuya'
  if (z > -68) return 'nakameguro'
  if (z > -82) return 'roppongi'
  if (z > -96) return 'ginza'
  if (z > -110) return 'tsukiji'
  if (z > -124) return 'akihabara'
  if (z > -142) return 'asakusa'
  return 'odaiba'
}
const DIST_ENV = {
  shinjuku:     { hMin:18, hMax:38, wMin:4.0, wMax:7.0, xBase:13 },
  nishishinjuku:{ hMin:15, hMax:32, wMin:3.5, wMax:6.0, xBase:12 },
  harajuku:     { hMin:6,  hMax:14, wMin:3.0, wMax:5.0, xBase:9 },
  shibuya:      { hMin:10, hMax:24, wMin:4.0, wMax:7.0, xBase:16 },
  nakameguro:   { hMin:5,  hMax:12, wMin:3.0, wMax:5.0, xBase:10 },
  roppongi:     { hMin:12, hMax:28, wMin:4.0, wMax:6.0, xBase:12 },
  ginza:        { hMin:10, hMax:20, wMin:5.0, wMax:8.0, xBase:15 },
  tsukiji:      { hMin:4,  hMax:10, wMin:3.0, wMax:5.0, xBase:10 },
  akihabara:    { hMin:12, hMax:26, wMin:3.5, wMax:6.0, xBase:11 },
  asakusa:      { hMin:4,  hMax:10, wMin:3.0, wMax:6.0, xBase:11 },
  /* ODAIBA: the street opens out. Wide footprints, low horizontal massing,
     a generous plaza, and nothing close to the carriageway. */
  odaiba:       { hMin:6,  hMax:14, wMin:10.0,wMax:17.0, xBase:34 }
}
/* --- the street frontage ----------------------------------------------
   Real modular buildings, placed along both kerbs, FACING THE STREET.

   A building is assembled with its detailed facade (shopfront, windows,
   awnings) on its local +Z face, so each one is rotated to face the
   carriageway: 90 degrees, so that face looks inwards. Its footprint is
   therefore depth-into the block and frontage-along the street, not the
   other way round — getting this wrong is what put every shopfront at
   ninety degrees to the road.

   The left-hand side also has to clear the railway: the viaduct occupies
   x -16.7 to -11.3, so nothing may be built inside that corridor. */
/* Set back far enough that projecting balconies and awnings still clear
   the viaduct parapet at x -16.7. */
const RAIL_CLEAR_X = 22.5
const ALLEY_X = 7.0
for(let z = 8; z > -178; z -= 6.4){
  const dist = districtAtZ(z)
  const env = DIST_ENV[dist] || DIST_ENV.shinjuku
  const alley = (z < -60 && z > -84)
  const plaza = (z < -40 && z > -60)
  const arcade = (z < -84 && z > -104)
  if(plaza && ((z + 152) % 3 < 1)) continue
  for(const side of [-1, 1]){
    const seed = (bldgSeed += 7919)
    const r = (seed * 2654435761 % 1000) / 1000
    if(r < 0.14) continue
    const prof = DISTRICT_PROFILES[dist]
    if (!prof) continue
    /* gap between kerb and facade follows the district street width, and
       the left side is pushed clear of the viaduct */
    let xBase = plaza ? 16 : (alley ? ALLEY_X : env.xBase)
    if (side < 0) xBase = Math.max(xBase, RAIL_CLEAR_X)
    const depth  = prof.w[0] + r * (prof.w[1] - prof.w[0])          /* into the block */
    const front  = 3.6 + ((seed % 100) / 100) * (prof.d[1] - 3.6)   /* along the street */
    const floors = Math.round(prof.floors[0] + ((seed % 37) / 37) * (prof.floors[1] - prof.floors[0]))
    const arch = pickArchetype(prof, mulberry(seed))
    /* Geometry is assembled at the origin and the GROUP is then placed and
       turned. Baking world coordinates into the parts and rotating the
       group as well would spin every building about the world origin and
       scatter them across the carriageway. */
    const b = buildBuilding({
      x: 0, z: 0, dir: 1, district: dist, seed,
      materials: buildingMats, parent: city,
      profile: { picks: [[arch, 1]], w: [depth, depth], d: [front, front], floors: [floors, floors] }
    })
    b.group.position.set(side * (xBase + depth / 2), 0, z)
    /* turn the facade to face the road */
    b.group.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2
    b.group.updateMatrixWorld(true)
    bldgGroups.push(b.group)
  }
}
/* The far city: three depth layers so the background is a city and not a
   ring of boxes. Buildings carry a window band and a parapet, get darker
   and hazier with distance (aerial perspective), and are thinned so the
   cost stays low. Layer 3 is the skyline you finish the journey looking
   back at from Odaiba. */
{
  const layerMats = []
  const mkLayer = (hex, haze) => {
    const m = new THREE.MeshBasicMaterial({ color: hex })
    m.userData.haze = haze
    layerMats.push(m)
    return m
  }
  const nearM = mkLayer(0x1a2028, 0.10)
  const midM  = mkLayer(0x161d26, 0.32)
  const farM  = mkLayer(0x141a24, 0.62)
  const winM  = new THREE.MeshBasicMaterial({ color: 0x6a6455 })
  const parM  = new THREE.MeshBasicMaterial({ color: 0x22272f })
  const unit = new THREE.BoxGeometry(1, 1, 1)
  const bandGeo = new THREE.BoxGeometry(1.02, 0.42, 0.06)
  const capGeo  = new THREE.BoxGeometry(1.06, 0.1, 0.98)

  /* layer 1: the block behind the street frontage */
  const L1 = []
  for (let i = 0; i < 54; i++){
    const z = 8 - Math.random() * 190
    const x = (Math.random() < 0.5 ? -1 : 1) * (26 + Math.random() * 26)
    const w = 7 + Math.random() * 10, h = 10 + Math.random() * 34
    L1.push([x, h, z, w, Math.random()])
  }
  /* layer 2: the middle distance, taller */
  const L2 = []
  for (let i = 0; i < 64; i++){
    const z = 10 - Math.random() * 230
    const x = (Math.random() < 0.5 ? -1 : 1) * (52 + Math.random() * 60)
    const w = 10 + Math.random() * 16, h = 16 + Math.random() * 52
    L2.push([x, h, z, w, Math.random()])
  }
  /* layer 3: the far skyline, which is what you see from the rooftop */
  const L3 = []
  for (let i = 0; i < 78; i++){
    const a = -0.35 - Math.random() * 4.55
    const dist = 190 + Math.random() * 260
    const w = 14 + Math.random() * 26, h = 24 + Math.random() * 96
    L3.push([Math.sin(a) * dist, h, 20 - Math.cos(a) * dist, w, Math.random()])
  }
  const dummyB = new THREE.Object3D()
  const build = (list, mat) => {
    const body = new THREE.InstancedMesh(unit, mat, list.length)
    const band = new THREE.InstancedMesh(bandGeo, winM, list.length)
    const cap  = new THREE.InstancedMesh(capGeo, parM, list.length)
    list.forEach(([x, h, z, w, r], i) => {
      dummyB.position.set(x, h / 2, z)
      dummyB.rotation.set(0, 0, 0)
      dummyB.scale.set(w, h, w * 0.85)
      dummyB.updateMatrix()
      body.setMatrixAt(i, dummyB.matrix)
      /* a lit window band, only on the nearer layers */
      const hasBand = mat !== farM
      dummyB.scale.set(w, h * 0.4, w * 0.85 + 0.1)
      dummyB.position.set(x, h * (0.34 + r * 0.4), z)
      dummyB.updateMatrix()
      band.setMatrixAt(i, dummyB.matrix)
      band.setColorAt(i, new THREE.Color().setRGB(0.5 + r * 0.5, 0.42 + r * 0.4, 0.26 + r * 0.3))
      /* parapet */
      dummyB.scale.set(w * 1.06, 0.6 + r * 0.6, w * 0.91)
      dummyB.position.set(x, h + (0.6 + r * 0.6) / 2, z)
      dummyB.updateMatrix()
      cap.setMatrixAt(i, dummyB.matrix)
      void hasBand
    })
    body.instanceMatrix.needsUpdate = true
    cap.instanceMatrix.needsUpdate = true
    if (band.instanceColor) band.instanceColor.needsUpdate = true
    band.frustumCulled = false
    city.add(body, band, cap)
  }
  build(L1, nearM)
  build(L2, midM)
  build(L3, farM)
  /* aerial perspective: the far layers sit behind the haze, and dim
     further at night so the lit windows carry the read */
  farLayerMats = layerMats
  backgroundLayers = { layers: 3, count: L1.length + L2.length + L3.length }
}

/* distant mountains: low-poly silhouettes on the horizon so the sky
   line is not a hard rectangle */
{
  const mMat = new THREE.MeshBasicMaterial({ color: 0x1a2230 })
  const m1 = new THREE.Mesh(new THREE.ConeGeometry(60, 26, 5), mMat)
  m1.position.set(-70, 0, -230)
  const m2 = new THREE.Mesh(new THREE.ConeGeometry(45, 18, 5), mMat)
  m2.position.set(30, 0, -235)
  const m3 = new THREE.Mesh(new THREE.ConeGeometry(80, 30, 6), new THREE.MeshBasicMaterial({ color: 0x222a3a }))
  m3.position.set(90, 0, -240)
  const cap = new THREE.Mesh(new THREE.ConeGeometry(14, 7, 6), new THREE.MeshBasicMaterial({ color: 0xc8d4e0 }))
  cap.position.set(-70, 20, -230)
  city.add(m1, m2, m3, cap)
}

/* street trees along the sidewalk every district, not just spring */
{
  const trunkMat = new THREE.MeshBasicMaterial({ color: 0x2a2018 })
  const canopyMats = [0x2f4a2f, 0x3a5a3a, 0x27402a, 0x4a5a2f].map(c => new THREE.MeshBasicMaterial({ color: c }))
  for (let z = 2; z > -146; z -= 14){
    for (const side of [-1, 1]){
      if (Math.random() < 0.4) continue
      const env = DIST_ENV[districtAtZ(z)] || DIST_ENV.shinjuku
      const g = new THREE.Group()
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.2, 5), trunkMat)
      tr.position.y = 1.1
      const ca = new THREE.Mesh(new THREE.SphereGeometry(1.0 + Math.random()*0.5, 7, 6), canopyMats[(Math.random()*canopyMats.length)|0])
      ca.position.y = 2.8
      ca.scale.y = 0.8
      g.add(tr, ca)
      g.position.set(side * (env.xBase - 1.6), 0, z)
      city.add(g)
    }
  }
}

/* ======================= TOKYO BAY / ODAIBA =========================
   Past Asakusa the city ends and the water begins. This is the payoff
   of the whole journey: a bay, a promenade, a suspension bridge, the
   skyline of the city you have just walked through, seen from outside
   it, and open air instead of another wall of buildings.              */
let pedSeed = 991
let bayWater = null
const bayGroup = new THREE.Group()
const bayWaterMat = new THREE.MeshBasicMaterial({ color: 0x0a1420 })
const BAY_Z = -178
{
  /* the water: a wide plane running to the horizon */
  const water = new THREE.Mesh(new THREE.PlaneGeometry(700, 420), bayWaterMat)
  water.rotation.x = -Math.PI / 2
  water.position.set(0, -0.6, BAY_Z - 205)
  bayWater = water
  bayGroup.add(water)

  /* the shoreline: a seawall, a stepped edge and a promenade */
  const seawall = new THREE.Mesh(new THREE.BoxGeometry(240, 2.2, 3),
    new THREE.MeshBasicMaterial({ color: 0x22262c }))
  seawall.position.set(0, -0.5, BAY_Z - 1.5)
  bayGroup.add(seawall)
  for (let s = 0; s < 3; s++){
    const step = new THREE.Mesh(new THREE.BoxGeometry(240, 0.35, 1.6),
      new THREE.MeshBasicMaterial({ color: 0x1b1f24 }))
    step.position.set(0, -0.9 + s * 0.35, BAY_Z - 3.2 - s * 1.7)
    bayGroup.add(step)
  }
  /* promenade paving, wider than any street in the city */
  const prom = new THREE.Mesh(new THREE.PlaneGeometry(150, 46),
    new THREE.MeshBasicMaterial({ color: 0x191d22 }))
  prom.rotation.x = -Math.PI / 2
  prom.position.set(0, 0.04, BAY_Z - 24)
  bayGroup.add(prom)
  /* handrail along the water's edge */
  for (let x = -70; x <= 70; x += 5){
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x2a2e34 }))
    post.position.set(x, 0.55, BAY_Z - 44)
    bayGroup.add(post)
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(145, 0.08, 0.08),
    new THREE.MeshBasicMaterial({ color: 0x2a2e34 }))
  rail.position.set(0, 1.02, BAY_Z - 44)
  bayGroup.add(rail)

  /* RAINBOW BRIDGE: two towers, a suspension cable, and a lit deck.
     This is the one piece of Tokyo infrastructure that reads instantly. */
  const bridge = new THREE.Group()
  const towerMat = new THREE.MeshBasicMaterial({ color: 0xdcd8d0 })
  const cableMat = new THREE.MeshBasicMaterial({ color: 0xc04a3c })
  const deckMat = new THREE.MeshBasicMaterial({ color: 0x3a4048 })
  const BX = -46, BZ = BAY_Z - 96
  for (const t of [-1, 1]){
    const tower = new THREE.Group()
    for (const s of [-1, 1]){
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.5, 34, 1.5), towerMat)
      leg.position.set(s * 3.4, 17, 0)
      tower.add(leg)
    }
    for (const h of [10, 22, 33]){
      const beam = new THREE.Mesh(new THREE.BoxGeometry(8.2, 1.1, 1.6), towerMat)
      beam.position.set(0, h, 0)
      tower.add(beam)
    }
    tower.position.set(BX, 0, BZ + t * 62)
    bridge.add(tower)
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(9, 1.4, 190), deckMat)
  deck.position.set(BX, 9.4, BZ)
  bridge.add(deck)
  /* main cable: a sagging span between the towers */
  for (const t of [-1, 1]){
    const pts = []
    for (let i = 0; i <= 24; i++){
      const k = i / 24
      const z = BZ + t * 62 * (1 - k) + t * 66 * k
      const y = 30 - Math.sin(k * Math.PI) * 15
      pts.push(new THREE.Vector3(BX, y, z))
    }
    const curve = new THREE.CatmullRomCurve3(pts)
    const line = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 32, 0.42, 6, false), cableMat)
    bridge.add(line)
  }
  /* vertical hangers */
  for (let i = -5; i <= 5; i++){
    if (i === 0) continue
    const z = BZ + i * 12
    const sag = 1 - Math.abs(i) / 6
    const top = 30 - (1 - sag) * 15
    const hang = new THREE.Mesh(new THREE.BoxGeometry(0.14, top - 10.4, 0.14), cableMat)
    hang.position.set(BX, (top + 10.4) / 2, z)
    bridge.add(hang)
  }
  bayGroup.add(bridge)

  /* the skyline across the water: Odaiba's own towers, then Tokyo behind.
     This is the view that makes the rooftop ending land. */
  const farMat = new THREE.MeshBasicMaterial({ color: 0x161c26 })
  const farLit = new THREE.MeshBasicMaterial({ color: 0x2a3342 })
  const R = 120
  for (let i = 0; i < 46; i++){
    const a = -Math.PI * 0.5 + (Math.random() - 0.5) * 2.4
    const dist = 150 + Math.random() * 320
    const w = 8 + Math.random() * 22
    const h = 20 + Math.random() * 90
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w),
      Math.random() > 0.45 ? farLit : farMat)
    m.position.set(Math.sin(a) * dist - 40, h / 2 - 1, BAY_Z - 90 - Math.cos(a) * dist * 0.9)
    bayGroup.add(m)
  }
  /* and the city itself, seen from the far side of the bay */
  for (let i = 0; i < 70; i++){
    const dist = 380 + Math.random() * 260
    const w = 10 + Math.random() * 26
    const h = 18 + Math.random() * 70
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.8),
      Math.random() > 0.5 ? farLit : farMat)
    m.position.set((Math.random() - 0.5) * 900, h / 2 - 1, BAY_Z - 260 - dist * 0.5)
    bayGroup.add(m)
  }

  /* waterfront lighting: bollard lamps along the promenade, and the
     promenade glow that makes wet pavement read at night */
  const bollardMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 })
  for (let x = -60; x <= 60; x += 12){
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.9, 6),
      new THREE.MeshBasicMaterial({ color: 0x22262c }))
    post.position.set(x, 0.45, BAY_Z - 30)
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), bollardMat)
    lamp.position.set(x, 0.98, BAY_Z - 30)
    bayGroup.add(post, lamp)
  }
  /* Yurikamome context: an elevated people mover on twin guideways */
  const yuri = new THREE.Group()
  const guideMat = new THREE.MeshBasicMaterial({ color: 0x4a5058 })
  for (const s of [-1, 1]){
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 200), guideMat)
    beam.position.set(s * 2.6, 8.2, 0)
    yuri.add(beam)
    /* piers every 20m */
    for (let i = -4; i <= 4; i++){
      const pier = new THREE.Mesh(new THREE.BoxGeometry(1.2, 8.2, 1.2), guideMat)
      pier.position.set(s * 2.6, 4.1, i * 22)
      yuri.add(pier)
    }
  }
  /* a train on it, parked mid-run */
  const yuriCar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 16),
    new THREE.MeshBasicMaterial({ color: 0xd8d4cc }))
  yuriCar.position.set(0, 10.1, 18)
  const yuriWin = new THREE.Mesh(new THREE.BoxGeometry(2.66, 0.9, 15),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0 }))
  yuriWin.position.set(0, 10.6, 18)
  yuri.add(yuriCar, yuriWin)
  yuri.position.set(26, 0, BAY_Z - 40)
  yuri.rotation.y = Math.PI / 2
  bayGroup.add(yuri)

  city.add(bayGroup)
}
/* the promenade crowd: families, tourists, cyclists. Odaiba is the one
   place on this journey with open air and room to move. Built after the
   character materials exist (see buildBayCrowd). */
const bayCrowd = []
function buildBayCrowd(){
  for (let i = 0; i < 14; i++){
    const g = buildCharacter({
      seed: (pedSeed += 15485863), materials: charMats, parent: city
    })
    const r = mulberry(pedSeed)
    const lane = i % 3
    g.position.set(
      -34 + r() * 68,
      0,
      BAY_Z - 10 - lane * 9 - r() * 6)
    g.userData = {
      type: 'bayped', zone: { x:[-34, 34], z:[BAY_Z - 16, BAY_Z - 40] },
      dir: r() < 0.5 ? 1 : -1,
      speed: 0.4 + r() * 0.5, gait: 0.85 + r() * 0.4,
      bob: r() * 10, rig: g.userData.rig,
      height: g.userData.height, buildK: g.userData.buildK,
      hairStyle: g.userData.hairStyle,
      clothMat: g.userData.clothMat,
      baseCol: g.userData.clothMat.color.clone(),
      umbrella: g.userData.rig.umbrella
    }
    g.traverse(o => { if (o.isMesh) o.userData = { type:'ped', ref: g } })
    bayCrowd.push(g)
    peds.push(g)
  }
}
   /* ---------------- district landmarks (geography must make sense) -------
   Skytree stands east of Asakusa (~1km from Senso-ji); Tokyo Tower
   rises south-west of Roppongi; the Meguro river runs through
   Nakameguro. All are silhouettes, not models — they read at distance. */
const landmarkMats = []
function landmarkMat(color){
  const m = new THREE.MeshBasicMaterial({ color })
  m.userData.base = new THREE.Color(color)
  landmarkMats.push(m)
  return m
}
/* Tokyo Skytree: tapered white-blue lattice tower with two decks */
(function skytree(){
  const g = new THREE.Group()
  const white = landmarkMat(0x9fb4c8)
  const deck = landmarkMat(0x7d94ac)
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 3.2, 34, 8), white)
  mast.position.y = 17
  g.add(mast)
  const deck1 = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 1.6, 8), deck)
  deck1.position.y = 24
  g.add(deck1)
  const deck2 = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 1.2, 8), deck)
  deck2.position.y = 30
  g.add(deck2)
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.5, 8, 6), white)
  spire.position.y = 38
  g.add(spire)
  g.position.set(26, 0, -138)
  city.add(g)
})();
/* Tokyo Tower: red-white tapered tower, south-west of Roppongi */
(function tokyoTower(){
  const g = new THREE.Group()
  const red = landmarkMat(0xa03a30)
  const wt = landmarkMat(0xd8d4c8)
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 3.4, 18, 4), red)
  legs.position.y = 9
  legs.rotation.y = Math.PI / 4
  g.add(legs)
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.8, 4), wt)
  band.position.y = 14
  band.rotation.y = Math.PI / 4
  g.add(band)
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 1.2, 12, 4), red)
  top.position.y = 23
  top.rotation.y = Math.PI / 4
  g.add(top)
  g.position.set(-28, 0, -84)
  city.add(g)
})();
/* Meguro river + bridge at Nakameguro: dark water plane the street crosses */
const riverMat = new THREE.MeshBasicMaterial({ color: 0x0d1620, transparent: true, opacity: 0.92 })
;(function river(){
  const water = new THREE.Mesh(new THREE.PlaneGeometry(46, 7), riverMat)
  water.rotation.x = -Math.PI / 2
  water.position.set(0, 0.02, -61)
  city.add(water)
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(7, 0.3, 8.4), landmarkMat(0x232a36))
  bridge.position.set(0, 0.18, -61)
  city.add(bridge)
  for (const sx of [-3.2, 3.2]){
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.8, 8.4), landmarkMat(0x3a4356))
    rail.position.set(sx, 0.7, -61)
    city.add(rail)
  }
})();

const signs = []
const signDefs = [
  ['RAMEN','#ff5a36'],['IZAKAYA','#ffb36b'],['BAR','#00d4c8'],['カラオケ','#ff2e88'],
  ['GAME','#ffe95a'],['咖啡','#7fd4ff'],['SAKE','#ff5a36'],['ラーメン','#ffb36b'],
  ['CLUB','#ff2e88'],['DINER','#00d4c8'],['TAXI','#ffe95a'],['HOTEL','#7fd4ff'],
  ['PUB','#ff5a36'],['喫茶','#ffb36b'],['NIGHT','#ff2e88'],['24H','#00d4c8']
]
let signIdx = 0
function addSign(text, color, x, y, z, scale=1, faceCam=false){
  const tex = neonTexture(text, color, 256, 72)
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false })
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2*scale, 0.9*scale), mat)
  m.position.set(x, y, z)
  if(faceCam) m.lookAt(camera.position.x, y, camera.position.z)
  m.userData = { baseOpacity: 0.95, flickerT: 0, type:'sign', text, refl:null, baseColor: new THREE.Color(0xffffff) }
  city.add(m)
  signs.push(m)
  const refl = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2*scale, 0.9*scale),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  )
  m.userData.refl = refl
  refl.rotation.x = -Math.PI/2
  refl.rotation.z = Math.PI
  refl.position.set(x, 0.03, z + 0.4)
  refl.scale.set(1, 0.7, 1)
  city.add(refl)
  return m
}
for(let z = 4; z > -148; z -= 3.5 + Math.random()*3){
  const alley = (z < -60 && z > -84)
  const plaza = (z < -40 && z > -60)
  if(plaza && Math.random() < 0.5) continue
  for(const side of [-1,1]){
    if(Math.random() < 0.3) continue
    const def = signDefs[signIdx++ % signDefs.length]
    const xBase = alley ? 4.6 : 10.8
    const y = alley ? 2.2+Math.random()*2.5 : 3+Math.random()*7
    addSign(def[0], def[1], side*(xBase + Math.random()*1.5), y, z + Math.random()*1.5, alley?0.8:1)
  }
}

const lanterns = []
const lanternGeo = new THREE.SphereGeometry(0.13, 10, 10)
/* a single unmistakable konbini — bright facade, big window, 24H sign */
const konbini = new THREE.Group()
{
  const shell = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.9, 2.4), new THREE.MeshBasicMaterial({ color: 0x1c2836 }))
  shell.position.y = 1.45
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.7), new THREE.MeshBasicMaterial({ color: 0xfff2cc }))
  glass.position.set(0, 1.35, 1.21)
  const signTex = neonTexture('24H', '#00d4c8', 128, 48, 34)
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.55), new THREE.MeshBasicMaterial({ map: signTex, transparent: true }))
  sign.position.set(0, 2.6, 1.22)
  konbini.add(shell, glass, sign)
  konbini.position.set(-9.6, 0, -49)
  konbini.rotation.y = Math.PI/2 * 0.06
  konbini.userData = { type:'konbini' }
  city.add(konbini)
  const kHit = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3, 2.6), new THREE.MeshBasicMaterial({ visible:false }))
  kHit.position.copy(konbini.position); kHit.position.y = 1.5
  kHit.userData = { type:'konbini', ref: konbini }
  city.add(kHit)
}
for(let i=0;i<10;i++){
  const z = -63 - i*2.1
  const x = (i%2===0?-1:1) * (2.2+Math.random()*1.2)
  const mat = new THREE.MeshBasicMaterial({ color: 0xffb36b, transparent: true, opacity: 0.9 })
  const l = new THREE.Mesh(lanternGeo, mat)
  l.position.set(x, 2.6 + Math.random()*0.6, z)
  l.userData = { phase: Math.random()*10 }
  city.add(l)
  lanterns.push(l)
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.008,1.2), new THREE.MeshBasicMaterial({ color: 0x11141c }))
  wire.position.set(x, l.position.y + 0.7, z)
  city.add(wire)
}

for(const z of [-10,-26,-46,-66,-86,-102]){
  const pts = []
  for(let i=0;i<=10;i++){
    const t = i/10
    const x = lerp(-24, 24, t)
    const y = 8.5 - Math.sin(t*Math.PI)*2.2
    pts.push(new THREE.Vector3(x, y, z))
  }
  const curve = new THREE.CatmullRomCurve3(pts)
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), new THREE.LineBasicMaterial({ color: 0x0d1119 }))
  city.add(line)
}

const platform = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 30), new THREE.MeshBasicMaterial({ color: 0x0c1018 }))
platform.position.set(-14, 0.25, -14)
city.add(platform)
const railMat = new THREE.MeshBasicMaterial({ color: 0x2a3140 })
for(const x of [-15.4, -12.6]){
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 30), railMat)
  rail.position.set(x, 0.55, -14)
  city.add(rail)
}
const stationSign = addSign('SHINJUKU → SHIBUYA', '#7fd4ff', -14, 4.6, -10, 1.1)

const crossing = new THREE.Mesh(new THREE.PlaneGeometry(20, 14), new THREE.MeshBasicMaterial({ color: 0x0b0f17 }))
crossing.rotation.x = -Math.PI/2
crossing.position.set(0, 0.02, -50)
city.add(crossing)
const stripeMat = new THREE.MeshBasicMaterial({ color: 0x3a4356 })
for(let i=0;i<8;i++){
  const s = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 10), stripeMat)
  s.rotation.x = -Math.PI/2
  s.position.set(-7 + i*2, 0.03, -50)
  city.add(s)
}
const screenDefs = [['東京','#ff2e88',-6.5],['GAME','#00d4c8',6.5],['24','#ffe95a',0]]
for(const [t,c,x] of screenDefs){
  const s = addSign(t, c, x, 6.5, -57.5, 2.2)
  s.userData.isScreen = true
}

const vendingTex = canvasTex(128, 256, (ctx)=>{
  ctx.fillStyle = '#0d1420'; ctx.fillRect(0,0,128,256)
  ctx.fillStyle = '#1a2436'; ctx.fillRect(8,8,112,170)
  const drinks = ['#ff5a36','#00d4c8','#ffe95a','#ff2e88','#7fd4ff','#ffb36b']
  for(let y=0;y<4;y++) for(let x=0;x<4;x++){
    ctx.fillStyle = drinks[(y*4+x)%drinks.length]
    ctx.globalAlpha = 0.85
    ctx.fillRect(14+x*27, 16+y*40, 20, 30)
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = '#0d1420'; ctx.fillRect(0, 190, 128, 66)
  ctx.fillStyle = '#e8e6df'; ctx.font = 'bold 16px monospace'; ctx.textAlign='center'
  ctx.fillText('DRINK', 64, 230)
})
const vendingMachines = []
function addVending(x, z, secret=false){
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.9, 0.6), new THREE.MeshBasicMaterial({ color: 0x1a2230 }))
  body.position.y = 0.95
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.7), new THREE.MeshBasicMaterial({ map: vendingTex.tex }))
  front.position.set(0, 0.95, 0.31)
  g.add(body, front)
  g.position.set(x, 0, z)
  g.userData = { type:'vending', front, secret, clicks:0, lit:0 }
  city.add(g)
  vendingMachines.push(g)
  const hit = new THREE.Mesh(new THREE.BoxGeometry(1.4,2.2,1), new THREE.MeshBasicMaterial({ visible:false }))
  hit.position.copy(g.position); hit.position.y = 1.1
  hit.userData = { type:'vending', ref:g }
  city.add(hit)
  return g
}
addVending(3.4, -66)
addVending(-3.6, -71)
addVending(3.2, -74, true)
addVending(-3.4, -92)
addVending(3.5, -95)

const puddles = []
const puddleGeo = new THREE.CircleGeometry(1, 20)
for(let i=0;i<10;i++){
  const z = -8 - i*11 - Math.random()*4
  const x = (Math.random()-0.5)*10
  const mat = new THREE.MeshBasicMaterial({ color: 0x0e1626, transparent: true, opacity: 0.85 })
  const p = new THREE.Mesh(puddleGeo, mat)
  p.rotation.x = -Math.PI/2
  p.position.set(x, 0.04, z)
  p.scale.set(0.6+Math.random()*1.2, 0.4+Math.random()*0.6, 1)
  p.userData = { type:'puddle' }
  city.add(p)
  puddles.push(p)
}

const ripples = []
const rippleGeo = new THREE.RingGeometry(0.4, 0.5, 24)
for(let i=0;i<6;i++){
  const m = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }))
  m.rotation.x = -Math.PI/2
  m.visible = false
  m.userData = { life: 0 }
  city.add(m)
  ripples.push(m)
}
function spawnRipple(x, z){
  const r = ripples.find(r=>!r.visible) || ripples[0]
  r.position.set(x, 0.06, z)
  r.visible = true
  r.userData.life = 1
}

/* --- traffic signals -------------------------------------------------------
   A real signal: pole, head with three lenses, hood visors, and a
   pedestrian head beside it. The lens that is lit is the state, so the
   signal and the traffic are visibly the same thing. */
const LANE = { out: 7.6, in: -7.6 }
const signals = []
{
  const poleMat = new THREE.MeshBasicMaterial({ color: 0x24262b })
  const boxMat = new THREE.MeshBasicMaterial({ color: 0x14171c })
  const hoodMat = new THREE.MeshBasicMaterial({ color: 0x0d0f13 })
  const lensGeo = new THREE.CircleGeometry(0.085, 12)
  const mkLens = (hex) => {
    const m = new THREE.Mesh(lensGeo, new THREE.MeshBasicMaterial({ color: hex }))
    m.userData.base = new THREE.Color(hex)
    m.userData.off = new THREE.Color(hex).multiplyScalar(0.18)
    return m
  }
  const zSpots = [-44, -56, -70, -88, -102]
  zSpots.forEach((z, i) => {
    const side = i % 2 === 0 ? -1 : 1
    const g = new THREE.Group()
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 4.2, 8), poleMat)
    pole.position.y = 2.1
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.24, 8), poleMat)
    base.position.y = 0.12
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.80, 0.20), boxMat)
    head.position.set(0, 3.9, 0)
    /* three lenses, top to bottom: red, yellow, green */
    const lenses = {}
    ;[['red',0xff3020,0.28],['yellow',0xffc020,0],['green',0x30d060,-0.28]].forEach(([k, hex, off]) => {
      const l = mkLens(hex)
      l.position.set(0, 3.9 + off, 0.105)
      const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.13, 10, 1, true), hoodMat)
      hood.rotation.x = Math.PI / 2
      hood.position.set(0, 3.9 + off, 0.15)
      g.add(l, hood)
      lenses[k] = l
    })
    /* pedestrian head: a small box with two lenses */
    const ped = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 0.16), boxMat)
    ped.position.set(0, 2.6, 0)
    const pedRed = mkLens(0xff3020)
    pedRed.position.set(0, 2.70, 0.085)
    const pedGreen = mkLens(0x30d060)
    pedGreen.position.set(0, 2.50, 0.085)
    g.add(ped, pedRed, pedGreen)
    g.add(pole, base, head)
    g.position.set(side * (LANE.out + 1.5), 0, z)
    g.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2
    g.userData = { type: 'signal', lenses, pedRed, pedGreen, z }
    city.add(g)
    signals.push(g)
  })
}

/* the signal cycle drives BOTH the lights and the traffic/pedestrian
   behaviour, so what you see is what is happening */
const SIGNAL_CYCLE = ['green', 'yellow', 'red']
let signalIdx = 0, signalHold = 0
function updateSignals(dt){
  /* a held signal does not advance, so a specific state can be sustained */
  if (state.freezeSignal){ state.light = state.heldLight || state.light; paintSignals(state.light); return }
  signalHold -= dt
  if (signalHold <= 0){
    signalIdx = (signalIdx + 1) % SIGNAL_CYCLE.length
    /* green runs long, yellow is brief — the real proportion */
    signalHold = SIGNAL_CYCLE[signalIdx] === 'yellow' ? 2.4 : 9.5
    state.light = SIGNAL_CYCLE[signalIdx]
  }
  paintSignals(state.light)
}
/* paint the lenses for a given state; also the entry point tests use */
function paintSignals(cur){
  signals.forEach(s => {
    for (const k of ['red','yellow','green'])
      s.userData.lenses[k].material.color.copy(
        k === cur ? s.userData.lenses[k].userData.base : s.userData.lenses[k].userData.off)
    /* pedestrians get the opposite of vehicles, as they do in Tokyo */
    s.userData.pedRed.material.color.copy(
      cur === 'green' ? s.userData.pedRed.userData.base : s.userData.pedRed.userData.off)
    s.userData.pedGreen.material.color.copy(
      cur === 'red' ? s.userData.pedGreen.userData.base : s.userData.pedGreen.userData.off)
  })
}
/* force a signal state without waiting out the cycle; freeze holds it there */
function setSignal(want, freeze){
  const i = SIGNAL_CYCLE.indexOf(want)
  if (i > -1) signalIdx = i
  state.light = want
  state.heldLight = want
  state.freezeSignal = !!freeze
  signalHold = want === 'yellow' ? 2.4 : 9.5
  paintSignals(state.light)
}
const vehicleMats = makeVehicleMaterials()
const cars = []
let vehSeed = 5309
function addVehicle(type, x, z, dir){
  const v = buildVehicle({ type, materials: vehicleMats, seed: (vehSeed += 3571), parent: city })
  v.position.set(x, 0, z)
  v.userData.dir = dir
  v.userData.bodyMat.userData.base = v.userData.bodyMat.color.clone()
  cars.push(v)
  return v
}
for (let i = 0; i < 16; i++){
  const dir = i % 2 === 0 ? 1 : -1
  /* a real Tokyo street mix: taxis dominate, plus kei cars, hatchbacks,
     vans, a bus, a truck and bicycles on the kerb lane */
  const type = i % 7 === 3 ? 'taxi' : i % 7 === 5 ? 'van' : i % 7 === 6 ? 'bicycle'
    : i % 7 === 4 ? 'bus' : i % 7 === 2 ? 'kei' : i % 11 === 7 ? 'truck'
    : i % 4 === 1 ? 'minivan' : 'hatchback'
  const lane = dir > 0 ? LANE.out : LANE.in
  addVehicle(type, lane + (vehSeed % 7) * 0.2, -12 - i * 7.5 - (vehSeed % 4), dir)
}

/* --- the railway ------------------------------------------------------------
   A real running train (src/rail.js): viaduct deck, ballast, sleepers and
   rails along the whole line, a platform with a tactile edge, and a pooled
   four-car consist that approaches, stops, opens its doors, departs and
   wraps around. */
const railMats = makeRailMaterials()
const trackway = buildTrackway(city, railMats)
const train = buildTrain({ materials: railMats, parent: city, cars: 4 })
const trainHit = new THREE.Mesh(new THREE.BoxGeometry(4, 3.6, 18), new THREE.MeshBasicMaterial({ visible:false }))
trainHit.userData = { type:'train' }
city.add(trainHit)
/* people waiting on the platform, built after the character materials
   exist (see buildPlatformPeople below) */
const platformPeople = []
function buildPlatformPeople(){
  for (let i = 0; i < 5; i++){
    const g = buildCharacter({
      seed: (pedSeed += 611953), materials: charMats, parent: city
    })
    const r = mulberry(pedSeed)
    g.position.set(-14 + 3.4 + r() * 1.6, 1.06, -6 - i * 4.2 - r() * 1.4)
    g.rotation.y = -Math.PI / 2 + (r() - 0.5) * 0.4
    g.userData = { type: 'waiting', seed: pedSeed, bob: r() * 6, waiting: true }
    platformPeople.push(g)
  }
}
/* a signal that governs entry to the platform */
const railSignal = new THREE.Group()
{
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 8),
    new THREE.MeshBasicMaterial({ color: 0x2a2e35 }))
  mast.position.y = 2.6
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.9, 0.22),
    new THREE.MeshBasicMaterial({ color: 0x14171c }))
  head.position.y = 4.0
  railSignal.add(mast, head)
  const lenses = {}
  ;[['red',0xff3020,0.30],['green',0x30d060,-0.06]].forEach(([k, hex, off]) => {
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.10, 12),
      new THREE.MeshBasicMaterial({ color: hex }))
    l.position.set(0, 4.0 + off, 0.12)
    l.userData.base = new THREE.Color(hex)
    l.userData.off = new THREE.Color(hex).multiplyScalar(0.16)
    l.userData.key = k
    railSignal.add(l)
    lenses[k] = l
  })
  railSignal.position.set(-11.2, 1.06, 4)
  railSignal.userData = { lenses }
  city.add(railSignal)
}

/* --- people ---------------------------------------------------------------
   Full modular characters (src/characters.js): legs, shoes, torso, arms,
   hands, neck, head, hair and accessories, merged per material. Population
   size and gait come from the district profile, so Shinjuku is crowded
   and fast and Nakameguro is slow and thin. */
const charMats = makeCharacterMaterials()
const peds = []
const pedZones = [
  { x:[-8,8], z:[-44,-57], n: IS_TOUCH?4:7 },
  { x:[-2.6,2.6], z:[-63,-80], n: IS_TOUCH?2:4 },
  { x:[-5,5], z:[-86,-101], n: IS_TOUCH?3:5 }
]
function makePed(zone){
  const g = buildCharacter({
    seed: (pedSeed += 104729), materials: charMats, parent: city
  })
  const r = mulberry(pedSeed)
  g.position.set(zone.x[0]+r()*(zone.x[1]-zone.x[0]), 0, zone.z[0]+r()*(zone.x[1]-zone.z[0]))
  g.userData.zone = zone
  g.userData.dir = r() < 0.5 ? 1 : -1
  g.userData.speed = 0.35 + r() * 0.55
  g.userData.gait = 0.85 + r() * 0.4
  g.userData.lookT = 0
  g.userData.bob = r() * 10
  g.userData.type = 'ped'
  /* flat aliases so the weather systems and tests read one place */
  const rig = g.userData.rig
  g.userData.umbrella = rig.umbrella
  g.userData.bodyMat = g.userData.clothMat
  g.userData.baseCol = g.userData.clothMat.userData.base || g.userData.clothMat.color.clone()
  /* every part is clickable, not just the body */
  g.traverse(o => { if (o.isMesh) o.userData = { type:'ped', ref: g } })
  peds.push(g)
}
pedZones.forEach(z => { for (let i = 0; i < z.n; i++) makePed(z) })
buildPlatformPeople()
buildBayCrowd()

const cat = new THREE.Group()
const catMat = new THREE.MeshBasicMaterial({ color: 0x05060a })
const catBody = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.16), catMat)
catBody.position.y = 0.14
const catHead = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.14), catMat)
catHead.position.set(0.2, 0.3, 0)
const earGeo = new THREE.ConeGeometry(0.05, 0.1, 4)
const ear1 = new THREE.Mesh(earGeo, catMat); ear1.position.set(0.17, 0.4, 0.04)
const ear2 = new THREE.Mesh(earGeo, catMat); ear2.position.set(0.17, 0.4, -0.04)
const tail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.26, 0.03), catMat)
tail.position.set(-0.18, 0.24, 0)
tail.rotation.z = 0.4
cat.add(catBody, catHead, ear1, ear2, tail)
cat.position.set(1.9, 0, -70)
cat.userData = { type:'cat', running:false, speed:0 }
city.add(cat)
const catHit = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.8,0.9), new THREE.MeshBasicMaterial({ visible:false }))
catHit.position.copy(cat.position); catHit.position.y = 0.3
catHit.userData = { type:'cat' }
city.add(catHit)

const doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2), new THREE.MeshBasicMaterial({ color: 0xff5a36, transparent: true, opacity: 0 }))
doorGlow.position.set(-6.55, 1, -72.5)
doorGlow.rotation.y = Math.PI/2
city.add(doorGlow)
const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2, 0.95), new THREE.MeshBasicMaterial({ color: 0x1a140f }))
doorPanel.position.set(-6.5, 1, -72.5)
doorPanel.userData = { type:'door', hoverT: 0, openT: 0, open: false }
city.add(doorPanel)
const doorHit = new THREE.Mesh(new THREE.BoxGeometry(1, 2.2, 1.2), new THREE.MeshBasicMaterial({ visible:false }))
doorHit.position.set(-6.5, 1, -72.5)
doorHit.userData = { type:'door', ref: doorPanel }
city.add(doorHit)

const symbolTex = canvasTex(128, 128, (ctx)=>{
  ctx.clearRect(0,0,128,128)
  ctx.fillStyle = '#ff2e88'
  ctx.beginPath(); ctx.arc(64,64,56,0,Math.PI*2); ctx.fill()
  ctx.fillStyle = '#05070d'
  ctx.beginPath(); ctx.arc(64,64,20,0,Math.PI*2); ctx.fill()
})
const symbol = new THREE.Mesh(new THREE.PlaneGeometry(0.7,0.7), new THREE.MeshBasicMaterial({ map: symbolTex.tex, transparent: true, side: THREE.DoubleSide }))
symbol.position.set(10.9, 5.4, -95)
symbol.userData = { type:'symbol', pulse: 0 }
city.add(symbol)
const symbolHit = new THREE.Mesh(new THREE.BoxGeometry(1.2,1.2,1.2), new THREE.MeshBasicMaterial({ visible:false }))
symbolHit.position.set(10.9, 5.4, -95)
symbolHit.userData = { type:'symbol' }
city.add(symbolHit)

const bowlGroup = new THREE.Group()
const counter = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 1.2), new THREE.MeshBasicMaterial({ color: 0x12161f }))
counter.position.y = 0.5
bowlGroup.add(counter)
const bowl = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.22, 12, 24), new THREE.MeshBasicMaterial({ color: 0x2a1410 }))
bowl.rotation.x = Math.PI/2
bowl.position.y = 1.15
bowlGroup.add(bowl)
const bowlInner = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0x8a3b1e }))
bowlInner.rotation.x = -Math.PI/2
bowlInner.position.y = 1.12
bowlGroup.add(bowlInner)
const miniTex = canvasTex(128, 128, (ctx)=>{ ctx.fillStyle='#0a0d15'; ctx.fillRect(0,0,128,128) })
const miniStreet = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), new THREE.MeshBasicMaterial({ map: miniTex.tex }))
miniStreet.rotation.x = -Math.PI/2
miniStreet.position.y = 1.14
bowlGroup.add(miniStreet)
const chopsticks = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.5), new THREE.MeshBasicMaterial({ color: 0xd8c9a8 }))
chopsticks.position.set(0.1, 1.28, 0.1)
chopsticks.rotation.z = 0.5
bowlGroup.add(chopsticks)
bowlGroup.position.set(2.2, 0, -68)
bowlGroup.userData = { type:'bowl' }
city.add(bowlGroup)
const bowlHit = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 1.4), new THREE.MeshBasicMaterial({ visible:false }))
bowlHit.position.set(2.2, 0.8, -68)
bowlHit.userData = { type:'bowl' }
city.add(bowlHit)

const steamGeo = new THREE.BufferGeometry()
const steamCount = 50
const steamPos = new Float32Array(steamCount*3)
const steamSeed = []
for(let i=0;i<steamCount;i++){
  steamPos[i*3] = 2.2 + (Math.random()-0.5)*0.6
  steamPos[i*3+1] = 1.3 + Math.random()*1.4
  steamPos[i*3+2] = -68 + (Math.random()-0.5)*0.6
  steamSeed.push(Math.random()*10)
}
steamGeo.setAttribute('position', new THREE.BufferAttribute(steamPos, 3))
const steamMat = new THREE.PointsMaterial({ color: 0xcfd6e4, size: 0.09, transparent: true, opacity: 0.2, depthWrite: false })
const steam = new THREE.Points(steamGeo, steamMat)
city.add(steam)

const arcadeCab = new THREE.Group()
const cabBody = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 0.8), new THREE.MeshBasicMaterial({ color: 0x101623 }))
cabBody.position.y = 0.95
const cabScreenTex = canvasTex(128, 96, (ctx)=>{
  ctx.fillStyle = '#02040a'; ctx.fillRect(0,0,128,96)
  ctx.fillStyle = '#00d4c8'
  for(let i=0;i<40;i++) ctx.fillRect(Math.random()*128, Math.random()*96, 3, 3)
  ctx.fillStyle = '#ff2e88'; ctx.fillRect(56, 60, 16, 16)
})
const cabScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.68), new THREE.MeshBasicMaterial({ map: cabScreenTex.tex }))
cabScreen.position.set(0, 1.35, 0.41)
arcadeCab.add(cabBody, cabScreen)
arcadeCab.position.set(-2.2, 0, -94)
arcadeCab.rotation.y = 0.4
arcadeCab.userData = { type:'arcade' }
city.add(arcadeCab)
const arcadeHit = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.2, 1.2), new THREE.MeshBasicMaterial({ visible:false }))
arcadeHit.position.set(-2.2, 1, -94)
arcadeHit.userData = { type:'arcade' }
city.add(arcadeHit)

const claw = new THREE.Group()
const clawBody = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 1), new THREE.MeshBasicMaterial({ color: 0x181020 }))
clawBody.position.y = 0.9
claw.add(clawBody)
const clawGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.2), new THREE.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.12 }))
clawGlass.position.set(0, 1.1, 0.51)
claw.add(clawGlass)
const clawArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), new THREE.MeshBasicMaterial({ color: 0xff2e88 }))
clawArm.position.set(0, 1.6, 0.2)
claw.add(clawArm)
const clawHand = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.3), new THREE.MeshBasicMaterial({ color: 0xffe95a }))
clawHand.position.set(0, 1.15, 0.2)
claw.add(clawHand)
for(let i=0;i<5;i++){
  const prize = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: [0xff5a36,0x00d4c8,0xffe95a,0xff2e88,0x7fd4ff][i] }))
  prize.position.set(-0.4+i*0.2, 0.25, 0.2+Math.random()*0.15)
  claw.add(prize)
}
claw.position.set(1.6, 0, -96)
claw.userData = { type:'claw', dropT: 0 }
city.add(claw)
const clawHit = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.1, 1.3), new THREE.MeshBasicMaterial({ visible:false }))
clawHit.position.set(1.6, 1, -96)
clawHit.userData = { type:'claw', ref: claw }
city.add(clawHit)

const rainGeo = new THREE.BufferGeometry()
const rainCount = IS_TOUCH ? 900 : 2600
const rainPos = new Float32Array(rainCount*3)
for(let i=0;i<rainCount;i++){
  rainPos[i*3] = (Math.random()-0.5)*36
  rainPos[i*3+1] = Math.random()*26
  rainPos[i*3+2] = -35 + Math.random()*40
}
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3))
const rainMat = new THREE.PointsMaterial({ color: 0x8fa8c8, size: 0.06, transparent: true, opacity: 0.35, depthWrite: false })
const rain = new THREE.Points(rainGeo, rainMat)
camera.add(rain)
scene.add(camera)

  /* fireworks: real 3D bursts above the skyline, scaled by intensity */
  const fwBursts = []
  const fwSmoke = []
  let fwNext = 0
  let fwFlash = 0
  /* one shared additive light so a burst actually illuminates the street */
  const fwLight = new THREE.PointLight(0xffd9a0, 0, 260, 2)
  fwLight.position.set(0, 60, -190)
  scene.add(fwLight)
  /* and a wide ground flash, so wet roads and blossom pick it up */
  const fwGround = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 420),
    new THREE.MeshBasicMaterial({ color: 0xffd0a0, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending })
  )
  fwGround.rotation.x = -Math.PI / 2
  fwGround.position.set(0, 0.06, -90)
  scene.add(fwGround)
  const fwSmokeTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64
    const x = c.getContext('2d')
    const g = x.createRadialGradient(32, 32, 2, 32, 32, 31)
    g.addColorStop(0, 'rgba(180,170,160,0.55)')
    g.addColorStop(0.6, 'rgba(150,142,134,0.22)')
    g.addColorStop(1, 'rgba(140,132,124,0)')
    x.fillStyle = g; x.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(c)
  })()
  /* FIREWORKS INTENSITY: low / medium / high, an event layer on top of
     whatever weather is running — never exclusive with it */
  const FW_LEVELS = { low: 0.45, medium: 1, high: 1.7 }
  let fwSeed = 20260806
  function fwRnd(){
    fwSeed = (fwSeed * 1103515245 + 12345) & 0x7fffffff
    return fwSeed / 0x7fffffff
  }
  function spawnFirework(t){
    const lvl = FW_LEVELS[state.fwLevel] || 1
    const n = Math.round(46 + 74 * lvl)
    const pos = new Float32Array(n * 3)
    const vel = []
    /* launch point: high, wide, and biased down the street so it sits in
       front of the camera rather than behind it */
    const cx = (fwRnd() - 0.5) * 110
    const cy = 52 + fwRnd() * 42
    const cz = -120 - fwRnd() * 130
    const cols = [0xffd9a0, 0xff9a6a, 0x9adfff, 0xffb3c8, 0xe8f0ff, 0xfff2c4]
    const col = cols[(fwRnd() * cols.length) | 0]
    for (let i = 0; i < n; i++){
      pos[i*3] = cx; pos[i*3+1] = cy; pos[i*3+2] = cz
      const th = fwRnd() * Math.PI * 2, ph = Math.acos(2 * fwRnd() - 1)
      const sp = (5 + fwRnd() * 12) * (0.65 + lvl * 0.55)
      vel.push([Math.sin(ph)*Math.cos(th)*sp, Math.cos(ph)*sp, Math.sin(ph)*Math.sin(th)*sp * 0.34])
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const m = new THREE.PointsMaterial({
      color: col, size: 1.1 + lvl * 0.5, transparent: true, opacity: 1,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
    })
    const pts = new THREE.Points(g, m)
    pts.frustumCulled = false
    scene.add(pts)
    fwBursts.push({ pts, vel, life: 1, max: 1.1 + fwRnd() * 0.8, col })
    /* smoke hangs where the burst was, and lingers longer at HIGH */
    if (lvl > 0.7){
      const puff = new THREE.Sprite(new THREE.SpriteMaterial({
        map: fwSmokeTex, transparent: true, opacity: 0.20 + lvl * 0.14,
        depthWrite: false, color: 0x9a948c
      }))
      puff.position.set(cx, cy, cz)
      puff.scale.setScalar(14 + lvl * 16)
      scene.add(puff)
      fwSmoke.push({ puff, life: 1, max: 2.6 + lvl * 2.4 })
    }
    fwFlash = Math.max(fwFlash, 0.35 + lvl * 0.35)
    fwLight.position.set(cx, cy, cz)
    fwLight.color.setHex(col)
  }
const streakN = IS_TOUCH ? 130 : 320
const streakBase = new Float32Array(streakN*3)
const streakGeo = new THREE.BufferGeometry()
const streakPos = new Float32Array(streakN*6)
for (let i=0;i<streakN;i++){
  streakBase[i*3] = (Math.random()-0.5)*36
  streakBase[i*3+1] = Math.random()*24
  streakBase[i*3+2] = -35 + Math.random()*44
}
streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3))
const streakMat = new THREE.LineBasicMaterial({ color: 0x9fb4d8, transparent: true, opacity: 0, depthWrite: false })
const streaks = new THREE.LineSegments(streakGeo, streakMat)
streaks.frustumCulled = false
streaks.visible = false
camera.add(streaks)


const $ = id => document.getElementById(id)

const cursorEl = $('cursor')
const cursorLabel = $('cursor-label')
const cursorPos = { x: innerWidth/2, y: innerHeight/2 }
const cursorTarget = { x: innerWidth/2, y: innerHeight/2 }
function setCursor(state, label){
  cursorEl.className = state === 'default' ? '' : 'wide'
  cursorLabel.textContent = label || ''
}
window.addEventListener('pointermove', e => {
  cursorTarget.x = e.clientX
  cursorTarget.y = e.clientY
})
window.addEventListener('pointerdown', () => {
  if (soundOn) blip()
})

const state = {
  mode:'hero',
  fireworks: false,
  fwLevel: 'medium',
  p:0,
  clock: 23*60+47,
  trafficT:0,
  light:'green',
  guide:null,
  it:[],
  filters:new Set(),
  reduce: REDUCED,
  frames:0,
  rendered:0,
  listening:false,
  speaking:false
}

const camPos = new THREE.Vector3()
const camLook = new THREE.Vector3()

/* ------------------------------------------------------------------ *
 *  TOUR — scroll is the primary mechanism. No pointer parallax.      *
 * ------------------------------------------------------------------ */

const TOUR = [
  { at:0.00, pos:[0, 15, 34],     look:[0, 7, -40],    district:'Shinjuku',
    idx:'01', title:'The city is <em>just waking up.</em>',
    body:'Rain over the expressway. Somewhere below, a kitchen light comes on at two in the morning. Tokyo is not asleep \u2014 it has simply changed its shift.' },
  { at:0.09, pos:[0, 3.6, 6],      look:[-2, 2.6, -28], district:'Nishi-Shinjuku',
    idx:'02', title:'Follow the light.',
    body:'We leave the wide road behind. The lane narrows. Steam lifts from a doorway, and someone has left a single lamp on for the people who know where to look.' },
  { at:0.18, pos:[1.4, 2.2, -26],   look:[-1, 1.8, -42], district:'Harajuku',
    idx:'03', title:'Dinner, <em>without the crowd.</em>',
    body:'Twelve seats. A menu written when you sit down. The kitchen has been running since five, and the chef will decide what tonight tastes like.' },
  { at:0.27, pos:[0, 2.6, -40],     look:[0, 1.6, -54],  district:'Shibuya',
    idx:'04', title:'Thousands of stories <em>cross here every night.</em>',
    body:'The scramble crossing empties for perhaps ninety seconds each hour. That minute is the closest thing Tokyo has to a private moment.',
    ref: MEDIA.shibuya.reference },
  { at:0.36, pos:[0.6, 2.0, -54],   look:[-1, 1.6, -68], district:'Nakameguro',
    idx:'05', title:'The Tokyo <em>most visitors never see.</em>',
    body:'One street back from the light the volume drops completely. Low-rise cafés, a river two blocks over, and a cat that owns the pavement.',
    ref: MEDIA.sakura.reference },
  { at:0.45, pos:[-0.8, 2.1, -68],  look:[1, 1.8, -82],  district:'Roppongi',
    idx:'06', title:'A city that <em>rewards the detour.</em>',
    body:'Galleries on the upper floors and nothing on the street to advertise them. The loudest district in Tokyo is quiet from this side of the road.' },
  { at:0.54, pos:[0.4, 2.3, -82],   look:[0, 1.7, -96],  district:'Ginza',
    idx:'07', title:'Everything <em>under glass.</em>',
    body:'Wide road, clean stone, and shopfronts that are lit like galleries rather than shops. Nobody hurries here, including the traffic.' },
  { at:0.63, pos:[0, 2.5, -96],     look:[0, 1.7, -110], district:'Tsukiji',
    idx:'08', title:'The market <em>before the market.</em>',
    body:'At this hour the wholesale trade is over and the counters are waking up instead. Tamagoyaki on a grill, uni cut by hand, knives three generations old.' },
  { at:0.72, pos:[0.6, 2.2, -110],  look:[-1, 1.7, -124],district:'Akihabara',
    idx:'09', title:'Ten floors <em>of everything.</em>',
    body:'Electronics, manga, games and model kits, stacked to the ceiling. The trains run under the district rather than through it, and you can hear them before you see them.' },
  { at:0.81, pos:[-0.4, 2.2, -124], look:[0, 1.8, -138], district:'Asakusa',
    idx:'10', title:'Older <em>than the city around it.</em>',
    body:'Sensō-ji has been standing on this ground since the seventh century, and Nakamise still belongs to the shopkeepers rather than the coaches. Lanterns, not screens.',
    ref: MEDIA.asakusa.reference },
  { at:0.885, pos:[0.4, 2.6, -138],  look:[0, 5, -158],  district:'Asakusa',
    idx:'11', title:'Lanterns <em>instead of screens.</em>',
    body:'Two thousand red lanterns on a single gate, and not one of them is trying to sell you anything. This is the part of Tokyo that predates all of it.' },
  { at:0.945, pos:[2, 3.0, -150],    look:[-6, 6, -186],  district:'Odaiba',
    idx:'12', title:'And then <em>the city lets you go.</em>',
    body:'Past Asakusa the walls stop. Tokyo Bay opens out, the Rainbow Bridge comes back toward you, and the skyline you have been walking through for an hour is suddenly in front of you instead of around you.',
    ref: MEDIA.shibuya.reference },
  { at:1.00, pos:[0, 12, -176],      look:[0, 8, -232],   district:'Rooftop',
    idx:'13', title:'Above it, <em>the city keeps moving.</em>',
    body:'You made it. From up here the rain stops falling on you. Below, a train runs near empty, a shop pulls its shutter, and another night begins without ceremony.' }
]


/* Normal motion: smooth cinematic travel between waypoints. */
function camAt(p){
  let i = 0
  while(i < TOUR.length-2 && p > TOUR[i+1].at) i++
  const a = TOUR[i], b = TOUR[i+1]
  const t = smooth(clamp((p - a.at)/(b.at - a.at), 0, 1))
  camPos.set(lerp(a.pos[0],b.pos[0],t), lerp(a.pos[1],b.pos[1],t), lerp(a.pos[2],b.pos[2],t))
  camLook.set(lerp(a.look[0],b.look[0],t), lerp(a.look[1],b.look[1],t), lerp(a.look[2],b.look[2],t))
}

/* Reduced motion (§47): NO cinematic travel. The camera represents the district
   you are in by sitting at that district's viewpoint at street height. It steps
   between districts rather than flying, swooping or continuously interpolating,
   so scroll position, district content, discovery, dialogue and the map all keep
   working exactly as before. */
function camAtStatic(p){
  let best = 0, bestD = Infinity
  for (let i = 0; i < TOUR.length; i++){
    const d = Math.abs(TOUR[i].at - p)
    if (d < bestD){ bestD = d; best = i }
  }
  const w = TOUR[best]
  /* hold a human, street-level height: never the opening aerial shot */
  const y = clamp(w.pos[1], 1.75, 2.6)
  camPos.set(w.pos[0], y, w.pos[2])
  camLook.set(w.look[0], w.look[1], w.look[2])
}

/* ---------------------------- chapters ---------------------------- */

const chaptersEl = $('chapters')
/* Each chapter carries its district's real, verified photograph, plus a
   credit line. Districts with no verified still simply have no figure —
   nothing is invented to fill the gap. */
const CHAPTER_MEDIA = {
  Shinjuku: 'shinjuku', 'Nishi-Shinjuku': 'shinjuku', Harajuku: 'harajuku',
  Shibuya: 'shibuya', Nakameguro: 'nakameguro', Roppongi: 'roppongi',
  Ginza: 'ginza', Tsukiji: 'tsukiji', Akihabara: 'akihabara',
  Asakusa: 'asakusa', Odaiba: 'odaiba'
}
TOUR.forEach((c, i) => {
  const d = document.createElement('section')
  d.className = 'chapter' + (i % 2 ? ' right' : '')
  const mk = CHAPTER_MEDIA[c.district]
  const entry = mk ? MEDIA[mk] : null
  const img = entry && entry.image
  const shot = entry && (entry.bridge || null)
  /* Odaiba gets both: the district and the bridge that reaches it */
  const pics = entry
    ? [entry.image, entry.bridge].filter(Boolean)
    : []
  const figure = pics.length
    ? '<figure class="chap-media">' + pics.map((m, k) =>
        '<img src="' + m.url + '" alt="' + (m.alt || c.district) + '" loading="lazy" data-k="' + k + '">'
      ).join('') +
      '<figcaption>' + pics.map(m =>
        m.credit + ' · <a href="' + m.source + '" target="_blank" rel="noopener">source</a>'
      ).join('<br>') + '</figcaption></figure>'
    : ''
  const refs = []
  if (c.ref) refs.push('<a class="chap-ref mono" href="' + c.ref.url + '" target="_blank" rel="noopener">Official guide ↗</a>')
  if (entry && entry.gallery) refs.push('<a class="chap-ref mono" href="' + entry.gallery.url + '" target="_blank" rel="noopener">More photographs ↗</a>')
  void img; void shot
  d.innerHTML = '<div class="idx mono">' + c.idx + ' / ' + c.district + '</div>' +
                '<h2>' + c.title + '</h2>' +
                figure +
                '<p>' + c.body + '</p>' +
                (refs.length ? refs.join('') : '')
  chaptersEl.appendChild(d)
})

/* Where does a given depth along the street fall in the journey? Derived from
   the TOUR so nobody has to hand-maintain a number that can drift out of sync
   with the camera path. */
function pForZ(z){
  let a = TOUR[0], b = TOUR[TOUR.length - 1]
  for (let i = 0; i < TOUR.length - 1; i++){
    if (z <= TOUR[i].pos[2] && z >= TOUR[i + 1].pos[2]){ a = TOUR[i]; b = TOUR[i + 1]; break }
    if (z > TOUR[0].pos[2]){ a = b = TOUR[0]; break }
  }
  const span = a.pos[2] - b.pos[2]
  const t = span === 0 ? 0 : clamp((a.pos[2] - z) / span, 0, 1)
  return a.at + (b.at - a.at) * t
}

/* ------------------------------ people ---------------------------- */

function makePerson(x, z, coat, accent, facing){
  const g = new THREE.Group()
  const bodyMat = new THREE.MeshBasicMaterial({ color: coat })
  const trimMat = new THREE.MeshBasicMaterial({ color: accent })
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.86, 8), bodyMat)
  legs.position.y = 0.43
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.68, 10), bodyMat)
  torso.position.y = 1.2
  const coatFringe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.1), trimMat)
  coatFringe.position.set(0, 0.86, 0.14)
  const shoulders = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.2, 0.1, 10), trimMat)
  shoulders.position.y = 1.56
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 6), bodyMat)
  neck.position.y = 1.63
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 10), bodyMat)
  head.position.y = 1.76
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.62, 32),
    new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false })
  )
  ring.rotation.x = -Math.PI/2
  ring.position.y = 0.03
  /* an invisible, generous click volume so people are easy to hit on touch (§46) */
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.62, 2.3, 8),
    new THREE.MeshBasicMaterial({ visible: false })
  )
  hit.position.y = 1.1
  g.add(legs, torso, coatFringe, shoulders, neck, head, ring, hit)
  g.position.set(x, 0, z)
  g.rotation.y = facing || 0
  g.userData = {
    head, ring, sway: Math.random() * 6,
    home: new THREE.Vector3(x, 0, z),
    turned: -999, baseFacing: facing || 0,
    phase: Math.random() * 6.28
  }
  city.add(g)
  return g
}

/* NPC visual identity: interactive characters carry a role prop so they
   read as people with jobs, not generic figures. Static geometry —
   the head/turn animation already gives them life. */
function addProp(person, kind){
  const m = person.mesh
  if (!m) return
  if (kind === 'camera'){
    const cam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x0c0e12 }))
    cam.position.set(0, 1.32, 0.24)
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 8),
      new THREE.MeshBasicMaterial({ color: 0x1c2434 }))
    lens.rotation.x = Math.PI / 2
    lens.position.set(0, 1.32, 0.33)
    m.add(cam, lens)
    m.userData.prop = cam
  } else if (kind === 'toque'){
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.16, 10),
      new THREE.MeshBasicMaterial({ color: 0xe8e2d4 }))
    hat.position.y = 1.9
    m.add(hat)
  } else if (kind === 'tablet'){
    const tab = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.28),
      new THREE.MeshBasicMaterial({ color: 0x9db8d8, side: THREE.DoubleSide }))
    tab.position.set(0.24, 1.2, 0.18)
    tab.rotation.x = -0.5
    m.add(tab)
  }
}

/* Each character knows who they are, where they are, and what they can advise (§13).
   `near` is the real place in LOCATIONS a character is NEAR. None of these people work
   for, are employed by, or are otherwise connected to any real business — they are
   fictional characters and nothing in the dialogue implies otherwise (§42). */
const PEOPLE = [
  { id:'akira',  name:'Akira',  role:'Local guide',           district:'Nishi-Shinjuku', near:'omoide',   knows:'nightlife, hidden streets, late-night dining',
    x:-2.2, z:-8,  facing: 1.1,  coat:0x2b2620, accent:0xa8894f, idle:'phone' },
  { id:'yuki',   name:'Yuki',   role:'Private cultural guide', district:'Yoyogi',        near:'meiji',    knows:'temples, shrines, quiet lanes, cultural context',
    x:-2.4, z:-30, facing: 1.2,  coat:0x2b2620, accent:0xc9a961, idle:'guide' },
  { id:'aoi',    name:'Aoi',    role:'Chef',                  district:'Minami-Aoyama', near:'narisawa', knows:'Japanese cuisine, ingredients, kaiseki, food etiquette',
    x:0.7,  z:-46, facing:-0.9,  coat:0x33291f, accent:0xd8c9a8, idle:'chef' },
  { id:'rei',    name:'Rei',    role:'Luxury concierge',      district:'Ginza',         near:'jiro',     knows:'shopping, design, fine dining, private experiences',
    x:2.4,  z:-54, facing:-1.2,  coat:0x2a2530, accent:0xb9aec4, idle:'curator' },
  { id:'haruki', name:'Haruki', role:'Sake curator',          district:'Ginza',         near:'birdland', knows:'sake, grain, brewing, pairing',
    x:2.6,  z:-70, facing:-1.4,  coat:0x241f1c, accent:0xa8894f, idle:'host' },
  { id:'sora',   name:'Sora',   role:'Photographer',          district:'Shibuya',       knows:'photography, street culture, night views, quiet observation points',
    x:-2.8, z:-78, facing: 1.4,  coat:0x22262c, accent:0xc9d4dc, idle:'photo' },
  { id:'ren',    name:'Ren',    role:'Independent designer', district:'Kuramae',       knows:'craft, textiles, small studios, independent makers',
    x:-2.6, z:-90, facing: 1.5,  coat:0x2a2530, accent:0xb9aec4, idle:'curator' },
  { id:'mika',   name:'Mika',   role:'Tea practitioner',      district:'Minami-Aoyama', near:'ippodo',   knows:'matcha, ceremony, gyokuro, tea etiquette',
    x:2.2,  z:-100,facing:-1.1,  coat:0x36302a, accent:0xc9a961, idle:'host' },
  { id:'kenji',  name:'Kenji',  role:'Record dealer',         district:'Shimokitazawa', near:'tsuwajiri',knows:'vinyl, jazz, city pop, listening rooms',
    x:-2.4, z:-104,facing: 1.0,  coat:0x2e2a26, accent:0xc9a961, idle:'phone' }
]
const chipLayer = $('chip-layer')
PEOPLE.forEach(p => {
  p.mesh = makePerson(p.x, p.z, p.coat, p.accent, p.facing)
  p.mesh.userData.type = 'person'
  p.mesh.userData.id = p.id
  /* each person is available around the stretch of street they stand on */
  const at = pForZ(p.z)
  p.at = at
  p.from = Math.max(0, at - 0.055)
  p.to = Math.min(1, at + 0.055)
  const chip = document.createElement('button')
  chip.className = 'guide-chip'
  chip.setAttribute('aria-label', 'Speak with ' + p.name + ', ' + p.role + ' in ' + p.district)
  chip.innerHTML = '<span class="dot"></span><span>' + p.name +
    '<small>' + p.role + ' · ' + p.district + '</small></span>'
  chip.addEventListener('click', () => openDialogue(p.id))
  chipLayer.appendChild(chip)
  p.chip = chip
})
/* role props: photographer, chef, concierge read at a glance */
{
  const byId = id => PEOPLE.find(p => p.id === id)
  const sora = byId('sora'); if (sora) addProp(sora, 'camera')
  const aoi = byId('aoi'); if (aoi) addProp(aoi, 'toque')
  const rei = byId('rei'); if (rei) addProp(rei, 'tablet')
}

/* --------------------------- dialogue ---------------------------- */

const DIALOGUE = {
  akira: {
    open: "I live two streets that way, so I know this hour better than anyone. What are you doing tonight?",
    options: [
      { t:'Something quiet, ideally.', go:'quiet' },
      { t:'Where do you eat after work?', go:'eat' },
      { t:'Is it busy around here?', go:'busy' }
    ],
    quiet: { say:"Quiet. Then cross the tracks and keep walking — the streets past the west exit get residential very fast. Golden Gai is the opposite of quiet, so not that.",
      follow:"Shall I mark a route for you?", add:'West-Shinjuku night walk' },
    eat: { say:"Honest answer? I eat standing at a counter in Omoide Yokocho. It is under the railway, it is never quiet, and it is open when I finish.",
      follow:"Add it to the evening?", add:'Omoide Yokocho, under the tracks', loc:'omoide' },
    busy: { say:"Right now, quiet. The last train has not come through yet, so it empties and refills about every twenty minutes. Wait five and it fills; wait ten and it empties.",
      follow:"I can show you the good timing.", add:'Golden Gai after last train', loc:'golden' }
  },
  yuki: {
    open: "Good evening. I know Tokyo can feel overwhelming at first — everywhere is lit, everywhere is loud. Tell me what you are looking for tonight.",
    options: [
      { t:'Show me somewhere quiet.', go:'quiet' },
      { t:'I want exceptional food.', go:'food' },
      { t:'I want to see Tokyo after midnight.', go:'midnight' },
      { t:'Take me somewhere locals love.', go:'locals' }
    ],
    quiet: { say:"Then we leave the main roads entirely. Kagurazaka has stone lanes and old wooden facades — at this hour almost everything is closed, which is exactly the point. We walk, and stop wherever a light is still on.",
      follow:"Shall I arrange it?", add:'Kagurazaka evening walk', loc:'kagari' },
    food: { say:"Then I would not choose by reputation. Aoi is cooking in Shibuya tonight — twelve seats, no menu until you sit down. I will make the reservation and put us at the counter.",
      follow:"I will confirm the counter seat.", add:'Private counter dinner', loc:'jiro' },
    midnight: { say:"After midnight the interesting doors open. Golden Gai has no sign and no map — a hundred bars in six alleyways. We go in, we don't overstay, and we leave when it feels right.",
      follow:"I will keep the evening open.", add:'Golden Gai, after hours', loc:'golden' },
    locals: { say:"Then let's skip the obvious places. There is a small counter in Kagurazaka where the chef still knows every guest by name. Six seats, seasonal menu, no sign outside.",
      follow:"I will arrange the reservation.", add:'Kagurazaka counter' },
    more: { say:"Of course. Six seats. A menu that changes with the market that morning. No sign outside — I will send you the address the day before, and the doorman will know your name.",
      follow:"Add it to the evening?", add:'Kagurazaka counter', loc:'kagari' }
  },
  aoi: {
    open: "Welcome. Sit anywhere at the counter — I will decide what you eat tonight. Tell me what you usually like, so I know what to avoid.",
    options: [
      { t:'I like strong, simple flavours.', go:'strong' },
      { t:'I am curious about anything.', go:'curious' },
      { t:'Something light before a long night.', go:'light' }
    ],
    strong: { say:"Good. Then tonkotsu, properly made — pork bone for two days, nothing added that does not need to be there. I will add a small dish of chashu you did not order.",
      follow:"Add the dinner?", add:'Tonkotsu & chashu', loc:'maisen' },
    curious: { say:"Then we start with the clear broth and work outward. Everything tonight was bought this morning. You will taste the difference by the second spoonful.",
      follow:"Reserve the counter?", add:'Chef\'s tasting counter', loc:'narisawa' },
    light: { say:"Light, then. Clear soup, grilled fish, pickles. We keep it delicate and let the sake do the evening's work.",
      follow:"Reserve the counter?", add:'Light counter dinner', loc:'menchi' }
  },
  rei: {
    open: "Tokyo changes clothes every season and most visitors only see the department stores. What are you actually drawn to?",
    options: [
      { t:'Quiet, considered pieces.', go:'quiet' },
      { t:'Traditional craft.', go:'craft' },
      { t:'Something that does not exist yet.', go:'avant' }
    ],
    quiet: { say:"Then Daikanyama, not Omotesando. Studios rather than storefronts — you will meet the maker, and nothing will be for sale before it is finished.",
      follow:"Arrange the visit?", add:'Daikanyama studio visit' },
    craft: { say:"Nihonbashi. Indigo dyeing, hand-cut blades, a family working kintsugi since 1953. We see the workshop before anyone shows a price.",
      follow:"Arrange the visit?", add:'Nihonbashi craft atelier' },
    avant: { say:"Then Kuramae, in the converted warehouses. Three collections that will not exist next year, and a curator who will show you the ones that never sold.",
      follow:"Arrange the visit?", add:'Kuramae private viewing' }
  },
  sora: {
    open: "Give me one minute and I will get the shot — the light on this street lasts about four minutes at this hour. Meanwhile: what is this for?",
    options: [
      { t:'A gift for someone difficult.', go:'gift' },
      { t:'I want Tokyo, not the tourists.', go:'real' },
      { t:'Something for myself.', go:'self' }
    ],
    gift: { say:"Then not the standard souvenir. I would shoot something quiet — a shopfront at closing time, hands, a bowl nobody is watching. It travels and it cannot be returned.",
      follow:"Add the photo session?", add:'Private street photography' },
    real: { say:"Then we walk away from the crossing. Give me four minutes and I will show you Tokyo — the reflections, the vending machines, the people who live above the shops.",
      follow:"Add the walk?", add:'Off-crossing photo walk' },
    self: { say:"Then we take your time. I will not shoot until you stop walking — the picture is usually behind you, not in front.",
      follow:"Add the session?", add:'Unhurried portrait session' }
  },
  kenji: {
    open: "Everyone asks for the same three records. Nobody asks for the one in the back. What are you listening to?",
    options: [
      { t:'Something I have never heard.', go:'new' },
      { t:'Jazz from another country.', go:'jazz' },
      { t:'Whatever you would play me.', go:'you' }
    ],
    new: { say:"Good. Then we go left at the end of this aisle — city pop, and the record shops that kept it alive while everyone was looking elsewhere.",
      follow:"Shall we go?", add:'Shimokitazawa record trail', loc:'tsuwajiri' },
    jazz: { say:"I have a small jazz room two streets over that only plays vinyl. Four seats. Tell them Kenji sent you and sit at the back.",
      follow:"Arrange the listening room?", add:'Vinyl listening room' },
    you: { say:"Then I would play you the record I bought on my first month in Tokyo. It cost almost nothing and it is the only reason I stayed.",
      follow:"Play it for us?", add:'Records with Kenji' }
  },
  haruki: {
    open: "Good evening. Before we taste anything — how do you usually drink? There is no wrong answer, it only changes what I pour.",
    options: [
      { t:'Something rare and unfamiliar.', go:'rare' },
      { t:'Dry and precise.', go:'dry' },
      { t:'Full-bodied, warming.', go:'full' }
    ],
    rare: { say:"Then junmai daiginjo, poured cold and taken slowly. It will be quiet — almost nothing on the palate, which is exactly the point. The brewer is two hours from here.",
      follow:"Arrange the tasting?", add:'Rare junmai tasting', loc:'birdland' },
    dry: { say:"Then I would pour genshu, warmed a little below body temperature. It should smell of green apple and snow. Anything more elaborate would drown it.",
      follow:"Arrange the tasting?", add:'Warm genshu flight', loc:'birdland' },
    full: { say:"Then sairei, warmed properly — you will feel it in the chest. We will pair it with the grilled eel and let it sit on the tongue.",
      follow:"Arrange the tasting?", add:'Sairei & grilled eel', loc:'birdland' }
  },
  ren: {
    open: "Tokyo changes clothes every season and most people never see it. If you want the real thing, we skip the department store. What are you drawn to?",
    options: [
      { t:'Quiet, considered design.', go:'quiet' },
      { t:'Traditional craft.', go:'craft' },
      { t:'Something avant-garde.', go:'avant' }
    ],
    quiet: { say:"Then Daikanyama, and a studio with no sign. Everything is made by one person, in small runs. You will meet the maker, and nothing will be for sale before it is ready.",
      follow:"Arrange the visit?", add:'Daikanyama atelier visit' },
    craft: { say:"Nihonbashi, then. Indigo dyeing, hand-cut blades, a family working kintsugi since 1953. You will see the workshop before anyone shows you a price.",
      follow:"Arrange the visit?", add:'Nihonbashi craft atelier' },
    avant: { say:"Then we go where the students are — a converted warehouse in Kuramae with three collections that will not exist next year. I know the curator.",
      follow:"Arrange the visit?", add:'Kuramae private viewing' }
  },
  mika: {
    open: "Tea is not a drink here, it is a pause. Please — sit. If it is your first time, I will start where most people start.",
    options: [
      { t:'This is new to me.', go:'first' },
      { t:'I know a little.', go:'some' },
      { t:'Surprise me.', go:'surprise' }
    ],
    first: { say:"Then sencha, whisked in front of you, so you see the foam. The first bowl is always too hot and too bitter — that is correct. The second one is where it begins to make sense.",
      follow:"Add the ceremony?", add:'Private tea ceremony', loc:'ippodo' },
    some: { say:"Then we skip the usual and go straight to gyokuro — shaded for three weeks, brewed cool, almost nothing on the tongue but very much there.",
      follow:"Add the ceremony?", add:'Gyokuro tasting', loc:'ippodo' },
    surprise: { say:"Good. Then I will choose, and you will not know until it is in front of you. That is the most honest way to be introduced to anything.",
      follow:"Add the ceremony?", add:"Master's choice ceremony", loc:'ippodo' }
  }
}

/* Each character acknowledges YOU on open, in their own voice, naming the place
   they actually stand in (§12). Never a generic greeting, never a chatbot. */
const GREET = {
  akira:  "You are looking at Shinjuku differently than most visitors. I live two streets that way, so I know this hour better than the tour buses do. What do you want tonight?",
  yuki:   "You have stopped in the one place on this road where the trees are older than the buildings. Good evening. Tell me what you came for and I will be direct with you.",
  aoi:    "You are standing at my counter, so sit anywhere. I have been cooking since five and I will decide what you eat. Tell me one thing you dislike, so I know what to keep away from you.",
  rei:    "You are in Ginza, which is where Tokyo comes to be seen rather than to look. I would like to know which of those you are tonight.",
  haruki: "Good. You reached the counter before the queue started, which tells me something about you. Before we pour anything — how do you usually drink?",
  sora:   "Hold still four seconds, the light on this street is doing something right now. There, that is done. You are in Shibuya but not at the crossing. What is this for?",
  ren:    "Most people walk straight past this warehouse. You stopped. I design in the room behind me and I will answer for anything on this floor. What drew you in?",
  mika:   "Please sit. Tea is not a drink here, it is a pause, and you have earned one by walking this far. Have you had tea prepared properly before?",
  kenji:  "Everyone asks for the same three records. Nobody asks for the one in the back. You have been looking at the jazz shelf, not the front — what do you listen to?"
}

const dlgBody = $('dlg-body')
const dlgOpts = $('dlg-opts')
const dlgState = $('dlg-state')

let tGlobal = 0

/* ---------------- conversation state (§21) ---------------- */
const talk = { history: [], lastTopic: null, mood: null }
let pendingLoc = null

function nameOf(id){
  const p = PEOPLE.find(q => q.id === id)
  return p ? p.name : id
}

function dlgLine(who, txt, cls){
  const d = document.createElement('div')
  d.className = 'dlg-line' + (cls ? ' ' + cls : '')
  const w = document.createElement('div'); w.className = 'who'; w.textContent = who
  const t = document.createElement('div'); t.className = 'txt'; t.textContent = txt
  d.appendChild(w); d.appendChild(t)
  dlgBody.appendChild(d)
  dlgBody.scrollTop = dlgBody.scrollHeight
}

function setDlgState(txt, isErr){
  dlgState.textContent = txt || ''
  dlgState.classList.toggle('err', !!isErr)
}

/* ---------------- time + weather awareness (§35,§36) ---------------- */
function clockPhase(){
  const h = (state.clock / 60) % 24
  if (h < 5)  return 'night'
  if (h < 11) return 'morning'
  if (h < 16) return 'day'
  if (h < 19) return 'evening'
  if (h < 23) return 'dinner'
  return 'late'
}

const PHASE_ADVICE = {
  morning: 'It is early. Architecture and galleries before the crowds — and check opening hours, many are not open yet.',
  day:     'This is the best light of the day for architecture and galleries.',
  evening: 'Good hour for a walk. The light goes amber about forty minutes from now.',
  dinner:  'Dinner hour. This is when Tokyo eats properly — book a counter, not a table.',
  late:    'It is late. Anything still open is open because the locals are still here.',
  night:   'The small hours. Late counters only — check availability before travelling.'
}

function weatherAdvice(){
  const a = atmosphere.state
  const w = a.weather, tm = a.time
  if (w === 'snow') return 'With snow coming down I would keep tonight intimate and indoors. The city is quieter and the counters are warmer.'
  if (w === 'rain') return 'It is raining softly. I would stay close and make the evening about food.'
  if (w === 'spring') return 'The blossoms are at their best right now, and the light through them lasts about an hour.'
  if (tm === 'day') return 'Daylight does something to this city — the same street reads completely differently.'
  if (tm === 'sunset') return 'Sunset. Fifteen minutes and every window in the city switches on at once.'
  return 'It is clear, which is rarer than you would think. The city is unusually legible tonight.'
}

/* a weather/time-flavoured reply, in this character's own district and voice (§14,§35,§36) */
function situate(){
  const p = PEOPLE.find(q => q.id === state.guide)
  const place = p ? p.district : 'this part of Tokyo'
  return weatherAdvice() + ' ' + PHASE_ADVICE[clockPhase()] +
    ' Here in ' + place + ' I would know exactly where to send you.'
}

/* ---------------- dialogue buttons ---------------- */
function dlgButtons(list){
  dlgOpts.innerHTML = ''
  list.forEach(b => {
    const el = document.createElement('button')
    el.className = 'dlg-opt' + (b.add ? ' add' : '') + (b.primary ? ' primary' : '')
    el.textContent = b.t
    el.addEventListener('click', () => handleChoice(b))
    dlgOpts.appendChild(el)
  })
}

function handleCharacterChoice(b){
  if (b.url){ window.open(b.url, '_blank', 'noopener'); return }
  if (b.add){ addToItinerary(b.add); dlgLine(nameOf(state.guide), 'Added to My Tokyo — ' + b.add + '.'); return }
  dlgLine(nameOf(state.guide), b.t, 'user')
  talk.history.push({ q: b.t, go: b.go })

  if (b.go === 'view'){
    if (pendingLoc){ closeDialogue(); showLocation(pendingLoc) }
    return
  }
  if (b.go === 'atlas'){
    if (pendingLoc){
      const l = LOCATIONS.find(x => x.id === pendingLoc)
      if (l){ closeDialogue(); openAtlasOn(l) }
    }
    return
  }
  if (b.go === 'situation'){
    reply(situate(), null)
    return
  }
  if (b.go === 'more'){
    const node = DIALOGUE[state.guide][talk.lastTopic]
    if (!node){ reply('Ask me anything — I am here all evening.', null); return }
    reply(node.more || node.say, null)
    return
  }

  const node = DIALOGUE[state.guide][b.go]
  if (!node){ dlgButtons(DIALOGUE[state.guide].options); return }
  reply(node.say, null)
  pendingLoc = node.loc || null
  talk.lastTopic = b.go
}

/* actions are built from the real dataset, never invented (§16,§28) */
function actionsFor(node){
  const acts = []
  if (node.loc){
    const l = LOCATIONS.find(x => x.id === node.loc)
    if (l){
      acts.push({ t:'Show me →', go:'view', primary:true })
      acts.push({ t:'Show on atlas →', go:'atlas' })
      if (l.officialWebsite) acts.push({ t:'Official website ↗', url:l.officialWebsite })
    }
  }
  acts.push({ t:'Tell me more.', go:'more' })
  if (node.follow && node.add) acts.push({ t: node.follow, add: node.add })
  return acts
}

function reply(text, unused){
  setTimeout(() => {
    dlgLine(nameOf(state.guide), text)
    const node = talk.lastTopic ? DIALOGUE[state.guide][talk.lastTopic] : null
    dlgButtons(node ? actionsFor(node) : DIALOGUE[state.guide].options)
    setDlgState('Reply ready — press Listen to hear it.')
  }, 380)
}

/* ---------------- opening / closing ---------------- */
function openDialogue(id, over){
  const d = DIALOGUE[id]
  if (!d) return
  over = over || {}
  state.guide = id
  const p = PEOPLE.find(q => q.id === id)
  markPeople(id, p.name, p.role)
  if (p && p.mesh) p.mesh.userData.turned = tGlobal
  /* a fresh character opens a fresh conversation; re-opening with the same
     character keeps what was already said (§21) */
  const continuing = over.keepMemory && talk.who === id
  if (!continuing){ talk.history.length = 0; talk.lastTopic = null; talk.food = over.food || null }
  talk.who = id

  $('dlg-name').textContent = p ? p.name : id
  $('dlg-role').textContent = p ? p.role : ''
  $('dlg-where').textContent = p ? p.district + ' · ' + fmtClock(state.clock) + ' JST · ' + atmosphere.label() : ''
  dlgBody.innerHTML = ''
  dlgOpts.innerHTML = ''
  pendingLoc = null
  if (over.topic) talk.lastTopic = over.topic

  /* the character acknowledges YOU, in their own voice (§12) */
  dlgLine(p ? p.name : id, over.line || GREET[id] || d.open)
  dlgButtons(over.options || d.options)
  setDlgState('Press Listen to hear the reply, or Talk to speak.')
  $('dialogue').classList.add('on')
  document.body.classList.add('locked')
  p && p.chip && p.chip.classList.remove('show')
  const firstOpt = dlgOpts.querySelector('.dlg-opt')
  if (firstOpt) firstOpt.focus()
}

function closeDialogue(){
  $('dialogue').classList.remove('on')
  document.body.classList.remove('locked')
  document.body.classList.remove('dlg-typing')
  stopListening()
  stopSpeaking()
  setDlgState('')
  state.guide = null
}

$('dlg-close').addEventListener('click', closeDialogue)

/* keyboard access: Escape closes the topmost panel, focus moves into the
   dialogue so a keyboard user is not left behind the overlay (§47) */
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return
  if ($('dialogue').classList.contains('on')) closeDialogue()
  else if ($('location').classList.contains('on')) closeLocation()
  else if ($('discovery').classList.contains('on')) closeDiscovery()
  else if (!$('atmos-panel').hasAttribute('hidden')){
    $('atmos-panel').setAttribute('hidden', '')
    $('atmos-toggle').setAttribute('aria-expanded', 'false')
    $('atmos-toggle').focus()
  }
})

/* ----------------------------- voice ------------------------------ */
/* Genuine Web Speech where the browser offers it. Where it does not, we say so
   plainly and fall back to typing. We never fake a voice button (§17-19,§51). */

const SR = window.SpeechRecognition || window.webkitSpeechRecognition
const TTS = window.speechSynthesis
const canListen = !!SR
const canSpeak = !!TTS
const micBtn = $('dlg-mic')
const conMic = $('con-mic')
const listenBtn = $('dlg-listen')
const stopBtn = $('dlg-stop')
const textBtn = $('dlg-text')
const typeForm = $('dlg-typeform')
const typed = $('dlg-typed')

let recog = null
let listening = false
let speakingUtt = null

/* ---- speaking (LISTEN →) : never autoplays, user always presses the button ---- */
function speak(text){
  if (!canSpeak || !text){ return false }
  stopSpeaking()
  const u = new SpeechSynthesisUtterance(String(text).slice(0, 600))
  u.rate = 0.94; u.pitch = 0.96; u.lang = 'en-GB'
  u.onend = () => { stopBtn.hidden = true; listenBtn.textContent = 'Listen' }
  u.onerror = () => { stopBtn.hidden = true; listenBtn.textContent = 'Listen' }
  speakingUtt = u
  stopBtn.hidden = false
  listenBtn.textContent = 'Pause'
  TTS.speak(u)
  return true
}
function stopSpeaking(){
  if (canSpeak) TTS.cancel()
  speakingUtt = null
  if (stopBtn){ stopBtn.hidden = true }
  if (listenBtn) listenBtn.textContent = 'Listen'
}
function lastCharacterLine(){
  const lines = dlgBody.querySelectorAll('.dlg-line')
  for (let i = lines.length - 1; i >= 0; i--){
    if (!lines[i].classList.contains('user')) return lines[i].querySelector('.txt').textContent
  }
  return null
}

listenBtn.addEventListener('click', () => {
  if (!canSpeak){
    setDlgState('Speech output is not supported in this browser. The text above is the reply.', true)
    return
  }
  if (TTS.speaking && TTS.paused){ TTS.resume(); listenBtn.textContent = 'Pause'; return }
  if (TTS.speaking){ TTS.pause(); listenBtn.textContent = 'Resume'; return }
  const line = lastCharacterLine()
  if (!line){ setDlgState('Nothing to read yet.', true); return }
  speak(line)
})

stopBtn.addEventListener('click', () => {
  stopSpeaking()
  setDlgState('Stopped.')
})

/* ---- typing (always available, keyboard friendly) ---- */
textBtn.addEventListener('click', () => {
  const on = !document.body.classList.contains('dlg-typing')
  document.body.classList.toggle('dlg-typing', on)
  textBtn.setAttribute('aria-pressed', String(on))
  if (on) typed.focus()
})
typeForm.addEventListener('submit', e => {
  e.preventDefault()
  const v = typed.value.trim()
  if (!v) return
  typed.value = ''
  submitUserText(v)
})

/* ---- listening (TALK →) : real microphone, real states ---- */
function setMic(on){
  listening = on
  ;[micBtn, conMic].forEach(b => { if (b) b.classList.toggle('live', on) })
}

function startListening(onText){
  if (!canListen){
    setDlgState("Voice input isn't supported in this browser. Type your question instead.", true)
    document.body.classList.add('dlg-typing')
    typed.focus()
    return
  }
  if (listening){ stopListening(); return }
  stopSpeaking()
  try {
    recog = new SR()
    recog.lang = 'en-US'
    recog.interimResults = false
    recog.maxAlternatives = 1
    recog.onresult = e => {
      const t = e.results[0][0].transcript
      if (t) onText(t)
    }
    recog.onerror = ev => {
      setMic(false)
      setDlgState(ev && ev.error === 'not-allowed'
        ? 'Microphone permission was declined. Type your question instead.'
        : "I couldn't hear that. Try again, or type your question.", true)
    }
    recog.onend = () => {
      setMic(false)
      setDlgState('')
    }
    recog.start()
    setMic(true)
    setDlgState('Listening…')
  } catch (err){
    setMic(false)
    setDlgState("Voice input isn't available here. Type your question instead.", true)
  }
}
function stopListening(){
  if (recog){ try { recog.stop() } catch (e){} }
  setMic(false)
  setDlgState('')
}

micBtn.addEventListener('click', () => startListening(submitUserText))
if (conMic) conMic.addEventListener('click', () => startListening(askConcierge))

if (!canListen && micBtn){
  micBtn.title = "Voice input isn't supported in this browser — use Text"
}
if (!canSpeak && listenBtn){
  listenBtn.title = 'Speech output is not supported in this browser'
}

/* ---- routing a free-text or spoken question into the branching dialogue (§21) ----
   Structured intent matching. We are not pretending a model is behind this. */
const INTENTS = [
  { re: /\b(quiet|calm|peaceful|rest|still)\b/,           go:'quiet',  topic:'quiet'  },
  { re: /\b(food|eat|hungry|dinner|lunch|restaurant|counter)\b/, go:'eat', topic:'eat' },
  { re: /\b(open|still open|late|now)\b/,                 go:'busy',  topic:'busy'  },
  { re: /\b(busy|crowd|crowded|people)\b/,                go:'busy',  topic:'busy'  },
  { re: /\b(sake|drink|bar|nightlife|izakaya)\b/,         go:'rare',  topic:'rare'  },
  { re: /\b(tea|matcha|ceremony|calm down)\b/,            go:'first', topic:'first' },
  { re: /\b(photo|camera|photograph|shoot)\b/,            go:'real',  topic:'real'  },
  { re: /\b(record|vinyl|music|listen)\b/,                go:'new',   topic:'new'   },
  { re: /\b(design|craft|clothes|fashion|shop)\b/,         go:'craft', topic:'craft' },
  { re: /\b(midnight|after midnight|late night)\b/,        go:'midnight', topic:'midnight' },
  { re: /\b(where are we|what is it like|weather|raining|snow|time)\b/, go:'__situation' },
  { re: /\b(architecture|gallery|gallery|daytime)\b/,     go:'__situation' }
]

function submitUserText(text){
  dlgLine(nameOf(state.guide), text, 'user')
  talk.history.push({ q:text, freeform:true })
  const low = text.toLowerCase()

  /* remember a stated preference and acknowledge it next time (§21) */
  if (/\b(quieter|calmer|less loud)\b/.test(low)) talk.mood = 'quiet'
  else if (/\b(hungry|food|eat)\b/.test(low)) talk.mood = 'food'
  else if (/\b(late|late night)\b/.test(low)) talk.mood = 'late'

  let hit = INTENTS.find(i => i.re.test(low))
  if (hit && hit.go === '__situation'){
    reply(situate(), null)
    return
  }
  if (hit && DIALOGUE[state.guide][hit.go]){
    const node = DIALOGUE[state.guide][hit.go]
    reply(node.say, null)
    pendingLoc = node.loc || null
    talk.lastTopic = hit.go
    return
  }

  /* follow-up on the last topic, using remembered context */
  const last = talk.lastTopic ? DIALOGUE[state.guide][talk.lastTopic] : null
  if (last && /\b(more|else|and|also|what about)\b/.test(low)){
    reply(last.more || last.say, null)
    return
  }
  if (/\b(quieter|calmer)\b/.test(low) && talk.mood === 'quiet'){
    reply('Quieter still. Then we stay off the main roads entirely — the side lanes here hold their own quiet, and at this hour they are empty.', null)
    return
  }

  /* honest fallback: no invented answer */
  reply('I did not catch a route in that. Try one of the options below, or ask me something plainer.', null)
}

/* --------------------------- itinerary ---------------------------- */

const IT_STORE = 'yoru-itinerary'
let itinerary = []
try { itinerary = JSON.parse(localStorage.getItem(IT_STORE) || '[]') } catch (e) { itinerary = [] }

function saveIt(){
  try { localStorage.setItem(IT_STORE, JSON.stringify(itinerary)) } catch (e) {}
}

function addToItinerary(title){
  if (itinerary.some(x => x.title === title)){
    toast('Already in My Tokyo')
  } else {
    itinerary.push({ title, time: nextSlot() })
    saveIt()
    toast('Added to My Tokyo')
  }
  renderItinerary()
}

function nextSlot(){
  const base = 18 * 60 + 30
  return base + itinerary.length * 90
}

function renderItinerary(){
  const list = $('itin-list')
  const tl = $('timeline')
  list.innerHTML = ''
  tl.innerHTML = ''
  if (!itinerary.length){
    const li = document.createElement('li')
    li.innerHTML = '<div class="itin-empty">Nothing arranged yet.<br>Speak with someone in the city, or choose a destination on the map, and it will appear here.</div>'
    list.appendChild(li)
    return
  }
  itinerary.forEach((it, i) => {
    const li = document.createElement('li')
    li.innerHTML = '<span class="n mono">' + String(i+1).padStart(2,'0') + '</span>' +
      '<span><span class="t">' + it.title + '</span><span class="m">' + fmtTime(it.time) + ' · Illustrative</span></span>' +
      '<span class="itin-ctl">' +
        '<button class="mo" data-i="' + i + '" data-d="-1" aria-label="Move up" ' + (i === 0 ? 'disabled' : '') + '>↑</button>' +
        '<button class="mo" data-i="' + i + '" data-d="1" aria-label="Move down" ' + (i === itinerary.length - 1 ? 'disabled' : '') + '>↓</button>' +
        '<button class="rm" aria-label="Remove ' + it.title + '">×</button>' +
      '</span>'
    li.querySelectorAll('.mo').forEach(b => b.addEventListener('click', () => {
      const idx = Number(b.dataset.i)
      const dir = Number(b.dataset.d)
      const j = idx + dir
      if (j < 0 || j >= itinerary.length) return
      const tmp = itinerary[idx]
      itinerary[idx] = itinerary[j]
      itinerary[j] = tmp
      itinerary.forEach((x, k) => { x.time = nextSlot() + k * 90 })
      saveIt(); renderItinerary()
    }))
    li.querySelector('.rm').addEventListener('click', () => {
      itinerary = itinerary.filter(x => x.title !== it.title)
      itinerary.forEach((x, k) => { x.time = nextSlot() + k * 90 })
      saveIt(); renderItinerary()
    })
    list.appendChild(li)

    const t = document.createElement('li')
    t.innerHTML = '<span class="time">' + fmtTime(it.time) + '</span><span class="what">' + it.title + '</span>'
    tl.appendChild(t)
  })
}

function fmtTime(mins){
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0')
}

renderItinerary()

/* ------------------------------- map ------------------------------ */

const CATEGORIES = ['Dining','Culture','Design','Nightlife','Wellness','Shopping','Hidden']

const PLACES = [
  { n:'Shibuya Crossing',      d:'Shibuya',        c:'Nightlife', lat:35.6595, lng:139.7005,
    why:'The busiest pedestrian junction in the world. Every evening at 20:45 the signals change and roughly three thousand people cross in a single diagonal.',
    t:'19:30 — 20:45, before the crowds thicken', e:'Private vantage above the crossing, then a walk through the side streets behind the station.' },
  { n:'Shibuya Sky',           d:'Shibuya',        c:'Culture',  lat:35.6584, lng:139.7020,
    why:'An open-air observation deck on the top floors of the Scramble Square tower, with no glass between you and the city.',
    t:'Sunset, or last boarding', e:'Reserved entry and a quiet hour above the crossing before the building empties.' },
  { n:'Shinjuku Gyoen',        d:'Shinjuku',       c:'Wellness', lat:35.6852, lng:139.7100,
    why:'One of the largest landscaped gardens in the city. In autumn it is arguably the most beautiful place in Tokyo, and almost nobody is there.',
    t:'Late morning, or 16:00 in autumn', e:'Garden entry timed to avoid the midday, with tea afterwards in the Shinjuku saki.' },
  { n:'Golden Gai',            d:'Shinjuku',       c:'Hidden',   lat:35.6938, lng:139.7024,
    why:'Six narrow alleys holding around two hundred bars, each with six or eight seats. Almost none of them have a sign.',
    t:'23:00 — 02:00', e:'Hosted introductions at three bars, chosen for what is open that night rather than what is famous.' },
  { n:'Omoide Yokocho',       d:'Shinjuku',       c:'Dining',   lat:35.6910, lng:139.7030,
    why:'"Memory Lane" — a string of bars barely a metre wide, wedged under the railway. Small plates, loud, genuinely local.',
    t:'18:00 — 22:00', e:'A seat held at one counter, then a walk of the lane as it fills.' },
  { n:'Senso-ji',              d:'Asakusa',        c:'Culture',  lat:35.7148, lng:139.7967,
    why:'Tokyo\'s oldest continuously running temple, approached through Nakamise — a street of small traditional shops that has been trading for three centuries.',
    t:'07:00, or after 17:00 in autumn', e:'Early access through Nakamise before the day visitors, then tea on the temple grounds.' },
  { n:'Asakusa Nakamise',      d:'Asakusa',        c:'Shopping', lat:35.7118, lng:139.7950,
    why:'Traditional sweets, crafts and knives from shops that have occupied the same ground for generations.',
    t:'09:00 — 11:00', e:'A buying guide and introductions to three family-run shops.' },
  { n:'Tokyo Station Marunouchi', d:'Chiyoda',     c:'Dining',   lat:35.6812, lng:139.7671,
    why:'A century of brick station architecture housing some of the finest dining in the city, from the humblest katsu counter to two-star sushi.',
    t:'Lunch, or 17:30 for early dinner', e:'A tasting route through the basement counters, chosen around your preferences.' },
  { n:'Ginza',                 d:'Ginza',          c:'Shopping', lat:35.6717, lng:139.7650,
    why:'Tokyo\'s most elegant address — flagship shops, department stores and the Kabuki-za theatre, all within a short walk.',
    t:'Weekday afternoon', e:'Private shopping day with a textile buyer, including a kimono fitting appointment.' },
  { n:'Akihabara',             d:'Chiyoda',        c:'Culture',  lat:35.6984, lng:139.7731,
    why:'The district built on electronics and anime now runs its own fashion weeks. The older hobby shops are still here, mostly unchanged.',
    t:'14:00 — 17:00', e:'A collector\'s route through the back streets, ending in a private arcade floor.' },
  { n:'Harajuku / Omotesando', d:'Shibuya',        c:'Design',   lat:35.6652, lng:139.7124,
    why:'Boutique architecture by the world\'s most demanding clients, in a corridor barely a kilometre long.',
    t:'Weekday 11:00', e:'An architectural walk with a local architect, coffee between buildings.' },
  { n:'Meiji Jingu',           d:'Shibuya',        c:'Culture',  lat:35.6764, lng:139.6993,
    why:'A Shinto shrine built in 1920 in classical style, standing in a forest that was planted on what was once the outer grounds of Edo.',
    t:'Morning, before the tour groups', e:'Private shrine visit with a priest, followed by the forest walk.' },
  { n:'Kagurazaka',            d:'Shinjuku',       c:'Hidden',   lat:35.7053, lng:139.7345,
    why:'Stone lanes, old wooden facades and restaurants that have kept the same sign — and the same chef — for three generations.',
    t:'Evening, after 19:00', e:'A walk along the stone lanes ending at a six-seat counter with no signage.' },
  { n:'Daikanyama',            d:'Shibuya',        c:'Design',   lat:35.6481, lng:139.7032,
    why:'A low-rise neighbourhood that became Tokyo\'s most discreet luxury address, full of studios rather than storefronts.',
    t:'Weekday 13:00', e:'Studio visits, largely out of sight of the street.' },
  { n:'Shimokitazawa',         d:'Setagaya',       c:'Nightlife',lat:35.6616, lng:139.6683,
    why:'Vintage, record shops, tiny live houses and a rail line running four metres above the street. Tokyo at half speed.',
    t:'Weekday evening', e:'Record shop trail, then a basement live house.' },
  { n:'Roppongi Hills',        d:'Minato',         c:'Culture',  lat:35.6604, lng:139.7292,
    why:'An art museum and design complex built on a hill, with a view back over the towers of Azabu.',
    t:'11:00 — 17:00', e:'Private curator-led viewing, timed to avoid the queue.' },
  { n:'Tsukiji Outer Market',  d:'Chuo',           c:'Dining',   lat:35.6654, lng:139.7707,
    why:'The working market behind the wholesale fish market. Knives, tamagoyaki, and a great deal of very early conversation.',
    t:'06:30 — 09:00', e:'Breakfast through the market with a buyer, finishing at a standing counter.' },
  { n:'Yoyogi Park',           d:'Shibuya',        c:'Wellness', lat:35.6723, lng:139.6947,
    why:'The site of the 1964 Olympic stadium, and a remarkable place to sit and watch the city do nothing in particular.',
    t:'Morning', e:'A quiet hour with tea, then a walk to Harajuku.' },
  { n:'Nihonbashi',            d:'Chuo',           c:'Design',   lat:35.6839, lng:139.7745,
    why:'A district of small specialist workshops — cutlery, indigo, lacquer, and a family doing kintsugi since 1953.',
    t:'Weekday 10:00', e:'Workshop introductions and the chance to try each craft.' },
  { n:'Kuramae',               d:'Taito',          c:'Design',   lat:35.7046, lng:139.7917,
    why:'Where most of Tokyo\'s independent designers now keep their studios, in converted warehouses and old apartment blocks.',
    t:'Weekday 12:00', e:'Private viewing at three studios, with the curator.' },
  { n:'Azabudai Hills',        d:'Minato',         c:'Wellness', lat:35.6622, lng:139.7392,
    why:'Tokyo rebuilt part of the old military site into a low-rise district with the city\'s best maintained gardens and a new Mori JP Tower.',
    t:'Late afternoon', e:'Gardens, then the observation deck as the light drops.' },
  { n:'Shinjuku Gyoen Night', d:'Shinjuku',       c:'Culture',  lat:35.6852, lng:139.7100,
    why:'The garden opens after dark on selected evenings, when the lanterns are lit and the daytime crowds have gone.',
    t:'Selected autumn evenings only', e:'Timed entry with a lantern walk.' }
]

let map = null
let mapMarkers = {}
let mapLoading = false

function initMap(){
  if (map || mapLoading) return
  const el = $('map')
  if (!el) return
  mapLoading = true
  const note = $('map-status')
  if (note) note.textContent = 'Loading real Tokyo geography…'

  let created = null
  try {
    created = new maplibregl.Map({
      container: el,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
            ],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors · © CARTO'
          }
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-opacity': 0.78 } }]
      },
      center: [139.7455, 35.6875],
      zoom: 11.4,
      minZoom: 9,
      maxZoom: 17,
      attributionControl: true,
      dragRotate: true
    })
  } catch (err){
    /* report the real reason rather than leaving an empty box (§33,§34) */
    mapLoading = false
    if (note) note.textContent = 'Atlas could not start: ' + (err && err.message ? err.message : 'unknown error')
    $('map').classList.add('tiles-down')
    if (import.meta.env && import.meta.env.DEV) console.error('[atlas]', err)
    return
  }
  map = created

  /* Markers do not depend on the basemap. Adding them here means the atlas is
     never an empty box even if tiles are slow or blocked (§34). */
  const n = $('map-status')
  PLACES.forEach(p => {
    const marker = new maplibregl.Marker({
      color: p.c === 'Hidden' ? '#c9a961' : '#f2ece1',
      anchor: 'bottom'
    })
      .setLngLat([p.lng, p.lat])
      .setPopup(new maplibregl.Popup({ offset: 14, closeButton: false }).setHTML('<div>' + p.n + '</div>'))
      .addTo(map)
    const el = marker.getElement()
    el.addEventListener('click', () => showPlace(p))
    el.addEventListener('mouseenter', () => setCursor('wide', 'OPEN'))
    el.addEventListener('mouseleave', () => setCursor('default'))
    mapMarkers[p.n] = marker
  })

  const ready = () => {
    mapLoading = false
    const s = $('map-status')
    if (s) s.textContent = PLACES.length + ' locations · OpenStreetMap · CARTO'
  }
  map.on('style.load', ready)
  map.on('load', ready)
  if (map.isStyleLoaded && map.isStyleLoaded()) ready()

  let tileFails = 0
  map.on('error', () => {
    tileFails++
    const s = $('map-status')
    if (!s) return
    if (tileFails > 6){
      /* say what is actually wrong rather than pretending it works (§34) */
      s.textContent = 'Basemap tiles could not be reached — markers and the list below are still accurate'
      $('map').classList.add('tiles-down')
    }
  })

  /* a resize once the atlas is genuinely on screen, not just near it */
  if ('IntersectionObserver' in window){
    const ro = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting && map) map.resize() })
    }, { threshold: 0.15 })
    ro.observe($('map'))
  }

  setTimeout(() => map && map.resize(), 300)
}

if ('IntersectionObserver' in window){
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting){ initMap(); setTimeout(() => map && map.resize(), 260) }
    })
  }, { rootMargin: '260px' })
  io.observe($('atlas'))
}

function showPlace(p){
  $('map-empty').classList.add('hidden')
  const d = $('map-detail')
  d.classList.add('on')
  $('d-cat').textContent = p.c
  $('d-name').textContent = p.n
  $('d-district').textContent = p.d
  $('d-why').textContent = p.why
  $('d-time').textContent = p.t
  $('d-exp').textContent = p.e
  $('d-add').onclick = () => { addToItinerary(p.n); map.flyTo([p.lng, p.lat], 13.4, { duration: 1400 }) }
  $('d-explore').onclick = () => exploreArea(p.n)
}

/* map → city: the journey returns to the matching district */
function exploreArea(name){
  const tourTop = chaptersEl.offsetTop
  const span = chaptersEl.offsetHeight - innerHeight
  const at = AREA_AT[name] !== undefined ? AREA_AT[name] : 0.5
  $('map-panel').classList.remove('on')
  $('map-detail').classList.remove('on')
  $('map-empty').classList.remove('hidden')
  window.scrollTo({ top: tourTop + at * span, behavior: 'smooth' })
  setTimeout(() => toast('Traveling to ' + name), 800)
}

function buildFilters(){
  const wrap = $('filters')
  CATEGORIES.forEach(c => {
    const b = document.createElement('button')
    b.textContent = c
    b.setAttribute('aria-pressed', 'false')
    b.addEventListener('click', () => {
      if (state.filters.has(c)) state.filters.delete(c)
      else state.filters.add(c)
      b.classList.toggle('on', state.filters.has(c))
      b.setAttribute('aria-pressed', String(state.filters.has(c)))
      PLACES.forEach(p => {
        const vis = !state.filters.size || state.filters.has(p.c)
        const m = mapMarkers[p.n]
        if (m) m.getElement().style.display = vis ? '' : 'none'
      })
      if (map){
        const pts = PLACES.filter(p => !state.filters.size || state.filters.has(p.c))
        if (pts.length){
          const b2 = new maplibregl.LngLatBounds()
          pts.forEach(p => b2.extend([p.lng, p.lat]))
          map.fitBounds(b2, { padding: 70, maxZoom: 13.2, duration: 1200 })
        }
      }
    })
    wrap.appendChild(b)
  })
}
buildFilters()

/* --------------------------- concierge ---------------------------- */

const CON_SUGGESTIONS = [
  'A quiet dinner somewhere low-key',
  'What should we do after midnight?',
  'I want Japanese fashion, not department stores',
  'Somewhere traditional for a first visit',
  'A romantic evening'
]

const CON_LOG = $('con-log')
function conLine(who, txt, cls){
  const d = document.createElement('div')
  d.className = 'con-line' + (cls ? ' ' + cls : '')
  d.innerHTML = '<div class="who">' + who + '</div><div class="txt">' + txt + '</div>'
  CON_LOG.appendChild(d)
  CON_LOG.scrollTop = CON_LOG.scrollHeight
}

  function conAnswer(q){
    const s = q.toLowerCase()
    /* Rei reads the world first: district, time, weather, journal.
       The recommendations therefore change as the journey changes,
       and a question about rain while it rains answers indoors. */
    const worldCtx = conciergeRecommend({
      district: atmosphere.state.district,
      time: atmosphere.state.time,
      weather: atmosphere.state.weather,
      question: q,
      saved: Object.keys(disc.places).map(k => disc.places[k]).slice(0, 3),
      visited: Object.keys(disc.passport)
    })
    if (worldCtx.length){
      const recs = worldCtx.map((r, i) =>
        '<b>' + String(i + 1).padStart(2, '0') + '. ' + r.title + '.</b> ' + r.why).join('<br>· ')
      return 'You are in ' + (districtForTour(atmosphere.state.district).name || 'Tokyo') +
        ', ' + atmosphere.label().toLowerCase() + '.<br>· ' + recs
    }
    const has = arr => arr.some(k => s.includes(k))
  if (has(['quiet','calm','peace','relax','slow'])){
    return 'We would put you in Kagurazaka — stone lanes, old wood, and a counter with six seats and no sign. I will send the address on the day.'
  }
  if (has(['dinner','food','eat','restaurant','meal','taste','ramen','sushi'])){
    return 'Aoi is cooking in Shibuya. Twelve seats at the counter, a menu written when you arrive, and a chef who has been at it since five.'
  }
  if (has(['midnight','late','night','after hours'])){
    return 'After midnight the doors open. Golden Gai has two hundred bars in six alleys and almost no signage — I will arrange three introductions.'
  }
  if (has(['crowd','tourist','tour','busy','packed'])){
    return 'Then we go the other way entirely. Daikanyama and Nihonbashi — small studios, working workshops, and almost nobody watching.'
  }
  if (has(['fashion','design','clothes','clothing','shop','vintage','fabric'])){
    return 'Harajuku and Omotesando for the architecture, then Daikanyama for the makers. We skip the department stores unless you ask for them.'
  }
  if (has(['tradition','traditional','culture','temple','shrine','first','classic'])){
    return 'Senso-ji before nine, when Nakamise belongs to the shopkeepers rather than the coaches. A priest will receive you privately afterwards.'
  }
  if (has(['romantic','romance','couple','anniversary','partner'])){
    return 'A quiet counter in Kagurazaka, then the Shibuya Sky deck at last boarding, then a bar with six seats in Golden Gai. We would keep it unhurried.'
  }
  if (has(['tea','garden','wellness','calm','onsen','bath'])){
    return 'Azabudai Gardens for an hour before dusk, then a private tea ceremony with Mika — the gardens, then the pause.'
  }
  if (has(['nightlife','club','music','bar','listen','live'])){
    return 'Shimokitazawa first for live music in a basement, then anywhere that still has room. I would rather you heard two rooms properly than six in a rush.'
  }
  if (has(['child','family','kids'])){
    return 'We keep it slow and short — Ueno in the morning, the gardens at Azabudai in the afternoon, and home before anyone gets tired.'
  }
  return 'Tell me a little more — the mood, the hour, or simply what you would rather not do, and I will narrow it to one evening.'
}

function askConcierge(text){
  if (!text || !text.trim()) return
  conLine('You', text, 'user')
  const a = conAnswer(text)
  setTimeout(() => { conLine('Concierge', a) }, 420)
}

$('con-send').addEventListener('click', () => {
  const i = $('con-input')
  askConcierge(i.value)
  i.value = ''
})
$('con-input').addEventListener('keydown', e => {
  if (e.key === 'Enter'){ askConcierge(e.target.value); e.target.value = '' }
})
conLine('Concierge', 'Good evening. Tell me what kind of night you are in the mood for — or ask me something directly.')
const sugWrap = $('con-sugg')
CON_SUGGESTIONS.forEach(s => {
  const b = document.createElement('button')
  b.textContent = s
  b.addEventListener('click', () => askConcierge(s))
  sugWrap.appendChild(b)
})

const cans = []
const canGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8)
function spawnCan(g){
  const can = new THREE.Mesh(canGeo, new THREE.MeshBasicMaterial({ color: [0xc9a961,0x8c3a2e,0xa8894f,0xe8dcc0][Math.floor(Math.random()*4)] }))
  can.position.copy(g.position)
  can.position.y = 1.2
  can.position.z += 0.5
  can.userData = { vy: 0, life: 4 }
  city.add(can)
  cans.push(can)
}

const AREA_AT = {
  'Shinjuku Gyoen':0.02, 'Tokyo Station Marunouchi':0.06, 'Omoide Yokocho':0.10, 'Golden Gai':0.13,
  'Shinjuku':0.16, 'Shibuya Sky':0.20, 'Shibuya Crossing':0.22, 'Nonbei Yokocho':0.24,
  'Harajuku / Omotesando':0.30, 'Meiji Jingu':0.34, 'Daikanyama':0.38,
  'Shimokitazawa':0.44, 'Roppongi Hills':0.50, 'Azabudai Hills':0.56,
  'Ginza':0.62, 'Tsukiji Outer Market':0.66, 'Nihonbashi':0.70,
  'Akihabara':0.76, 'Kuramae':0.80, 'Kagurazaka':0.84, 'Asakusa':0.88, 'Senso-ji':0.92,
  'Asakusa Nakamise':0.93, 'Shinjuku Gyoen Night':0.03, 'Yoyogi Park':0.35
}

const TOUR_NAV = {}
let lastDistrict = null

const toast_placeholder = null

/* --------------------------- locations ---------------------------- */

const gmaps = (lat, lng, name) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(name) + '@' + lat + ',' + lng
const osmUrl = (lat, lng) => 'https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lng + '#map=17/' + lat + '/' + lng
const findUrl = name => 'https://duckduckgo.com/?q=' + encodeURIComponent(name + ' official site Tokyo')

/* Real venues. Every official URL below was fetched and confirmed to resolve to the
   venue's own site. Where no first-party site could be verified, officialWebsite is
   null and the UI offers a search instead of inventing a link (§28).
   Images are Wikimedia Commons files under CC0/CC BY/CC BY-SA with attribution (§25). */
const LOCATIONS = [
  { id:'jiro', name:'Sukiyabashi Jiro', nameJa:'鮨 次郎', cat:'Dining', ward:'Ginza, Chuo City',
    addr:'Tsukamoto Sogyo Building B1F, 4-2-15 Ginza', lat:35.6717, lng:139.7639,
    cuisine:'Edomaie sushi', famous:'Counter of three. Omakase only, decided by the chef.',
    desc:'The most famous sushi counter in the world, deliberately almost impossible to find. Three seats, no menu, and whatever Mr. Kishida decides you are ready for that morning.',
    officialWebsite:'https://www.sushi-jiro.jp/',
    image:'https://upload.wikimedia.org/wikipedia/commons/b/b9/Outside_Sukiyabashi_Jiro_%2811555554413%29.jpg',
    imageCredit:'City Foodsters', imageLicence:'CC BY 2.0',
    imagePage:'https://commons.wikimedia.org/wiki/File:Outside_Sukiyabashi_Jiro_(11555554413).jpg',
    sources:['Official site: sushi-jiro.jp (address confirmed on page)'] },
  { id:'menchi', name:'Asakusa Menchi', nameJa:'浅草メンチ', cat:'Dining', ward:'Asakusa, Taito City',
    addr:'2-3-3 Asakusa, Taito-ku', lat:35.7136, lng:139.7946,
    cuisine:'Fried croquettes', famous:'Tonkatsu croquettes, fried to order, cabbage on the side.',
    desc:'An Asakusa institution built almost entirely around one thing: the croquette. Order at the counter, wait on the kerb, and eat it there while it is still too hot to hold properly.',
    officialWebsite:'https://asamen.com/',
    sources:['Official site: asamen.com (address confirmed on page)'] },
  { id:'narisawa', name:'Narisawa', nameJa:'なりさわ', cat:'Dining', ward:'Minami Aoyama, Meguro City',
    addr:'2-6-15 Minami Aoyama', lat:35.6660, lng:139.7159,
    cuisine:'Kaiseki', famous:'Satoyama — wild mountain vegetables gathered from the Japanese Alps.',
    desc:'Kunihiko Haraguchi\'s eight-seat counter draws on satoyama, the wild mountain landscape Japan lost in the Meiji era. Entirely vegetarian unless you ask otherwise.',
    officialWebsite:'https://www.narisawa-yoshihiro.com/',
    image:'https://upload.wikimedia.org/wikipedia/commons/f/fa/Narisawa_restaurant.jpg',
    imageCredit:'Pocsywe', imageLicence:'CC BY-SA 4.0',
    imagePage:'https://commons.wikimedia.org/wiki/File:Narisawa_restaurant.jpg',
    sources:['Official site: narisawa-yoshihiro.com (address confirmed on page)'] },
  { id:'birdland', name:'Ginza Birdland', nameJa:'銀座 バードランド', cat:'Dining', ward:'Ginza, Chuo City',
    addr:'4-2-15 Ginza, Tsukamoto Sosan Building B1F', lat:35.6716, lng:139.7640,
    cuisine:'Yakitori, charcoal', famous:'The tsukune. Litre tickets handed out in the early evening.',
    desc:'One of the three yakitori places in Tokyo that can properly claim to be great. The skewers go from raw to char over one burner, in order, for hours. It shares a building with Jiro downstairs.',
    officialWebsite:'https://ginza-birdland.sakura.ne.jp/',
    sources:['Official site: ginza-birdland.sakura.ne.jp (address confirmed on page)'] },
  { id:'maisen', name:'Tonkatsu Maisen Aoyama Honten', nameJa:'とんかつ まい泉', cat:'Dining', ward:'Jingumae, Shibuya City',
    addr:'4-8-5 Jingumae, Shibuya-ku', lat:35.6700, lng:139.7086,
    cuisine:'Tonkatsu', famous:'The black pork cutlet. Sourdough raised, panko cut from a loaf.',
    desc:'A tonkatsu specialist whose panko is cut from black sourdough bread rather than machine crumbs — lighter, less oily, and immediately recognisable.',
    officialWebsite:'https://mai-sen.com/',
    image:'https://upload.wikimedia.org/wikipedia/commons/9/9c/Maisen_Restaurant_Harajuku.JPG',
    imageCredit:'Harani0403', imageLicence:'CC BY-SA 3.0',
    imagePage:'https://commons.wikimedia.org/wiki/File:Maisen_Restaurant_Harajuku.JPG',
    sources:['Official site: mai-sen.com (address confirmed on page)'] },
  { id:'kagari', name:'Kagurazaka Kuzuryu Soba', nameJa:'九頭龍蕎麦 神楽坂（本店）', cat:'Dining', ward:'Kagurazaka, Shinjuku City',
    addr:'3-3 Kagurazaka, Shinjuku-ku, Tokyo 162-0825', lat:35.7015, lng:139.7412,
    cuisine:'Soba — Fukui / Echizen regional', famous:'Echizen oroshi soba: chilled buckwheat noodles under grated daikon and bonito.',
    desc:'Opened in 2010 on an upper floor of a corner building off Kagurazaka-dori, three minutes from Iidabashi. Named after the Kuzuryu river in the owner\'s hometown of Katsuyama, Fukui, and leaning on Hokuriku ingredients throughout.',
    officialWebsite:'https://kuzuryu-soba.com/',
    sources:['Official site: kuzuryu-soba.com (address from site POI)'] },
  { id:'ippodo', name:'Ippodo Tea Aoyama', nameJa:'一保堂茶舗 青山店', cat:'Dining', ward:'Minami-Aoyama, Minato City',
    addr:'2F, 4-23-6 Minami-Aoyama, Minato-ku, Tokyo 107-0062', lat:35.6625, lng:139.7176,
    cuisine:'Japanese tea — matcha, gyokuro, sencha', famous:'Whisked matcha as thick koicha or thin usucha in a 21-seat tearoom.',
    desc:'Kyoto-founded Ippodo Tea opened this Aoyama tearoom in 2025, a ten-minute walk from Omotesando toward the Nezu Museum. Retail downstairs, a guided 21-seat tearoom above, and bookable mini-workshops on preparing matcha.',
    officialWebsite:'https://www.ippodo-tea.co.jp/pages/store-aoyama',
    sources:['Official site: ippodo-tea.co.jp store page (address + coords from site map embed)'] },
  { id:'hamilton', name:'Tsukiji Outer Market', nameJa:'築地場外市場', cat:'Dining', ward:'Tsukiji, Chuo City',
    addr:'4-chome Tsukiji, Chuo-ku', lat:35.6654, lng:139.7707,
    cuisine:'Street food and knife shops', famous:'Tamagoyaki, uni, and knife shops that have been here for three generations.',
    desc:'The working market behind the wholesale exchange. By nine in the morning the fish trade is over and the market becomes a series of tiny breakfast counters. No first-party site is published for the market itself, so we link a search rather than guess.',
    officialWebsite:null,
    sources:['No first-party website published; coordinates are the market district'] },
  { id:'nonbei', name:'Nonbei Yokocho', nameJa:'ノンベイ横丁', cat:'Nightlife', ward:'Dogenzaka, Shibuya City',
    addr:'1-25 Dogenzaka, Shibuya-ku', lat:35.6600, lng:139.6990,
    cuisine:'Bars and yakitori', famous:'Brick-and-masonry lanes a few minutes from the crossing.',
    desc:'A warren of narrow lanes of tiny bars between the Shibuya crowds and the station. Loud, cheap, and entirely genuine.',
    officialWebsite:'http://www.nonbei.tokyo/',
    image:'https://upload.wikimedia.org/wikipedia/commons/a/a4/Shibuya_Nonbei_Yokocho_%2853330131727%29.jpg',
    imageCredit:'Dick Thomas Johnson', imageLicence:'CC BY 2.0',
    imagePage:'https://commons.wikimedia.org/wiki/File:Shibuya_Nonbei_Yokocho_(53330131727).jpg',
    videoUrl: MEDIA.shibuya.video.url, videoPoster: MEDIA.shibuya.video.poster,
    videoCredit: MEDIA.shibuya.video.credit, videoLicence: MEDIA.shibuya.video.license,
    videoPage: MEDIA.shibuya.video.source,
    sources:['Official site: nonbei.tokyo',
      'Shibuya guide: <a href="https://www.gotokyo.org/en/destinations/western-tokyo/shibuya/index.html" target="_blank" rel="noopener">gotokyo.org ↗</a>'] },
  { id:'omoide', name:'Omoide Yokocho', nameJa:'思い出横丁', cat:'Nightlife', ward:'Nishi-Shinjuku, Shinjuku City',
    addr:'1-2 Nishi-Shinjuku, Shinjuku-ku', lat:35.6918, lng:139.7030,
    cuisine:'Izakayas under the tracks', famous:'Yakitori, tachinomi, and a lantern-lit walkway beside the railway.',
    desc:'"Memory Lane" — a stone alley of bars barely wider than a person, wedged under the elevated Shinjuku line. Peak hours run from roughly seven in the evening.',
    officialWebsite:'https://shinjuku-omoide.com/',
    image:'https://upload.wikimedia.org/wikipedia/commons/4/45/Entrance_to_Omoide_Yokocho.jpg',
    imageCredit:'Grendelkhan', imageLicence:'CC BY-SA 4.0',
    imagePage:'https://commons.wikimedia.org/wiki/File:Entrance_to_Omoide_Yokocho.jpg',
    sources:['Official site: shinjuku-omoide.com (English: en.shinjuku-omoide.com)'] },
  { id:'golden', name:'Golden Gai', nameJa:'ゴールデン街', cat:'Nightlife', ward:'Kabukicho, Shinjuku City',
    addr:'1-chome Kabukicho, Shinjuku-ku', lat:35.6938, lng:139.7024,
    cuisine:'Six-seat bars', famous:'Around two hundred bars in six alleys. Almost none have a sign.',
    desc:'Not a street but a warren of six narrow alleys, each holding a handful of six- or eight-seat bars. Membership is by introduction, which is part of the point.',
    officialWebsite:'https://golden-gai.tokyo/',
    image:'https://upload.wikimedia.org/wikipedia/commons/d/d6/Shinjuku_Golden_Gai.jpg',
    imageCredit:'Teratani Koichi', imageLicence:'CC BY 3.0',
    imagePage:'https://commons.wikimedia.org/wiki/File:Shinjuku_Golden_Gai.jpg',
    sources:['Official site: golden-gai.tokyo (Shinjuku Golden Gai association)'] },
  { id:'yodobashi', name:'Yodobashi Akiba', nameJa:'ヨドバシ 秋葉原店', cat:'Shopping', ward:'Kanda-Hanaokacho, Chiyoda City',
    addr:'1-1 Kanda-Hanaokacho, Chiyoda-ku', lat:35.6989, lng:139.7738,
    cuisine:'—', famous:'Ten storeys of electronics, ending in a roof garden.',
    desc:'The temple of Akihabara. Whatever you came for is in here somewhere, across ten floors of electronics, manga, games and model kits.',
    officialWebsite:'https://www.yodobashi-akiba.com/',
    image:'https://upload.wikimedia.org/wikipedia/commons/2/24/Yodobashi-Akiba_sign.jpg',
    imageCredit:'Christian Kadluba', imageLicence:'CC BY-SA 2.0',
    imagePage:'https://commons.wikimedia.org/wiki/File:Yodobashi-Akiba_sign.jpg',
    sources:['Official food-floor site: yodobashi-akiba.com'] },
  { id:'sensoji', name:'Sensō-ji', nameJa:'浅草寺', cat:'Culture', ward:'Asakusa, Taito City',
    addr:'2-3-1 Asakusa, Taito-ku', lat:35.7148, lng:139.7967,
    cuisine:'—', famous:'Nakamise, the approach. Tokyo\'s oldest continuously running temple.',
    desc:'Founded in 645 and rebuilt after the 1923 earthquake. The approach, Nakamise, has been a street of small shops for three centuries and is at its best before nine in the morning.',
    officialWebsite:'https://www.senso-ji.jp/',
    image:'https://upload.wikimedia.org/wikipedia/commons/1/10/Main_Hall%2C_Sens%C5%8D-ji_Temple%2C_Tokyo%2C_20240824_1104_5619.jpg',
    imageCredit:'Jakub Halun', imageLicence:'CC BY 4.0',
    imagePage:'https://commons.wikimedia.org/wiki/File:Main_Hall,_Sensō-ji_Temple,_Tokyo,_20240824_1104_5619.jpg',
    sources:['Official site: senso-ji.jp (English page confirms 2-3-1 Asakusa)',
      'Asakusa guide: <a href="https://www.japan.travel/en/destinations/kanto/tokyo/asakusa-and-around/" target="_blank" rel="noopener">japan.travel ↗</a>',
      'Night-ride footage (4K, opens on Commons): <a href="https://commons.wikimedia.org/wiki/File:4K_Tokyo_Night_Riding_Highway_Tour_in_Asakusa_-_Motorcycle_%26_Walking_Travel_in_Japan.webm" target="_blank" rel="noopener">Kaminarimon by bike ↗</a> (Japan Travel Rec, CC BY 3.0)',
      'More Asakusa photographs: <a href="https://commons.wikimedia.org/wiki/Category:Asakusa" target="_blank" rel="noopener">Commons category ↗</a> (licences on file pages)'] },
  { id:'meiji', name:'Meiji Jingu', nameJa:'明治神宮', cat:'Culture', ward:'Yoyogi, Shibuya City',
    addr:'1-1 Yoyogikamizonocho, Shibuya-ku', lat:35.6764, lng:139.6993,
    cuisine:'—', famous:'A forest of over a hundred thousand donated trees, one hundred metres from Shibuya.',
    desc:'A Shinto shrine of deceptively recent date, standing in a planted forest. The contrast with the crossing two hundred metres away is the whole point of visiting.',
    officialWebsite:'https://www.meijijingu.or.jp/',
    image:'https://upload.wikimedia.org/wikipedia/commons/8/89/Meiji-Torii-2018.jpg',
    imageCredit:'Bjorn Christian Torrisen', imageLicence:'CC BY-SA 4.0',
    imagePage:'https://commons.wikimedia.org/wiki/File:Meiji-Torii-2018.jpg',
    sources:['Official site: meijijingu.or.jp'] },
  { id:'tsuwajiri', name:'Jazzy Sport Shimokitazawa', nameJa:'JAZZY SPORT SHIMOKITAZAWA', cat:'Shopping', ward:'Kitazawa, Setagaya City',
    addr:'2-19-17 Kitazawa, Sawadaya Bldg 3F-A, Setagaya-ku, Tokyo 155-0031', lat:35.6603, lng:139.6672,
    cuisine:'Record shop — vinyl, CDs, apparel', famous:'Vinyl across hip hop, jazz, soul and dance, with a studio on the third floor.',
    desc:'The Shimokitazawa branch of a Japanese label founded in 2002 whose roster includes GAGLE and cro-magnon. A minute from the station\'s south-west exit: records and T-shirts downstairs, a dance and yoga studio above.',
    officialWebsite:'http://jazzysport-shimokita.tokyo/',
    sources:['Official site: jazzysport-shimokita.tokyo (address from site footer, coords corroborated by OSM)'] },
  { id:'kuramae', name:'Kuramae', nameJa:'蔵前', cat:'Design', ward:'Kuramae, Taito City',
    addr:'Kuramae, Taito-ku, near the river', lat:35.7046, lng:139.7917,
    cuisine:'—', famous:'Independent designers in converted warehouses and old apartment blocks.',
    desc:'Where Tokyo\'s independent designers now keep studios — ceramics, textiles and furniture, mostly out of sight of the street. A district rather than a venue, so there is no single official site to link.',
    officialWebsite:null,
    sources:['District, not a single venue; no first-party site exists'] }
]

/* --------- location resource: lazy load, honest links, graceful fallback --------- */
const DISH_LINKS = {
  jiro: 'sushi', menchi: null, narisawa: null, birdland: 'yakitori',
  maisen: 'tonkatsu', kagari: null, ippodo: 'matcha', hamilton: null,
  nonbei: 'yakitori', omoide: 'yakitori', golden: null, yodobashi: null,
  sensoji: null, meiji: null, tsuwajiri: null, kuramae: null
}

/* a still frame generated from the scene palette — used when no licensed photo
   exists, so the panel is never empty and never shows a broken icon (§25) */
function drawFallbackArt(cv, l){
  const w = cv.width = 640, h = cv.height = 320
  const x = cv.getContext('2d')
  const warm = l.cat === 'Dining', cult = l.cat === 'Culture'
  const base = warm ? ['#241a12', '#3a2a1c'] : cult ? ['#161c18', '#243028'] : ['#14161c', '#242a36']
  const g = x.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, base[0]); g.addColorStop(1, base[1])
  x.fillStyle = g; x.fillRect(0, 0, w, h)

  /* skyline */
  x.fillStyle = 'rgba(8,8,10,.72)'
  let cx = 0
  while (cx < w){
    const bw = 22 + Math.random() * 46
    const bh = 60 + Math.random() * 150
    x.fillRect(cx, h - bh, bw, bh)
    cx += bw + 5
  }
  /* windows */
  for (let i = 0; i < 190; i++){
    const wx = Math.random() * w, wy = h - 20 - Math.random() * 170
    x.fillStyle = 'rgba(232,217,176,' + (0.12 + Math.random() * 0.5).toFixed(2) + ')'
    x.fillRect(wx, wy, 2.5, 3.5)
  }
  /* street glow + wet reflection */
  const rg = x.createLinearGradient(0, h * 0.62, 0, h)
  rg.addColorStop(0, 'rgba(201,169,97,0)')
  rg.addColorStop(1, 'rgba(201,169,97,.16)')
  x.fillStyle = rg; x.fillRect(0, h * 0.62, w, h * 0.38)
  for (let i = 0; i < 26; i++){
    x.fillStyle = 'rgba(240,220,170,' + (0.03 + Math.random() * 0.09).toFixed(2) + ')'
    x.fillRect(Math.random() * w, h - Math.random() * 70, 1 + Math.random() * 40, 1.2)
  }
  /* vignette */
  const v = x.createRadialGradient(w/2, h/2, h*0.2, w/2, h/2, h*0.95)
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.6)')
  x.fillStyle = v; x.fillRect(0, 0, w, h)
  /* name plate */
  x.font = '300 15px Georgia, serif'
  x.fillStyle = 'rgba(242,236,225,.72)'
  x.fillText(l.name, 22, h - 22)
  x.font = '9px monospace'
  x.fillStyle = 'rgba(201,169,97,.7)'
  x.fillText((l.ward || '').toUpperCase(), 22, h - 9)
}

const imgCache = new Map()

function loadLocationImage(l){
  const img = $('loc-img')
  const loading = $('loc-loading')
  const credit = $('loc-credit')
  const frame = $('loc-frame')

  img.classList.remove('in')
  img.removeAttribute('src')
  credit.hidden = true
  credit.innerHTML = ''
  frame.classList.toggle('plain', !l.image)

  if (!l.image){
    loading.textContent = 'No licensed photograph available — showing the city.'
    loading.classList.remove('gone')
    return
  }

  loading.textContent = 'Loading experience…'
  loading.classList.remove('gone')

  const cached = imgCache.get(l.image)
  if (cached === 'failed'){
    loading.textContent = 'Some details are unavailable right now — showing the city instead.'
    return
  }

  const finish = () => {
    img.classList.add('in')
    loading.classList.add('gone')
  }
  const fail = () => {
    imgCache.set(l.image, 'failed')
    img.classList.remove('in')
    img.removeAttribute('src')
    loading.textContent = 'Some details are unavailable right now — showing the city instead.'
    loading.classList.remove('gone')
  }

  img.onload = finish
  img.onerror = fail
  img.alt = l.name + ', ' + (l.ward || 'Tokyo')
  img.src = l.image

  if (l.imageLicence){
    credit.hidden = false
    credit.innerHTML = 'Photograph: ' + l.imageCredit + ' · ' + l.imageLicence +
      (l.imagePage ? ' · <a href="' + l.imagePage + '" target="_blank" rel="noopener">source</a>' : '')
  }
}

function showLocation(id){
  const l = LOCATIONS.find(x => x.id === id)
  if (!l) return
  markPlace(l.id, l.name)
  $('loc-cat').textContent = l.cat
  $('loc-name').textContent = l.name
  $('loc-district').textContent = l.ward
  $('loc-desc').textContent = l.desc
  $('loc-famous').textContent = l.famous
  $('loc-addr').textContent = l.addr
  $('loc-ward').textContent = l.ward
  $('loc-cuisine').textContent = l.cuisine === '—' ? 'Not applicable' : l.cuisine
  $('loc-coord').textContent = l.lat.toFixed(4) + '° N, ' + l.lng.toFixed(4) + '° E'

  drawFallbackArt($('loc-fallback'), l)
  loadLocationImage(l)

  /* film moment (§28): lazy, muted, user-started; nothing loads until play.
     Entries without an embeddable file keep their out-link in sources. */
  const mw = $('loc-media'), vid = $('loc-video'), vc = $('loc-video-credit')
  try { vid.pause() } catch (e){}
  vid.removeAttribute('src'); vid.removeAttribute('poster')
  if (l.videoUrl){
    mw.hidden = false
    if (l.videoPoster) vid.poster = l.videoPoster
    vid.src = l.videoUrl
    vid.load()
    vc.innerHTML = 'Footage: ' + (l.videoCredit || 'Wikimedia Commons') + ' · ' + (l.videoLicence || '') +
      (l.videoPage ? ' · <a href="' + l.videoPage + '" target="_blank" rel="noopener">file page ↗</a>' : '')
  } else mw.hidden = true

  /* links: only ever real (§28) */
  $('loc-map').href = gmaps(l.lat, l.lng, l.name)
  const off = $('loc-official')
  if (l.officialWebsite){
    off.href = l.officialWebsite
    off.hidden = false
    off.textContent = 'Official website ↗'
  } else {
    off.hidden = true
  }
  $('loc-find').href = 'https://duckduckgo.com/?q=' + encodeURIComponent(l.name + ' Tokyo official')
  $('loc-find').textContent = l.officialWebsite ? 'Search the web ↗' : 'Search location ↗'

  /* sources (§26) */
  const sw = $('loc-sources-wrap')
  if (l.sources && l.sources.length){
    sw.hidden = false
    $('loc-sources').innerHTML = l.sources.map(s => '<li>' + s + '</li>').join('')
  } else sw.hidden = true

  /* location → food → people (§30) */
  const dkey = DISH_LINKS[l.id]
  const dishWrap = $('loc-dish')
  if (dkey && DISHES.some(d => d.id === dkey)){
    const d = DISHES.find(x => x.id === dkey)
    dishWrap.hidden = false
    dishWrap.innerHTML = '<span class="dish-tag">Famous for · ' + d.n + '</span>' +
      '<button class="btn ghost" id="loc-dish-go">Discover the dish →</button>'
    $('loc-dish-go').addEventListener('click', () => {
      closeLocation()
      const idx = DISHES.findIndex(x => x.id === dkey)
      buildDishRail()
      showDish(idx)
      $('provisions').scrollIntoView({ behavior: 'smooth' })
    })
  } else dishWrap.hidden = true

  $('loc-add').onclick = () => { addToItinerary(l.name); closeLocation() }
  $('loc-save').onclick = () => openMoment(
    'TOKYO',
    fmtClock(state.clock) + ' JST · ' + l.ward.split(',')[0],
    l.famous
  )
  $('loc-atlas').onclick = () => { closeLocation(); openAtlasOn(l) }

  $('location').classList.add('on')
  document.body.classList.add('locked')
}

/* fly the real atlas to real coordinates (§31) */
function openAtlasOn(l){
  initMap()
  setTimeout(() => {
    $('atlas').scrollIntoView({ behavior: 'smooth' })
    if (!map || !l) return
    map.flyTo([l.lng, l.lat], 15, { duration: 1800 })
    state.mapOpen = true
    setTimeout(() => { state.mapOpen = false }, 2200)
  }, 300)
}
function closeLocation(){
  $('location').classList.remove('on')
  document.body.classList.remove('locked')
  try {
    const vid = $('loc-video')
    vid.pause(); vid.removeAttribute('src'); vid.removeAttribute('poster'); vid.load()
  } catch (e){}
}
$('loc-close').addEventListener('click', closeLocation)

/* ---------------- food -> chef -> dialogue (§30) ---------------- *
 * The chef is a fictional character who explains how a dish is made. Nothing
 * here claims any connection to a real restaurant or a real person, and a venue
 * is only offered where one has actually been verified (§42).
 */
const CHEF_ID = 'aoi'

const DISH_VENUE = { sushi:'jiro', yakitori:'birdland', tonkatsu:'maisen', matcha:'ippodo' }

const CHEF_TALK = {
  ramen: {
    line: "You looked at the broth before anything else. Good — that is the correct thing to look at. What do you want to know?",
    options: [
      { t:'What makes this broth different?', go:'broth' },
      { t:'What should I order?', go:'order' },
      { t:'How is it actually prepared?', go:'prep' },
      { t:'What do locals order?', go:'local' },
      { t:'Tell me more.', go:'more' }
    ],
    broth: { say:"Pork bone, and a long time. The collagen is what gives it body, so it cannot be hurried — hours, sometimes a full day, skimmed as it goes. Shoyu and miso are shortcuts in the sense that they arrive in minutes. That is the whole difference.", loc:null },
    order: { say:"Start with what you already like. If you have never had tonkotsu, order that and eat it fast — the noodle keeps cooking in the bowl. If you want to understand the broth, order shoyu, which shows you nothing it does not have to.", loc:null },
    prep: { say:"Noodles are cut fresh and boiled to order. The topping is a footnote; almost every shop in Tokyo will get the broth right before it gets anything else right.", loc:null },
    local: { say:"The regulars order whatever the shop is known for, and they have usually stopped reading the board. That is the honest answer: go where you can see the steam, and order what is in front of you.", loc:null },
    more: { say:"One more thing, because nobody tells you this. Slurping is not rude here — it is how you show the broth is right. The noise is a compliment to the pot, not to you.", loc:null }
  },
  sushi: {
    line: "Sushi is the easiest thing to fake and the hardest thing to hide. Tell me where to start and I will tell you what actually matters.",
    options: [
      { t:'What should I order?', go:'order' },
      { t:'How is it prepared?', go:'prep' },
      { t:'What do locals order?', go:'local' },
      { t:'What do I avoid?', go:'avoid' },
      { t:'Tell me more.', go:'more' }
    ],
    order: { say:"Nigiri omakase, and whatever is seasonal. Edomae style leans on neta-mare — the topping seasoned and served over plain dressed rice, so the fish is not hidden by anything.", loc:'jiro' },
    prep: { say:"The rice is the hard part. It is seasoned while still hot, then brought to serving temperature, and it must be eaten within a few minutes or it is overcooked. Everything else on the plate is easier.", loc:null },
    local: { say:"Regulars ask for the omakase and then say nothing at all. The trust is the point — you are being handed the chef's day.", loc:'jiro' },
    avoid: { say:"Skip anything with a very long name you cannot pronounce, and skip the tourist set menus. If the fish is sitting under a display case under light, it is older than you want it to be.", loc:null },
    more: { say:"And eat the fish, not the rice. In a traditional omakase there is no wasabi at all — if there is, ask the chef before reaching for it.", loc:null }
  },
  tempura: {
    line: "Tempura has one rule and everything else follows from it. It must be eaten the second it leaves the pan.",
    options: [
      { t:'What makes good tempura?', go:'broth' },
      { t:'What should I order?', go:'order' },
      { t:'How is it prepared?', go:'prep' },
      { t:'What do locals order?', go:'local' },
      { t:'Tell me more.', go:'more' }
    ],
    broth: { say:"The batter has to be cold and lumpy. Smooth batter fries heavy, and that is the mistake almost everywhere outside Japan makes.", loc:null },
    order: { say:"Ebi and anago are the tests. If the shrimp is straight and the batter is thin enough to see the stripes through, the kitchen is good.", loc:null },
    prep: { say:"Dipped once, held for a count, drained. The oil is the temperature the cook is holding all evening, not a number on a menu.", loc:null },
    local: { say:"The standing counters. Fewer seats, a cook who can see you, and no menu written for tourists.", loc:null },
    more: { say:"Grated daikon radish for dipping, and salt for the seafood. If a restaurant gives you tartar sauce, that is the whole review.", loc:null }
  },
  yakitori: {
    line: "Yakitori is a list, and the order of that list is the whole argument. Every skewer passes over the same coals, in the same sequence, all night.",
    options: [
      { t:'What should I order?', go:'order' },
      { t:'How is it prepared?', go:'prep' },
      { t:'What do locals order?', go:'local' },
      { t:'Tell me more.', go:'more' }
    ],
    order: { say:"Tsukune to start — that is the skewer that tells you whether the rest will be good. Then whatever the shop is famous for, because the queue already decided.", loc:'birdland' },
    prep: { say:"One burner. Raw through to char, in order, over and over, for hours. Salt on the simple things, tare only where tare belongs.", loc:null },
    local: { say:"Sakizuke — an alcoholic drink that is not beer or spirits — between skewers. Regulars order it and nobody else does.", loc:null },
    more: { say:"Ask for the tsukune with the tare poured off, so you taste the meat before the glaze. You can ask for the reverse later.", loc:null }
  },
  tonkatsu: {
    line: "Tonkatsu is a sandwich that people are embarrassed about. Let me explain why they should not be.",
    options: [
      { t:'What makes good tonkatsu?', go:'broth' },
      { t:'What should I order?', go:'order' },
      { t:'How is it prepared?', go:'prep' },
      { t:'What do locals order?', go:'local' },
      { t:'Tell me more.', go:'more' }
    ],
    broth: { say:"Panko. That is the entire argument. Machine crumbs fry heavy and oily; bread crumbs cut from a loaf fry light. Maisen cut theirs from black sourdough, and you can tell before you bite it.", loc:'maisen' },
    order: { say:"The cutlet, shredded cabbage, rice, and soup on the side — the soup after, not before, or the crust goes soft.", loc:null },
    prep: { say:"Pork is swatted dry, floured, egged, and pressed into the crumbs so it stays together. Fried once at a lower temperature to cook through, then again hot to colour.", loc:null },
    local: { say:"Eat it immediately and use less sauce than you think. A second helping of rice is normal; a second helping of cutlet is a statement.", loc:null },
    more: { say:"Ebisu is the temple of the argument. Thirty years of people disagreeing about panko, all of them right.", loc:null }
  },
  wagashi: {
    line: "Wagashi is the part of the meal most people skip, and it is the part with the shortest life. Look at it before you eat it.",
    options: [
      { t:'What is it?', go:'broth' },
      { t:'What should I order?', go:'order' },
      { t:'How is it prepared?', go:'prep' },
      { t:'When is it in season?', go:'local' },
      { t:'Tell me more.', go:'more' }
    ],
    broth: { say:"Sweets built around the season rather than the shelf. Sweet potato in autumn, sakura in spring, yuzu in winter. If it does not match the month, it is not wagashi.", loc:null },
    order: { say:"Ask what arrived today and choose that. The counter will almost always be right about what is best.", loc:null },
    prep: { say:"Rice paste, red bean, agar, fruit — and the hands of someone who does this every day for years.", loc:null },
    local: { say:"You will be offered tea with it, and you should accept. The pairing is deliberate.", loc:null },
    more: { say:"Eat it with your fingers if you are given no fork. That is not informality; it is the correct way to eat something this delicate.", loc:null }
  },
  matcha: {
    line: "Matcha is a bowl and a whisk and about four minutes of someone's morning. You have spotted the least interesting part of it.",
    options: [
      { t:'How is it prepared?', go:'prep' },
      { t:'What should I order?', go:'order' },
      { t:'What do locals order?', go:'local' },
      { t:'Is there etiquette?', go:'broth' },
      { t:'Tell me more.', go:'more' }
    ],
    order: { say:"Ask for whichever of the three thicknesses you have not had. Koicha is thick and ceremonial, usucha is thin and everyday, and matcha in between.", loc:'ippodo' },
    prep: { say:"Ground on a stone mill, whisked in a bowl, not stirred. The foam is the proof it was whisked rather than mixed.", loc:null },
    local: { say:"Sencha by day for most people, and gyokuro if you want the rare, shaded, almost savoury version. The second bowl is where it starts to make sense.", loc:null },
    broth: { say:"Turn the bowl so the front faces you and drink from the side, not the front. Finish it — leaving a mouthful is how you politely refuse a refill.", loc:null },
    more: { say:"And the first bowl is always too bitter and too hot. That is correct. Start again.", loc:null }
  },
  sake: {
    line: "Sake is the part of the evening people treat as an aperitif. It is not an aperitif. Shall I change your mind?",
    options: [
      { t:'How is sake made?', go:'prep' },
      { t:'What should I order?', go:'order' },
      { t:'What do locals order?', go:'local' },
      { t:'How do I drink it?', go:'broth' },
      { t:'Tell me more.', go:'more' }
    ],
    order: { say:"Junmai daiginjo poured cold, taken slowly, and almost nothing on the palate — which is the point, not a disappointment. Anything elaborate will drown it.", loc:null },
    prep: { say:"Rice is polished, fermented with koji, pressed, and filtered. The polish is the cost and the age; the koji does the work.", loc:null },
    local: { say:"Sakazuki, not glasses. Heated to just below body temperature — warm sake is drunk cool, which is why it feels like a mistake the first time.", loc:null },
    broth: { say:"Small sips, and something to eat between them. Sake drunk on an empty stomach arrives faster than you expect.", loc:null },
    more: { say:"Ask for the brewery. Almost nobody does, and the brewer is normally two hours away by train.", loc:null }
  }
}

function meetTheChef(dishId){
  const dish = DISHES.find(d => d.id === dishId)
  const talkSet = CHEF_TALK[dishId] || CHEF_TALK.ramen
  const chef = PEOPLE.find(p => p.id === CHEF_ID)
  const venue = DISH_VENUE[dishId]
  /* the chef explains the dish; a real place is only offered when verified */
  const options = talkSet.options.map(o => Object.assign({}, o))
  if (venue){
    const l = LOCATIONS.find(x => x.id === venue)
    if (l) options.push({ t: 'Show me ' + l.name + ' →', go: '__venue:' + venue })
  }
  handleChoice.__pendingVenue = venue || null
  openDialogue(CHEF_ID, {
    line: talkSet.line, options, topic: dishId, keepMemory: true
  })
}

function handleChoice(b){
  /* food conversations branch through the chef's own script, but they end up
     in the same actions — Show me, Show on atlas, Add to My Tokyo */
  if (b.go && b.go.indexOf('__venue:') === 0){
    dlgLine(nameOf(state.guide), b.t, 'user')
    pendingLoc = b.go.split(':')[1]
    replyWithVenue(pendingLoc)
    return
  }
  if (b.go === '__opts'){
    dlgLine(nameOf(state.guide), b.t, 'user')
    dlgButtons(talk.food && CHEF_TALK[talk.food] ? CHEF_TALK[talk.food].options : DIALOGUE[state.guide].options)
    return
  }
  const chefNode = talk.food && CHEF_TALK[talk.food] ? CHEF_TALK[talk.food][b.go] : null
  if (chefNode){
    dlgLine(nameOf(state.guide), b.t, 'user')
    setTimeout(() => {
      dlgLine(nameOf(state.guide), chefNode.say)
      const venue = DISH_VENUE[talk.food]
      const acts = []
      if (venue){
        acts.push({ t:'Show me →', go:'view', primary:true })
        acts.push({ t:'Show on atlas →', go:'atlas' })
      }
      acts.push({ t:'Tell me more.', go:'more' })
      acts.push({ t:'Back to the options.', go:'__opts' })
      dlgButtons(acts)
      pendingLoc = venue || null
      talk.lastTopic = b.go
      setDlgState('Reply ready — press Listen to hear it.')
    }, 380)
    return
  }
  handleCharacterChoice(b)
}

function replyWithVenue(id){
  const l = LOCATIONS.find(x => x.id === id)
  if (!l) return
  setTimeout(() => {
    dlgButtons([
      { t:'Show me →', go:'view', primary:true },
      { t:'Show on atlas →', go:'atlas' },
      { t:'Add to my Tokyo', add: l.name },
      { t:'Back to the options.', go:'__opts' }
    ])
    pendingLoc = id
    setDlgState('Reply ready — press Listen to hear it.')
  }, 380)
}

/* ------------------------------ food ------------------------------ */

const DISHES = [
  { id:'ramen', ja:'ラーメン', n:'Ramen', cat:'Noodle', districts:['shinjuku','nishishinjuku','shibuya','akihabara'], serve:'Poured from the pot in front of you. The broth is the dish; the toppings are a footnote.',
    ask:'Tonkotsu for a rich pork-bone broth, shoyu for a clear one, miso for depth. Menma, ajitama, chashu.',
    where:'Ramen Nagi in Shinjuku and Yoyogi, or the late-night counters under the tracks in Omoide Yokocho.',
    etq:'Slurping is encouraged and considered a compliment. Eat quickly — the noodle continues to cook in the bowl.',
    image: MEDIA.ramen.image.url,
    imageCredit: MEDIA.ramen.image.credit, imageLicence: MEDIA.ramen.image.license,
    imagePage: MEDIA.ramen.image.source },
  { id:'sushi', ja:'寿司', n:'Sushi', cat:'Seafood', districts:['tsukiji','ginza','roppongi'], serve:'Nigiri omakase, decided by the chef, or jai course ordered by the customer.',
    ask:'Nigiri omakase, and whichever is seasonal. Edomae style favours neta-mare over vinegar.',
    where:'Sukiyabashi Jiro in Ginza for the counter experience; Sushi Saito in Roppongi for the reservation.',
    etq:'No wasabi in a traditional omakase — the chef wasabi is subtle. Eat the fish, not the rice.' },
  { id:'tempura', ja:'天ぷら', n:'Tempura', cat:'Seafood', districts:['ginza','tsukiji'], serve:'Fried to order, drained on paper, eaten immediately with salt or grated daikon.',
    ask:'Ebi, anago, seasonal white fish. Order the "awase" and let the kitchen choose.',
    where:'Tempura counters in Ginza and Nihonbashi; the standing-only places are usually the best.',
    etq:'Eat as it arrives. It does not travel. Dip sparingly — the prawn salt carries the flavour.' },
  { id:'yakitori', ja:'焼鳥', n:'Yakitori', cat:'Meat', districts:['shinjuku','nishishinjuku','shibuya'], serve:'Skewers over binchōtan, cooked to order, with only salt or tare.',
    ask:'The chicken, the liver, the tsukune, and the leek. Order by number.',
    where:'Ginza Birdland in Ginza, or any of the counters in Nonbei Yokocho in Shibuya.',
    etq:'Eat from the skewer, one at a time. Order slowly, and never rush the queue.' },
  { id:'tonkatsu', ja:'とんかつ', n:'Tonkatsu', cat:'Meat', districts:['shibuya','shinjuku'], serve:'Breaded pork cutlet, sliced, with shredded cabbage and a dipping sauce.',
    ask:'The tenderloin cut, or the katsudon if you want it over rice.',
    where:'Maisen Aoyama Honten in Shibuya, and the branches across Tokyo.',
    etq:'The sauce is for the pork only. Dip the cabbage separately, or the cutlet softens.' },
  { id:'wagashi', ja:'和菓子', n:'Wagashi', cat:'Sweet', districts:['asakusa','ginza','nakameguro','harajuku'], serve:'Seasonal sweets arranged on lacquer and eaten with matcha.',
    ask:'Whatever is in season. In spring, sakura; in summer, watermelon and firefly jelly.',
    where:'Hama-no-Ya in Nihonbashi and Ginza for the classic style.',
    etq:'Seasonal confectionery is made to be eaten at one particular time of year. Ask what is right now.' },
  { id:'matcha', ja:'抹茶', n:'Matcha', cat:'Tea', districts:['asakusa','nakameguro','harajuku','ginza'], serve:'Whisked in a chawan with a chasen bamboo whisk, drunk as ceremony.',
    ask:'Usucha for thin and foamy, koicha for thick and bitter. Ippodo sells the Kyoto blend.',
    where:'Ippodo Tea in Yanaka, or a kaiseki course where matcha arrives unbidden.',
    etq:'Drink promptly and in three small sips. Turn the bowl a quarter before setting it down.' },
  { id:'sake', ja:'日本酒', n:'Sake', cat:'Drink', districts:['shinjuku','nishishinjuku','roppongi','akihabara'], serve:'Chilled for junmai, warmed for genshu, and at body temperature for sairei.',
    ask:'Ask for the brewery\'s standard blend. Serve it in ochoko, never in a wine glass.',
    where:'Izakaya counters in Omoide Yokocho; Yamanote breweries tour from Tokyo.',
    etq:'Warm sake is served in a tokkuri. Never pour your own from the bottle on the table.' }
]

/* Food follows the journey: the rail leads with what the current
   district is known for, so Tsukiji suggests sushi before tonkatsu. */
function refreshDishDistrict(){
  const dk = (atmosphere.state.district || 'shinjuku').toLowerCase()
  const rail = $('dish-rail')
  if (!rail) return
  const btns = Array.from(rail.querySelectorAll('button'))
  btns.sort((a, b) => {
    const da = DISHES.find(d => d.id === a.dataset.dish)
    const db = DISHES.find(d => d.id === b.dataset.dish)
    const ka = da && da.districts && da.districts.includes(dk) ? 0 : 1
    const kb = db && db.districts && db.districts.includes(dk) ? 0 : 1
    return ka - kb
  })
  btns.forEach(b => rail.appendChild(b))
  const picks = DISHES.filter(d => d.districts && d.districts.includes(dk)).map(d => d.n)
  let cap = $('dish-district')
  if (!cap){
    cap = document.createElement('p')
    cap.id = 'dish-district'
    cap.className = 'mono'
    cap.style.cssText = 'font-size:9px;letter-spacing:.22em;text-transform:uppercase;color:var(--champagne);margin:0 0 14px'
    rail.after(cap)
  }
  const dname = atmosphere.districtName ? atmosphere.districtName() : dk
  cap.textContent = picks.length ? ('In ' + dname + ' now — ' + picks.join(' · ')) : ''
}

function buildDishRail(){
  const rail = $('dish-rail')
  DISHES.forEach((d, i) => {
    const b = document.createElement('button')
    b.textContent = d.n
    b.dataset.dish = d.id
    b.setAttribute('role', 'tab')
    b.addEventListener('click', () => showDish(i))
    rail.appendChild(b)
  })
  showDish(0)
}

/* ==========================================================================
   FOOD, DRAWN
   No licensed food photography exists for these dishes, and inventing image
   URLs is not an option. Rather than a plate with a coloured shape on it,
   each dish is drawn from the inside out: the actual vessel, the actual
   arrangement of the actual components, in the presentation you would
   actually be served. Warm overhead light, dark table, no garnish fiction.
   ========================================================================== */

const DISH_ART = {
  /* --- shared drawing helpers --- */
  _table(x, w, h, warm){
    const g = x.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#14100e'); g.addColorStop(1, '#241c16')
    x.fillStyle = g; x.fillRect(0, 0, w, h)
    const rg = x.createRadialGradient(w/2, h*0.42, 10, w/2, h*0.42, w*0.5)
    rg.addColorStop(0, 'rgba(255,224,170,' + (warm || 0.16) + ')')
    rg.addColorStop(1, 'rgba(255,224,170,0)')
    x.fillStyle = rg; x.fillRect(0, 0, w, h)
    const v = x.createRadialGradient(w/2, h/2, h*0.25, w/2, h/2, h*1.05)
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.62)')
    x.fillStyle = v; x.fillRect(0, 0, w, h)
  },
  _steam(x, cx, y, n, alpha){
    x.strokeStyle = 'rgba(255,246,232,' + (alpha || 0.16) + ')'
    x.lineWidth = 2.4; x.lineCap = 'round'
    for (let i = 0; i < n; i++){
      const bx = cx + (i - (n-1)/2) * 26
      x.beginPath()
      x.moveTo(bx, y)
      x.bezierCurveTo(bx + 14, y - 22, bx - 14, y - 44, bx + 4, y - 66)
      x.stroke()
    }
  },
  /* a bowl seen from slightly above: outer wall, inner well, contents */
  _bowl(x, cx, cy, rw, rh, wall, inner){
    x.fillStyle = wall
    x.beginPath(); x.ellipse(cx, cy, rw, rh, 0, 0, Math.PI*2); x.fill()
    x.fillStyle = 'rgba(0,0,0,.34)'
    x.beginPath(); x.ellipse(cx, cy + rh*0.1, rw*0.98, rh*0.9, 0, 0, Math.PI*2); x.fill()
    x.fillStyle = inner
    x.beginPath(); x.ellipse(cx, cy + rh*0.06, rw*0.84, rh*0.74, 0, 0, Math.PI*2); x.fill()
  },
  _plate(x, cx, cy, rw, rh, rim){
    x.fillStyle = '#1b1a18'
    x.beginPath(); x.ellipse(cx, cy + 4, rw + 5, rh + 5, 0, 0, Math.PI*2); x.fill()
    x.fillStyle = rim || '#efe8da'
    x.beginPath(); x.ellipse(cx, cy, rw, rh, 0, 0, Math.PI*2); x.fill()
    x.fillStyle = 'rgba(0,0,0,.05)'
    x.beginPath(); x.ellipse(cx, cy + 3, rw*0.82, rh*0.78, 0, 0, Math.PI*2); x.fill()
  },
  _label(x, w, h, en, ja, cat){
    x.font = '300 19px Georgia, serif'; x.fillStyle = 'rgba(244,238,228,.88)'
    x.fillText(en, 24, h - 40)
    x.font = '13px "Yu Gothic", "Hiragino Sans", sans-serif'
    x.fillStyle = 'rgba(201,169,97,.85)'
    x.fillText(ja, 24, h - 22)
    if (cat){
      x.font = '9px monospace'; x.fillStyle = 'rgba(242,236,225,.34)'
      x.fillText(String(cat).toUpperCase(), w - 24 - x.measureText(String(cat).toUpperCase()).width, h - 22)
    }
  },

  /* ---------------- ramen ---------------- */
  ramen(x, w, h){
    this._table(x, w, h, 0.2)
    const cx = w/2, cy = h*0.62
    /* pale pork-bone broth */
    this._bowl(x, cx, cy, 128, 46, '#d9d2c4', '#c9a978')
    x.fillStyle = '#b8905c'
    x.beginPath(); x.ellipse(cx, cy + 3, 100, 33, 0, 0, Math.PI*2); x.fill()
    /* noodles, visible at the surface and over the rim */
    x.strokeStyle = 'rgba(240,226,190,.85)'; x.lineWidth = 3
    for (let i = 0; i < 9; i++){
      const yy = cy - 8 + i * 4
      x.beginPath()
      x.moveTo(cx - 92, yy)
      x.bezierCurveTo(cx - 40, yy - 7, cx + 40, yy + 7, cx + 92, yy - 2)
      x.stroke()
    }
    /* chashu: a slice of rolled pork with a pink centre */
    x.save(); x.translate(cx - 46, cy - 4); x.rotate(-0.18)
    x.fillStyle = '#e6d3b8'; x.beginPath(); x.ellipse(0, 0, 30, 13, 0, 0, Math.PI*2); x.fill()
    x.fillStyle = '#c98a86'; x.beginPath(); x.ellipse(0, -1, 24, 9, 0, 0, Math.PI*2); x.fill()
    x.fillStyle = '#e8cfa8'; x.beginPath(); x.ellipse(0, -1, 11, 5, 0, 0, Math.PI*2); x.fill()
    x.restore()
    /* ajitama: halved marinated egg, orange yolk */
    x.save(); x.translate(cx + 42, cy - 6)
    x.fillStyle = '#efe0bd'; x.beginPath(); x.ellipse(0, 0, 17, 14, 0, 0, Math.PI*2); x.fill()
    x.fillStyle = '#e8912f'; x.beginPath(); x.ellipse(0, 1, 9, 8, 0, 0, Math.PI*2); x.fill()
    x.fillStyle = 'rgba(120,70,30,.45)'; x.beginPath(); x.ellipse(0, 0, 17, 14, 0, 0, Math.PI*2);
    x.lineWidth = 2.5; x.strokeStyle = 'rgba(120,70,30,.45)'; x.stroke()
    x.restore()
    /* nori leaning at the back */
    x.save(); x.translate(cx + 4, cy - 26); x.rotate(0.12)
    x.fillStyle = '#20242a'; x.fillRect(-26, -20, 52, 40)
    x.strokeStyle = 'rgba(255,255,255,.07)'; x.lineWidth = 1
    for (let i = 0; i < 5; i++){ x.beginPath(); x.moveTo(-26, -16 + i*8); x.lineTo(26, -16 + i*8); x.stroke() }
    x.restore()
    /* scallions scattered on top */
    x.fillStyle = '#7f9a4e'
    for (let i = 0; i < 14; i++){
      const a = i * 2.1
      x.save(); x.translate(cx + Math.cos(a)*72, cy - 4 + Math.sin(a)*20); x.rotate(a)
      x.fillRect(-4, -1.6, 8, 3.2); x.restore()
    }
    /* chopsticks on the rim */
    x.strokeStyle = '#3a2a1c'; x.lineWidth = 4; x.lineCap = 'round'
    x.beginPath(); x.moveTo(cx + 96, cy - 30); x.lineTo(cx + 168, cy - 52); x.stroke()
    x.beginPath(); x.moveTo(cx + 104, cy - 26); x.lineTo(cx + 176, cy - 48); x.stroke()
    this._steam(x, cx, cy - 34, 3, 0.2)
  },

  /* ---------------- sushi ---------------- */
  sushi(x, w, h){
    this._table(x, w, h, 0.14)
    const cx = w/2, cy = h*0.62
    this._plate(x, cx, cy, 176, 62, '#1e1c19')
    /* ginger and wasabi first, so the plate is composed */
    x.fillStyle = '#efeae0'
    for (let i = 0; i < 6; i++){
      x.save(); x.translate(cx - 158, cy + 16); x.rotate(i * 0.62)
      x.beginPath(); x.ellipse(0, 0, 11, 4.6, 0, 0, Math.PI*2); x.fill(); x.restore()
    }
    x.fillStyle = '#7d9b52'
    x.beginPath(); x.ellipse(cx + 156, cy + 20, 13, 9, 0.3, 0, Math.PI*2); x.fill()

    /* five nigiri, each a rice base with the fish laid over it and overhanging */
    const fish = ['#e2a07c', '#d98a63', '#c9714b', '#e8b478', '#d4785a']
    const names = ['#e26a4a', '#c9563f', '#b8452f', '#d98a4a', '#c2603f']
    for (let i = 0; i < 5; i++){
      const ox = cx - 128 + i * 64
      const oy = cy - 6 + (i % 2 ? 6 : -4)
      const tilt = (i - 2) * 0.03

      x.save(); x.translate(ox, oy); x.rotate(tilt)

      /* rice: a squat mound, grains suggested along the lower edge */
      x.fillStyle = '#f4eee2'
      x.beginPath(); x.ellipse(0, 6, 27, 15, 0, 0, Math.PI*2); x.fill()
      x.fillStyle = 'rgba(206,196,176,.45)'
      for (let g = 0; g < 9; g++){
        x.beginPath()
        x.ellipse(-19 + g * 4.8, 8 + ((g * 5) % 7) - 3, 3.6, 2, 0.55, 0, Math.PI*2); x.fill()
      }

      /* the fish: a slice lying across the top and hanging over both ends */
      x.fillStyle = fish[i]
      x.beginPath()
      x.moveTo(-31, -1)
      x.bezierCurveTo(-30, -14, -12, -19, 0, -19)
      x.bezierCurveTo(12, -19, 30, -14, 31, -1)
      x.bezierCurveTo(22, 3, -22, 3, -31, -1)
      x.closePath(); x.fill()
      /* marbling */
      x.strokeStyle = 'rgba(255,246,232,.55)'; x.lineWidth = 1.3
      x.beginPath(); x.moveTo(-24, -7); x.bezierCurveTo(-8, -12, 8, -11, 24, -7); x.stroke()
      x.beginPath(); x.moveTo(-20, -12); x.bezierCurveTo(-6, -16, 8, -15, 20, -12); x.stroke()
      /* the pale underside catching light */
      x.fillStyle = 'rgba(255,235,215,.22)'
      x.beginPath()
      x.moveTo(-28, -2); x.bezierCurveTo(-14, 1, 14, 1, 28, -2)
      x.lineTo(28, 1); x.bezierCurveTo(14, 4, -14, 4, -28, 1)
      x.closePath(); x.fill()
      /* a nori band around the middle of two of them */
      if (i === 1 || i === 3){
        x.fillStyle = '#1d2026'
        x.fillRect(-14, -20, 28, 26)
        x.fillStyle = 'rgba(255,255,255,.05)'
        x.fillRect(-14, -20, 28, 3)
      }
      x.restore()
    }

    /* lacquered chopsticks across the front */
    x.strokeStyle = '#1d1512'; x.lineWidth = 5.5; x.lineCap = 'round'
    x.beginPath(); x.moveTo(cx - 46, cy + 64); x.lineTo(cx + 132, cy + 50); x.stroke()
    x.beginPath(); x.moveTo(cx - 40, cy + 71); x.lineTo(cx + 138, cy + 57); x.stroke()
    x.fillStyle = '#e8e2d4'
    x.fillRect(cx - 84, cy + 60, 40, 9)
  },

  /* ---------------- tempura ---------------- */
  tempura(x, w, h){
    this._table(x, w, h, 0.15)
    const cx = w/2, cy = h*0.6
    this._plate(x, cx - 10, cy, 196, 52, '#e8e2d4')
    /* absorbent paper liner */
    x.fillStyle = '#d9cfb8'
    x.save(); x.translate(cx - 10, cy); x.rotate(-0.03)
    x.beginPath(); x.roundRect ? x.roundRect(-186, -32, 372, 64, 4) : x.rect(-186, -32, 372, 64)
    x.fill()
    x.strokeStyle = 'rgba(120,100,70,.14)'; x.lineWidth = 1
    for (let i = 0; i < 9; i++){ x.beginPath(); x.moveTo(-186, -26 + i*7); x.lineTo(186, -26 + i*7); x.stroke() }
    x.restore()

    /* three pieces, each an irregular battered shape with a dark fried edge */
    const pieces = [
      { ox: -104, oy: 2,  rot: -0.20, kind: 'prawn',  sc: 1.00 },
      { ox: -10,  oy: -8, rot: 0.06,  kind: 'veg',    sc: 0.92 },
      { ox: 92,   oy: 4,  rot: 0.24,  kind: 'veg2',   sc: 0.86 }
    ]
    pieces.forEach(p => {
      x.save()
      x.translate(cx + p.ox, cy + p.oy)
      x.rotate(p.rot)
      x.scale(p.sc, p.sc)

      /* fried silhouette: lumps of batter, not one smooth ellipse */
      x.fillStyle = '#c98a34'
      x.beginPath()
      const lobes = p.kind === 'prawn' ? 13 : 11
      for (let k = 0; k <= lobes; k++){
        const t = k / lobes
        const ang = t * Math.PI * 2
        const rx = p.kind === 'prawn' ? 46 : 34
        const ry = p.kind === 'prawn' ? 21 : 26
        const bump = 1 + Math.sin(k * 2.3) * 0.11
        const px = Math.cos(ang) * rx * bump
        const py = Math.sin(ang) * ry * bump
        if (k === 0) x.moveTo(px, py); else x.lineTo(px, py)
      }
      x.closePath(); x.fill()
      /* a crisp outline so it does not melt into the plate */
      x.strokeStyle = 'rgba(90,52,12,.5)'; x.lineWidth = 2; x.stroke()

      /* batter crumb highlights */
      for (let k = 0; k < 30; k++){
        const a = k * 0.79
        const rr = 0.35 + (k % 4) * 0.16
        x.fillStyle = k % 2 ? 'rgba(255,228,168,.4)' : 'rgba(146,88,24,.34)'
        x.beginPath()
        x.arc(Math.cos(a) * 34 * rr * 1.5, Math.sin(a) * 18 * rr * 1.5, 3.1, 0, Math.PI*2); x.fill()
      }
      /* shadow under the batter */
      x.fillStyle = 'rgba(60,30,8,.22)'
      x.beginPath(); x.ellipse(2, 15, 34, 7, 0, 0, Math.PI*2); x.fill()

      if (p.kind === 'prawn'){
        /* the tail and the curve of the prawn read clearly */
        x.fillStyle = '#d9713c'
        x.beginPath()
        x.moveTo(34, -2); x.bezierCurveTo(54, -6, 62, 4, 56, 12)
        x.lineTo(46, 8); x.bezierCurveTo(52, 4, 48, -1, 36, 2)
        x.closePath(); x.fill()
        x.strokeStyle = 'rgba(110,44,14,.55)'; x.lineWidth = 1.4; x.stroke()
        x.fillStyle = 'rgba(255,206,150,.35)'
        x.beginPath(); x.ellipse(48, 4, 8, 4, 0.4, 0, Math.PI*2); x.fill()
      }
      if (p.kind === 'veg'){
        /* a slice of sweet potato, its orange flesh showing at the cut end */
        x.fillStyle = '#e08c33'
        x.beginPath(); x.ellipse(-28, -4, 13, 20, -0.2, 0, Math.PI*2); x.fill()
        x.strokeStyle = 'rgba(120,60,14,.5)'; x.lineWidth = 1.6; x.stroke()
        x.strokeStyle = 'rgba(160,80,20,.5)'; x.lineWidth = 1.2
        x.beginPath(); x.moveTo(-28, -12); x.lineTo(-28, 4); x.stroke()
      }
      if (p.kind === 'veg2'){
        /* lotus root, and you can see the holes */
        x.fillStyle = '#e6dcc4'
        x.beginPath(); x.ellipse(0, 2, 26, 22, 0, 0, Math.PI*2); x.fill()
        x.fillStyle = '#b6a483'
        for (let k = 0; k < 6; k++){
          const a = k * 1.05
          x.beginPath()
          x.ellipse(Math.cos(a)*12, 2 + Math.sin(a)*10, 4.4, 3.4, 0, 0, Math.PI*2); x.fill()
        }
        x.strokeStyle = 'rgba(120,104,72,.6)'; x.lineWidth = 1.6
        x.beginPath(); x.ellipse(0, 2, 26, 22, 0, 0, Math.PI*2); x.stroke()
      }
      x.restore()
    })

    /* tentsuyu in its own dish, and a mound of grated daikon */
    this._bowl(x, cx + 236, cy + 52, 46, 17, '#2a2622', '#4a3418')
    x.fillStyle = '#f4f2e8'
    x.beginPath()
    x.moveTo(cx - 258, cy + 58); x.lineTo(cx - 196, cy + 46)
    x.lineTo(cx - 196, cy + 62); x.lineTo(cx - 258, cy + 72)
    x.closePath(); x.fill()
    x.strokeStyle = 'rgba(150,146,130,.5)'; x.lineWidth = 1
    for (let i = 0; i < 12; i++){
      x.beginPath()
      x.moveTo(cx - 256 + i*5, cy + 50 + i*1.6); x.lineTo(cx - 256 + i*5, cy + 68 - i*1.2)
      x.stroke()
    }
    this._steam(x, cx - 10, cy - 44, 3, 0.15)
  },

  /* ---------------- yakitori ---------------- */
  yakitori(x, w, h){
    this._table(x, w, h, 0.17)
    const cx = w/2, cy = h*0.58
    /* rectangular plate, as skewers are served */
    x.fillStyle = '#191817'
    x.fillRect(cx - 190, cy - 46, 380, 130)
    x.fillStyle = '#26241f'
    x.fillRect(cx - 184, cy - 40, 368, 118)
    /* six skewers, alternating tare-glazed and salt-only */
    for (let i = 0; i < 6; i++){
      const y = cy - 26 + i * 19
      /* bamboo */
      x.strokeStyle = '#c8ab74'; x.lineWidth = 3.4; x.lineCap = 'round'
      x.beginPath(); x.moveTo(cx - 176, y + 4); x.lineTo(cx + 176, y - 4); x.stroke()
      /* three chunks of chicken */
      for (let k = 0; k < 3; k++){
        const bx = cx - 58 + k * 58
        const glazed = i % 2 === 0
        x.fillStyle = glazed
          ? ['#8c4a22', '#a35c28', '#7d3f1c'][k]
          : ['#d3a45c', '#e0b269', '#c99750'][k]
        x.beginPath(); x.ellipse(bx, y, 24, 12, 0.05, 0, Math.PI*2); x.fill()
        /* char marks */
        x.strokeStyle = 'rgba(40,18,8,.5)'; x.lineWidth = 2.2
        x.beginPath(); x.moveTo(bx - 14, y - 4); x.lineTo(bx + 14, y + 3); x.stroke()
        /* glaze sheen */
        if (glazed){
          x.fillStyle = 'rgba(255,190,110,.24)'
          x.beginPath(); x.ellipse(bx - 5, y - 5, 10, 3.4, 0, 0, Math.PI*2); x.fill()
        }
      }
    }
    /* shichimi shaker and a lemon wedge */
    x.fillStyle = '#2f2b26'; x.fillRect(cx + 196, cy - 30, 18, 44)
    x.fillStyle = '#6b3f22'; x.fillRect(cx + 196, cy - 34, 18, 8)
    x.fillStyle = '#e8d06a'
    x.beginPath(); x.arc(cx - 214, cy + 34, 15, 0, Math.PI*2); x.fill()
    x.fillStyle = '#f2e6a8'
    x.beginPath(); x.arc(cx - 214, cy + 34, 11, 0, Math.PI*2); x.fill()
  },

  /* ---------------- tonkatsu ---------------- */
  tonkatsu(x, w, h){
    this._table(x, w, h, 0.16)
    const cx = w/2, cy = h*0.62
    this._plate(x, cx - 54, cy, 146, 62, '#f0ebdf')

    /* shredded cabbage: distinct strands, not a smudge */
    for (let i = 0; i < 150; i++){
      const a = i * 0.83, r = Math.sqrt((i % 70) / 70)
      const sx = cx - 128 + Math.cos(a) * r * 44
      const sy = cy + 10 + Math.sin(a) * r * 24
      x.save(); x.translate(sx, sy); x.rotate(a)
      x.strokeStyle = i % 3 ? 'rgba(232,238,222,.92)' : 'rgba(206,216,196,.9)'
      x.lineWidth = 2.1
      x.beginPath(); x.moveTo(-7, 0); x.quadraticCurveTo(0, -2.5, 7, 0); x.stroke()
      x.restore()
    }
    /* the pale heart of the cabbage */
    x.fillStyle = 'rgba(246,250,240,.75)'
    x.beginPath(); x.ellipse(cx - 128, cy + 8, 20, 12, 0, 0, Math.PI*2); x.fill()

    /* two halves, clearly separated, each showing a cut face */
    const halves = [
      { ox: -44, rot: -0.16 },
      { ox: 52,  rot: 0.14 }
    ]
    halves.forEach(hf => {
      const bx = cx + hf.ox, by = cy - 4
      x.save(); x.translate(bx, by); x.rotate(hf.rot)

      /* crust */
      x.fillStyle = '#d79a45'
      x.beginPath(); x.ellipse(0, 0, 44, 28, 0, 0, Math.PI*2); x.fill()
      /* crumb */
      for (let k = 0; k < 60; k++){
        const a = k * 0.47
        x.fillStyle = k % 2 ? 'rgba(255,228,164,.34)' : 'rgba(146,88,26,.3)'
        x.beginPath()
        x.arc(Math.cos(a) * 37, Math.sin(a) * 21, 3.2, 0, Math.PI*2); x.fill()
      }
      x.strokeStyle = 'rgba(120,66,16,.45)'; x.lineWidth = 1.8
      x.beginPath(); x.ellipse(0, 0, 44, 28, 0, 0, Math.PI*2); x.stroke()

      /* the cut face, on the inner edge of each half: pale seasoned pork */
      const dir = hf.ox < 0 ? 1 : -1
      x.fillStyle = '#f2e6cc'
      x.beginPath()
      x.moveTo(dir * 30, -24)
      x.bezierCurveTo(dir * 46, -14, dir * 46, 14, dir * 30, 24)
      x.lineTo(dir * 20, 20)
      x.bezierCurveTo(dir * 34, 10, dir * 34, -10, dir * 20, -20)
      x.closePath(); x.fill()
      /* a thin darker rim where crust meets meat */
      x.strokeStyle = 'rgba(150,110,58,.55)'; x.lineWidth = 1.6
      x.beginPath()
      x.moveTo(dir * 24, -21)
      x.bezierCurveTo(dir * 38, -11, dir * 38, 11, dir * 24, 21)
      x.stroke()
      /* sauce clinging to the cut face */
      x.fillStyle = 'rgba(58,34,16,.45)'
      x.beginPath()
      x.moveTo(dir * 34, -12)
      x.bezierCurveTo(dir * 44, 0, dir * 36, 12, dir * 30, 16)
      x.bezierCurveTo(dir * 38, 4, dir * 38, -4, dir * 30, -10)
      x.closePath(); x.fill()
      x.restore()
    })

    /* katsudon-style sauce, dark and glossy, pooled not flooded */
    x.fillStyle = 'rgba(52,30,14,.7)'
    x.beginPath(); x.ellipse(cx + 4, cy + 22, 108, 20, 0, 0, Math.PI*2); x.fill()
    x.fillStyle = 'rgba(255,214,150,.14)'
    x.beginPath(); x.ellipse(cx - 16, cy + 16, 34, 6, 0, 0, Math.PI*2); x.fill()

    /* rice bowl and miso soup, as the set is served */
    this._bowl(x, cx + 196, cy - 4, 60, 24, '#e9e4d8', '#f6f2e8')
    x.fillStyle = '#efeadd'
    x.beginPath(); x.ellipse(cx + 196, cy - 6, 46, 17, 0, 0, Math.PI*2); x.fill()
    x.fillStyle = 'rgba(214,204,186,.6)'
    for (let g = 0; g < 20; g++){
      x.beginPath()
      x.ellipse(cx + 196 - 36 + (g % 6) * 14, cy - 10 + Math.floor(g/6) * 5, 6, 2.4, 0.2, 0, Math.PI*2); x.fill()
    }
    this._bowl(x, cx + 198, cy + 62, 44, 16, '#ded8ca', '#a9763f')
    x.fillStyle = '#6f8f45'
    x.beginPath(); x.ellipse(cx + 208, cy + 60, 5.5, 3, 0, 0, Math.PI*2); x.fill()
    x.beginPath(); x.ellipse(cx + 186, cy + 64, 4, 2.6, 0, 0, Math.PI*2); x.fill()

    /* mustard, and a pair of tonkatsu-specific chopsticks */
    x.fillStyle = '#d8b23c'
    x.beginPath(); x.ellipse(cx - 186, cy + 52, 12, 7.5, 0, 0, Math.PI*2); x.fill()
    x.fillStyle = 'rgba(255,240,180,.35)'
    x.beginPath(); x.ellipse(cx - 188, cy + 50, 5, 2.6, 0, 0, Math.PI*2); x.fill()
    x.strokeStyle = '#1d1512'; x.lineWidth = 5; x.lineCap = 'round'
    x.beginPath(); x.moveTo(cx - 84, cy + 66); x.lineTo(cx + 74, cy + 52); x.stroke()
    x.beginPath(); x.moveTo(cx - 78, cy + 73); x.lineTo(cx + 80, cy + 59); x.stroke()
  },

  /* ---------------- wagashi ---------------- */
  wagashi(x, w, h){
    this._table(x, w, h, 0.12)
    const cx = w/2, cy = h*0.6
    /* a dark lacquer tray, as sweets are presented */
    x.fillStyle = '#15110f'
    x.beginPath(); x.roundRect ? x.roundRect(cx - 200, cy - 60, 400, 120, 8) : x.rect(cx - 200, cy - 60, 400, 120)
    x.fill()
    x.strokeStyle = 'rgba(201,169,97,.32)'; x.lineWidth = 2
    x.strokeRect(cx - 192, cy - 52, 384, 104)
    /* sakura mochi: pink dumpling, pale filling showing, wrapped in leaf */
    const items = [
      { ox: -132, kind: 'mochi' },
      { ox: -44,  kind: 'yokan' },
      { ox: 44,   kind: 'daifuku' },
      { ox: 132,  kind: 'mochi' }
    ]
    items.forEach((it, i) => {
      const px = cx + it.ox, py = cy - 4 + (i % 2 ? 8 : -6)
      /* bamboo leaf under each */
      x.fillStyle = '#3f5c33'
      x.save(); x.translate(px, py + 18); x.rotate(-0.2 + i * 0.1)
      x.beginPath(); x.ellipse(0, 0, 34, 11, 0, 0, Math.PI*2); x.fill()
      x.strokeStyle = 'rgba(255,255,255,.12)'; x.lineWidth = 1
      x.beginPath(); x.moveTo(-32, 0); x.lineTo(32, 0); x.stroke()
      x.restore()

      if (it.kind === 'mochi'){
        x.fillStyle = '#eec3c8'
        x.beginPath(); x.ellipse(px, py, 25, 20, 0, 0, Math.PI*2); x.fill()
        x.fillStyle = 'rgba(255,255,255,.3)'
        x.beginPath(); x.ellipse(px - 7, py - 7, 10, 7, -0.3, 0, Math.PI*2); x.fill()
        /* red bean showing at the seam */
        x.fillStyle = '#6b4230'
        x.beginPath(); x.ellipse(px + 12, py + 12, 8, 5, 0.3, 0, Math.PI*2); x.fill()
      } else if (it.kind === 'yokan'){
        /* a slice of rolled jelly: pale, translucent, one pink end */
        x.fillStyle = '#e6dcc4'
        x.beginPath(); x.roundRect ? x.roundRect(px - 30, py - 14, 60, 28, 6) : x.rect(px - 30, py - 14, 60, 28)
        x.fill()
        x.fillStyle = 'rgba(255,255,255,.22)'
        x.fillRect(px - 26, py - 10, 52, 6)
        x.fillStyle = '#d9a0a8'
        x.beginPath(); x.ellipse(px + 22, py, 8, 14, 0, 0, Math.PI*2); x.fill()
        x.strokeStyle = 'rgba(0,0,0,.12)'; x.lineWidth = 1
        x.strokeRect(px - 30, py - 14, 60, 28)
      } else {
        /* daifuku: white mochi dusted with starch, a kinako dusting */
        x.fillStyle = '#f4f0e6'
        x.beginPath(); x.ellipse(px, py, 24, 21, 0, 0, Math.PI*2); x.fill()
        x.fillStyle = 'rgba(198,164,110,.4)'
        for (let k = 0; k < 30; k++){
          const a = k * 0.79
          x.beginPath()
          x.arc(px + Math.cos(a)*22, py + Math.sin(a)*19, 1.5, 0, Math.PI*2); x.fill()
        }
      }
    })
    /* a small ceramic cup of hojicha, as it is always served alongside */
    this._bowl(x, cx - 226, cy + 40, 30, 12, '#cfc7b6', '#6b4423')
  },

  /* ---------------- matcha ---------------- */
  matcha(x, w, h){
    this._table(x, w, h, 0.12)
    const cx = w/2, cy = h*0.6
    /* tatami suggestion under a low table */
    x.fillStyle = '#1c1a16'
    x.fillRect(cx - 210, cy - 30, 420, 110)
    /* the chawan: a heavy black bowl */
    this._bowl(x, cx, cy + 6, 92, 34, '#15120f', '#15120f')
    x.fillStyle = '#3f6b2e'
    x.beginPath(); x.ellipse(cx, cy + 3, 74, 25, 0, 0, Math.PI*2); x.fill()
    /* whisked foam, brightest at the centre */
    x.fillStyle = '#a8c46a'
    x.beginPath(); x.ellipse(cx - 4, cy, 44, 14, 0, 0, Math.PI*2); x.fill()
    x.fillStyle = '#c9dc92'
    x.beginPath(); x.ellipse(cx - 12, cy - 2, 22, 8, -0.2, 0, Math.PI*2); x.fill()
    /* bubbles */
    x.strokeStyle = 'rgba(240,250,210,.45)'; x.lineWidth = 1
    for (let i = 0; i < 12; i++){
      const a = i * 0.55
      x.beginPath()
      x.arc(cx + Math.cos(a)*44, cy + Math.sin(a)*14, 2 + (i%3), 0, Math.PI*2); x.stroke()
    }
    /* chasen, resting across the rim */
    x.strokeStyle = '#c8ab74'; x.lineWidth = 2.2
    x.save(); x.translate(cx + 58, cy + 16); x.rotate(-0.5)
    x.fillStyle = '#b9985f'; x.fillRect(-6, 0, 12, 34)
    for (let i = 0; i < 10; i++){
      x.beginPath(); x.moveTo(-6, 4 + i*3); x.lineTo(-16, 16 + i*1.8); x.stroke()
      x.beginPath(); x.moveTo(6, 4 + i*3); x.lineTo(16, 16 + i*1.8); x.stroke()
    }
    x.restore()
    /* a wagashi sweet beside it, as it is always served with matcha */
    x.fillStyle = '#e9c7cb'
    x.beginPath(); x.ellipse(cx - 168, cy + 18, 26, 12, -0.1, 0, Math.PI*2); x.fill()
    x.fillStyle = '#f4ded0'
    x.beginPath(); x.ellipse(cx - 168, cy + 14, 18, 7, -0.1, 0, Math.PI*2); x.fill()
    this._steam(x, cx, cy - 30, 2, 0.22)
  },

  /* ---------------- sake ---------------- */
  sake(x, w, h){
    this._table(x, w, h, 0.15)
    const cx = w/2, cy = h*0.58
    /* tokkuri, the fluted pouring bottle */
    const bx = cx - 96, by = cy + 14
    x.fillStyle = '#cfc6b4'
    x.beginPath()
    x.moveTo(bx - 26, by - 60)
    x.bezierCurveTo(bx - 44, by - 40, bx - 40, by - 6, bx - 26, by)
    x.lineTo(bx + 26, by)
    x.bezierCurveTo(bx + 40, by - 6, bx + 44, by - 40, bx + 26, by - 60)
    x.closePath(); x.fill()
    /* flutes */
    x.strokeStyle = 'rgba(120,110,92,.4)'; x.lineWidth = 1.4
    for (let i = -2; i <= 2; i++){
      x.beginPath(); x.moveTo(bx + i*11, by - 58); x.quadraticCurveTo(bx + i*15, by - 26, bx + i*12, by - 2); x.stroke()
    }
    /* neck and lip, wrapped in cord */
    x.fillStyle = '#d8cfbc'; x.fillRect(bx - 13, by - 78, 26, 20)
    x.fillStyle = '#8c1f24'; x.fillRect(bx - 15, by - 74, 30, 9)
    /* a paper label, as bottles carry */
    x.fillStyle = '#efe6d2'
    x.fillRect(bx - 17, by - 44, 34, 24)
    x.strokeStyle = 'rgba(80,60,40,.5)'; x.lineWidth = 1
    for (let i = 0; i < 3; i++){
      x.beginPath(); x.moveTo(bx - 12, by - 38 + i*7); x.lineTo(bx + 12, by - 38 + i*7); x.stroke()
    }
    x.fillStyle = 'rgba(255,255,255,.3)'
    x.beginPath(); x.ellipse(bx - 12, by - 30, 8, 22, 0.2, 0, Math.PI*2); x.fill()

    /* two ochoko, one filled */
    ;[[-20, 1], [26, 0]].forEach(o => {
      const ox = cx + 84 + o[0], oy = cy + 30
      x.fillStyle = '#e8e3d6'
      x.beginPath()
      x.moveTo(ox - 17, oy - 13); x.lineTo(ox + 17, oy - 13)
      x.lineTo(ox + 13, oy + 4); x.lineTo(ox - 13, oy + 4)
      x.closePath(); x.fill()
      x.fillStyle = 'rgba(0,0,0,.1)'
      x.beginPath(); x.ellipse(ox, oy - 13, 17, 4.5, 0, 0, Math.PI*2); x.fill()
      if (o[1]){
        x.fillStyle = '#e6dcc0'
        x.beginPath(); x.ellipse(ox, oy - 12, 13, 3.4, 0, 0, Math.PI*2); x.fill()
        x.fillStyle = '#f0e8d0'
        x.beginPath(); x.ellipse(ox - 3, oy - 12.5, 6, 1.6, 0, 0, Math.PI*2); x.fill()
      }
      /* the foot of the cup */
      x.fillStyle = '#d4cdbd'
      x.fillRect(ox - 6, oy + 4, 12, 4)
    })

    /* a folded oshibori on the tray */
    x.fillStyle = '#e6e8e4'
    x.fillRect(cx - 250, cy + 12, 86, 26)
    x.fillStyle = '#d4d8d2'
    x.fillRect(cx - 250, cy + 12, 86, 5)
    x.strokeStyle = 'rgba(120,130,120,.35)'; x.lineWidth = 1
    x.beginPath(); x.moveTo(cx - 244, cy + 20); x.lineTo(cx - 180, cy + 20); x.stroke()
    x.beginPath(); x.moveTo(cx - 244, cy + 29); x.lineTo(cx - 180, cy + 29); x.stroke()
    /* a hinoki cup, for contrast */
    x.fillStyle = '#d9c39a'
    x.beginPath(); x.ellipse(cx + 214, cy + 24, 22, 9, 0, 0, Math.PI*2); x.fill()
  }
}

function drawDishArt(cv, d){
  const w = cv.width = 720, h = cv.height = 360
  const x = cv.getContext('2d')
  const art = DISH_ART[d.id]
  if (art){
    art.call(DISH_ART, x, w, h)
  } else {
    DISH_ART._table(x, w, h, 0.14)
  }
  DISH_ART._label(x, w, h, d.n, d.ja || '', d.cat)
}

function loadDishImage(d){
  const img = $('dish-img')
  const loading = $('dish-loading')
  const credit = $('dish-credit')
  const frame = $('dish-frame')
  img.classList.remove('in'); img.removeAttribute('src')
  credit.hidden = true; credit.innerHTML = ''
  frame.classList.toggle('plain', !d.image)
  if (!d.image){
    loading.textContent = 'No licensed photograph of this dish — showing the table instead.'
    loading.classList.remove('gone')
    return
  }
  loading.textContent = 'Loading experience…'
  loading.classList.remove('gone')
  img.onload = () => { img.classList.add('in'); loading.classList.add('gone') }
  img.onerror = () => {
    img.classList.remove('in'); img.removeAttribute('src')
    loading.textContent = 'Some details are unavailable right now.'
  }
  img.alt = d.n
  img.src = d.image
  if (d.imageLicence){
    credit.hidden = false
    credit.innerHTML = 'Photograph: ' + (d.imageCredit || 'Wikimedia Commons') + ' · ' + d.imageLicence
  }
}

function showDish(i){
  const d = DISHES[i]
  markFood(d.id, d.n)
  $('dish-cat').textContent = d.cat
  $('dish-name').textContent = d.n
  $('dish-ja').textContent = d.ja || ''
  $('dish-serve').textContent = d.serve
  $('dish-ask').textContent = d.ask
  $('dish-where').textContent = d.where
  $('dish-etq').textContent = d.etq
    drawDishArt($('dish-fallback'), d)
    loadDishImage(d)
    /* gallery out-link where the registry holds one for this dish */
    try {
      const gal = (MEDIA[d.id] || {}).gallery
      const credit = $('dish-credit')
      if (gal && gal.url && !credit.hidden){
        credit.innerHTML += ' · <a href="' + gal.url + '" target="_blank" rel="noopener">more photos ↗</a>'
      }
    } catch (e){}
  $('dish-links').innerHTML = ''
  const add = document.createElement('button')
  add.textContent = 'Add ' + d.n.toLowerCase() + ' to my Tokyo →'
  add.addEventListener('click', () => addToItinerary(d.n + ' tasting'))
  $('dish-links').appendChild(add)
  const at = document.createElement('button')
  at.textContent = 'Show on the map →'
  at.addEventListener('click', () => { initMap(); $('atlas').scrollIntoView({ behavior: 'smooth' }) })
  $('dish-links').appendChild(at)
  /* food -> person: the chef for this dish, using the existing NPC system */
  const chefBtn = document.createElement('button')
  chefBtn.id = 'dish-chef'
  chefBtn.className = 'btn ghost'
  chefBtn.textContent = 'Meet the chef →'
  chefBtn.setAttribute('aria-label', 'Speak with the chef about ' + d.n)
  chefBtn.addEventListener('click', () => {
    const chef = PEOPLE.find(p => p.id === CHEF_ID)
    meetTheChef(d.id)
    /* bring the chef into reach so the turn-toward is visible, then speak */
    if (chef && chef.mesh) chef.mesh.userData.turned = performance.now() / 1000
  })
  $('dish-links').appendChild(chefBtn)
  document.querySelectorAll('#dish-rail button').forEach(b => {
    const on = b.dataset.dish === d.id
    b.classList.toggle('on', on)
    b.setAttribute('aria-selected', String(on))
  })
}
let toastTimer = null
function toast(msg, dur=3400){
  const t = $('toast')
  t.textContent = msg
  t.classList.add('on')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.remove('on'), dur)
}

const DISC_STORE = 'yoru-discovery'
let disc = { people:{}, places:{}, food:{}, moments:[], passport:{}, things:{} }
try { disc = Object.assign(disc, JSON.parse(localStorage.getItem(DISC_STORE) || '{}')) } catch (e) {}

function saveDisc(){ try { localStorage.setItem(DISC_STORE, JSON.stringify(disc)) } catch (e) {} }

const WARDS = ['Shinjuku','Shibuya','Ginza','Asakusa','Akihabara','Harajuku','Shimokitazawa','Roppongi','Kagurazaka']

function renderPassport(){
  const grid = $('pass-grid')
  if (!grid) return
  grid.innerHTML = ''
  WARDS.forEach(w => {
    const got = !!disc.passport[w]
    const d = document.createElement('div')
    d.className = 'pass-cell' + (got ? ' got' : '')
    d.innerHTML = '<div class="pass-stamp">' + (got ? '\u2713' : '\u00b7') + '</div>' +
                  '<div class="pass-n">' + w + '</div>' +
                  '<div class="pass-c">' + (got ? 'Discovered' : 'Not yet') + '</div>'
    grid.appendChild(d)
  })
}

function renderTally(){
  $('t-people').textContent  = String(Object.keys(disc.people).length).padStart(2,'0')
  $('t-places').textContent  = String(Object.keys(disc.places).length).padStart(2,'0')
  $('t-food').textContent    = String(Object.keys(disc.food).length).padStart(2,'0')
  $('t-moments').textContent = String(disc.moments.length).padStart(2,'0')
  renderPassport()
}

/* small objects you can identify — torii, cat, vending machine, sign, train */
function markDiscovery(kind){
  if (disc.things[kind]) return
  disc.things[kind] = true
  saveDisc()
}

function markPeople(id, name, role){
  if (disc.people[id]) return
  disc.people[id] = { name, role }
  saveDisc(); renderTally()
  toast('Met ' + name + ' \u2014 ' + role)
}

function markPlace(id, name){
  if (disc.places[id]) return
  disc.places[id] = name
  saveDisc(); renderTally()
  toast('Discovered ' + name)
  const l = LOCATIONS.find(x => x.id === id)
  if (l){
    const w = l.ward.split(',')[0].trim()
    if (WARDS.indexOf(w) > -1 && !disc.passport[w]){ disc.passport[w] = true; saveDisc() }
  }
}

function markFood(id, n){
  if (disc.food[id]) return
  disc.food[id] = n
  saveDisc(); renderTally()
  toast('Learned about ' + n)
}


buildDishRail()

/* -------------------- 3D location markers in city ------------------ */

const CITY_MARKS = [
  { loc:'jiro', x:3.4, z:-30 },
  { loc:'nonbei', x:-3.6, z:-44 },
  { loc:'omoide', x:3.2, z:-58 },
  { loc:'menchi', x:-3.4, z:-76 },
  { loc:'narisawa', x:3.5, z:-80 },
  { loc:'birdland', x:-3.2, z:-88 },
  { loc:'ippodo', x:3.0, z:-92 },
  { loc:'kagari', x:-3.6, z:-98 }
]

CITY_MARKS.forEach(m => {
  const l = LOCATIONS.find(x => x.id === m.loc)
  if (!l) return
  const pin = new THREE.Group()
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 1.1, 6),
    new THREE.MeshBasicMaterial({ color: 0xc9a961, transparent: true, opacity: 0.5 })
  )
  stem.position.y = 0.55
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xc9a961 })
  )
  head.position.y = 1.14
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.16, 0.2, 20),
    new THREE.MeshBasicMaterial({ color: 0xc9a961, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
  )
  halo.rotation.x = -Math.PI / 2
  halo.position.y = 0.02
  pin.add(stem, head, halo)
  pin.position.set(m.x, 0, m.z)
  pin.userData = { type: 'locpin', id: l.id, halo, head }
  city.add(pin)
  m.pin = pin
})

const locPins = CITY_MARKS.map(m => m.pin)
const locPinById = {}
locPins.forEach(p => { locPinById[p.userData.id] = p })

/* each pin belongs to the stretch of journey it actually stands on */
CITY_MARKS.forEach(m => { TOUR_NAV[m.loc] = pForZ(m.z) })

/* --------------------- raycast picking (stable) -------------------- */

const ndc = new THREE.Vector2(0, 0)
const pickables = [...locPins, ...PEOPLE.map(p => p.mesh)]
const pickMeshes = []
pickables.forEach(root => { root.traverse(o => { if (o.isMesh) pickMeshes.push(o) }) })

let hovered = null
function pickAt(cx, cy){
  ndc.x = (cx / innerWidth) * 2 - 1
  ndc.y = -(cy / innerHeight) * 2 + 1
  raycaster.setFromCamera(ndc, camera)
  const hits = raycaster.intersectObjects(pickMeshes, false)
  return hits.length ? hits[0].object : null
}

window.addEventListener('pointermove', e => {
  if (state.mode !== 'tour' || $('dialogue').classList.contains('on') || $('location').classList.contains('on') || $('discovery').classList.contains('on')) return
  const hit = pickAt(e.clientX, e.clientY)
  let root = null
  if (hit){ root = hit; while (root && !root.userData.type) root = root.parent }
  if (root !== hovered){
    if (hovered && hovered.userData.type === 'locpin'){
      hovered.userData.halo.material.opacity = 0.22
      hovered.userData.halo.scale.setScalar(1)
    }
    hovered = root
    const type = hovered && hovered.userData.type
    if (type === 'locpin'){
      hovered.userData.halo.material.opacity = 0.6
      setCursor('wide', 'OPEN')
    } else if (type === 'person'){
      setCursor('wide', 'SPEAK')
    } else if (type === 'cat'){
      setCursor('wide', 'PET')
    } else if (type === 'vending'){
      setCursor('wide', 'BUY')
    } else if (type === 'sign'){
      setCursor('wide', 'READ')
    } else if (type === 'train'){
      setCursor('wide', 'LOOK')
    } else if (type === 'claw'){
      setCursor('wide', 'PLAY')
    } else if (type === 'konbini'){
      setCursor('wide', 'KONBINI')
    } else if (type === 'shrine'){
      setCursor('wide', "WHAT'S THIS?")
    } else {
      setCursor('default')
    }
  }
})

/* neon signage translations (§41) — only words the city already displays */
const SIGN_JA = {
  'RAMEN':'ラーメン', 'IZAKAYA':'居酒屋', 'BAR':'バー', 'KARAOKE':'カラオケ',
  'GAME':'ゲーム', '咖啡':'喫茶', 'SAKE':'酒', 'ラーメン':'ラーメン',
  'CLUB':'クラブ', 'DINER':'ダイナー', 'TAXI':'タクシー', 'HOTEL':'ホテル',
  'PUB':'パブ', '喫茶':'喫茶', 'NIGHT':'ナイト', '24H':'24時間'
}
const SIGN_EN = {
  'RAMEN':'ramen', 'IZAKAYA':'a standing bar with small plates', 'BAR':'a bar',
  'KARAOKE':'karaoke — private singing rooms', 'GAME':'an arcade', '咖啡':'a coffee bar',
  'SAKE':'sake', 'ラーメン':'ramen', 'CLUB':'a club', 'DINER':'a Western diner',
  'TAXI':'taxi stand', 'HOTEL':'hotel', 'PUB':'a pub', '喫茶':'a coffee shop',
  'NIGHT':'nightlife', '24H':'open twenty-four hours'
}

window.addEventListener('pointerdown', e => {
  if (state.mode !== 'tour') return
  if ($('dialogue').classList.contains('on') || $('location').classList.contains('on') || $('discovery').classList.contains('on')) return
  const hit = pickAt(e.clientX, e.clientY)
  if (!hit) return
  let root = hit
  while (root && !root.userData.type) root = root.parent
  if (!root) return
  const type = root.userData.type
  const ref = root.userData.ref || root

  if (type === 'locpin'){ showLocation(root.userData.id); return }
  if (type === 'person'){ openDialogue(root.userData.id); return }
  if (type === 'shrine'){ showShrineDiscovery(root.userData.shrine); return }

  if (type === 'konbini'){
    showMoment('KONBINI', 'KONBINI', '24 hours, always lit.')
    return
  }
  if (type === 'cat'){
    /* the cat looks at you, then walks off (§41) */
    if (!cat.userData.running){
      cat.userData.running = true
      cat.userData.dir = camera.position.x > cat.position.x ? 1 : -1
      cat.userData.speed = 1.5
      setTimeout(() => toast('The cat considered you, then thought better of it.'), 900)
    }
    return
  }
  if (type === 'vending'){
    /* lights come up, then the panel explains what you are looking at */
    ref.userData.secret = true
    ref.userData.clicks = (ref.userData.clicks || 0) + 1
    showMoment('VENDING', 'JIHANKI', 'Something cold. Take the change with you.')
    return
  }
  if (type === 'sign'){
    /* neon translation (§41) */
    const txt = root.userData.text
    const ja = SIGN_JA[txt]
    const en = SIGN_EN[txt]
    if (ja) showMoment('SIGN', txt, en + ' — ' + ja)
    else toast('Too much glare to read from here.')
    return
  }
  if (type === 'train'){
    train.userData.doorT = 1.6
    showMoment('TRAIN', 'RAIL LINE', 'The elevated line runs through here every few minutes. Nobody on this platform is waiting for it.')
    return
  }
  if (type === 'claw'){
    claw.userData.dropT = 1.4
    toast('The claw descends. It has never once grabbed the right thing.')
    return
  }
})

/* ===================== the street itself ========================== *
 * Without a road, a kerb and markings the buildings read as boxes floating
 * in a void. This lays an actual Japanese street: asphalt, a dashed centre
 * line, edge lines, raised kerbs, gutters, manhole covers, and the utility
 * poles with their overhead wires that narrow Tokyo streets are known for.
 * Repeated elements are instanced.
 * ================================================================= */
const STREET = { zTop: 10, zBot: -180, half: 5.0, walk: 1.6 }
let roadMat = null

function buildStreet(){
  const len = STREET.zTop - STREET.zBot
  const midZ = (STREET.zTop + STREET.zBot) / 2

  /* asphalt */
  roadMat = new THREE.MeshBasicMaterial({ color: 0x0e0f12 })
  const road = new THREE.Mesh(new THREE.PlaneGeometry(STREET.half * 2, len), roadMat)
  road.rotation.x = -Math.PI / 2
  road.position.set(0, 0, midZ)
  city.add(road)

  /* pavements, slightly raised */
  const walkMat = new THREE.MeshBasicMaterial({ color: 0x1a1b1f })
  for (const side of [-1, 1]){
    const w = new THREE.Mesh(new THREE.PlaneGeometry(STREET.walk, len), walkMat)
    w.rotation.x = -Math.PI / 2
    w.position.set(side * (STREET.half + STREET.walk / 2), 0.02, midZ)
    city.add(w)
    /* kerb face */
    const kerb = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.16, len),
      new THREE.MeshBasicMaterial({ color: 0x24262a })
    )
    kerb.position.set(side * (STREET.half + 0.07), 0.06, midZ)
    city.add(kerb)
  }

  /* markings, instanced: dashed centre line and solid edge lines */
  const dashGeo = new THREE.PlaneGeometry(0.12, 1.5)
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xb9b3a4, transparent: true, opacity: 0.5 })
  const dashCount = Math.floor(len / 4)
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount)
  const dummy = new THREE.Object3D()
  let di = 0
  for (let z = STREET.zTop - 2; z > STREET.zBot && di < dashCount; z -= 4){
    dummy.position.set(0, 0.012, z)
    dummy.rotation.set(-Math.PI / 2, 0, 0)
    dummy.updateMatrix()
    dashes.setMatrixAt(di++, dummy.matrix)
  }
  dashes.count = di
  dashes.instanceMatrix.needsUpdate = true
  city.add(dashes)

  const edgeGeo = new THREE.PlaneGeometry(0.1, len)
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0x9c968a, transparent: true, opacity: 0.32 })
  for (const side of [-1, 1]){
    const e = new THREE.Mesh(edgeGeo, edgeMat)
    e.rotation.x = -Math.PI / 2
    e.position.set(side * (STREET.half - 0.35), 0.011, midZ)
    city.add(e)
  }

  /* manhole covers, instanced */
  const mhGeo = new THREE.CircleGeometry(0.32, 12)
  const mhMat = new THREE.MeshBasicMaterial({ color: 0x1c1e22 })
  const mhCount = 14
  const manholes = new THREE.InstancedMesh(mhGeo, mhMat, mhCount)
  for (let i = 0; i < mhCount; i++){
    dummy.position.set((Math.random() - 0.5) * STREET.half * 1.5, 0.013, STREET.zTop - i * (len / mhCount))
    dummy.rotation.set(-Math.PI / 2, 0, Math.random() * 3)
    dummy.updateMatrix()
    manholes.setMatrixAt(i, dummy.matrix)
  }
  manholes.instanceMatrix.needsUpdate = true
  city.add(manholes)

  /* utility poles and overhead wires — the signature of a Tokyo side street */
  const poleMat = new THREE.MeshBasicMaterial({ color: 0x2b2a27 })
  const armMat = new THREE.MeshBasicMaterial({ color: 0x33322e })
  const poleGeo = new THREE.CylinderGeometry(0.075, 0.095, 8.4, 7)
  const armGeo = new THREE.BoxGeometry(1.5, 0.07, 0.07)
  const poleStep = 11
  const poleCount = Math.floor(len / poleStep) * 2
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, poleCount)
  const arms = new THREE.InstancedMesh(armGeo, armMat, poleCount * 2)
  let pi = 0
  for (let z = STREET.zTop - 4; z > STREET.zBot && pi < poleCount; z -= poleStep){
    for (const side of [-1, 1]){
      if (pi >= poleCount) break
      const x = side * (STREET.half + STREET.walk - 0.28)
      dummy.position.set(x, 4.2, z)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      poles.setMatrixAt(pi, dummy.matrix)
      for (let a = 0; a < 2; a++){
        dummy.position.set(x, 7.2 - a * 0.55, z)
        dummy.rotation.set(0, Math.PI / 2, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        arms.setMatrixAt(pi * 2 + a, dummy.matrix)
      }
      pi++
    }
  }
  poles.count = pi; poles.instanceMatrix.needsUpdate = true
  arms.count = pi * 2; arms.instanceMatrix.needsUpdate = true
  city.add(poles); city.add(arms)

  /* the wires themselves: thin sagging spans between consecutive poles */
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x14151a })
  const wireGeo = new THREE.BoxGeometry(0.022, 0.022, 1)
  const spans = Math.max(1, Math.floor((STREET.zTop - STREET.zBot) / poleStep))
  for (const side of [-1, 1]){
    const x = side * (STREET.half + STREET.walk - 0.28)
    for (let s = 0; s < spans; s++){
      const z1 = STREET.zTop - 4 - s * poleStep
      const z2 = z1 - poleStep
      for (let a = 0; a < 3; a++){
        const y = 7.2 - a * 0.55
        const w = new THREE.Mesh(wireGeo, wireMat)
        w.position.set(x + (a - 1) * 0.34, y - 0.06, (z1 + z2) / 2)
        w.scale.z = Math.abs(z1 - z2) * 1.02
        city.add(w)
      }
    }
  }
}
buildStreet()

/* Japanese street kit: tactile paving along both kerbs, manholes down
   the carriageway, storm drains at the gutter line — cheap, permanent,
   instantly "Japan". */
{
  const tactileMat = new THREE.MeshBasicMaterial({ color: 0x6b5f26 })
  for (const sx of [-4.9, 4.9]){
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 250), tactileMat)
    t.position.set(sx, 0.022, -90)
    city.add(t)
  }
  const drainMat = new THREE.MeshBasicMaterial({ color: 0x0c1016 })
  for (const sx of [-8.7, 8.7]){
    const dd = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 250), drainMat)
    dd.position.set(sx, 0.018, -90)
    city.add(dd)
  }
  const manGeo = new THREE.CircleGeometry(0.55, 18)
  const manMat = new THREE.MeshBasicMaterial({ color: 0x11141c })
  const mans = new THREE.InstancedMesh(manGeo, manMat, 26)
  const dummyM = new THREE.Object3D()
  for (let i = 0; i < 26; i++){
    dummyM.position.set((Math.random() - 0.5) * 10, 0.02, 6 - i * 9.4 - Math.random() * 4)
    dummyM.rotation.set(-Math.PI/2, 0, 0)
    dummyM.updateMatrix()
    mans.setMatrixAt(i, dummyM.matrix)
  }
  mans.instanceMatrix.needsUpdate = true
  city.add(mans)
}

/* storefront awnings + rooftop clutter, district-tinted, instanced */
{
  const awnGeo = new THREE.BoxGeometry(1.2, 0.1, 3.2)
  const awnMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const awnings = new THREE.InstancedMesh(awnGeo, awnMat, 90)
  const awnCol = (z) => {
    const d = districtAtZ(z)
    return d === 'asakusa' ? 0x6e2f24 : d === 'tsukiji' ? 0x245552 : d === 'ginza' ? 0x8a8478
      : d === 'shibuya' ? 0x8a2f52 : d === 'akihabara' ? 0x245a9a : d === 'nakameguro' ? 0x2f4a2f
      : d === 'harajuku' ? 0x9a4f78 : 0x2a2f3a
  }
  const dummyA = new THREE.Object3D()
  let ai = 0
  const colTmp = new THREE.Color()
  for (let z = 4; z > -148 && ai < 88; z -= 4.2){
    for (const side of [-1, 1]){
      if (Math.random() < 0.45 || ai >= 88) continue
      const env = DIST_ENV[districtAtZ(z)] || DIST_ENV.shinjuku
      dummyA.position.set(side * (env.xBase - 0.2), 2.35, z + (Math.random() - 0.5) * 2)
      dummyA.rotation.set(0, 0, 0)
      dummyA.updateMatrix()
      awnings.setMatrixAt(ai, dummyA.matrix)
      awnings.setColorAt(ai, colTmp.setHex(awnCol(z)))
      ai++
    }
  }
  awnings.count = ai
  awnings.instanceMatrix.needsUpdate = true
  if (awnings.instanceColor) awnings.instanceColor.needsUpdate = true
  city.add(awnings)

  const roofGeo = new THREE.BoxGeometry(1.4, 0.7, 1.4)
  const roofMat = new THREE.MeshBasicMaterial({ color: 0x1a1d24 })
  const roofs = new THREE.InstancedMesh(roofGeo, roofMat, 60)
  let ri = 0
  for (let z = 4; z > -148 && ri < 58; z -= 6){
    for (const side of [-1, 1]){
      if (Math.random() < 0.5 || ri >= 58) continue
      const env = DIST_ENV[districtAtZ(z)] || DIST_ENV.shinjuku
      const h = env.hMin + (env.hMax - env.hMin) * (0.35 + Math.random() * 0.6)
      dummyA.position.set(side * (env.xBase + 2 + Math.random() * 2), h + 0.35, z)
      dummyA.rotation.set(0, 0, 0)
      dummyA.updateMatrix()
      roofs.setMatrixAt(ri++, dummyA.matrix)
    }
  }
  roofs.count = ri
  roofs.instanceMatrix.needsUpdate = true
  city.add(roofs)

  /* ground-floor storefront band: district colour wrapping every block */
  const bandGeo = new THREE.BoxGeometry(0.5, 2.6, 4.2)
  const bandMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const bands = new THREE.InstancedMesh(bandGeo, bandMat, 90)
  let gi = 0
  const bandCol = (z) => {
    const d = districtAtZ(z)
    return d === 'asakusa' ? 0x8c3a2e : d === 'tsukiji' ? 0x2f6f6a : d === 'ginza' ? 0x9a948a
      : d === 'shibuya' ? 0xb03a68 : d === 'akihabara' ? 0x2f7fd4 : d === 'nakameguro' ? 0x4a6a4a
      : d === 'harajuku' ? 0xc96a9a : d === 'roppongi' ? 0x3a3f4a : 0x333a44
  }
  for (let z = 4; z > -148 && gi < 88; z -= 4.2){
    for (const side of [-1, 1]){
      if (Math.random() < 0.35 || gi >= 88) continue
      const env = DIST_ENV[districtAtZ(z)] || DIST_ENV.shinjuku
      dummyA.position.set(side * (env.xBase + 0.2), 1.3, z + (Math.random() - 0.5) * 2)
      dummyA.rotation.set(0, 0, 0)
      dummyA.scale.set(1, 1, 1)
      dummyA.updateMatrix()
      bands.setMatrixAt(gi, dummyA.matrix)
      bands.setColorAt(gi, colTmp.setHex(bandCol(z)))
      gi++
    }
  }
  bands.count = gi
  bands.instanceMatrix.needsUpdate = true
  if (bands.instanceColor) bands.instanceColor.needsUpdate = true
  city.add(bands)
}

/* air-conditioning units and balconies on the facades, instanced: the
   clutter that actually reads as a Japanese building rather than a box */
function buildFacadeDetail(){
  const acGeo = new THREE.BoxGeometry(0.42, 0.3, 0.34)
  const acMat = new THREE.MeshBasicMaterial({ color: 0x3a3b3e })
  const acCap = new THREE.InstancedMesh(acGeo, acMat, 260)
  const dummy2 = new THREE.Object3D()
  let ai = 0
  for (let z = 6; z > -148 && ai < 258; z -= 3.4){
    for (const side of [-1, 1]){
      if (Math.random() < 0.35) continue
      const x = side * (7.6 + Math.random() * 1.6)
      const y = 2.4 + Math.random() * 11
      if (ai >= 258) break
      dummy2.position.set(x, y, z)
      dummy2.rotation.set(0, 0, 0)
      dummy2.updateMatrix()
      acCap.setMatrixAt(ai++, dummy2.matrix)
    }
  }
  acCap.count = ai; acCap.instanceMatrix.needsUpdate = true
  city.add(acCap)

  /* narrow balconies on the residential stretch */
  const balGeo = new THREE.BoxGeometry(0.5, 0.06, 2.1)
  const balMat = new THREE.MeshBasicMaterial({ color: 0x2a2b2e })
  const bals = new THREE.InstancedMesh(balGeo, balMat, 90)
  let bi = 0
  for (let z = -12; z > -140 && bi < 88; z -= 6.5){
    for (const side of [-1, 1]){
      if (Math.random() < 0.45 || bi >= 88) continue
      const y = 3.4 + Math.random() * 7
      dummy2.position.set(side * 7.2, y, z)
      dummy2.rotation.set(0, 0, 0)
      dummy2.updateMatrix()
      bals.setMatrixAt(bi++, dummy2.matrix)
    }
  }
  bals.count = bi; bals.instanceMatrix.needsUpdate = true
  city.add(bals)
}
buildFacadeDetail()

/* --------------------------- shrine / torii --------------------------- *
 * A small Inari shrine marker on a side street. Vermilion gate, a stone
 * lantern either side and a modest shrine box behind. These stand on
 * neighbourhood boundaries all across Tokyo, which is why one belongs on
 * an ordinary back street rather than only at a famous temple.
 * -------------------------------------------------------------------- */
const SHRINES = [
  {
    id: 'torii', x: 4.6, z: -70.5, rot: -0.22,
    cat: "What's this?",
    title: 'Torii gate',
    sub: 'Shrine marker · Shibuya back street',
    context: 'You have walked past a vermilion gate standing in the middle of an ordinary residential street. This is a shrine marker — a torii — and there are hundreds of them across Tokyo, usually tucked onto streets that have no reason to be photographed.',
    culture: 'A torii marks the boundary between the everyday and the sacred: everything behind it belongs to the shrine. The vermilion is iron oxide, the same pigment used on shrine buildings for centuries. Small gates like this usually belong to an Inari shrine, and Inari is the deity of rice, business and prosperity — which is why the gates are so ordinary and so widespread.',
    etiquette: 'Do not walk through the centre of the gate; step aside and let anyone coming out pass first. A short bow at the gate is customary and needs no words. Offerings at a street shrine are usually a can of drink left on the stone ledge, and you take the empty cans away with you. Do not photograph worshippers up close.',
    nearby: 'meiji',
    nearbyWhy: 'Meiji Jingu stands about a kilometre north of this street.'
  }
]

function buildShrines(){
  const vermilion = new THREE.MeshBasicMaterial({ color: 0xa8341f })
  const stone = new THREE.MeshBasicMaterial({ color: 0x2a2724 })
  const roofMat = new THREE.MeshBasicMaterial({ color: 0x1d1a17 })
  const shrineMat = new THREE.MeshBasicMaterial({ color: 0x33291f })
  const group = new THREE.Group()

  /* two uprights and a kasagi, with the curved shimaki above it */
  const pierL = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 2.5, 8), vermilion)
  pierL.position.set(-0.85, 1.25, 0)
  const pierR = pierL.clone(); pierR.position.x = 0.85
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.09, 0.12), vermilion)
  nuki.position.set(0, 1.72, 0)
  const shimaki = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.075, 0.18), vermilion)
  shimaki.position.set(0, 2.44, 0)
  const kasagi = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.09, 0.22), vermilion)
  kasagi.position.set(0, 2.57, 0)
  const gakuzuka = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.1), vermilion)
  gakuzuka.position.set(0, 2.1, 0)
  group.add(pierL, pierR, nuki, shimaki, kasagi, gakuzuka)

  /* stone lantern either side of the approach */
  const lantern = () => {
    const g = new THREE.Group()
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.16, 6), stone)
    base.position.y = 0.08
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.42, 6), stone)
    shaft.position.y = 0.37
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.2, 0.19), stone)
    box.position.y = 0.68
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.14, 6), stone)
    roof.position.y = 0.85
    const bud = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), stone)
    bud.position.y = 0.94
    g.add(base, shaft, box, roof, bud)
    return g
  }
  const lanternL = lantern(); lanternL.position.set(-1.5, 0, 0.3)
  const lanternR = lantern(); lanternR.position.set(1.5, 0, 0.3)

  /* the small shrine box behind the gate */
  const box = new THREE.Group()
  const platform = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 1.15), stone)
  platform.position.y = 0.09
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.78, 0.86), shrineMat)
  body.position.y = 0.57
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 1.1), roofMat)
  roof.position.y = 1.0
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.07, 1.14), roofMat)
  ridge.position.y = 1.08
  box.add(platform, body, roof, ridge)

  /* offering ledge with a small can, as found on real street shrines */
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.16), stone)
  ledge.position.set(0.34, 0.34, 0.46)
  const can = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8),
    new THREE.MeshBasicMaterial({ color: 0x8f9aa2 })
  )
  can.position.set(0.34, 0.42, 0.46)
  box.add(ledge, can)

  /* generous invisible click volume */
  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 3.0, 2.4),
    new THREE.MeshBasicMaterial({ visible: false })
  )
  hit.position.y = 1.4
  hit.userData = { type: 'shrine', shrine: SHRINES[0].id }

  group.add(box, lanternL, lanternR, hit)
  group.position.set(SHRINES[0].x, 0, SHRINES[0].z)
  group.rotation.y = SHRINES[0].rot
  SHRINES[0].group = group
  city.add(group)
}
buildShrines()

/* the discovery is editorial and only states things that are actually true of
   street shrines in Tokyo; the nearby real place is taken from verified data */
const shrineHits = []
city.traverse(o => { if (o.userData && o.userData.type === 'shrine') shrineHits.push(o) })

function showShrineDiscovery(id){
  const s = SHRINES.find(x => x.id === id) || SHRINES[0]
  const near = LOCATIONS.find(l => l.id === s.nearby)
  $('disc-cat').textContent = s.cat
  $('disc-title').textContent = s.title
  $('disc-sub').textContent = s.sub
  $('disc-context').textContent = s.context
  $('disc-culture').textContent = s.culture
  $('disc-etiquette').textContent = s.etiquette
  $('disc-nearby').textContent = near ? near.name + ' — ' + s.nearbyWhy : '—'
  const off = $('disc-official')
  if (near && near.officialWebsite){ off.href = near.officialWebsite; off.hidden = false }
  else off.hidden = true
  $('disc-add').onclick = () => { addToItinerary(s.title + ' — ' + s.sub.split('· ').pop()); closeDiscovery() }
  $('disc-atlas').onclick = () => { if (near){ closeDiscovery(); openAtlasOn(near) } }
  $('discovery').classList.add('on')
  document.body.classList.add('locked')
  markDiscovery('shrine')
}
  function closeDiscovery(){
    $('discovery').classList.remove('on')
    document.body.classList.remove('locked')
  }
  $('disc-close').addEventListener('click', closeDiscovery)

  /* Small observations: WHAT IS THIS for the street-level discoveries.
     This also defines showMoment, which sign and train clicks already
     called — without it those clicks threw. Short, useful, verified. */
  const DISCOVERY_INFO = {
    SIGN: { cat:'Street reading',
      sub:'Neon, read properly.',
      context:'Vertical signs are read top to bottom, right to left. A single kanji does the work of a sentence: 酒 is sake, 喫茶 is a coffee shop, 24時間 means it never closes.',
      culture:'After dark the sign is the storefront. Shops spend more on the tube work than the interior, because the street decides in three seconds.',
      etiquette:'Photographs are welcome from the street. Step inside only if you mean to stay.',
      nearby:'' },
    TRAIN: { cat:'Rail line',
      sub:'The city runs on this.',
      context:'The elevated tracks carry the Yamanote and Chuo lines — the loop and the artery. Trains run every few minutes from around five in the morning until just past midnight.',
      culture:'Tokyo is a rail city first and a road city second. Districts are spaced by stations, and last-train time quietly sets the length of every evening.',
      etiquette:'Queue at the floor marks, let people off first, and keep the car silent: no calls, headphones on, backpacks off your back.',
      nearby:'' },
    VENDING: { cat:'Street object',
      sub:'Jihanki — the vending machine.',
      context:'Japan keeps over four million vending machines: hot coffee in winter, cold tea in summer, umbrellas and batteries in between. They run all night, unguarded, everywhere.',
      culture:'The machine works because the street is trusted. It is infrastructure the way a lamppost is — nobody thinks about it until it is gone.',
      etiquette:'Drink beside the machine and drop the can in its own recycling bin. The bin belongs to that machine; carry your rubbish otherwise.',
      nearby:'' },
    KONBINI: { cat:'Convenience store',
      sub:'The konbini: Japan\'s all-night living room.',
      context:'Konbini (7-Eleven, FamilyMart, Lawson) are open 24 hours, sell hot food and ATMs, collect parcels and print tickets. They follow families from late trains home.',
      culture:'At night their warm glow is the visual landmark of every side street. Onsen-style lit windows, a delivery van, a bicycle rack — the konbini is a district in one storefront.',
      etiquette:'You may eat standing inside at high tables; do not eat on the floor. Most accept IC cards. Rubbish goes in the bins by the entrance.',
      nearby:'' }
  }
  function showMoment(kind, title, body){
    const info = DISCOVERY_INFO[kind] || {}
    $('disc-cat').textContent = info.cat || 'Noticed'
    $('disc-title').textContent = title
    $('disc-sub').textContent = info.sub || body || ''
    $('disc-context').textContent = info.context || body || ''
    $('disc-culture').textContent = info.culture || ''
    $('disc-etiquette').textContent = info.etiquette || ''
    $('disc-nearby').textContent = info.nearby || ''
    const off = $('disc-official')
    if (off) off.hidden = true
    $('disc-add').onclick = () => { addToItinerary(title); closeDiscovery() }
    $('disc-atlas').onclick = () => { closeDiscovery() }
    $('discovery').classList.add('on')
    document.body.classList.add('locked')
    try { markDiscovery(kind.toLowerCase()) } catch (e){}
  }

/* ---------------------------- atmosphere --------------------------- */

const atmosphere = createAtmosphere({
  scene, camera, city, rain, rainGeo, rainMat, rainCount,
  gradePass, IS_TOUCH, REDUCED,
  get intensity(){ return state.rainLevel || 1 }
})
/* food follows the journey: reorder the rail when the district changes */
atmosphere.onChange(() => { try { refreshDishDistrict() } catch (e){} try { updateAudio() } catch (e){} })

/* District asset dressing: when the district changes, the storefront
   signs re-skin to that district's vocabulary. The geometry is pooled;
   only the textures are re-baked. */
let dressedDistrict = null
atmosphere.onChange((time, weather, district) => {
  dressDistrict(district, time, weather)
})
function dressDistrict(districtId, time, weather){
  if (districtId === dressedDistrict) return
  dressedDistrict = districtId
  const d = districtForTour(districtId) || DISTRICTS.shinjuku
  const world = resolveWorld(d.id, time || atmosphere.state.time, weather || atmosphere.state.weather)
  if (d.signs && d.signs.length){
    signs.forEach((m, i) => {
      const def = d.signs[i % d.signs.length]
      const old = m.material.map
      const oldR = m.userData.refl ? m.userData.refl.material.map : null
      const tex = neonTexture(def[0], def[1], 256, 72)
      m.material.map = tex
      m.material.needsUpdate = true
      m.userData.text = def[0]
      if (old) old.dispose()
      if (m.userData.refl){
        m.userData.refl.material.map = tex
        m.userData.refl.material.needsUpdate = true
        if (oldR) oldR.dispose()
      }
    })
  }
  dressEnvironment(world)
}

/* The resolved world now drives vehicles + large props, not just text.
   Shibuya gets buses and crossing screens; Tsukiji gets delivery
   trucks; Asakusa lights its lanterns and pockets the screens. */
function dressEnvironment(world){
  const props = (world && world.props) || []
  signs.forEach(m => { if (m.userData.isScreen) m.visible = props.indexOf('screens') > -1 })
  lanterns.forEach(l => { l.visible = props.indexOf('lanterns') > -1 })
  arcadeCab.visible = props.indexOf('screens') > -1 || props.indexOf('gacha') > -1
  /* Traffic: the district decides which vehicles are on the road. Geometry is
     never swapped — a taxi that turns into a bus would lose its whole
     silhouette — so each vehicle keeps its own body and is shown or hidden. */
  const allowed = ['taxi','kei','hatchback','minivan','van','bus','truck','bicycle']
  const list = (world.vehicles || []).filter(v => allowed.indexOf(v) > -1)
  const kinds = list.length ? list : ['taxi']
  cars.forEach((c, i) => {
    const u = c.userData
    const k = kinds[i % kinds.length]
    /* a bicycle belongs on the kerb, not the carriageway */
    c.visible = u.kind === k
    const wantX = (u.dir > 0 ? LANE.out : LANE.in) + (k === 'bicycle' ? -u.dir * 4.2 : 0)
    u.laneX = wantX
  })
}

/* --- atmosphere control: two independent axes ---------------------------
   Time of day and weather are chosen separately, so Day+Rain and
   Night+Rain are genuinely different places rather than one tinted filter. */
const atmosPanel = $('atmos-panel')
const atmosToggle = $('atmos-toggle')
const atmosNow = $('atmos-now')
const atmosFoot = $('atmos-foot')
const atmosTimes = $('atmos-times')
const atmosWeathers = $('atmos-weathers')
const atmosAuto = $('atmos-auto')

function atmosSync(){
  const a = atmosphere.state
  atmosNow.textContent = atmosphere.label()
  atmosTimes.querySelectorAll('button').forEach(o => o.classList.toggle('on', o.dataset.t === a.time))
  atmosWeathers.querySelectorAll('button').forEach(o => o.classList.toggle('on', o.dataset.w === a.weather))
}

atmosToggle.addEventListener('click', () => {
  const open = atmosPanel.hasAttribute('hidden')
  if (open) atmosPanel.removeAttribute('hidden')
  else atmosPanel.setAttribute('hidden', '')
  atmosToggle.setAttribute('aria-expanded', String(open))
})

atmosTimes.querySelectorAll('button').forEach(b => {
  b.addEventListener('click', () => atmosphere.set({ time: b.dataset.t }))
})
  atmosWeathers.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => atmosphere.set({ weather: b.dataset.w }))
  })

  /* rainfall intensity: light / medium / heavy scales the falling rain */
  const atmosRainfall = $('atmos-rainfall')
  if (atmosRainfall) atmosRainfall.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      state.rainLevel = parseFloat(b.dataset.r) || 1
      atmosRainfall.querySelectorAll('button').forEach(o => o.classList.toggle('on', o === b))
    })
  })
  const fwBtn = $('atmos-fireworks')
  const fwLevels = $('atmos-fw-levels')
  if (fwBtn) fwBtn.addEventListener('click', () => {
    state.fireworks = !state.fireworks
    fwBtn.classList.toggle('on', state.fireworks)
    if (fwLevels) fwLevels.hidden = !state.fireworks
    if (state.fireworks){
      toast(state.fwLevel === 'high'
        ? 'Fireworks over the bay — the whole crowd will stop and look up'
        : 'Fireworks over the bay — look up')
    }
  })
  if (fwLevels) fwLevels.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      state.fwLevel = b.dataset.fw
      fwLevels.querySelectorAll('button').forEach(o => o.classList.toggle('on', o === b))
    })
  })

const AUTO_COPY = {
  off: 'You choose the time of day and the weather.',
  m5:  'Atmosphere moves every 5 minutes. Manual returns whenever you want.',
  m15: 'Atmosphere moves every 15 minutes.',
  m30: 'Atmosphere moves every 30 minutes.',
  m60: 'Atmosphere moves hourly.'
}

atmosAuto.querySelectorAll('button').forEach(b => {
  b.addEventListener('click', () => {
    atmosAuto.querySelectorAll('button').forEach(o => o.classList.remove('on'))
    b.classList.add('on')
    atmosphere.autoSet(b.dataset.t)
    atmosFoot.textContent = AUTO_COPY[b.dataset.t] || AUTO_COPY.off
    atmosSync()
  })
})

atmosphere.onChange(atmosSync)
atmosphere.set({ time: 'night', weather: 'rain' }, true)
atmosSync()

/* the district you are standing in changes how the same weather reads */
function atmosDistrict(districtName){
  if (!districtName) return
  const key = districtName.toLowerCase().replace(/[^a-z]/g, '')
  const match = atmosphere.districts().find(d => key.startsWith(d) || d.startsWith(key))
  atmosphere.set({ district: match || 'shinjuku' })
}

function fmtClock(mins){
  const h = Math.floor(mins / 60) % 24
  const m = Math.floor(mins % 60)
  return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0')
}

function districtNow(){
  let cur = TOUR[0]
  TOUR.forEach(c => { if (state.p >= c.at - 0.001) cur = c })
  return cur.district
}

/* ------------------------ discovery + journal --------------------- */

function fillList(el, rows, empty){
  if (!el) return
  if (!rows.length){ el.innerHTML = '<li><div class="jr-empty">' + empty + '</div></li>'; return }
  el.innerHTML = rows.map((r, i) =>
    '<li><span class="n mono">' + String(i+1).padStart(2,'0') + '</span>' +
    '<span><span class="t">' + r[0] + '</span><span class="m">' + r[1] + '</span></span></li>'
  ).join('')
}

function renderJournal(){
  fillList($('jr-place-list'),
    Object.keys(disc.places).map(k => [disc.places[k], 'Place discovered']),
    'No places yet. Follow the light.')
  fillList($('jr-people-list'),
    Object.keys(disc.people).map(k => [disc.people[k].name, disc.people[k].role]),
    'No one met yet. Scroll — people are standing in the street.')
  fillList($('jr-food-list'),
    Object.keys(disc.food).map(k => [disc.food[k], 'Dish learned']),
    'No dishes yet. Open Provisions.')
  const mg = $('jr-moment-grid')
  if (mg){
    mg.innerHTML = disc.moments.length
      ? '<div class="pass-grid">' + disc.moments.map(m =>
          '<div class="pass-cell got"><div class="pass-stamp">\u2726</div><div class="pass-n">' + m.title +
          '</div><div class="pass-c">' + m.sub + '</div></div>').join('') + '</div>'
      : '<div class="jr-empty">No moments saved yet.</div>'
  }
  renderPassport()
}

$('jr-tabs').querySelectorAll('button').forEach(b => {
  b.addEventListener('click', () => {
    $('jr-tabs').querySelectorAll('button').forEach(o => o.classList.remove('on'))
    b.classList.add('on')
    document.querySelectorAll('.jr-panel').forEach(p => p.classList.remove('on'))
    const panel = $('jr-' + b.dataset.t)
    if (panel) panel.classList.add('on')
    renderJournal()
  })
})

/* --------------------------- Tokyo Moments ------------------------ */

const MOMENTS = [
  { at:0.08, t:'Some cities are beautiful because nobody is trying to make them beautiful.' },
  { at:0.22, t:'A place becomes famous long after it stops being good.' },
  { at:0.36, t:'Everyone photographs the crossing. Almost nobody looks at what is behind it.' },
  { at:0.52, t:'Six seats, no sign, and a chef who has worked the same hours for thirty years.' },
  { at:0.68, t:'Tokyo rebuilds itself every few years and still keeps the same six alleys.' },
  { at:0.86, t:'Snow makes the city briefly, accidentally European.' },
  { at:0.95, t:'The last train is not the end of the night. For a few people, it is the start.' }
]
const momentSeen = {}

function checkMoment(p){
  MOMENTS.forEach(m => {
    if (momentSeen[m.at]) return
    if (p >= m.at && p < m.at + 0.05){
      momentSeen[m.at] = true
      $('moment-time').textContent = fmtClock(state.clock)
      $('moment-text').textContent = m.t
      $('moment').classList.add('on')
      setTimeout(() => $('moment').classList.remove('on'), 6200)
    }
  })
}

/* --------------------------- save moment -------------------------- */

let pendingMoment = null
function openMoment(title, sub, line){
  pendingMoment = { title, sub, line }
  $('pc-title').textContent = title
  $('pc-sub').textContent = sub
  $('pc-line').textContent = line
  $('postcard').classList.add('on')
}
$('pc-close').addEventListener('click', () => $('postcard').classList.remove('on'))
$('pc-keep').addEventListener('click', () => {
  if (!pendingMoment) return
  disc.moments.push({ title: pendingMoment.title, sub: pendingMoment.sub })
  saveDisc(); renderTally(); renderJournal()
  $('postcard').classList.remove('on')
  toast('Moment saved to My Tokyo')
})

/* ------------------------------ intro ----------------------------- */

function enterTokyo(){
  const intro = $('intro')
  intro.classList.add('gone')
  intro.style.pointerEvents = 'none'
  document.body.classList.remove('locked')
  setTimeout(() => { intro.classList.add('done') }, 950)
  $('hero').classList.add('ready')
  $('atmos').classList.add('on')
  $('tally').classList.add('on')
  renderTally(); renderJournal()
  setTimeout(() => toast('Scroll to begin \u2014 or choose an atmosphere'), 1200)
}
$('enter-tokyo').addEventListener('click', enterTokyo)

document.body.classList.add('locked')
const heroEl = $('hero')
heroEl.classList.remove('ready')

/* ------------------------------ toast ----------------------------- */


/* ------------------------------ sound ----------------------------- */

let soundOn = false, audioCtx = null, masterGain = null, rainGain = null, cityGain = null, humFilter = null, bayGain = null, bayFilter = null
function initAudio(){
  if (audioCtx) return
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return
  audioCtx = new AC()
  masterGain = audioCtx.createGain()
  masterGain.gain.value = 0
  masterGain.connect(audioCtx.destination)

  const len = audioCtx.sampleRate * 2
  const mk = fill => {
    const b = audioCtx.createBuffer(1, len, audioCtx.sampleRate)
    const d = b.getChannelData(0)
    let last = 0
    for (let i=0;i<len;i++){ const w = Math.random()*2-1; last = (last + 0.02*w)/1.02; d[i] = fill ? last*3 : w }
    return b
  }

  const rain = audioCtx.createBufferSource()
  rain.buffer = mk(false); rain.loop = true
  const rf = audioCtx.createBiquadFilter()
  rf.type = 'bandpass'; rf.frequency.value = 760; rf.Q.value = 0.5
  const rg = audioCtx.createGain(); rg.gain.value = 0.055
  rain.connect(rf); rf.connect(rg); rg.connect(masterGain)
  rain.start()
  rainGain = rg

  const hum = audioCtx.createBufferSource()
  hum.buffer = mk(true); hum.loop = true
  const hf = audioCtx.createBiquadFilter()
  hf.type = 'lowpass'; hf.frequency.value = 170
  const hg = audioCtx.createGain(); hg.gain.value = 0.11
  hum.connect(hf); hf.connect(hg); hg.connect(masterGain)
  hum.start()
  cityGain = hg
  humFilter = hf

  const sub = audioCtx.createOscillator()
  sub.type = 'sine'; sub.frequency.value = 47
  const sg = audioCtx.createGain(); sg.gain.value = 0.018
  sub.connect(sg); sg.connect(masterGain)
  sub.start()

  /* the bay bed: slow-moving filtered noise. Water, wind and open air —
     only heard once the journey reaches Odaiba. */
  const bay = audioCtx.createBufferSource()
  bay.buffer = mk(true); bay.loop = true
  const bf = audioCtx.createBiquadFilter()
  bf.type = 'bandpass'; bf.frequency.value = 320; bf.Q.value = 0.4
  const bg = audioCtx.createGain(); bg.gain.value = 0
  bay.connect(bf); bf.connect(bg); bg.connect(masterGain)
  bay.start()
  bayGain = bg
  bayFilter = bf

  updateAudio()
}
/* Layered ambience: CITY + DISTRICT (crowd) + WEATHER (rain) + TIME.
   Rain hisses only when it rains; the city hum follows pedestrian
   density (which carries the district) and lifts slightly at night. */
function updateAudio(){
  if (!audioCtx || !rainGain || !cityGain) return
  const cur = atmosphere.state.cur
  const t = audioCtx.currentTime
  rainGain.gain.setTargetAtTime(0.055 * cur.rain, t, 0.8)
  const nightK = cur.light < 0.62 ? 1.12 : 0.92
  cityGain.gain.setTargetAtTime(0.11 * (0.45 + cur.pedDensity * 0.35) * nightK, t, 0.8)
  /* each district sounds like itself: temple streets muffled, markets
     bright, neon districts buzzier — and Odaiba opens out into water
     and wind instead of street */
  if (humFilter){
    const dk = (atmosphere.state.district || '').toLowerCase()
    const target = /odaiba/.test(dk) ? 90 : /asakusa/.test(dk) ? 120 : /tsukiji/.test(dk) ? 230
      : /akihabara/.test(dk) ? 260 : /shibuya/.test(dk) ? 200 : /nakameguro/.test(dk) ? 140 : 170
    humFilter.frequency.setTargetAtTime(target, t, 1.2)
  }
  /* the bay bed: water and wind, only audible once you have arrived */
  if (bayGain && bayFilter){
    const dk = (atmosphere.state.district || '').toLowerCase()
    const near = /odaiba/.test(dk) ? 1 : 0
    bayGain.gain.setTargetAtTime(0.055 * near * (1 + cur.rain * 1.2), t, 1.6)
    bayFilter.frequency.setTargetAtTime(320 + cur.rain * 700, t, 1.4)
  }
}
function blip(){
  if (!audioCtx || !soundOn) return
  const o = audioCtx.createOscillator(), g = audioCtx.createGain()
  o.type = 'sine'; o.frequency.value = 620
  g.gain.setValueAtTime(0.06, audioCtx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.12)
  o.connect(g); g.connect(masterGain)
  o.start(); o.stop(audioCtx.currentTime + 0.13)
}
function drip(){
  if (!audioCtx || !soundOn) return
  const o = audioCtx.createOscillator(), g = audioCtx.createGain()
  o.type = 'sine'
  o.frequency.setValueAtTime(900, audioCtx.currentTime)
  o.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.2)
  g.gain.setValueAtTime(0.08, audioCtx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25)
  o.connect(g); g.connect(masterGain)
  o.start(); o.stop(audioCtx.currentTime + 0.26)
}
/* a train passing: filtered noise swell plus a low rail rumble, so an
   arrival is audible before it is visible */
function railSound(level, dur){
  if (!audioCtx || !soundOn) return
  const t0 = audioCtx.currentTime
  const len = Math.floor(audioCtx.sampleRate * dur)
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++){
    const env = Math.sin(Math.PI * (i / len))
    const w = Math.random() * 2 - 1
    last = (last + 0.06 * w) / 1.06
    d[i] = last * 3.2 * env
  }
  const src = audioCtx.createBufferSource()
  src.buffer = buf
  const bp = audioCtx.createBiquadFilter()
  bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6
  const g = audioCtx.createGain()
  g.gain.value = 0.075 * level
  src.connect(bp); bp.connect(g); g.connect(masterGain)
  src.start(t0)
  /* the low rumble under it */
  const o = audioCtx.createOscillator(), og = audioCtx.createGain()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(46, t0)
  o.frequency.linearRampToValueAtTime(30, t0 + dur)
  og.gain.setValueAtTime(0.0001, t0)
  og.gain.linearRampToValueAtTime(0.035 * level, t0 + dur * 0.3)
  og.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(og); og.connect(masterGain)
  o.start(t0); o.stop(t0 + dur + 0.05)
}
function chime(){
  if (!audioCtx || !soundOn) return
  ;[880, 659].forEach((f, i) => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain()
    o.type = 'sine'; o.frequency.value = f
    const t0 = audioCtx.currentTime + i * 0.18
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5)
    o.connect(g); g.connect(masterGain)
    o.start(t0); o.stop(t0 + 0.55)
  })
}
$('sound-toggle').addEventListener('click', () => {
  initAudio()
  if (!audioCtx) return
  soundOn = !soundOn
  if (audioCtx.state === 'suspended') audioCtx.resume()
  masterGain.gain.linearRampToValueAtTime(soundOn ? 0.45 : 0, audioCtx.currentTime + 0.7)
  $('sound-toggle').textContent = soundOn ? 'SOUND ON' : 'SOUND OFF'
})

/* ------------------------------- nav ------------------------------ */

$('begin').addEventListener('click', startJourney)
$('explore').addEventListener('click', startJourney)
function startJourney(){
  state.mode = 'tour'
  $('hero').classList.add('gone')
  setTimeout(() => $('hero').classList.add('hidden'), 1200)
  window.scrollTo({ top: chaptersEl.offsetTop + 10, behavior: 'smooth' })
  setTimeout(() => toast('Scroll to move through the city'), 900)
}
function dismissHero(){
  if (state.mode === 'tour') return
  state.mode = 'tour'
  $('hero').classList.add('gone')
  setTimeout(() => $('hero').classList.add('hidden'), 1200)
}

$('nav-journey').addEventListener('click', () => window.scrollTo({ top: chaptersEl.offsetTop, behavior: 'smooth' }))
$('nav-atlas').addEventListener('click', () => { initMap(); $('atlas').scrollIntoView({ behavior:'smooth' }) })
$('nav-mine').addEventListener('click', () => $('itinerary').scrollIntoView({ behavior:'smooth' }))
/* SAVE MOMENT: keep a cinematic frame. Render and read back in the same
   task so the drawing buffer is valid without preserveDrawingBuffer. */
$('nav-moment').addEventListener('click', () => {
  composer.render()
  let url = ''
  try { url = renderer.domElement.toDataURL('image/png') } catch (e){ toast('This frame could not be saved'); return }
  if (!url || url.length < 1000){ toast('This frame could not be saved'); return }
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const a = document.createElement('a')
  a.href = url
  a.download = 'liminal-tokyo-' + stamp + '.png'
  document.body.appendChild(a)
  a.click()
  a.remove()
  chime()
  toast('Moment saved')
  try {
    disc.moments.push({ t: Date.now(), label: atmosphere.label() + ' · ' + districtNow(), district: districtNow() })
    renderTally(); renderJournal()
  } catch (e){}
})
$('design').addEventListener('click', () => $('concierge').scrollIntoView({ behavior:'smooth' }))
$('close-design').addEventListener('click', () => $('concierge').scrollIntoView({ behavior:'smooth' }))
$('close-concierge').addEventListener('click', () => $('concierge').scrollIntoView({ behavior:'smooth' }))

window.addEventListener('scroll', () => {
  const y = scrollY
  if (y > 40) dismissHero()
  if (!$('intro').classList.contains('done')) return
  const tourTop = chaptersEl.offsetTop
  const tourSpan = chaptersEl.offsetHeight - innerHeight
  const inTour = y >= tourTop - innerHeight * 0.5 && y <= tourTop + tourSpan + innerHeight * 0.4
  const p = clamp((y - tourTop) / tourSpan, 0, 1)

  if (inTour){
    state.p = p
    state.mode = 'tour'
    $('cue').style.opacity = p > 0.02 ? '0' : '1'
    $('rail').classList.add('on')
    $('readout-district').classList.add('on')
    $('rail-fill').style.height = (p * 100) + '%'
    const hh = String(Math.floor(state.clock / 60) % 24).padStart(2,'0')
    const mm = String(Math.floor(state.clock % 60)).padStart(2,'0')
    $('district-time').textContent = fmtClock(state.clock) + ' JST'
    let cur = TOUR[0]
    TOUR.forEach(c => { if (p >= c.at - 0.001) cur = c })
    const dn = $('district-name')
    if (dn.textContent !== cur.district) dn.textContent = cur.district
    /* the district you are in changes how this weather reads */
    if (cur.district !== lastDistrict){ lastDistrict = cur.district; atmosDistrict(cur.district) }
    /* §9: only the active chapter is dominant; the rest recede so text
       blocks never stack visually over one another */
    try {
      const ci = TOUR.indexOf(cur)
      const kids = chaptersEl.children
      for (let k = 0; k < kids.length; k++) kids[k].classList.toggle('dim', k !== ci)
    } catch (e){}
    checkMoment(p)
    CITY_MARKS.forEach(m => {
      if (m.passed) return
      const at = TOUR_NAV[m.loc]
      if (at !== undefined && p >= at - 0.02) m.passed = true
    })
    PEOPLE.forEach(q => {
      const inRange = q.mesh ? q.mesh.position.distanceTo(camera.position) < 24 : false
      const show = p > q.from && p < q.to && inRange
      q.chip.classList.toggle('show', show)
      if (q.mesh) q.mesh.userData.near = show
    })
  } else {
    $('cue').style.opacity = '0'
    $('rail').classList.remove('on')
    $('readout-district').classList.remove('on')
    PEOPLE.forEach(q => q.chip.classList.remove('show'))
  }
  $('nav').classList.toggle('solid', y > innerHeight * 0.7)
}, { passive: true })

/* ------------------------------- loop ----------------------------- */

const trafficLight = (() => {
  const g = new THREE.Group()
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 5, 8), new THREE.MeshBasicMaterial({ color: 0x23201c }))
  pole.position.y = 2.5
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.44, 1.14, 0.3), new THREE.MeshBasicMaterial({ color: 0x14120f }))
  box.position.y = 5
  g.add(pole, box)
  const geo = new THREE.CircleGeometry(0.105, 12)
  const r = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x8c3a2e }))
  r.position.set(0, 5.32, 0.16)
  const yl = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x4a3f22 }))
  yl.position.set(0, 5.0, 0.16)
  const gr = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x243a2c }))
  gr.position.set(0, 4.68, 0.16)
  g.add(r, yl, gr)
  g.position.set(-7.9, 0, -45)
  city.add(g)
  return { r, y: yl, g: gr }
})()

/* Umbrellas now ship with the character (src/characters.js): every person
   has one, ribbed and coloured, hidden until it actually rains. */
function people_umbrellas(){}

/* The single place the camera is driven each frame. Reduced motion swaps the
   travel function here and nowhere else, so there is no second animation path
   that could bypass the preference. */
function applyCamera(){
  if (state.mode !== 'tour') return
  if (REDUCED) camAtStatic(state.p)
  else camAt(state.p)
  camera.position.copy(camPos)
  camera.lookAt(camLook)
}

let miniRedraw = 0
let bMatR = 1, bMatG = 0.9, bMatB = 0.78
let lastFrame = performance.now()

/* The whole per-frame simulation, factored out so it can be driven
   two ways: by rAF in the live page, and synchronously by the
   still-capture path, which cannot rely on headless rAF. */
function updateWorld(dt, t, doRender = true){
  state.frames++
  tGlobal = t

  state.clock += dt / 6
  if (state.clock >= 24 * 60) state.clock -= 24 * 60

  atmosphere.update(dt, t)

  applyCamera()

  gradePass.uniforms.time.value = t

  /* city life — atmosphere module owns sky, fog, rain, stars, snow, petals */
  /* one signal system drives the lane, the crossing head and the people */
  state.trafficT += dt
  updateSignals(dt)
  trafficLight.r.material.color.setHex(state.light === 'red' ? 0xc04a3c : 0x3d1a16)
  trafficLight.y.material.color.setHex(state.light === 'yellow' ? 0xd8b04a : 0x453a1e)
  trafficLight.g.material.color.setHex(state.light === 'green' ? 0x4a8a63 : 0x1e3226)

  const atm = atmosphere.state.cur
  const timeIsNight = atm.light < 0.62
  /* the bay answers the weather: it lifts and darkens in rain, and takes
     the promenade lighting as a reflection once it is night */
  if (bayWater){
    const chop = 0.5 + clamp(atm.wet, 0, 1) * 1.8
    bayWater.position.y = -0.6 + Math.sin(t * 0.7) * 0.10 * chop
    bayWater.rotation.z = Math.sin(t * 0.31) * 0.004 * chop
    const night = timeIsNight ? 1 : 0
    const rainK = clamp(atm.rain, 0, 1)
    const snowK = clamp(atm.snow, 0, 1)
    bayWaterMat.color.setRGB(
      0.04 + night * 0.03 + rainK * 0.02,
      0.08 + night * 0.04 + rainK * 0.02,
      0.12 + night * 0.07 + rainK * 0.03 + snowK * 0.05)
  }

  /* --- the train event ----------------------------------------------------
     The consist moves, decelerates into the platform, opens its doors,
     departs and wraps. Audio and the door glow follow the same state. */
  const railInfo = updateTrain(train, dt, {
    trackX: trackway.trackX,
    onSound: (kind) => {
      if (!soundOn || !audioCtx) return
      if (kind === 'approach') railSound(0.5, 3.2)
      else if (kind === 'arrive'){ railSound(0.9, 1.1); chime() }
      else if (kind === 'depart') railSound(0.8, 2.0)
      else if (kind === 'away') railSound(0.35, 2.4)
    }
  })
  /* interior lights read through the windows; dim them by day */
  const railWinK = timeIsNight ? 1 : 0.42
  if (railMats.window) railMats.window.color.setRGB(railWinK, railWinK * 0.85, railWinK * 0.62)
  if (railMats.doorGlass) railMats.doorGlass.color.setRGB(railWinK, railWinK * 0.81, railWinK * 0.56)
  /* headlights at night and in rain; tail lamps always when moving away */
  if (railMats.headlight){
    const hk = timeIsNight ? 1 : (atm.rain > 0.2 ? 0.8 : 0.4)
    railMats.headlight.color.setRGB(hk, hk * 0.96, hk * 0.85)
  }
  if (railMats.taillight){
    const tk = railInfo.phase === 'depart' || railInfo.phase === 'away' ? 1 : 0.5
    railMats.taillight.color.setRGB(tk, tk * 0.16, tk * 0.13)
  }
  /* the platform door glow lights when the doors are actually open */
  doorGlow.material.opacity = lerp(doorGlow.material.opacity, railInfo.doorsOpen ? 0.55 : 0, 0.12)
  /* the railway signal clears while a train is approaching or dwelling */
  if (railSignal.userData.lenses){
    const clear = railInfo.phase === 'approach' || railInfo.phase === 'dwell'
    const L = railSignal.userData.lenses
    for (const k of ['red','green'])
      L[k].material.color.copy(clear ? (k === 'green' ? L[k].userData.base : L[k].userData.off)
                                     : (k === 'red' ? L[k].userData.base : L[k].userData.off))
  }
  /* waiting people turn to watch it arrive, then step forward */
  platformPeople.forEach((p, i) => {
    const u = p.userData
    const near = clamp(1 - Math.abs(train.position.z - p.position.z) / 26, 0, 1)
    if (u.waiting){
      u.turn = lerp(u.turn || 0, near * 0.5, 0.05)
      p.rotation.y = -Math.PI / 2 + (u.turn || 0)
      if (railInfo.doorsOpen){
        /* step toward the doors while they are open */
        p.position.x = lerp(p.position.x, -9.4, 0.02)
      } else if (railInfo.phase === 'away'){
        p.position.x = lerp(p.position.x, -10.4 + (i % 3) * 0.6, 0.01)
      }
    }
  })
  trainHit.position.set(trackway.trackX, 2.6, train.position.z)
  cars.forEach(c => {
    if (!c.visible) return
    const u = c.userData
    const laneX = u.laneX === undefined ? (u.dir > 0 ? LANE.out : LANE.in) : u.laneX
    /* vehicles stop at the stop line on red and amber, and queue behind
       whatever is already stopped rather than driving through it */
    const stopped = state.light === 'red'
    const slowFor = state.light === 'yellow' ? 0.35 : 1
    let nz = c.position.z + u.dir * u.speed * 0.55 * atm.traffic * slowFor * dt
    if (stopped){
      /* the stop line for the direction of travel: -44 for traffic heading
         up the street, -56 for traffic heading down. A vehicle exactly on
         the line is held, so the test is inclusive. */
      const stopZ = u.dir < 0 ? -44 : -56
      if (u.dir < 0 && c.position.z >= stopZ && nz <= stopZ) nz = stopZ
      if (u.dir > 0 && c.position.z <= stopZ && nz >= stopZ) nz = stopZ
    }
    if (nz < -124) nz = 12
    if (nz > 12) nz = -124
    const moved = Math.abs(nz - c.position.z)
    c.position.z = nz
    /* ease toward the kerb lane; bicycles use their own offset */
    c.position.x = lerp(c.position.x, laneX, 0.04)
    /* face the direction of travel */
    const wantRot = u.dir > 0 ? 0 : Math.PI
    c.rotation.y = lerp(c.rotation.y, wantRot, 0.05)
    /* wheels roll at the speed the vehicle actually moved */
    if (u.wheels && u.wheels.length){
      const spin = moved / Math.max(0.2, u.wheelR)
      for (const w of u.wheels) w.rotation.z -= spin
    }
    /* headlights brighter at night and in rain, dimmer by day */
    if (u.headMat){
      const k = timeIsNight ? 0.95 + clamp(atm.wet, 0, 1) * 0.4 : 0.5
      u.headMat.color.copy(u.headMat.userData.base || u.headMat.color).multiplyScalar(k)
    }
    if (u.tailMat){
      /* brake lights come on while stopped at a red */
      const k = stopped ? 1.15 : (timeIsNight ? 0.7 : 0.35)
      u.tailMat.color.copy(u.tailMat.userData.base || u.tailMat.color).multiplyScalar(k)
    }
    /* weather surface response: rain darkens and glosses the body */
    dressVehicleForWeather(c, atm)
  })

  peds.forEach(p => {
    const u = p.userData
    const rig = u.rig
    /* traffic-light synchronisation: at a red light vehicles are stopped,
       so pedestrians cross freely; on green they wait at the kerb */
    const atCrossing = u.zone.x && Math.abs(p.position.z + 50) < 12
    const lightGate = atCrossing ? (state.light === 'red' ? 1 : 0.18) : 1
    const pace = lightGate * atm.pedDensity
    /* firework reaction: the crowd stops and looks up */
    const fw = state.fireworks && (state.rainLevel || 1) > 0.7
    const target = fw ? 0 : u.speed * 0.5 * pace
    u.speedNow = lerp(u.speedNow === undefined ? target : u.speedNow, target, 0.08)
    p.position.x += u.dir * u.speedNow * dt
    if (p.position.x > u.zone.x[1]) { p.position.x = u.zone.x[1]; u.dir = -1 }
    if (p.position.x < u.zone.x[0]) { p.position.x = u.zone.x[0]; u.dir = 1 }
    p.rotation.y = u.dir > 0 ? Math.PI / 2 : -Math.PI / 2

    /* walking cycle, or looking up at the fireworks */
    if (fw){
      p.rotation.y = lerp(p.rotation.y, 0, 0.06)
      p.rotation.x = lerp(p.rotation.x, -0.42, 0.06)
      if (rig && rig.breath) rig.breath.material.opacity = 0
    } else {
      p.rotation.x = lerp(p.rotation.x, 0, 0.1)
      if (!REDUCED) animateCharacter(p, t + u.bob, u.speedNow / Math.max(0.2, u.speed))
    }

    /* weather response: umbrellas in rain, breath and coats in snow,
       lighter cloth in spring */
    if (rig){
      rig.umbrella.visible = atm.rain > 0.08
      rig.umbrella.rotation.z = Math.sin(t * 1.4 + u.bob) * 0.03
      rig.breath.visible = atm.snow > 0.08
      if (rig.breath.visible){
        /* breath pulses on a slow cycle, drifting up and forward */
        const cyc = (t * 0.5 + u.bob) % 1
        rig.breath.scale.setScalar(0.5 + cyc * 1.5)
        rig.breath.material.opacity = (1 - cyc) * 0.22 * clamp(atm.snow, 0, 1)
        rig.breath.position.z = 0.10 + cyc * 0.14
        rig.breath.position.y = (rig.breath.userData.y0 || (rig.breath.userData.y0 = rig.breath.position.y)) + cyc * 0.10
      }
    }
    if (u.clothMat && u.clothMat.userData.base){
      const k = atm.snow > 0.3 ? 0.55 : atm.petal > 0.3 ? 1.22 : 1
      u.clothMat.color.copy(u.clothMat.userData.base).multiplyScalar(k)
    }
  })

  /* rain actually falls: the points drift down and the streaks stretch
     by depth. Reduced motion keeps the rain visible but still. */
  {
    const lvl = state.rainLevel || 1
    const showRain = atm.rain > 0.02
    rain.visible = showRain
    streaks.visible = showRain && !REDUCED
    if (showRain){
      rainMat.opacity = Math.min(0.62, (0.30 + 0.20 * lvl)) * atm.rain
      if (!REDUCED){
        const rs = 10 * dt * (0.7 + 0.3 * lvl)
        for (let i = 0; i < rainCount; i++){
          let y = rainPos[i*3+1] - rs
          if (y < 0) y += 26
          rainPos[i*3+1] = y
        }
        rainGeo.attributes.position.needsUpdate = true
        streakMat.opacity = Math.min(0.66, 0.5 * lvl) * atm.rain
        for (let i = 0; i < streakN; i++){
          const bx = streakBase[i*3], bz = streakBase[i*3+2]
          const nearK = clamp(1 - Math.max(0, -bz) / 30, 0.12, 1)
          let y = streakBase[i*3+1] - (12 + 10 * nearK) * dt * (0.7 + 0.3 * lvl)
          if (y < 0) y += 24
          streakBase[i*3+1] = y
          const len = 0.3 + 0.9 * (1 - nearK)
          const o = i * 6
          streakPos[o] = bx; streakPos[o+1] = y; streakPos[o+2] = bz
          streakPos[o+3] = bx + 0.05; streakPos[o+4] = y - len; streakPos[o+5] = bz
        }
        streakGeo.attributes.position.needsUpdate = true
      }
    }
  }

  PEOPLE.forEach(p => {
    if (!p.mesh) return
    const u = p.mesh.userData

    /* idle life: they shift weight and drift within a small radius, so nobody
       reads as a statue. Movement is never permanently stopped (§10). */
    const amp = u.near ? 0.5 : 0.16
    p.mesh.position.x = u.home.x + Math.sin(t * 0.32 + u.phase) * amp
    p.mesh.position.z = u.home.z + Math.cos(t * 0.24 + u.phase) * amp * 0.6
    if (!REDUCED) p.mesh.position.y = Math.sin(t * 0.7 + u.phase) * 0.014

    /* proximity drives both the ground ring and the speak affordance */
    const d = p.mesh.position.distanceTo(camera.position)
    const near = u.near && d < 26
    u.nearNow = near
    u.ring.material.opacity = near ? 0.34 + Math.sin(t * 1.6) * 0.07 : 0.14

    /* turn toward the visitor when spoken to, then release (§12) */
    const sinceTurn = tGlobal - u.turned
    if (sinceTurn < 7){
      const want = Math.atan2(camera.position.x - p.mesh.position.x,
                              camera.position.z - p.mesh.position.z)
      let diff = want - p.mesh.rotation.y
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      p.mesh.rotation.y += diff * Math.min(1, dt * 3.4)
    } else if (!REDUCED){
      let diff = u.baseFacing - p.mesh.rotation.y
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      p.mesh.rotation.y += diff * Math.min(1, dt * 1.1)
    }

    if (REDUCED) return
    u.sway += dt
    const s = u.sway
    const role = p.idle
    u.head.position.y = 1.76
    if (role === 'phone'){
      u.head.rotation.x = 0.5 + Math.sin(s * 0.7) * 0.06
      u.head.rotation.y = Math.sin(s * 0.35) * 0.24
    } else if (role === 'photo'){
      const raise = 1.6 + Math.sin(s * 0.5) * 0.5
      u.head.rotation.x = raise > 1.8 ? -0.42 : 0.06
      u.head.rotation.y = Math.sin(s * 0.4) * 0.4
    } else if (role === 'chef'){
      u.head.rotation.x = 0.12 + Math.sin(s * 0.6) * 0.14
      u.head.rotation.y = Math.sin(s * 0.28) * 0.5
    } else if (role === 'curator'){
      u.head.rotation.x = Math.sin(s * 0.45) * 0.12
      u.head.rotation.y = Math.sin(s * 0.22) * 0.6
    } else if (role === 'host'){
      u.head.rotation.x = Math.sin(s * 0.5) * 0.1
      u.head.rotation.y = Math.sin(s * 0.3) * 0.34
    } else {
      u.head.rotation.x = Math.sin(s * 0.33) * 0.08
      u.head.rotation.y = Math.sin(s * 0.18) * 0.44
    }
  })

  signs.forEach(s => {
    const u = s.userData
    /* signage brightness follows the time of day and the weather */
    const want = u.baseOpacity * (0.25 + atm.signs * 0.75)
    if (u.flickerT > 0){
      u.flickerT -= dt
      s.material.opacity = Math.random() < 0.25 ? want * 0.32 : want
    } else {
      s.material.opacity = lerp(s.material.opacity, want, 0.08)
    }
    /* and its reflection on the ground fades in when it is wet */
    if (u.refl) u.refl.material.opacity = 0.06 + atm.wet * 0.2 * atm.signs
  })

  /* building windows: the texture is mostly dark with bright panes, so a warm
     multiply at night makes them glow and a cool one by day reads as glass */
  const winK = clamp(atm.windows, 0, 1.3)
  const warmK = 0.55 + winK * 0.45
  bMatR = lerp(bMatR, timeIsNight ? 1 : 0.72, 0.05)
  bMatG = lerp(bMatG, timeIsNight ? 0.86 : 0.76, 0.05)
  bMatB = lerp(bMatB, timeIsNight ? 0.68 + winK * 0.1 : 0.84, 0.05)
  /* Snow lands on the walls too: cool-white wash over the facade.
     Each material KEEPS its own colour and is multiplied by the light,
     rather than every material being set to the same RGB — doing that
     flattened concrete, timber, tile and glass into one identical
     surface and made every building in the city look the same. */
  const snowK = clamp(atm.snow, 0, 1) * 0.55
  const litR = bMatR * warmK * (0.62 + winK * 0.30)
  const litG = bMatG * warmK * (0.62 + winK * 0.26)
  const litB = bMatB * warmK * (0.66 + winK * 0.22)
  allBuildingMats.forEach(m => {
    if (!m.userData.base) m.userData.base = m.color.clone()
    m.color.setRGB(
      m.userData.base.r * litR * (1 - snowK) + 0.86 * snowK,
      m.userData.base.g * litG * (1 - snowK) + 0.89 * snowK,
      m.userData.base.b * litB * (1 - snowK) + 0.94 * snowK
    )
  })

  /* aerial perspective: distant layers wash toward the fog colour, and
     dim at night so the lit window bands carry the read */
  if (farLayerMats.length){
    const fr = atm.fog[0] / 255, fg = atm.fog[1] / 255, fb = atm.fog[2] / 255
    farLayerMats.forEach(m => {
      if (!m.userData.base) m.userData.base = m.color.clone()
      const h = m.userData.haze
      const k = timeIsNight ? 0.7 : 1
      m.color.setRGB(
        m.userData.base.r * (1 - h) * k + fr * h,
        m.userData.base.g * (1 - h) * k + fg * h,
        m.userData.base.b * (1 - h) * k + fb * h
      )
    })
  }

  /* landmarks are silhouettes: they darken with the light so a noon
     tower does not glow at midnight. Skytree keeps aviation beacons. */
  const landK = 0.25 + clamp(atm.light, 0, 1.1) * 0.75
  landmarkMats.forEach(m => {
    if (!m.userData.base) return
    m.color.copy(m.userData.base).multiplyScalar(landK)
  })
  if (riverMat) riverMat.color.setRGB(0.05 + atm.light * 0.04, 0.08 + atm.light * 0.05, 0.12 + atm.light * 0.07)

  /* wet ground: puddles deepen and the road picks up a sheen; snow sheets it */
  snowSheet.material.opacity = lerp(snowSheet.material.opacity, atm.snow * (state.rainLevel||1) * 0.42, 0.05)
  snowSheet.visible = atm.snow > 0.04
  puddles.forEach(p => {
    const want = 0.05 + atm.wet * (state.rainLevel||1) * 0.5
    p.material.opacity = lerp(p.material.opacity, want, 0.05)
    p.visible = atm.wet > 0.12
  })
  if (roadMat){
    const sheen = atm.wet * (state.rainLevel||1) * (timeIsNight ? 0.5 : 0.28)
    roadMat.color.setRGB(0.055 + sheen * 0.1, 0.058 + sheen * 0.11, 0.068 + sheen * 0.14)
  }

  lanterns.forEach(l => { l.material.opacity = 0.78 + Math.sin(t * 7 + l.userData.phase) * 0.12 })

  vendingMachines.forEach(g => {
    const u = g.userData
    /* idle machines glow faintly; clicking one brings the panel properly up (§41) */
    const want = u.secret ? 1.15 : 0.55
    u.lit = lerp(u.lit, want, 0.04)
    u.front.material.color.setScalar(1 + u.lit * 0.22)
  })

  ripples.forEach(r => {
    if (!r.visible) return
    r.userData.life -= dt * 1.4
    r.scale.setScalar(1 + (1 - r.userData.life) * 4)
    r.material.opacity = r.userData.life * 0.5
    if (r.userData.life <= 0) r.visible = false
  })

  cans.forEach((c, i) => {
    c.userData.vy -= 9.8 * dt
    c.position.y += c.userData.vy * dt
    c.rotation.x += dt * 6
    if (c.position.y < 0.07){ c.position.y = 0.07; c.userData.vy *= -0.35 }
    c.userData.life -= dt
    c.material.transparent = true
    c.material.opacity = clamp(c.userData.life, 0, 1)
    if (c.userData.life <= 0){ city.remove(c); c.geometry.dispose(); c.material.dispose(); cans.splice(i,1) }
  })

  if (!cat.userData.running){
    cat.rotation.y = Math.sin(t * 0.35) * 0.6
  } else {
    cat.position.x += cat.userData.dir * cat.userData.speed * dt
    tail.rotation.z = Math.sin(t * 22) * 0.6
    if (Math.abs(cat.position.x) > 7){
      cat.visible = false; catHit.visible = false
      cat.userData.gone = t
    }
  }
  /* the cat wanders back: gone a while, it reappears down the street */
  if (!cat.visible && cat.userData.gone && t - cat.userData.gone > 25){
    cat.userData.running = false
    cat.userData.gone = 0
    cat.position.set((Math.random() - 0.5) * 6, 0, -70 + (Math.random() - 0.5) * 8)
    catHit.position.copy(cat.position); catHit.position.y = 0.3
    cat.visible = true; catHit.visible = true
  }

  symbol.material.opacity = 0.62 + Math.sin(t * 1.6) * 0.16

  const sp2 = steamGeo.attributes.position
  for (let i = 0; i < steamCount; i++){
    let y = sp2.getY(i) + dt * 0.4
    sp2.setX(i, sp2.getX(i) + Math.sin(t * 1.6 + steamSeed[i]) * dt * 0.12)
    if (y > 3.1){ y = 1.3; sp2.setX(i, 2.2 + (Math.random()-0.5)*0.6); sp2.setZ(i, -68 + (Math.random()-0.5)*0.6) }
    sp2.setY(i, y)
  }
  sp2.needsUpdate = true
  steamMat.opacity = 0.16 + Math.sin(t * 0.7) * 0.03

  /* fireworks: launch on a cadence set by the firework intensity, then let
     smoke drift, the flash decay, and the wet ground carry the light.
     This is an EVENT layer — rain, snow and spring all keep running. */
  if (state.fireworks && t >= fwNext){
    const lvl = FW_LEVELS[state.fwLevel] || 1
    spawnFirework(t)
    /* HIGH overlaps several bursts; LOW is an occasional one */
    fwNext = t + (lvl > 1.3 ? 0.35 + fwRnd() * 0.35
      : lvl < 0.7 ? 2.4 + fwRnd() * 1.4 : 1.2 + fwRnd() * 0.6)
  }
  for (let i = fwBursts.length - 1; i >= 0; i--){
    const b = fwBursts[i]
    b.life -= dt / b.max
    const p = b.pts.geometry.attributes.position
    for (let j = 0; j < b.vel.length; j++){
      b.vel[j][1] -= 5.5 * dt
      /* drag: sparks slow as they cool, which is what makes them read */
      const drag = 1 - 0.9 * dt
      b.vel[j][0] *= drag; b.vel[j][2] *= drag
      p.setXYZ(j, p.getX(j) + b.vel[j][0] * dt, p.getY(j) + b.vel[j][1] * dt, p.getZ(j) + b.vel[j][2] * dt)
    }
    p.needsUpdate = true
    b.pts.material.opacity = Math.max(0, b.life * b.life)
    if (b.life <= 0){
      scene.remove(b.pts)
      b.pts.geometry.dispose(); b.pts.material.dispose()
      fwBursts.splice(i, 1)
    }
  }
  for (let i = fwSmoke.length - 1; i >= 0; i--){
    const s = fwSmoke[i]
    s.life -= dt / s.max
    s.puff.position.y += dt * 0.55
    s.puff.position.x += dt * 0.22
    const k = Math.max(0, s.life)
    s.puff.material.opacity = k * k * 0.26
    s.puff.scale.setScalar(s.puff.scale.x + dt * 3.4)
    if (s.life <= 0){
      scene.remove(s.puff)
      s.puff.material.dispose()
      fwSmoke.splice(i, 1)
    }
  }
  /* the flash decays; it lights the street and, in rain, the wet road */
  fwFlash = Math.max(0, fwFlash - dt * 1.6)
  fwLight.intensity = fwFlash * 260
  const glowK = fwFlash * (0.045 + clamp(atm.wet, 0, 1) * 0.16 + clamp(atm.snow, 0, 1) * 0.06)
  fwGround.material.opacity = glowK * (timeIsNight ? 1 : 0.45)

  miniRedraw -= dt
  if (miniRedraw <= 0){
    miniRedraw = 0.2
    const ctx = miniTex.ctx
    ctx.fillStyle = '#0d0f14'; ctx.fillRect(0,0,128,128)
    ctx.fillStyle = '#1b1e26'
    ctx.fillRect(0, 60, 128, 7)
    const cols = ['#c9a961','#8c3a2e','#6f7f6a','#a8894f']
    for (let i = 0; i < 6; i++){
      ctx.fillStyle = cols[i % 4]
      ctx.fillRect(((t * 26 + i * 47) % 150) - 12, 52 + (i % 3) * 8, 7, 4)
    }
    ctx.fillStyle = '#e8d9b0'
    for (let i = 0; i < 10; i++) ctx.fillRect((i * 13 + 7) % 128, 20 + (i * 29) % 40, 3, 3)
    miniTex.tex.needsUpdate = true
  }

  const clawU = claw.userData
  if (clawU.dropT > 0){
    clawU.dropT -= dt
    const ph2 = 1.4 - clawU.dropT
    const armY = ph2 < 0.5 ? 1.6 - ph2 * 1.6 : 0.8 + (ph2 - 0.5) * 1.6
    clawArm.position.y = armY
    clawHand.position.y = armY - 0.45
    if (clawU.dropT <= 0){ clawArm.position.y = 1.6; clawHand.position.y = 1.15 }
  }

  if (doRender){
    /* visibility-based rendering: opaque full-bleed sections cover the canvas,
       so we stop drawing the 3D entirely while they are on screen */
    let covered = false
    if (state.mode === 'tour'){
      for (const id of ['provisions','atlas','itinerary','concierge','close']){
        const el = $(id)
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (r.top <= 8 && r.bottom >= innerHeight - 8){ covered = true; break }
      }
    }
    if (covered && !state.mapOpen) return

    composer.render()
    state.rendered++
  }
}

/* The rAF driver: nothing but the clock and the schedule live here,
   so the simulation itself is shared with the still-capture path. */
function loop(now){
  requestAnimationFrame(loop)
  const dt = Math.min((now - lastFrame) / 1000, 0.05)
  lastFrame = now
  updateWorld(dt, now / 1000)
}

requestAnimationFrame(loop)

/* ---------------------------- resize ------------------------------ */

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
  composer.setSize(innerWidth, innerHeight)
  if (map) map.resize()
})

if (REDUCED) document.body.classList.add('reduced')
setTimeout(() => document.body.classList.add('ready'), 120)

/* dev-only handle for driving the experience in tests.
   Vite strips this block from production builds, so it never ships. */
if (import.meta.env && import.meta.env.DEV){
  window.__yoru = {
    atmosphere, showLocation, openDialogue, closeDialogue, openAtlasOn, initMap,
    submitUserText, LOCATIONS, PLACES, PEOPLE, DIALOGUE, DISHES, SHRINES, state, TOUR,
    camAt, camAtStatic, applyCamera, camera, showDish, buildDishRail, refreshDishDistrict,
    showShrineDiscovery, closeDiscovery, closeLocation, shrineHits, scene, city,
    showMoment, MEDIA, resolveWorld, districtForTour, DISTRICTS, conciergeRecommend, signs, cars, arcadeCab, dressEnvironment, dressDistrict,
    addToItinerary, get itinerary(){ return itinerary },    get reduced(){ return REDUCED }, get camPos(){ return camPos },
    get map(){ return map }, get mapLoading(){ return mapLoading },
    rain, streaks, streakMat, peds, cat, get rainLevel(){ return state.rainLevel || 1 },
    get fireworks(){ return state.fireworks }, get fwBursts(){ return fwBursts },
    get fwSmoke(){ return fwSmoke }, get fwLevel(){ return state.fwLevel },
    buildings: bldgGroups, ARCHETYPES, DISTRICT_PROFILES, buildingMats,
    charMats, renderer,
    train, signals, trackway, setSignal, VEHICLE_TYPES, platformPeople, railMats,
    districtAtZ,
    bay: {
      water: !!bayWater, waterZ: BAY_Z,
      bridge: { towers: 2, deckLength: 190 },
      farSkyline: 116, promenade: 150, crowd: bayCrowd.length,
      group: bayGroup
    },
    get backgroundLayers(){ return backgroundLayers },
    /* world-space bounding box of an object, for silhouette assertions */
    bbox(o){
      const b = new THREE.Box3().setFromObject(o)
      return { l: b.max.z - b.min.z, w: b.max.x - b.min.x, h: b.max.y - b.min.y,
               min: b.min.toArray(), max: b.max.toArray() }
    },
    /* deterministic test pump: advance the exact per-frame logic without rAF */
    tick(dt, t){ updateWorld(dt == null ? 1/60 : dt, t == null ? tGlobal + 1/60 : t, false) },
    /* clear live fireworks and restart the deterministic seed, so a test
       can measure one firework intensity without inheriting the last */
    fwReset(){
      fwBursts.forEach(b => { scene.remove(b.pts); b.pts.geometry.dispose(); b.pts.material.dispose() })
      fwBursts.length = 0
      fwSmoke.forEach(s => { scene.remove(s.puff); s.puff.material.dispose() })
      fwSmoke.length = 0
      fwFlash = 0
      fwNext = 0
      fwSeed = 20260806
      return fwBursts.length
    }
  }
}

/* ------------------------- self-driving stills -------------------------
   Lets the build be inspected visually: node tests/shot.cjs <name> <p> <time> <weather>
   opens the real page, waits for the atmosphere to settle, and saves a PNG. */
if (SHOT){
 try {
  const sp = new URLSearchParams(location.search)
  const targetP = Math.min(1, Math.max(0, parseFloat(sp.get('p') || '0.5')))
  const time = sp.get('time') || 'night'
  const weather = sp.get('weather') || 'rain'
  let settle = Math.max(1, parseInt(sp.get('frames') || '260', 10))
  const out = sp.get('out') || 'shot'

  document.getElementById('intro').classList.add('done')
  document.getElementById('hero').classList.add('hidden')
  document.body.classList.remove('locked')
  state.mode = 'tour'
  if (sp.get('ui') === '0'){
    ;['nav', 'atmos', 'tally', 'sound-toggle'].forEach(id => {
      const el = document.getElementById(id); if (el) el.style.display = 'none'
    })
  }
  state.p = targetP
  let tourCur = TOUR[0]
  TOUR.forEach(c => { if (targetP >= c.at - 0.001) tourCur = c })
  const dn = tourCur.district.toLowerCase().replace(/[^a-z]/g, '')
  const dk = atmosphere.districts().find(d => dn.startsWith(d) || d.startsWith(dn)) || 'shinjuku'
  atmosphere.set({ time, weather, district: dk })
  applyCamera()

  /* Pump the simulation directly. Headless does not reliably pump
     rAF, so instead of waiting for the render loop we advance the
     exact same per-frame logic here, let the atmosphere tween settle,
     then render once and read the frame back. */
  const dt = 1 / 60
  /* FIREWORKS SHOTS (?fw=low|medium|high) must visibly show a burst. The
     cadence is deterministic, so we advance to a moment we know has a
     live burst inside it, and aim the camera at the skyline over the
     water rather than whatever the chapter happens to be framing. */
  const fwLevel = sp.get('fw')
  let fwBurstsInFrame = 0
  let steps = 0
  if (fwLevel){
    state.fireworks = true
    state.fwLevel = fwLevel
    fwSeed = 20260806
    const fwBtnEl = $('atmos-fireworks')
    if (fwBtnEl) fwBtnEl.classList.add('on')
    const fwLv = $('atmos-fw-levels')
    if (fwLv){
      fwLv.hidden = false
      fwLv.querySelectorAll('button').forEach(o => o.classList.toggle('on', o.dataset.fw === fwLevel))
    }
    /* frame the skyline: camera on the street, looking up and down it */
    const camZ = Math.max(-140, Math.min(targetP >= 0.945 ? -150 : -60, -60))
    camera.position.set(6, 4.2, camZ)
    camera.lookAt(0, 62, camZ - 150)
    state.p = targetP
    /* step forward until a burst has expanded — capturing on the first frame
       would photograph a tight cluster at the launch point rather than a
       burst. LOW's cadence is slow and only one burst exists at a time. */
    steps = 0
    const wantBursts = fwLevel === 'high' ? 2 : 1
    while (steps < 3600 &&
           fwBursts.filter(b => b.life < 0.92 && b.life > 0.68).length < wantBursts){
      updateWorld(dt, steps * dt, false)
      steps++
    }
    /* Capture exactly at the burst. The default settle count would pump a
       further four seconds of simulation and the burst would be gone. */
    settle = steps
  }
  /* Continue pumping forward from wherever the fireworks search left off.
     Re-running the loop from zero would advance the clock a second time
     and run past the very burst we just found. */
  let pumped = fwLevel ? steps : 0
  for (; pumped < settle; pumped++) updateWorld(dt, pumped * dt, false)
  /* The camera is aimed AFTER settling: the render loop drives it from
     scroll position and would otherwise overwrite any viewpoint chosen
     here, which is exactly how the burst ended up off-screen before. */
  if (fwLevel){
    camera.position.set(6, 4.6, -62)
    camera.lookAt(0, 58, -168)
    camera.updateMatrixWorld(true)
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
    const frustum = new THREE.Frustum()
    frustum.setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    fwBurstsInFrame = fwBursts.filter(b => {
      b.pts.geometry.computeBoundingSphere()
      return frustum.intersectsObject(b.pts)
    }).length
  }
  composer.render()
  state.rendered++
  const pre = document.createElement('pre')
  pre.id = 'png'
  pre.textContent = renderer.domElement.toDataURL('image/png')
  document.body.appendChild(pre)
  if (fwLevel){
    const f = document.createElement('pre')
    f.id = 'fwstats'
    f.textContent = JSON.stringify({
      level: fwLevel, bursts: fwBursts.length, smoke: fwSmoke.length,
      inFrustum: fwBurstsInFrame, flash: +fwFlash.toFixed(3),
      steps, settle, pumped, fwNext: +fwNext.toFixed(2), simT: +(pumped * dt).toFixed(2)
    })
    document.body.appendChild(f)
  }
  document.title = 'SHOT:' + out

  /* Objective visual verification. This model cannot see images, so
     instead of eyeballing the frame we measure it. readPixels reads
     the rendered frame straight from GL — the WebGL->2D canvas copy
     stalls under swiftshader, the native call does not. Sample the
     sky at the top of the frame and report the brightness
     distribution so blow-out, crushed blacks and day/night
     correctness are all checkable as numbers rather than impressions. */
  const glc = renderer.domElement
  const gl = renderer.getContext()
  const W = glc.width, H = glc.height
  const buf = new Uint8Array(W * H * 4)
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf)
  const px = W * H
  let sum = 0, sR = 0, sG = 0, sB = 0, mx = 0, mn = 255, blow = 0, dark = 0
  /* readPixels is bottom-up, so the sky lives in the last rows */
  const skyRows = Math.max(1, Math.floor(H * 0.10))
  const skyStart = (H - skyRows) * W
  let skR = 0, skG = 0, skB = 0, skyN = 0
  for (let i = 0; i < px; i++){
    const r = buf[i*4], g = buf[i*4+1], b = buf[i*4+2]
    const l = 0.2126*r + 0.7152*g + 0.0722*b
    sum += l; sR += r; sG += g; sB += b
    if (l > mx) mx = l
    if (l < mn) mn = l
    if (l > 245) blow++
    if (l < 12) dark++
    if (i >= skyStart){ skR += r; skG += g; skB += b; skyN++ }
  }
  const stats = {
    w: W, h: H,
    mean: +(sum / px).toFixed(1),
    max: +mx.toFixed(1), min: +mn.toFixed(1),
    blowoutPct: +(blow / px * 100).toFixed(2),
    darkPct: +(dark / px * 100).toFixed(2),
    meanRGB: [+(sR / px).toFixed(0), +(sG / px).toFixed(0), +(sB / px).toFixed(0)],
    skyRGB: [+(skR / skyN).toFixed(0), +(skG / skyN).toFixed(0), +(skB / skyN).toFixed(0)]
  }
  const sPre = document.createElement('pre')
  sPre.id = 'stats'
  sPre.textContent = JSON.stringify(stats)
  document.body.appendChild(sPre)
 } catch (err){
  document.title = 'SHOTERR:' + (err && err.message ? err.message : String(err))
 }
}