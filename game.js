"use strict";
// ============================================================
// CRAB SCRAMBLE — prototype v3
// Levels + Endless · molting · fiddler grabs (PINCHED!) ·
// sand dollars · gold busts shells · heat surges · quests · sfx
// ============================================================

const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  cvs.width = W * DPR; cvs.height = H * DPR;
  cvs.style.width = W + 'px'; cvs.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// ---------- Audio (tiny synth) ----------
let AC = null, muted = false;
function ac() { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); return AC; }
function beep(freq, dur, type='sine', vol=0.15, slide=0) {
  if (muted) return;
  try {
    const a = ac(), o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination);
    o.start(); o.stop(a.currentTime + dur);
  } catch(e) {}
}
const sfx = {
  jump:  () => beep(280, 0.18, 'square', 0.08, 220),
  land:  () => beep(150, 0.1, 'square', 0.12, -60),
  coin:  () => { beep(880, 0.09, 'sine', 0.12); setTimeout(()=>beep(1320,0.12,'sine',0.12), 70); },
  combo: (n) => beep(500 + n*220, 0.14, 'sine', 0.14),
  gold:  () => [523,659,784,1046].forEach((f,i)=>setTimeout(()=>beep(f,0.16,'sine',0.14), i*80)),
  molt:  () => beep(220, 0.25, 'sawtooth', 0.14, -140),
  grab:  () => beep(180, 0.2, 'sawtooth', 0.12, -60),
  smash: () => beep(190, 0.12, 'square', 0.16, -120),
  bonk:  () => beep(120, 0.12, 'square', 0.14, -40),
  death: () => beep(140, 0.6, 'sawtooth', 0.16, -100),
  alarm: () => { beep(440,0.15,'square',0.1); setTimeout(()=>beep(440,0.15,'square',0.1), 220); },
  win:   () => [523,659,784,1046,1318].forEach((f,i)=>setTimeout(()=>beep(f,0.2,'sine',0.14), i*110)),
};

// ---------- Seeded RNG ----------
function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const d0 = new Date();
const DAILY_SEED = d0.getFullYear()*10000 + (d0.getMonth()+1)*100 + d0.getDate();
const FLOOR_Y = 40;   // world y of the bucket floor — every climb starts from the bottom

// ---------- Tuning ----------
const T = {
  gravity: 1400, maxPower: 950, powerPerPx: 6.2,
  slideBase: 26, slidePer100: 3.2,
  waterBase: 30, waterPer100: 5, waterCatchup: 760,
  aimSlowmo: 0.28, wallPad: 10,
  crabGapMin: 62, crabGapMax: 118,
  bigGapChance: 0.2, bigGap: 170,
  obstacleChance: 0.5, obstacleMinGap: 130,
  dollarChance: 0.2,
  speckleBoost: 1.38, speckleTime: 6,
  kingNerf: 0.68, kingTime: 5,
  goldTime: 5, growStep: 0.13, growMax: 1.6,
  moltCost: 0.26, gripTime: 1.5,
  metersPerPx: 0.1,
  surgeIdleMin: 14, surgeIdleMax: 22, surgeWarn: 1.6, surgeRush: 1.4, surgeMult: 4,
};

const TYPES = {
  plain:   { color:'#b08e6a', color2:'#8f7052' },
  red:     { color:'#d9483b', color2:'#a83428' },
  speckled:{ color:'#7fb069', color2:'#5d8a4a' },
  king:    { color:'#8e6bb5', color2:'#6b4d8f' },
  fiddler: { color:'#e0b552', color2:'#b58a34' },
  blue:    { color:'#3a7bd5', color2:'#2857a0' },
};
const ENDLESS_W = { plain:0.34, red:0.24, speckled:0.14, king:0.10, fiddler:0.10, blue:0.08 };
function pickType(r, weights) {
  let acc = 0;
  for (const k in weights) { acc += weights[k]; if (r < acc) return k; }
  return 'plain';
}
function lerpColor(a, b, u) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = ((pa>>16)&255) + (((pb>>16)&255) - ((pa>>16)&255))*u;
  const g = ((pa>>8)&255)  + (((pb>>8)&255)  - ((pa>>8)&255))*u;
  const bl = (pa&255)      + ((pb&255)       - (pa&255))*u;
  return 'rgb(' + (r|0) + ',' + (g|0) + ',' + (bl|0) + ')';
}

// ---------- Levels ----------
// Each level = knobs on the same generator + a rim to escape over.
function L(t, opts) { return Object.assign({ t, wtr:1, sld:1, obst:0, surge:false, big:0.2,
  types:{ plain:0.6, red:0.4 } }, opts); }
const LEVELS = [
  L(40,  { wtr:0.7, sld:0.7, name:'First Scuttle', intro:["Drag back, aim, release.","Climb crabs. Beat the boil."] }),
  L(50,  { wtr:0.75, sld:0.75, name:'Grow Up', types:{plain:0.5,red:0.5}, intro:["Red crabs grow you —","3 in a row goes GOLD!"] }),
  L(60,  { wtr:0.85, sld:0.8, name:'Molt & Bolt', types:{plain:0.45,red:0.55}, intro:["Grown crabs survive the boil","by molting a shell!"] }),
  L(70,  { wtr:0.9, sld:0.85, name:'Meet Speckles', types:{plain:0.45,red:0.3,speckled:0.25}, intro:["Speckled crabs boost","your next jumps!"] }),
  L(70,  { wtr:0.9, sld:0.9, obst:0.5, shellOnly:true, name:'Shell Shocked', types:{plain:0.5,red:0.3,speckled:0.2}, intro:["Shells boing you back —","jump across to grab them!"] }),
  L(80,  { wtr:0.95, sld:0.9, obst:0.55, name:'Rock Bottom', types:{plain:0.5,red:0.3,speckled:0.2}, intro:["Rocks bonk you down —","even gold can\u2019t smash rocks!"] }),
  L(85,  { wtr:1, sld:0.95, obst:0.5, name:'Royal Pain', types:{plain:0.4,red:0.3,speckled:0.15,king:0.15}, intro:["King crabs make you","heavy. Shorter jumps!"] }),
  L(90,  { wtr:1, sld:1, obst:0.5, name:'The Grip', types:{plain:0.35,red:0.3,speckled:0.15,king:0.05,fiddler:0.15}, intro:["Fiddler crabs GRIP you!","Molt to slip free."] }),
  L(95,  { wtr:1, sld:1, obst:0.5, name:'Blue Money', types:{plain:0.3,red:0.28,speckled:0.14,king:0.08,fiddler:0.1,blue:0.1}, intro:["Blue crabs drop bonus","sand dollars!"] }),
  L(100, { wtr:1.05, sld:1, obst:0.5, surge:true, name:'Heat Wave', types:{plain:0.32,red:0.28,speckled:0.14,king:0.08,fiddler:0.1,blue:0.08}, intro:["HEAT SURGES! When it","bubbles — climb fast!"] }),
  L(110, { wtr:1.05, sld:1.05, obst:0.45, surge:true, big:0.34, name:'Barren Walls', types:{plain:0.34,red:0.26,speckled:0.14,king:0.08,fiddler:0.1,blue:0.08} }),
  L(120, { wtr:1.1, sld:1.15, obst:0.5, surge:true, slide:true, name:'Slip Slide', types:{plain:0.3,red:0.26,speckled:0.16,king:0.1,fiddler:0.1,blue:0.08}, intro:["The walls slide down!","Keep moving or sink."] }),
  L(130, { wtr:1.15, sld:1.2, obst:0.55, surge:true, slide:true, name:'Full Boil', types:{plain:0.28,red:0.26,speckled:0.14,king:0.12,fiddler:0.12,blue:0.08} }),
  L(140, { wtr:1.2, sld:1.25, obst:0.6, surge:true, slide:true, big:0.3, name:'Crab Chaos', types:{plain:0.26,red:0.26,speckled:0.14,king:0.12,fiddler:0.14,blue:0.08} }),
  L(160, { wtr:1.25, sld:1.3, obst:0.6, surge:true, slide:true, big:0.3, name:'The Great Escape', types:{plain:0.24,red:0.28,speckled:0.14,king:0.12,fiddler:0.14,blue:0.08} }),
];
let unlocked = 1;                 // highest unlocked level (1-based)
let levelStars = LEVELS.map(() => 0);
let levelDone  = LEVELS.map(() => false);
let mapScroll = null, mapDrag = null, selectedLevel = null;
const MAPC = { cols: 3, gapY: 118, top: 150 };
function nodePos(i) {
  const row = Math.floor(i / 3);
  let col = i % 3; if (row % 2 === 1) col = 2 - col;
  return { x: W/2 + (col-1) * Math.min((W-80)/3, 110),
           y: MAPC.top + (4 - row) * MAPC.gapY };   // level 1 at the bottom — you climb the map too
}
function clampMapScroll(v) {
  const contentH = MAPC.top + 5*MAPC.gapY + 120;
  const minS = Math.min(0, H - contentH);
  return Math.max(minS, Math.min(0, v));
}

// ---------- Session persistence (in-memory) ----------
let best = 0, ghostBest = null, wallet = 0;
const gestures = { flick: 0, sling: 0 };
const quests = [
  { text:'Collect 30 sand dollars', target:30, prog:0, done:false, reward:15 },
  { text:'Land on 3 blue crabs',    target:3,  prog:0, done:false, reward:15 },
  { text:'Reach 80m in one run',    target:80, prog:0, done:false, reward:20 },
];
function questBump(i, val, isMax) {
  const q = quests[i];
  if (q.done) return;
  q.prog = isMax ? Math.max(q.prog, val) : q.prog + val;
  if (q.prog >= q.target) {
    q.done = true; wallet += q.reward;
    popup('QUEST DONE! +' + q.reward, player ? player.x : W/2, player ? player.y - 90 : H/2, '#9fe08a');
    sfx.coin();
  }
}

// ---------- Run state ----------
let mode = 'title'; // title | map | play | dead | won
let runMode = 'endless'; // 'endless' | 'level'
let levelNum = 1, cfg = null;
let cam, player, crabs, obs, dollars, water, slots, lastObs, rng, dollarRng, timeAlive;
let popups = [], particles = [], bubbles = [], shells = [], shake = 0;
let ghostFrames, beatGhost, surge, runDollars, levelDollarsGot, deathCause, escapeT = 0, deadT = 0;
let buttons = []; // clickable rects for menu screens

function currentSeed() {
  return runMode === 'level' ? (777000 + levelNum * 13) : DAILY_SEED;
}

