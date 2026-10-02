
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

const state = {
  mode:'hero', p:0, secrets:0, cityFound:false,
  mapOpen:false, roofT:0, roofF:0, gameClock: 23*60+47, trafficT:0, light:'green',
  finalShown:false, chimed:false, transT:0, discFound:0, zone:'', near:null, trainHere:false
}
const player = { x:0, z:6, yaw:0, pitch:0, vx:0, vz:0, bob:0, speedTarget:0 }
const keys = {}
const discoveries = { ramen:false, vending:false, rooftop:false, shrine:false, train:false }

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
const cursorEl = $('cursor'), cursorLabel = $('cursor-label')
let cursorState = 'default'
function setCursor(state, label=''){
  cursorState = state
  cursorEl.className = state==='default' ? '' : state
  cursorLabel.textContent = label
}
const cursorPos = { x: innerWidth/2, y: innerHeight/2 }
const cursorTarget = { x: innerWidth/2, y: innerHeight/2 }
window.addEventListener('pointermove', e=>{
  cursorTarget.x = e.clientX; cursorTarget.y = e.clientY
  pointerPx.x = e.clientX; pointerPx.y = e.clientY
  pointer.x = (e.clientX/innerWidth)*2 - 1
  pointer.y = -(e.clientY/innerHeight)*2 + 1
})
window.addEventListener('pointerdown', e=>{
  const r = document.createElement('div')
  r.className = 'ripple'
  r.style.left = (e.clientX-3)+'px'
  r.style.top = (e.clientY-3)+'px'
  document.body.appendChild(r)
  setTimeout(()=>r.remove(), 600)
  if(soundOn) blip()
})

const camPos = new THREE.Vector3()
const camLook = new THREE.Vector3()

const mapScene = new THREE.Scene()
mapScene.background = new THREE.Color(0x04060b)
const mapCamera = new THREE.PerspectiveCamera(40, innerWidth/innerHeight, 0.1, 300)
mapCamera.position.set(0, 24, 20)
const mapGroup = new THREE.Group()
mapGroup.rotation.x = -0.42
mapScene.add(mapGroup)

const HOODS = {
  shibuya:  { name:'SHIBUYA',  vibe:'FAST / LOUD / ELECTRIC',    time:'20:00', desc:'Where thousands of people cross paths without ever meeting. Look up. Look around. Then disappear into one of the streets behind the crossing.', dontmiss:'THE STREETS BEHIND THE CROWD', prompt:'FIND YOUR WAY THROUGH →', z:-50, cx:560, cy:520, color:'#ff2e88' },
  shinjuku: { name:'SHINJUKU', vibe:'DENSE / RESTLESS / ENDLESS',time:'21:00', desc:'Skyscrapers above. Tiny bars below. The city feels impossibly large until you turn down the right alley. Then suddenly, you\'re somewhere completely different.', dontmiss:'GOLDEN GAI', prompt:'GO DEEPER →', z:-10, cx:500, cy:380, color:'#ff5a36' },
  asakusa:  { name:'ASAKUSA',  vibe:'OLD / QUIET / TIMELESS',    time:'18:00', desc:'Tokyo slows down here. Old streets meet a city that never really stopped moving. Walk without a destination. You\'ll find something.', dontmiss:'THE SIDE STREETS', prompt:'TAKE THE LONG WAY →', z:-82, cx:700, cy:420, color:'#ffb36b' },
  akihabara:{ name:'AKIHABARA',vibe:'LOUD / PLAYFUL / DIGITAL',  time:'19:00', desc:'Screens everywhere. Arcades humming. Machines making sounds you don\'t recognize. Stay long enough and the line between the physical and digital starts to disappear.', dontmiss:'THE ARCADES', prompt:'PRESS START →', z:-95, cx:590, cy:450, color:'#00d4c8' },
  harajuku: { name:'HARAJUKU', vibe:'YOUNG / CREATIVE / UNPREDICTABLE', time:'17:00', desc:'Where fashion, music, street culture and strange ideas collide. Come curious. Leave with something you didn\'t expect.', dontmiss:'THE SIDE STREETS', prompt:'EXPLORE →', z:-62, cx:430, cy:500, color:'#ffe95a' },
  ginza:    { name:'GINZA',    vibe:'LUXURY GLOW',               time:'21:00', desc:'Neon reflected on wide avenues. Galleries, department stores and rooftop bars above the crowd. The quieter side of the city, after dark.', dontmiss:'THE ROOFTOP BARS', prompt:'EXPLORE →', z:-34, cx:560, cy:580, color:'#7fd4ff' },
  shimokita:{ name:'SHIMOKITAZAWA', vibe:'INDIE / CREATIVE / SLOW', time:'16:00', desc:'Vintage clothes. Tiny venues. Record stores. Coffee shops. A slower rhythm hiding inside one of the world\'s fastest cities.', dontmiss:'THE RECORD STORES', prompt:'GET LOST →', z:-74, cx:370, cy:470, color:'#ff9ecf' }
}
const mapMarkers = []
function buildMap(){
  const { tex } = canvasTex(1024, 1024, (ctx)=>{
    ctx.fillStyle = '#070a12'; ctx.fillRect(0,0,1024,1024)
    ctx.strokeStyle = '#0d1b2a'; ctx.lineWidth = 90
    ctx.beginPath(); ctx.moveTo(-50, 300); ctx.bezierCurveTo(300, 380, 600, 250, 1100, 420); ctx.stroke()
    ctx.fillStyle = '#0c1a14'
    ctx.fillRect(120, 120, 180, 140); ctx.fillRect(760, 640, 200, 160)
    ctx.strokeStyle = '#161e2e'; ctx.lineWidth = 3
    for(let i=0;i<24;i++){ ctx.beginPath(); ctx.moveTo(i*44, 0); ctx.lineTo(i*44, 1024); ctx.stroke() }
    for(let i=0;i<24;i++){ ctx.beginPath(); ctx.moveTo(0, i*44); ctx.lineTo(1024, i*44); ctx.stroke() }
    ctx.strokeStyle = '#28334e'; ctx.lineWidth = 7
    for(let i=0;i<6;i++){ ctx.beginPath(); ctx.moveTo(0, 100+i*170); ctx.lineTo(1024, 140+i*160); ctx.stroke() }
    ctx.strokeStyle = '#ff2e88'; ctx.lineWidth = 5
    ctx.beginPath(); ctx.moveTo(380, 380); ctx.lineTo(500, 420); ctx.lineTo(560, 520); ctx.lineTo(590, 450); ctx.lineTo(700, 420); ctx.stroke()
    Object.values(HOODS).forEach(h=>{
      ctx.shadowColor = h.color; ctx.shadowBlur = 26
      ctx.fillStyle = h.color
      ctx.beginPath(); ctx.arc(h.cx, h.cy, 9, 0, Math.PI*2); ctx.fill()
      ctx.shadowBlur = 0
      ctx.fillStyle = '#e8e6df'; ctx.font = 'bold 26px "Space Mono", monospace'; ctx.textAlign = 'center'
      ctx.fillText(h.name, h.cx, h.cy - 22)
    })
  })
  const mapPlane = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshBasicMaterial({ map: tex }))
  mapPlane.rotation.x = -Math.PI/2
  mapGroup.add(mapPlane)
  Object.entries(HOODS).forEach(([id, h])=>{
    const wx = (h.cx/1024 - 0.5)*70
    const wz = (h.cy/1024 - 0.5)*70
    const marker = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 0.25, 20),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(h.color) })
    )
    marker.position.set(wx, 0.15, wz)
    marker.userData = { type:'hood', id, baseScale:1 }
    mapGroup.add(marker)
    mapMarkers.push(marker)
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 3, 8), new THREE.MeshBasicMaterial({ visible:false }))
    hit.position.set(wx, 1, wz)
    hit.userData = { type:'hood', id, ref: marker }
    mapGroup.add(hit)
    mapMarkers.push(hit)
  })
}
buildMap()

