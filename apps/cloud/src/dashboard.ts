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
      <header>
        <div class="brand"><span class="mark">⌁</span><strong>Tracks</strong><span>SERVER</span></div>
        <div class="connection" id="connection"><i></i><span>Waiting for access</span></div>
      </header>
      <main>
        <section class="hero">
          <p class="eyebrow">DEVICE NETWORK</p>
          <h1>Connected devices</h1>
          <p>Sessions remain on their source devices. This server keeps presence in memory and requests approved data only while a device is connected.</p>
        </section>

        <section class="access-panel" id="access-panel">
          <div>
            <strong>Server access</strong>
            <span>Enter the bootstrap token configured on this deployment.</span>
          </div>
          <form id="access-form" method="post" action="/">
            <label for="access-token">Access token</label>
            <input id="access-token" name="token" type="password" autocomplete="current-password" required minlength="32" />
            <button type="submit">Connect</button>
          </form>
          <p class="error" id="access-error" role="alert"></p>
        </section>

        <section class="devices" id="devices" hidden>
          <div class="section-heading">
            <span>ONLINE NOW</span>
            <output id="device-count">0 devices</output>
          </div>
          <div class="device-grid" id="device-grid"></div>
          <div class="empty" id="device-empty">
            <span class="empty-mark">⌁</span>
            <strong>No devices connected</strong>
            <p>Connect a Tracks CLI to this server to see it here.</p>
          </div>
        </section>
      </main>
      <footer><span>No session payloads stored</span><span>Live protocol v1</span></footer>
    </div>
    <script src="/dashboard.js" defer></script>
  </body>