function reset() {
  cfg = runMode === 'level' ? LEVELS[levelNum-1] : null;
  cam = { y: 0 };
  player = {
    x: W/2, y: FLOOR_Y - 16, vx: 0, vy: 0,
    r: 16, scale: 1,
    attached: null, onPlatform: true,
    launchPerch: 'platform', launchSide: null,
    ignoreList: [],
    boostT: 0, nerfT: 0, goldT: 0, gripT: 0,
    panicAim: false, scramble: null,
    combo: 0, maxHeight: 0, squash: 0, face: 1,
  };
  crabs = []; obs = []; dollars = [];
  slots = { left: -60, right: -110 };
  lastObs = { left: false, right: false };
  const seed = currentSeed();
  rng = { left: mulberry32(seed), right: mulberry32(seed ^ 0x9E3779B9) };
  water = { y: FLOOR_Y + 18, started: false, heat: 0 };
  surge = { phase: 'idle', t: 8 + Math.random()*8 };
  timeAlive = 0; runDollars = 0; levelDollarsGot = 0; deathCause = 'boiled';
  popups = []; particles = []; bubbles = []; shells = []; shake = 0;
  ghostFrames = []; beatGhost = false;
  // level star-dollars: 3 golden sand dollars at fixed risky heights
  if (cfg) {
    const lr = mulberry32(seed ^ 0x51ED);
    for (const f of [0.35, 0.6, 0.85]) {
      const lw = wallX('L') + 44, rw = wallX('R') - 44;
      dollars.push({ x: lw + lr() * (rw - lw), y: -(cfg.t * f) / T.metersPerPx,
                     r: 12, star: true, dead: false });
    }
  }
  fillCrabs();
}

function wallX(side) {
  const interior = Math.min(W * 0.68, 280);
  return side === 'L' ? (W - interior) / 2 : (W + interior) / 2;
}
function laneX(side) { return wallX(side) + (side === 'L' ? T.wallPad + 6 : -(T.wallPad + 6)); }

function fillCrabs() {
  const top = cam.y - H;
  const weights = cfg ? cfg.types : ENDLESS_W;
  const obstChance = cfg ? cfg.obst : T.obstacleChance;
  const bigC = cfg ? cfg.big : T.bigGapChance;
  for (const s of ['left','right']) {
    const side = s === 'left' ? 'L' : 'R';
    const R = rng[s];
    while (slots[s] > top) {
      // levels are bounded arenas: the crab field ends about one jump
      // below the rim, so the final move is a deliberate rim vault
      if (cfg && slots[s] <= -cfg.t/T.metersPerPx + 190) break;
      const r1=R(), r2=R(), r3=R(), r4=R(), r5=R(), r6=R(), r7=R(), r8=R();
      let gap = T.crabGapMin + r1 * (T.crabGapMax - T.crabGapMin);
      if (r2 < bigC) gap = T.bigGap;
      const prevY = slots[s];
      slots[s] -= gap;
      crabs.push({ side, y: slots[s], type: pickType(r3, weights),
        r: 17 + r6*4, wiggle: Math.random()*Math.PI*2, dead: false });
      const canHost = gap >= T.obstacleMinGap && !lastObs[s];
      if (canHost && r4 < obstChance) {
        let kind = r5 < 0.5 ? 'rock' : 'shell';
        if (cfg && cfg.shellOnly) kind = 'shell';
        obs.push({ side, y: prevY - gap*0.52, kind, r: 14, dead: false });
        lastObs[s] = true;
      } else lastObs[s] = false;
      // free-floating sand dollars in mid-bucket
      if (r7 < T.dollarChance) {
        const lw = wallX('L') + 50, rw = wallX('R') - 50;
        dollars.push({ x: lw + r8*(rw-lw), y: slots[s] + gap*0.4, r: 10, star: false, dead: false });
      }
    }
  }
}

// ---------- Input ----------
let aim = null;
function canAim() { return mode==='play' && player.gripT<=0 && !player.scramble && (player.attached || player.onPlatform || player.panicAim); }

function pDown(x, y) {
  if (mode === 'escape') { winLevel(); return; }
  if (mode === 'map') {
    if (selectedLevel) {
      for (const b of buttons) if (x>=b.x && x<=b.x+b.w && y>=b.y && y<=b.y+b.h) { b.fn(); return; }
      return;
    }
    mapDrag = { y0: y, s0: mapScroll || 0, moved: false, x, y };
    return;
  }
  if (mode === 'title' || mode === 'dead' || mode === 'won') {
    for (const b of buttons) {
      if (x >= b.x && x <= b.x+b.w && y >= b.y && y <= b.y+b.h) { b.fn(); return; }
    }
    return;
  }
  if (canAim()) aim = { sx:x, sy:y, cx:x, cy:y };
}
function pMove(x, y) {
  if (mapDrag) {
    if (Math.abs(y - mapDrag.y0) > 8) mapDrag.moved = true;
    mapScroll = clampMapScroll(mapDrag.s0 + (y - mapDrag.y0));
    return;
  }
  if (aim) { aim.cx = x; aim.cy = y; }
}
function pUp() {
  if (mapDrag) {
    if (!mapDrag.moved) {
      for (const b of buttons)
        if (mapDrag.x>=b.x && mapDrag.x<=b.x+b.w && mapDrag.y>=b.y && mapDrag.y<=b.y+b.h) { b.fn(); break; }
    }
    mapDrag = null;
    return;
  }
  if (aim && canAim()) {
    const v = launchVector();
    if (v.mag > 90) {
      player.launchPerch = player.attached || (player.panicAim ? 'air' : 'platform');
      player.launchSide = player.attached ? player.attached.side : null;
      player.vx = v.vx; player.vy = v.vy;
      if (player.attached) ignore(player.attached, 0.3);
      player.panicAim = false;
      player.attached = null; player.onPlatform = false;
      player.squash = -0.35; player.face = v.vx >= 0 ? 1 : -1;
      spawnDust(player.x, player.y + player.r);
      if (!water.started) water.started = true;
      if (isFlick()) gestures.flick++; else gestures.sling++;
      sfx.jump();
    }
  }
  aim = null;
}
function ignore(obj, t) { player.ignoreList.push({ obj, t }); }
function isIgnored(obj) { return player.ignoreList.some(e => e.obj === obj); }

// Two gestures, one rule: every useful jump goes UP, so a drag that moves
// the finger DOWN is a pull-back (slingshot) and a drag that moves it UP is
// a flick toward the target. Both launch the same way; nobody has to learn
// the other one exists.
function isFlick() { return aim && (aim.cy - aim.sy) < -12; }
function launchVector() {
  let dx = aim.sx - aim.cx, dy = aim.sy - aim.cy;
  if (isFlick()) { dx = -dx; dy = -dy; }
  let mag = Math.hypot(dx, dy) * T.powerPerPx;
  let mul = 1 + (player.scale - 1) * 0.18;
  if (player.boostT > 0) mul *= T.speckleBoost;
  if (player.nerfT > 0)  mul *= T.kingNerf;
  mag = Math.min(mag * mul, T.maxPower * mul);
  const a = Math.atan2(dy, dx);
  return { vx: Math.cos(a)*mag, vy: Math.sin(a)*mag, mag };
}

cvs.addEventListener('pointerdown', e => { cvs.setPointerCapture(e.pointerId); ac(); pDown(e.clientX, e.clientY); });
cvs.addEventListener('pointermove', e => pMove(e.clientX, e.clientY));
cvs.addEventListener('pointerup',   () => pUp());
cvs.addEventListener('pointercancel', () => aim = null);

// ---------- FX ----------
function popup(text, x, y, color) { popups.push({ text, x, y, t:0, color }); }
function spawnDust(x, y) {
  for (let i = 0; i < 8; i++) particles.push({ x, y, vx:(Math.random()-0.5)*160, vy:-Math.random()*120, t:0, life:0.5, c:'rgba(220,200,170,', s:3 });
}
function spawnBurst(x, y, col, n=14) {
  for (let i = 0; i < n; i++) {
    const a = Math.random()*Math.PI*2, sp = 60+Math.random()*180;
    particles.push({ x, y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-60, t:0, life:0.7, c:col, s:4 });
  }
}

// ---------- Landing / effects ----------
function attachTo(thing) {
  player.attached = thing;
  player.vx = 0; player.vy = 0;
  player.squash = 0.45;
  player.y = thing.y - thing.r*0.6 - player.r*player.scale*0.7;
  player.x = laneX(thing.side);
}

function landOnCrab(crab) {
  attachTo(crab);
  sfx.land();
  const t = crab.type;
  const fresh = !crab.spent;
  if (t === 'red' && fresh) {
    player.combo++;
    sfx.combo(player.combo);
    player.scale = Math.min(player.scale + T.growStep, T.growMax);
    popup('GROW!', player.x, player.y-30, '#ff6b5e');
    spawnBurst(player.x, player.y, 'rgba(217,72,59,');
    spendCrab(crab);
    if (player.combo >= 3) {
      player.goldT = T.goldTime; player.combo = 0;
      popup('★ GOLD CRAB ★', player.x, player.y-70, '#ffd76b');
      spawnBurst(player.x, player.y, 'rgba(255,215,107,', 26);
      shake = 6; sfx.gold();
    }
  } else if (t === 'speckled' && fresh) {
    player.combo = 0;
    player.boostT = T.speckleTime;
    popup('BOOST!', player.x, player.y-30, '#9fe08a');
    spawnBurst(player.x, player.y, 'rgba(127,176,105,');
    spendCrab(crab);
  } else if (t === 'blue' && fresh) {
    player.combo = 0;
    addDollars(3, player.x, player.y-30);
    questBump(1, 1, false);
    spendCrab(crab);
  } else if (t === 'king') {
    player.combo = 0;
    if (player.goldT > 0) {
      // even royalty bows to gold
      popup('THE KING BOWS!', player.x, player.y-30, '#ffd76b');
      spawnBurst(player.x, player.y, 'rgba(255,215,107,', 10);
    } else {
      player.nerfT = T.kingTime;
      popup('HEAVY...', player.x, player.y-30, '#b79ad6');
      spawnBurst(player.x, player.y, 'rgba(142,107,181,', 8);
    }
  } else if (t === 'fiddler') {
    player.combo = 0;
    if (player.goldT > 0) {
      // gold fears only stone — the fiddler burns its claw trying
      popup('TOO HOT!', player.x, player.y-30, '#ffd76b');
      spawnBurst(player.x, player.y, 'rgba(255,215,107,', 10);
    } else {
      player.gripT = T.gripTime;
      popup('GRIPPED!', player.x, player.y-30, '#e0b552');
      shake = 4; sfx.grab();
    }
  } else {
    // plain, or a gift crab with nothing left to give
    player.combo = 0;
  }
}

function spendCrab(c) {
  c.spent = true;
  c.spentAt = performance.now();
  // the moment of spending is loud, even though the spent state is quiet
  for (let i = 0; i < 6; i++) particles.push({
    x: laneX(c.side) + (Math.random()-0.5)*20, y: c.y - c.r,
    vx: (Math.random()-0.5)*60, vy: -40-Math.random()*50,
    t: 0, life: 0.6, c: 'rgba(220,215,205,', s: 3
  });
}