let toastTimer = null
function toast(msg, dur=3200){
  const t = $('toast')
  t.textContent = msg
  t.classList.add('on')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(()=>t.classList.remove('on'), dur)
}

const DISCOVERY_TARGETS = { ramen:'HIDDEN RAMEN ALLEY', vending:'THE VENDING MACHINE', rooftop:'THE ROOFTOP', shrine:'THE TINY SHRINE', train:'THE LAST TRAIN' }
function markDiscovery(key){
  if(!(key in discoveries) || discoveries[key] === true) return
  discoveries[key] = true
  state.secrets = Object.keys(discoveries).filter(k=>discoveries[k]).length
  const d = $('hud-disc')
  d.textContent = 'DISCOVERIES ' + state.secrets + '/5'
  d.style.color = 'var(--yellow)'
  setTimeout(()=>{ d.style.color = '' }, 1200)
  const navDisc = $('discoveries')
  navDisc.textContent = 'TOKYO DISCOVERIES ' + state.secrets + '/5'
  navDisc.classList.add('pulse')
  setTimeout(()=>navDisc.classList.remove('pulse'), 1200)
  const msgs = { 1:'ONE DOWN. FOUR TO GO.', 3:"YOU'RE STARTING TO NOTICE THINGS.", 4:'ONE MORE.', 5:'YOU FOUND THE CITY.' }
  toast(msgs[state.secrets] || ('DISCOVERY FOUND — ' + DISCOVERY_TARGETS[key]), 3600)
  if(soundOn) chime()
  if(state.secrets >= 5) unlockCity()
}
function unlockCity(){
  state.cityFound = true
  const f = $('found')
  f.classList.add('on')
  setTimeout(()=>f.classList.remove('on'), 3400)
  setTimeout(()=>toast('SECRET ROOFTOP UNLOCKED — SOME PLACES AREN\'T ON THE MAP.', 5000), 3200)
  setTimeout(()=>{ $('final').classList.add('on'); state.finalShown = true }, 4200)
}

const hoverables = []
city.traverse(o=>{ if(o.userData && o.userData.type && o.userData.type!=='sign') hoverables.push(o) })
const signMeshes = signs

let hovered = null
let hoveredSign = null
function updateHover(){
  if(state.mapOpen){
    raycaster.setFromCamera(pointer, mapCamera)
    const hits = raycaster.intersectObjects(mapMarkers.filter(m=>m.userData.type==='hood'))
    const tt = $('map-tooltip')
    if(hits.length){
      const id = hits[0].object.userData.id
      const h = HOODS[id]
      tt.textContent = h.name + ' — ' + h.vibe
      tt.style.opacity = 1
      tt.style.left = (cursorTarget.x+18)+'px'
      tt.style.top = (cursorTarget.y+14)+'px'
      setCursor('big', 'GO')
    } else {
      tt.style.opacity = 0
      setCursor('default')
    }
    return
  }
  setCursor('default')
}
window.addEventListener('pointermove', updateHover)

window.addEventListener('pointerdown', e=>{
  if(state.mapOpen) return
  if(state.mode === 'street'){
    if(!IS_TOUCH && document.pointerLockElement !== document.getElementById('scene')){
      document.getElementById('scene').requestPointerLock()
    } else {
      tryInteract()
    }
  }
  if(state.mode === 'hero'){
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(puddles, false)
    if(hits.length){ spawnRipple(hits[0].point.x, hits[0].point.z); if(soundOn) drip() }
  }
})

