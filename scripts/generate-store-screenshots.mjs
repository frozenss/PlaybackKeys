import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "assets", "chrome-web-store");
const VERSION = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8")).version;

const shots = [
  {
    name: "01-global-video-shortcuts.png",
    eyebrow: "PlaybackKeys",
    title: "Control video without leaving your work",
    subtitle: "Global shortcuts pause, skip, rewind, and change speed while your editor or notes app stays focused.",
    scene: "workflow",
  },
  {
    name: "02-shortcuts-and-actions.png",
    eyebrow: "Fast controls",
    title: "One chord for every common playback move",
    subtitle: "Play/pause, skip both ways, speed up, slow down, reset speed, and switch target video tabs.",
    scene: "actions",
  },
  {
    name: "03-popup-controls.png",
    eyebrow: "Toolbar popup",
    title: "See the active video and control it directly",
    subtitle: "The popup shows the target tab, playback state, speed, progress, and per-site enablement.",
    scene: "popup",
  },
  {
    name: "04-sites-and-permissions.png",
    eyebrow: "Permissions",
    title: "Built-in sites first, any other site by choice",
    subtitle: "Works on YouTube, Vimeo, Udemy, and Coursera by default. Other sites are opt-in from the popup.",
    scene: "sites",
  },
  {
    name: "05-private-by-design.png",
    eyebrow: "Privacy",
    title: "No accounts, no telemetry, no network requests",
    subtitle: "Settings stay in chrome.storage on your device. PlaybackKeys is open source and MIT licensed.",
    scene: "privacy",
  },
];

