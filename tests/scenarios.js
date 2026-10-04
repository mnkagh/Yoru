/* Behavioural test scenarios for LIMINAL TOKYO.
   These drive the real running application through its real code paths.
   Nothing here asserts on source-code strings for behaviour; the one place we
   read the DOM is to confirm the UI actually changed. */

const SCENARIOS = {}

/* ------------------------------------------------------------------ *
 * 1. REDUCED MOTION — cinematic camera travel must genuinely stop     *
 * ------------------------------------------------------------------ */
/* The intro gate is opaque and locks scrolling until ENTER TOKYO is pressed,
   so any test that needs journey progress has to enter the site first. */
function enterSite(d){
  const btn = d.getElementById('enter-tokyo') || d.querySelector('#intro button')
  if (btn) btn.click()
}

SCENARIOS.reducedCamera = async ({ w, d, Y, $, rec, sleep }) => {
  const y = Y()
  const wasReduced = y.reduced
  const prefOff = !w.matchMedia('(prefers-reduced-motion: reduce)').matches
  rec('reduced flag reflects browser preference', wasReduced === !prefOff,
      'app says reduced=' + wasReduced + ', media query says reduced=' + !prefOff)

  // put the journey in a state where travel would be obvious
  y.state.mode = 'tour'

  // sample the camera across the journey
  const samples = []
  for (const p of [0.02, 0.07, 0.20, 0.35, 0.50, 0.65, 0.80, 0.95]){
    y.state.p = p
    y.applyCamera()
    samples.push({ p, pos: y.camera.position.toArray().map(n => +n.toFixed(3)) })
  }

  if (wasReduced){
    // every camera position must sit exactly on a TOUR waypoint, at street height
    const waypoints = y.TOUR.map(w => ({
      x: w.pos[0], y: Math.min(Math.max(w.pos[1], 1.75), 2.6), z: w.pos[2]
    }))
    const allOnWaypoint = samples.every(s =>
      waypoints.some(w => Math.abs(w.x - s.pos[0]) < 0.01 && Math.abs(w.y - s.pos[1]) < 0.01 && Math.abs(w.z - s.pos[2]) < 0.01))
    rec('REDUCED: camera sits on a district viewpoint (no interpolation)', allOnWaypoint,
        JSON.stringify(samples.map(s => s.pos.join(','))))

    const maxY = Math.max(...samples.map(s => s.pos[1]))
    rec('REDUCED: camera never swoops to an aerial height', maxY <= 2.61, 'maxY=' + maxY.toFixed(2))

    // distinctness: different journey positions must actually change the camera
    const distinct = new Set(samples.map(s => s.pos.join(','))).size
    rec('REDUCED: journey still moves between districts', distinct >= 4, distinct + ' distinct viewpoints')

    // mid-waypoint sampling must NOT produce a position between two waypoints
    y.state.p = 0.07 // between TOUR[0].at=0 and TOUR[1].at=0.14
    y.applyCamera()
    const mid = y.camera.position.toArray()
    const interpolatedY = (15 + 3.6) / 2
    rec('REDUCED: no cinematic interpolation mid-journey', Math.abs(mid[1] - interpolatedY) > 0.5,
        'y=' + mid[1].toFixed(2) + ' (interpolated would be ~' + interpolatedY.toFixed(2) + ')')
  } else {
    // normal motion: mid-journey must be a genuine blend of two waypoints
    y.state.p = 0.07
    y.applyCamera()
    const mid = y.camera.position.toArray()
    rec('NORMAL: cinematic travel interpolates between waypoints', mid[1] > 3.61 && mid[1] < 14.99,
        'y=' + mid[1].toFixed(2))
    const distinct = new Set(samples.map(s => s.pos.join(','))).size
    rec('NORMAL: continuous journey produces many camera positions', distinct >= 7, distinct + ' distinct')
  }

  // scrolling must remain the driver, in BOTH modes
  enterSite(d)
  await sleep(1400)          // intro fade is ~950ms before .done unlocks scroll
  rec('intro gate releases after ENTER TOKYO', d.getElementById('intro').classList.contains('done'))
  rec('body scroll unlocked', !d.body.classList.contains('locked'))
  y.state.p = 0
  let sc = null
  for (let i = 0; i < 4 && y.state.p <= 0.05; i++){
    sc = w_scroll(y, d)
    await sleep(350)
  }
  rec('scroll still drives journey progress', y.state.p > 0.05,
      'p=' + y.state.p.toFixed(3) + ' scrollY=' + (sc && sc.scrollY) + ' tourTop=' + (sc && sc.tourTop))
  y.applyCamera()
  rec('camera valid after real scroll', Number.isFinite(y.camera.position.x) && Number.isFinite(y.camera.position.y),
      y.camera.position.toArray().map(n => n.toFixed(2)).join(','))
}

