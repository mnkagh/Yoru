import maplibregl from 'maplibre-gl'

import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches
const IS_TOUCH = matchMedia('(pointer: coarse)').matches
const lerp = (a,b,t)=>a+(b-a)*t
const clamp = THREE.MathUtils.clamp
const smooth = t=>t*t*(3-2*t)
const easeOut = t=>1-Math.pow(1-t,3)


const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('scene'), antialias: !IS_TOUCH, powerPreference:'high-performance' })
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
  uniforms:{ tDiffuse:{value:null}, time:{value:0}, amount:{value:0.0012}, grain:{value:0.045}, vig:{value:0.55} },
  vertexShader:'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader:[
    'varying vec2 vUv;',
    'uniform sampler2D tDiffuse; uniform float time, amount, grain, vig;',
    'float rand(vec2 c){ return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453); }',
    'void main(){',
    ' vec2 d = vUv - 0.5; float r2 = dot(d,d);',
    ' vec2 off = d * amount * (0.4 + r2*2.5);',
    ' float cr = texture2D(tDiffuse, vUv+off).r;',
    ' float cg = texture2D(tDiffuse, vUv).g;',
    ' float cb = texture2D(tDiffuse, vUv-off).b;',
    ' vec3 col = vec3(cr,cg,cb);',
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

function windowTexture(w, h, lit, warm){
  return canvasTex(w, h, (ctx)=>{
    ctx.fillStyle = '#0a0d15'; ctx.fillRect(0,0,w,h)
    const cols = 6, rows = Math.round(h/w*cols*1.6)
    const cw = w/cols, rh = h/rows
    for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){
      if(Math.random() < lit){
        ctx.fillStyle = Math.random()<0.12 ? '#7fd4ff' : (Math.random()<0.5 ? warm : '#ffd9a0')
        ctx.globalAlpha = 0.35 + Math.random()*0.6
        ctx.fillRect(x*cw+cw*0.22, y*rh+rh*0.28, cw*0.56, rh*0.44)
      }
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

const bTexA = windowTexture(64, 128, 0.34, '#ffb36b')
const bTexB = windowTexture(64, 128, 0.22, '#9db8ff')
const bTexC = windowTexture(64, 128, 0.45, '#ffd9a0')
const bMats = [
  new THREE.MeshBasicMaterial({ map: bTexA }),
  new THREE.MeshBasicMaterial({ map: bTexB }),
  new THREE.MeshBasicMaterial({ map: bTexC })
]

const buildingGeo = new THREE.BoxGeometry(1,1,1)
function addBuilding(x, z, w, h, d, mat){
  const m = new THREE.Mesh(buildingGeo, mat)
  m.scale.set(w, h, d)
  m.position.set(x, h/2, z)
  city.add(m)
  return m
}

const farBuildings = []
for(let z = 8; z > -150; z -= 5 + Math.random()*4){
  const alley = (z < -60 && z > -84)
  const plaza = (z < -40 && z > -60)
  const arcade = (z < -84 && z > -104)
  if(plaza && Math.random() < 0.7) continue
  for(const side of [-1, 1]){
    if(Math.random() < 0.12) continue
    const xBase = alley ? 6.2 : (plaza ? 16 : 12.5)
    const w = 3.5 + Math.random()*3.5
    const h = arcade ? 10+Math.random()*16 : 8 + Math.random()*30
    const d = 4 + Math.random()*3
    const x = side * (xBase + w/2 + Math.random()*2)
    const mat = bMats[Math.floor(Math.random()*3)]
    addBuilding(x, z, w, h, d, mat)
    if(z < -140 || z > 8){}
  }
}
for(let i=0;i<70;i++){
  const w = 8+Math.random()*10, h = 14+Math.random()*34, d = 8+Math.random()*8
  const x = (Math.random()<0.5?-1:1) * (30+Math.random()*70)
  const z = -140 - Math.random()*80
  const m = addBuilding(x, z, w, h, d, bMats[Math.floor(Math.random()*3)])
  farBuildings.push(m)
}

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
  m.userData = { baseOpacity: 0.95, flickerT: 0, type:'sign', baseColor: new THREE.Color(0xffffff) }
  city.add(m)
  signs.push(m)
  const refl = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2*scale, 0.9*scale),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  )
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

const cars = []
const carGeo = new THREE.BoxGeometry(1.7, 0.55, 0.75)
for(let i=0;i<14;i++){
  const dir = i%2===0 ? 1 : -1
  const mat = new THREE.MeshBasicMaterial({ color: dir>0 ? 0x1c2434 : 0x1c2434 })
  const c = new THREE.Mesh(carGeo, mat)
  const lane = dir>0 ? 7.6 : -7.6
  c.position.set((Math.random()-0.5)*24, 0.4, -12 - i*7 - Math.random()*4)
  const head = new THREE.Mesh(new THREE.PlaneGeometry(0.5,0.3), new THREE.MeshBasicMaterial({ color: dir>0 ? 0xfff6d8 : 0xff3b30 }))
  head.position.set(dir>0?0.9:-0.9, 0, 0)
  head.rotation.y = dir>0 ? Math.PI/2 : -Math.PI/2
  c.add(head)
  c.userData = { dir, speed: 5+Math.random()*5 }
  city.add(c)
  cars.push(c)
}

const train = new THREE.Group()
const trainBodyMat = new THREE.MeshBasicMaterial({ color: 0x141a26 })
const trainWinMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.85 })
for(let i=0;i<4;i++){
  const car = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.7, 3.4), trainBodyMat)
  car.position.set(0, 1.55, -i*3.8)
  const win = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.8), trainWinMat)
  win.position.set(1.31, 1.8, -i*3.8)
  win.rotation.y = Math.PI/2
  const win2 = win.clone()
  win2.position.x = -1.31
  win2.rotation.y = -Math.PI/2
  car.add(win); car.add(win2)
  train.add(car)
}
const headlight = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }))
headlight.position.set(0, 1.2, 1.75)
train.add(headlight)
train.position.set(-14, 0, -58)
train.userData = { type:'train', doorT: 0 }
city.add(train)
const trainHit = new THREE.Mesh(new THREE.BoxGeometry(4, 3.4, 16), new THREE.MeshBasicMaterial({ visible:false }))
trainHit.userData = { type:'train' }
city.add(trainHit)

