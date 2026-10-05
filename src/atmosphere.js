import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/* ==========================================================================
   ATMOSPHERE
   Two independent axes, exactly as the visitor thinks about them:

     TIME OF DAY   day · sunset · night
     WEATHER       sunny · rain · snow · spring

   Everything visual is DERIVED from those two plus the current district and
   the transition progress. There is exactly one authority for sky, fog,
   exposure, lighting and particles, so nothing can fight anything else.

   Colours are interpolated component-wise in RGB. Interpolating packed hex
   integers across channels produces nonsense halfway through a transition,
   which is what caused the colour flashes and the over-bright mid-states.
   ========================================================================== */

const TIMES = ['day', 'sunset', 'night']
const WEATHERS = ['sunny', 'rain', 'snow', 'spring']

/* --- time of day ------------------------------------------------------- */
const TIME = {
  day: {
    label: 'Day',
    bg: [96, 138, 178], fog: [112, 148, 184], fogDensity: 0.0068,
    light: 1.05, sun: [-30, 78, 34], amb: 0.38,
    exposure: 1.03, tint: [1.02, 1.02, 1.00],
    stars: 0, moon: 0, windows: 0.18, signs: 0.30, pedDensity: 1.22, traffic: 1.12
  },
  sunset: {
    label: 'Sunset',
    bg: [74, 58, 68], fog: [92, 62, 66], fogDensity: 0.0094,
    light: 0.52, sun: [-62, 12, 26], amb: 0.17,
    exposure: 1.00, tint: [1.10, 0.99, 0.93],
    stars: 0.28, moon: 0.30, windows: 0.72, signs: 0.88, pedDensity: 1.05, traffic: 1.05
  },
  night: {
    label: 'Night',
    bg: [13, 13, 17], fog: [13, 13, 17], fogDensity: 0.0082,
    light: 0.24, sun: [-40, 60, 20], amb: 0.085,
    exposure: 0.96, tint: [1.00, 1.00, 1.00],
    stars: 1.0, moon: 0.95, windows: 1.0, signs: 0.92, pedDensity: 1.0, traffic: 1.0
  }
}

/* --- weather ----------------------------------------------------------- */
const WEATHER = {
  sunny:  { rain: 0,    wet: 0.10, snow: 0, petal: 0, fogMul: 1.00, lightMul: 1.00, tint: [ 0.00,  0.00,  0.00], shade:  0.00, coat: 0.00 },
  rain:   { rain: 1,    wet: 1.00, snow: 0, petal: 0, fogMul: 1.42, lightMul: 0.60, tint: [-0.05, -0.04,  0.00], shade: -26,   coat: 1.00 },
  snow:   { rain: 0,    wet: 0.52, snow: 1, petal: 0, fogMul: 1.30, lightMul: 0.80, tint: [-0.05,  0.00,  0.07], shade: -10,   coat: 1.00 },
  spring: { rain: 0,    wet: 0.42, snow: 0, petal: 1, fogMul: 1.06, lightMul: 1.00, tint: [ 0.03, -0.01,  0.03], shade:  -4,   coat: 0.00 }
}

/* --- districts change how a given time+weather actually looks --------- */
const DISTRICT = {
  shinjuku:    { signs: 1.18, windows: 1.10, ped: 1.14, name: 'Shinjuku' },
  nishishinjuku:{ signs: 1.10, windows: 1.05, ped: 1.05, name: 'Nishi-Shinjuku' },
  shibuya:     { signs: 1.22, windows: 1.06, ped: 1.20, name: 'Shibuya' },
  harajuku:    { signs: 0.86, windows: 1.00, ped: 1.00, name: 'Harajuku' },
  yoyogi:      { signs: 0.62, windows: 0.92, ped: 0.92, name: 'Yoyogi' },
  asakusa:     { signs: 0.78, windows: 0.96, ped: 0.82, name: 'Asakusa', warm: 0.16 },
  ginza:       { signs: 0.72, windows: 1.04, ped: 0.88, name: 'Ginza', clean: 0.20 },
  tsukiji:     { signs: 0.66, windows: 1.02, ped: 1.06, name: 'Tsukiji' },
  nakameguro:  { signs: 0.48, windows: 0.90, ped: 0.74, name: 'Nakameguro' },
  akihabara:   { signs: 1.30, windows: 1.08, ped: 1.16, name: 'Akihabara' },
  roppongi:    { signs: 0.92, windows: 1.00, ped: 0.96, name: 'Roppongi' },
  rooftop:     { signs: 0.34, windows: 0.80, ped: 0.30, name: 'Tokyo Rooftop' }
}

