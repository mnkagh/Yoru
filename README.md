# YORU — Tokyo, After Dark

**LIMINAL TOKYO** — an interactive night journey through Tokyo.

You enter the city. You walk it. It's rainy, it's alive, and five moments are hidden in it.

## The experience

Not a travel website. A night you can walk around.

- **First-person city** — WASD / arrows to walk, mouse to look (click to capture the pointer)
- **Interact** — press **E** near anything alive: the ramen stall, vending machines, the arcade cabinet, a stray cat, a shrine, the last train
- **Map** — press **M**, drag to rotate, click a neighborhood, hit **NAVIGATE →**
- **Discover 5 moments** — hidden ramen alley, vending machine, tiny shrine, the rooftop, the last train
- **Alive** — traffic lights cycle, cars stop at red, trains arrive on a loop, pedestrians carry umbrellas, rain ripples in puddles, steam rises from the bowl
- **Night cycle** — the clock runs from 23:47 onward, rain eases at the rooftop

## Controls

| Key | Action |
| --- | --- |
| `W A S D` / arrows | walk |
| mouse | look (click to capture pointer) |
| `E` / click | interact |
| `M` | map |
| `S` | sound on/off |
| `Esc` | close panels |

On mobile: joystick to walk, drag to look, on-screen **E** and **MAP** buttons.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173

> Note: this is a serve-only project. Don't run `npm run build` — Three.js loads from
> `node_modules` via Vite's dev pipeline and there's no static build step configured.

## Stack

- **Three.js** — rendering, WebGL post-processing (bloom, film grain, chromatic aberration)
- **Vite** — dev server
- **No APIs.** Every texture, sound, neon sign and building is generated in the browser.
  No stock photography, no maps API, no keys.

## Structure

```
index.html      UI, styles, HUD, panels
src/main.js     entire 3D world + game loop
```

## Credits

Fictional storytelling, real neighborhood names and geography. All visuals are
procedurally generated — no copyrighted imagery is used.