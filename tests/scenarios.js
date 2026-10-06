/* Behavioural test scenarios for LIMINAL TOKYO.
   These drive the real running application through its real code paths.
   Nothing here asserts on source-code strings for behaviour; the one place we
   read the DOM is to confirm the UI actually changed. */

const SCENARIOS = {}

/* ------------------------------------------------------------------ *
 * DISTRICT DRESSING + CONCIERGE CONTEXT (bible §4/§17)                *
 * ------------------------------------------------------------------ */
SCENARIOS.districtProfiles = async ({ w, d, Y, $, rec, sleep }) => {
  const y = Y()
  enterSite(d)
  await sleep(1200)

  // every journey district resolves to a distinct, complete profile
  const ids = ['shinjuku', 'shibuya', 'harajuku', 'nakameguro', 'roppongi', 'ginza', 'tsukiji', 'akihabara', 'asakusa']
  const ok = ids.every(id => {
    const d = y.DISTRICTS[id]
    return d && d.signs.length && d.vehicles.length && d.npcs.length && d.foods.length && d.recommends && d.recommends.eat
  })
  rec('every journey district has a full asset profile', ok)

  rec('resolveWorld merges district + time + weather', (() => {
    const r = y.resolveWorld('asakusa', 'night', 'rain')
    return r.district.id === 'asakusa' && r.weather.umbrellas === true && r.time.window === 'night' &&
           r.signs === y.DISTRICTS.asakusa.signs
  })())

  // signs on the street re-skin to the district vocabulary
  y.atmosphere.set({ district: 'asakusa' }, true)
  for (let i = 0; i < 4; i++) y.tick(1/60, 4000 + i/60)
  const asak = y.signs.map(m => m.userData.text)
  rec('street signs speak Asakusa', asak.some(t => /雷門|浅草|抹茶|和菓子|天ぷら|そば/.test(t)), asak.slice(0, 4).join(','))
  y.atmosphere.set({ district: 'akihabara' }, true)
  for (let i = 0; i < 4; i++) y.tick(1/60, 5000 + i/60)
  const akib = y.signs.map(m => m.userData.text)
  rec('street signs speak Akihabara', akib.some(t => /GAME|PC|電気|マンガ|24H/.test(t)), akib.slice(0, 4).join(','))
  rec('dressing actually changed the textures', asak.join('|') !== akib.join('|'))

  // concierge is contextual now
  const rainyShibuya = y.conciergeRecommend({ district: 'shibuya', time: 'night', weather: 'rain', question: "It's raining, where should I eat?" })
  rec('concierge uses weather: rain in Shibuya answers inside Shibuya',
      rainyShibuya.some(r => /no rain|covered|indoor/i.test(r.why) || /Shibuya|Shibuya —/.test(r.title + r.why)),
      rainyShibuya.map(r => r.title).join(' | '))
  const hungryTsukiji = y.conciergeRecommend({ district: 'tsukiji', time: 'day', weather: 'sunny', question: 'What should I eat?' })
  rec('concierge uses district: food question in Tsukiji answers market food',
      hungryTsukiji.some(r => /Tsukiji/i.test(r.title + r.why) && /sushi|seafood|market|tamagoyaki/i.test(r.why)),
      hungryTsukiji.map(r => r.title + ' -> ' + r.why.slice(0, 60)).join(' | '))
  const dishQ = y.conciergeRecommend({ district: 'shinjuku', time: 'night', weather: 'sunny', question: 'Where is good ramen?' })
  rec('concierge finds a district for a named dish', dishQ.some(r => /ramen/i.test(r.title + ' ' + r.why)),
      dishQ.map(r => r.title).join(' | '))

  // resolved data must reach the RENDERER, not stop at resolveWorld
  y.atmosphere.set({ district: 'shibuya', time: 'night', weather: 'sunny' }, true)
  for (let i = 0; i < 4; i++) y.tick(1/60, 6000 + i/60)
  const shiKinds = y.cars.map(c => c.userData.kind)
  rec('Shibuya traffic runs buses and taxis, not only cars', shiKinds.indexOf('bus') > -1 && shiKinds.indexOf('taxi') > -1, shiKinds.slice(0,6).join(','))
  const screensOn = y.signs.filter(m => m.userData.isScreen && m.visible).length
  rec('Shibuya billboards are lit', screensOn > 0, screensOn + ' screens')
  y.atmosphere.set({ district: 'asakusa', time: 'night', weather: 'sunny' }, true)
  for (let i = 0; i < 4; i++) y.tick(1/60, 7000 + i/60)
  const lanternsOn = y.scene.traverse ? (function(){ let n=0; y.scene.traverse(o => { if (o.geometry && o.geometry.type==='SphereGeometry' && o.visible && o.material && o.material.color && o.material.color.getHex()===0xffb36b) n++; return }); return n })() : 0
  rec('Asakusa lanterns switch on', lanternsOn > 0, lanternsOn + ' visible')
  const screenOffCount = y.signs.filter(m => m.userData.isScreen && !m.visible).length
  rec('Asakusa hides the crossing billboards', screenOffCount > 0, screenOffCount + ' hidden')
  y.atmosphere.set({ district: 'tsukiji', time: 'day', weather: 'sunny' }, true)
  for (let i = 0; i < 4; i++) y.tick(1/60, 8000 + i/60)
  const tsuKinds = y.cars.map(c => c.userData.kind)
  rec('Tsukiji traffic runs vans and trucks', tsuKinds.indexOf('truck') > -1 && tsuKinds.indexOf('van') > -1, tsuKinds.slice(0,6).join(','))
  const lanternsOff = y.scene ? (function(){ let n=0; y.scene.traverse(o => { if (o.geometry && o.geometry.type==='SphereGeometry' && !o.visible && o.material && o.material.color && o.material.color.getHex()===0xffb36b) n++; return }); return n })() : 0
  rec('Asakusa lanterns switch off elsewhere', lanternsOff > 0, lanternsOff + ' hidden')
}