function addDollars(n, x, y) {
  wallet += n; runDollars += n;
  popup('+' + n + ' $', x, y, '#f2e3c0');
  spawnBurst(x, y, 'rgba(242,227,192,', 8);
  sfx.coin();
  questBump(0, n, false);
}

function hitObstacle(o) {
  // GOLD busts shells — any direction
  if (o.kind === 'shell' && player.goldT > 0) {
    o.dead = true;
    popup('SMASH!', player.x, player.y-26, '#ffd76b');
    spawnBurst(player.x, player.y, 'rgba(255,179,193,', 16);
    shake = 5; sfx.smash();
    addDollars(2, player.x, player.y-50);
    return; // fly on through
  }
  if (player.launchSide === o.side) {
    if (o.kind === 'rock') {
      popup('BONK!', player.x, player.y-26, '#cfd6dd');
      shake = 5; sfx.bonk();
      ignore(o, 1.2);
      if (player.launchPerch !== 'platform') ignore(player.launchPerch, 1.2);
      player.vx = 0; player.vy = Math.max(player.vy, 180);
      player.x = laneX(o.side);
      spawnBurst(player.x, player.y, 'rgba(200,210,220,', 8);
    } else {
      popup('BOING!', player.x, player.y-26, '#ffb3c1');
      spawnBurst(player.x, player.y, 'rgba(255,179,193,', 8);
      sfx.bonk();
      const p = player.launchPerch;
      if (p === 'platform' || !p || p.dead) {
        player.onPlatform = true; player.attached = null;
        player.x = W/2; player.y = FLOOR_Y - 16; player.vx = 0; player.vy = 0;
      } else attachTo(p);
    }
  } else {
    attachTo(o);
    sfx.land();
    popup('GRAB!', player.x, player.y-26, '#e8d9a0');
  }
}

// molt: shed a shell instead of dying (if grown), then scramble to safety
function tryMoltOrDie(cause) {
  if (player.scale > 1.01) {
    player.scale = Math.max(1, player.scale - T.moltCost);
    player.gripT = 0;                       // shedding slips any grip
    player.attached = null; player.onPlatform = false;
    shells.push({ x: player.x, y: water.y, vy: 40, t: 0 });
    popup('MOLT!', player.x, water.y-40, '#f0824f');
    spawnBurst(player.x, water.y, 'rgba(240,130,79,', 18);
    shake = 6; sfx.molt();
    const perch = findSafePerch();
    if (perch) {
      // desperate scramble to the nearest safe perch — agency restored
      player.scramble = { target: perch, t: 0, dur: 0.24,
                          fx: player.x, fy: water.y - player.r*player.scale };
      player.vx = 0; player.vy = 0;
      popup('SCRAMBLE!', player.x, water.y-70, '#ffd76b');
    } else {
      // nothing in reach: one aimable panic jump from the surface
      player.y = water.y - player.r*player.scale;
      player.vy = -1000; player.vx = 0;
      player.panicAim = true;
      popup('PANIC JUMP!', player.x, water.y-70, '#ffd76b');
    }
    return true;
  }
  die(cause);
  return false;
}

// nearest landable spot that won't immediately betray you:
// no fiddlers, nothing about to sink; slight preference for upward
function findSafePerch() {
  let bestP = null, bestD = 1e9;
  const consider = (p, isCrab) => {
    if (p.dead) return;
    if (isCrab && p.type === 'fiddler') return;
    if (p.y > water.y - 50) return;
    if (p.y < player.y - 520) return;
    const dx = laneX(p.side) - player.x, dy = p.y - player.y;
    const d = Math.hypot(dx, dy) + Math.max(0, dy) * 0.5;
    if (d < bestD) { bestD = d; bestP = p; }
  };
  for (const c of crabs) consider(c, true);
  for (const o of obs) consider(o, false);
  return bestP;
}

function die(cause) {
  mode = 'dead'; deathCause = cause; deadT = 0;
  const h = Math.floor(player.maxHeight);
  if (runMode === 'endless') {
    if (h > best) best = h;
    if (!ghostBest || player.maxHeight > ghostBest.height)
      ghostBest = { frames: ghostFrames, height: player.maxHeight };
  }
  shake = 0; sfx.death();
  spawnBurst(player.x, player.y, 'rgba(255,120,80,', 30);
}

function startEscape() {
  mode = 'escape'; escapeT = 0;
  levelDone[levelNum-1] = true;
  const stars = levelDollarsGot;
  if (stars > levelStars[levelNum-1]) levelStars[levelNum-1] = stars;
  if (levelNum === unlocked && unlocked < LEVELS.length) unlocked++;
  particles = [];
  shake = 0;
  sfx.win();
}
function winLevel() { mode = 'won'; }

// ---------- Update ----------
let last = performance.now();
function tick(now) {
  requestAnimationFrame(tick);
  let dt = Math.min((now - last)/1000, 0.033);
  last = now;
  const slow = (aim && canAim()) ? T.aimSlowmo : 1;
  if (mode === 'play') update(dt*slow, dt);
  else if (mode === 'escape') { escapeT += dt; }
  if (mode === 'dead') deadT += dt;
  if (mode !== 'play') shake = Math.max(0, shake - dt*30);
  draw();
}

function update(dt, rawDt) {
  timeAlive += dt;
  const height = player.maxHeight;
  const sldMul = cfg ? cfg.sld : 1, wtrMul = cfg ? cfg.wtr : 1;
  // in levels, walls are stationary (learnable layouts) unless the level
  // introduces the slide as a mechanic; endless always runs the treadmill
  const slideOn = !cfg || cfg.slide;
  const slideSpd = slideOn ? (T.slideBase + (height/100)*T.slidePer100*10) * sldMul : 0;
  let waterSpd  = (T.waterBase + (height/100)*T.waterPer100*10) * wtrMul;

  // heat surges
  const surgeOn = cfg ? cfg.surge : (height > 60);
  if (surgeOn && water.started) {
    surge.t -= dt;
    if (surge.phase === 'idle' && surge.t <= 0) {
      surge.phase = 'warn'; surge.t = T.surgeWarn;
      popup('⚠ SURGE!', W/2, cam.y + H*0.75, '#ff9b5e');
      sfx.alarm();
    } else if (surge.phase === 'warn' && surge.t <= 0) {
      surge.phase = 'rush'; surge.t = T.surgeRush;
    } else if (surge.phase === 'rush' && surge.t <= 0) {
      surge.phase = 'idle'; surge.t = T.surgeIdleMin + Math.random()*(T.surgeIdleMax - T.surgeIdleMin);
    }
    if (surge.phase === 'rush') waterSpd *= T.surgeMult;
    if (surge.phase === 'warn') shake = Math.max(shake, 1.5);
  }

  for (const c of crabs) c.y += slideSpd*dt;
  for (const o of obs)   o.y += slideSpd*dt;
  for (const dd of dollars) if (!dd.star) dd.y += slideSpd*dt;
  slots.left += slideSpd*dt; slots.right += slideSpd*dt;

  for (const e of player.ignoreList) e.t -= dt;
  player.ignoreList = player.ignoreList.filter(e => e.t > 0);

  player.gripT = Math.max(0, player.gripT - dt);

  if (player.scramble) {
    const s = player.scramble;
    s.t += dt;
    const p = s.target;
    if (p.dead) { player.scramble = null; player.vy = -800; player.panicAim = true; }
    else {
      const tx = laneX(p.side), ty = p.y - p.r*0.6 - player.r*player.scale*0.7;
      const u = Math.min(1, s.t / s.dur), ease = u*u*(3-2*u);
      player.x = s.fx + (tx - s.fx)*ease;
      player.y = s.fy + (ty - s.fy)*ease;
      if (u >= 1) {
        player.scramble = null;
        if (p.type) landOnCrab(p);
        else { attachTo(p); sfx.land(); popup('GRAB!', player.x, player.y-26, '#e8d9a0'); }
      }
    }
  } else if (player.attached) {
    const a = player.attached;
    player.y = a.y - a.r*0.6 - player.r*player.scale*0.7;
    if (a.dead) player.attached = null;
  } else if (!player.onPlatform) {
    player.vy += T.gravity*dt;
    player.x += player.vx*dt;
    player.y += player.vy*dt;

    const lw = wallX('L'), rw = wallX('R');
    // hitbox barely grows with size — growth is visual armor (molts),
    // not clumsiness; aim stays trustworthy at every size
    const pr = player.r * Math.min(player.scale, 1.15);
    if (player.x - pr < lw) { player.x = lw+pr; player.vx = Math.abs(player.vx)*0.15; }
    if (player.x + pr > rw) { player.x = rw-pr; player.vx = -Math.abs(player.vx)*0.15; }

    let handled = false;
    for (const o of obs) {
      if (o.dead || isIgnored(o)) continue;
      if (o.side === player.launchSide && Math.abs(player.vx) > 100 && !(o.kind==='shell' && player.goldT>0)) continue;
      const cx = laneX(o.side);
      const dx = player.x-cx, dy = player.y-o.y;
      if (dx*dx + dy*dy < Math.pow(pr + o.r*0.95, 2)) { hitObstacle(o); handled = !o.dead; break; }
    }
    if (!handled) {
      for (const c of crabs) {
        if (c.dead || isIgnored(c)) continue;
        if (c.side === player.launchSide && Math.abs(player.vx) > 100) continue;
        const cx = laneX(c.side);
        const dx = player.x-cx, dy = player.y-c.y;
        if (dx*dx + dy*dy < Math.pow(pr + c.r*0.9, 2)) { landOnCrab(c); break; }
      }
    }
  }

  // sand dollars
  {
    const pr = player.r*player.scale;
    for (const dd of dollars) {
      if (dd.dead) continue;
      const dx = player.x-dd.x, dy = player.y-dd.y;
      if (dx*dx + dy*dy < Math.pow(pr + dd.r + 4, 2)) {
        dd.dead = true;
        if (dd.star) { levelDollarsGot++; popup('★ LEVEL DOLLAR!', dd.x, dd.y-24, '#ffd76b'); sfx.coin(); wallet += 5; runDollars += 5; questBump(0,5,false); spawnBurst(dd.x, dd.y, 'rgba(255,215,107,', 14); }
        else addDollars(1, dd.x, dd.y-20);
      }
    }
  }

  player.boostT = Math.max(0, player.boostT - dt);
  player.nerfT  = Math.max(0, player.nerfT - dt);
  player.goldT  = Math.max(0, player.goldT - dt);
  player.squash *= Math.pow(0.001, dt);
  player.maxHeight = Math.max(player.maxHeight, -player.y*T.metersPerPx);
  questBump(2, player.maxHeight, true);

  // anime sweat when the boil is within a body-length or two
  if (water.started && water.y - player.y < 140 && player.goldT <= 0 && Math.random() < 0.09)
    particles.push({ x: player.x + (Math.random()-0.5)*24, y: player.y - player.r*1.7,
      vx: (Math.random() < 0.5 ? -1 : 1)*(70+Math.random()*50), vy: -130,
      t: 0, life: 0.5, c: 'rgba(159,220,236,', s: 4 });

  // level win — over the rim, into the escape cinematic
  if (cfg && player.maxHeight >= cfg.t) { startEscape(); return; }

  // ghost (endless only)
  if (runMode === 'endless') {
    if (ghostFrames.length === 0 || timeAlive - ghostFrames[ghostFrames.length-1].t > 0.05) {
      if (ghostFrames.length < 12000) ghostFrames.push({ t:timeAlive, x:player.x, y:player.y, s:player.scale });
    }
    if (ghostBest && !beatGhost && player.maxHeight > ghostBest.height) {
      beatGhost = true;
      popup('GHOST BEATEN!', player.x, player.y-60, '#7fd8e8');
      spawnBurst(player.x, player.y, 'rgba(127,216,232,', 20);
    }
  }

  if (water.started) {
    water.heat = Math.min(1, water.heat + dt / 2.5);
    water.y -= waterSpd * water.heat * dt;
    if (water.y > player.y + T.waterCatchup) water.y = player.y + T.waterCatchup;
  }
  for (const c of crabs) if (!c.dead && c.y-c.r > water.y+8) c.dead = true;
  for (const o of obs)   if (!o.dead && o.y-o.r > water.y+8) o.dead = true;
  for (const dd of dollars) if (!dd.dead && dd.y-dd.r > water.y+8) dd.dead = true;
  crabs = crabs.filter(c => !c.dead || c === player.attached);
  obs   = obs.filter(o => !o.dead || o === player.attached);
  dollars = dollars.filter(dd => !dd.dead);

  const pr = player.r*player.scale;
  if (!player.scramble && player.y + pr > water.y) {
    if (player.goldT > 0) {
      player.y = water.y - pr;
      player.vy = -Math.min(Math.abs(player.vy)*0.9 + 500, 1100);
      player.attached = null; player.onPlatform = false;
      spawnBurst(player.x, water.y, 'rgba(255,215,107,', 18);
      popup('IMMUNE!', player.x, water.y-40, '#ffd76b');
      shake = 4;
    } else if (water.heat < 1) {
      // still heating up: a scalding splash, not a death — newcomer mercy
      player.y = water.y - pr;
      player.vy = -950; player.vx = 0;
      player.attached = null; player.onPlatform = false;
      spawnBurst(player.x, water.y, 'rgba(159,220,236,', 14);
      popup('HOT HOT HOT!', player.x, water.y-40, '#9fdcec');
      shake = 3;
    } else {
      const cause = player.gripT > 0 ? 'pinched' : 'boiled';
      if (!tryMoltOrDie(cause)) return;
    }
  }
  if (player.y > cam.y + H) { die('boiled'); return; }

  const targetCam = player.y - H*0.42;
  cam.y += (targetCam - cam.y)*Math.min(1, dt*6);
  if (cam.y > water.y - H) cam.y = Math.min(cam.y, water.y - H*0.55);

  fillCrabs();

  for (const p of popups) p.t += rawDt;
  popups = popups.filter(p => p.t < 1.1);
  for (const p of particles) { p.t += rawDt; p.x += p.vx*rawDt; p.y += p.vy*rawDt; p.vy += 500*rawDt; }
  particles = particles.filter(p => p.t < p.life);
  for (const s of shells) { s.t += rawDt; s.y += s.vy*rawDt; }
  shells = shells.filter(s => s.t < 1.5);
  if (Math.random() < (surge.phase==='warn' ? 0.9 : 0.3) * water.heat)
    bubbles.push({ x:Math.random()*W, y:water.y+10+Math.random()*60, r:2+Math.random()*5, t:0 });
  for (const b of bubbles) { b.t += rawDt; b.y -= 40*rawDt; }
  bubbles = bubbles.filter(b => b.t < 1.4 && b.y > water.y-4);
  shake = Math.max(0, shake - rawDt*30);
}