const cans = []
const canGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8)
function spawnCan(g){
  const can = new THREE.Mesh(canGeo, new THREE.MeshBasicMaterial({ color: [0xff5a36,0x00d4c8,0xffe95a,0xff2e88][Math.floor(Math.random()*4)] }))
  can.position.copy(g.position)
  can.position.y = 1.2
  can.position.z += 0.5
  can.userData = { vy: 0, life: 4 }
  city.add(can)
  cans.push(can)
}

const arcadeCv = $('arcade-canvas')
const actx = arcadeCv.getContext('2d')
let arcadeOn = false, arcadeTargets = [], arcadeScore = 0, arcadeTime = 10, arcadeLast = 0, arcadeSpawn = 0
function openArcade(){
  arcadeOn = true
  arcadeTargets = []; arcadeScore = 0; arcadeTime = 10; arcadeLast = performance.now(); arcadeSpawn = 0
  $('arcade').classList.add('on')
  $('arcade-score').textContent = 'SCORE 0'
  $('arcade-end').textContent = ''
}
function closeArcade(){ arcadeOn = false; $('arcade').classList.remove('on') }
$('arcade-exit').addEventListener('click', closeArcade)
arcadeCv.addEventListener('pointerdown', e=>{
  const r = arcadeCv.getBoundingClientRect()
  const x = (e.clientX - r.left) * (arcadeCv.width / r.width)
  const y = (e.clientY - r.top) * (arcadeCv.height / r.height)
  for(let i=arcadeTargets.length-1;i>=0;i--){
    const t = arcadeTargets[i]
    if(Math.hypot(x-t.x, y-t.y) < t.r){
      arcadeTargets.splice(i,1)
      arcadeScore++
      $('arcade-score').textContent = 'SCORE ' + arcadeScore
    }
  }
})
function drawArcade(dt){
  const now = performance.now()
  const gdt = (now - arcadeLast)/1000
  arcadeLast = now
  arcadeTime -= gdt
  arcadeSpawn -= gdt
  if(arcadeSpawn <= 0 && arcadeTime > 0){
    arcadeSpawn = 0.55
    arcadeTargets.push({ x: 40+Math.random()*(arcadeCv.width-80), y: 40+Math.random()*(arcadeCv.height-80), r: 26, life: 1 })
  }
  actx.fillStyle = '#02040a'
  actx.fillRect(0,0,arcadeCv.width, arcadeCv.height)
  arcadeTargets.forEach(t=>{
    t.life -= gdt*0.7
    actx.globalAlpha = clamp(t.life, 0, 1)
    actx.fillStyle = t.life > 0.5 ? '#00d4c8' : '#ff2e88'
    actx.beginPath(); actx.arc(t.x, t.y, t.r*t.life, 0, Math.PI*2); actx.fill()
    actx.globalAlpha = 1
  })
  arcadeTargets = arcadeTargets.filter(t=>t.life > 0)
  $('arcade-time').textContent = Math.max(0, Math.ceil(arcadeTime))
  if(arcadeTime <= 0){
    $('arcade-end').textContent = 'FINAL SCORE ' + arcadeScore + ' — THE MACHINE REMEMBERS'
    arcadeTargets = []
  }
  actx.strokeStyle = 'rgba(232,230,223,.2)'
  actx.strokeRect(4,4,arcadeCv.width-8, arcadeCv.height-8)
}

let soundOn = false, audioCtx = null, masterGain = null
function initAudio(){
  audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  masterGain = audioCtx.createGain()
  masterGain.gain.value = 0
  masterGain.connect(audioCtx.destination)
  const len = audioCtx.sampleRate * 2
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate)
  const data = buf.getChannelData(0)
  for(let i=0;i<len;i++) data[i] = Math.random()*2 - 1
  const noise = audioCtx.createBufferSource()
  noise.buffer = buf; noise.loop = true
  const rainFilter = audioCtx.createBiquadFilter()
  rainFilter.type = 'bandpass'; rainFilter.frequency.value = 900; rainFilter.Q.value = 0.6
  const rainGain = audioCtx.createGain(); rainGain.gain.value = 0.05
  noise.connect(rainFilter); rainFilter.connect(rainGain); rainGain.connect(masterGain)
  noise.start()
  const hum = audioCtx.createBufferSource()
  const buf2 = audioCtx.createBuffer(1, len, audioCtx.sampleRate)
  const d2 = buf2.getChannelData(0)
  let last = 0
  for(let i=0;i<len;i++){ const w = Math.random()*2-1; last = (last + 0.02*w)/1.02; d2[i] = last*3 }
  hum.buffer = buf2; hum.loop = true
  const humFilter = audioCtx.createBiquadFilter()
  humFilter.type = 'lowpass'; humFilter.frequency.value = 180
  const humGain = audioCtx.createGain(); humGain.gain.value = 0.12
  hum.connect(humFilter); humFilter.connect(humGain); humGain.connect(masterGain)
  hum.start()
  const humOsc = audioCtx.createOscillator()
  humOsc.type = 'sine'; humOsc.frequency.value = 48
  const humOscGain = audioCtx.createGain(); humOscGain.gain.value = 0.02
  humOsc.connect(humOscGain); humOscGain.connect(masterGain)
  humOsc.start()
}
function blip(){
  if(!audioCtx) return
  const o = audioCtx.createOscillator(); const g = audioCtx.createGain()
  o.type = 'sine'; o.frequency.value = 620
  g.gain.setValueAtTime(0.06, audioCtx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.12)
  o.connect(g); g.connect(masterGain)
  o.start(); o.stop(audioCtx.currentTime + 0.13)
}
function drip(){
  if(!audioCtx) return
  const o = audioCtx.createOscillator(); const g = audioCtx.createGain()
  o.type = 'sine'; o.frequency.setValueAtTime(900, audioCtx.currentTime)
  o.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.2)
  g.gain.setValueAtTime(0.08, audioCtx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25)
  o.connect(g); g.connect(masterGain)
  o.start(); o.stop(audioCtx.currentTime + 0.26)
}
function chime(){
  if(!audioCtx) return
  [880, 659].forEach((f, i)=>{
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain()
    o.type = 'sine'; o.frequency.value = f
    const t0 = audioCtx.currentTime + i*0.18
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5)
    o.connect(g); g.connect(masterGain)
    o.start(t0); o.stop(t0 + 0.55)
  })
}
$('sound-toggle').addEventListener('click', ()=>{
  if(!audioCtx) initAudio()
  soundOn = !soundOn
  if(audioCtx.state === 'suspended') audioCtx.resume()
  masterGain.gain.linearRampToValueAtTime(soundOn ? 0.5 : 0, audioCtx.currentTime + 0.6)
  $('sound-toggle').textContent = soundOn ? 'SOUND ON' : 'SOUND OFF'
})