/* AUTO walks a believable progression rather than picking at random. */
const AUTO_PLAN = [
  { time: 'day',     weather: 'sunny'  },
  { time: 'day',     weather: 'spring' },
  { time: 'sunset',  weather: 'sunny'  },
  { time: 'sunset',  weather: 'rain'   },
  { time: 'night',   weather: 'rain'   },
  { time: 'night',   weather: 'sunny'  },
  { time: 'night',   weather: 'snow'   },
  { time: 'night',   weather: 'spring' }
]
const AUTO_MS = { off: 0, m5: 300000, m15: 900000, m30: 1800000, m60: 3600000 }
const TRANSITION_SEC = 3.4

const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v

/* the single derivation: time x weather x district -> one visual state */
function derive(time, weather, districtKey){
  const t = TIME[time] || TIME.night
  const w = WEATHER[weather] || WEATHER.sunny
  const d = DISTRICT[districtKey] || DISTRICT.shinjuku

  /* weather darkens and cools the sky before anything else happens */
  const shade = w.shade
  const bg = [
    clamp255(t.bg[0] + shade),
    clamp255(t.bg[1] + shade * 0.94),
    clamp255(t.bg[2] + shade * (w.rain ? 0.8 : 1.05))
  ]
  const fog = [
    clamp255(t.fog[0] + shade * 1.15),
    clamp255(t.fog[1] + shade * 1.05),
    clamp255(t.fog[2] + shade * 0.95)
  ]

  const isNightish = time === 'night' || time === 'sunset'
  /* soft ceilings rather than hard clamps: a hard clamp flattened the
     difference between a clear night and a snowy one, which is exactly the
     distinction these numbers exist to express */
  const signs = Math.min(1.25, t.signs * d.signs * (isNightish ? 1 : 0.85) + w.rain * 0.10)
  const windows = Math.min(1.30, t.windows * d.windows + (weather === 'snow' ? 0.28 : 0))

  return {
    label: t.label + (weather === 'sunny' ? '' : ' · ' + weather.charAt(0).toUpperCase() + weather.slice(1)),
    bg, fog,
    fogDensity: t.fogDensity * w.fogMul,
    light: t.light * w.lightMul,
    sun: t.sun,
    amb: t.amb * (w.rain ? 1.25 : 1),
    exposure: t.exposure * (w.rain ? 0.97 : 1) * (weather === 'snow' ? 1.02 : 1),
    tint: [
      t.tint[0] + w.tint[0],
      t.tint[1] + w.tint[1],
      t.tint[2] + w.tint[2]
    ],
    stars: t.stars * (weather === 'rain' ? 0 : 1) * (weather === 'snow' ? 0.25 : 1),
    moon: t.moon * (weather === 'rain' ? 0 : 1),
    rain: w.rain,
    wet: w.wet * (isNightish ? 1 : 0.8),
    snow: w.snow,
    petal: w.petal,
    signs,
    windows,
    pedDensity: t.pedDensity * d.ped * (weather === 'rain' ? 0.72 : weather === 'snow' ? 0.68 : 1),
    traffic: t.traffic * (weather === 'rain' ? 0.8 : weather === 'snow' ? 0.7 : 1),
    coat: w.coat,
    warm: d.warm || 0,
    clean: d.clean || 0
  }
}
function clamp255(v){ return v < 0 ? 0 : v > 255 ? 255 : Math.round(v) }