// ---------- Drawing ----------
function draw() {
  buttons = [];
  ctx.save();
  if (shake > 0) ctx.translate((Math.random()-0.5)*shake, (Math.random()-0.5)*shake);

  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#2b3d4f'); g.addColorStop(1,'#22303e');
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);

  // in a level, the bucket ENDS at the rim — sky above, steel below
  const inLevelScene = cfg && (mode==='play' || mode==='dead' || mode==='won');
  const rimScreen = inLevelScene ? (-cfg.t/T.metersPerPx - cam.y) : -1e9;
  if (inLevelScene && rimScreen > 0) {
    const skyg = ctx.createLinearGradient(0, 0, 0, Math.max(1, rimScreen));
    skyg.addColorStop(0,'#8ec9ff'); skyg.addColorStop(1,'#bfe0f7');
    ctx.fillStyle = skyg; ctx.fillRect(0, 0, W, rimScreen);
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.045)'; ctx.lineWidth = 2;
  const ringGap = 130, off = ((-cam.y)%ringGap+ringGap)%ringGap;
  for (let y = off-ringGap; y < H+ringGap; y += ringGap) {
    if (y < rimScreen) continue;
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
  }

  const lw = wallX('L'), rw = wallX('R');
  const wallTop = Math.max(0, rimScreen);
  const wg1 = ctx.createLinearGradient(0,0,lw,0);
  wg1.addColorStop(0,'#5c6f80'); wg1.addColorStop(1,'#48596a');
  ctx.fillStyle = wg1; ctx.fillRect(0, wallTop, lw, H-wallTop);
  const wg2 = ctx.createLinearGradient(W,0,rw,0);
  wg2.addColorStop(0,'#5c6f80'); wg2.addColorStop(1,'#48596a');
  ctx.fillStyle = wg2; ctx.fillRect(rw, wallTop, W-rw, H-wallTop);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(lw-4, wallTop, 4, H-wallTop); ctx.fillRect(rw, wallTop, 4, H-wallTop);

  if (mode === 'title') { drawTitle(); ctx.restore(); return; }
  if (mode === 'map')   { drawMap(); ctx.restore(); return; }
  if (mode === 'escape'){ drawEscape(); ctx.restore(); return; }

  ctx.save();
  ctx.translate(0, -cam.y);

  // level rim (freedom line)
  if (cfg) {
    const rimY = -cfg.t / T.metersPerPx;
    if (rimY > cam.y - 120) {
      const sky = ctx.createLinearGradient(0, rimY-160, 0, rimY);
      sky.addColorStop(0,'rgba(140,200,255,0.35)'); sky.addColorStop(1,'rgba(140,200,255,0)');
      ctx.fillStyle = sky; ctx.fillRect(0, rimY-160, W, 160);
      ctx.fillStyle = '#7d93a6';
      ctx.fillRect(0, rimY-14, W, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(0, rimY-14, W, 4);
      ctx.font = '800 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#cfe8ff';
      ctx.fillText('— THE RIM · FREEDOM —', W/2, rimY - 26);
    }
  }

  const t = performance.now()/1000;

  for (const o of obs) {
    if (o.y < cam.y-60 || o.y > cam.y+H+60) continue;
    drawObstacle(laneX(o.side), o.y, o);
  }
  for (const dd of dollars) {
    if (dd.y < cam.y-40 || dd.y > cam.y+H+40) continue;
    drawDollar(dd.x, dd.y + Math.sin(t*3 + dd.x)*3, dd.r, dd.star);
  }
  for (const c of crabs) {
    if (c.y < cam.y-60 || c.y > cam.y+H+60) continue;
    let st = TYPES[c.type];
    let wig = Math.sin(t*2+c.wiggle)*0.08;
    if (c.spent) {
      // the identity drains out over half a second, capped short of full
      // plain so a hint of what it was remains; wiggle goes sleepy
      const u = Math.min(1, (performance.now()-c.spentAt)/500) * 0.7;
      st = { color: lerpColor(st.color, TYPES.plain.color, u),
             color2: lerpColor(st.color2, TYPES.plain.color2, u) };
      wig = Math.sin(t*1.1+c.wiggle)*0.04;
    }
    drawCrab(laneX(c.side), c.y, c.r, st, c.side==='L'?1:-1, wig, false, c.type, c.spent);
  }

  // shed shells sinking
  for (const s of shells) {
    ctx.globalAlpha = 1 - s.t/1.5;
    ctx.fillStyle = '#c65f33';
    ctx.beginPath(); ctx.ellipse(s.x, s.y, 14, 10, 0.3, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (runMode==='endless' && ghostBest && mode==='play') {
    const gf = ghostAt(timeAlive);
    if (gf) {
      ctx.save(); ctx.globalAlpha = 0.38;
      drawCrab(gf.x, gf.y, player.r*gf.s, { color:'#7fd8e8', color2:'#4aa8bd' }, 1, Math.sin(t*4)*0.06, true, 'ghost');
      ctx.globalAlpha = 0.55;
      ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#7fd8e8'; ctx.fillText('ghost', gf.x, gf.y - player.r*gf.s - 16);
      ctx.restore();
    }
  }

  if (aim && canAim()) {
    const v = launchVector();
    if (v.mag > 90) {
      let px = player.x, py = player.y, vx = v.vx, vy = v.vy;
      const step = 1/60, totalDots = 26, shown = 9;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < totalDots; i++) {
        vy += T.gravity*step;
        px += vx*step*2.2; py += vy*step*2.2;
        if (i < shown) {
          ctx.globalAlpha = 0.25 + (1 - i/shown)*0.6;
          ctx.beginPath(); ctx.arc(px, py, 4 - i*0.25, 0, Math.PI*2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      if (!isFlick()) {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(player.x, player.y);
        ctx.lineTo(player.x-(aim.sx-aim.cx)*0.6, player.y-(aim.sy-aim.cy)*0.6); ctx.stroke();
      }
    }
  }

  const pScale = player.scale*(1 + player.squash*0.4);
  const gold = player.goldT > 0;
  // the anime nervous system: which beat is the player crab acting?
  let pExpr = 'normal';
  if (mode === 'dead') pExpr = 'ko';
  else if (gold) pExpr = 'gold';
  else if (player.gripT > 0) pExpr = 'grip';
  else if (aim && canAim()) pExpr = 'aim';
  else if (water.started && (water.y - player.y) < 140) pExpr = 'panic';

  // molt scramble: speed lines behind the dash
  if (player.scramble) {
    const s = player.scramble;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const off = (i-1)*9;
      ctx.beginPath();
      ctx.moveTo(s.fx + off, s.fy);
      ctx.lineTo(player.x + off, player.y);
      ctx.stroke();
    }
  }

  if (gold) { ctx.save(); ctx.shadowColor = '#ffd76b'; ctx.shadowBlur = 24; }
  drawCrab(player.x, player.y, player.r*pScale, gold
    ? { color:'#ffcf4d', color2:'#e0a520' }
    : { color:'#f0824f', color2:'#c65f33' },
    player.face, Math.sin(t*6)*0.05 + (player.gripT>0 ? Math.sin(t*30)*0.1 : 0), true, 'player', false, pExpr);
  if (gold) ctx.restore();
  // grip claw overlay + comic-bold "!?"
  if (player.gripT > 0 && player.attached) {
    ctx.strokeStyle = '#b58a34'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    const pr2 = player.r*pScale;
    ctx.beginPath(); ctx.arc(player.x, player.y + pr2*0.4, pr2*0.9, 0.2, Math.PI-0.2); ctx.stroke();
    ctx.font = '900 26px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.strokeStyle = '#2a1f18'; ctx.lineWidth = 5; ctx.fillStyle = '#fff';
    const jig = Math.sin(t*24)*2;
    ctx.strokeText('!?', player.x + 22, player.y - pr2 - 22 + jig);
    ctx.fillText('!?', player.x + 22, player.y - pr2 - 22 + jig);
  }

  for (const p of particles) {
    ctx.fillStyle = p.c + (1 - p.t/p.life) + ')';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.s*(1 - p.t/p.life*0.5), 0, Math.PI*2); ctx.fill();
  }

  drawWater();

  // the starting rock, poking out of the water — drawn over the surface
  // so it reads as an island the water can rise to swallow
  if (FLOOR_Y > cam.y - 60 && FLOOR_Y < cam.y + H + 120 && water.y > FLOOR_Y - 6) {
    ctx.fillStyle = '#6b7a88';
    ctx.strokeStyle = '#2a3742'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(W/2 - 82, FLOOR_Y + 40);
    ctx.lineTo(W/2 - 70, FLOOR_Y + 6); ctx.lineTo(W/2 - 34, FLOOR_Y - 4);
    ctx.lineTo(W/2 + 18, FLOOR_Y - 6); ctx.lineTo(W/2 + 62, FLOOR_Y + 4);
    ctx.lineTo(W/2 + 84, FLOOR_Y + 40);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.ellipse(W/2 - 24, FLOOR_Y + 6, 30, 8, -0.1, 0, Math.PI*2); ctx.fill();
  }

  for (const p of popups) {
    ctx.globalAlpha = 1 - p.t/1.1;
    ctx.font = '800 20px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = p.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 4;
    ctx.strokeText(p.text, p.x, p.y - p.t*36);
    ctx.fillText(p.text, p.x, p.y - p.t*36);
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  drawHUD();
  if (mode === 'dead') drawDead();
  if (mode === 'won')  drawWon();
  ctx.restore();
}

function ghostAt(t) {
  const f = ghostBest.frames;
  if (!f.length || t > f[f.length-1].t) return null;
  let i = Math.min(Math.floor(t/0.05), f.length-1);
  while (i > 0 && f[i].t > t) i--;
  while (i < f.length-1 && f[i+1].t <= t) i++;
  const a = f[i], b = f[Math.min(i+1, f.length-1)];
  const u = b.t > a.t ? (t-a.t)/(b.t-a.t) : 0;
  return { x:a.x+(b.x-a.x)*u, y:a.y+(b.y-a.y)*u, s:a.s+(b.s-a.s)*u };
}

function drawDollar(x, y, r, star) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = star ? '#ffd76b' : '#f2e3c0';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = star ? '#c9a23a' : '#c4b394'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.stroke();
  // five-petal etch
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI/2 + i*(Math.PI*2/5);
    ctx.beginPath(); ctx.moveTo(0,0);
    ctx.lineTo(Math.cos(a)*r*0.7, Math.sin(a)*r*0.7); ctx.stroke();
  }
  if (star) { ctx.shadowColor = '#ffd76b'; ctx.shadowBlur = 10; }
  ctx.restore();
}

function drawObstacle(x, y, o) {
  ctx.save(); ctx.translate(x, y);
  if (o.kind === 'rock') {
    ctx.fillStyle = '#7a8794';
    ctx.beginPath();
    ctx.moveTo(-o.r, o.r*0.5); ctx.lineTo(-o.r*0.8, -o.r*0.5); ctx.lineTo(-o.r*0.2, -o.r);
    ctx.lineTo(o.r*0.6, -o.r*0.7); ctx.lineTo(o.r, o.r*0.1);
    ctx.lineTo(o.r*0.6, o.r*0.8); ctx.lineTo(-o.r*0.4, o.r*0.9);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.arc(-o.r*0.3, -o.r*0.35, o.r*0.3, 0, Math.PI*2); ctx.fill();
  } else {
    ctx.fillStyle = '#e8c8b8';
    ctx.beginPath(); ctx.arc(0, 0, o.r, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#c49a86'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let a = 0; a < Math.PI*4.5; a += 0.2) {
      const rr = o.r*0.92*(a/(Math.PI*4.5));
      const px = Math.cos(a)*rr, py = Math.sin(a)*rr;
      a === 0 ? ctx.moveTo(px,py) : ctx.lineTo(px,py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawCrab(x, y, r, style, face, wiggle, isPlayer, type, spent, expr) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(wiggle);
  const INK = '#2a1f18';
  const olw = Math.max(2.2, r*0.18);   // outer contour weight (heavier than details)

  // legs — ink strokes
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.8, r*0.15); ctx.lineCap = 'round';
  for (let i = -1; i <= 1; i += 2)
    for (let j = 0; j < 2; j++) {
      ctx.beginPath();
      ctx.moveTo(i*r*0.62, r*0.3 + j*r*0.16);
      ctx.lineTo(i*r*1.12, r*0.58 + j*r*0.2 + Math.sin(wiggle*10+j)*2);
      ctx.stroke();
    }

  // claws — outlined, with an ink pincer notch
  const claw = (cx, cy, cr) => {
    ctx.fillStyle = style.color;
    ctx.strokeStyle = INK; ctx.lineWidth = olw*0.85;
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK;
    const s = cx < 0 ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(cx - s*cr*0.25, cy - cr*0.9);
    ctx.lineTo(cx + s*cr*0.3,  cy - cr*0.25);
    ctx.lineTo(cx - s*cr*0.6,  cy - cr*0.1);
    ctx.closePath(); ctx.fill();
  };
  if (type === 'fiddler') {
    // the big claw always menaces the inside of the bucket
    const s = face >= 0 ? 1 : -1;
    claw(-s*r*0.98, -r*0.2, r*0.3);
    claw(s*r*1.18, -r*0.4, r*0.78);
  }
  else { claw(-r*1.02, -r*0.25, r*0.42); claw(r*1.02, -r*0.25, r*0.42); }

  // body — flat fill, ink contour, one shade crescent, one highlight
  ctx.fillStyle = style.color;
  ctx.strokeStyle = INK; ctx.lineWidth = olw;
  ctx.beginPath(); ctx.ellipse(0, 0, r, r*0.82, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = style.color2;
  ctx.beginPath();
  ctx.moveTo(-r*0.85, r*0.28);
  ctx.quadraticCurveTo(0, r*0.95, r*0.85, r*0.28);
  ctx.quadraticCurveTo(0, r*0.55, -r*0.85, r*0.28);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath(); ctx.ellipse(-r*0.32, -r*0.3, r*0.3, r*0.15, -0.3, 0, Math.PI*2); ctx.fill();

  // type markings
  if (type === 'speckled') {
    ctx.fillStyle = spent ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.8)';
    for (const [sx,sy,sr] of [[-0.32,-0.15,0.13],[0.25,-0.32,0.15],[0.02,0.18,0.11],[-0.5,0.22,0.1],[0.48,0.12,0.12]]) {
      ctx.beginPath(); ctx.arc(sx*r, sy*r, r*sr, 0, Math.PI*2); ctx.fill();
    }
  }
  if (type === 'blue') {
    ctx.fillStyle = spent ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.moveTo(-r*0.6, -r*0.22);
    ctx.quadraticCurveTo(0, -r*0.62, r*0.6, -r*0.22);
    ctx.quadraticCurveTo(0, -r*0.36, -r*0.6, -r*0.22);
    ctx.closePath(); ctx.fill();
  }
  if (type === 'king') {
    ctx.fillStyle = '#ffd76b'; ctx.strokeStyle = INK;
    ctx.lineWidth = olw*0.75; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-r*0.58,-r*0.88); ctx.lineTo(-r*0.58,-r*1.32); ctx.lineTo(-r*0.26,-r*1.06);
    ctx.lineTo(0,-r*1.45); ctx.lineTo(r*0.26,-r*1.06);
    ctx.lineTo(r*0.58,-r*1.32); ctx.lineTo(r*0.58,-r*0.88);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  // ---- face ----
  // No eyebrows anywhere: the top edge of the eye itself carries the angle.
  // Lids are body-colored cuts across the eye white, per type and expression.
  const eyeR = r*(isPlayer ? 0.3 : 0.24);
  const eyeY = -r*(type === 'king' ? 0.62 : spent ? 0.62 : 0.86);
  const eyeX = r*0.32;
  const stalkW = Math.max(2, r*0.16);

  // eye stalks: straight when alert, drooped outward when spent
  ctx.strokeStyle = INK; ctx.lineWidth = stalkW; ctx.lineCap = 'round';
  if (spent) {
    ctx.beginPath(); ctx.moveTo(-eyeX, -r*0.35); ctx.quadraticCurveTo(-eyeX-r*0.06, eyeY+r*0.2, -eyeX-r*0.16, eyeY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( eyeX, -r*0.35); ctx.quadraticCurveTo( eyeX+r*0.06, eyeY+r*0.2,  eyeX+r*0.16, eyeY); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(-eyeX, -r*0.35); ctx.lineTo(-eyeX, eyeY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( eyeX, -r*0.35); ctx.lineTo( eyeX, eyeY); ctx.stroke();
  }
  const exL = spent ? -eyeX-r*0.16 : -eyeX, exR = spent ? eyeX+r*0.16 : eyeX;

  if (expr === 'joy') {
    // closed happy eyes: flesh-colored lid balls on the stalk tips with a
    // smiling crease — attached, not floating
    for (const ex of [exL, exR]) {
      ctx.fillStyle = style.color;
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.8, r*0.1);
      ctx.beginPath(); ctx.arc(ex, eyeY, eyeR*0.9, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.lineWidth = Math.max(2.2, r*0.12); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(ex, eyeY+eyeR*0.35, eyeR*0.62, Math.PI*1.15, Math.PI*1.85); ctx.stroke();
    }
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(-r*0.42, r*0.2);
    ctx.quadraticCurveTo(0, r*0.66, r*0.42, r*0.2);
    ctx.quadraticCurveTo(0, r*0.42, -r*0.42, r*0.2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff8f7a';
    ctx.beginPath(); ctx.ellipse(0, r*0.4, r*0.16, r*0.09, 0, 0, Math.PI*2); ctx.fill();
    ctx.restore(); return;
  }

  // eyeballs — white, ink-outlined
  ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.8, r*0.11);
  ctx.beginPath(); ctx.arc(exL, eyeY, eyeR, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(exR, eyeY, eyeR, 0, Math.PI*2); ctx.fill(); ctx.stroke();

  const look = face*eyeR*0.3;
  if (expr === 'ko') {
    // X-eyes + lolling tongue
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, r*0.11); ctx.lineCap = 'round';
    for (const ex of [exL, exR]) {
      ctx.beginPath(); ctx.moveTo(ex-eyeR*0.45, eyeY-eyeR*0.45); ctx.lineTo(ex+eyeR*0.45, eyeY+eyeR*0.45); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex+eyeR*0.45, eyeY-eyeR*0.45); ctx.lineTo(ex-eyeR*0.45, eyeY+eyeR*0.45); ctx.stroke();
    }
    ctx.fillStyle = '#d9483b'; ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(r*0.1, r*0.42, r*0.13, r*0.2, 0.2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  } else if (expr === 'gold') {
    // star pupils
    const star = (cx, cy, R) => {
      ctx.fillStyle = '#e0a520';
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, r*0.07); ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI/2 + i*Math.PI/4, rr = i%2===0 ? R : R*0.42;
        const px = cx + Math.cos(a)*rr, py = cy + Math.sin(a)*rr;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    };
    star(exL, eyeY, eyeR*0.75); star(exR, eyeY, eyeR*0.75);
  } else if (expr === 'panic') {
    // pin-prick pupils, eyes fully wide — no lids at all
    ctx.fillStyle = '#1a1512';
    ctx.beginPath(); ctx.arc(exL, eyeY, eyeR*0.22, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(exR, eyeY, eyeR*0.22, 0, Math.PI*2); ctx.fill();
  } else if (expr === 'grip') {
    // misaligned comedy pupils
    ctx.fillStyle = '#1a1512';
    ctx.beginPath(); ctx.arc(exL - eyeR*0.25, eyeY - eyeR*0.1, eyeR*0.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(exR + eyeR*0.2, eyeY + eyeR*0.2, eyeR*0.34, 0, Math.PI*2); ctx.fill();
  } else {
    // pupils, with glint on the living
    const droop = spent ? eyeR*0.28 : 0;
    ctx.fillStyle = '#1a1512';
    ctx.beginPath(); ctx.arc(exL+look, eyeY+droop, eyeR*0.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(exR+look, eyeY+droop, eyeR*0.5, 0, Math.PI*2); ctx.fill();
    if (!spent) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(exL+look-eyeR*0.18, eyeY-eyeR*0.18, eyeR*0.15, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(exR+look-eyeR*0.18, eyeY-eyeR*0.18, eyeR*0.15, 0, Math.PI*2); ctx.fill();
    }
  }

  // lids: the eye's top edge at the angle a brow would have taken.
  // cover = fraction of the eye hidden; ang tilts the cut (positive drops
  // the right end). Inner-low reads determined, outer-low reads sly.
  const lid = (cx, cy, cover, ang) => {
    if (cover <= 0) return;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, eyeR + 0.5, 0, Math.PI*2); ctx.clip();
    ctx.translate(cx, cy); ctx.rotate(ang);
    ctx.fillStyle = style.color;
    ctx.fillRect(-eyeR*1.6, -eyeR*1.6, eyeR*3.2, eyeR*0.6 + eyeR*2*cover);
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.8, r*0.1); ctx.lineCap = 'round';
    const ly = -eyeR + eyeR*2*cover;
    ctx.beginPath(); ctx.moveTo(-eyeR*1.3, ly); ctx.lineTo(eyeR*1.3, ly); ctx.stroke();
    ctx.restore();
  };
  if (type === 'king') {
    lid(exL, eyeY, 0.72, 0.12); lid(exR, eyeY, 0.72, -0.12);         // royal near-shut smug
  } else if (type === 'fiddler' && !spent) {
    lid(exL, eyeY, 0.45, 0.3); lid(exR, eyeY, 0.12, -0.05);          // one sly, one wide: villain
  } else if (spent) {
    lid(exL, eyeY, 0.55, -0.12); lid(exR, eyeY, 0.55, 0.12);         // heavy, outward-sagging
  } else if (isPlayer && (expr === 'aim' || expr === 'normal' || !expr)) {
    lid(exL, eyeY, 0.3, 0.38); lid(exR, eyeY, 0.3, -0.38);           // determined: inner edge low
  } else if (type === 'red') {
    lid(exL, eyeY, 0.1, -0.2); lid(exR, eyeY, 0.1, 0.2);             // eager: outer edge low, wide-open
  }
  // panic / gold / grip / ko: no lids — the eye state IS the expression

  // mouth
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, r*0.11); ctx.lineCap = 'round';
  if (expr === 'panic') {
    // wavy open dread mouth, filled
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(-r*0.34, r*0.3);
    ctx.quadraticCurveTo(-r*0.17, r*0.2, 0, r*0.3);
    ctx.quadraticCurveTo(r*0.17, r*0.4, r*0.34, r*0.3);
    ctx.quadraticCurveTo(r*0.1, r*0.52, -r*0.28, r*0.42);
    ctx.closePath(); ctx.fill();
  } else if (expr === 'grip') {
    ctx.beginPath(); ctx.moveTo(-r*0.24, r*0.36); ctx.lineTo(r*0.24, r*0.36); ctx.stroke();
  } else if (expr === 'gold') {
    ctx.beginPath(); ctx.moveTo(-r*0.36, r*0.26); ctx.quadraticCurveTo(0, r*0.56, r*0.36, r*0.26); ctx.stroke();
  } else if (type === 'king') {
    ctx.beginPath(); ctx.moveTo(-r*0.16, r*0.34); ctx.quadraticCurveTo(0, r*0.26, r*0.16, r*0.34); ctx.stroke();
  } else if (type === 'fiddler') {
    ctx.beginPath(); ctx.moveTo(-r*0.3, r*0.3); ctx.quadraticCurveTo(0, r*0.48, r*0.34, r*0.26); ctx.stroke();
  } else if (expr === 'aim') {
    ctx.beginPath(); ctx.moveTo(-r*0.24, r*0.32); ctx.quadraticCurveTo(r*0.06, r*0.42, r*0.3, r*0.28); ctx.stroke();
  } else if (spent) {
    ctx.beginPath(); ctx.moveTo(-r*0.2, r*0.36); ctx.quadraticCurveTo(0, r*0.32, r*0.2, r*0.36); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(-r*0.24, r*0.3); ctx.quadraticCurveTo(0, r*0.42, r*0.24, r*0.3); ctx.stroke();
  }

  ctx.restore();
}

function drawWater() {
  const t = performance.now()/1000, wy = water.y, h = water.heat;
  if (wy > cam.y + H + 80) return;
  // heat glow fades in with temperature
  const rushGlow = (surge.phase === 'rush' ? 0.4 : surge.phase === 'warn' ? 0.32 : 0.22) * h;
  if (rushGlow > 0.01) {
    const glow = ctx.createLinearGradient(0, wy-70, 0, wy);
    glow.addColorStop(0,'rgba(255,110,60,0)');
    glow.addColorStop(1,'rgba(255,110,60,'+rushGlow+')');
    ctx.fillStyle = glow; ctx.fillRect(0, wy-70, W, 70);
  }

  // cool blue lerps to the boil
  const top  = lerpColor('#5fa8d3', surge.phase==='rush' ? '#ff6a3a' : '#e05c3a', h);
  const mid  = lerpColor('#3a6f96', '#b74a3f', h);
  const deep = lerpColor('#233d52', '#6e2f38', h);
  const wg = ctx.createLinearGradient(0, wy, 0, wy+H);
  wg.addColorStop(0, top); wg.addColorStop(0.12, mid); wg.addColorStop(1, deep);
  ctx.fillStyle = wg;
  const amp = (surge.phase==='idle' ? 4 : 7) * (0.35 + 0.65*h);
  ctx.beginPath(); ctx.moveTo(0, wy+6);
  for (let x = 0; x <= W; x += 14)
    ctx.lineTo(x, wy + Math.sin(x*0.045+t*(2+3*h))*amp + Math.sin(x*0.11-t*3)*2*h);
  ctx.lineTo(W, wy+H); ctx.lineTo(0, wy+H); ctx.closePath(); ctx.fill();

  ctx.strokeStyle = lerpColor('#d8ecf7', '#ffe6c8', h); ctx.globalAlpha = 0.7; ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 14) {
    const y = wy + Math.sin(x*0.045+t*(2+3*h))*amp + Math.sin(x*0.11-t*3)*2*h;
    x === 0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = 'rgba(255,220,190,0.5)';
  for (const b of bubbles) { ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill(); }
  if (h > 0.2) {
    ctx.fillStyle = 'rgba(255,255,255,' + (0.05*h) + ')';
    for (let i = 0; i < 5; i++) {
      const sx = (i*97 + t*30)%W, sy = wy-20-((t*26+i*53)%90);
      ctx.beginPath(); ctx.arc(sx, sy, 14+i*3, 0, Math.PI*2); ctx.fill();
    }
  }
}

function drawHUD() {
  const h = Math.floor(player.maxHeight);
  ctx.textAlign = 'left';
  ctx.font = '800 30px system-ui, sans-serif';
  ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 5;
  const label = cfg ? h + '/' + cfg.t + 'm' : h + 'm';
  ctx.strokeText(label, 18, 44); ctx.fillText(label, 18, 44);
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  if (cfg) ctx.fillText('L' + levelNum + ' · ' + cfg.name, 18, 64);
  else {
    ctx.fillText('best ' + Math.max(best, h) + 'm', 18, 64);
    if (ghostBest) {
      ctx.fillStyle = beatGhost ? '#7fd8e8' : 'rgba(127,216,232,0.6)';
      ctx.fillText((beatGhost?'✓ ':'') + 'ghost ' + Math.floor(ghostBest.height) + 'm', 18, 84);
    }
  }

  // wallet
  ctx.textAlign = 'right';
  ctx.font = '800 18px system-ui, sans-serif';
  ctx.fillStyle = '#f2e3c0';
  ctx.fillText(wallet + ' $', W-18, 40);
  if (cfg) {
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.fillStyle = '#ffd76b';
    ctx.fillText('★ ' + levelDollarsGot + '/3', W-18, 62);
  }

  ctx.textAlign = 'center';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath(); ctx.arc(W/2-24+i*24, 34, 8, 0, Math.PI*2);
    ctx.fillStyle = i < player.combo ? '#d9483b' : 'rgba(255,255,255,0.18)';
    ctx.fill();
  }
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('red combo', W/2, 56);

  // molt shells indicator (extra sizes = spare shells)
  const spare = Math.round((player.scale - 1)/T.moltCost * 1) ;
  ctx.textAlign = 'center';
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(240,130,79,0.9)';
  ctx.fillText('shells: ' + Math.max(0, Math.floor((player.scale-1)/T.moltCost + 0.01)), W/2, 76);

  let by = 100;
  ctx.textAlign = 'right';
  ctx.font = '700 14px system-ui, sans-serif';
  if (player.goldT > 0) { ctx.fillStyle = '#ffd76b'; ctx.fillText('★ GOLD ' + player.goldT.toFixed(1), W-18, by); by += 20; }
  if (player.boostT > 0) { ctx.fillStyle = '#9fe08a'; ctx.fillText('▲ boost ' + Math.ceil(player.boostT), W-18, by); by += 20; }
  if (player.nerfT > 0) { ctx.fillStyle = '#b79ad6'; ctx.fillText('▼ heavy ' + Math.ceil(player.nerfT), W-18, by); by += 20; }
  if (player.gripT > 0) { ctx.fillStyle = '#e0b552'; ctx.fillText('✊ gripped ' + player.gripT.toFixed(1), W-18, by); }

  if (surge.phase === 'warn') {
    ctx.textAlign = 'center';
    ctx.font = '900 26px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,155,94,' + (0.6 + Math.sin(performance.now()/60)*0.4) + ')';
    ctx.fillText('⚠ HEAT SURGE ⚠', W/2, H-40);
  }
}

// ---------- Menu screens ----------
function btn(x, y, w, h, label, fn, color) {
  buttons.push({ x, y, w, h, fn });
  ctx.fillStyle = color || '#3d5266';
  roundRect(x, y, w, h, 12); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 2;
  roundRect(x, y, w, h, 12); ctx.stroke();
  ctx.font = '800 19px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
  ctx.fillText(label, x+w/2, y+h/2+7);
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y); ctx.arcTo(x+w, y, x+w, y+h, r); ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r); ctx.arcTo(x, y, x+w, y, r); ctx.closePath();
}

function drawTitle() {
  const t = performance.now()/1000;
  ctx.textAlign = 'center';
  drawCrab(W/2, H*0.2, 44, { color:'#f0824f', color2:'#c65f33' }, Math.sin(t)>0?1:-1, Math.sin(t*2)*0.1, true, 'player');
  ctx.font = '900 ' + Math.min(W*0.12, 60) + 'px system-ui, sans-serif';
  ctx.fillStyle = '#ffd76b'; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 8;
  ctx.strokeText('CRAB SCRAMBLE', W/2, H*0.34);
  ctx.fillText('CRAB SCRAMBLE', W/2, H*0.34);

  const bw = Math.min(W*0.7, 280), bx = W/2 - bw/2;
  btn(bx, H*0.4, bw, 56, '🗺  LEVELS', () => { mode='map'; mapScroll=null; selectedLevel=null; }, '#4a7a5c');
  btn(bx, H*0.4+70, bw, 56, '♾  ENDLESS — bucket #' + DAILY_SEED%1000, () => { runMode='endless'; reset(); mode='play'; }, '#3d5266');
  btn(bx, H*0.4+140, bw, 44, muted ? '🔇 sound off' : '🔊 sound on', () => { muted = !muted; }, '#33424f');

  // quests
  ctx.font = '700 14px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('— DAILY QUESTS —', W/2, H*0.4 + 218);
  ctx.font = '600 13px system-ui, sans-serif';
  quests.forEach((q, i) => {
    ctx.fillStyle = q.done ? '#9fe08a' : 'rgba(255,255,255,0.6)';
    const p = Math.min(q.prog, q.target);
    ctx.fillText((q.done ? '✓ ' : '') + q.text + '  (' + Math.floor(p) + '/' + q.target + ')', W/2, H*0.4 + 242 + i*22);
  });
  ctx.font = '800 16px system-ui, sans-serif';
  ctx.fillStyle = '#f2e3c0';
  ctx.fillText(wallet + ' sand dollars', W/2, H*0.4 + 242 + 3*22 + 8);
}

function drawMap() {
  // the outside world: sky down to a sandy counter
  const bgg = ctx.createLinearGradient(0,0,0,H);
  bgg.addColorStop(0,'#9fd0ee'); bgg.addColorStop(0.55,'#cfe6dd'); bgg.addColorStop(1,'#ecd9ac');
  ctx.fillStyle = bgg; ctx.fillRect(0,0,W,H);
  ctx.fillStyle = 'rgba(255,240,180,0.8)';
  ctx.beginPath(); ctx.arc(W*0.82, 80, 34, 0, Math.PI*2); ctx.fill();

  if (mapScroll === null) mapScroll = clampMapScroll(H*0.6 - nodePos(unlocked-1).y);

  ctx.save(); ctx.translate(0, mapScroll);

  // the path: walked solid, unwalked dotted
  for (let i = 0; i < LEVELS.length-1; i++) {
    const a = nodePos(i), b2 = nodePos(i+1);
    const walked = (i+2) <= unlocked;
    ctx.strokeStyle = walked ? 'rgba(90,70,40,0.5)' : 'rgba(90,70,40,0.22)';
    ctx.lineWidth = 5;
    ctx.setLineDash(walked ? [] : [4, 10]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
  }
  ctx.setLineDash([]);

  const t = performance.now()/1000;
  LEVELS.forEach((lv, i) => {
    const n = i+1, p = nodePos(i);
    const isUnlocked = n <= unlocked;
    const state = !isUnlocked ? 'locked' : (levelDone[i] ? 'done' : 'open');
    drawBucketNode(p.x, p.y, state, n, n === unlocked && !levelDone[i], t);
    // stars under every node — same symbol as everywhere else, hollow when unearned
    ctx.textAlign = 'center';
    for (let s = 0; s < 3; s++) {
      const sx = p.x - 22 + s*22, sy = p.y + 48;
      ctx.font = '900 15px system-ui, sans-serif';
      if (s < levelStars[i]) { ctx.fillStyle = '#ffd76b'; ctx.fillText('★', sx, sy); }
      else { ctx.strokeStyle = 'rgba(90,70,40,0.45)'; ctx.lineWidth = 1; ctx.strokeText('★', sx, sy); }
    }
    if (isUnlocked && !selectedLevel)
      buttons.push({ x: p.x-34, y: p.y-40+mapScroll, w: 68, h: 80, fn: () => { selectedLevel = n; } });
  });

  // your crab, waiting at the frontier
  const fp = nodePos(unlocked-1);
  drawCrab(fp.x - 48, fp.y + 8, 15, { color:'#f0824f', color2:'#c65f33' }, 1, Math.sin(t*2)*0.1, true, 'player');

  ctx.restore();

  // fixed header: total stars + wallet
  ctx.fillStyle = 'rgba(30,45,60,0.85)';
  ctx.fillRect(0, 0, W, 58);
  ctx.textAlign = 'left';
  ctx.font = '900 22px system-ui, sans-serif'; ctx.fillStyle = '#ffd76b';
  const totStars = levelStars.reduce((a,b)=>a+b, 0);
  ctx.fillText('★ ' + totStars + '/' + (LEVELS.length*3), 18, 38);
  ctx.textAlign = 'right';
  ctx.font = '800 18px system-ui, sans-serif'; ctx.fillStyle = '#f2e3c0';
  ctx.fillText(wallet + ' $', W-18, 38);

  if (!selectedLevel) btn(20, H-64, 110, 44, '← back', () => { mode='title'; }, '#33424f');
  else drawLevelCard(selectedLevel);
}

function drawBucketNode(x, y, state, n, frontier, t) {
  ctx.save(); ctx.translate(x, y);
  if (frontier) {
    ctx.strokeStyle = 'rgba(159,224,138,' + (0.5 + Math.sin(t*4)*0.3) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 42, 0, Math.PI*2); ctx.stroke();
  }
  ctx.save();
  if (state === 'done') ctx.rotate(-1.15);   // tipped over — the crab got out
  const bw2 = 52, bh = 42;
  const grad = ctx.createLinearGradient(-bw2/2, 0, bw2/2, 0);
  if (state === 'locked') { grad.addColorStop(0,'#6b7278'); grad.addColorStop(1,'#565c62'); }
  else { grad.addColorStop(0,'#7d93a6'); grad.addColorStop(1,'#5c6f80'); }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-bw2/2, -bh/2); ctx.lineTo(bw2/2, -bh/2);
  ctx.lineTo(bw2*0.38, bh/2); ctx.lineTo(-bw2*0.38, bh/2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = state === 'locked' ? '#7a8288' : '#8ba3b8';
  ctx.fillRect(-bw2/2-4, -bh/2-7, bw2+8, 9);
  if (state === 'open') {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 3; i++) {
      const sy = -bh/2 - 14 - ((t*22 + i*17) % 26);
      ctx.beginPath(); ctx.arc(-10+i*10, sy, 4+i, 0, Math.PI*2); ctx.fill();
    }
  }
  ctx.restore();
  ctx.font = '900 18px system-ui, sans-serif'; ctx.textAlign = 'center';
  if (state === 'locked') { ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillText('🔒', 0, 7); }
  else {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3;
    ctx.strokeText(n, 0, 7); ctx.fillText(n, 0, 7);
  }
  if (state === 'done') { ctx.font = '800 14px system-ui, sans-serif'; ctx.fillStyle = '#2f7a4a'; ctx.fillText('✓', 26, -24); }
  ctx.restore();
}

