import * as THREE from 'three'

const PAL = {
  night: {
    label: 'Night',
    bg: 0x0d0c11,
    fog: 0x0d0c11,
    fogDensity: 0.008,
    tint: [1.0, 1.0, 1.0],
    exposure: 1.0,
    light: 0.42,
    snow: 0,
    petal: 0,
    stars: 1,
    pedDensity: 1.0,
    traffic: 1.0,
    signs: 1.0,
    windows: 1.0
  },
  day: {
    label: 'Day',
    bg: 0x8fa6b8,
    fog: 0x93a9ba,
    fogDensity: 0.011,
    tint: [1.16, 1.12, 1.02],
    exposure: 1.22,
    light: 1.0,
    snow: 0,
    petal: 0,
    stars: 0,
    pedDensity: 1.25,
    traffic: 1.15,
    signs: 0.45,
    windows: 0.25
  },
  spring: {
    label: 'Spring',
    bg: 0x2b2a33,
    fog: 0x3a3742,
    fogDensity: 0.009,
    tint: [1.1, 1.0, 1.05],
    exposure: 1.1,
    light: 0.72,
    snow: 0,
    petal: 1,
    stars: 0.4,
    pedDensity: 1.1,
    traffic: 0.9,
    signs: 0.8,
    windows: 0.7
  },
  snow: {
    label: 'Snow',
    bg: 0x1b2029,
    fog: 0x252c37,
    fogDensity: 0.013,
    tint: [0.94, 0.99, 1.12],
    exposure: 1.05,
    light: 0.55,
    snow: 1,
    petal: 0,
    stars: 0.2,
    pedDensity: 0.7,
    traffic: 0.6,
    signs: 1.15,
    windows: 1.25
  }
}