const peds = []
const pedZones = [
  { x:[-8,8], z:[-44,-57], n: IS_TOUCH?4:7 },
  { x:[-2.6,2.6], z:[-63,-80], n: IS_TOUCH?2:4 },
  { x:[-5,5], z:[-86,-101], n: IS_TOUCH?3:5 }
]
function makePed(zone){
  const g = new THREE.Group()
  const col = new THREE.Color().setHSL(Math.random(), 0.35, 0.1+Math.random()*0.18)
  const mat = new THREE.MeshBasicMaterial({ color: col })
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.5, 2, 6), mat)
  body.position.y = 0.62
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), mat)
  head.position.y = 1.16
  g.add(body, head)
  body.userData = { type:'ped', ref: g }
  head.userData = { type:'ped', ref: g }
  g.position.set(zone.x[0]+Math.random()*(zone.x[1]-zone.x[0]), 0, zone.z[0]+Math.random()*(zone.z[1]-zone.z[0]))
  g.userData = { head, zone, dir: Math.random()<0.5?1:-1, speed: 0.35+Math.random()*0.55, lookT: 0, bob: Math.random()*10, type:'ped' }
  city.add(g)
  peds.push(g)
}
pedZones.forEach(z=>{ for(let i=0;i<z.n;i++) makePed(z) })

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

