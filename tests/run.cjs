/* Test runner for LIMINAL TOKYO.
   Boots the real app in headless Edge and runs behavioural scenarios.
   Reduced-motion behaviour is verified twice: once with the browser preference
   off, once with --force-prefers-reduced-motion on. */

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = 'http://localhost:5199'
const OUT = path.join(__dirname, 'results.json')
const TMP = path.join(require('os').tmpdir(), 'yoru-test')

let runSeq = 0
const argsFor = extra => {
  /* a private profile per run: otherwise Edge attaches to an already-running
     instance and writes nothing to stdout */
  const profile = path.join(TMP, 'p' + (++runSeq))
  fs.mkdirSync(profile, { recursive: true })
  return [
    '--headless=new', '--enable-unsafe-swiftshader', '--no-sandbox',
    '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + profile,
    '--virtual-time-budget=90000',
    ...extra, '--dump-dom'
  ]
}

function run(scenario, extra = []){
  const url = `${BASE}/tests/index.html?s=${scenario}`
  let dom = ''
  try {
    dom = execFileSync(EDGE, argsFor(extra).concat([url]), {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024, timeout: 180000
    })
  } catch (e){ dom = (e.stdout || '') + ''; if (process.env.YORU_DEBUG) console.error('  [run error]', e.name, String(e.message).slice(0, 200)) }
  const m = dom.match(/<pre id="result"[^>]*>([\s\S]*?)<\/pre>/)
  if (!m){
    const out = (dom.match(/<pre id="out">([\s\S]*?)<\/pre>/) || [, ''])[1]
    return { __parseError: true, len: dom.length, preview: out.replace(/<[^>]+>/g, '').slice(0, 400) }
  }
  try { return JSON.parse(m[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')) }
  catch (e){ return { __jsonError: true, preview: m[1].slice(0, 300) } }
}

const only = process.argv[2]
const SCEN = ['reducedCamera', 'shrine', 'chef', 'atmosphereMatrix', 'transitions', 'districts', 'regression']
const list = only ? [only] : SCEN

let all = []
let failedRuns = []

for (const s of list){
  if (s === 'reducedCamera'){
    for (const [label, extra] of [['motion', []], ['reduced', ['--force-prefers-reduced-motion']]]){
      const r = run(s, extra)
      if (!r || r.__parseError || r.__jsonError){
        failedRuns.push(`${s}:${label} ${r ? JSON.stringify(r).slice(0,300) : 'null'}`); continue
      }
      all.push(...r.map(x => ({ ...x, name: `[${label}] ${x.name}` })))
    }
  } else {
    const r = run(s)
    if (!r || r.__parseError || r.__jsonError){
      failedRuns.push(`${s} ${r ? JSON.stringify(r).slice(0,300) : 'null'}`); continue
    }
    all.push(...r)
  }
}

fs.writeFileSync(OUT, JSON.stringify(all, null, 2))

const pass = all.filter(r => r.pass).length
const fail = all.filter(r => !r.pass)

console.log('\n' + '='.repeat(72))
console.log('  LIMINAL TOKYO — behavioural test run')
console.log('='.repeat(72))
if (failedRuns.length) console.log('  harness problems: ' + failedRuns.join(', '))

let lastGroup = ''
for (const r of all){
  const group = r.name.replace(/^\[[^\]]+\]\s*/, '').replace(/\s+—.*$/, '')
  if (group !== lastGroup){ console.log('\n  ' + group); lastGroup = group }
  console.log('   ' + (r.pass ? 'PASS' : 'FAIL') + '  ' + r.name.replace(/^\[[^\]]+\]\s*/, '') +
              (r.detail ? '   ' + r.detail : ''))
}
console.log('\n' + '-'.repeat(72))
console.log(`  ${pass} passed, ${fail.length} failed, ${all.length} total`)
console.log('='.repeat(72) + '\n')
process.exit(fail.length || failedRuns.length ? 1 : 0)