const enterBtn = $('enter-btn')
let magX = 0, magY = 0
enterBtn.addEventListener('click', enterCity)
function enterCity(){
  if(state.mode !== 'hero') return
  state.mode = 'street'
  $('hero').classList.add('off')
  $('hud').classList.add('on')
  $('zone-label').classList.add('on')
  $('hint').classList.add('on')
  $('cross').classList.add('on')
  document.body.style.height = '100vh'
  document.body.style.overflow = 'hidden'
  trans = { t:0, fromPos: camera.position.clone(), fromLook: currentLook.clone() }
  $('intro').classList.add('on')
  setTimeout(()=>$('intro').classList.remove('on'), 5500)
  toast('WASD TO WALK — E TO INTERACT — M FOR MAP', 5000)
  if(IS_TOUCH) document.body.classList.add('mob')
}

const INTERACTS = [
  { x: 2.2, z: -68, r: 3, label:'RAMEN — LOOK INSIDE', type:'ramen' },
  { x: 3.4, z: -66, r: 2.5, label:'VENDING — PRESS BUTTON', type:'vending' },
  { x: -3.6, z: -71, r: 2.5, label:'VENDING — PRESS BUTTON', type:'vending' },
  { x: 3.2, z: -74, r: 2.5, label:'VENDING — PRESS BUTTON', type:'vending' },
  { x: -3.4, z: -92, r: 2.5, label:'VENDING — PRESS BUTTON', type:'vending' },
  { x: 3.5, z: -95, r: 2.5, label:'VENDING — PRESS BUTTON', type:'vending' },
  { x: -2.2, z: -94, r: 3, label:'ARCADE — PLAY', type:'arcade' },
  { x: 1.6, z: -96, r: 2.5, label:'CLAW MACHINE', type:'claw' },
  { x: 1.9, z: -70, r: 2.5, label:'STRAY CAT', type:'cat' },
  { x: -6.5, z: -72.5, r: 2.5, label:'OLD DOOR', type:'door' },
  { x: 10.9, z: -95, r: 2.5, label:'RED SUN MARK', type:'symbol' },
  { x: -2.9, z: -77, r: 2.5, label:'TINY SHRINE', type:'shrine' },
  { x: 0, z: -106, r: 3.5, label:'ROOFTOP GATE', type:'rooftop' }
]
const hintEl = $('hint')
const joy = { active:false, x:0, y:0 }
const joyEl = $('joy'), joyKnob = $('joy-knob')
let joyTouch = null
joyEl.addEventListener('pointerdown', e=>{ joyTouch = e.pointerId; joyEl.setPointerCapture(e.pointerId) })
joyEl.addEventListener('pointermove', e=>{
  if(e.pointerId !== joyTouch) return
  const r = joyEl.getBoundingClientRect()
  const cx = r.left + r.width/2, cy = r.top + r.height/2
  let dx = (e.clientX - cx)/(r.width/2), dy = (e.clientY - cy)/(r.height/2)
  const L = Math.hypot(dx, dy)
  if(L > 1){ dx/=L; dy/=L }
  joy.x = dx; joy.y = dy
  joy.active = true
  joyKnob.style.transform = 'translate(calc(-50% + ' + (dx*30) + 'px), calc(-50% + ' + (dy*30) + 'px))'
})
joyEl.addEventListener('pointerup', e=>{
  if(e.pointerId !== joyTouch) return
  joyTouch = null; joy.x = 0; joy.y = 0; joy.active = false
  joyKnob.style.transform = 'translate(-50%,-50%)'
})
$('btn-e').addEventListener('click', tryInteract)
$('btn-m').addEventListener('click', ()=>{ state.mapOpen ? closeMap() : openMap() })
$('ramen-close').addEventListener('click', ()=>$('ramen-menu').classList.remove('on'))

function tryInteract(){
  if(!state.near) return
  const t = state.near.type
  if(t === 'vending'){
    let best = null, bd = 1e9
    vendingMachines.forEach(g=>{
      const d = Math.hypot(player.x - g.position.x, player.z - g.position.z)
      if(d < bd){ bd = d; best = g }
    })
    if(best){
      spawnCan(best)
      best.userData.clicks++
      if(best.userData.secret && best.userData.clicks === 3){
        toast('IT DISPENSES A NOTE: "THE CITY IS WATCHING"', 4200)
      }
      markDiscovery('vending')
    }
  }
  else if(t === 'ramen'){
    $('ramen-menu').classList.add('on')
    markDiscovery('ramen')
  }
  else if(t === 'arcade'){ openArcade() }
  else if(t === 'claw'){ claw.userData.dropT = 1.4; toast('THE CLAW DROPS... ALMOST') }
  else if(t === 'cat'){
    if(!cat.userData.running){
      cat.userData.running = true
      cat.userData.speed = 5.5
      cat.userData.dir = cat.position.x > 0 ? 1 : -1
      toast('THE STRAY OF GOLDEN GAI')
    }
  }
  else if(t === 'door'){
    if(!doorPanel.userData.open){ doorPanel.userData.open = true; toast('THE DOOR THAT IS NOT THERE') }
  }
  else if(t === 'symbol'){ toast('THE RED SUN MARK — HIDDEN ROOFTOP UNLOCKED') }
  else if(t === 'shrine'){ markDiscovery('shrine'); toast('THE TINY SHRINE') }
  else if(t === 'rooftop'){
    markDiscovery('rooftop')
    state.roofT = 0.001
  }
  else if(t === 'train'){
    if(state.trainHere){ markDiscovery('train'); toast('YOU CAUGHT THE LAST TRAIN'); if(soundOn) chime() }
  }
}