const streakGeo = new THREE.BufferGeometry()
const streakCount = 36
const streakPos = new Float32Array(streakCount*3)
const streakSeed = []
for(let i=0;i<streakCount;i++){
  streakPos[i*3] = (Math.random()-0.5)*16
  streakPos[i*3+1] = Math.random()*5 - 1
  streakPos[i*3+2] = -40 + Math.random()*45
  streakSeed.push(20+Math.random()*30)
}
streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3))
const streakMat = new THREE.PointsMaterial({ color: 0xffd9a0, size: 0.35, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
const streaks = new THREE.Points(streakGeo, streakMat)
camera.add(streaks)

const VIBES = {
  hungry:   { label:'HUNGRY',   emoji:'🍜', color:'#ffb36b', rain:0.4, traffic:0.6, fog:0.020, signSpeed:1,   bloom:0.55, crowd:0.7,  sway:1,   steam:1.2, desc:'Follow the steam. Late-night ramen, tiny izakayas, vending machines and streets that smell better at 1 AM.', cta:'FEED ME →' },
  nightlife:{ label:'NIGHTLIFE',emoji:'🎧', color:'#ff2e88', rain:0.2, traffic:1.5, fog:0.010, signSpeed:2.2, bloom:0.95, crowd:1.6,  sway:1.2, steam:0.3, desc:'The city gets louder. Neon, music, crowded streets and nights that don\'t really have an ending.', cta:'TURN IT UP →' },
  quiet:    { label:'QUIET',    emoji:'🌙', color:'#7fd4ff', rain:1.25,traffic:0.12,fog:0.030, signSpeed:0.5, bloom:0.35, crowd:0.28, sway:0.5, steam:0.2, desc:'Take the long way home. Rainy streets, empty alleys, convenience stores glowing in the distance.', cta:'SLOW DOWN →' },
  chaotic:  { label:'CHAOTIC',  emoji:'🕹️', color:'#ffe95a', rain:0.5, traffic:2.4, fog:0.008, signSpeed:4.5, bloom:1.05, crowd:1.9,  sway:2.4, steam:0.4, desc:'Wrong train. Wrong street. Right night. Arcades, crowds, lights, noise and absolutely no plan.', cta:'LOSE YOURSELF →' },
  romantic: { label:'ROMANTIC', emoji:'💗', color:'#ff9ecf', rain:0.55,traffic:0.4, fog:0.019, signSpeed:0.8, bloom:0.65, crowd:0.5,  sway:0.7, steam:0.7, desc:'Some cities look better in the rain. Find a quiet rooftop. Watch the trains. Stay a little longer.', cta:'STAY AWHILE →' }
}
const vibe = { rain:0.4, traffic:0.6, fog:0.012, signSpeed:1, bloom:0.7, crowd:0.7, sway:1, steam:0.4 }
let vibeTarget = VIBES.quiet

const vibeObjects = []
const vibeNames = Object.keys(VIBES)
function buildVibeObjects(){
  vibeNames.forEach((name, i)=>{
    const v = VIBES[name]
    const { tex } = canvasTex(256, 256, (ctx)=>{
      ctx.clearRect(0,0,256,256)
      ctx.font = '170px "Segoe UI Emoji","Apple Color Emoji",serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.shadowColor = v.color; ctx.shadowBlur = 34
      ctx.fillText(v.emoji, 128, 138)
    })
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false })
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.3), mat)
    m.position.set((i-2)*3.1, 1.3, 0.5)
    m.userData = { type:'vibe', name, baseY: 1.3, phase: i*1.3 }
    scene.add(m)
    vibeObjects.push(m)
  })
}
buildVibeObjects()
vibeObjects.forEach(o=>o.visible=false)

const $ = id => document.getElementById(id)

const state = {
  mode:'hero',
  p:0,
  clock: 23*60+47,
  trafficT:0,
  light:'green',
  guide:null,
  it:[],
  filters:new Set(),
  reduce: REDUCED,
  listening:false,
  speaking:false
}

const camPos = new THREE.Vector3()
const camLook = new THREE.Vector3()

/* ------------------------------------------------------------------ *
 *  TOUR — scroll is the primary mechanism. No pointer parallax.      *
 * ------------------------------------------------------------------ */