export function createAtmosphere(ctx){
  const { scene, camera, city, rain, rainMat } = ctx
  const grade = ctx.gradePass
  const isTouch = ctx.IS_TOUCH
  const reduced = ctx.REDUCED

  let time = 'night'
  let weather = 'rain'
  let district = 'shinjuku'

  const cur = derive(time, weather, district)
  const from = JSON.parse(JSON.stringify(cur))
  let tween = 1
  let tweenDur = TRANSITION_SEC

  /* ---------------- stars ---------------- */
  const starCount = reduced ? 80 : isTouch ? 240 : 560
  const starGeo = new THREE.BufferGeometry()
  const starPos = new Float32Array(starCount * 3)
  const starSeed = new Float32Array(starCount)
  for (let i = 0; i < starCount; i++){
    const r = 90 + Math.random() * 120
    const a = Math.random() * Math.PI * 2
    starPos[i*3] = Math.cos(a) * r
    starPos[i*3+1] = 28 + Math.random() * 60
    starPos[i*3+2] = Math.sin(a) * r - 40
    starSeed[i] = Math.random() * 6.28
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
  const starMat = new THREE.PointsMaterial({
    color: 0xf4efe6, size: 0.5, transparent: true, opacity: 0, depthWrite: false
  })
  const stars = new THREE.Points(starGeo, starMat)
  stars.frustumCulled = false
  scene.add(stars)

  /* ---------------- moon ---------------- */
  /* The moon is a disc plus its own halo, so it reads as a body with
     atmosphere around it rather than a white blob. */
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: moonGlowTexture(), transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false
  }))
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: moonTexture(), transparent: true, opacity: 0, depthWrite: false, fog: false
  }))
  moon.position.set(70, 80, -260)
  moonGlow.position.copy(moon.position)
  scene.add(moonGlow, moon)

  /* ---------------- precipitation ---------------- */
  const fallCount = reduced ? 80 : isTouch ? 240 : 560
  const fallGeo = new THREE.BufferGeometry()
  const fallPos = new Float32Array(fallCount * 3)
  const fallSeed = new Float32Array(fallCount)
  for (let i = 0; i < fallCount; i++){
    fallPos[i*3] = (Math.random() - 0.5) * 40
    fallPos[i*3+1] = Math.random() * 24
    fallPos[i*3+2] = -34 + Math.random() * 46
    fallSeed[i] = Math.random()
  }
  fallGeo.setAttribute('position', new THREE.BufferAttribute(fallPos, 3))
  const snowMat = new THREE.PointsMaterial({
    color: 0xf2f4f6, size: 0.105, transparent: true, opacity: 0, depthWrite: false
  })
  const petalMat = new THREE.PointsMaterial({
    color: 0xefc2cb, size: 0.09, transparent: true, opacity: 0, depthWrite: false
  })
  const snow = new THREE.Points(fallGeo, snowMat)
  const petalGeo = fallGeo.clone()
  const petals = new THREE.Points(petalGeo, petalMat)
  snow.frustumCulled = petals.frustumCulled = false
  camera.add(snow); camera.add(petals)

    /* ---------------- SAKURA ENVIRONMENT SYSTEM ----------------
   Spring has to transform the environment, not tint it. A real
   sakura system needs MANY trees, arranged the way Tokyo plants them:
   continuous street rows, the Meguro river banks, temple gardens, park
   clusters, and background rows behind them.

   Performance: trunks and blossom clusters are both InstancedMeshes.
   Blossom strength is carried in instanceColor (mixed between foliage
   green and petal pink), and intensity is applied through `count`, so
   LOW/MEDIUM/HIGH physically shows more or fewer blooming trees rather
   than fading the same few. Trees are ordered by priority, so the
   important rows are always the ones that survive a LOW count. */
    const PETAL_COLS = [0xe0a8bc, 0xd99ab0, 0xcf8fa8, 0xe8b8c6, 0xdba2b4]
    const FOLIAGE = [0x35502f, 0x2c4429, 0x3d5a34, 0x27401f]
    const WIND = { x: 0.5, z: 0.16 }

    /* trunk + branch geometry, merged once and instanced */
    const trunkParts = []
    {
      const g1 = new THREE.CylinderGeometry(0.10, 0.17, 2.5, 6)
      g1.translate(0, 1.25, 0)
      trunkParts.push(g1)
      for (let b = 0; b < 4; b++){
        const len = 0.85 + Math.random() * 0.5
        const g2 = new THREE.CylinderGeometry(0.035, 0.075, len, 5)
        const a = (b / 4) * Math.PI * 2 + Math.random() * 0.6
        g2.rotateZ(0.75 + Math.random() * 0.3)
        g2.rotateY(a)
        g2.translate(Math.cos(a) * 0.28, 2.45 + Math.random() * 0.4, Math.sin(a) * 0.28)
        trunkParts.push(g2)
      }
    }
    const TRUNK_GEO = mergeGeometries(trunkParts, false)
    trunkParts.forEach(g => g.dispose())
    /* blossom cluster: several overlapping lobes, not one sphere */
    const blossomParts = []
    for (let b = 0; b < 6; b++){
      const r = 0.52 + Math.random() * 0.34
      const g = new THREE.SphereGeometry(r, 7, 5)
      g.scale(1, 0.78, 1)
      g.translate((Math.random()-0.5)*1.5, 2.95 + Math.random()*0.75, (Math.random()-0.5)*1.5)
      blossomParts.push(g)
    }
    const BLOSSOM_GEO = mergeGeometries(blossomParts, false)
    blossomParts.forEach(g => g.dispose())

    /* -------- where the trees go, and how much each place matters ----- */
    /* priority 1 = must always be blooming, 3 = background filler */
    const spots = []
    const addRow = (x0, z0, x1, z1, n, prio, sMin, sMax) => {
      for (let i = 0; i < n; i++){
        const k = n === 1 ? 0.5 : i / (n - 1)
        spots.push({
          x: lerp(x0, x1, k), z: lerp(z0, z1, k), prio,
          s: sMin + Math.random() * (sMax - sMin),
          r: Math.random() * Math.PI * 2,
          col: (Math.random() * PETAL_COLS.length) | 0,
          fol: (Math.random() * FOLIAGE.length) | 0,
          ph: Math.random() * 6.28
        })
      }
    }
    /* NAKAMEGURO: the river banks. Both sides, dense, staggered. */
    addRow(-8.2, -54, -9.4, -69, 11, 1, 1.0, 1.35)
    addRow(8.2, -54, 9.4, -69, 11, 1, 1.0, 1.35)
    /* plus a second, deeper row behind them */
    addRow(-12.5, -52, -13.5, -70, 7, 2, 0.9, 1.2)
    addRow(12.5, -52, 13.5, -70, 7, 2, 0.9, 1.2)
    /* ASAKUSA: temple garden clusters, which is where they actually are */
    addRow(-7.0, -126, -8.4, -140, 6, 1, 1.05, 1.3)
    addRow(7.0, -126, 8.4, -140, 6, 1, 1.05, 1.3)
    addRow(-16, -124, -17, -141, 5, 2, 0.95, 1.15)
    addRow(16, -124, 17, -141, 5, 2, 0.95, 1.15)
    /* HARAJUKU / YOYOGI: park-edge rows */
    addRow(-6.4, -28, -7.4, -39, 5, 1, 1.0, 1.2)
    addRow(6.4, -28, 7.4, -39, 5, 1, 1.0, 1.2)
    /* SHIBUYA and SHINJUKU: street rows, sparser, they are city streets */
    addRow(-5.6, 2, -6.2, -22, 6, 2, 0.85, 1.05)
    addRow(5.6, 2, 6.2, -22, 6, 2, 0.85, 1.05)
    addRow(-5.6, -42, -6.4, -52, 4, 2, 0.85, 1.05)
    addRow(5.6, -42, 6.4, -52, 4, 2, 0.85, 1.05)
    /* ROPPONGI, GINZA, TSUKIJI, AKIHABARA: a few, and further back */
    addRow(-6.6, -70, -7.4, -80, 4, 3, 0.8, 1.0)
    addRow(6.6, -70, 7.4, -80, 4, 3, 0.8, 1.0)
    addRow(-18, -86, -19, -94, 4, 3, 0.85, 1.05)
    addRow(18, -86, 19, -94, 4, 3, 0.85, 1.05)
    addRow(-6.6, -98, -7.4, -108, 3, 3, 0.8, 0.95)
    addRow(6.6, -98, 7.4, -108, 3, 3, 0.8, 0.95)
    addRow(-6.6, -112, -7.4, -122, 3, 3, 0.8, 0.95)
    addRow(6.6, -112, 7.4, -122, 3, 3, 0.8, 0.95)
    /* ODAIBA: the waterfront trees, the last green before the water */
    addRow(-14, -150, -22, -162, 5, 3, 0.85, 1.05)
    addRow(14, -150, 22, -162, 5, 3, 0.85, 1.05)

    /* priority order first, so a low count keeps the important rows */
    spots.sort((a, b) => a.prio - b.prio)
    const TREE_COUNT = spots.length

    const trunkMesh = new THREE.InstancedMesh(
      TRUNK_GEO, new THREE.MeshBasicMaterial({ color: 0xffffff }), TREE_COUNT)
    const blossomMesh = new THREE.InstancedMesh(
      BLOSSOM_GEO, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.94 }),
      TREE_COUNT)
    trunkMesh.frustumCulled = false
    blossomMesh.frustumCulled = false
    const treeDummy = new THREE.Object3D()
    const petalCol = new THREE.Color(), foliageCol = new THREE.Color()
    const trunkCol = new THREE.Color()
    for (let i = 0; i < TREE_COUNT; i++){
      const sp = spots[i]
      treeDummy.position.set(sp.x, 0, sp.z)
      treeDummy.rotation.set(0, sp.r, 0)
      treeDummy.scale.setScalar(sp.s)
      treeDummy.updateMatrix()
      trunkMesh.setMatrixAt(i, treeDummy.matrix)
      trunkMesh.setColorAt(i, trunkCol.setHex(0x3b2f28))
      blossomMesh.setMatrixAt(i, treeDummy.matrix)
    }
    trunkMesh.instanceMatrix.needsUpdate = true
    blossomMesh.instanceMatrix.needsUpdate = true
    city.add(trunkMesh, blossomMesh)

    /* the individual tree records the rest of the module still wants */
    const cherry = spots.map(sp => ({ position: new THREE.Vector3(sp.x, 0, sp.z),
                                     userData: { phase: sp.ph, prio: sp.prio } }))
    const sakura = {
      total: TREE_COUNT,
      priority1: spots.filter(s => s.prio === 1).length,
      mesh: blossomMesh,
      trunks: trunkMesh,
      spots
    }

  const sun = new THREE.DirectionalLight(0xffffff, 0.3)
  scene.add(sun)
  const amb = new THREE.HemisphereLight(0xbfd4e8, 0x1a1714, 0.3)
  scene.add(amb)

  /* Sky dome: a gradient, not a flat rectangle. Top color comes from
     the derived background, horizon from the fog, so all twelve
     time×weather states get their own sky automatically. */
  const skyUni = {
    top: { value: new THREE.Color(0x608ab2) },
    horizon: { value: new THREE.Color(0x7094b8) }
  }
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(420, 24, 16),
    new THREE.ShaderMaterial({
      uniforms: skyUni,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: [
        'varying vec3 vP; uniform vec3 top; uniform vec3 horizon;',
        'void main(){',
        ' float h = normalize(vP).y;',
        ' vec3 col = mix(horizon, top, smoothstep(0.02, 0.55, h));',
        ' col = mix(vec3(0.03,0.03,0.04), col, smoothstep(-0.08, 0.02, h));',
        ' gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    })
  )
  skyDome.frustumCulled = false
  skyDome.renderOrder = -10
  scene.add(skyDome)

  /* Visible sun: a disc with a limb, plus a separate broad glow layer.
     Both scale with intensity, so LOW is a soft small sun and HIGH is a
     large bright one — without repainting the whole world yellow. */
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunGlowTexture(), transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false
  }))
  const sunSpr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTexture(), transparent: true, opacity: 0, depthWrite: false, fog: false
  }))
  scene.add(sunGlow, sunSpr)

  const bgCol = new THREE.Color()
  const fogCol = new THREE.Color()
  const tintV = new THREE.Vector3()
  const sunPos = new THREE.Vector3()

  let autoKey = 'off'
  let autoTimer = null
  let autoIdx = AUTO_PLAN.findIndex(p => p.time === 'night' && p.weather === 'rain')
  if (autoIdx < 0) autoIdx = 0
  const listeners = []

  function target(){ return derive(time, weather, district) }

  /* One setter. Changing anything mid-transition re-bases from the CURRENT
     visual state, so transitions never stack and never snap back. */
  function set(next, instant){
    next = next || {}
    const nt = TIMES.indexOf(next.time) > -1 ? next.time : time
    const nw = WEATHERS.indexOf(next.weather) > -1 ? next.weather : weather
    const nd = next.district || district
    const changed = nt !== time || nw !== weather || nd !== district
    time = nt; weather = nw; district = nd
    /* snapshot where we are RIGHT NOW as the new starting point */
    for (const k in cur) from[k] = Array.isArray(cur[k]) ? cur[k].slice() : cur[k]
    if (instant){
      /* snap straight to the target; skipping the tween must not skip the copy */
      const g = target()
      for (const k in cur){
        if (Array.isArray(cur[k]) && Array.isArray(g[k])) cur[k] = g[k].slice()
        else cur[k] = g[k]
      }
      tween = 1
      tweenDur = TRANSITION_SEC
    } else {
      tweenDur = TRANSITION_SEC
      tween = 0
    }
    if (changed) listeners.forEach(fn => fn(time, weather, district))
  }

  function autoSet(key){
    autoKey = key
    if (autoTimer){ clearInterval(autoTimer); autoTimer = null }
    const ms = AUTO_MS[key]
    if (!ms) return
    autoTimer = setInterval(() => {
      autoIdx = (autoIdx + 1) % AUTO_PLAN.length
      set(AUTO_PLAN[autoIdx])
    }, ms)
  }

  function update(dt, t){
    if (tween < 1){
      tween = Math.min(1, tween + dt / tweenDur)
      const g = target()
      const e = tween < 0.5 ? 4*tween*tween*tween : 1 - Math.pow(-2*tween + 2, 3) / 2
      for (const k in cur){
        /* the label is a string, not a number: it tracks the target
           instead of being interpolated (which produced "…NaN") */
        if (k === 'label'){ cur[k] = g[k]; continue }
        if (Array.isArray(cur[k]) && Array.isArray(from[k]) && Array.isArray(g[k])){
          for (let i = 0; i < g[k].length; i++) cur[k][i] = lerp(from[k][i], g[k][i], e)
        } else if (typeof cur[k] === 'number' && typeof from[k] === 'number' && typeof g[k] === 'number'){
          cur[k] = lerp(from[k], g[k], e)
        }
      }
    }

    bgCol.setRGB(cur.bg[0]/255, cur.bg[1]/255, cur.bg[2]/255)
    fogCol.setRGB(cur.fog[0]/255, cur.fog[1]/255, cur.fog[2]/255)
    scene.background = bgCol
    if (scene.fog){ scene.fog.color = fogCol; scene.fog.density = cur.fogDensity }

    if (grade && grade.uniforms){
      if (grade.uniforms.uTint) grade.uniforms.uTint.value = tintV.set(cur.tint[0], cur.tint[1], cur.tint[2])
      if (grade.uniforms.uExposure) grade.uniforms.uExposure.value = cur.exposure
    }

    sun.intensity = cur.light
    sun.position.copy(sunPos.set(cur.sun[0], cur.sun[1], cur.sun[2]))
    amb.intensity = cur.amb

    const INTENS = (ctx.intensity == null ? 1 : ctx.intensity)
    /* LOW / MEDIUM / HIGH, from the one shared intensity control */
    const SUN_K = INTENS < 0.7 ? 0 : INTENS > 1.3 ? 2 : 1
    const sunSize = SUN_K === 0 ? 15 : SUN_K === 2 ? 30 : 21
    const glowSize = SUN_K === 0 ? 60 : SUN_K === 2 ? 128 : 88

    starMat.opacity = cur.stars * 0.42 * (INTENS > 1.3 ? 1.35 : INTENS < 0.7 ? 0.7 : 1)
    starMat.size = INTENS > 1.3 ? 2.1 : INTENS < 0.7 ? 1.5 : 1.8
    stars.visible = cur.stars > 0.02
    if (stars.visible && !reduced){
      const sp = starGeo.attributes.position
      for (let i = 0; i < starCount; i++) sp.setY(i, sp.getY(i) + Math.sin(t * 0.6 + starSeed[i]) * 0.0006)
      sp.needsUpdate = true
    }
    /* the moon, and its halo, both driven by intensity */
    const moonK = INTENS > 1.3 ? 1.35 : INTENS < 0.7 ? 0.68 : 1
    moon.material.opacity = cur.moon * 0.92 * moonK
    moon.visible = cur.moon > 0.02
    moon.scale.setScalar(11 * (INTENS > 1.3 ? 1.22 : 1))
    moonGlow.material.opacity = cur.moon * 0.5 * moonK
    moonGlow.visible = moon.visible
    moonGlow.scale.setScalar(46 * (INTENS > 1.3 ? 1.3 : INTENS < 0.7 ? 0.8 : 1))

    /* sky gradient follows the derived state */
    skyUni.top.value.setRGB(cur.bg[0]/255, cur.bg[1]/255, cur.bg[2]/255)
    skyUni.horizon.value.setRGB(cur.fog[0]/255, cur.fog[1]/255, cur.fog[2]/255)
    /* sun: day high and white-warm, sunset low and orange, gone at night.
       Intensity decides how large and how bright, never what colour the
       rest of the world becomes. */
    if (time === 'night'){
      sunSpr.material.opacity = 0
      sunSpr.visible = false
      sunGlow.material.opacity = 0
      sunGlow.visible = false
    } else if (time === 'sunset'){
      sunSpr.visible = true; sunGlow.visible = true
      sunSpr.position.set(-110, 26, -260)
      sunGlow.position.copy(sunSpr.position)
      sunSpr.scale.setScalar(sunSize * 1.25)
      sunGlow.scale.setScalar(glowSize * 1.35)
      sunSpr.material.color.setRGB(1.0, 0.74, 0.50)
      sunGlow.material.color.setRGB(1.0, 0.62, 0.34)
      const clear = weather === 'sunny' || weather === 'spring' ? 1 : weather === 'snow' ? 0.34 : 0.16
      sunSpr.material.opacity = clear * (SUN_K === 2 ? 1 : SUN_K === 1 ? 0.95 : 0.82)
      sunGlow.material.opacity = clear * (SUN_K === 2 ? 0.95 : SUN_K === 1 ? 0.7 : 0.45)
    } else {
      sunSpr.visible = true; sunGlow.visible = true
      sunSpr.position.set(-70, 170, -220)
      sunGlow.position.copy(sunSpr.position)
      sunSpr.scale.setScalar(sunSize)
      sunGlow.scale.setScalar(glowSize)
      /* HIGH is a warm white; MEDIUM neutral; LOW softer and cooler */
      sunSpr.material.color.setRGB(1.0, SUN_K === 2 ? 0.98 : 0.97, SUN_K === 2 ? 0.90 : 0.92)
      sunGlow.material.color.setRGB(1.0, SUN_K === 2 ? 0.93 : 0.95, SUN_K === 2 ? 0.74 : 0.80)
      const clear = weather === 'sunny' || weather === 'spring' ? 1 : weather === 'snow' ? 0.36 : 0.16
      sunSpr.material.opacity = clear * (SUN_K === 2 ? 1 : SUN_K === 1 ? 0.96 : 0.85)
      sunGlow.material.opacity = clear * (SUN_K === 2 ? 0.85 : SUN_K === 1 ? 0.6 : 0.38)
    }
    /* snow */
    snowMat.opacity = cur.snow * 0.72 * Math.min(1.8, Math.max(0.4, INTENS))
    snow.visible = cur.snow > 0.02
    if (snow.visible){
      const sp = fallGeo.attributes.position
      for (let i = 0; i < fallCount; i++){
        let y = sp.getY(i) - (0.8 + fallSeed[i] * 0.55) * dt
        let x = sp.getX(i) + Math.sin(t * 0.5 + fallSeed[i] * 8) * 0.45 * dt
        if (y < -1){ y = 24; x = (Math.random() - 0.5) * 40 }
        sp.setY(i, y); sp.setX(i, x)
      }
      sp.needsUpdate = true
    }

    /* petals, denser beside a tree */
    const nearTree = nearestTree(camera.position)
    const local = Math.max(0, 1 - nearTree / 9)
    petalMat.opacity = cur.petal * (0.3 + local * 0.36) * Math.min(1.8, Math.max(0.4, INTENS))
    petals.visible = cur.petal > 0.02
    if (petals.visible){
      const pg = petalGeo.attributes.position
      for (let i = 0; i < fallCount; i++){
        let y = pg.getY(i) - (0.38 + fallSeed[i] * 0.32) * dt
        let x = pg.getX(i) + Math.sin(t * 0.9 + fallSeed[i] * 9) * (0.3 + local * 0.45) * dt
        if (y < -1){ y = 22; x = (Math.random() - 0.5) * 38 }
        pg.setY(i, y); pg.setX(i, x)
      }
      pg.needsUpdate = true
    }

    /* rain baseline; the main loop then layers intensity, streaks and fall
       on top of these values each frame */
    rainMat.opacity = cur.rain * 0.30 * Math.min(1.8, Math.max(0.4, INTENS))
    rain.visible = cur.rain > 0.02

    /* SAKURA: the trunks stand year-round; the blossom comes and goes.
       Off-season the canopy rests as foliage. Intensity decides how many
       trees are actually blooming — LOW shows the priority rows, HIGH
       shows everything — so the difference is obvious rather than a fade.
       Wind moves the canopy; in snow the blossom whitens. */
    {
      const INTENS = ctx.intensity == null ? 1 : ctx.intensity
      const bloom = clamp(cur.petal, 0, 1)
      /* how much of the planting is in blossom at this intensity */
      const frac = INTENS < 0.7 ? 0.42 : INTENS > 1.3 ? 1.0 : 0.74
      const showing = Math.max(8, Math.round(TREE_COUNT * frac * (0.34 + bloom * 0.66)))
      blossomMesh.count = Math.min(TREE_COUNT, showing)
      const windK = 0.012 + (INTENS > 1.3 ? 0.02 : INTENS < 0.7 ? 0.006 : 0.012) * (0.6 + bloom * 0.8)
      if (!reduced){
        for (let i = 0; i < blossomMesh.count; i++){
          const sp = spots[i]
          treeDummy.position.set(
            sp.x + Math.sin(t * 0.6 + sp.ph) * WIND.x * windK * 40,
            0,
            sp.z + Math.cos(t * 0.42 + sp.ph) * WIND.z * windK * 40)
          treeDummy.rotation.set(
            Math.sin(t * 0.5 + sp.ph) * windK,
            sp.r,
            Math.cos(t * 0.36 + sp.ph) * windK)
          treeDummy.scale.setScalar(sp.s * (0.92 + bloom * 0.14))
          treeDummy.updateMatrix()
          blossomMesh.setMatrixAt(i, treeDummy.matrix)
        }
        blossomMesh.instanceMatrix.needsUpdate = true
      }
      /* colour: foliage when out of season, petal pink in bloom, and a
         snow-dusted white when both are true at once */
      const snowMix = clamp(cur.snow, 0, 1) * 0.5
      for (let i = 0; i < TREE_COUNT; i++){
        const sp = spots[i]
        petalCol.setHex(PETAL_COLS[sp.col])
        foliageCol.setHex(FOLIAGE[sp.fol])
        const k = 0.12 + bloom * 0.88
        blossomMesh.setColorAt(i, petalCol.lerp(foliageCol, 1 - k))
        if (snowMix > 0){
          const c = blossomMesh.instanceColor
          void c
        }
      }
      if (blossomMesh.instanceColor) blossomMesh.instanceColor.needsUpdate = true
      /* snow settling on blossom */
      blossomMesh.material.color.setRGB(1 + snowMix * 0.2, 1 + snowMix * 0.25, 1 + snowMix * 0.3)
      blossomMesh.material.opacity = 0.80 + bloom * 0.14
      trunkMesh.visible = true
    }
  }

  function nearestTree(pos){
    let best = 1e9
    for (const tr of cherry){ const d = tr.position.distanceTo(pos); if (d < best) best = d }
    return best
  }

  return {
    state: {
      cur,
      get mode(){ return cur.label },
      get time(){ return time },
      get weather(){ return weather },
      get district(){ return district }
    },
      set,
      update,
      autoSet,
      cherry, sakura,
    onChange(fn){ listeners.push(fn) },
    transitioning(){ return tween < 1 },
    target,
    times(){ return TIMES.slice() },
    weathers(){ return WEATHERS.slice() },
    districts(){ return Object.keys(DISTRICT) },
    districtName(){ return (DISTRICT[district] || {}).name || district },
    label(){ return cur.label },
    autoKey(){ return autoKey },
    /* kept for anything still calling the old single-axis helper */
    applyMode(name, opts){
      const map = { day:['day','sunny'], sunset:['sunset','sunny'], night:['night','rain'],
                    spring:['day','spring'], snow:['day','snow'], rain:['night','rain'] }
      const m = map[name] || ['night','rain']
      set({ time: m[0], weather: m[1] }, opts && opts.instant)
    },
    modes(){ return TIMES.concat(WEATHERS) }
  }
}

