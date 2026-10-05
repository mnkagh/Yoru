/* LIMINAL TOKYO — central district/world configuration.
 * One data-driven source for what each district IS: what its shops
 * sell, what the signs say, who walks the street, what drives it,
 * what you can discover, and what Rei recommends there.
 * The renderer reads profiles through resolveWorld(); it never
 * hard-codes 'if Shibuya do X' chains.
 */

export const DISTRICTS = {
  shinjuku: {
    id: 'shinjuku', name: 'Shinjuku', region: 'Shinjuku City',
    identity: 'dense, vertical, railway-centered, nightlife',
    signs: [['RAMEN', '#ff5a36'], ['IZAKAYA', '#ffb36b'], ['夜', '#ff2e88'], ['BAR', '#00d4c8'], ['酒', '#ff5a36'], ['カラオケ', '#ff2e88'], ['24H', '#00d4c8']],
    vehicles: ['taxi', 'van', 'car', 'train'],
    npcs: ['office_worker', 'nightlife_visitor', 'delivery_worker', 'tourist'],
    props: ['vending', 'poles', 'wires', 'crates', 'lanterns'],
    foods: ['ramen', 'yakitori', 'sake', 'sushi'],
    discoveries: ['train', 'lantern_alley', 'taxi_stand', 'izakaya'],
    recommends: {
      eat: 'In Nishi-Shinjuku tonight: the late counters of Omoide Yokocho — yakitori and small plates until two.',
      rain: 'Covered arcades under the station: ramen, then the basement lanes of Golden Gai.',
      quiet: 'Shinjuku Gyoen opens the pocket of quiet in the middle of the density.',
      romance: 'Acmé-correct izakaya booth in Golden Gai, then a window table above the tracks.'
    },
    keywords: ['ramen', 'yakitori', 'izakaya', 'train', 'alley', 'late']
  },
  nishishinjuku: {
    id: 'nishishinjuku', name: 'Nishi-Shinjuku', region: 'Shinjuku City',
    identity: 'towers, offices, the memory lane',
    signs: [['酒', '#ff5a36'], ['ラーメン', '#ffb36b'], ['BAR', '#00d4c8'], ['夜', '#ff2e88']],
    vehicles: ['taxi', 'van', 'train'],
    npcs: ['office_worker', 'delivery_worker', 'nightlife_visitor'],
    props: ['vending', 'poles', 'wires', 'crates'],
    foods: ['ramen', 'yakitori', 'tonkatsu'],
    discoveries: ['train', 'lantern_alley', 'vending'],
    recommends: { eat: 'A standing bar under the tracks on a weekday evening.', rain: 'The Memory Lane bars are small enough to stay dry between them.', quiet: 'The office ceilings clear out after eight.', romance: 'A late frame of steam under the railway.' },
    keywords: ['railway', 'ramen', 'late', 'bar']
  },
  harajuku: {
    id: 'harajuku', name: 'Harajuku', region: 'Shibuya City',
    identity: 'fashion, youth, trees, Meiji Jingu',
    signs: [['CAFÉ', '#7fd4ff'], ['喫茶', '#7fd4ff'], ['CREPE', '#ff2e88'], ['SELECT', '#ffb36b'], ['Vintage', '#ffe95a']],
    vehicles: ['bicycle', 'taxi', 'van'],
    npcs: ['student', 'tourist', 'shop_worker'],
    props: ['trees', 'awning', 'terrace'],
    foods: ['matcha', 'wagashi'],
    discoveries: ['meiji', 'cafe', 'crepes'],
    recommends: { eat: 'A six-seat matcha counter two streets off Takeshita.', rain: 'The record-lined cafés of the side streets.', quiet: 'The forest of Meiji Jingu — a hundred thousand trees.', romance: 'Lanterns and tea, then a night walk toward the crossing.' },
    keywords: ['fashion', 'temple', 'forest', 'matcha', 'vintage']
  },
  shibuya: {
    id: 'shibuya', name: 'Shibuya', region: 'Shibuya City',
    identity: 'youth, fashion, giant screens, the crossing',
    signs: [['GAME', '#ffe95a'], ['咖啡', '#7fd4ff'], ['NAV', '#00d4c8'], ['渋谷', '#ff2e88'], ['109', '#ffb36b'], ['24H', '#00d4c8']],
    vehicles: ['taxi', 'bus', 'bicycle', 'van'],
    npcs: ['student', 'tourist', 'photographer', 'office_worker'],
    props: ['screens', 'crossing', 'barriers', 'vending'],
    foods: ['ramen', 'sushi', 'curry', 'tonkatsu'],
    discoveries: ['crossing', 'hachiko', 'cafe', 'screens'],
    recommends: { eat: 'A ramen counter in Udagawachō — the late frame is the local one.', rain: 'Stay indoors: Shibuya 109, the rooftop gardens, a late sushi set.', quiet: 'The avenue behind the crossing empties after midnight.', romance: 'Shibuya Sky, last boarding, then six seats over a standing bar.' },
    keywords: ['crossing', 'fashion', 'screen', 'hachiko', 'rooftop']
  },
  nakameguro: {
    id: 'nakameguro', name: 'Nakameguro', region: 'Meguro City',
    identity: 'riverside, stylish, intimate',
    signs: [['CAFÉ', '#7fd4ff'], ['WINERY', '#ffb36b'], ['Bagel', '#ffe95a'], ['焙煎', '#00d4c8']],
    vehicles: ['bicycle', 'van', 'car'],
    npcs: ['couple', 'cyclist', 'cafe_worker', 'local_resident'],
    props: ['river', 'bridge', 'trees', 'terrace'],
    foods: ['matcha', 'wagashi', 'tonkatsu'],
    discoveries: ['river', 'bridge', 'sakura', 'cafe', 'cat'],
    recommends: { eat: 'A corner café table by the canal, then a standing bar in the back lanes.', rain: 'Covered arcades end at the canal — dry until the bridge.', quiet: 'The river itself, at any hour.', romance: 'Blossom season at the embankment, then a private counter.' },
    keywords: ['river', 'sakura', 'cafe', 'bridge', 'blossom']
  },
  roppongi: {
    id: 'roppongi', name: 'Roppongi', region: 'Minato City',
    identity: 'international, luxury, nightlife',
    signs: [['CLUB', '#ff2e88'], ['GALLERY', '#7fd4ff'], ['BAR', '#00d4c8'], ['TOWER', '#ffb36b'], ['夜', '#ff2e88']],
    vehicles: ['taxi', 'car', 'van'],
    npcs: ['nightlife_visitor', 'tourist', 'office_worker'],
    props: ['screens', 'barriers', 'vending'],
    foods: ['sushi', 'sake', 'yakiniku'],
    discoveries: ['tower', 'gallery', 'club'],
    recommends: { eat: 'A quiet sushi counter that actually seats twelve.', rain: 'The museums — Mori Art Museum, and a dry walk between.', quiet: 'The hill behind Roppongi Hills, where it finally shuts the traffic out.', romance: 'Tokyo Tower at last, and then a rooftop glass.' },
    keywords: ['tower', 'gallery', 'nightlife', 'international']
  },
  ginza: {
    id: 'ginza', name: 'Ginza', region: 'Chuo City',
    identity: 'luxury Tokyo, polished, unhurried',
    signs: [['GINZA', '#7fd4ff'], ['KABUKI', '#ff5a36'], ['カフェ', '#7fd4ff'], ['和菓子', '#ffb36b'], ['SAKE', '#ff5a36']],
    vehicles: ['taxi', 'bus', 'car'],
    npcs: ['shop_worker', 'elderly_pedestrian', 'tourist', 'office_worker'],
    props: ['awning', 'barrier_free', 'clock'],
    foods: ['sushi', 'wagashi', 'matcha', 'sake'],
    discoveries: ['clock_tower', 'department', 'kabuki', 'wagashi'],
    recommends: { eat: 'The counter at Sukiyabashi Jiro if you can sit on the day it opens.', rain: 'Flagship floors at Ginza Six — everything under one long awning.', quiet: 'The street one block east of the Chuo-dori: open, almost empty.', romance: 'A late kaiseki booking with a view of the crossing at closing.' },
    keywords: ['luxury', 'sushi', 'department', 'kabuki', 'wide']
  },
  tsukiji: {
    id: 'tsukiji', name: 'Tsukiji', region: 'Chuo City',
    identity: 'market Tokyo: seafood stalls, narrow food alleys',
    signs: [['寿司', '#ff5a36'], ['玉子焼き', '#ffe95a'], ['魚', '#7fd4ff'], ['朝市', '#00d4c8'], ['かき氷', '#ff2e88']],
    vehicles: ['van', 'bicycle', 'truck', 'car'],
    npcs: ['shop_worker', 'delivery_worker', 'chef', 'tourist'],
    props: ['crates', 'stall', 'tarp', 'awning'],
    foods: ['sushi', 'tempura', 'sake'],
    discoveries: ['market', 'tamagoyaki', 'knife_shop', 'stall'],
    recommends: { eat: 'Sushi counter before eight — the morning is the point.', rain: 'Indoor stall lanes of the outer market: dry steam and tighter lanes.', quiet: 'The back alleys after nine, once the stalls fold.', romance: 'Hot dashimaki, then the river bridge before the coaches arrive.' },
    keywords: ['seafood', 'market', 'tuna', 'tamagoyaki', 'stall']
  },
  akihabara: {
    id: 'akihabara', name: 'Akihabara', region: 'Chiyoda City',
    identity: 'electronics, anime/manga, arcades',
    signs: [['GAME', '#ffe95a'], ['PC', '#00d4c8'], ['電気', '#7fd4ff'], ['マンガ', '#ff2e88'], ['24H', '#00d4c8']],
    vehicles: ['bicycle', 'taxi', 'van', 'train'],
    npcs: ['student', 'tourist', 'local_resident', 'photographer'],
    props: ['screens', 'cables', 'gacha', 'vending'],
    foods: ['ramen', 'curry'],
    discoveries: ['arcade', 'gacha', 'electric_town', 'train'],
    recommends: { eat: 'A late ramen counter above the station, next to the arcade.', rain: 'Two hours inside Radio Center and the arcade — the city stays dry.', quiet: 'The train passages below the arches at closing.', romance: 'A neon frame at the river end, then the Hachiko-side bars.' },
    keywords: ['arcade', 'electronics', 'anime', 'manga', 'gacha']
  },
  asakusa: {
    id: 'asakusa', name: 'Asakusa', region: 'Taito City',
    identity: 'old Tokyo / Edo, temples, lanterns',
    signs: [['雷門', '#ff5a36'], ['浅草', '#ff5a36'], ['抹茶', '#00d4c8'], ['和菓子', '#ffb36b'], ['天ぷら', '#ffe95a'], ['そば', '#7fd4ff']],
    vehicles: ['bicycle', 'taxi', 'rickshaw'],
    npcs: ['tourist', 'elderly_pedestrian', 'shop_worker', 'rickshaw_driver'],
    props: ['lanterns', 'noren', 'torii', 'stone_lantern', 'awning'],
    foods: ['wagashi', 'matcha', 'tempura', 'soba'],
    discoveries: ['kaminarimon', 'sensoji', 'noren', 'rickshaw', 'sweets'],
    recommends: { eat: 'A six-seat tempura counter off Nakamise, and a wagashi set by ten.', rain: 'The Nakamise arcades and the garden behind Senso-ji: quietest in rain.', quiet: 'Senso-ji at dawn, before the gates.', romance: 'Lantern light on the Sumida, then two spoonfuls of matcha.' },
    keywords: ['temple', 'lantern', 'edo', 'sensoji', 'kaminarimon']
  },
  rooftop: {
    id: 'rooftop', name: 'Rooftop', region: '',
    identity: 'the city from above',
    signs: [],
    vehicles: [],
    npcs: [],
    props: [],
    foods: [],
    discoveries: ['save_moment'],
    recommends: { eat: 'Below, the market stalls — brought back some tamagoyaki?', rain: 'From up here the rain stops falling on you. The streets keep their sheen.' },
    keywords: ['skyline', 'night', 'view']
  }
}

