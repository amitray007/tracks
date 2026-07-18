const BRAND_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
  <path d="M7 14L9.79289 11.2071C10.1834 10.8166 10.8166 10.8166 11.2071 11.2071L12.7929 12.7929C13.1834 13.1834 13.8166 13.1834 14.2071 12.7929L17 10" />
  <path d="M20.9993 13C21 12.6804 21 12.3473 21 12C21 7.75736 21 5.63604 19.682 4.31802C18.364 3 16.2426 3 12 3C7.75736 3 5.63604 3 4.31802 4.31802C3 5.63604 3 7.75736 3 12C3 16.2426 3 18.364 4.31802 19.682C5.63604 21 7.75736 21 12 21C12.3473 21 12.6804 21 13 20.9993" />
  <path d="M18.9737 16.0215C18.9795 15.9928 19.0205 15.9928 19.0263 16.0215C19.3302 17.5081 20.4919 18.6698 21.9785 18.9737C22.0072 18.9795 22.0072 19.0205 21.9785 19.0263C20.4919 19.3302 19.3302 20.4919 19.0263 21.9785C19.0205 22.0072 18.9795 22.0072 18.9737 21.9785C18.6698 20.4919 17.5081 19.3302 16.0215 19.0263C15.9928 19.0205 15.9928 18.9795 16.0215 18.9737C17.5081 18.6698 18.6698 17.5081 18.9737 16.0215Z" />
</svg>`;

export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="dark" />
    <title>Tracks Server</title>
    <link rel="stylesheet" href="/dashboard.css" />
  </head>
  <body>
    <div class="shell">
      <header class="app-header">
        <a class="brand-lockup" href="/" aria-label="Tracks Server home">
          <span class="brand-mark">${BRAND_ICON}</span>
          <strong>Tracks</strong>
          <span class="server-badge">SERVER</span>
        </a>
        <div class="header-actions">
          <div class="connection" id="connection"><i></i><span>Access required</span></div>
          <button class="sign-out" id="sign-out" type="button" hidden>Sign out</button>
        </div>
      </header>

      <main>
        <section class="access-panel" id="access-panel" aria-labelledby="access-title">
          <div class="access-heading">
            <span class="access-mark">${BRAND_ICON}</span>
            <p class="eyebrow">SERVER ACCESS</p>
            <h1 id="access-title">Sign in to Tracks</h1>
            <p>Enter the owner token to manage connected devices.</p>
          </div>
          <form id="access-form" method="post" action="/">
            <div class="field-row">
              <input id="access-token" name="token" type="password" autocomplete="current-password" placeholder="Paste owner token" aria-label="Owner token" required minlength="32" />
              <button type="submit"><span>Connect</span></button>
            </div>
            <p class="error" id="access-error" role="alert" aria-live="polite"></p>
          </form>
        </section>

        <section class="devices" id="devices" hidden>
          <div class="hero">
            <p class="eyebrow">YOUR DEVICES</p>
            <h1>Connected devices</h1>
            <p>Choose a device to browse its sessions.</p>
          </div>
          <div class="section-heading">
            <span>AVAILABLE</span>
            <output id="device-count">0 devices</output>
          </div>
          <div class="device-grid" id="device-grid"></div>
          <div class="empty" id="device-empty">
            <span class="empty-mark">${BRAND_ICON}</span>
            <strong>No devices connected</strong>
            <p>Open Tracks on another device and connect it to see its sessions here.</p>
          </div>
        </section>
      </main>
    </div>
    <script src="/dashboard.js" defer></script>
  </body>
</html>`;