const TOUR = [
  { at:0.00, pos:[0, 15, 34],    look:[0, 7, -40],   district:'Shinjuku',
    idx:'01', title:'The city is <em>just waking up.</em>',
    body:'Rain over the expressway. Somewhere below, a kitchen light comes on at two in the morning. Tokyo is not asleep — it has simply changed its shift.' },
  { at:0.14, pos:[0, 3.6, 8],    look:[-2, 2.6, -30], district:'Nishi-Shinjuku',
    idx:'02', title:'Follow the light.',
    body:'We leave the wide road behind. The lane narrows. Steam lifts from a doorway, and someone has left a single lamp on for the people who know where to look.' },
  { at:0.28, pos:[1.4, 2.2, -32], look:[-1, 1.8, -48], district:'Yoyogi',
    idx:'03', title:'Dinner, <em>without the crowd.</em>',
    body:'Twelve seats. A menu written when you sit down. The kitchen has been running since five, and the chef will decide what tonight tastes like.' },
  { at:0.42, pos:[0, 2.6, -44],  look:[0, 1.6, -54],  district:'Shibuya',
    idx:'04', title:'Thousands of stories <em>cross here every night.</em>',
    body:'The scramble crossing empties for perhaps ninety seconds each hour. That minute is the closest thing Tokyo has to a private moment.' },
  { at:0.56, pos:[0.6, 2.0, -60],look:[-1, 1.6, -74], district:'Shibuya',
    idx:'05', title:'The Tokyo <em>most visitors never see.</em>',
    body:'One street back from the light, the volume drops completely. Izakayas with six seats. A cat that owns the pavement. A door with no sign.' },
  { at:0.70, pos:[0, 2.2, -78],  look:[0, 2.0, -94],  district:'Shibuya',
    idx:'06', title:'A city that <em>rewards the detour.</em>',
    body:'Akihabara hums three districts away, but this arcade is quieter. The machines have been here longer than the building, and someone still remembers everyone\'s high score.' },
  { at:0.84, pos:[0, 3.0, -96],  look:[0, 8, -140],  district:'Shibuya',
    idx:'07', title:'Above it, <em>the city keeps moving.</em>',
    body:'From eleven floors up the rain stops falling on you. Below, a train runs empty, a shop pulls its shutter, and another night begins without ceremony.' }
]

function camAt(p){
  let i = 0
  while(i < TOUR.length-2 && p > TOUR[i+1].at) i++
  const a = TOUR[i], b = TOUR[i+1]
  const t = smooth(clamp((p - a.at)/(b.at - a.at), 0, 1))
  camPos.set(lerp(a.pos[0],b.pos[0],t), lerp(a.pos[1],b.pos[1],t), lerp(a.pos[2],b.pos[2],t))
  camLook.set(lerp(a.look[0],b.look[0],t), lerp(a.look[1],b.look[1],t), lerp(a.look[2],b.look[2],t))
}

/* ---------------------------- chapters ---------------------------- */

const chaptersEl = $('chapters')
TOUR.forEach((c, i) => {
  const d = document.createElement('section')
  d.className = 'chapter' + (i % 2 ? ' right' : '')
  d.innerHTML = '<div class="idx mono">' + c.idx + ' / ' + c.district + '</div>' +
                '<h2>' + c.title + '</h2>' +
                '<p>' + c.body + '</p>'
  chaptersEl.appendChild(d)
})

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
  g.add(legs, torso, coatFringe, shoulders, neck, head, ring)
  g.position.set(x, 0, z)
  g.rotation.y = facing || 0
  g.userData = { head, ring, sway: Math.random()*6 }
  city.add(g)
  return g
}

const PEOPLE = [
  { id:'yuki',    name:'Yuki',   role:'Private cultural guide',  x:-2.4, z:-64, facing: 1.2,  coat:0x2b2620, accent:0xc9a961, from:0.16, to:0.34 },
  { id:'aoi',     name:'Aoi',    role:'Executive chef',          x:0.7,  z:-68, facing:-0.9,  coat:0x33291f, accent:0xd8c9a8, from:0.28, to:0.46 },
  { id:'haruki',  name:'Haruki', role:'Sake curator',            x:2.6,  z:-74, facing:-1.4,  coat:0x241f1c, accent:0xa8894f, from:0.42, to:0.60 },
  { id:'ren',     name:'Ren',    role:'Design & fashion',        x:-2.6, z:-90, facing: 1.5,  coat:0x2a2530, accent:0xb9aec4, from:0.58, to:0.76 },
  { id:'mika',    name:'Mika',   role:'Tea practitioner',        x:2.2,  z:-100,facing:-1.1,  coat:0x36302a, accent:0xc9a961, from:0.74, to:0.92 }
]
PEOPLE.forEach(p => {
  p.mesh = makePerson(p.x, p.z, p.coat, p.accent, p.facing)
  p.chip = $('chip-' + p.id)
  p.chip.addEventListener('click', () => openDialogue(p.id))
})

/* --------------------------- dialogue ---------------------------- */

