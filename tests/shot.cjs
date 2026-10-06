/* Captures a real rendered frame of the 3D world.
   Usage: node tests/shot.cjs <name> <p 0..1> <time> <weather> [width] [height] [ui]
   Saves shots/<name>.png. This is how the build gets looked at. */

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = 'http://localhost:5199'
const SHOTS = path.join(__dirname, '..', 'shots')

const [name, p = '0.5', time = 'night', weather = 'rain', W = '1440', H = '810', ui = '1', fw = ''] = process.argv.slice(2)

fs.mkdirSync(SHOTS, { recursive: true })
const outFile = path.join(SHOTS, name + '.png')
if (fs.existsSync(outFile)) fs.unlinkSync(outFile)

const profile = path.join(require('os').tmpdir(), 'yoru-shot-' + Date.now())
const url = `${BASE}/tests/shot.html?p=${p}&time=${time}&weather=${weather}&ui=${ui}&out=${name}` +
            (fw ? `&fw=${fw}` : '')
const args = [
  '--headless=new', '--enable-unsafe-swiftshader', '--no-sandbox',
  '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + profile, '--window-size=' + W + ',' + H,
  '--virtual-time-budget=120000', '--dump-dom', url
]

let dom = ''
try {
  dom = execFileSync(EDGE, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024, timeout: 180000 })
} catch (e){ dom = (e.stdout || '') + '' }

const m = dom.match(/<pre id="png"[^>]*>(data:image\/png;base64,)([\s\S]*?)<\/pre>/)
const sm = dom.match(/<pre id="stats"[^>]*>([\s\S]*?)<\/pre>/)
const fm = dom.match(/<pre id="fwstats"[^>]*>([\s\S]*?)<\/pre>/)
fs.writeFileSync(path.join(require('os').tmpdir(), 'yoru-shot-dom.html'), dom)
if (sm){
  try { console.log('  stats: ' + sm[1].trim()) } catch (e){}
}
if (fm){
  /* for a fireworks capture this is the proof: bursts existed, and how
     many of them were inside the camera frustum */
  try { console.log('  fw: ' + fm[1].trim()) } catch (e){}
}
if (!m){
  const dbg = path.join(require('os').tmpdir(), 'yoru-shot-dom.html')
  fs.writeFileSync(dbg, dom)
  console.error('  no frame captured — DOM saved to ' + dbg + ' (' + dom.length + ' bytes)')
  const title = (dom.match(/<title>([^<]*)<\/title>/) || [, ''])[1]
  console.error('  title: ' + title)
  process.exit(1)
}
fs.writeFileSync(outFile, Buffer.from(m[2].trim(), 'base64'))
console.log('  ' + outFile + '  ' + fs.statSync(outFile).size + ' bytes  p=' + p + ' ' + time + '+' + weather)