const css = `
  :root {
    --bg: #0b0b0c;
    --panel: #141417;
    --panel2: #19191d;
    --panel3: #202027;
    --line: #303036;
    --fg: #f2f2f3;
    --muted: #a6a6ad;
    --dim: #6f6f78;
    --accent: #f4b23e;
    --ink: #1a1208;
    --blue: #8ab4f8;
    --green: #74d69a;
    --red: #ff8a80;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); }
  .shot {
    width: 1280px;
    height: 800px;
    position: relative;
    overflow: hidden;
    background:
      linear-gradient(135deg, rgba(244,178,62,.14), transparent 34%),
      radial-gradient(circle at 84% 18%, rgba(116,214,154,.10), transparent 30%),
      linear-gradient(180deg, #101012, #080809);
    padding: 54px 64px;
  }
  .grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
    background-size: 40px 40px;
    mask-image: linear-gradient(180deg, rgba(0,0,0,.52), transparent 82%);
  }
  .topline { position: relative; z-index: 1; display: flex; align-items: center; gap: 12px; }
  .mark {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: var(--accent);
    display: grid;
    place-items: center;
    box-shadow: 0 12px 28px rgba(244,178,62,.24);
  }
  .mark svg { width: 25px; height: 25px; }
  .brand { font-size: 17px; font-weight: 650; letter-spacing: .01em; }
  .eyebrow {
    position: relative;
    z-index: 1;
    margin-top: 54px;
    color: var(--accent);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: .14em;
    text-transform: uppercase;
  }
  h1 {
    position: relative;
    z-index: 1;
    margin: 12px 0 0;
    max-width: 560px;
    font-size: 52px;
    line-height: 1.04;
    letter-spacing: 0;
    font-weight: 730;
  }
  .sub {
    position: relative;
    z-index: 1;
    margin-top: 20px;
    max-width: 520px;
    color: var(--muted);
    font-size: 21px;
    line-height: 1.38;
  }
  .canvas { position: absolute; right: 64px; bottom: 60px; width: 610px; height: 510px; }
  .window {
    background: rgba(20,20,23,.94);
    border: 1px solid var(--line);
    border-radius: 14px;
    overflow: hidden;
    box-shadow: 0 30px 90px rgba(0,0,0,.48);
  }
  .bar { height: 38px; background: #111114; border-bottom: 1px solid var(--line); display: flex; align-items: center; gap: 7px; padding: 0 13px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #44444b; }
  .dot:nth-child(1) { background: #ff5f57; }
  .dot:nth-child(2) { background: #febc2e; }
  .dot:nth-child(3) { background: #28c840; }
  .kbd-row { display: flex; gap: 9px; margin-top: 26px; align-items: center; }
  .key {
    background: #1d1d22;
    border: 1px solid #34343b;
    border-bottom-color: #0b0b0c;
    border-radius: 8px;
    color: var(--fg);
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 20px;
    font-weight: 700;
    padding: 12px 16px;
    min-width: 48px;
    text-align: center;
    box-shadow: inset 0 -2px 0 rgba(0,0,0,.35);
  }
  .plus { color: var(--dim); font-size: 22px; }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    height: 36px;
    padding: 0 14px;
    border-radius: 999px;
    background: rgba(244,178,62,.15);
    color: var(--accent);
    border: 1px solid rgba(244,178,62,.34);
    font-weight: 700;
    font-size: 14px;
  }
  .workflow-editor { position: absolute; left: 0; top: 36px; width: 360px; height: 330px; }
  .code { padding: 24px; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 15px; line-height: 1.8; color: #d8d8de; }
  .code .muted { color: #777782; } .code .blue { color: var(--blue); } .code .green { color: var(--green); } .code .accent { color: var(--accent); }
  .workflow-video { position: absolute; right: 0; top: 118px; width: 420px; height: 250px; }
  .video {
    position: relative;
    height: 212px;
    background: linear-gradient(135deg, #171719, #080809);
    display: grid;
    place-items: center;
  }
  .play {
    width: 74px; height: 74px; border-radius: 50%;
    background: var(--accent); display: grid; place-items: center;
    box-shadow: 0 14px 38px rgba(244,178,62,.24);
  }
  .timeline { position: absolute; left: 20px; right: 20px; bottom: 22px; height: 5px; border-radius: 5px; background: #383840; }
  .timeline span { display: block; height: 100%; width: 42%; border-radius: inherit; background: var(--accent); }
  .toast {
    position: absolute; right: 18px; bottom: 42px; display: flex; align-items: center; gap: 10px;
    background: rgba(20,20,23,.92); border: 1px solid rgba(255,255,255,.10);
    border-radius: 10px; padding: 11px 14px; font-size: 13px;
  }
  .toast b { display: block; font-size: 13px; } .toast span { color: var(--dim); font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 11px; }
  .toast .ic { width: 24px; height: 24px; border-radius: 7px; background: var(--accent); color: var(--ink); display: grid; place-items: center; font-weight: 800; }
  .arrow-line { position: absolute; left: 344px; top: 250px; width: 110px; height: 2px; background: var(--accent); box-shadow: 0 0 22px rgba(244,178,62,.5); }
  .arrow-line::after { content: ""; position: absolute; right: -1px; top: -5px; border-left: 10px solid var(--accent); border-top: 6px solid transparent; border-bottom: 6px solid transparent; }
  .action-grid { position: absolute; inset: 28px 0 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
  .action {
    background: rgba(20,20,23,.94); border: 1px solid var(--line); border-radius: 14px; padding: 22px;
    min-height: 136px; box-shadow: 0 18px 48px rgba(0,0,0,.28);
  }
  .action .glyph { color: var(--accent); font-size: 34px; font-weight: 750; line-height: 1; margin-bottom: 14px; }
  .action h3 { margin: 0; font-size: 20px; } .action p { margin: 7px 0 0; color: var(--muted); font-size: 14px; line-height: 1.35; }
  .popup-card { position: absolute; right: 70px; top: 12px; width: 360px; border-radius: 16px; background: #101012; border: 1px solid var(--line); box-shadow: 0 28px 80px rgba(0,0,0,.56); padding: 18px; }
  .popup-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; font-size: 13px; color: var(--muted); }
  .now { background: #17171b; border: 1px solid var(--line); border-radius: 12px; padding: 16px; margin-bottom: 14px; }
  .now .label { color: var(--green); font-size: 11px; font-weight: 800; letter-spacing: .11em; }
  .now h3 { margin: 8px 0 4px; font-size: 18px; } .now p { margin: 0; color: var(--dim); font-size: 13px; }
  .progress { margin-top: 14px; height: 8px; border-radius: 8px; background: #2a2a31; overflow: hidden; }
  .progress span { display: block; width: 48%; height: 100%; background: var(--accent); border-radius: inherit; }
  .btns { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .btn { background: #17171b; border: 1px solid var(--line); border-radius: 10px; padding: 13px 8px; text-align: center; font-size: 12px; color: var(--muted); }
  .btn b { display: block; color: var(--fg); font-size: 22px; margin-bottom: 3px; }
  .toggle { margin-top: 12px; border: 1px solid rgba(244,178,62,.35); background: rgba(244,178,62,.12); color: var(--accent); border-radius: 10px; padding: 12px; font-size: 14px; font-weight: 700; }
  .settings { position: absolute; right: 0; top: 26px; width: 530px; height: 392px; }
  .settings-body { display: grid; grid-template-columns: 140px 1fr; height: 354px; }
  .side { background: #0b0b0c; border-right: 1px solid var(--line); padding: 18px; color: var(--muted); font-size: 13px; }
  .side div { padding: 8px; border-radius: 7px; } .side .active { background: #1b1b20; color: var(--fg); }
  .main { padding: 20px; }
  .row { display: grid; grid-template-columns: 1fr auto; align-items: center; padding: 13px 0; border-bottom: 1px solid #292930; }
  .row b { font-size: 15px; } .row span { display: block; color: var(--dim); font-size: 12px; margin-top: 3px; }
  .switch { width: 44px; height: 24px; border-radius: 999px; background: var(--accent); position: relative; }
  .switch::after { content: ""; position: absolute; right: 3px; top: 3px; width: 18px; height: 18px; border-radius: 50%; background: var(--ink); }
  .sitechips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
  .sitechip { border: 1px solid var(--line); background: #17171b; border-radius: 999px; padding: 10px 13px; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: var(--fg); font-size: 13px; }
  .trust-list { position: absolute; inset: 34px 0 0 42px; display: grid; gap: 18px; width: 510px; }
  .trust { display: grid; grid-template-columns: 56px 1fr; gap: 16px; align-items: center; padding: 22px; border-radius: 16px; background: rgba(20,20,23,.94); border: 1px solid var(--line); }
  .trust .badge { width: 56px; height: 56px; border-radius: 14px; background: rgba(244,178,62,.15); color: var(--accent); display: grid; place-items: center; font-size: 28px; font-weight: 800; }
  .trust h3 { margin: 0; font-size: 21px; } .trust p { margin: 5px 0 0; color: var(--muted); line-height: 1.35; }
  .shortcut-panel { position: absolute; right: 18px; top: 34px; width: 520px; }
  .shortcut-row { display: grid; grid-template-columns: 1fr auto; gap: 18px; align-items: center; padding: 17px 20px; background: rgba(20,20,23,.94); border: 1px solid var(--line); border-radius: 13px; margin-bottom: 10px; }
  .shortcut-row h3 { margin: 0; font-size: 18px; } .shortcut-row p { margin: 4px 0 0; color: var(--dim); font-size: 13px; }
`;

