# YORU — LIMINAL TOKYO

**Tokyo, privately experienced.**

A luxury travel agency experience. Not a game, not a template — a long-form cinematic
journey through Tokyo where the visitor scrolls, meets people, and builds an evening.

---

## The principle

> You are not booking a trip. You are being introduced to Tokyo.

**Scroll is the primary interaction.** The camera moves through the city as you scroll.
There is deliberately **no mouse-tilt, no cursor parallax, no background-follow** — the
environment stays stable and cinematic. Hover only ever gives feedback to a single
element you are actually pointing at.

---

## The journey

| Chapter | |
| --- | --- |
| 01 | The city is just waking up |
| 02 | Follow the light |
| 03 | Dinner, without the crowd |
| 04 | Thousands of stories cross here every night |
| 05 | The Tokyo most visitors never see |
| 06 | A city that rewards the detour |
| 07 | Above it, the city keeps moving |

Then: **The Atlas** (real map) → **My Tokyo** (itinerary) → **Concierge** → **Close**.

---

## People

Five people stand in the city, each with a real purpose and a branching conversation:

- **Yuki** — private cultural guide
- **Aoi** — executive chef
- **Haruki** — sake curator
- **Ren** — design & fashion
- **Mika** — tea practitioner

Conversations are **deterministic** — every guide has authored branching paths, so the
experience is identical on every visit and cannot break. An LLM layer can be added
behind the same interface later without changing the UI.

**Voice is optional.** `Talk` uses the browser's speech recognition; `Listen` reads the
reply aloud. Both degrade silently to text if unsupported, and the mic is never required.

---

## The map

**MapLibre GL** over a **CARTO raster basemap sourced from OpenStreetMap**, with 22 real
Tokyo landmarks at their true coordinates (Shibuya Crossing, Senso-ji, Shinjuku Gyoen,
Golden Gai, Kagurazaka, Omotesando, Kuramae, Daikanyama, Shimokitazawa, Tsukiji and
more). No map geometry is fabricated.

No Google Maps key, no billing, no API cost. If a Google Maps Platform key is added
later, only the tile source in `initMap()` needs to change.

---

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173

> Serve-only project — do not run `npm run build`. Three.js and MapLibre resolve through
> Vite's dev pipeline.

---

## Stack

- **Three.js** — the city, WebGL post-processing (bloom, grain, chromatic aberration)
- **MapLibre GL** — the atlas
- **Vite** — dev server
- **Cormorant Garamond / Inter / JetBrains Mono** — typography

**Zero APIs.** Every texture, sound, neon sign, building and person is generated in the
browser. No stock photography, no AI-generated images, no tracking.

---

## Accessibility

- Every interaction works by click or tap — nothing depends on hover
- Keyboard accessible throughout, visible focus rings
- Speech always has a text equivalent
- `prefers-reduced-motion` removes camera movement and environmental animation
- Mobile gets a bottom-sheet dialogue, not a shrunken desktop HUD

---

## Structure

```
index.html      layout, typography, all editorial copy
src/main.js     city construction + tour engine + dialogue + atlas + concierge
```

---

## Content note

LIMINAL TOKYO is a fictional agency. Neighborhoods, landmarks and geography are real;
the storytelling, pricing and availability are illustrative sample content. No booking
is made through this site.