function moonTexture(){
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const x = c.getContext('2d')
  /* a disc with a defined limb and a faint mare pattern, so the moon
     reads as a body in the sky rather than a white blob */
  const g = x.createRadialGradient(120, 116, 10, 128, 128, 116)
  g.addColorStop(0, 'rgba(255,252,244,1)')
  g.addColorStop(0.5, 'rgba(246,240,226,1)')
  g.addColorStop(0.88, 'rgba(226,218,202,1)')
  g.addColorStop(0.965, 'rgba(198,190,176,0.92)')
  g.addColorStop(1, 'rgba(180,172,160,0)')
  x.fillStyle = g
  x.beginPath(); x.arc(128, 128, 118, 0, Math.PI * 2); x.fill()
  /* maria: soft grey patches, deterministic */
  x.globalAlpha = 0.13
  x.fillStyle = '#9aa0a8'
  const spots = [[104, 108, 26], [148, 132, 20], [122, 152, 17], [156, 96, 13], [92, 140, 12]]
  spots.forEach(([sx, sy, r]) => {
    const rg = x.createRadialGradient(sx, sy, 0, sx, sy, r)
    rg.addColorStop(0, 'rgba(150,156,166,0.9)')
    rg.addColorStop(1, 'rgba(150,156,166,0)')
    x.fillStyle = rg
    x.beginPath(); x.arc(sx, sy, r, 0, Math.PI * 2); x.fill()
  })
  x.globalAlpha = 1
  return new THREE.CanvasTexture(c)
}