function mark() {
  return `<span class="mark"><svg viewBox="0 0 64 64"><rect x="8" y="8" width="48" height="48" rx="11" fill="#F4B23E"/><path d="M16 16 H32 V48 H16 Z" fill="#1a1208"/><path d="M34 18 L50 32 L34 46 Z" fill="#1a1208"/></svg></span>`;
}

function header(shot) {
  return `
    <div class="grid"></div>
    <div class="topline">${mark()}<span class="brand">PlaybackKeys</span><span class="pill">Chrome Extension</span></div>
    <div class="eyebrow">${shot.eyebrow}</div>
    <h1>${shot.title}</h1>
    <div class="sub">${shot.subtitle}</div>
  `;
}

function keyRow(keys) {
  return `<div class="kbd-row">${keys.map((k, i) => `${i ? '<span class="plus">+</span>' : ''}<span class="key">${k}</span>`).join("")}</div>`;
}

const scenes = {
  workflow: () => `
    <div class="canvas">
      <div class="window workflow-editor"><div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div><div class="code"><span class="muted">// course notes</span><br><span class="blue">function</span> buildFeature() {<br>&nbsp;&nbsp;<span class="green">watch</span>(<span class="accent">"lesson"</span>);<br>&nbsp;&nbsp;ship();<br>}</div></div>
      <div class="arrow-line"></div>
      <div class="window workflow-video"><div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div><div class="video"><div class="play"><svg viewBox="0 0 24 24" width="34"><path d="M8 5v14l11-7z" fill="#1a1208"/></svg></div><div class="timeline"><span></span></div><div class="toast"><div class="ic">▶</div><div><b>Playing</b><span>Ctrl Shift 1</span></div></div></div></div>
    </div>
    ${keyRow(["Ctrl", "Shift", "1"])}
  `,
  actions: () => `
    <div class="canvas"><div class="action-grid">
      <div class="action"><div class="glyph">▶</div><h3>Play / Pause</h3><p>Toggle the target video from anywhere.</p></div>
      <div class="action"><div class="glyph">»</div><h3>Skip forward</h3><p>Jump ahead by your configured interval.</p></div>
      <div class="action"><div class="glyph">−</div><h3>Slow down</h3><p>Adjust speed in precise custom steps.</p></div>
      <div class="action"><div class="glyph">1.25×</div><h3>Speed badge</h3><p>See the active playback rate on the page.</p></div>
      <div class="action"><div class="glyph">↺</div><h3>Reset speed</h3><p>Return to 1× from popup or right-click menu.</p></div>
      <div class="action"><div class="glyph">⇄</div><h3>Switch target</h3><p>Cycle when multiple video tabs are open.</p></div>
    </div></div>
    ${keyRow(["Ctrl", "Shift", "2"])}
  `,
  popup: () => `
    <div class="canvas">
      <div class="popup-card">
        <div class="popup-head"><b>PlaybackKeys</b><span>v${VERSION}</span></div>
        <div class="now"><div class="label">CONTROLLING</div><h3>SwiftUI Course - Lesson 12</h3><p>www.youtube.com</p><div class="progress"><span></span></div></div>
        <div class="btns"><div class="btn"><b>«5s</b>Back</div><div class="btn"><b>❚❚</b>Pause</div><div class="btn"><b>5s»</b>Forward</div><div class="btn"><b>−0.25</b>Slower</div><div class="btn"><b>1.00×</b>Reset</div><div class="btn"><b>+0.25</b>Faster</div></div>
        <div class="toggle">Enabled on youtube.com</div>
      </div>
    </div>
  `,
  sites: () => `
    <div class="canvas">
      <div class="window settings"><div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div><div class="settings-body"><div class="side"><div>Playback</div><div class="active">Sites</div><div>Display</div><div>Shortcuts</div></div><div class="main"><div class="row"><div><b>Run on all sites</b><span>Off by default. Requests broad access only if you choose it.</span></div><div class="switch"></div></div><div class="sitechips"><span class="sitechip">youtube.com</span><span class="sitechip">vimeo.com</span><span class="sitechip">udemy.com</span><span class="sitechip">coursera.org</span><span class="sitechip">custom site opt-in</span></div></div></div></div>
    </div>
  `,
  privacy: () => `
    <div class="canvas"><div class="trust-list">
      <div class="trust"><div class="badge">0</div><div><h3>No data collection</h3><p>No analytics, telemetry, accounts, or tracking SDKs.</p></div></div>
      <div class="trust"><div class="badge">⌂</div><div><h3>Everything stays local</h3><p>Preferences live on your device in chrome.storage.</p></div></div>
      <div class="trust"><div class="badge">MIT</div><div><h3>Open source</h3><p>Review the source on GitHub and verify the privacy claims.</p></div></div>
    </div></div>
  `,
};

function html(shot) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><main class="shot">${header(shot)}${scenes[shot.scene]()}</main></body></html>`;
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  for (const shot of shots) {
    await page.setContent(html(shot), { waitUntil: "networkidle" });
    await page.screenshot({ path: join(OUT, shot.name), type: "png" });
    console.log(`Wrote assets/chrome-web-store/${shot.name}`);
  }
} finally {
  await browser.close();
}