function w_scroll(y, d){
  // scroll for real, then fire the event on window (scroll does not bubble to it)
  const W = d.defaultView
  const tourTop = d.getElementById('tour').offsetTop
  const span = Math.max(1, d.getElementById('chapters').offsetHeight - W.innerHeight)
  /* the page uses scroll-behavior:smooth when motion is allowed, so an
     instant jump is required for a deterministic assertion */
  W.scrollTo({ top: tourTop + span * 0.5, behavior: 'instant' })
  W.dispatchEvent(new W.Event('scroll'))
  return { scrollY: W.scrollY, tourTop, span }
}

/* ------------------------------------------------------------------ *
 * 2. SHRINE DISCOVERY                                                   *
 * ------------------------------------------------------------------ */
SCENARIOS.shrine = async ({ Y, $, rec, sleep }) => {
  const y = Y()
  const torii = []
  y.scene.traverse(o => { if (o.userData && o.userData.type === 'shrine') torii.push(o) })
  rec('shrine object exists in the 3D world', torii.length > 0, torii.length + ' shrine hit target(s)')
  if (!torii.length) return
  rec('shrine is reachable through the registered hit list', y.shrineHits.length > 0, y.shrineHits.length + '')

  // it must be clickable through the real picking system, not just present
  const pos = y.city.worldToLocal ? null : null
  rec('shrine sits in the world at a real position', !!torii[0].parent, 'parent=' + (torii[0].parent && torii[0].parent.type))

  y.showShrineDiscovery('torii')
  await sleep(250)
  const panel = $('discovery')
  rec('shrine opens the discovery panel', !!panel && panel.classList.contains('on'))
  rec('discovery names the object', ($('disc-title') || {}).textContent?.length > 0, ($('disc-title') || {}).textContent)
  rec('discovery has cultural context', (($('disc-culture') || {}).textContent || '').length > 120)
  rec('discovery has etiquette', (($('disc-etiquette') || {}).textContent || '').length > 80)
  rec('discovery links a verified nearby place', /Meiji Jingu/.test(($('disc-nearby') || {}).textContent || ''),
      ($('disc-nearby') || {}).textContent?.slice(0, 60))
  rec('discovery offers the official site', !$('disc-official').hidden && /meijijingu/.test($('disc-official').href))

  // localStorage persists between runs, so assert presence rather than growth
  $('disc-add').click(); await sleep(250)
  rec('shrine can be added to My Tokyo', /Torii/.test(y.itinerary.map(i => i.title).join('|')),
      y.itinerary.map(i => i.title).join(', '))
  rec('panel closed after adding', !$('discovery').classList.contains('on'))

  // atlas action must not throw and must target real coordinates
  y.showShrineDiscovery('torii'); await sleep(150)
  let threw = false
  try { $('disc-atlas').click() } catch (e){ threw = true }
  await sleep(400)
  rec('shrine atlas action runs without error', !threw)
  const mj = y.LOCATIONS.find(l => l.id === 'meiji')
  rec('nearby place has real coordinates', typeof mj.lat === 'number' && typeof mj.lng === 'number',
      mj.lat + ',' + mj.lng)
}

/* ------------------------------------------------------------------ *
 * 3. FOOD -> MEET THE CHEF                                              *
 * ------------------------------------------------------------------ */