const DIALOGUE = {
  yuki: {
    open: "Good evening. I know Tokyo can feel overwhelming at first — everywhere is lit, everywhere is loud. Tell me what you are looking for tonight.",
    options: [
      { t:'Show me somewhere quiet.', go:'quiet' },
      { t:'I want exceptional food.', go:'food' },
      { t:'I want to see Tokyo after midnight.', go:'midnight' },
      { t:'Take me somewhere locals love.', go:'locals' }
    ],
    quiet: { say:"Then we leave the main roads entirely. Kagurazaka has stone lanes and old wooden facades — at this hour almost everything is closed, which is exactly the point. We walk, and stop wherever a light is still on.",
      follow:"Shall I arrange it?", add:'Kagurazaka evening walk' },
    food: { say:"Then I would not choose by reputation. Aoi is cooking in Shibuya tonight — twelve seats, no menu until you sit down. I will make the reservation and put us at the counter.",
      follow:"I will confirm the counter seat.", add:'Private counter dinner' },
    midnight: { say:"After midnight the interesting doors open. Golden Gai has no sign and no map — a hundred bars in six alleyways. We go in, we don't overstay, and we leave when it feels right.",
      follow:"I will keep the evening open.", add:'Golden Gai, after hours' },
    locals: { say:"Then let's skip the obvious places. There is a small counter in Kagurazaka where the chef still knows every guest by name. Six seats, seasonal menu, no sign outside.",
      follow:"I will arrange the reservation.", add:'Kagurazaka counter' },
    more: { say:"Of course. Six seats. A menu that changes with the market that morning. No sign outside — I will send you the address the day before, and the doorman will know your name.",
      follow:"Add it to the evening?", add:'Kagurazaka counter' }
  },
  aoi: {
    open: "Welcome. Sit anywhere at the counter — I will decide what you eat tonight. Tell me what you usually like, so I know what to avoid.",
    options: [
      { t:'I like strong, simple flavours.', go:'strong' },
      { t:'I am curious about anything.', go:'curious' },
      { t:'Something light before a long night.', go:'light' }
    ],
    strong: { say:"Good. Then tonkotsu, properly made — pork bone for two days, nothing added that does not need to be there. I will add a small dish of chashu you did not order.",
      follow:"Add the dinner?", add:'Tonkotsu & chashu' },
    curious: { say:"Then we start with the clear broth and work outward. Everything tonight was bought this morning. You will taste the difference by the second spoonful.",
      follow:"Reserve the counter?", add:'Chef\'s tasting counter' },
    light: { say:"Light, then. Clear soup, grilled fish, pickles. We keep it delicate and let the sake do the evening's work.",
      follow:"Reserve the counter?", add:'Light counter dinner' }
  },
  haruki: {
    open: "Good evening. Before we taste anything — how do you usually drink? There is no wrong answer, it only changes what I pour.",
    options: [
      { t:'Something rare and unfamiliar.', go:'rare' },
      { t:'Dry and precise.', go:'dry' },
      { t:'Full-bodied, warming.', go:'full' }
    ],
    rare: { say:"Then junmai daiginjo, poured cold and taken slowly. It will be quiet — almost nothing on the palate, which is exactly the point. The brewer is two hours from here.",
      follow:"Arrange the tasting?", add:'Rare junmai tasting' },
    dry: { say:"Then I would pour genshu, warmed a little below body temperature. It should smell of green apple and snow. Anything more elaborate would drown it.",
      follow:"Arrange the tasting?", add:'Warm genshu flight' },
    full: { say:"Then sairei, warmed properly — you will feel it in the chest. We will pair it with the grilled eel and let it sit on the tongue.",
      follow:"Arrange the tasting?", add:'Sairei & grilled eel' }
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
      follow:"Add the ceremony?", add:'Private tea ceremony' },
    some: { say:"Then we skip the usual and go straight to gyokuro — shaded for three weeks, brewed cool, almost nothing on the tongue but very much there.",
      follow:"Add the ceremony?", add:'Gyokuro tasting' },
    surprise: { say:"Good. Then I will choose, and you will not know until it is in front of you. That is the most honest way to be introduced to anything.",
      follow:"Add the ceremony?", add:"Master's choice ceremony" }
  }
}

const dlgBody = $('dlg-body')
const dlgOpts = $('dlg-opts')

function dlgLine(who, txt, cls){
  const d = document.createElement('div')
  d.className = 'dlg-line' + (cls ? ' ' + cls : '')
  d.innerHTML = '<div class="who">' + who + '</div><div class="txt">' + txt + '</div>'
  dlgBody.appendChild(d)
  dlgBody.scrollTop = dlgBody.scrollHeight
}