function fastTravel(id){
  const h = HOODS[id]
  closeMap()
  $('fade').classList.add('on')
  setTimeout(()=>{
    player.x = 0
    player.z = h.z
    player.yaw = 0
    player.pitch = 0
    $('fade').classList.remove('on')
    $('map-name').textContent = h.name
    $('map-vibe').textContent = h.vibe
    $('map-time').textContent = h.time
    $('map-desc').textContent = h.desc
    $('map-dontmiss').textContent = h.dontmiss
    $('map-go').textContent = 'NAVIGATE →'
    $('map-panel').classList.add('on')
  }, 500)
}
function openMap(){
  if(state.mapOpen) return
  state.mapOpen = true
  document.body.style.height = '100vh'
  document.body.style.overflow = 'hidden'
  $('map-heading').classList.add('on')
  toast('DRAG TO ROTATE — CLICK A NEIGHBORHOOD')
}
function closeMap(){
  if(!state.mapOpen) return
  state.mapOpen = false
  document.body.style.height = ''
  document.body.style.overflow = ''
  $('map-panel').classList.remove('on')
  $('map-heading').classList.remove('on')
  $('map-tooltip').style.opacity = 0
}
document.querySelectorAll('[data-nav]').forEach(b=>{
  b.addEventListener('click', ()=>{
    const n = b.dataset.nav
    if(n==='explore'){ closeMap(); window.scrollTo({ top: 0, behavior: 'smooth' }) }
    if(n==='map'){ state.mapOpen ? closeMap() : openMap() }
    if(n==='about'){ $('about').classList.toggle('on') }
  })
})
$('map-close').addEventListener('click', ()=>$('map-panel').classList.remove('on'))
$('about-close').addEventListener('click', ()=>$('about').classList.remove('on'))
$('map-go').addEventListener('click', ()=>{ $('map-panel').classList.remove('on') })
$('new-place').addEventListener('click', ()=>{ $('final').classList.remove('on'); state.finalShown = false; openMap() })

$('again').addEventListener('click', ()=>{ $('final').classList.remove('on'); state.finalShown = false; player.x = 0; player.z = 6; player.yaw = 0; player.pitch = 0 })
$('another').addEventListener('click', ()=>{
  $('final').classList.remove('on'); state.finalShown = false
  state.mode = 'hero'
  document.body.style.height = '100vh'; document.body.style.overflow = 'hidden'
  $('hud').classList.remove('on'); $('zone-label').classList.remove('on'); $('hint').classList.remove('on'); $('cross').classList.remove('on')
  $('hero').classList.remove('off')
  player.x = 0; player.z = 6; player.yaw = 0; player.pitch = 0
})

document.addEventListener('mousemove', e=>{
  if(document.pointerLockElement === document.getElementById('scene')){
    player.yaw -= e.movementX * 0.0023
    player.pitch = clamp(player.pitch - e.movementY * 0.0023, -0.5, 0.5)
  }
})
window.addEventListener('keydown', e=>{
  keys[e.code] = true
  if(e.code === 'KeyE' || e.code === 'Space'){ e.preventDefault(); tryInteract() }
  if(e.code === 'KeyM'){ state.mapOpen ? closeMap() : openMap() }
  if(e.code === 'Escape'){
    if(arcadeOn) closeArcade()
    else if(state.mapOpen) closeMap()
    $('about').classList.remove('on')
    $('ramen-menu').classList.remove('on')
  }
  if(e.code === 'KeyS' && state.mode !== 'hero') $('sound-toggle').click()
})
window.addEventListener('keyup', e=>{ keys[e.code] = false })

const tlGroup = new THREE.Group()
const tlPole = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,5), new THREE.MeshBasicMaterial({color:0x232833}))
tlPole.position.y = 2.5
const tlHead = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.1, 0.3), new THREE.MeshBasicMaterial({ color: 0x0c1018 }))
tlHead.position.set(0, 5, 0)
tlGroup.add(tlPole, tlHead)
const llGeo = new THREE.CircleGeometry(0.11, 12)
const tlR = new THREE.Mesh(llGeo, new THREE.MeshBasicMaterial({ color: 0xff3b30 }))
tlR.position.set(0, 5.3, 0.16)
const tlY = new THREE.Mesh(llGeo, new THREE.MeshBasicMaterial({ color: 0x554400 }))
tlY.position.set(0, 5.0, 0.16)
const tlG = new THREE.Mesh(llGeo, new THREE.MeshBasicMaterial({ color: 0x0f3d33 }))
tlG.position.set(0, 4.7, 0.16)
tlGroup.add(tlR, tlY, tlG)
tlGroup.position.set(-7.8, 0, -46)
city.add(tlGroup)

const toriiMat = new THREE.MeshBasicMaterial({ color: 0xb03a2e })
const torii = new THREE.Group()
const pil1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), toriiMat); pil1.position.set(-0.8, 1.1, 0)
const pil2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), toriiMat); pil2.position.set(0.8, 1.1, 0)
const top = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.22, 0.26), toriiMat); top.position.set(0, 2.25, 0)
const top2 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.22), toriiMat); top2.position.set(0, 1.85, 0)
torii.add(pil1, pil2, top, top2)
torii.position.set(-2.9, 0, -77)
city.add(torii)