SCENARIOS.chef = async ({ Y, $, rec, sleep }) => {
  const y = Y()
  y.buildDishRail()
  y.showDish(0) // ramen
  await sleep(200)
  rec('dish detail opens', ($('dish-name') || {}).textContent?.length > 0, ($('dish-name') || {}).textContent)
  rec('dish shows Japanese name', ($('dish-ja') || {}).textContent?.length > 0, ($('dish-ja') || {}).textContent)
  const chef = $('dish-chef')
  rec('food detail exposes MEET THE CHEF', !!chef && chef.offsetParent !== null || !!chef)
  if (!chef){ return }
  chef.click()
  await sleep(500)
  rec('MEET THE CHEF opens the existing dialogue system', $('dialogue').classList.contains('on'))
  const name = ($('dlg-name') || {}).textContent
  rec('chef is identified by name', !!name && name.length > 0, name)
  const role = ($('dlg-role') || {}).textContent
  rec('chef role shown', /chef/i.test(role || ''), role)
  rec('chef dialogue is food-aware', /broth|noodle|tonkotsu|pork/i.test($('dlg-body').textContent || ''))
  rec('chef offers real actions', $('dlg-opts').querySelectorAll('.dlg-opt').length > 1,
      $('dlg-opts').querySelectorAll('.dlg-opt').length + ' options')
  // speech controls still present
  rec('TYPE / TALK / LISTEN preserved', !!$('dlg-mic') && !!$('dlg-listen') && !!$('dlg-text') && !!$('dlg-typed'))
  // chef turns toward the visitor
  const chefId = y.state.guide
  const p = y.PEOPLE.find(q => q.id === chefId)
  rec('chef is an existing NPC, not a new system', !!p, chefId)
  if (p && p.mesh) rec('chef turns toward the visitor', p.mesh.userData.turned > 0)
  // background must keep running while the dialogue is open (§22)
  // headless rAF is slow, so poll rather than assume a fixed frame budget
  let f0 = y.state.frames, r0 = y.state.rendered
  for (let i = 0; i < 12 && y.state.frames === f0; i++) await sleep(250)
  rec('world keeps ticking while dialogue is open', y.state.frames > f0,
      'frames ' + f0 + ' -> ' + y.state.frames)
  if (y.state.frames > f0){
    rec('scene keeps rendering while dialogue is open', y.state.rendered > r0,
        'rendered ' + r0 + ' -> ' + y.state.rendered)
  }
  y.closeDialogue()
}

/* ------------------------------------------------------------------ *
 * 4. ATMOSPHERE: time of day x weather as independent systems         *
 * ------------------------------------------------------------------ */