export const TIME_OVERRIDES = {
  day: { window: 'day', label: 'bright but controlled, shadows honest, modest sun disc' },
  sunset: { window: 'dusk', label: 'low warm sun, long shadows, warm edges, streetlights waking' },
  night: { window: 'night', label: 'dark blue/charcoal, moon, stars, lit windows and headlights' }
}

export const WEATHER_OVERRIDES = {
  sunny: { surfaces: 'dry', crowdK: 1.0, umbrellas: false },
  rain: { surfaces: 'wet', crowdK: 0.72, umbrellas: true },
  snow: { surfaces: 'cold', crowdK: 0.68, umbrellas: false },
  spring: { surfaces: 'dry', crowdK: 1.0, umbrellas: false }
}

/* One resolver: district + time + weather gives the effective profile
 * without the renderer chaining if/else for every combination. */
export function resolveWorld(districtId, time, weather){
  const d = DISTRICTS[(districtId || '').toLowerCase().replace(/[^a-z]/g, '')] || DISTRICTS.shinjuku
  return {
    district: d,
    time: TIME_OVERRIDES[time] || TIME_OVERRIDES.night,
    weather: WEATHER_OVERRIDES[weather] || WEATHER_OVERRIDES.sunny,
    signs: d.signs,
    foods: d.foods,
    vehicles: d.vehicles,
    npcs: d.npcs,
    props: d.props,
    discoveries: d.discoveries,
    recommends: d.recommends,
    keywords: d.keywords
  }
}

