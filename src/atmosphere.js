import * as THREE from 'three'

/* Atmosphere engine.
   Transitions are TIME-BASED, not exponential, so a change always takes the
   same cinematic duration (§2, §39) instead of snapping or drifting forever.
   Each mode drives sky, fog, exposure, grade tint, sun direction, stars, moon,
   rain, snow, petals, and the density of street life. */

const PAL = {
  night: {
    label: 'Night',
    bg: 0x0d0c11, fog: 0x0d0c11, fogDensity: 0.0080,
    tint: [1.00, 1.00, 1.00], exposure: 1.00,
    light: 0.30, sun: [-40, 60, 20], amb: 0.10,
    snow: 0, petal: 0, stars: 1.0, moon: 1.0, wet: 1.0,
    pedDensity: 1.00, traffic: 1.00, signs: 1.00, windows: 1.00
  },
  sunset: {
    label: 'Sunset',
    bg: 0x3a2a33, fog: 0x54373c, fogDensity: 0.0105,
    tint: [1.10, 1.01, 0.95], exposure: 1.06,
    light: 0.55, sun: [-58, 12, 26], amb: 0.16,
    snow: 0, petal: 0, stars: 0.35, moon: 0.35, wet: 0.7,
    pedDensity: 1.05, traffic: 1.05, signs: 0.95, windows: 0.85
  },
  day: {
    label: 'Day',
    bg: 0x8fa6b8, fog: 0x9db2c2, fogDensity: 0.0092,
    tint: [1.14, 1.11, 1.03], exposure: 1.20,
    light: 1.15, sun: [-30, 78, 34], amb: 0.42,
    snow: 0, petal: 0, stars: 0, moon: 0, wet: 0.18,
    pedDensity: 1.25, traffic: 1.15, signs: 0.40, windows: 0.22
  },
  spring: {
    label: 'Spring',
    bg: 0x2f2b34, fog: 0x453d47, fogDensity: 0.0086,
    tint: [1.08, 1.00, 1.05], exposure: 1.10,
    light: 0.68, sun: [-44, 58, 24], amb: 0.22,
    snow: 0, petal: 1, stars: 0.30, moon: 0.45, wet: 0.62,
    pedDensity: 1.12, traffic: 0.92, signs: 0.78, windows: 0.70
  },
  snow: {
    label: 'Snow',
    bg: 0x1b2029, fog: 0x252c37, fogDensity: 0.0122,
    tint: [0.93, 0.99, 1.14], exposure: 1.06,
    light: 0.46, sun: [-40, 66, 22], amb: 0.20,
    snow: 1, petal: 0, stars: 0.15, moon: 0.5, wet: 0.85,
    pedDensity: 0.72, traffic: 0.62, signs: 1.18, windows: 1.30
  }
}

/* Logical progression for AUTO. Never jumps day -> snow (§8). */
const AUTO_CYCLE = ['day', 'sunset', 'night', 'night', 'spring', 'sunset', 'night', 'snow', 'night', 'sunset', 'day', 'spring']
const AUTO_MS = { off: 0, m5: 300000, m15: 900000, m30: 1800000, m60: 3600000 }
const TRANSITION_SEC = 3.4

const lerp = (a, b, t) => a + (b - a) * t