const gateMat = new THREE.MeshBasicMaterial({ color: 0x101623 })
const gate = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.6, 0.5), gateMat)
gate.position.set(0, 1.8, -104)
city.add(gate)
const gateGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.2), new THREE.MeshBasicMaterial({ color: 0x001416 }))
gateGlow.position.set(0, 1.6, -103.7)
city.add(gateGlow)
addSign('ROOFTOP', '#00d4c8', 0, 3.4, -103.5, 1.2)

peds.forEach(p=>{
  if(Math.random() < 0.5){
    const um = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.35, 8), new THREE.MeshBasicMaterial({ color: 0x1a2030 }))
    um.position.y = 1.55
    p.add(um)
  }
})

let miniRedraw = 0
let lastFrame = performance.now()
function loop(now){
  requestAnimationFrame(loop)
  const dt = Math.min((now - lastFrame)/1000, 0.05)
  lastFrame = now
  const t = now/1000

  const k = 1 - Math.pow(0.001, dt)
  vibe.rain = lerp(vibe.rain, vibeTarget.rain, k)
  vibe.traffic = lerp(vibe.traffic, vibeTarget.traffic, k)
  vibe.fog = lerp(vibe.fog, vibeTarget.fog, k)
  vibe.signSpeed = lerp(vibe.signSpeed, vibeTarget.signSpeed, k)
  vibe.bloom = lerp(vibe.bloom, vibeTarget.bloom, k)
  vibe.crowd = lerp(vibe.crowd, vibeTarget.crowd, k)
  vibe.sway = lerp(vibe.sway, vibeTarget.sway, k)
  vibe.steam = lerp(vibe.steam, vibeTarget.steam, k)
  scene.fog.density = vibe.fog
  if(!IS_TOUCH) bloom.strength = vibe.bloom
  gradePass.uniforms.time.value = t

  if(state.mode === 'hero'){
    const push = REDUCED ? 0 : smooth(clamp(t/30, 0, 1)) * 2
    camPos.set(pointer.x*1.6, 2.3+pointer.y*0.7, 12 - push)
    camLook.set(pointer.x*2, 2.2, -20)
    camera.position.copy(camPos)
    camera.lookAt(camLook)
    currentLook.copy(camLook)
    $('hero-title').style.transform = 'translate(' + (-pointer.x*16) + 'px,' + (-pointer.y*10) + 'px)'
  }
  else if(state.mode === 'street'){
    let ix = 0, iz = 0
    if(keys['KeyW'] || keys['ArrowUp']) iz -= 1
    if(keys['KeyS'] || keys['ArrowDown']) iz += 1
    if(keys['KeyA'] || keys['ArrowLeft']) ix -= 1
    if(keys['KeyD'] || keys['ArrowRight']) ix += 1
    if(joy.active){ ix += joy.x; iz += joy.y }
    let inF = -iz, inS = ix
    const F = { x:-Math.sin(player.yaw), z:-Math.cos(player.yaw) }
    const R = { x: Math.cos(player.yaw), z:-Math.sin(player.yaw) }
    let vx = F.x*inF + R.x*inS
    let vz = F.z*inF + R.z*inS
    const L = Math.hypot(vx, vz)
    if(L > 0){ vx/=L; vz/=L }
    const maxSpeed = state.roofT > 0 || trans ? 0 : 5.2
    const k2 = 1 - Math.pow(0.001, dt)
    player.vx = lerp(player.vx, vx*maxSpeed, k2)
    player.vz = lerp(player.vz, vz*maxSpeed, k2)
    player.x = clamp(player.x + player.vx*dt, -7.5, 7.5)
    player.z = clamp(player.z + player.vz*dt, -108, 8)
    player.bob += Math.hypot(player.vx, player.vz) * dt * 1.7

    const eyeY = 1.7 + (REDUCED ? 0 : Math.sin(player.bob)*0.05)
    const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw), cp = Math.cos(player.pitch)
    camPos.set(player.x, eyeY, player.z)
    camLook.set(player.x - sy*cp*10, eyeY + Math.sin(player.pitch)*10, player.z - cy*cp*10)

    if(state.roofT > 0){
      state.roofT += dt
      let f
      if(state.roofT < 1) f = smooth(clamp(state.roofT, 0, 1))
      else if(state.roofT < 3.5) f = 1
      else if(state.roofT < 4.5) f = 1 - smooth(clamp(state.roofT - 3.5, 0, 1))
      else { state.roofT = 0; f = 0 }
      if(state.roofT > 0){
        camPos.lerpVectors(new THREE.Vector3(player.x, eyeY, player.z), new THREE.Vector3(0, 26, -92), f)
        camLook.lerpVectors(new THREE.Vector3(player.x - sy*cp*10, eyeY + Math.sin(player.pitch)*10, player.z - cy*cp*10), new THREE.Vector3(0, 6, -180), f)
      }
      camera.fov = lerp(camera.fov, 70, 0.05); camera.updateProjectionMatrix()
    } else {
      camera.fov = lerp(camera.fov, 50, 0.08); camera.updateProjectionMatrix()
    }

    state.gameClock += dt / 5
    if(state.gameClock >= 1440) state.gameClock -= 1440
    const hh = String(Math.floor(state.gameClock/60)%24).padStart(2,'0')
    const mm = String(Math.floor(state.gameClock%60)).padStart(2,'0')
    $('hud-time').textContent = 'TOKYO / ' + hh + ':' + mm

    const zone = player.z > -26 ? 'SHINJUKU STATION' : player.z > -44 ? 'AVENUE' : player.z > -60 ? 'SHIBUYA' : player.z > -84 ? 'BACK ALLEY' : player.z > -104 ? 'AKIHABARA' : 'SKYWARD'
    if(zone !== state.zone){ state.zone = zone; const zl = $('zone-label'); zl.textContent = zone; zl.classList.add('on') }

    let nearest = null, nd = 2.6
    for(const it of INTERACTS){
      const d = Math.hypot(player.x - it.x, player.z - it.z)
      if(d < (it.r || 2.6) && d < nd){ nd = d; nearest = it }
    }
    if(nearest){
      hintEl.textContent = (IS_TOUCH ? 'TAP E — ' : 'E — ') + nearest.label
    } else {
      hintEl.textContent = IS_TOUCH ? 'DRAG RIGHT SIDE TO LOOK · JOYSTICK TO WALK' : 'WASD MOVE · E INTERACT · M MAP'
    }
    state.near = nearest

    state.trafficT += dt
    const ph = state.trafficT % 13
    state.light = ph < 7 ? 'green' : ph < 8.5 ? 'yellow' : 'red'
    tlR.material.color.setHex(state.light === 'red' ? 0xff3b30 : 0x3a1512)
    tlY.material.color.setHex(state.light === 'yellow' ? 0xffd60a : 0x3a330f)
    tlG.material.color.setHex(state.light === 'green' ? 0x30d158 : 0x0f3d24)

    const cyc = t % 26
    if(cyc < 3){ train.position.set(-14, 0, lerp(-70, -14, easeOut(cyc/3))) }
    else if(cyc < 10){ train.position.set(-14, 0, -14) }
    else if(cyc < 13){ train.position.set(-14, 0, lerp(-14, -90, (cyc-10)/3)) }
    else { train.position.set(-14, 0, -999) }
    state.trainHere = cyc >= 2.5 && cyc < 10
    trainHit.position.copy(train.position); trainHit.position.y = 1.6
    trainWinMat.opacity = lerp(trainWinMat.opacity, state.trainHere ? 0.95 : 0.35, 0.06)

    const spd = Math.hypot(player.vx, player.vz)
    streakMat.opacity = state.roofT > 0 ? 0.2 : clamp(spd/5.2, 0, 1) * 0.18
    if(streakMat.opacity > 0.01){
      for(let i=0;i<streakCount;i++){
        streakPos[i*3+2] += streakSeed[i] * dt * (0.5 + spd*0.3)
        if(streakPos[i*3+2] > 6) streakPos[i*3+2] = -40
      }
      streakGeo.attributes.position.needsUpdate = true
    }
    state.roofF = state.roofT > 0 ? (state.roofT < 1 ? state.roofT : state.roofT < 3.5 ? 1 : Math.max(0, 1-(state.roofT-3.5))) : 0
  }

  if(trans){
    trans.t = Math.min(1, trans.t + dt/1.6)
    const tt = smooth(trans.t)
    camPos.lerpVectors(trans.fromPos, camPos, tt)
    camLook.lerpVectors(trans.fromLook, camLook, tt)
    if(trans.t >= 1) trans = null
  }

  camera.position.copy(camPos)
  camera.lookAt(camLook)
  currentLook.copy(camLook)

  if(arcadeOn) drawArcade(dt)

  rainMat.opacity = 0.35 * vibe.rain * (1 - state.roofF)
  if(!REDUCED){
    const sp = 20 + vibe.rain*8
    const rp = rainGeo.attributes.position
    for(let i=0;i<rainCount;i++){
      let y = rp.getY(i) - sp*dt
      if(y < 0) y += 26
      rp.setY(i, y)
    }
    rp.needsUpdate = true
  }
  rain.rotation.z = pointer.x * 0.05

  cars.forEach(c=>{
    const u = c.userData
    let nz = c.position.z + u.dir * u.speed * vibe.traffic * dt
    if(state.light !== 'green'){
      if(u.dir < 0 && c.position.z > -44 && nz <= -44) nz = -44
      if(u.dir > 0 && c.position.z < -56 && nz >= -56) nz = -56
    }
    if(nz < -120) nz = 10
    if(nz > 10) nz = -120
    c.position.z = nz
  })

  peds.forEach(p=>{
    const u = p.userData
    p.position.x += u.dir * u.speed * vibe.crowd * dt
    if(p.position.x > u.zone.x[1]) { p.position.x = u.zone.x[1]; u.dir = -1 }
    if(p.position.x < u.zone.x[0]) { p.position.x = u.zone.x[0]; u.dir = 1 }
    p.rotation.y = u.dir > 0 ? Math.PI/2 : -Math.PI/2
    p.position.y = Math.abs(Math.sin((t + u.bob)*6)) * 0.04
    if(u.lookT > 0){
      u.lookT -= dt
      u.head.lookAt(camera.position)
    }
  })

  signs.forEach((s, i)=>{
    if(s.userData.flickerT > 0){
      s.userData.flickerT -= dt
      s.material.opacity = Math.random() < 0.4 ? 0.15 : s.userData.baseOpacity
    } else {
      s.material.opacity = lerp(s.material.opacity, s.userData.baseOpacity, 0.1)
    }
    const target = new THREE.Color(vibeTarget.color)
    s.userData.baseColor.lerp(target, 0.02)
    s.material.color.copy(s.userData.baseColor)
  })

  lanterns.forEach(l=>{
    l.material.opacity = 0.8 + Math.sin(t*11 + l.userData.phase)*0.2
  })

  vendingMachines.forEach(g=>{
    const u = g.userData
    const isHov = state.near && state.near.type === 'vending' && Math.hypot(player.x - g.position.x, player.z - g.position.z) < 3
    u.lit = lerp(u.lit, isHov ? 1 : 0, 0.15)
    u.front.material.color.setScalar(1 + u.lit * 0.6)
  })

  ripples.forEach(r=>{
    if(r.visible){
      r.userData.life -= dt*1.4
      r.scale.setScalar(1 + (1-r.userData.life)*4)
      r.material.opacity = r.userData.life * 0.7
      if(r.userData.life <= 0) r.visible = false
    }
  })

  cans.forEach((c, i)=>{
    c.userData.vy -= 9.8*dt
    c.position.y += c.userData.vy*dt
    c.rotation.x += dt*6
    if(c.position.y < 0.07){ c.position.y = 0.07; c.userData.vy *= -0.35 }
    c.userData.life -= dt
    if(c.userData.life < 1) c.material.opacity = c.userData.life
    if(c.userData.life <= 0){ city.remove(c); c.geometry.dispose(); c.material.dispose(); cans.splice(i,1) }
  })

  if(cat.userData.running){
    cat.position.x += cat.userData.dir * cat.userData.speed * dt
    cat.rotation.y = cat.userData.dir > 0 ? Math.PI/2 : -Math.PI/2
    tail.rotation.z = Math.sin(t*22)*0.6
    catHit.position.copy(cat.position); catHit.position.y = 0.3
    if(Math.abs(cat.position.x) > 7){ cat.visible = false; catHit.visible = false }
  } else {
    tail.rotation.z = 0.4 + Math.sin(t*2)*0.15
  }

  const door = doorPanel.userData
  if(door.open){
    door.openT = Math.min(1, door.openT + dt*0.5)
    doorPanel.position.z = -72.5 + door.openT * 0.9
    doorGlow.material.opacity = door.openT * 0.85
  }

  symbol.material.opacity = 0.75 + Math.sin(t*2.4)*0.25
  symbol.rotation.z = Math.sin(t*0.8)*0.1

  const bowlHover = state.near && state.near.type === 'ramen'
  steamMat.opacity = 0.12 + vibe.steam * 0.18 + (bowlHover ? 0.3 : 0)
  const sp2 = steamGeo.attributes.position
  for(let i=0;i<steamCount;i++){
    let y = sp2.getY(i) + dt * (0.35 + vibe.steam*0.25)
    sp2.setX(i, sp2.getX(i) + Math.sin(t*2 + steamSeed[i]) * dt * 0.15)
    if(y > 2.9){ y = 1.3; sp2.setX(i, 2.2 + (Math.random()-0.5)*0.6); sp2.setZ(i, -68 + (Math.random()-0.5)*0.6) }
    sp2.setY(i, y)
  }
  sp2.needsUpdate = true

  miniRedraw -= dt
  if(miniRedraw <= 0){
    miniRedraw = 0.12
    const ctx = miniTex.ctx
    ctx.fillStyle = '#0a0d15'; ctx.fillRect(0,0,128,128)
    ctx.fillStyle = '#1a2233'
    ctx.fillRect(0, 60, 128, 8)
    const cols = ['#ff5a36','#00d4c8','#ffe95a','#ff2e88']
    for(let i=0;i<6;i++){
      ctx.fillStyle = cols[i%4]
      const x = ((t*30 + i*47) % 160) - 16
      ctx.fillRect(x, 52 + (i%3)*8, 8, 4)
    }
    ctx.fillStyle = '#ffd9a0'
    for(let i=0;i<10;i++){ ctx.fillRect((i*13 + 7) % 128, 20 + (i*29)%40, 3, 3) }
    miniTex.tex.needsUpdate = true
  }

  const clawU = claw.userData
  if(clawU.dropT > 0){
    clawU.dropT -= dt
    const ph2 = 1.4 - clawU.dropT
    const armY = ph2 < 0.5 ? 1.6 - ph2*1.6 : 0.8 + (ph2-0.5)*1.6
    clawArm.position.y = armY
    clawHand.position.y = armY - 0.45
    if(clawU.dropT <= 0){ clawArm.position.y = 1.6; clawHand.position.y = 1.15 }
  }

  mapMarkers.forEach(m=>{
    if(m.userData.type !== 'hood') return
    const target = m.userData.hover ? 1.5 : 1
    m.scale.setScalar(lerp(m.scale.x, target, 0.15))
    m.position.y = 0.15 + (m.userData.hover ? 0.35 : 0)
  })

  cursorPos.x = lerp(cursorPos.x, cursorTarget.x, 0.22)
  cursorPos.y = lerp(cursorPos.y, cursorTarget.y, 0.22)
  cursorEl.style.transform = 'translate(' + (cursorPos.x - cursorEl.offsetWidth/2) + 'px,' + (cursorPos.y - cursorEl.offsetHeight/2) + 'px)'

  const magR = enterBtn.getBoundingClientRect()
  const magCX = magR.left + magR.width/2, magCY = magR.top + magR.height/2
  const dMag = Math.hypot(cursorTarget.x - magCX, cursorTarget.y - magCY)
  if(dMag < 150 && state.mode === 'hero'){
    magX = (cursorTarget.x - magCX) * 0.3
    magY = (cursorTarget.y - magCY) * 0.3
  } else {
    magX = lerp(magX, 0, 0.1); magY = lerp(magY, 0, 0.1)
  }
  enterBtn.style.transform = 'translate(' + magX + 'px,' + magY + 'px)'

  if(state.mapOpen){
    mapGroup.rotation.x = -0.42 + Math.sin(t*0.3)*0.01
    mapCamera.lookAt(0, 0, 0)
    renderer.render(mapScene, mapCamera)
  } else {
    composer.render()
  }
}
requestAnimationFrame(loop)

window.addEventListener('pointermove', ()=>{ if(soundOn && audioCtx && audioCtx.state === 'suspended') audioCtx.resume() })
setTimeout(()=>document.body.classList.add('ready'), 100)
setTimeout(()=>{ if(state.mode === 'hero') toast('MOVE YOUR CURSOR — THE CITY IS WATCHING', 4200) }, 2200)
