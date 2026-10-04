import * as THREE from 'three'

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
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: moonTexture(), transparent: true, opacity: 0, depthWrite: false
  }))
  moon.position.set(70, 80, -260)
  moon.scale.setScalar(9)
  scene.add(moon)

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

  /* ---------------- sakura, only where they belong ---------------- */
  const cherry = []
  const CHERRY_Z = [-24, -40, -58, -76, -92, -112, -132]
  CHERRY_Z.forEach((z, i) => {
    const g = new THREE.Group()
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.15, 2.3, 6),
      new THREE.MeshBasicMaterial({ color: 0x3b2f28 })
    )
    trunk.position.y = 1.15
    g.add(trunk)
    const blossomMat = new THREE.MeshBasicMaterial({ color: 0xe2b1bd, transparent: true, opacity: 0 })
    for (let b = 0; b < 3; b++){
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.95, 8, 6), blossomMat)
      canopy.position.set((Math.random()-0.5)*0.7, 2.4 + b*0.4, (Math.random()-0.5)*0.7)
      canopy.scale.y = 0.7
      g.add(canopy)
    }
    const side = i % 2 === 0 ? 1 : -1
    g.position.set(side * (5.4 + (i % 3) * 0.5), 0, z)
    g.userData = { mat: blossomMat, phase: Math.random() * 6.28 }
    city.add(g)
    cherry.push(g)
  })

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

  /* Visible sun disc: modest, physically placed, not a pasted circle.
     Day sits high; sunset drops near the horizon and warms. */
  const sunSpr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTexture(), transparent: true, opacity: 0, depthWrite: false, fog: false
  }))
  scene.add(sunSpr)

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

    starMat.opacity = cur.stars * 0.42
    stars.visible = cur.stars > 0.02
    if (stars.visible && !reduced){
      const sp = starGeo.attributes.position
      for (let i = 0; i < starCount; i++) sp.setY(i, sp.getY(i) + Math.sin(t * 0.6 + starSeed[i]) * 0.0006)
      sp.needsUpdate = true
    }
    moon.material.opacity = cur.moon * 0.8
    moon.visible = cur.moon > 0.02

    /* sky gradient follows the derived state */
    skyUni.top.value.setRGB(cur.bg[0]/255, cur.bg[1]/255, cur.bg[2]/255)
    skyUni.horizon.value.setRGB(cur.fog[0]/255, cur.fog[1]/255, cur.fog[2]/255)
    /* sun disc: day high, sunset low and warm, gone at night */
    if (time === 'night'){
      sunSpr.material.opacity = 0
      sunSpr.visible = false
    } else if (time === 'sunset'){
      sunSpr.visible = true
      sunSpr.position.set(-110, 26, -260)
      sunSpr.scale.setScalar(30)
      sunSpr.material.color.setRGB(1.0, 0.72, 0.48)
      sunSpr.material.opacity = (weather === 'rain' ? 0.12 : weather === 'snow' ? 0.2 : 0.95)
    } else {
      sunSpr.visible = true
      sunSpr.position.set(-70, 170, -220)
      sunSpr.scale.setScalar(24)
      sunSpr.material.color.setRGB(1.0, 0.97, 0.92)
      sunSpr.material.opacity = (weather === 'rain' ? 0.12 : weather === 'snow' ? 0.22 : 0.9)
    }

    /* snow */
    snowMat.opacity = cur.snow * 0.72
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
    petalMat.opacity = cur.petal * (0.3 + local * 0.36)
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

    /* rain is owned here and nowhere else */
    rainMat.opacity = cur.rain * 0.30
    rain.visible = cur.rain > 0.02

    /* sakura */
    cherry.forEach(tr => {
      const u = tr.userData
      if (!reduced) tr.rotation.z = Math.sin(t * 0.5 + u.phase) * 0.016
      u.mat.opacity = cur.petal * 0.88
      tr.visible = cur.petal > 0.02
    })
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
  c.width = c.height = 128
  const x = c.getContext('2d')
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 62)
  g.addColorStop(0, 'rgba(255,250,238,1)')
  g.addColorStop(0.45, 'rgba(246,238,220,0.8)')
  g.addColorStop(0.72, 'rgba(220,210,190,0.2)')
  g.addColorStop(1, 'rgba(200,190,170,0)')
  x.fillStyle = g
  x.beginPath(); x.arc(64, 64, 62, 0, Math.PI * 2); x.fill()
  return new THREE.CanvasTexture(c)
}

function sunTexture(){
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const x = c.getContext('2d')
  const g = x.createRadialGradient(64, 64, 2, 64, 64, 62)
  g.addColorStop(0, 'rgba(255,252,244,1)')
  g.addColorStop(0.25, 'rgba(255,244,220,0.9)')
  g.addColorStop(0.5, 'rgba(255,230,190,0.25)')
  g.addColorStop(1, 'rgba(255,220,180,0)')
  x.fillStyle = g
  x.beginPath(); x.arc(64, 64, 62, 0, Math.PI * 2); x.fill()
  return new THREE.CanvasTexture(c)
}