export function createAtmosphere(ctx){
  const { scene, camera, city, rain, rainMat } = ctx
  const grade = ctx.gradePass
  const isTouch = ctx.IS_TOUCH
  const reduced = ctx.REDUCED

  const cur = {}
  const from = {}
  const to = {}
  let tween = 1
  let tweenDur = TRANSITION_SEC

  const keys = Object.keys(PAL.night)
  function snap(){
    keys.forEach(k => { cur[k] = Array.isArray(PAL.night[k]) ? PAL.night[k].slice() : PAL.night[k] })
  }
  snap()

  /* ---------------- stars + moon ---------------- */
  const starCount = reduced ? 90 : isTouch ? 260 : 620
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
    color: 0xf4efe6, size: 0.55, transparent: true,
    opacity: 0, depthWrite: false, sizeAttenuation: true
  })
  const stars = new THREE.Points(starGeo, starMat)
  stars.frustumCulled = false
  scene.add(stars)

  /* moon: soft disc, fixed in the sky, never rotates with input (§5) */
  const moonMat = new THREE.SpriteMaterial({
    map: makeMoonTexture(), transparent: true, opacity: 0, depthWrite: false
  })
  const moon = new THREE.Sprite(moonMat)
  moon.position.set(52, 46, -96)
  moon.scale.setScalar(9)
  scene.add(moon)

  /* ---------------- precipitation ---------------- */
  const fallCount = reduced ? 90 : isTouch ? 260 : 620
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
    color: 0xf6f4ef, size: 0.115, transparent: true, opacity: 0, depthWrite: false
  })
  const petalMat = new THREE.PointsMaterial({
    color: 0xf0c3cb, size: 0.095, transparent: true, opacity: 0, depthWrite: false
  })
  const snow = new THREE.Points(fallGeo, snowMat)
  const petalGeo = fallGeo.clone()
  const petals = new THREE.Points(petalGeo, petalMat)
  snow.frustumCulled = petals.frustumCulled = false
  camera.add(snow); camera.add(petals)

  /* ---------------- sakura ---------------- */
  const cherry = []
  for (let i = 0; i < 7; i++){
    const g = new THREE.Group()
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.16, 2.4, 6),
      new THREE.MeshBasicMaterial({ color: 0x3a2c26 })
    )
    trunk.position.y = 1.2
    g.add(trunk)
    const blossomMat = new THREE.MeshBasicMaterial({ color: 0xe4b3bf, transparent: true, opacity: 0 })
    for (let b = 0; b < 3; b++){
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.05, 8, 6), blossomMat)
      canopy.position.set((Math.random()-0.5)*0.8, 2.5 + b*0.42, (Math.random()-0.5)*0.8)
      canopy.scale.y = 0.72
      g.add(canopy)
    }
    const side = i % 2 === 0 ? 1 : -1
    g.position.set(side * (5.6 + (i % 3) * 0.6), 0, -18 - i * 12 - Math.random() * 4)
    g.userData = { mat: blossomMat, phase: Math.random() * 6.28, burst: 0 }
    city.add(g)
    cherry.push(g)
  }

  const sun = new THREE.DirectionalLight(0xffffff, 0.4)
  scene.add(sun)
  const amb = new THREE.HemisphereLight(0xbfd4e8, 0x1a1714, 0.3)
  scene.add(amb)

  const bgCol = new THREE.Color()
  const fogCol = new THREE.Color()
  const tintV = new THREE.Vector3()
  const sunPos = new THREE.Vector3()

  let mode = 'night'
  let autoEvery = 'off'
  let autoTimer = null
  let autoIdx = 0
  let listeners = []
  let petalBoost = 0

  function targetPal(name){ return PAL[name] || PAL.night }

  function applyMode(name, opts){
    opts = opts || {}
    if (!PAL[name]) return
    const changed = name !== mode
    mode = name
    keys.forEach(k => { from[k] = Array.isArray(cur[k]) ? cur[k].slice() : cur[k] })
    to.__pal = PAL[name]
    tween = 0
    tweenDur = opts.instant ? 0.001 : TRANSITION_SEC
    if (opts.instant) { tween = 1 }
    if (changed) listeners.forEach(fn => fn(name))
  }

  function autoSet(key){
    autoEvery = key
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null }
    const ms = AUTO_MS[key]
    if (!ms){ applyMode('night'); autoIdx = AUTO_CYCLE.indexOf('night'); return }
    autoTimer = setInterval(() => {
      autoIdx = (autoIdx + 1) % AUTO_CYCLE.length
      applyMode(AUTO_CYCLE[autoIdx])
    }, ms)
    listeners.forEach(fn => fn(mode))
  }

  function advancePetal(amount){ petalBoost = Math.min(1, petalBoost + amount) }

  function update(dt, time){
    /* eased, time-boxed transition */
    if (tween < 1){
      tween = Math.min(1, tween + dt / tweenDur)
      const g = targetPal(mode)
      const e = tween < 0.5 ? 4*tween*tween*tween : 1 - Math.pow(-2*tween + 2, 3) / 2
      keys.forEach(k => {
        if (Array.isArray(g[k])){
          if (!cur[k]) cur[k] = g[k].slice()
          for (let i = 0; i < g[k].length; i++) cur[k][i] = lerp(from[k][i], g[k][i], e)
        } else {
          cur[k] = lerp(from[k], g[k], e)
        }
      })
    }

    bgCol.setHex(0).setHex(cur.bg | 0)
    fogCol.setHex(0).setHex(cur.fog | 0)
    scene.background = bgCol
    if (scene.fog){ scene.fog.color = fogCol; scene.fog.density = cur.fogDensity }

    if (grade && grade.uniforms){
      if (grade.uniforms.uTint) grade.uniforms.uTint.value = tintV.set(cur.tint[0], cur.tint[1], cur.tint[2])
      if (grade.uniforms.uExposure) grade.uniforms.uExposure.value = cur.exposure
    }

    sun.intensity = cur.light
    sun.position.copy(sunPos.set(cur.sun[0], cur.sun[1], cur.sun[2]))
    amb.intensity = cur.amb

    /* stars + moon fade in gradually, never on mouse move */
    starMat.opacity = cur.stars * 0.5
    stars.visible = cur.stars > 0.02
    if (stars.visible && !reduced){
      const sp = starGeo.attributes.position
      for (let i = 0; i < starCount; i++){
        sp.setY(i, sp.getY(i) + Math.sin(time * 0.6 + starSeed[i]) * 0.0006)
      }
      sp.needsUpdate = true
    }
    moonMat.opacity = cur.moon * 0.85
    moon.visible = cur.moon > 0.02

    /* precipitation */
    snowMat.opacity = cur.snow * 0.8
    snow.visible = cur.snow > 0.02
    if (snow.visible){
      const sp = fallGeo.attributes.position
      for (let i = 0; i < fallCount; i++){
        let y = sp.getY(i) - (0.85 + fallSeed[i] * 0.6) * dt
        let x = sp.getX(i) + Math.sin(time * 0.5 + fallSeed[i] * 8) * 0.5 * dt
        if (y < -1){ y = 24; x = (Math.random() - 0.5) * 40 }
        sp.setY(i, y); sp.setX(i, x)
      }
      sp.needsUpdate = true
    }

    /* petals: subtle base fall, denser right beside a tree (§3) */
    const nearTree = nearestCherryDist(camera.position)
    const local = Math.max(0, 1 - nearTree / 9)
    const density = Math.min(1, cur.petal + petalBoost)
    petalBoost = Math.max(0, petalBoost - dt * 0.55)
    petalMat.opacity = density * (0.34 + local * 0.4)
    petals.visible = density > 0.02
    if (petals.visible){
      const pg = petalGeo.attributes.position
      for (let i = 0; i < fallCount; i++){
        const drift = 0.34 + local * 0.5
        let y = pg.getY(i) - (0.4 + fallSeed[i] * 0.35) * dt
        let x = pg.getX(i) + Math.sin(time * 0.9 + fallSeed[i] * 9) * drift * dt
        if (y < -1){ y = 22; x = (Math.random() - 0.5) * 38 }
        pg.setY(i, y); pg.setX(i, x)
      }
      pg.needsUpdate = true
    }

    /* rain thins in daylight, keeps its presence at night */
    const rainWant = mode === 'night' ? 0.34 : mode === 'sunset' ? 0.24 : mode === 'spring' ? 0.12 : mode === 'snow' ? 0.08 : 0.05
    rainMat.opacity = lerp(rainMat.opacity, rainWant, 0.02)
    rain.visible = rainMat.opacity > 0.02

    /* sakura: blossom fades in, and a tree you are close to releases petals */
    cherry.forEach(tr => {
      const u = tr.userData
      if (!reduced) tr.rotation.z = Math.sin(time * 0.5 + u.phase) * 0.018
      u.mat.opacity = cur.petal * 0.9
      tr.visible = cur.petal > 0.02
      const d = tr.position.distanceTo(camera.position)
      if (d < 7 && cur.petal > 0.3) u.burst = Math.min(1, u.burst + dt * 1.4)
      else u.burst = Math.max(0, u.burst - dt * 0.5)
    })
  }

  function nearestCherryDist(pos){
    let best = 1e9
    for (const tr of cherry){
      const d = tr.position.distanceTo(pos)
      if (d < best) best = d
    }
    return best
  }

  return {
    state: { get mode(){ return mode }, cur },
    applyMode,
    autoSet,
    advancePetal,
    update,
    onChange(fn){ listeners.push(fn) },
    transitioning(){ return tween < 1 },
    label(){ return targetPal(mode).label },
    modes: Object.keys(PAL),
    autoKey(){ return autoEvery }
  }
}

function makeMoonTexture(){
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const x = c.getContext('2d')
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 62)
  g.addColorStop(0, 'rgba(255,250,238,1)')
  g.addColorStop(0.45, 'rgba(246,238,220,0.85)')
  g.addColorStop(0.72, 'rgba(220,210,190,0.22)')
  g.addColorStop(1, 'rgba(200,190,170,0)')
  x.fillStyle = g
  x.beginPath(); x.arc(64, 64, 62, 0, Math.PI * 2); x.fill()
  const tex = new THREE.CanvasTexture(c)
  return tex
}