export function districtForTour(tourDistrict){
  const k = (tourDistrict || '').toLowerCase().replace(/[^a-z]/g, '')
  if (k === 'nishinishijuku' || k.startsWith('nishi')) return DISTRICTS.nishishinjuku
  return DISTRICTS[k] || DISTRICTS.shinjuku
}

/* Concierge scoring (§17): district relevance first, then time, then
 * weather, then journal memory (visited districts, saved foods).
 * Returns up to 4 recommendations with why/type so the panel can render
 * something real rather than a paragraph of generic copy. */
export function conciergeRecommend({ district, time, weather, question = '', saved = [], visited = [] }){
  const w = (weather || 'sunny').toLowerCase()
  const h = (time || 'night').toLowerCase()
  const dish = (question.toLowerCase().match(/ramen|sushi|tempura|wagashi|matcha|sake|seafood|soba/) || [])[0]

  let mode = null
  if (/rain|wet|storm/.test(question.toLowerCase()) || w === 'rain') mode = 'rain'
  else if (/quiet|calm|tired|peace|slow/.test(question.toLowerCase())) mode = 'quiet'
  else if (/romantic|romance|couple|anniversary/.test(question.toLowerCase())) mode = 'romance'
  else if (/where|what.*eat|dinner|hungry|food/.test(question.toLowerCase())) mode = 'eat'

  const out = []
  const d = (DISTRICTS[(district || '').toLowerCase().replace(/[^a-z]/g, '')] || DISTRICTS.shinjuku)

  /* 1. current district is always the strongest signal */
  const here = mode && d.recommends[mode] ? d.recommends[mode] : d.recommends.eat
  out.push({ title: (dish && d.foods.some(f => dish.includes(f) || f.includes(dish)) ? d.name + ' for ' + dish : d.name + ' — ' + (mode || 'now')), why: here, district: d.name, type: mode || 'eat' })

  /* 2. a past discovery or saved food that is NOT the current district */
  const otherSaved = saved.map(s => s.split(' ')[0]).find(Boolean)
  if (otherSaved) out.push({ title: 'You saved this earlier — ' + saved[0], why: 'It stays on your list; worth a return at the right hour.', district: saved[0].split(' ')[0], type: 'memory' })

  /* 3. a strongly relevant dish-bearing district if they asked for food */
  if (dish){
    const match = Object.values(DISTRICTS).find(x => x.foods.some(f => dish.includes(f) || f.includes(dish)))
    if (match && match.id !== d.id) out.push({ title: match.name + ' for ' + dish, why: match.recommends.eat, district: match.name, type: 'eat' })
  }

  /* 4. a weather fallback when the visitor asked about walking */
  if (mode === 'rain' && d.id !== 'shibuya')
    out.push({ title: 'Shibuya under one roof', why: 'The long arcade and the rooftop gardens keep the crossing within sight when it pours.', district: 'Shibuya', type: 'rain' })

  return out.slice(0, 4)
}