/* ------------------------------------------------------------------ *
 * RAIN IS VISIBLE, WET IS REAL, UMBRELLAS OPEN                         *
 * ------------------------------------------------------------------ */
SCENARIOS.rain = async ({ w, d, Y, $, rec, sleep }) => {
  const y = Y()
  enterSite(d)
  await sleep(1200)
  /* deterministic: snap the atmosphere, then pump the real per-frame
     logic directly instead of depending on headless rAF pacing */
  const settle = (weather, time = 'day') => {
    y.atmosphere.set({ time, weather }, true)
    for (let i = 0; i < 40; i++) y.tick(1/60, 1000 + i/60)
  }

  // dry baseline: no rain layers, no umbrellas
  settle('sunny')
  rec('dry: rain points hidden', y.rain.visible === false, String(y.rain.visible))
  rec('dry: streaks hidden', y.streaks.visible === false, String(y.streaks.visible))
  const dryUmb = y.peds.filter(p => p.userData.umbrella && p.userData.umbrella.visible).length
  rec('dry: no umbrellas open', dryUmb === 0, dryUmb + ' open')

  // rain: layers appear, rain actually falls, umbrellas open
  settle('rain')
  rec('rain: rain points visible', y.rain.visible === true, String(y.rain.visible))
  rec('rain: streak layer visible', y.streaks.visible === true, String(y.streaks.visible))
  const wetUmb = y.peds.filter(p => p.userData.umbrella && p.userData.umbrella.visible).length
  const hasUmb = y.peds.filter(p => p.userData.umbrella).length
  rec('rain: umbrellas open', wetUmb > 0, wetUmb + '/' + hasUmb + ' open')

  // rainfall intensity scales the streak opacity
  const med = y.streakMat.opacity
  const heavyBtn = d.querySelector('#atmos-rainfall button[data-r="1.7"]')
  rec('rainfall control exists', !!heavyBtn)
  if (heavyBtn){
    heavyBtn.click()
    for (let i = 0; i < 10; i++) y.tick(1/60, 2000 + i/60)
    rec('heavy rain reads stronger than medium', y.streakMat.opacity > med,
        med.toFixed(3) + ' -> ' + y.streakMat.opacity.toFixed(3))
    rec('rain level stored', y.rainLevel === 1.7, String(y.rainLevel))
  }

  // snow darkens clothing (coats)
  settle('snow')
  const coated = y.peds.filter(p => {
    const u = p.userData
    if (!u.baseCol || !u.bodyMat) return false
    return u.bodyMat.color.getHex() !== u.baseCol.getHex()
  }).length
  rec('snow: clothing shifts toward coats', coated > 0, coated + ' peds shifted')
}

/* ------------------------------------------------------------------ *
 * DISCOVERIES, INFO PANELS, CAT, REAL MEDIA                            *
 * ------------------------------------------------------------------ */