export const DASHBOARD_CSS = `
:root {
  color-scheme: dark;
  font-family: Inter, "SF Pro Text", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #e9e9ea;
  background: #101112;
  font-synthesis: none;
  --surface: #111213;
  --surface-raised: #151617;
  --border: #292b2e;
  --border-strong: #36393d;
  --text: #e9e9ea;
  --text-muted: #8b8e93;
  --text-faint: #666a70;
  --accent: #d9ddff;
  --accent-border: #59618c;
  --green: #8dbb72;
  --ease-out: cubic-bezier(.16, 1, .3, 1);
}

* { box-sizing: border-box; }
html, body { min-width: 320px; min-height: 100%; margin: 0; background: #101112; }
body { -webkit-font-smoothing: antialiased; }
button, input { font: inherit; }
[hidden] { display: none !important; }

.shell { min-height: 100vh; display: grid; grid-template-rows: 48px 1fr; }
.app-header { display: flex; align-items: center; justify-content: space-between; padding: 0 28px; }
.app-header { border-bottom: 1px solid #27292b; background: var(--surface); }

.brand-lockup { display: flex; align-items: center; gap: 9px; color: inherit; font-size: 12px; letter-spacing: .01em; text-decoration: none; transition: color 120ms ease, transform 120ms var(--ease-out); }
.brand-lockup strong { font-weight: 650; }
.brand-mark, .access-mark, .empty-mark { display: grid; place-items: center; color: var(--accent); background: #191b24; border: 1px solid var(--accent-border); }
.brand-mark { width: 21px; height: 21px; border-radius: 50%; box-shadow: inset 0 0 0 3px var(--surface); }
.brand-lockup .brand-mark { transition: color 120ms ease, border-color 120ms ease, background-color 120ms ease; }
.brand-lockup:active { transform: scale(.97); }
.brand-lockup:focus-visible { outline: 2px solid #727da9; outline-offset: 4px; border-radius: 4px; }
.brand-mark svg { width: 13px; height: 13px; }
.brand-mark path, .access-mark path, .empty-mark path, .device-icon path { stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.server-badge { padding: 2px 5px; color: var(--text-faint); border: 1px solid var(--border); border-radius: 4px; font-size: 9px; font-weight: 600; letter-spacing: .08em; }

.connection { display: flex; align-items: center; gap: 7px; color: #777b81; font-size: 10px; }
.connection i { width: 6px; height: 6px; border-radius: 50%; background: #777b82; }
.connection[data-live="true"] i { background: var(--green); box-shadow: 0 0 0 3px rgba(141, 187, 114, .08); }
.header-actions { display: flex; align-items: center; gap: 14px; }
.sign-out { padding: 4px 7px; color: #85898f; background: transparent; border: 1px solid #303236; border-radius: 5px; font-size: 9px; cursor: pointer; transition: color 120ms ease, background-color 120ms ease, border-color 120ms ease; }
.sign-out:focus-visible { outline: 2px solid #727da9; outline-offset: 2px; }

main { width: min(940px, calc(100% - 40px)); margin: 0 auto; padding: 64px 0; }
.eyebrow { margin: 0; color: #73777d; font-size: 9px; font-weight: 650; letter-spacing: .12em; }

.access-panel {
  width: min(430px, 100%);
  margin: clamp(28px, 8vh, 84px) auto 0;
  padding: 28px;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: 9px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, .18);
  animation: panel-enter 180ms var(--ease-out) both;
}
.access-heading { display: grid; justify-items: center; text-align: center; }
.access-mark { width: 34px; height: 34px; margin-bottom: 18px; border-radius: 50%; box-shadow: inset 0 0 0 5px var(--surface-raised); }
.access-mark svg { width: 20px; height: 20px; }
.access-heading h1 { margin: 9px 0 7px; color: var(--text); font-size: 21px; line-height: 1.2; letter-spacing: -.025em; }
.access-heading > p:last-child { margin: 0; color: var(--text-muted); font-size: 11px; line-height: 1.55; }
.access-panel form { margin-top: 24px; }
.field-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 7px; }
.field-row input, .field-row button { height: 36px; border-radius: 5px; }
.field-row input { min-width: 0; padding: 0 11px; color: #d8d9db; background: #0f1011; border: 1px solid #303236; outline: 0; font-family: "SFMono-Regular", Consolas, monospace; font-size: 10px; }
.field-row input::placeholder { color: #55595f; }
.field-row input:focus { border-color: var(--accent-border); box-shadow: 0 0 0 2px rgba(168, 180, 255, .08); }
.field-row button { min-width: 82px; padding: 0 14px; color: #e0e2ee; background: #232631; border: 1px solid #444a67; font-size: 10px; font-weight: 600; cursor: pointer; transition: background-color 120ms ease, border-color 120ms ease, transform 120ms var(--ease-out), opacity 120ms ease; }
.field-row button:active { transform: scale(.97); }
.field-row button:disabled { cursor: wait; opacity: .6; }
.error { min-height: 15px; margin: 7px 0 0; color: #e8797e; font-size: 10px; line-height: 1.5; }
.devices { animation: panel-enter 180ms var(--ease-out) both; }
.hero { max-width: 650px; }
.hero h1 { margin: 12px 0 12px; font-size: 36px; line-height: 1.08; letter-spacing: -.04em; }
.hero > p:last-child { margin: 0; color: #92959a; font-size: 13px; line-height: 1.65; }
.section-heading { display: flex; align-items: center; justify-content: space-between; margin-top: 42px; padding-bottom: 10px; color: #73777d; border-bottom: 1px solid #27292b; font-size: 9px; font-weight: 650; letter-spacing: .12em; }
.section-heading output { color: #777b82; font-size: 9px; font-weight: 400; letter-spacing: 0; text-transform: none; }
.device-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 12px; }
.device-card { min-width: 0; display: flex; flex-direction: column; gap: 13px; padding: 15px; color: inherit; text-decoration: none; background: var(--surface-raised); border: 1px solid var(--border); border-radius: 7px; transition: border-color 140ms ease, background-color 140ms ease, transform 140ms var(--ease-out); }
.device-card:active { transform: scale(.985); }
.device-card:focus-visible { outline: 2px solid #727da9; outline-offset: 2px; }
.device-card header { height: auto; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0; background: transparent; border: 0; }
.device-title { min-width: 0; display: flex; align-items: center; gap: 9px; }
.device-icon { width: 32px; height: 32px; display: grid; place-items: center; color: #aeb6ff; background: #191b24; border: 1px solid #3d425c; border-radius: 6px; }
.device-icon svg { width: 17px; height: 17px; }
.device-title div { min-width: 0; display: grid; gap: 2px; }
.device-title strong { overflow: hidden; font-size: 12px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.device-title span, .device-meta { color: #71757a; font-size: 9px; }
.live-dot { width: 6px; height: 6px; flex: 0 0 auto; border-radius: 50%; background: var(--green); }
.device-meta { display: flex; justify-content: space-between; gap: 12px; padding-top: 12px; border-top: 1px solid #242628; }
.empty { min-height: 230px; display: grid; place-items: center; align-content: center; text-align: center; }
.empty-mark { width: 34px; height: 34px; margin-bottom: 12px; border-radius: 50%; }
.empty-mark svg { width: 20px; height: 20px; }
.empty strong { font-size: 12px; }
.empty p { max-width: 420px; margin: 6px 0 0; color: #696d72; font-size: 10px; line-height: 1.5; }

@keyframes panel-enter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

@media (hover: hover) {
  .brand-lockup:hover { color: #f0f0f1; }
  .brand-lockup:hover .brand-mark { color: #eef0ff; background: #1d202b; border-color: #747dab; }
  .field-row button:hover { background: #2a2e3c; border-color: #515876; }
  .sign-out:hover { color: #b7bac0; background: #18191a; border-color: #3a3d41; }
  .device-card:hover { background: #18191a; border-color: #3a3d41; transform: translateY(-1px); }
  .device-card:hover:active { transform: scale(.985); }
}

@media (max-width: 900px) {
  .device-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 680px) {
  .app-header { padding-inline: 16px; }
  main { width: min(100% - 28px, 940px); padding: 38px 0; }
  .access-panel { margin-top: 12px; padding: 24px 20px; }
  .field-row { grid-template-columns: 1fr; }
  .field-row button { width: 100%; }
  .hero h1 { font-size: 30px; }
}

@media (max-width: 520px) {
  .device-grid { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
}
`;