function dlgButtons(list){
  dlgOpts.innerHTML = ''
  list.forEach(b => {
    const el = document.createElement('button')
    el.className = 'dlg-opt' + (b.add ? ' add' : '')
    el.textContent = b.t
    el.addEventListener('click', () => {
      if (b.add){ addToItinerary(b.add); dlgLine('Journey', 'Added to My Tokyo.'); return }
      dlgLine(state.guide, b.t, 'user')
      const node = DIALOGUE[state.guide][b.go]
      setTimeout(()=>{
        dlgLine('Yuki'.replace('Yuki', state.guide === 'yuki' ? 'Yuki' : nameOf(state.guide)), node.say)
        speak(node.say)
        dlgButtons([{ t:'Tell me more.', go:'more' }, { t: node.follow, add: node.add }])
      }, 420)
    })
    dlgOpts.appendChild(el)
  })
}

function nameOf(id){
  const p = PEOPLE.find(q => q.id === id)
  return p ? p.name : id
}

let pendingAdd = null
function openDialogue(id){
  const d = DIALOGUE[id]
  if (!d) return
  state.guide = id
  pendingAdd = d
  $('dlg-name').textContent = nameOf(id)
  $('dlg-role').textContent = PEOPLE.find(q => q.id === id).role
  dlgBody.innerHTML = ''
  dlgOpts.innerHTML = ''
  dlgLine(nameOf(id), d.open)
  dlgButtons(d.options)
  $('dialogue').classList.add('on')
  document.body.classList.add('locked')
  speak(d.open)
}

function closeDialogue(){
  $('dialogue').classList.remove('on')
  document.body.classList.remove('locked')
  stopSpeaking()
  state.guide = null
}

$('dlg-close').addEventListener('click', closeDialogue)

/* ----------------------------- voice ------------------------------ */

let recog = null
const SR = window.SpeechRecognition || window.webkitSpeechRecognition
const micBtn = $('dlg-mic')
const conMic = $('con-mic')
const voiceOk = !!(SR && window.speechSynthesis)

if (!voiceOk){
  ;[micBtn, conMic].forEach(b => { b.disabled = true; b.title = 'Voice not supported in this browser' })
}

function startListening(onText){
  if (!voiceOk) return
  if (state.listening){ recog && recog.stop(); return }
  try {
    recog = new SR()
    recog.lang = 'en-US'
    recog.interimResults = false
    recog.maxAlternatives = 1
    recog.onresult = e => { const t = e.results[0][0].transcript; if (t) onText(t) }
    recog.onerror = () => { toast('Voice input was not available') }
    recog.onend = () => {
      state.listening = false
      micBtn.classList.remove('live'); conMic.classList.remove('live')
    }
    recog.start()
    state.listening = true
    micBtn.classList.add('live'); conMic.classList.add('live')
  } catch (err) {
    toast('Voice input is not available here')
  }
}

micBtn.addEventListener('click', () => startListening(t => {
  dlgLine(nameOf(state.guide), t, 'user')
  const opts = DIALOGUE[state.guide].options
  const match = opts.find(o => t.toLowerCase().includes(o.t.split(' ')[0].toLowerCase()))
  const node = match ? DIALOGUE[state.guide][match.go] : null
  if (node){
    setTimeout(() => {
      dlgLine(nameOf(state.guide), node.say)
      speak(node.say)
      dlgButtons([{ t:'Tell me more.', go:'more' }, { t: node.follow, add: node.add }])
    }, 400)
  } else {
    setTimeout(() => {
      dlgLine(nameOf(state.guide), 'Let us begin again — choose what suits you tonight.')
      dlgButtons(DIALOGUE[state.guide].options)
    }, 400)
  }
}))

function speak(text){
  if (!voiceOk || !window.speechSynthesis) return
  stopSpeaking()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 0.94; u.pitch = 0.96; u.lang = 'en-GB'
  window.speechSynthesis.speak(u)
}
function stopSpeaking(){ if (window.speechSynthesis) window.speechSynthesis.cancel() }