function drawLevelCard(n) {
  const lv = LEVELS[n-1];
  ctx.fillStyle = 'rgba(15,25,35,0.55)'; ctx.fillRect(0,0,W,H);
  const cw = Math.min(W*0.86, 340), ch = lv.intro ? 336 : 292;
  const cx = W/2-cw/2, cy = H/2-ch/2;
  ctx.fillStyle = '#2b3d4f'; roundRect(cx, cy, cw, ch, 16); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
  roundRect(cx, cy, cw, ch, 16); ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = '800 14px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('LEVEL ' + n, W/2, cy+32);
  ctx.font = '900 26px system-ui, sans-serif'; ctx.fillStyle = '#ffd76b';
  ctx.fillText(lv.name, W/2, cy+64);
  ctx.font = '600 16px system-ui, sans-serif'; ctx.fillStyle = '#fff';
  ctx.fillText('Escape the ' + lv.t + 'm bucket', W/2, cy+96);
  for (let s = 0; s < 3; s++) {
    const sx = W/2-30+s*30;
    ctx.font = '900 24px system-ui, sans-serif';
    if (s < levelStars[n-1]) { ctx.fillStyle = '#ffd76b'; ctx.fillText('★', sx, cy+132); }
    else { ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5; ctx.strokeText('★', sx, cy+132); }
  }
  ctx.font = '600 13px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('collect golden sand dollars', W/2, cy+154);
  if (lv.intro) {
    ctx.font = '800 14px system-ui, sans-serif'; ctx.fillStyle = '#9fe08a';
    ctx.fillText('NEW!', W/2, cy+184);
    ctx.font = '600 14px system-ui, sans-serif'; ctx.fillStyle = '#fff';
    lv.intro.forEach((line, i) => ctx.fillText(line, W/2, cy+204+i*19));
  }
  btn(W/2-90, cy+ch-64, 180, 48, '▶  START', () => {
    runMode = 'level'; levelNum = n; selectedLevel = null; reset(); mode = 'play';
  }, '#4a7a5c');
  buttons.push({ x:0, y:0, w:W, h:cy, fn: () => { selectedLevel = null; } });
  buttons.push({ x:0, y:cy+ch, w:W, h:H-(cy+ch), fn: () => { selectedLevel = null; } });
}

