/* LIMINAL TOKYO — central media registry (§26-27).
 *
 * This is the ONE place to add photos, footage, audio and references.
 * To use a new asset the visitor provides, add an entry here only —
 * no 3D code, no panel code, no component changes are needed, because
 * every panel reads its media from this registry through MEDIA.
 *
 * Rules enforced by the loaders in main.js:
 *  - `url` must be a VERIFIED direct file (upload.wikimedia.org, or a
 *    Special:FilePath redirect for a verified Commons filename).
 *    Never invent or guess a URL. Page URLs go in `source`, not `url`.
 *  - Every entry keeps `source` (the page that proves the licence),
 *    `license`, `credit` and `alt`, and panels render the credit line.
 *  - If `url` is null the panel shows its 3D/procedural fallback and,
 *    where useful, a "view on …" link to `source`. Nothing breaks.
 *  - Images load through Special:FilePath thumbnails (official Commons
 *    redirect service) so a 2 MB original never blocks the page.
 *    <img> onerror handlers in main.js hide broken media gracefully.
 *
 * Verified 2026-10-04 via the Commons MediaWiki API (iiprop=url|extmetadata).
 */

const filePath = (name, width) =>
  'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(name) + '?width=' + (width || 800)

export const MEDIA = {
  /* ---------------- SHIBUYA ---------------- */
  shibuya: {
    image: {
      type: 'image',
      url: filePath('Shibuya_tokyo.jpg', 800),
      source: 'https://commons.wikimedia.org/wiki/File:Shibuya_tokyo.jpg',
      license: 'CC BY-SA 3.0',
      credit: 'Willswe, CC BY-SA 3.0, via Wikimedia Commons',
      alt: 'Shibuya Crossing, Tokyo (2003)'
    },
    video: {
      type: 'video',
      /* 1080p/58s original, ~57 MB: embedded with preload="none" and a
         poster, so it only streams after the visitor presses play. */
      url: 'https://upload.wikimedia.org/wikipedia/commons/5/53/Shibuya_Crossing%2C_Tokyo%2C_Japan_%28video%29.webm',
      poster: filePath('Shibuya_tokyo.jpg', 800),
      source: 'https://commons.wikimedia.org/wiki/File:Shibuya_Crossing,_Tokyo,_Japan_(video).webm',
      license: 'CC BY-SA 4.0',
      credit: 'Basile Morin, CC BY-SA 4.0, via Wikimedia Commons',
      alt: 'The scramble crossing in motion, seen from the Hachiko exit'
    },
    reference: {
      type: 'link',
      url: 'https://www.gotokyo.org/en/destinations/western-tokyo/shibuya/index.html',
      source: 'Go Tokyo — official Tokyo tourism',
      credit: 'Tokyo Convention & Visitors Bureau',
      alt: 'Official Shibuya guide'
    }
  },

  /* ---------------- ASAKUSA ---------------- */
  asakusa: {
    image: null, /* no single verified still yet; gallery below, 3D fallback meanwhile */
    gallery: {
      type: 'link',
      url: 'https://commons.wikimedia.org/wiki/Category:Asakusa',
      source: 'Wikimedia Commons',
      credit: 'Various contributors, see file pages for licences',
      alt: 'Asakusa photographs on Commons'
    },
    video: {
      type: 'video',
      /* The 4K original is ~1.8 GB and cannot be embedded responsibly.
         url stays null so panels link out instead of streaming it. If a
         smaller licensed transcode appears, put its direct URL here. */
      url: null,
      source: 'https://commons.wikimedia.org/wiki/File:4K_Tokyo_Night_Riding_Highway_Tour_in_Asakusa_-_Motorcycle_%26_Walking_Travel_in_Japan.webm',
      license: 'CC BY 3.0',
      credit: 'Japan Travel Rec, CC BY 3.0, via Wikimedia Commons',
      alt: 'Night ride dropping in at Kaminarimon, Asakusa'
    },
    reference: {
      type: 'link',
      url: 'https://www.japan.travel/en/destinations/kanto/tokyo/asakusa-and-around/',
      source: 'Japan Travel (JNTO)',
      credit: 'Japan National Tourism Organization',
      alt: 'Official Asakusa area guide'
    }
  },

  /* ---------------- RAMEN ---------------- */
  ramen: {
    image: {
      type: 'image',
      url: filePath('Shoyu Ramen（Tokyo Ramen） - 01.jpg', 800),
      source: 'https://commons.wikimedia.org/wiki/File:Shoyu_Ramen%EF%BC%88Tokyo_Ramen%EF%BC%89_-_01.jpg',
      license: 'CC BY-SA 4.0',
      credit: 'Quercus acuta, CC BY-SA 4.0, via Wikimedia Commons',
      alt: 'Shoyu ramen, Tokyo style'
    },
    gallery: {
      type: 'link',
      url: 'https://commons.wikimedia.org/wiki/Category:Ramen_of_Tokyo',
      source: 'Wikimedia Commons',
      credit: 'Various contributors, see file pages for licences',
      alt: 'More Tokyo ramen photographs'
    }
  },

  /* ---------------- SAKURA / NAKAMEGURO ---------------- */
  sakura: {
    image: null,
    gallery: {
      type: 'link',
      url: 'https://commons.wikimedia.org/wiki/Category:Nakameguro',
      source: 'Wikimedia Commons',
      credit: 'Various contributors, see file pages for licences',
      alt: 'Nakameguro photographs, including blossom season'
    },
    video: null, /* empty by request: a licensed Nakameguro video goes here */
    reference: {
      type: 'link',
      url: 'https://www.japan.travel/en/spot/377/',
      source: 'Japan Travel (JNTO)',
      credit: 'Japan National Tourism Organization',
      alt: 'Meguro River cherry blossoms guide'
    }
  },

  /* ---------------- TOKYO AUDIO ---------------- */
  audio: {
    tokyo: {
      type: 'audio',
      /* Pixabay serves audio through its own player; no verified direct
         file URL could be extracted, so url stays null and the procedural
         city/rain/night layers remain the in-page sound. Pressing play on
         Pixabay is one click from `source`. To play in-page, paste a
         direct, licensed audio file URL into `url`. */
      url: null,
      source: 'https://pixabay.com/sound-effects/city-tokyo-urban-ambiance-60287/',
      license: 'Pixabay Content License (royalty-free)',
      credit: 'freesound_community via Pixabay',
      alt: 'Tokyo urban ambience recording'
    },
    library: {
      type: 'link',
      url: 'https://pixabay.com/sound-effects/search/tokyo/',
      source: 'Pixabay',
      credit: 'Various artists, Pixabay Content License',
      alt: 'More Tokyo sound effects'
    }
  }
}