$('dlg-listen').addEventListener('click', () => {
  if (!voiceOk){ toast('Speech is not supported in this browser'); return }
  const lines = dlgBody.querySelectorAll('.dlg-line .txt')
  const last = lines[lines.length - 1]
  if (last) speak(last.textContent)
})

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
      '<button class="rm" aria-label="Remove ' + it.title + '">×</button>'
    li.querySelector('.rm').addEventListener('click', () => {
      itinerary = itinerary.filter(x => x.title !== it.title)
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

function initMap(){
  if (map) return
  const el = $('map')
  if (!el) return
  map = new maplibregl.Map({
    container: el,
    center: [139.74, 35.69],
    zoom: 11.6,
    attributionControl: true,
    dragRotate: true,
    maxZoom: 17,
    minZoom: 9
  })
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
  map.on('load', () => {
    map.addSource('carto', {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors · © CARTO'
    })
    map.addLayer({ id: 'carto', type: 'raster', source: 'carto', paint: { 'raster-opacity': 0.72 } })
    PLACES.forEach(p => {
      const m = new maplibregl.Marker({ color: p.c === 'Hidden' ? '#c9a961' : '#f2ece1', anchor: 'bottom' })
        .setLngLat([p.lng, p.lat])
        .setPopup(new maplibregl.Popup({ offset: 14, closeButton: false }).setHTML('<div>' + p.n + '</div>'))
        .addTo(map)
      m.getElement().addEventListener('click', () => showPlace(p))
      mapMarkers[p.n] = m
    })
  })
  setTimeout(() => map && map.resize(), 400)
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
  if (!text.trim()) return
  conLine('You', text, 'user')
  const a = conAnswer(text)
  setTimeout(() => { conLine('Concierge', a); speak(a) }, 420)
}

$('con-send').addEventListener('click', () => {
  const i = $('con-input')
  askConcierge(i.value)
  i.value = ''
})
$('con-input').addEventListener('keydown', e => {
  if (e.key === 'Enter'){ askConcierge(e.target.value); e.target.value = '' }
})
conMic.addEventListener('click', () => startListening(t => {
  $('con-input').value = t
  askConcierge(t)
  $('con-input').value = ''
}))
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

/* ------------------------------ toast ----------------------------- */

let toastTimer = null
function toast(msg, dur=3400){
  const t = $('toast')
  t.textContent = msg
  t.classList.add('on')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.remove('on'), dur)
}

/* ------------------------------ sound ----------------------------- */

let soundOn = false, audioCtx = null, masterGain = null
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

  const hum = audioCtx.createBufferSource()
  hum.buffer = mk(true); hum.loop = true
  const hf = audioCtx.createBiquadFilter()
  hf.type = 'lowpass'; hf.frequency.value = 170
  const hg = audioCtx.createGain(); hg.gain.value = 0.11
  hum.connect(hf); hf.connect(hg); hg.connect(masterGain)
  hum.start()

  const sub = audioCtx.createOscillator()
  sub.type = 'sine'; sub.frequency.value = 47
  const sg = audioCtx.createGain(); sg.gain.value = 0.018
  sub.connect(sg); sg.connect(masterGain)
  sub.start()
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

$('nav-journey').addEventListener('click', () => window.scrollTo({ top: chaptersEl.offsetTop, behavior: 'smooth' }))
$('nav-atlas').addEventListener('click', () => { initMap(); $('atlas').scrollIntoView({ behavior:'smooth' }) })
$('nav-mine').addEventListener('click', () => $('itinerary').scrollIntoView({ behavior:'smooth' }))
$('design').addEventListener('click', () => $('concierge').scrollIntoView({ behavior:'smooth' }))
$('close-design').addEventListener('click', () => $('concierge').scrollIntoView({ behavior:'smooth' }))
$('close-concierge').addEventListener('click', () => $('concierge').scrollIntoView({ behavior:'smooth' }))

window.addEventListener('scroll', () => {
  const y = scrollY
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
    $('district-time').textContent = hh + ':' + mm + ' JST'
    let cur = TOUR[0]
    TOUR.forEach(c => { if (p >= c.at - 0.001) cur = c })
    const dn = $('district-name')
    if (dn.textContent !== cur.district) dn.textContent = cur.district
    PEOPLE.forEach(q => {
      const show = p > q.from && p < q.to
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

people_umbrellas()

function people_umbrellas(){
  peds.forEach(p => {
    if (Math.random() < 0.45){
      const um = new THREE.Mesh(
        new THREE.ConeGeometry(0.52, 0.3, 10, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x1a1714, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
      )
      um.position.y = 1.62
      p.add(um)
      p.userData.umbrella = um
    }
  })
}

let miniRedraw = 0
let lastFrame = performance.now()

function loop(now){
  requestAnimationFrame(loop)
  const dt = Math.min((now - lastFrame) / 1000, 0.05)
  lastFrame = now
  const t = now / 1000

  state.clock += dt / 6
  if (state.clock >= 24 * 60) state.clock -= 24 * 60

  if (state.mode === 'tour'){
    camAt(state.p)
    camera.position.copy(camPos)
    camera.lookAt(camLook)
  }

  gradePass.uniforms.time.value = t
  scene.fog.density = 0.008 + (state.p > 0.72 ? 0.006 : 0)

  /* city life */
  if (!REDUCED){
    const sp = 21
    const rp = rainGeo.attributes.position
    for (let i = 0; i < rainCount; i++){
      let y = rp.getY(i) - sp * dt
      if (y < 0) y += 26
      rp.setY(i, y)
    }
    rp.needsUpdate = true
  }
  rain.rotation.z = 0.03

  state.trafficT += dt
  const ph = state.trafficT % 13
  state.light = ph < 7 ? 'green' : ph < 8.5 ? 'yellow' : 'red'
  trafficLight.r.material.color.setHex(state.light === 'red' ? 0xc04a3c : 0x3d1a16)
  trafficLight.y.material.color.setHex(state.light === 'yellow' ? 0xd8b04a : 0x453a1e)
  trafficLight.g.material.color.setHex(state.light === 'green' ? 0x4a8a63 : 0x1e3226)

  cars.forEach(c => {
    const u = c.userData
    let nz = c.position.z + u.dir * u.speed * 0.55 * dt
    if (state.light !== 'green'){
      if (u.dir < 0 && c.position.z > -44 && nz <= -44) nz = -44
      if (u.dir > 0 && c.position.z < -56 && nz >= -56) nz = -56
    }
    if (nz < -124) nz = 12
    if (nz > 12) nz = -124
    c.position.z = nz
  })

  peds.forEach(p => {
    const u = p.userData
    const pace = (u.zone.x && Math.abs(p.position.z + 50) < 12) ? (state.light === 'red' ? 0.75 : 0.25) : 1
    p.position.x += u.dir * u.speed * 0.5 * pace * dt
    if (p.position.x > u.zone.x[1]) { p.position.x = u.zone.x[1]; u.dir = -1 }
    if (p.position.x < u.zone.x[0]) { p.position.x = u.zone.x[0]; u.dir = 1 }
    p.rotation.y = u.dir > 0 ? Math.PI / 2 : -Math.PI / 2
    if (!REDUCED) p.position.y = Math.abs(Math.sin((t + u.bob) * 5)) * 0.03
    if (u.umbrella) u.umbrella.rotation.z = Math.sin(t * 1.4 + u.bob) * 0.03
  })

  PEOPLE.forEach(q => {
    if (!q.mesh) return
    const u = q.mesh.userData
    if (!REDUCED){
      u.sway += dt
      u.head.position.y = 1.76 + Math.sin(u.sway * 0.8) * 0.008
      u.ring.material.opacity = u.near ? 0.4 + Math.sin(t * 1.6) * 0.08 : 0.16
    } else {
      u.ring.material.opacity = u.near ? 0.34 : 0.16
    }
  })

  signs.forEach(s => {
    if (s.userData.flickerT > 0){
      s.userData.flickerT -= dt
      s.material.opacity = Math.random() < 0.25 ? 0.3 : s.userData.baseOpacity
    } else {
      s.material.opacity = lerp(s.material.opacity, s.userData.baseOpacity, 0.08)
    }
  })

  lanterns.forEach(l => { l.material.opacity = 0.78 + Math.sin(t * 7 + l.userData.phase) * 0.12 })

  vendingMachines.forEach(g => {
    const u = g.userData
    u.lit = lerp(u.lit, 0.55, 0.04)
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
    if (Math.abs(cat.position.x) > 7){ cat.visible = false; catHit.visible = false }
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

  composer.render()
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