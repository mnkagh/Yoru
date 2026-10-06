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
  odaiba: {
    id: 'odaiba', name: 'Odaiba', region: 'Minato City',
    identity: 'waterfront, wide open, modern, the city seen from outside itself',
    signs: [['BAY', '#7fd4ff'], ['DECK', '#00d4c8'], ['AQUA', '#7fd4ff'], ['展望', '#ffb36b'], ['GATE', '#00d4c8']],
    vehicles: ['bicycle', 'bus', 'taxi', 'car'],
    npcs: ['tourist', 'family', 'cyclist', 'office_worker'],
    props: ['bollard_lights', 'promenade', 'rail', 'bench'],
    foods: ['sushi', 'ramen'],
    discoveries: ['bay', 'bridge', 'promenade', 'yurikamome'],
    recommends: {
      eat: 'The fish market row at Toyosu for the morning, or a harbour counter with the water in front of you.',
      rain: 'The science museum and the mirror-floor gallery — dry, and the bay still visible through the glass.',
      quiet: 'The far end of the promenade past the ferry pier, where the city noise stops carrying.',
      romance: 'The Rainbow Bridge from the water side, then a walk back with the skyline behind you.'
    },
    keywords: ['bay', 'waterfront', 'bridge', 'rainbow', 'modern', 'plaza']
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

/* ==========================================================================
   TRAVEL-AGENCY LAYER
   Editorial copy for every district on the journey, plus the two sections
   the site was missing: where you would STAY, and what you would actually
   DO. Every claim here is about real places and real practice; nothing
   names a business we have not verified elsewhere in this codebase, and
   nothing promises a booking that cannot be made.
   ========================================================================== */

export const DESTINATIONS = {
  shinjuku: {
    about: 'The station that everything else is measured against. Twenty platforms, three million passenger movements a day, and a district that rebuilds itself roughly every decade without ever losing the shape of its streets.',
    see: ['Tokyo Metropolitan Government Building observatory', 'Omoide Yokocho, the lantern-lit lane under the tracks', 'Golden Gai at night', 'The Kabukicho side gates after dark'],
    do: ['Take the train out to a small station and walk back into the noise', 'Eat standing at a counter in Omoide, then walk the lane as it fills'],
    eat: 'Yakitori over binchōtan at a counter with no sign; tonkotsu ramen where the broth is the point.',
    stay: 'We stay west of the station, where the rooms are quiet and the walk to the last train is short.',
    when: 'Late evening for the lanes; mid-morning if you want the market stalls before the coaches.',
    tip: 'Golden Gai bars are by introduction. Tell us what you want to drink and we will arrange three that suit.',
    culture: 'Omoide is named for people going home. It is a workers\' district first — respect that and it rewards you.'
  },
  nishishinjuku: {
    about: 'The quieter face of Shinjuku: low bars, standing counters, izakaya that have not changed their sign in forty years, and the back streets where people actually eat at eleven at night rather than the bright frontage the rest of the city knows.',
    see: ['The lane west of the station at closing time', 'Golden Gai before it gets busy'],
    do: ['Start with a standing drink and let the night choose the rest'],
    eat: 'Small plates at a tachinomi, then something off a charcoal grill.',
    stay: 'Base yourself here rather than in the bright part — you are ten minutes from everything.',
    when: 'After 22:00, when the office crowd has gone and the street belongs to the people who work in it.',
    tip: 'Order what the counter recommends. They have been making one thing for thirty years and it is the right thing.',
    culture: 'Speak quietly. These lanes are small, and everyone knows each other.'
  },
  harajuku: {
    about: 'Two hundred years of a place that keeps reinventing itself: a shrine forest, a fashion street, and a set of buildings that architects queue to walk past.',
    see: ['Meiji Jingu before nine', 'Omotesando architecture, on foot', 'Yoyogi Park from the shrine side'],
    do: ['Walk Takeshita early, then cross to Omotesando and look up the whole way'],
    eat: 'A long lunch with no plan, then wagashi somewhere with a counter.',
    stay: 'Stay near the shrine, where the streets quiet down and you can walk to everything.',
    when: 'Morning for the shrine, weekday afternoon for the fashion.',
    tip: 'The most interesting Harajuku is off Takeshita. Turn left at the shrine and keep walking.',
    culture: 'Takeshita is a street for teenagers. Look, do not photograph anyone closely.'
  },
  shibuya: {
    about: 'The busiest pedestrian junction in the world, with a serious culture of observation behind it: a hilltop deck, a museum on the roof, and side streets nobody has time for.',
    see: ['The crossing from above, not from the middle', 'Shibuya Sky at last boarding', 'Miyashita Park in the evening'],
    do: ['Stand at the kerb for one full signal change, then leave and walk Nonbei Yokocho'],
    eat: 'Yakitori in the brick lanes, then a standing bar where the room is four people wide.',
    stay: 'Above the station on the quiet side, with a late check-in.',
    when: '19:30–20:45 to see the crossing empty; after midnight for the lanes behind it.',
    tip: 'The crossing is impressive once. The city behind it is what you came for.',
    culture: 'Never photograph the screens or the crowd at the kerb line. Walk around them.'
  },
  nakameguro: {
    about: 'Low-rise, riverside and quietly fashionable. The volume drops the moment you leave the main road, and the canal is lined with cherry trees that make it the best walk in the city for four weeks a year.',
    see: ['The canal walk end to end', 'The vintage and studio streets off the main road', 'The bridge at dusk'],
    do: ['Walk the river in blossom season, then sit somewhere with a window onto it'],
    eat: 'Cafés with a counter, then dinner somewhere small enough to have six tables.',
    stay: 'Stay on the side street off the river, not on the main road.',
    when: 'Late March to early April for the blossom; any weekday evening for quiet.',
    tip: 'Start at the far end of the canal and walk towards the station — the light is behind you.',
    culture: 'It is a residential district with shops in it. Neighbours live here; keep your voice down after ten.'
  },
  roppongi: {
    about: 'The loudest name in the city, and the quietest version of it. Galleries on upper floors, an art hill with a view over the towers, and an international crowd that knows the good rooms.',
    see: ['Roppongi Hills and the Mori Art Museum', 'Tokyo Tower from the hillside', 'The art galleries that show nothing to the street'],
    do: ['Take the lift up for the art, then walk down through the quiet backstreets'],
    eat: 'Sushi or yakiniku in a room where somebody knows the chef\'s name.',
    stay: 'On the hill, where the traffic noise is a floor below you.',
    when: 'Late afternoon for the art, then late evening for the rooms.',
    tip: 'The galleries on the top floors have no signage. That is deliberate; go in anyway.',
    culture: 'Art in Tokyo expects you to read the wall text. Take the ten minutes.'
  },
  ginza: {
    about: 'Tokyo at its most composed. Wide roads, clean stone, flagship shops lit like galleries, and a Kabuki theatre that has stood on the same corner for a century.',
    see: ['The Kabuki-za from across the road at curtain-up', 'The department store flagships before opening', 'Wako\'s clock on the hour'],
    do: ['Walk the back streets, which are narrow, old and completely unlike the front'],
    eat: 'Kaiseki or a single piece of nigiri at a counter, and wagashi afterwards.',
    stay: 'Within two minutes of the station, on a back street, so you can walk out at night.',
    when: 'Weekday afternoon for the shops; evening for the theatre district.',
    tip: 'Ginza is best after the shops close, when the staff are out and the street empties.',
    culture: 'This is where you are expected to dress properly. It costs nothing.'
  },
  tsukiji: {
    about: 'The working market behind the wholesale exchange. The fish trade is over by nine and the counters become breakfast: tamagoyaki off a grill, uni cut by hand, knives three generations old.',
    see: ['The market lanes between seven and nine', 'A knife shop, where the sharpening is still done by hand'],
    do: ['Eat standing at a counter while the lane is still busy'],
    eat: 'Tamagoyaki, uni, and whatever came off the boat that morning.',
    stay: 'Stay close rather than in the district — it is loud and flat and you want sleep.',
    when: 'Early. There is no point arriving at eleven.',
    tip: 'Cash helps. Many of the smaller counters have never taken a card.',
    culture: 'The market is working infrastructure. Photograph the food, not the people, and do not touch anything.'
  },
  akihabara: {
    about: 'Built on electronics, now running its own fashion weeks and arcades. The hobby shops are still here behind the towers, mostly unchanged, and the trains run underneath rather than through.',
    see: ['The back-street collector shops', 'An arcade floor after dark'],
    do: ['Go to a collector\'s shop with someone who knows the difference between a copy and a first print'],
    eat: 'Ramen above the station, late, where the steam is thick enough to see.',
    stay: 'Inside the station, so the last train is never a problem.',
    when: 'Afternoon for the shops; after midnight for the arcades.',
    tip: 'Check the age-rating before you go. Many arcade floors will not admit you.',
    culture: 'Some shops will not speak to a tourist. Others will explain everything. Ask which staff you want to talk to.'
  },
  asakusa: {
    about: 'Tokyo\'s oldest continuously running temple, approached through a street of small shops that has been trading for three centuries. Lanterns, not screens.',
    see: ['Kaminarimon before eight, before the coaches', 'Nakamise while it still belongs to the shopkeepers'],
    do: ['Arrive early, walk the approach slowly, and be inside the temple before nine'],
    eat: 'Tempura at a standing counter, then a wagashi set with matcha.',
    stay: 'Stay nearby, and take the older side of the river at night.',
    when: '07:00, or after 17:00 when the light goes amber on the lantern gate.',
    tip: 'Nakamise is at its best when the shopkeepers are opening, not when the tour buses arrive.',
    culture: 'Do not walk through the centre of a torii; step aside. A short bow needs no words.'
  },
  odaiba: {
    about: 'Reclaimed land on the bay where the city stops being a city. Wide plazas, a promenade, a bridge back to everything you just walked through, and open air after a kilometre of street canyon.',
    see: ['The Rainbow Bridge from the water side', 'The promenade at dusk', 'The skyline behind you as you leave'],
    do: ['Cycle the waterfront, then take the ferry back across'],
    eat: 'A harbour counter at the water\'s edge, where the room faces the bay.',
    stay: 'Only if you have a morning to spare — it is far from the old city and that is the point.',
    when: 'Late afternoon into dusk, when the lights come on across the water.',
    tip: 'Come for the view of the city you already know. That is the whole reason for the district.',
    culture: 'It is a family and waterfront district. Nothing here closes early, and nothing here is loud.'
  }
}

/* ---------------------------------------------------------------- STAYS --
   Chosen for position and quiet, not for a brand. Where a property has no
   first-party site we have verified, we say so rather than invent a link. */
export const STAYS = [
  { id: 'shinjuku-west', name: 'A quiet hotel west of Shinjuku Station', district: 'Shinjuku',
    why: 'Four lines from the station with the bright side of the city behind you. The right base for anyone who plans to come back late.',
    best: 'Late nights, and a short walk to the last train',
    website: null },
  { id: 'ginza-back', name: 'A small hotel on a Ginza back street', district: 'Ginza',
    why: 'Two minutes from the station and entirely surrounded by the shops you will actually want at night.',
    best: 'Shopping, theatre, and being able to walk out at eleven',
    website: null },
  { id: 'nakameguro-river', name: 'A riverside inn at Nakameguro', district: 'Nakameguro',
    why: 'The quietest address on this journey, and the only one where the canal is outside the window.',
    best: 'Blossom season, and evenings with nowhere to be',
    website: null },
  { id: 'asakusa-river', name: 'A ryokan on the Sumida, Asakusa side', district: 'Asakusa',
    why: 'Tatami, a bath, and a five-minute walk from Kaminarimon before the crowds.',
    best: 'A first visit to Tokyo, and anyone who wants a night that is not a hotel',
    website: null },
  { id: 'roppongi-hill', name: 'A hilltop hotel above Roppongi', district: 'Roppongi',
    why: 'Above the noise with a view over the towers, and a short walk to the art.',
    best: 'Gallery days and a quiet evening above the city',
    website: null },
  { id: 'odaiba-water', name: 'A waterfront hotel at Odaiba', district: 'Odaiba',
    why: 'Rooms facing the bay. Far from the old city, which is exactly why you come.',
    best: 'The end of the journey, and a view of everything behind you',
    website: null }
]

/* ----------------------------------------------------------- EXPERIENCES --
   Arranged, bookable evenings. These are programmes we would run, built
   from the places already verified in this codebase. */
export const EXPERIENCES = [
  { id: 'counters', name: 'The counter evening', district: 'Ginza',
    dur: 'Four hours, from 19:00',
    what: 'Three counters in one walk, each with a different discipline: sushi, yakitori, then a tea house. Booked in advance, nothing over four hundred metres.',
    for: 'A first night, and anyone who wants the real thing rather than a list of famous rooms.' },
  { id: 'market-dawn', name: 'Tsukiji at dawn', district: 'Tsukiji',
    dur: 'Three hours, from 06:30',
    what: 'Into the outer market while the fish trade is ending, a knife shop, and breakfast standing at a counter.',
    for: 'Early risers. The whole point is being there before seven.' },
  { id: 'crossing-empty', name: 'The empty crossing', district: 'Shibuya',
    dur: 'Two hours, from 19:30',
    what: 'A vantage above the scramble, timed to watch it empty at 20:45, then down into the lanes behind the station.',
    for: 'Photographers, and anyone who would rather see the famous thing once than never.' },
  { id: 'blossom-walk', name: 'The blossom walk', district: 'Nakameguro',
    dur: 'Three hours, flexible by season',
    what: 'The canal end to end at the hour the light comes through, a photographer alongside, and a spring café stop.',
    for: 'Late March and early April only. We will tell you if it is not worth the walk.' },
  { id: 'lanterns', name: 'Asakusa before the buses', district: 'Asakusa',
    dur: 'Four hours, from 06:45',
    what: 'Kaminarimon and Nakamise while the shopkeepers are opening, a priest\'s introduction inside the temple, and tea on the grounds.',
    for: 'First visits, and anyone who wants the approach rather than the temple.' },
  { id: 'tower-art', name: 'The hill and the tower', district: 'Roppongi',
    dur: 'Three hours, from 15:00',
    what: 'A curator-led hour in the galleries on the upper floors, then the hill with Tokyo Tower turning on at dusk.',
    for: 'Anyone who likes art more than they expected to.' },
  { id: 'bay-end', name: 'The end of the journey', district: 'Odaiba',
    dur: 'Four hours, from 16:00',
    what: 'The promenade as the lights come on across the water, the Rainbow Bridge from the far side, and a harbour dinner facing the bay.',
    for: 'The last evening, and anyone who wants to see the city they just walked.' },
  { id: 'quiet-kagura', name: 'The quiet lanes', district: 'Shinjuku',
    dur: 'Three hours, from 18:00',
    what: 'Away from the main roads into Kagurazaka\'s stone lanes, ending at a six-seat counter with no signage.',
    for: 'People who have decided the neon is not for them.' }
]

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