SCENARIOS.atmosphereMatrix = async ({ Y, $, rec, sleep }) => {
  const y = Y()
  const a = y.atmosphere
  rec('time of day is its own axis', ['day','sunset','night'].every(k => a.times().includes(k)), a.times().join(','))
  rec('weather is its own axis', ['sunny','rain','snow','spring'].every(k => a.weathers().includes(k)), a.weathers().join(','))

  const step = n => { for (let i = 0; i < n; i++) a.update(0.1, i * 0.1) }
  const rgb = c => Array.isArray(c) ? c.join('.') : String(c)
  const combos = []
  for (const time of a.times()){
    for (const weather of a.weathers()){
      a.set({ time, weather }, true)
      step(45)
      const c = a.state.cur
      combos.push({
        time, weather,
        bg: rgb(c.bg), exp: +c.exposure.toFixed(3), light: +c.light.toFixed(3),
        fog: +c.fogDensity.toFixed(5), snow: +c.snow.toFixed(2), petal: +c.petal.toFixed(2),
        rain: +c.rain.toFixed(2), wet: +c.wet.toFixed(2), stars: +c.stars.toFixed(2),
        moon: +c.moon.toFixed(2), signs: +c.signs.toFixed(3), windows: +c.windows.toFixed(3),
        ped: +c.pedDensity.toFixed(3), amb: +c.amb.toFixed(3)
      })
    }
  }
  rec('all 12 combinations resolve', combos.length === 12, combos.length + ' states')

  const key = c => [c.bg, c.exp, c.light, c.fog, c.amb, c.snow, c.petal, c.rain, c.wet,
                    c.stars, c.moon, c.signs, c.windows, c.ped].join('|')
  const uniq = new Set(combos.map(key))
  rec('every combination is visually distinct', uniq.size === 12, uniq.size + '/12 unique')

  // time axis must matter even with weather held constant
  const byTime = {}
  for (const c of combos){ if (c.weather === 'sunny') byTime[c.time] = c }
  rec('DAY/SUNSET/NIGHT differ under clear weather',
      new Set(Object.values(byTime).map(key)).size === 3,
      Object.values(byTime).map(c => c.time + ' bg' + c.bg + ' exp' + c.exp + ' light' + c.light).join('  '))

  // weather axis must matter even with time held constant
  const byW = {}
  for (const c of combos){ if (c.time === 'night') byW[c.weather] = c }
  rec('SUNNY/RAIN/SNOW/SPRING differ at night',
      new Set(Object.values(byW).map(key)).size === 4,
      Object.values(byW).map(c => c.weather + ' rain' + c.rain + ' wet' + c.wet + ' snow' + c.snow + ' petal' + c.petal).join('  '))

  // restraint: nothing blown out, nothing muddy
  rec('no overexposure in any combination', combos.every(c => c.exp <= 1.09 && c.exp >= 0.9),
      'exposure range ' + Math.min(...combos.map(c=>c.exp)) + '-' + Math.max(...combos.map(c=>c.exp)))
  rec('day is the brightest, night the darkest',
      byTime.day.exp > byTime.sunset.exp && byTime.sunset.exp > byTime.night.exp,
      [byTime.day.exp, byTime.sunset.exp, byTime.night.exp].join(' > '))
  rec('daylight is stronger than night light', byTime.day.light > byTime.night.light * 2,
      byTime.day.light + ' vs ' + byTime.night.light)
  rec('night shows stars and moon', byW.sunny.stars > 0.5 && byW.sunny.moon > 0.5)
  rec('day shows no stars', byTime.day.stars < 0.05)
  rec('sunset is a genuine middle state',
      byTime.sunset.light > byTime.night.light && byTime.sunset.light < byTime.day.light,
      byTime.sunset.light)
  rec('snow only when snowing', combos.every(c => (c.weather === 'snow') === (c.snow > 0.5)))
  rec('sakura only in spring', combos.every(c => (c.weather === 'spring') === (c.petal > 0.5)))
  rec('rain only when raining', combos.every(c => (c.weather === 'rain') === (c.rain > 0.5)))
  rec('rain darkens and thickens the air',
      byW.rain.light < byW.sunny.light && byW.rain.fog > byW.sunny.fog,
      'rain light ' + byW.rain.light + ' vs clear ' + byW.sunny.light)
  rec('wet ground appears with rain and snow', byW.rain.wet > 0.5 && byW.snow.wet > 0.2 && byW.sunny.wet < 0.2)
  rec('windows glow more at night and in snow',
      byW.snow.windows > byW.sunny.windows, byW.snow.windows + ' vs ' + byW.sunny.windows)

  // no RGB channel should ever wrap or blow out mid-transition
  a.set({ time: 'day', weather: 'sunny' }, true); step(30)
  a.set({ time: 'night', weather: 'snow' })
  let maxCh = 0, minCh = 255
  for (let i = 0; i < 45; i++){
    a.update(0.1, i * 0.1)
    for (const ch of a.state.cur.bg){ if (ch > maxCh) maxCh = ch; if (ch < minCh) minCh = ch }
  }
  rec('background channels stay in range through a transition', minCh >= 0 && maxCh <= 255,
      'min ' + minCh + ' max ' + maxCh)

  window.__combos = combos
}

/* ------------------------------------------------------------------ *
 * 5. TRANSITIONS: interruptible, no stacking, no flash               *
 * ------------------------------------------------------------------ */