export const DASHBOARD_JS = `
const brandIcon = ${JSON.stringify(BRAND_ICON)};
const accessPanel = document.querySelector('#access-panel');
const accessForm = document.querySelector('#access-form');
const accessToken = document.querySelector('#access-token');
const accessError = document.querySelector('#access-error');
const accessButton = accessForm.querySelector('button');
const accessButtonLabel = accessButton.querySelector('span');
const devicesSection = document.querySelector('#devices');
const deviceGrid = document.querySelector('#device-grid');
const deviceEmpty = document.querySelector('#device-empty');
const deviceCount = document.querySelector('#device-count');
const connection = document.querySelector('#connection');
const signOut = document.querySelector('#sign-out');
let streamAbort = null;

function setConnection(live, label) {
  connection.dataset.live = String(live);
  connection.querySelector('span').textContent = label;
}

function setConnecting(connecting) {
  accessButton.disabled = connecting;
  accessButtonLabel.textContent = connecting ? 'Connecting…' : 'Connect';
}

function relativeTime(value) {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000));
  if (seconds < 10) return 'now';
  if (seconds < 60) return seconds + 's ago';
  return Math.floor(seconds / 60) + 'm ago';
}

function renderDevices(payload) {
  const devices = payload.devices || [];
  deviceGrid.replaceChildren();
  deviceCount.textContent = devices.length + ' ' + (devices.length === 1 ? 'device' : 'devices');
  deviceEmpty.hidden = devices.length > 0;

  for (const device of devices) {
    const card = document.createElement('a');
    card.className = 'device-card';
    card.href = '/device/' + encodeURIComponent(device.id);

    const head = document.createElement('header');
    const title = document.createElement('div');
    title.className = 'device-title';
    const icon = document.createElement('span');
    icon.className = 'device-icon';
    icon.innerHTML = brandIcon;
    const copy = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = device.name;
    copy.append(name);
    title.append(icon, copy);
    const dot = document.createElement('i');
    dot.className = 'live-dot';
    head.append(title, dot);

    const meta = document.createElement('div');
    meta.className = 'device-meta';
    const sessions = document.createElement('span');
    sessions.textContent = 'Sessions available';
    const seen = document.createElement('span');
    seen.textContent = 'Updated ' + relativeTime(device.lastSeenAt);
    meta.append(sessions, seen);
    card.append(head, meta);
    deviceGrid.append(card);
  }
}

async function ownerFetch(path, init = {}) {
  return fetch(path, { ...init, cache: 'no-store', credentials: 'same-origin' });
}

async function loadDevices() {
  const response = await ownerFetch('/api/devices');
  if (response.status === 401) throw new Error('Owner sign-in is required.');
  if (!response.ok) throw new Error('Tracks Server is unavailable.');
  const payload = await response.json();
  renderDevices(payload);
  return payload;
}

async function streamEvents() {
  if (streamAbort) streamAbort.abort();
  streamAbort = new AbortController();

  while (!streamAbort.signal.aborted) {
    try {
      const response = await fetch('/api/events', {
        signal: streamAbort.signal,
        cache: 'no-store',
        credentials: 'same-origin'
      });
      if (!response.ok) throw new Error('Presence stream unavailable');
      setConnection(true, 'Connected');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        buffer += decoder.decode(result.value, { stream: true });
        let boundary;
        while ((boundary = buffer.indexOf('\\n\\n')) >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = block.split('\\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\\n');
          if (data) renderDevices(JSON.parse(data));
        }
      }
    } catch (error) {
      if (streamAbort.signal.aborted) return;
      setConnection(false, 'Reconnecting');
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
}

function showSignedOut() {
  if (streamAbort) streamAbort.abort();
  accessPanel.hidden = false;
  devicesSection.hidden = true;
  signOut.hidden = true;
  accessToken.value = '';
  setConnection(false, 'Access required');
}

async function showDashboard() {
  accessError.textContent = '';
  setConnecting(true);
  try {
    await loadDevices();
    if (new URL(window.location.href).searchParams.has('next')) {
      window.history.replaceState({}, '', '/');
    }
    accessPanel.hidden = true;
    devicesSection.hidden = false;
    signOut.hidden = false;
    void streamEvents();
  } finally {
    setConnecting(false);
  }
}

async function signIn(token) {
  const response = await ownerFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });
  if (response.status === 401) throw new Error('The owner token was not accepted.');
  if (!response.ok) throw new Error('Tracks Server is unavailable.');
  accessToken.value = '';
  await showDashboard();
}

accessForm.addEventListener('submit', event => {
  event.preventDefault();
  const token = accessToken.value.trim();
  void signIn(token).catch(error => {
    accessError.textContent = error.message;
    setConnection(false, 'Access required');
    accessToken.focus();
  });
});

signOut.addEventListener('click', () => {
  void ownerFetch('/api/auth/logout', { method: 'POST' }).finally(showSignedOut);
});

void ownerFetch('/api/auth/session')
  .then(response => response.ok ? showDashboard() : showSignedOut())
  .catch(showSignedOut);
`;