</html>`;

export const DASHBOARD_CSS = `:root{color-scheme:dark;font-family:Inter,"SF Pro Text",ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#101112;color:#e9e9ea;font-synthesis:none}*{box-sizing:border-box}html,body{min-width:320px;min-height:100%;margin:0;background:#101112}body{-webkit-font-smoothing:antialiased}.shell{min-height:100vh;display:grid;grid-template-rows:48px 1fr 42px}header,footer{display:flex;align-items:center;justify-content:space-between;padding:0 28px;border-color:#27292b}header{border-bottom:1px solid #27292b;background:#111213}footer{border-top:1px solid #27292b;color:#65686d;font-size:10px}.brand{display:flex;align-items:center;gap:9px;font-size:13px}.brand>span:last-child{padding:2px 5px;border:1px solid #2e3033;border-radius:4px;color:#74777d;font-size:8px;letter-spacing:.1em}.mark,.empty-mark{display:grid;place-items:center;color:#cbd1ff;background:#191b24;border:1px solid #59618c;border-radius:50%}.mark{width:22px;height:22px;font-size:16px}.connection{display:flex;align-items:center;gap:7px;color:#7a7d82;font-size:10px}.connection i{width:6px;height:6px;border-radius:50%;background:#777b82}.connection[data-live=true] i{background:#8dbb72;box-shadow:0 0 0 3px rgba(141,187,114,.08)}main{width:min(940px,calc(100% - 40px));margin:0 auto;padding:76px 0 64px}.hero{max-width:690px}.eyebrow,.section-heading{color:#72767c;font-size:9px;font-weight:650;letter-spacing:.12em}.hero h1{margin:12px 0 14px;font-size:40px;line-height:1.05;letter-spacing:-.04em}.hero>p:last-child{margin:0;color:#95989d;font-size:14px;line-height:1.65}.access-panel{margin-top:44px;padding:18px;display:grid;grid-template-columns:minmax(180px,1fr) minmax(320px,1.2fr);gap:24px;background:#141516;border:1px solid #2a2c2f;border-radius:8px}.access-panel>div{display:grid;align-content:center;gap:5px}.access-panel strong{font-size:12px}.access-panel span{color:#777a80;font-size:10px;line-height:1.5}form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:end}label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}input,button{height:34px;font:inherit;border-radius:5px}input{min-width:0;padding:0 10px;color:#d8d9db;background:#0f1011;border:1px solid #303236;outline:0;font-family:"SFMono-Regular",Consolas,monospace;font-size:11px}input:focus{border-color:#59618c;box-shadow:0 0 0 2px rgba(168,180,255,.08)}button{padding:0 14px;color:#d9dbe7;background:#20232e;border:1px solid #3e435d;font-size:10px;cursor:pointer;transition:background-color 120ms ease,transform 120ms cubic-bezier(.23,1,.32,1)}button:hover{background:#292d3d}button:active{transform:scale(.97)}.error{grid-column:1/-1;min-height:14px;margin:0;color:#e8797e;font-size:10px}.devices{margin-top:48px}.section-heading{display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;border-bottom:1px solid #27292b}.section-heading output{color:#777b82;font-size:9px;letter-spacing:0;text-transform:none}.device-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-top:12px}.device-card{min-width:0;padding:15px;color:inherit;text-decoration:none;background:#141516;border:1px solid #292b2e;border-radius:7px;transition:border-color 140ms ease,background-color 140ms ease,transform 140ms cubic-bezier(.23,1,.32,1)}.device-card:hover{background:#171819;border-color:#3a3d41;transform:translateY(-1px)}.device-card:focus-visible{outline:2px solid #727da9;outline-offset:2px}.device-card header{height:auto;padding:0;background:transparent;border:0}.device-title{min-width:0;display:flex;align-items:center;gap:9px}.device-icon{width:28px;height:28px;display:grid;place-items:center;color:#aeb6ff;background:#191b24;border:1px solid #3d425c;border-radius:5px}.device-title div{min-width:0;display:grid;gap:2px}.device-title strong{overflow:hidden;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.device-title span,.device-meta{color:#71757a;font-size:9px}.live-dot{width:6px;height:6px;border-radius:50%;background:#8dbb72}.device-meta{display:flex;justify-content:space-between;gap:12px;margin-top:14px;padding-top:11px;border-top:1px solid #242628}.empty{min-height:230px;display:grid;place-items:center;align-content:center;text-align:center}.empty-mark{width:34px;height:34px;margin-bottom:12px}.empty strong{font-size:12px}.empty p{margin:6px 0 0;color:#696d72;font-size:10px}.empty code{padding:2px 4px;color:#aeb0b4;background:#1a1b1d;border:1px solid #292b2e;border-radius:3px}@media(max-width:680px){header,footer{padding-inline:16px}main{width:min(100% - 28px,940px);padding-top:46px}.hero h1{font-size:30px}.access-panel{grid-template-columns:1fr}form{grid-template-columns:1fr}footer span:last-child{display:none}}`;

export const DASHBOARD_JS = `const accessPanel=document.querySelector('#access-panel');const accessForm=document.querySelector('#access-form');const accessToken=document.querySelector('#access-token');const accessError=document.querySelector('#access-error');const devicesSection=document.querySelector('#devices');const deviceGrid=document.querySelector('#device-grid');const deviceEmpty=document.querySelector('#device-empty');const deviceCount=document.querySelector('#device-count');const connection=document.querySelector('#connection');let streamAbort=null;function setConnection(live,label){connection.dataset.live=String(live);connection.querySelector('span').textContent=label}function relativeTime(value){const seconds=Math.max(0,Math.round((Date.now()-Date.parse(value))/1000));if(seconds<10)return'now';if(seconds<60)return seconds+'s ago';return Math.floor(seconds/60)+'m ago'}function renderDevices(payload){const devices=payload.devices||[];deviceGrid.replaceChildren();deviceCount.textContent=devices.length+' '+(devices.length===1?'device':'devices');deviceEmpty.hidden=devices.length>0;for(const device of devices){const card=document.createElement('a');card.className='device-card';card.href='/device/'+encodeURIComponent(device.id);const head=document.createElement('header');const title=document.createElement('div');title.className='device-title';const icon=document.createElement('span');icon.className='device-icon';icon.textContent='⌁';const copy=document.createElement('div');const name=document.createElement('strong');name.textContent=device.name;const platform=document.createElement('span');platform.textContent=device.platform+' · Tracks '+device.version;copy.append(name,platform);title.append(icon,copy);const dot=document.createElement('i');dot.className='live-dot';head.append(title,dot);const meta=document.createElement('div');meta.className='device-meta';const capabilities=document.createElement('span');capabilities.textContent=device.capabilities.length+' capabilities';const seen=document.createElement('span');seen.textContent='Open sessions · '+relativeTime(device.lastSeenAt);meta.append(capabilities,seen);card.append(head,meta);deviceGrid.append(card)}}async function authorizedFetch(path,token){return fetch(path,{headers:{Authorization:'Bearer '+token},cache:'no-store'})}async function loadDevices(token){const response=await authorizedFetch('/api/devices',token);if(response.status===401)throw new Error('The access token was not accepted.');if(!response.ok)throw new Error('Tracks Server is unavailable.');const payload=await response.json();renderDevices(payload);return payload}async function streamEvents(token){if(streamAbort)streamAbort.abort();streamAbort=new AbortController();while(!streamAbort.signal.aborted){try{const response=await fetch('/api/events',{headers:{Authorization:'Bearer '+token},signal:streamAbort.signal,cache:'no-store'});if(!response.ok)throw new Error('Presence stream unavailable');setConnection(true,'Live device presence');const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';while(true){const result=await reader.read();if(result.done)break;buffer+=decoder.decode(result.value,{stream:true});let boundary;while((boundary=buffer.indexOf('\\n\\n'))>=0){const block=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const data=block.split('\\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('\\n');if(data)renderDevices(JSON.parse(data))}}}catch(error){if(streamAbort.signal.aborted)return;setConnection(false,'Reconnecting');await new Promise(resolve=>setTimeout(resolve,1500))}}}async function connect(token){accessError.textContent='';await loadDevices(token);sessionStorage.setItem('tracks-cloud-token',token);accessPanel.hidden=true;devicesSection.hidden=false;void streamEvents(token)}accessForm.addEventListener('submit',event=>{event.preventDefault();void connect(accessToken.value.trim()).catch(error=>{accessError.textContent=error.message;setConnection(false,'Access required')})});const saved=sessionStorage.getItem('tracks-cloud-token');if(saved){accessToken.value=saved;void connect(saved).catch(()=>{sessionStorage.removeItem('tracks-cloud-token');accessPanel.hidden=false;devicesSection.hidden=true;setConnection(false,'Access required')})}`;