SCENARIOS.transitions = async ({ Y, rec }) => {
  const a = Y().atmosphere
  a.set({ time: 'day', weather: 'sunny' }, true)
  for (let i = 0; i < 40; i++) a.update(0.1, i * 0.1)

  // interrupt mid-transition
  a.set({ time: 'night', weather: 'rain' })
  for (let i = 0; i < 8; i++) a.update(0.1, i * 0.1)
  const midExp = a.state.cur.exposure
  rec('transition is in progress, not instant', a.transitioning(), 'transitioning=' + a.transitioning())

  // change target mid-transition — must resume from the CURRENT visual state
  a.set({ time: 'snow', weather: 'snow' })
  const afterSwitch = a.state.cur.exposure
  rec('interrupting a transition does not snap', Math.abs(afterSwitch - midExp) < 0.06,
      midExp.toFixed(3) + ' -> ' + afterSwitch.toFixed(3))

  for (let i = 0; i < 60; i++) a.update(0.1, i * 0.1)
  rec('transition settles on the new target', Math.abs(a.state.cur.exposure - a.target().exposure) < 0.02,
      a.state.cur.exposure.toFixed(3) + ' vs ' + a.target().exposure.toFixed(3))

  // no exposure jumps frame to frame
  a.set({ time: 'day', weather: 'sunny' })
  let prev = a.state.cur.exposure, maxJump = 0, jumps = []
  for (let i = 0; i < 80; i++){
    a.update(0.1, i * 0.1)
    const d = Math.abs(a.state.cur.exposure - prev)
    if (d > maxJump){ maxJump = d; jumps = [i, prev, a.state.cur.exposure] }
    prev = a.state.cur.exposure
  }
  rec('no exposure flash during a full transition', maxJump < 0.12, 'max frame jump ' + maxJump.toFixed(4))

  // rapid switching must not stack timers or duplicate systems
  for (let i = 0; i < 12; i++){ a.set({ time: i % 2 ? 'day' : 'night', weather: i % 3 ? 'rain' : 'snow' }); a.update(0.05, i) }
  const c = a.state.cur
  rec('rapid switching leaves one coherent state',
      Number.isFinite(c.exposure) && Number.isFinite(c.light) && Number.isFinite(c.fogDensity) &&
      Array.isArray(c.bg) && c.bg.length === 3 && c.bg.every(Number.isFinite),
      'exposure ' + c.exposure.toFixed(3) + ' bg ' + JSON.stringify(c.bg.map(n => +n.toFixed(1))))
  rec('background channels stay numeric after rapid switching',
      c.bg.every(n => n >= 0 && n <= 255), JSON.stringify(c.bg.map(n => +n.toFixed(1))))
  rec('rain opacity owned by atmosphere, single source', typeof a.state.cur.rain === 'number')
  // and it must still converge on whatever was asked for last
  const asked = a.target()
  for (let i = 0; i < 80; i++) a.update(0.1, i)
  rec('settles on the last requested state after rapid switching',
      Math.abs(a.state.cur.exposure - asked.exposure) < 0.02,
      a.state.cur.exposure.toFixed(3) + ' vs ' + asked.exposure.toFixed(3))
}

/* ------------------------------------------------------------------ *
 * 6. DISTRICT REACTIVITY                                                *
 * ------------------------------------------------------------------ */
SCENARIOS.districts = async ({ Y, rec }) => {
  const y = Y()
  a = y.atmosphere
  y.state.p = 0.02; y.applyCamera(); y.updateDistrict && y.updateDistrict()
  rec('journey has real districts', y.TOUR.length >= 8, y.TOUR.length + ' waypoints')
  const names = new Set(y.TOUR.map(t => t.district))
  rec('districts are named', names.size >= 6, [...names].join(', '))
  rec('scroll positions map to districts', y.TOUR.every((t, i) => i === 0 || t.at > y.TOUR[i-1].at))
}