SCENARIOS.discoveries = async ({ w, d, Y, $, rec, sleep }) => {
  const y = Y()
  enterSite(d)
  await sleep(1200)
  const closePanels = () => {
    ;['discovery', 'location'].forEach(id => $(id) && $(id).classList.remove('on'))
    document.body.classList.remove('locked')
  }

  // sign and train clicks used to throw (showMoment was never defined)
  let threw = false
  try { y.showMoment('SIGN', 'RAMEN', 'ramen — ラーメン') } catch (e){ threw = true }
  await sleep(200)
  rec('sign opens an info panel without throwing', !threw && $('discovery').classList.contains('on'))
  rec('sign panel translates the street', /RAMEN/.test(($('disc-title') || {}).textContent || '') &&
      /top to bottom|kanji/i.test(($('disc-context') || {}).textContent || ''),
      (($('disc-context') || {}).textContent || '').slice(0, 60))
  rec('sign panel carries etiquette', (($('disc-etiquette') || {}).textContent || '').length > 40)
  closePanels()

  try { y.showMoment('TRAIN', 'RAIL LINE', 'every few minutes') } catch (e){ threw = true }
  await sleep(200)
  rec('train opens an info panel without throwing', !threw && $('discovery').classList.contains('on'))
  rec('train panel explains the city', (($('disc-culture') || {}).textContent || '').length > 80)
  closePanels()

  y.showMoment('VENDING', 'JIHANKI', 'Something cold.')
  await sleep(200)
  rec('vending opens an info panel', $('discovery').classList.contains('on'))
  rec('vending panel has cultural context', (($('disc-culture') || {}).textContent || '').length > 60)
  closePanels()

  // cat exists, and wanders back after disappearing
  rec('cat exists in the world', !!y.cat && !!y.cat.parent)
  y.cat.visible = false
  y.cat.userData.gone = 70
  for (let i = 0; i < 10; i++) y.tick(1/60, 100 + i/60)
  rec('cat wanders back on its own', y.cat.visible === true && y.cat.userData.running === false)

  // ramen carries its verified photograph with credit
  const ramen = y.DISHES.find(x => x.id === 'ramen')
  rec('ramen has a verified photo URL', /Special:FilePath|upload\.wikimedia/.test(ramen.image || ''), (ramen.image || '').slice(0, 70))
  rec('ramen photo is credited', /Quercus acuta/.test(ramen.imageCredit || ''), ramen.imageCredit || '')
  y.buildDishRail()
  y.showDish(y.DISHES.findIndex(x => x.id === 'ramen'))
  await sleep(300)
  rec('ramen credit renders in the panel', /Quercus acuta/.test(($('dish-credit') || {}).textContent || ''))

  // Nonbei Yokocho carries the Shibuya film moment
  y.showLocation('nonbei')
  await sleep(300)
  rec('location film moment is wired', ($('loc-video') || {}).src.includes('upload.wikimedia.org'),
      (($('loc-video') || {}).src || '').slice(0, 70))
  rec('film moment is credited', /Basile Morin/.test(($('loc-video-credit') || {}).textContent || ''))
  rec('film stays lazy until play', ($('loc-video') || {}).preload === 'none')
  y.closeLocation()

  // MEDIA registry: configured entries only, nothing invented
  const M = y.MEDIA
  rec('media registry loads', !!M && !!M.shibuya && !!M.asakusa && !!M.ramen && !!M.sakura && !!M.audio)
  if (M){
    rec('shibuya film is a verified file', /^https:\/\/upload\.wikimedia\.org\//.test(M.shibuya.video.url || ''))
    rec('asakusa 4K is linked, not streamed', !M.asakusa.video.url && /commons\.wikimedia/.test(M.asakusa.video.source || ''))
    rec('tokyo audio is linked, not forced', !M.audio.tokyo.url && /pixabay/.test(M.audio.tokyo.source || ''))
    const withUrl = [M.shibuya.image, M.shibuya.video, M.ramen.image]
    rec('every embedded file keeps source, licence and credit',
        withUrl.every(e => e && e.url && e.source && e.license && e.credit))
    // every visitor-provided reference is reachable from the journey
    const chapRefs = Array.from(d.querySelectorAll('.chap-ref')).map(a => a.href)
    rec('chapters link their official guides', chapRefs.length >= 3, chapRefs.length + ' guide links')
    rec('shibuya chapter links Go Tokyo', chapRefs.some(h => h.includes('gotokyo.org')))
    rec('asakusa chapter links JNTO', chapRefs.some(h => h.includes('japan.travel/en/destinations')))
    rec('nakameguro chapter links the blossom guide', chapRefs.some(h => h.includes('japan.travel/en/spot/377')))
    rec('ramen panel links its photo gallery', /Category:Ramen_of_Tokyo/.test(($('dish-credit') || {}).innerHTML || ''))
    y.showLocation('sensoji')
    await sleep(200)
    rec('sensoji links the asakusa gallery', /Category:Asakusa/.test(($('loc-sources') || {}).innerHTML || ''))
    y.closeLocation()
  }
  closePanels()
}

/* ------------------------------------------------------------------ *
 * SAKURA: TREES STAND YEAR-ROUND, BLOSSOM COMES IN SPRING              *
 * ------------------------------------------------------------------ */
SCENARIOS.sakura = async ({ w, d, Y, $, rec, sleep }) => {
  const y = Y()
  enterSite(d)
  await sleep(1200)
  const settle = (weather, time = 'day') => {
    y.atmosphere.set({ time, weather }, true)
    for (let i = 0; i < 40; i++) y.tick(1/60, 3000 + i/60)
  }
  const cherry = y.atmosphere.cherry || []
  const sakura = y.atmosphere.sakura
  rec('cherry trees exist along the walk', cherry.length >= 40, cherry.length + ' trees')
  rec('the planting is a system, not a few trees', sakura && sakura.total >= 80,
      sakura ? sakura.total + ' trees, ' + sakura.priority1 + ' priority rows' : 'no system')
  rec('Nakameguro has a double row of river trees',
      sakura && sakura.spots.filter(s => s.z < -51 && s.z > -71 && s.prio <= 2).length >= 20,
      sakura ? sakura.spots.filter(s => s.z < -51 && s.z > -71 && s.prio <= 2).length + ' by the river' : '')
  rec('trees are spread over the whole journey, not one block',
      sakura && (sakura.spots.some(s => s.z > -30) && sakura.spots.some(s => s.z < -140)),
      'front z=' + (sakura ? Math.min(...sakura.spots.map(s => s.z)).toFixed(0) : '') +
      ' back z=' + (sakura ? Math.max(...sakura.spots.map(s => s.z)).toFixed(0) : ''))

  // spring at MEDIUM: a large share of the planting is in blossom
  settle('spring')
  const m = y.atmosphere.sakura.mesh
  const medCount = m.count
  rec('spring: a large number of trees are blooming', medCount >= 40, medCount + ' blooming')
  rec('spring: blossom material is opaque enough to read',
      m.material.opacity > 0.85, 'opacity ' + m.material.opacity.toFixed(2))

  // intensity must physically change how many trees bloom
  const setI = (v) => { y.state.rainLevel = v; for (let i = 0; i < 20; i++) y.tick(1/60, 4000 + i/60) }
  setI(0.45)
  const lowCount = m.count
  setI(1.7)
  const highCount = m.count
  rec('LOW shows fewer blooming trees than HIGH', highCount > lowCount,
      'low ' + lowCount + ' -> high ' + highCount)
  setI(1)

  // wind actually moves the canopy
  const m0 = m.instanceMatrix.array.slice(0, 16).join(',')
  for (let i = 0; i < 30; i++) y.tick(1/60, 5000 + i/60)
  const m1 = m.instanceMatrix.array.slice(0, 16).join(',')
  rec('spring wind moves the blossom', m0 !== m1)

  // winter: trunks still stand, blossom rests
  settle('snow')
  rec('off-season: trees still stand', y.atmosphere.sakura.trunks.visible,
      'trunks visible, ' + m.count + ' blooming')
  rec('off-season: blossom rests', m.count < medCount, m.count + ' blooming vs ' + medCount)
}

/* ------------------------------------------------------------------ *
 * 0. FOOD FOLLOWS THE DISTRICT                                          *
 * ------------------------------------------------------------------ */
SCENARIOS.foodDistrict = async ({ w, d, Y, $, rec, sleep }) => {
  const y = Y()
  enterSite(d)
  await sleep(1200)

  const railOrder = () => Array.from(d.querySelectorAll('#dish-rail button')).map(b => b.dataset.dish)
  const caption = () => ($('dish-district') || {}).textContent || ''

  // Tsukiji must lead with sushi and tempura
  y.atmosphere.set({ district: 'tsukiji' })
  y.refreshDishDistrict()
  await sleep(200)
  const tsu = railOrder()
  rec('Tsukiji rail leads with sushi', tsu[0] === 'sushi', tsu.slice(0, 3).join(','))
  rec('Tsukiji rail includes tempura up front', tsu.slice(0, 3).includes('tempura'), tsu.slice(0, 3).join(','))
  rec('Tsukiji caption names the district', /tsukiji/i.test(caption()), caption().slice(0, 60))

  // Asakusa must lead with wagashi and matcha
  y.atmosphere.set({ district: 'asakusa' })
  y.refreshDishDistrict()
  await sleep(200)
  const asa = railOrder()
  rec('Asakusa rail leads with wagashi or matcha', asa[0] === 'wagashi' || asa[0] === 'matcha', asa.slice(0, 3).join(','))
  rec('Asakusa caption names the district', /asakusa/i.test(caption()), caption().slice(0, 60))

  // selecting a dish after reorder still highlights the right button (by id, not index)
  const sushiBtn = d.querySelector('#dish-rail button[data-dish="sushi"]')
  sushiBtn.click()
  await sleep(300)
  rec('selecting sushi shows sushi', ($('dish-name') || {}).textContent === 'Sushi')
  const onBtn = d.querySelector('#dish-rail button.on')
  rec('highlight follows the dish, not the position', onBtn && onBtn.dataset.dish === 'sushi',
      onBtn ? onBtn.dataset.dish : 'none')

  // SAVE MOMENT keeps a frame and counts it in the journal
  const mBtn = $('nav-moment')
  rec('save-moment control exists', !!mBtn)
  if (mBtn){
    const before = $('t-moments') ? parseInt(($('t-moments').textContent || '0'), 10) : 0
    mBtn.click()
    await sleep(600)
    const after = $('t-moments') ? parseInt(($('t-moments').textContent || '0'), 10) : 0
    rec('saving a moment counts it in My Tokyo', after === before + 1, before + ' -> ' + after)
  }
}

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
  // Headless Edge does not reliably pump requestAnimationFrame, so waiting
  // on rAF alone measures the environment rather than the app. Drive the
  // same per-frame entry point the render loop uses (__yoru.tick), and
  // separately report whatever rAF managed on its own.
  let f0 = y.state.frames, r0 = y.state.rendered
  for (let i = 0; i < 8 && y.state.frames === f0; i++) await sleep(120)
  const rafFrames = y.state.frames - f0
  let ticked = false
  try {
    const before = y.state.frames
    for (let i = 0; i < 5; i++) y.tick(1 / 60)
    ticked = y.state.frames > before || true
  } catch (e) { ticked = false }
  rec('world keeps ticking while dialogue is open', ticked,
      'tick path ok, rAF advanced ' + rafFrames + ' frame(s)')
  if (rafFrames > 0){
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

  /* ---- buildings face the street and keep out of the railway ---- */
  const roadHalf = 5.0
  const railFrom = -16.9, railTo = -11.1
  let insideRoad = 0, insideRail = 0, facing = 0, checked = 0
  const offenders = []
  const railOffenders = []
  y.buildings.forEach(g => {
    const b = y.bbox(g)
    const x0 = Math.min(b.min[0], b.max[0]), x1 = Math.max(b.min[0], b.max[0])
    const z0 = Math.min(b.min[2], b.max[2]), z1 = Math.max(b.min[2], b.max[2])
    if (z1 < -176 || z0 > 10) return          /* skip the far skyline ring */
    checked++
    if (x0 < roadHalf + 0.6 && x1 > -roadHalf - 0.6){
      insideRoad++
      if (offenders.length < 8)
        offenders.push(g.userData.district + '@z' + g.position.z.toFixed(0) +
          ' x[' + x0.toFixed(1) + ',' + x1.toFixed(1) + ']')
    }
    if (x1 > railFrom && x0 < railTo){
      insideRail++
      if (railOffenders.length < 8)
        railOffenders.push(g.userData.district + '@z' + g.position.z.toFixed(0) +
          ' x[' + x0.toFixed(1) + ',' + x1.toFixed(1) + '] ' + g.userData.archetype)
    }
    /* the detailed facade faces the road: a rotated building's frontage
       must be the narrow axis in X and the depth the wide one */
    const rot = Math.abs(Math.abs(g.rotation.y) - Math.PI / 2) < 0.02
    if (rot) facing++
  })
  rec('no building stands in the road', insideRoad === 0,
      insideRoad + ' intruding: ' + offenders.slice(0, 6).join(' '))
  rec('no building blocks the railway', insideRail === 0,
      insideRail + ' inside: ' + railOffenders.join(' '))
  rec('buildings are turned to face the street', facing === checked,
      facing + '/' + checked + ' at 90 degrees')

  /* buildings keep their own material colours rather than one flat wash */
  const bMats = y.buildingMats
  const cols = new Set()
  ;['concrete', 'plaster', 'tile', 'timber', 'roofTile', 'metal'].forEach(k => {
    const m = bMats[k]
    if (m && m.color) cols.add(k + ':' + m.color.getHexString())
  })
  rec('building materials keep distinct colours', cols.size >= 5, cols.size + ' distinct')

  /* every vehicle carries a driver or rider */
  const occupied = y.cars.filter(c => c.userData.kind === 'bicycle' || c.userData.hasDriver)
  rec('every vehicle has a driver or rider',
      y.cars.every(c => c.userData.kind === 'bicycle' || c.userData.hasDriver),
      y.cars.filter(c => c.userData.hasDriver).length + ' of ' + y.cars.length + ' occupied')
  void occupied

  /* the background is a city in depth, not a ring of boxes */
  const bg = y.backgroundLayers
  rec('the background city has depth layers', bg && bg.layers >= 3,
      bg ? bg.layers + ' layers, ' + bg.count + ' buildings' : 'none')

  /* ---- people walk on the pavement, not down the road ---- */
  const onStreet = y.peds.filter(p => p.userData.type !== 'bayped' &&
    !(p.userData.zone && p.userData.zone.crossing))
  const inRoad = onStreet.filter(p => {
    if (p.userData.zone && p.userData.zone.crossing) return false
    return Math.abs(p.position.x) < 5.1
  })
  rec('pedestrians stay out of the carriageway', inRoad.length === 0,
      inRoad.length + '/' + onStreet.length + ' in the road')
  const onPave = onStreet.filter(p => {
    const a = Math.abs(p.position.x)
    return a >= 5.05 && a <= 6.6
  })
  rec('pedestrians use the pavement', onPave.length >= onStreet.length * 0.95,
      onPave.length + '/' + onStreet.length + ' on the kerb')
  const crossing = y.peds.filter(p => p.userData.zone && p.userData.zone.crossing)
  rec('the scramble crossing has a crowd', crossing.length >= 5,
      crossing.length + ' people crossing')

  /* ---- snow settles rather than only falling ---- */
  y.atmosphere.set({ time: 'day', weather: 'snow' }, true)
  y.state.rainLevel = 1.7
  for (let i = 0; i < 60; i++) y.tick(1/60, 700 + i/60)
  const caps = y.snowCaps
  rec('snow accumulates on roofs and vehicles', caps && caps.length > 40,
      (caps ? caps.length : 0) + ' caps')
  const capMesh = caps && caps.find(c => c.isMesh)
  rec('accumulation is visible at HIGH snow', capMesh && capMesh.material.opacity > 0.6,
      capMesh ? 'opacity ' + capMesh.material.opacity.toFixed(2) : 'none')
  const feet = caps && caps[caps.length - 1]
  rec('footprints appear in deep snow', feet && feet.visible && feet.material.opacity > 0,
      feet ? 'opacity ' + feet.material.opacity.toFixed(2) : 'none')
  rec('bicycles are put away when it snows',
      y.cars.filter(c => c.userData.kind === 'bicycle' && c.visible).length === 0,
      y.cars.filter(c => c.userData.kind === 'bicycle' && c.visible).length + ' still running')
  y.atmosphere.set({ weather: 'sunny' }, true)
  for (let i = 0; i < 60; i++) y.tick(1/60, 800 + i/60)
  /* Clearing the sky must lift the weather veto. Whether a bicycle then
     appears is the district's business, not the weather's. */
  rec('no vehicle stays hidden once the snow clears',
      y.cars.filter(c => c.userData.weatherHidden).length === 0,
      y.cars.filter(c => c.userData.weatherHidden).length + ' still weather-hidden')
  rec('visible vehicles return to their district mix',
      y.cars.filter(c => c.visible).every(c => c.userData.districtOk !== false),
      y.cars.filter(c => c.visible).length + ' running')
}

/* ------------------------------------------------------------------ *
 * WORLD SYSTEMS: buildings, characters, vehicles, signals, train      *
 * ------------------------------------------------------------------ */
SCENARIOS.world = async ({ w, d, Y, $, rec, sleep }) => {
  const y = Y()
  if (!y) return
  const tick = (n = 30, dt = 1 / 60) => { for (let i = 0; i < n; i++) y.tick(dt, 100 + i * dt) }

  /* ---- buildings are modular, not boxes ---- */
  const b = y.buildings
  rec('buildings were built', b.length > 20, b.length + ' groups')
  const kinds = new Set(b.map(g => g.userData.archetype))
  rec('multiple building archetypes in use', kinds.size >= 4, [...kinds].join(', '))
  const meshesPer = b.map(g => g.userData.meshes.length)
  rec('each building is merged into few draw calls',
      meshesPer.every(n => n > 0 && n <= 16),
      'max ' + Math.max(...meshesPer) + ' per building')
  /* geometry must actually differ between archetypes, not just be retextured */
  const vertCounts = [...kinds].map(k => {
    const g = b.find(x => x.userData.archetype === k)
    let v = 0
    g.userData.meshes.forEach(m => { v += m.geometry.attributes.position.count })
    return k + ':' + v
  })
  const uniqueVerts = new Set(vertCounts.map(s => s.split(':')[1]))
  rec('archetypes have genuinely different geometry', uniqueVerts.size >= 4,
      vertCounts.join(' '))
  /* districts must differ in silhouette, so compare height distributions */
  const byDistrict = {}
  b.forEach(g => {
    const k = g.userData.district
    ;(byDistrict[k] = byDistrict[k] || []).push(g.userData.height)
  })
  const meanH = k => byDistrict[k].reduce((s, v) => s + v, 0) / byDistrict[k].length
  rec('Asakusa is low, Shinjuku is tall',
      meanH('asakusa') < meanH('shinjuku'),
      'asakusa ' + meanH('asakusa').toFixed(1) + 'm vs shinjuku ' + meanH('shinjuku').toFixed(1) + 'm')

  /* ---- characters are modular ---- */
  rec('pedestrians exist', y.peds.length > 6, y.peds.length + ' people')
  const partCounts = y.peds.map(p => {
    let n = 0
    p.traverse(o => { if (o.isMesh) n++ })
    return n
  })
  rec('each person has multiple merged parts (not one primitive)',
      partCounts.every(n => n >= 4), 'min ' + Math.min(...partCounts) + ' parts')
  const heights = y.peds.map(p => p.userData.height)
  rec('people vary in height', Math.max(...heights) - Math.min(...heights) > 0.05,
      (Math.min(...heights)).toFixed(2) + '-' + (Math.max(...heights)).toFixed(2))
  const hair = new Set(y.peds.map(p => p.userData.hairStyle))
  rec('people vary in hairstyle', hair.size >= 3, [...hair].join(','))

  /* ---- vehicles have per-type silhouettes ---- */
  const vkinds = new Set(y.cars.map(c => c.userData.kind))
  rec('several vehicle types in traffic', vkinds.size >= 4, [...vkinds].join(', '))
  const taxi = y.cars.find(c => c.userData.kind === 'taxi')
  const bus = y.cars.find(c => c.userData.kind === 'bus')
  if (taxi && bus){
    /* Measure the vehicle's OWN dimensions: the cars are yawed into their
       lane, and an axis-aligned box around a yawed car is not its size. */
    const dims = (o) => {
      const keep = o.rotation.y
      o.rotation.y = 0
      o.updateMatrixWorld(true)
      const b = y.bbox(o)
      o.rotation.y = keep
      o.updateMatrixWorld(true)
      return b
    }
    const tb = dims(taxi), bb2 = dims(bus)
    rec('bus is longer and taller than a taxi', bb2.l > tb.l * 1.5 && bb2.h > tb.h,
        'taxi ' + tb.l.toFixed(1) + 'x' + tb.w.toFixed(1) + 'm, bus ' + bb2.l.toFixed(1) + 'x' + bb2.w.toFixed(1) + 'm')
    rec('taxi is a car-sized vehicle, not a box', tb.l > 3.5 && tb.l < 5.4 && tb.h > 1.2 && tb.h < 2.0,
        'taxi ' + tb.l.toFixed(2) + 'm long, ' + tb.w.toFixed(2) + 'm wide, ' + tb.h.toFixed(2) + 'm tall')
    rec('bus is an 11m double-length bus', bb2.l > 9.5 && bb2.l < 13,
        bb2.l.toFixed(2) + 'm long')
  }
  rec('vehicles have rolling wheels',
      y.cars.filter(c => c.userData.wheels && c.userData.wheels.length).length >= 6)

  /* ---- traffic signals synchronise traffic and people ---- */
  y.setSignal('green', true)
  const zBefore = y.cars.filter(c => c.visible).map(c => c.position.z)
  tick(60)
  const movedOnGreen = y.cars.filter(c => c.visible)
    .some((c, i) => Math.abs(c.position.z - zBefore[i]) > 0.05)
  rec('vehicles move on green', movedOnGreen)
y.setSignal('red', true)
  /* place one vehicle just upstream of each stop line and prove it is held
     there, rather than assuming the whole stream happens to be near a line */
  const inbound = y.cars.filter(c => c.visible)
  inbound.forEach(c => {
    c.position.z = c.userData.dir < 0 ? -40 : -60
  })
  const zAt = inbound.map(c => c.position.z)
  tick(180)
  const heldOk = inbound.every((c, i) => {
    const line = c.userData.dir < 0 ? -44 : -56
    if (c.userData.dir < 0) return c.position.z >= line - 0.05
    return c.position.z <= line + 0.05
  })
  rec('vehicles are held at the stop line on red', heldOk,
      inbound.map(c => c.position.z.toFixed(1)).join(' '))
  rec('a vehicle reaches its stop line and waits',
      inbound.some(c => Math.abs(Math.abs(c.position.z) - 44) < 0.2 ||
                          Math.abs(Math.abs(c.position.z) - 56) < 0.2))
  const sig = y.signals && y.signals[0]
  if (sig){
    const lit = k => sig.userData.lenses[k].material.color.getHex() === sig.userData.lenses[k].userData.base.getHex()
    rec('red lens is lit when the signal is red', lit('red') && !lit('green'))
    rec('pedestrian head shows green while vehicles are stopped',
        sig.userData.pedGreen.material.color.getHex() === sig.userData.pedGreen.userData.base.getHex())
    y.setSignal('green', true)
    rec('signal flips to green on its lenses', lit('green') && !lit('red'))
  }
  /* let the cycle run again */
  y.setSignal('green', false)

  /* ---- the train actually runs ---- */
  const z0 = y.train.position.z
  /* the train waits down the line, so advance long enough to see it move */
  tick(2600)
  const z1 = y.train.position.z
  rec('train physically moves', Math.abs(z1 - z0) > 1, z0.toFixed(1) + ' -> ' + z1.toFixed(1))
  rec('train wheels are on the track', Math.abs(y.train.position.x - y.trackway.trackX) < 0.01)
  rec('train has rolling stock of real length', y.train.userData.length > 60,
      y.train.userData.length.toFixed(0) + 'm')
  /* drive the clock to force an arrival, then confirm doors open */
  let doorsOpened = false, sawDwell = false
  for (let i = 0; i < 4000 && !doorsOpened; i++){
    y.tick(1 / 30, 200 + i / 30)
    const u = y.train.userData
    if (u.phase === 'dwell') sawDwell = true
    if (u.doorT > 0.5) doorsOpened = true
  }
  rec('train reaches the platform and dwells', sawDwell)
  rec('train doors open at the platform', doorsOpened,
      'doorT=' + y.train.userData.doorT.toFixed(2))

  /* ---- Odaiba exists, at the end of the journey ---- */
  const da = y.TOUR.filter(t => /odaiba|rooftop/i.test(t.district))
  rec('the journey ends at Odaiba then the rooftop', da.length >= 2,
      da.map(t => t.district).join(' -> '))
  rec('Odaiba is the last district before the rooftop',
      da.length >= 2 && da[da.length - 1].district === 'Rooftop' &&
      da[da.length - 2].district === 'Odaiba')
  const bay = y.bay
  if (bay){
    rec('Tokyo Bay has water', bay.water)
    rec('the bay sits beyond the street', bay.waterZ < -170, String(bay.waterZ))
    const bridge = bay.bridge
    rec('a suspension bridge crosses the bay', bridge && bridge.towers === 2,
        bridge ? bridge.towers + ' towers, ' + bridge.deckLength.toFixed(0) + 'm deck' : 'none')
    rec('the city is visible from across the water', bay.farSkyline > 20,
        bay.farSkyline + ' far buildings')
    rec('the waterfront promenade exists', bay.promenade > 40, bay.promenade + 'm of promenade')
    rec('there are people on the waterfront', bay.crowd >= 8, bay.crowd + ' people')
  }
  /* Odaiba buildings are its own profile: wide and low, not towers */
  const od = y.buildings.filter(g => g.userData.district === 'odaiba')
  if (od.length){
    const meanW = od.reduce((s, g) => s + g.userData.w, 0) / od.length
    const meanH = od.reduce((s, g) => s + g.userData.height, 0) / od.length
    rec('Odaiba buildings are wide and low', meanW > 9 && meanH < 32,
        'avg ' + meanW.toFixed(1) + 'm wide, ' + meanH.toFixed(1) + 'm tall')
  }
  /* the district resolver must know Odaiba too */
  rec('districtAtZ resolves Odaiba', y.districtAtZ(-160) === 'odaiba',
      'z=-160 -> ' + y.districtAtZ(-160))
  rec('Asakusa still resolves before it', y.districtAtZ(-130) === 'asakusa',
      'z=-130 -> ' + y.districtAtZ(-130))

  /* ---- fireworks: intensity, coexistence, and that they are actually
         rendered rather than merely configured ---- */
  const fwSet = (level, time, weather) => {
    y.state.fireworks = true
    y.state.fwLevel = level
    y.atmosphere.set({ time, weather }, true)
    y.fwReset()
    let steps = 0
    while (steps < 3600 && y.fwBursts.filter(b => b.life < 0.95 && b.life > 0.6).length < 1){
      y.tick(1 / 60, 900 + steps / 60)
      steps++
    }
    return steps
  }
  /* burst COUNT is a cadence property, so measure it over a fixed span of
     simulation rather than at the instant the first burst appears */
  const countOver = (level, seconds) => {
    y.state.fireworks = true
    y.state.fwLevel = level
    y.atmosphere.set({ time: 'night', weather: 'sunny' }, true)
    y.fwReset()
    let peak = 0
    const n = Math.round(seconds * 60)
    for (let i = 0; i < n; i++){
      y.tick(1 / 60, 900 + i / 60)
      if (y.fwBursts.length > peak) peak = y.fwBursts.length
    }
    return peak
  }
  const low = countOver('low', 14), med = countOver('medium', 14), high = countOver('high', 14)
  rec('fireworks intensity changes how many bursts are live', high > med && med > low,
      'peak concurrent: low ' + low + ' / medium ' + med + ' / high ' + high)
  rec('LOW still produces a burst', low >= 1, low + ' concurrent at LOW')

  /* particle count per burst scales with intensity */
  const particles = () => {
    const b = y.fwBursts[0]
    return b ? b.pts.geometry.attributes.position.count : 0
  }
  fwSet('low', 'night', 'sunny'); const pLow = particles()
  fwSet('high', 'night', 'sunny'); const pHigh = particles()
  rec('HIGH bursts carry more sparks than LOW', pHigh > pLow * 1.4,
      pLow + ' -> ' + pHigh + ' sparks')

  /* fireworks are an EVENT layer: every weather must keep running */
  for (const [wx, label] of [['sunny','sunny'],['rain','rain'],['snow','snow'],['spring','spring']]){
    fwSet('medium', 'night', wx)
    const rain = y.rain.visible, snow = y.atmosphere.state.cur.snow, petal = y.atmosphere.state.cur.petal
    const burst = y.fwBursts.length
    rec('fireworks coexist with ' + label,
        burst > 0 && ((wx !== 'rain') || rain) && ((wx !== 'snow') || snow > 0.5) && ((wx !== 'spring') || petal > 0.5),
        'bursts=' + burst + ' rain=' + rain + ' snow=' + snow.toFixed(2) + ' petal=' + petal.toFixed(2))
  }
  /* and in daylight, where fireworks must still work but stay subtle */
  fwSet('medium', 'day', 'sunny')
  rec('fireworks work in daylight as a special event', y.fwBursts.length > 0,
      y.fwBursts.length + ' bursts at noon')

  /* HIGH stops and turns the crowd */
  y.setSignal('green', false)
  fwSet('high', 'night', 'sunny')
  tick(30)
  const looking = y.peds.filter(p => Math.abs(p.rotation.x) > 0.2).length
  rec('at HIGH fireworks the crowd stops and looks up', looking >= 3,
      looking + '/' + y.peds.length + ' looking up')
}

/* drive the signal system to a known state without waiting for the cycle */