function drawEscape() {
  const u = Math.min(1, escapeT/3.2);
  const t2 = performance.now()/1000;
  // the reveal: sky, outside the bucket for the first time
  const sky = ctx.createLinearGradient(0,0,0,H);
  sky.addColorStop(0,'#8ec9ff'); sky.addColorStop(1,'#d8edff');
  ctx.fillStyle = sky; ctx.fillRect(0,0,W,H);
  ctx.fillStyle = 'rgba(255,240,180,0.9)';
  ctx.beginPath(); ctx.arc(W*0.8, H*0.14, 40, 0, Math.PI*2); ctx.fill();

  // the bucket, shrinking away below
  const bs = 1 - u*0.55, bw2 = 190*bs, bh = 150*bs;
  const bx = W/2, by = H*0.5 + u*H*0.42;
  ctx.fillStyle = '#5c6f80';
  ctx.beginPath();
  ctx.moveTo(bx-bw2/2, by); ctx.lineTo(bx+bw2/2, by);
  ctx.lineTo(bx+bw2*0.38, by+bh); ctx.lineTo(bx-bw2*0.38, by+bh);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#7d93a6';
  ctx.fillRect(bx-bw2/2-6, by-10*bs, bw2+12, 12*bs);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(bx-30+i*20, by - 30 - ((t2*30+i*37)%60)*bs, (10+i*3)*bs, 0, Math.PI*2);
    ctx.fill();
  }

  // the hero: freefalling with joy
  const cy = H*0.2 + u*H*0.26;
  ctx.save();
  ctx.translate(W/2, cy);
  ctx.rotate(Math.sin(t2*3)*0.22);
  drawCrab(0, 0, 40, { color:'#f0824f', color2:'#c65f33' }, 1, Math.sin(t2*5)*0.07, true, 'player', false, 'joy');
  ctx.restore();

  // multicolor confetti (with the occasional sand dollar in the mix)
  const CONF = ['#ff5e5e','#ffd76b','#7fd8e8','#9fe08a','#c792ea','#ff9b5e'];
  if (Math.random() < 0.6)
    particles.push({ x:Math.random()*W, y:-20, vx:(Math.random()-0.5)*60,
      vy:90+Math.random()*120, t:0, life:2.6,
      col: Math.random() < 0.15 ? null : CONF[Math.floor(Math.random()*CONF.length)],
      rot: Math.random()*Math.PI, vr: (Math.random()-0.5)*8, s:4+Math.random()*5 });
  for (const p of particles) { p.t += 1/60; p.x += p.vx/60; p.y += p.vy/60; p.rot += (p.vr||0)/60; }
  particles = particles.filter(p => p.t < p.life);
  for (const p of particles) {
    if (p.col) {
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.col;
      ctx.fillRect(-p.s/2, -p.s*0.35, p.s, p.s*0.7);
      ctx.restore();
    } else {
      drawDollar(p.x, p.y, p.s, false);
    }
  }

  ctx.textAlign = 'center';
  const pop = Math.min(1, escapeT/0.4);
  ctx.font = '900 ' + Math.max(1, Math.min(W*0.15,72)*pop) + 'px system-ui, sans-serif';
  ctx.fillStyle = '#2f7a4a'; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 8;
  ctx.strokeText('ESCAPED!', W/2, H*0.1+40);
  ctx.fillText('ESCAPED!', W/2, H*0.1+40);

  for (let s = 0; s < 3; s++) {
    const at = 1.0 + s*0.4;
    if (escapeT > at) {
      const sp = Math.min(1, (escapeT-at)/0.2);
      ctx.font = '900 ' + (44*(1.6-0.6*sp)) + 'px system-ui, sans-serif';
      ctx.fillStyle = s < levelDollarsGot ? '#ffd76b' : 'rgba(120,140,160,0.4)';
      ctx.fillText('★', W/2-56+s*56, H*0.87);
    }
  }
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(40,70,90,0.8)';
  ctx.fillText('tap to continue', W/2, H*0.95);
}