export function createAtmosphere(ctx){
  const { scene, camera, city, rain, rainGeo, rainMat, rainCount } = ctx
  const grade = ctx.gradePass
  const isTouch = ctx.IS_TOUCH

  const state = {
    mode: 'night',
    cur: { ...PAL.night },
    t: 0
  }

  const starCount = isTouch ? 260 : 620
  const starGeo = new THREE.BufferGeometry()
  const starPos = new Float32Array(starCount * 3)
  const starSeed = new Float32Array(starCount)
  for (let i = 0; i < starCount; i++){
    const r = 90 + Math.random() * 120
    const a = Math.random() * Math.PI * 2
    const y = 28 + Math.random() * 60
    starPos[i*3] = Math.cos(a) * r
    starPos[i*3+1] = y
    starPos[i*3+2] = Math.sin(a) * r - 40
    starSeed[i] = Math.random() * 6.28
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
  const starMat = new THREE.PointsMaterial({
    color: 0xf4efe6, size: 0.55, transparent: true,
    opacity: 0.5, depthWrite: false, sizeAttenuation: true
  })
  const stars = new THREE.Points(starGeo, starMat)
  scene.add(stars)

  const fallCount = isTouch ? 420 : 1000
  const fallGeo = new THREE.BufferGeometry()
  const fallPos = new Float32Array(fallCount * 3)
  const fallSeed = new Float32Array(fallCount)
  for (let i = 0; i < fallCount; i++){
    fallPos[i*3] = (Math.random() - 0.5) * 44
    fallPos[i*3+1] = Math.random() * 26
    fallPos[i*3+2] = -40 + Math.random() * 52
    fallSeed[i] = Math.random()
  }
  fallGeo.setAttribute('position', new THREE.BufferAttribute(fallPos, 3))
  const snowMat = new THREE.PointsMaterial({
    color: 0xf6f4ef, size: 0.13, transparent: true,
    opacity: 0, depthWrite: false
  })
  const petalMat = new THREE.PointsMaterial({
    color: 0xf2c6cd, size: 0.11, transparent: true,
    opacity: 0, depthWrite: false
  })
  const snow = new THREE.Points(fallGeo, snowMat)
  const petals = new THREE.Points(fallGeo.clone(), petalMat)
  snow.frustumCulled = false
  petals.frustumCulled = false
  camera.add(snow)
  camera.add(petals)

  const skyLight = new THREE.DirectionalLight(0xffffff, 0.4)
  skyLight.position.set(-40, 70, 20)
  scene.add(skyLight)
  const skyAmb = new THREE.HemisphereLight(0xbfd4e8, 0x1a1714, 0.3)
  scene.add(skyAmb)

  const cherry = []
  for (let i = 0; i < 7; i++){
    const g = new THREE.Group()
    const trunkMat = new THREE.MeshBasicMaterial({ color: 0x3a2c26 })
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 2.4, 6), trunkMat)
    trunk.position.y = 1.2
    g.add(trunk)
    const blossomMat = new THREE.MeshBasicMaterial({
      color: 0xe8b9c4, transparent: true, opacity: 0
    })
    for (let b = 0; b < 3; b++){
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.05, 8, 6), blossomMat)
      canopy.position.set((Math.random() - 0.5) * 0.8, 2.5 + b * 0.42, (Math.random() - 0.5) * 0.8)
      canopy.scale.y = 0.72
      g.add(canopy)
    }
    const side = i % 2 === 0 ? 1 : -1
    g.position.set(side * (5.6 + (i % 3) * 0.6), 0, -18 - i * 12 - Math.random() * 4)
    g.userData = { mat: blossomMat, phase: Math.random() * 6.28 }
    city.add(g)
    cherry.push(g)
  }

  const accum = {
    snow: snowGeoAccum(fallGeo),
    petal: null
  }

  function snowGeoAccum(g){ return g }

  const bgCol = new THREE.Color(PAL.night.bg)
  const fogCol = new THREE.Color(PAL.night.fog)

  function target(){ return PAL[state.mode] || PAL.night }

  function lerp(a, b, t){ return a + (b - a) * t }

  function applyMode(name, instant){
    if (!PAL[name]) return
    state.mode = name
    state.instant = !!instant
  }

  function update(dt, time, focus){
    state.t += dt
    const g = target()
    const k = state.instant ? 1 : 1 - Math.pow(0.02, dt)
    state.instant = false

    const c = state.cur
    c.bg = lerp(c.bg, g.bg, k)
    c.fog = lerp(c.fog, g.fog, k)
    c.fogDensity = lerp(c.fogDensity, g.fogDensity, k)
    c.light = lerp(c.light, g.light, k)
    c.exposure = lerp(c.exposure, g.exposure, k)
    c.snow = lerp(c.snow, g.snow, k)
    c.petal = lerp(c.petal, g.petal, k)
    c.stars = lerp(c.stars, g.stars, k)
    c.pedDensity = lerp(c.pedDensity, g.pedDensity, k)
    c.traffic = lerp(c.traffic, g.traffic, k)
    c.signs = lerp(c.signs, g.signs, k)
    c.windows = lerp(c.windows, g.windows, k)
    c.tr = lerp(c.tr || g.tint[0], g.tint[0], k)
    c.tg = lerp(c.tg || g.tint[1], g.tint[1], k)
    c.tb = lerp(c.tb || g.tint[2], g.tint[2], k)

    bgCol.setHex(0).setHex(c.bg | 0)
    fogCol.setHex(0).setHex(c.fog | 0)
    scene.background = bgCol
    scene.fog.color = fogCol
    scene.fog.density = c.fogDensity

    if (grade && grade.uniforms){
      if (grade.uniforms.uTint) grade.uniforms.uTint.value = new THREE.Vector3(c.tr, c.tg, c.tb)
      if (grade.uniforms.uExposure) grade.uniforms.uExposure.value = c.exposure
    }

    skyLight.intensity = c.light
    skyAmb.intensity = 0.16 + c.light * 0.28

    stars.material.opacity = c.stars * 0.55
    stars.visible = c.stars > 0.02
    if (stars.visible){
      const sp = starGeo.attributes.position
      for (let i = 0; i < starCount; i++){
        const b = starSeed[i]
        sp.setY(i, sp.getY(i) + Math.sin(time * 0.6 + b) * 0.0006)
      }
      sp.needsUpdate = true
    }

    snowMat.opacity = c.snow * 0.85
    snow.visible = c.snow > 0.02
    petalMat.opacity = c.petal * 0.8
    petals.visible = c.petal > 0.02

    if (snow.visible){
      const sp = fallGeo.attributes.position
      for (let i = 0; i < fallCount; i++){
        let y = sp.getY(i) - (1.1 + fallSeed[i] * 0.8) * dt
        let x = sp.getX(i) + Math.sin(time * 0.6 + fallSeed[i] * 8) * 0.06 * dt
        if (y < -1){ y = 26; x = (Math.random() - 0.5) * 44 }
        sp.setY(i, y); sp.setX(i, x)
      }
      sp.needsUpdate = true
    }

    if (petals.visible){
      const pGeo = petals.geometry.attributes.position
      const src = fallGeo.attributes.position
      for (let i = 0; i < fallCount; i++){
        let y = pGeo.getY(i) - (0.55 + fallSeed[i] * 0.5) * dt
        let x = pGeo.getX(i) + Math.sin(time * 1.1 + fallSeed[i] * 9) * 0.5 * dt
        if (y < -1){ y = 24; x = (Math.random() - 0.5) * 42 }
        pGeo.setY(i, y); pGeo.setX(i, x)
      }
      pGeo.needsUpdate = true
    }

    rainMat.opacity = 0.34 * (state.mode === 'night' ? 1 : state.mode === 'spring' ? 0.3 : 0.12)
    rain.visible = rainMat.opacity > 0.02

    cherry.forEach(tr => {
      const u = tr.userData
      tr.rotation.z = Math.sin(time * 0.5 + u.phase) * 0.02
      u.mat.opacity = c.petal * 0.92
      tr.visible = c.petal > 0.02
    })
  }

  function tintGrade(hex){ return hex }

  return {
    state,
    applyMode,
    update,
    label(){ return (PAL[state.mode] || PAL.night).label },
    modes: Object.keys(PAL)
  }
}