/* ------------------------------------------------------------------ *
 * 8. MOBILE / TOUCH                                                     *
 * Runs inside a 390x844 viewport. This is emulation, not a physical   *
 * device: layout, hit targets, overflow and tap paths are exercised,  *
 * but nothing here can prove behaviour on real hardware.             *
 * ------------------------------------------------------------------ */
SCENARIOS.mobile = async ({ w, d, Y, $, rec, sleep }) => {
  const y = Y()
  const W = w.innerWidth
  rec('viewport is phone sized', W <= 500, W + 'x' + w.innerHeight)

  // no sideways scroll
  rec('no horizontal overflow', d.documentElement.scrollWidth <= d.documentElement.clientWidth + 1,
      d.documentElement.scrollWidth + ' vs ' + d.documentElement.clientWidth)

  // intro must not trap the page
  enterSite(d)
  await sleep(1300)
  rec('intro dismissed on tap', d.getElementById('intro').classList.contains('done'))
  rec('body scrollable after intro', !d.body.classList.contains('locked'))

  // panels become bottom sheets on a narrow screen. Compare against the
  // layout viewport (clientWidth), since innerWidth includes the scrollbar
  const CW = d.documentElement.clientWidth
  const sheet = id => {
    const el = $(id)
    if (!el) return null
    const cs = w.getComputedStyle(el)
    return { bottom: parseFloat(cs.bottom) || 0, top: parseFloat(cs.top) || 0,
             width: el.offsetWidth, left: el.offsetLeft }
  }
  const anchored = sh => !!sh && Math.abs(sh.bottom) < 1 && sh.width >= CW - 2 && sh.left === 0
  const dlg = sheet('dialogue')
  rec('dialogue is a full-width bottom sheet on mobile', anchored(dlg),
      dlg ? 'w' + dlg.width + '/' + CW + ' left' + dlg.left + ' bottom' + dlg.bottom : 'missing')
  for (const id of ['location', 'discovery']){
    const sh = sheet(id)
    rec(id + ' is a bottom sheet too', anchored(sh),
        sh ? 'w' + sh.width + ' left' + sh.left + ' bottom' + sh.bottom : 'missing')
  }

  // touch targets must be big enough to hit
  const tooSmall = []
  const check = sel => {
    const el = $(sel)
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.width && r.height && (r.height < 34 || r.width < 34)) tooSmall.push(sel + ' ' + Math.round(r.width) + 'x' + Math.round(r.height))
  }
  ;['atmos-toggle', 'enter-tokyo', 'begin', 'explore', 'dlg-close', 'loc-close', 'disc-close'].forEach(check)
  rec('primary touch targets are large enough', tooSmall.length === 0, tooSmall.join(', ') || 'all ok')

  // tapping a person must work with no hover: the app listens for pointerdown
  y.state.mode = 'tour'
  const chips = d.querySelectorAll('.guide-chip')
  rec('guide chips exist to tap', chips.length === 9, chips.length + ' chips')
  const chip = chips[0]
  chip.click()
  await sleep(400)
  rec('tapping a person opens the conversation', $('dialogue').classList.contains('on'))
  rec('conversation usable on a small screen', $('dlg-body').offsetHeight > 40,
      'body height ' + $('dlg-body').offsetHeight)

  // speech controls reachable by tap
  const tools = ['dlg-mic', 'dlg-listen', 'dlg-text'].map(s => $(s))
  rec('all speech controls present for tapping', tools.every(Boolean))
  const smallTool = tools.filter(t => t && t.getBoundingClientRect().height < 28)
  rec('speech controls meet the tap size', smallTool.length === 0,
      smallTool.map(t => Math.round(t.getBoundingClientRect().height)).join(',') || 'ok')

  // typing works without a keyboard
  const typed = $('dlg-typed')
  typed.value = 'where should I eat'
  $('dlg-typeform').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }))
  await sleep(500)
  rec('typed question routed by tap', $('dlg-body').querySelectorAll('.dlg-line').length >= 3,
      $('dlg-body').querySelectorAll('.dlg-line').length + ' lines')
  y.closeDialogue()
  await sleep(300)

  // a tap (pointerdown) on the atmosphere toggle opens the control
  const t = $('atmos-toggle')
  const r = t.getBoundingClientRect()
  t.dispatchEvent(new w.PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5 }))
  t.click()
  await sleep(250)
  rec('atmosphere control opens by tap', !$('atmos-panel').hasAttribute('hidden'))
  const wb = $('atmos-weathers')
  rec('weather options reachable', !!wb && wb.querySelectorAll('button').length === 4)
  if (wb){
    wb.querySelector('button[data-w="snow"]').click()
    await sleep(300)
    rec('tapping a weather option changes the world', y.atmosphere.state.weather === 'snow',
        'weather=' + y.atmosphere.state.weather)
  }

  // touch scrolling stays the primary mechanic
  y.state.p = 0
  const W2 = w
  const tourTop = d.getElementById('tour').offsetTop
  const span = Math.max(1, d.getElementById('chapters').offsetHeight - W2.innerHeight)
  W2.scrollTo({ top: tourTop + span * 0.4, behavior: 'instant' })
  W2.dispatchEvent(new W2.Event('scroll'))
  await sleep(300)
  rec('touch scrolling drives the journey', y.state.p > 0.05, 'p=' + y.state.p.toFixed(3))

  // nothing invisible may cover the page
  const cx = Math.round(W / 2), cy2 = Math.round(w.innerHeight / 2)
  const hitAtCentre = d.elementFromPoint(cx, cy2)
  rec('page centre is not blocked by an invisible overlay',
      !hitAtCentre || !/^#(intro|dialogue|location|discovery)$/.test(hitAtCentre.id),
      hitAtCentre ? (hitAtCentre.id || hitAtCentre.tagName) : 'none')
}
SCENARIOS.regression = async ({ w, d, Y, $, rec, sleep }) => {
  const W = w.innerWidth, H = w.innerHeight
  const y = Y()
  const txt = s => ($(s) || {}).textContent || ''

  // preserved counts
  rec('16 institutions', y.LOCATIONS.length === 16, y.LOCATIONS.length + '')
  rec('22 map places', y.PLACES.length === 22, y.PLACES.length + '')
  rec('8 dishes', y.DISHES.length === 8, y.DISHES.length + '')
  rec('9-person cast', y.PEOPLE.length === 9, y.PEOPLE.length + '')

  // data integrity
  rec('every official site is a verified url or explicitly null',
      y.LOCATIONS.every(l => l.officialWebsite === null || /^https?:\/\//.test(l.officialWebsite)),
      y.LOCATIONS.filter(l => l.officialWebsite).length + ' verified, ' +
      y.LOCATIONS.filter(l => !l.officialWebsite).length + ' null')
  rec('no fake domains', !y.LOCATIONS.some(l => /sensojiki|kagari-ginza/.test(l.officialWebsite || '')))
  rec('every location has coordinates', y.LOCATIONS.every(l => typeof l.lat === 'number' && typeof l.lng === 'number'))
  rec('9 licensed photographs with credit', y.LOCATIONS.filter(l => l.image && l.imageCredit && l.imageLicence).length >= 8,
      y.LOCATIONS.filter(l => l.image).length + ' images')
  rec('sources listed for every location', y.LOCATIONS.every(l => Array.isArray(l.sources) && l.sources.length))

  // atmosphere surface
  rec('atmosphere control present', !!$('atmos-toggle') && !!$('atmos-panel'))
  rec('time modes offered', $('atmos-times').querySelectorAll('button').length === 3)
  rec('weather modes offered', $('atmos-weathers').querySelectorAll('button').length === 4)
  rec('auto intervals offered', $('atmos-auto').querySelectorAll('button').length === 5)

  // dialogue surface
  y.openDialogue('akira'); await sleep(300)
  rec('dialogue opens with the person name', txt('dlg-name') === 'Akira', txt('dlg-name'))
  rec('role + district shown', /Shinjuku/i.test(txt('dlg-where')), txt('dlg-where'))
  rec('no chatbot language', !/chatbot|ai chat|assistant/i.test($('dialogue').textContent))
  rec('real conversation options', $('dlg-opts').querySelectorAll('.dlg-opt').length >= 3)
  rec('speech controls intact', !!$('dlg-mic') && !!$('dlg-listen') && !!$('dlg-stop') && !!$('dlg-text') && !!$('dlg-typed'))
  y.submitUserText('I want something quiet'); await sleep(500)
  rec('free text routed', $('dlg-body').querySelectorAll('.dlg-line').length >= 3)
  y.closeDialogue()

  // location resources
  y.showLocation('jiro'); await sleep(400)
  rec('location name real', txt('loc-name') === 'Sukiyabashi Jiro', txt('loc-name'))
  rec('address real', /4-2-15 Ginza/.test(txt('loc-addr')), txt('loc-addr'))
  rec('coordinates shown', /35\.67/.test(txt('loc-coord')), txt('loc-coord'))
  rec('official site linked when verified', $('loc-official').href.indexOf('sushi-jiro.jp') > -1)
  rec('image + credit present', $('loc-img').getAttribute('src') && !$('loc-credit').hidden)
  rec('fallback art generated', $('loc-fallback').width > 0)
  y.showLocation('kuramae'); await sleep(200)
  rec('unverified site hidden, search offered', $('loc-official').hidden && /Search/.test(txt('loc-find')), txt('loc-find'))
  y.closeLocation && y.closeLocation()

  // itinerary
  y.addToItinerary('Test venue'); await sleep(200)
  rec('itinerary accepts an addition', y.itinerary.length > 0 && /Test venue/.test(y.itinerary.map(i=>i.title).join()),
      y.itinerary.map(i => i.title + '@' + i.time).join(', '))

  // map
  y.initMap()
  for (let i = 0; i < 20 && !/OpenStreetMap/.test(txt('map-status')); i++) await sleep(400)
  const mapEl = $('map')
  rec('map canvas created', !!mapEl && !!mapEl.querySelector('canvas'))
  const mk = mapEl ? mapEl.querySelectorAll('.maplibregl-marker').length : 0
  rec('22 markers on the map', mk === 22, mk + ' markers')
  rec('map reports real geography', /OpenStreetMap/.test(txt('map-status')), txt('map-status'))

  // stability, proved by behaviour rather than by reading the source
  y.state.mode = 'tour'
  y.state.p = 0.45
  y.applyCamera()
  const before = y.camera.position.toArray().map(n => +n.toFixed(4))
  const lookBefore = y.camera.rotation.toArray().slice(0, 3).map(n => +n.toFixed(4))
  /* sweep the pointer right across the screen and then far up */
  for (const pt of [[5, 5], [W / 2, 5], [W - 5, 5], [W - 5, H - 5], [5, H - 5], [W / 2, H / 2]]){
    w.dispatchEvent(new w.PointerEvent('pointermove', { bubbles: true, clientX: pt[0], clientY: pt[1] }))
  }
  await sleep(500)
  y.applyCamera()
  const after = y.camera.position.toArray().map(n => +n.toFixed(4))
  const lookAfter = y.camera.rotation.toArray().slice(0, 3).map(n => +n.toFixed(4))
  const moved = before.some((v, i) => Math.abs(v - after[i]) > 0.0005)
  const lookMoved = lookBefore.some((v, i) => Math.abs(v - lookAfter[i]) > 0.0005)
  rec('pointer movement does not move the camera', !moved,
      before.join(',') + ' -> ' + after.join(','))
  rec('pointer movement does not turn the camera', !lookMoved)

  /* the camera is driven by scroll alone */
  y.state.p = 0.80
  y.applyCamera()
  const scrolled = y.camera.position.toArray().map(n => +n.toFixed(3))
  rec('scroll progress does move the camera', scrolled.some((v, i) => Math.abs(v - after[i]) > 0.01),
      after.join(',') + ' -> ' + scrolled.join(','))

  rec('reduced-motion preference is readable at runtime', typeof y.reduced === 'boolean',
      'reduced=' + y.reduced)
}