function drawDead() {
  ctx.fillStyle = 'rgba(20,10,10,0.62)'; ctx.fillRect(0,0,W,H);
  // the little soul, drifting up with a halo
  {
    const sx = W/2 + 96, sy = H*0.3 - 40 - Math.min(deadT, 3)*22;
    const bob = Math.sin(performance.now()/300)*4;
    ctx.save();
    ctx.globalAlpha = Math.min(1, deadT*2) * 0.85;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(sx, sy+bob, 22, 16, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sx-18, sy+bob+8);
    ctx.quadraticCurveTo(sx-24, sy+bob+22, sx-32, sy+bob+26);
    ctx.quadraticCurveTo(sx-18, sy+bob+24, sx-12, sy+bob+14);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8aa0b2';
    ctx.beginPath(); ctx.arc(sx-7, sy+bob-3, 3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx+7, sy+bob-3, 3, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(sx, sy+bob-24, 13, 4, 0, 0, Math.PI*2); ctx.stroke();
    ctx.restore();
  }
  ctx.textAlign = 'center';
  const title = deathCause === 'pinched' ? 'PINCHED!' : 'BOILED!';
  const amp = Math.max(0, 1 - deadT/0.6) * 3;
  const jx = (Math.random()-0.5)*2*amp, jy = (Math.random()-0.5)*2*amp;
  ctx.font = '900 ' + Math.min(W*0.17, 84) + 'px system-ui, sans-serif';
  ctx.fillStyle = deathCause === 'pinched' ? '#e0b552' : '#ff6b4a';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 8;
  ctx.strokeText(title, W/2+jx, H*0.32+jy);
  ctx.fillText(title, W/2+jx, H*0.32+jy);
  const h = Math.floor(player.maxHeight);
  ctx.font = '700 26px system-ui, sans-serif'; ctx.fillStyle = '#fff';
  ctx.fillText(h + 'm climbed', W/2, H*0.32+52);
  // near-miss messaging
  ctx.font = '600 17px system-ui, sans-serif';
  if (cfg) {
    const gap = cfg.t - h;
    ctx.fillStyle = gap <= 15 ? '#ffd76b' : 'rgba(255,255,255,0.75)';
    ctx.fillText(gap <= 15 ? 'only ' + gap + 'm from the rim!!' : gap + 'm from the rim', W/2, H*0.32+84);
  } else {
    if (h < best) {
      const gap = best - h;
      ctx.fillStyle = gap <= 20 ? '#ffd76b' : 'rgba(255,255,255,0.75)';
      ctx.fillText(gap <= 20 ? 'only ' + gap + 'm from your best!!' : gap + 'm from your best', W/2, H*0.32+84);
    } else if (h === best && h > 0) {
      ctx.fillStyle = '#9fe08a'; ctx.fillText('NEW BEST!', W/2, H*0.32+84);
    }
    if (beatGhost) { ctx.fillStyle = '#7fd8e8'; ctx.fillText('👻 ghost beaten — new ghost saved', W/2, H*0.32+112); }
  }
  ctx.fillStyle = '#f2e3c0';
  ctx.fillText('+' + runDollars + ' sand dollars', W/2, H*0.32+142);
  ctx.font = '600 12px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText('aim: ' + gestures.sling + ' pull-back · ' + gestures.flick + ' flick', W/2, H*0.32+166);

  const bw = Math.min(W*0.7, 280), bx = W/2-bw/2;
  btn(bx, H*0.62, bw, 56, '↻  SCRAMBLE AGAIN', () => { reset(); mode='play'; }, '#4a7a5c');
  btn(bx, H*0.62+70, bw, 44, cfg ? '🗺 level map' : '🏠 menu', () => {
    if (cfg) { mode='map'; mapScroll=null; selectedLevel=null; } else mode='title';
  }, '#33424f');
}

function drawWon() {
  ctx.fillStyle = 'rgba(10,25,15,0.62)'; ctx.fillRect(0,0,W,H);
  ctx.textAlign = 'center';
  ctx.font = '900 ' + Math.min(W*0.15, 74) + 'px system-ui, sans-serif';
  ctx.fillStyle = '#9fe08a'; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 8;
  ctx.strokeText('ESCAPED!', W/2, H*0.3);
  ctx.fillText('ESCAPED!', W/2, H*0.3);
  ctx.font = '700 22px system-ui, sans-serif'; ctx.fillStyle = '#fff';
  ctx.fillText('Level ' + levelNum + ' — ' + cfg.name, W/2, H*0.3+44);
  // stars
  for (let s = 0; s < 3; s++) {
    ctx.fillStyle = s < levelDollarsGot ? '#ffd76b' : 'rgba(255,255,255,0.2)';
    ctx.font = '900 44px system-ui, sans-serif';
    ctx.fillText('★', W/2 - 56 + s*56, H*0.3+104);
  }
  ctx.font = '600 16px system-ui, sans-serif'; ctx.fillStyle = '#f2e3c0';
  ctx.fillText('+' + runDollars + ' sand dollars', W/2, H*0.3+140);

  const bw = Math.min(W*0.7, 280), bx = W/2-bw/2;
  if (levelNum < LEVELS.length)
    btn(bx, H*0.6, bw, 56, '→  LEVEL ' + (levelNum+1), () => { mode='map'; mapScroll=null; selectedLevel=levelNum+1; }, '#4a7a5c');
  btn(bx, H*0.6+70, bw, 44, '↻ replay for ★', () => { reset(); mode='play'; }, '#3d5266');
  btn(bx, H*0.6+124, bw, 44, '🗺 level map', () => { mode='map'; mapScroll=null; selectedLevel=null; }, '#33424f');
}

reset();
requestAnimationFrame(tick);