/* the soft halo around the moon */
function moonGlowTexture(){
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const x = c.getContext('2d')
  const g = x.createRadialGradient(128, 128, 20, 128, 128, 128)
  g.addColorStop(0, 'rgba(214,226,246,0.5)')
  g.addColorStop(0.35, 'rgba(190,206,234,0.18)')
  g.addColorStop(0.7, 'rgba(160,180,216,0.05)')
  g.addColorStop(1, 'rgba(140,164,204,0)')
  x.fillStyle = g
  x.beginPath(); x.arc(128, 128, 128, 0, Math.PI * 2); x.fill()
  return new THREE.CanvasTexture(c)
}

/* The sun is a disc with a real limb, a hot core, and its own glow
   layer. A single soft sprite reads as haze; a disc plus glow reads as
   a sun you could look at. */
function sunTexture(){
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const x = c.getContext('2d')
  const g = x.createRadialGradient(128, 128, 8, 128, 128, 104)
  g.addColorStop(0, 'rgba(255,255,250,1)')
  g.addColorStop(0.55, 'rgba(255,250,228,1)')
  g.addColorStop(0.82, 'rgba(255,238,196,1)')
  g.addColorStop(0.94, 'rgba(255,228,176,0.96)')
  g.addColorStop(0.985, 'rgba(255,222,166,0.55)')
  g.addColorStop(1, 'rgba(255,220,160,0)')
  x.fillStyle = g
  x.beginPath(); x.arc(128, 128, 104, 0, Math.PI * 2); x.fill()
  return new THREE.CanvasTexture(c)
}

/* atmospheric glow: broad, warm, and much larger than the disc */
function sunGlowTexture(){
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const x = c.getContext('2d')
  const g = x.createRadialGradient(128, 128, 10, 128, 128, 128)
  g.addColorStop(0, 'rgba(255,246,214,0.62)')
  g.addColorStop(0.22, 'rgba(255,238,196,0.34)')
  g.addColorStop(0.5, 'rgba(255,226,170,0.12)')
  g.addColorStop(0.78, 'rgba(255,214,150,0.03)')
  g.addColorStop(1, 'rgba(255,208,140,0)')
  x.fillStyle = g
  x.fillRect(0, 0, 256, 256)
  return new THREE.CanvasTexture(c)
}