// sw.js v1.2.3 — robust window-close handling
const SNAP_PREFIX = 'snap:';                // session mirror
const SNAP_LOCAL_KEY = 'cgpt:snap_local_v1';// local mirror (array of {tabId, windowId, auto, data, t})
const PENDING_KEY = 'cgpt:pending_exports_v1';

function esc(s){ return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function escJSON(s){ return String(s||'').replace(/[&<>]/g,c=>c==='&'?'&amp;':(c==='<'?'&lt;':'&gt;')).replace(/<\/script/gi,'<\\/script>'); }

function buildHtmlFromData(data) {
  const meta = data.meta || {};
  const msgs = data.messages || [];
  const head = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(meta.title||'ChatGPT Conversation')} - Export</title>
<style>
  :root{ --bg:#0b1020; --fg:#e5e7eb; --sub:#9ca3af; --border:rgba(255,255,255,.08); --card:#0f172a; --ai:#1f2937; --user:#1e3a8a; --bubble:#111827; --panel:#0f172a; --accent:#3b82f6; }
  @media (prefers-color-scheme: light){ :root{ --bg:#f8fafc; --fg:#111827; --sub:#6b7280; --border:rgba(0,0,0,.08); --card:#ffffff; --ai:#374151; --user:#1d4ed8; --bubble:#ffffff; --panel:#ffffff; --accent:#2563eb; } }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans JP","Hiragino Kaku Gothic ProN","Meiryo",sans-serif;}
  .wrap{display:grid; grid-template-columns: 1fr 340px; gap: 12px; max-width:1200px; margin: 20px auto; padding: 0 12px;}
  @media (max-width:960px){ .wrap{grid-template-columns:1fr;} .panel{order:-1; position:static; height:auto;} }
  header{grid-column: 1 / -1; margin-bottom:2px}
  header h1{margin:0 0 6px; font-size:20px; font-weight:700}
  header .meta{font-size:12px; color:var(--sub)}
  .bubble{max-width: 100%; background: var(--bubble); border: 1px solid var(--border); border-radius: 16px; padding: 12px 14px; margin: 10px 0; box-shadow: 0 2px 8px rgba(0,0,0,.08);}
  .row{display:flex; gap:12px; align-items:flex-start}
  .row.ai{justify-content:flex-start}
  .row.user{justify-content:flex-end}
  .badge{font-size:11px; border:1px solid var(--border); border-radius:999px; padding:2px 8px; font-weight:600; color:var(--ai);}
  .user .badge{color:var(--user)}
  .time{font-size:11px; color:var(--sub); margin-left:6px}
  .content{white-space:pre-wrap; word-break:break-word}
  .content pre{background:rgba(0,0,0,.35); border:1px solid var(--border); border-radius:10px; padding:10px; overflow:auto}
  .content code{font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace; font-size:12px}
  .panel{position:sticky; top:12px; height: calc(100vh - 24px); display:flex; flex-direction:column; background: var(--panel); border:1px solid var(--border); border-radius:12px; box-shadow: 0 2px 10px rgba(0,0,0,.08)}
  .panel header{padding:10px 12px; border-bottom:1px solid var(--border)}
  .panel header .title{font-size:14px; font-weight:700}
  .panel .sub{font-size:11px; color:var(--sub); margin-top:4px}
  .panel .controls{display:grid; grid-template-columns: 1fr auto auto; gap:6px; padding:10px 12px; border-bottom:1px solid var(--border)}
  .panel .controls input[type=search]{padding:8px 10px; border:1px solid var(--border); border-radius:10px; background:transparent; color:var(--fg)}
  .panel .controls label{font-size:11px; display:flex; gap:6px; align-items:center}
  .list{list-style:none; margin:0; padding:8px 12px; overflow:auto; flex:1}
  .item{margin:6px 0}
  .link{display:grid; grid-template-columns:auto 1fr; gap:10px; padding:8px; width:100%; text-align:left; background:transparent; border:none; border-radius:10px; cursor:pointer; color:inherit}
  .link:hover{background: rgba(255,255,255,.06)}
  .rolepill{font-size:11px; padding:6px 8px; border:1px solid var(--border); border-radius:8px; min-width:34px; text-align:center; font-weight:600; color:var(--ai)}
  .is-user{color:var(--user)}
  .link .head{white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
  .footer{padding:10px 12px; border-top:1px solid var(--border); display:flex; gap:8px}
  .btn{padding:10px 12px; font-size:12px; border-radius:10px; border:1px solid var(--border); background:transparent; color:inherit; cursor:pointer}
  .btn.primary{background: var(--accent); color:#fff; border:none}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>ChatGPT Conversation Export</h1>
    <div class="meta">Title: ${esc(meta.title||'')}<br>URL: <a href="${esc(meta.url||'')}">${esc(meta.url||'')}</a><br>Exported: ${esc(meta.exported_at||'')} (${esc(meta.timezone||'')})</div>
  </header>
  <main class="chat" id="chat">`;

  function renderBody(text){
    const FENCE = String.fromCharCode(96,96,96);
    const parts = String(text||'').split(FENCE);
    let out='';
    for(let i=0;i<parts.length;i++){
      if(i%2===1){
        let seg=parts[i]; const nl=seg.indexOf('\\n'); let body=seg; if(nl!==-1) body=seg.slice(nl+1);
        out += '<pre><code>' + esc(body) + '</code></pre>';
      }else{
        const para = esc(parts[i]).replace(/\\n\\n+/g,'</p><p>').replace(/\\n/g,'<br>');
        out += (i===0?'<p>':'') + para;
      }
    }
    if(!out.endsWith('</p>')) out+='</p>';
    return out;
  }

  let mid='';
  for(const m of msgs){
    const role = m.role==='user'?'user':'ai';
    mid += '<section class="row '+role+'" id="'+esc(m.id||'')+'"><div class="bubble"><div class="meta"><span class="badge">'+(role==='user'?'User':'AI')+'</span><span class="time">'+esc(m.time||'')+'</span></div><div class="content">'+renderBody(m.text)+'</div></div></section>';
  }

  const tail = `</main>
  <aside class="panel" id="panel">
    <header>
      <div class="title">会話インデックス</div>
      <div class="sub">クリックで該当へ移動 / 検索・User/AIフィルタ</div>
    </header>
    <div class="controls">
      <input id="f" type="search" placeholder="フィルタ…">
      <label><input type="checkbox" id="u" checked> User</label>
      <label><input type="checkbox" id="a" checked> AI</label>
    </div>
    <ul class="list" id="list"></ul>
    <div class="footer">
      <button class="btn primary" id="dlmd">Markdown</button>
      <button class="btn" id="dljson">JSON</button>
    </div>
  </aside>
</div>
<script id="data" type="application/json">${escJSON(JSON.stringify({meta, messages: msgs}))}</script>
<script>
  var DATA = (function(){ try { return JSON.parse(document.getElementById('data').textContent); } catch(e){ return {meta:{},messages:[]}; } })();
  var chat = document.getElementById('chat'), list=document.getElementById('list'), inF=document.getElementById('f'), cbU=document.getElementById('u'), cbA=document.getElementById('a');
  function esc(s){ return String(s||'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function headLine(text){ var t=String(text||'').replace(/\\s+/g,' ').trim(); if(!t) return '(empty)'; var m=t.match(/^(.{1,120}?)([。．.!?？]|$)/); return (m&&m[1])?m[1]:t.slice(0,120); }
  function renderBody(text){ var FENCE=String.fromCharCode(96,96,96); var parts=String(text||'').split(FENCE); var out=''; for(var i=0;i<parts.length;i++){ if(i%2===1){ var seg=parts[i]; var nl=seg.indexOf('\\n'); var body=seg; if(nl!==-1) body=seg.slice(nl+1); out+='<pre><code>'+esc(body)+'</code></pre>'; } else { var para=esc(parts[i]).replace(/\\n\\n+/g,'</p><p>').replace(/\\n/g,'<br>'); out+=(i===0?'<p>':'')+para; } } if(out.slice(-4)!=='</p>') out+='</p>'; return out; }
  function build(){ chat.innerHTML=''; list.innerHTML=''; var kw=inF.value.trim().toLowerCase(); var showU=cbU.checked, showA=cbA.checked; var filtered=(DATA.messages||[]).filter(function(m){ var roleOK=(m.role==='user'&&showU)||(m.role==='assistant'&&showA)||(!['user','assistant'].includes(m.role)); var textOK=!kw||String(m.text||'').toLowerCase().includes(kw); return roleOK&&textOK; }); for(var i=0;i<filtered.length;i++){ var m=filtered[i]; var role=(m.role==='user'?'user':'ai'); var row=document.createElement('section'); row.className='row '+role; row.id=m.id; row.innerHTML='<div class="bubble"><div class="meta"><span class="badge">'+(role==='user'?'User':'AI')+'</span><span class="time">'+(m.time||'')+'</span></div><div class="content">'+renderBody(m.text)+'</div></div>'; chat.appendChild(row); var li=document.createElement('li'); li.className='item'; li.innerHTML='<button class="link"><span class="rolepill '+(role==='user'?'is-user':'')+'">'+(role==='user'?'User':'AI')+'</span><span class="head">'+esc(headLine(m.text))+'</span></button>'; li.querySelector('.link').addEventListener('click',(function(id){return function(){ var el=document.getElementById(id); if(el) el.scrollIntoView({behavior:"smooth", block:"start"}); };})(m.id)); list.appendChild(li); } } inF.addEventListener('input', build); cbU.addEventListener('change', build); cbA.addEventListener('change', build); build(); function timestamp(){ return new Date().toISOString().replace(/[:.]/g,'-'); } function dl(blob, name){ var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(function(){URL.revokeObjectURL(a.href);},3000); } document.getElementById('dljson').addEventListener('click', function(){ dl(new Blob([JSON.stringify(DATA,null,2)],{type:'application/json'}), 'chatgpt_export_'+timestamp()+'.json'); }); document.getElementById('dlmd').addEventListener('click', function(){ var md='# ChatGPT Conversation Export\\n\\n- Title: '+(DATA.meta.title||'')+'\\n- URL: '+(DATA.meta.url||'')+'\\n- Exported: '+(DATA.meta.exported_at||'')+' ('+(DATA.meta.timezone||'')+')\\n\\n---\\n\\n'; for(var i=0;i<DATA.messages.length;i++){ var m=DATA.messages[i]; var role=m.role==='user'?'User':(m.role==='assistant'?'AI':(m.role||'Unknown')); md+='### '+role+'  \\\\n*Time:* '+(m.time||'')+'\\n\\n'+String(m.text||'').replace(/^#/gm,'\\\\#')+'\\n\\n---\\n\\n'; } dl(new Blob([md],{type:'text/markdown;charset=utf-8'}),'chatgpt_export_'+timestamp()+'.md'); }); 
</script>
</body></html>`;
  return head + mid + tail;
}

// ---- helpers: pending queue ----
async function getPending() {
  try { const o = await chrome.storage.local.get(PENDING_KEY); return Array.isArray(o[PENDING_KEY]) ? o[PENDING_KEY] : []; } catch(e){ return []; }
}
async function setPending(list) { try { await chrome.storage.local.set({ [PENDING_KEY]: list }); } catch(e){} }
async function enqueuePending(item) { const l = await getPending(); l.push(item); await setPending(l); }
async function removePendingById(id) { const l = await getPending(); await setPending(l.filter(x=>x.id!==id)); }

// ---- helpers: local snapshot mirror ----
async function getSnapLocalAll() { try{ const o = await chrome.storage.local.get(SNAP_LOCAL_KEY); return Array.isArray(o[SNAP_LOCAL_KEY]) ? o[SNAP_LOCAL_KEY] : []; } catch(e){ return []; } }
async function setSnapLocalAll(arr) { try{ await chrome.storage.local.set({ [SNAP_LOCAL_KEY]: arr }); } catch(e){} }
async function upsertSnapLocal(rec) {
  const arr = await getSnapLocalAll();
  const i = arr.findIndex(x => x.tabId === rec.tabId);
  if (i>=0) arr[i] = rec; else arr.push(rec);
  await setSnapLocalAll(arr);
}
async function removeSnapLocalByTab(tabId) {
  const arr = await getSnapLocalAll();
  const next = arr.filter(x => x.tabId !== tabId);
  await setSnapLocalAll(next);
}
async function findSnapLocalByWindow(windowId) {
  const arr = await getSnapLocalAll();
  return arr.filter(x => x.windowId === windowId);
}

// ---- helpers: session snapshot (best-effort) ----
async function setSnapshot(tabId, snapshot) {
  const key = SNAP_PREFIX + tabId;
  try {
    if (chrome.storage && chrome.storage.session) {
      await chrome.storage.session.set({ [key]: snapshot });
    }
  } catch (e) {}
}
async function getSnapshot(tabId) {
  const key = SNAP_PREFIX + tabId;
  try {
    if (chrome.storage && chrome.storage.session) {
      const o = await chrome.storage.session.get(key);
      return o[key];
    }
  } catch (e) { }
  return undefined;
}
async function clearSnapshot(tabId) {
  const key = SNAP_PREFIX + tabId;
  try {
    if (chrome.storage && chrome.storage.session) {
      await chrome.storage.session.remove(key);
    }
  } catch (e) {}
}

// ---- message handlers ----
// Auto-appended handlers for text save
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!msg) return;
    if (msg.type === 'SNAPSHOT' && sender.tab && sender.tab.id != null) {
      const rec = { tabId: sender.tab.id, windowId: sender.tab.windowId, auto: !!msg.auto, data: msg.data, t: Date.now() };
      await setSnapshot(sender.tab.id, rec);
      await upsertSnapLocal(rec); // mirror into local (persists across window close)
      try { sendResponse({ ok: true }); } catch {}
      return;
    }
    if (msg.type === 'SAVE_HTML_FROM_DATA') {
      try {
        const html = buildHtmlFromData(msg.data || {});
        const filename = (msg.filename && String(msg.filename)) || ('chatgpt_export_' + new Date().toISOString().replace(/[:.]/g,'-') + '.html');
        const id = String(Date.now()) + '-' + Math.random().toString(36).slice(2,8);
        await enqueuePending({ id, filename, html, createdAt: Date.now() });
        const url = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
        chrome.downloads.download({ url, filename, conflictAction: 'uniquify', saveAs: false }, async (dlid) => {
          if (!chrome.runtime.lastError && dlid) await removePendingById(id);
          try { sendResponse({ ok: !chrome.runtime.lastError, downloadId: dlid || null, error: chrome.runtime.lastError?.message }); } catch {}
        });
      } catch (e) {
        try { sendResponse({ ok:false, error: String(e) }); } catch {}
      }
      return true;
    }
    if (msg.type === 'FLUSH_PENDING') {
      await flushPending();
      try { sendResponse({ ok: true }); } catch {}
      return;
    }
  })();
  return true;
});

// ---- events ----
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  // Try session first, else local mirror
  let rec = await getSnapshot(tabId);
  if (!rec) {
    const arr = await getSnapLocalAll();
    rec = arr.find(x => x.tabId === tabId);
  }
  if (!rec) return;
  if (!rec.auto) { await clearSnapshot(tabId); await removeSnapLocalByTab(tabId); return; }
  try {
    const html = buildHtmlFromData(rec.data || {});
    const filename = 'chatgpt_export_' + new Date().toISOString().replace(/[:.]/g,'-') + '.html';
    const id = String(Date.now()) + '-' + Math.random().toString(36).slice(2,8);
    await enqueuePending({ id, filename, html, createdAt: Date.now() });
    const url = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    chrome.downloads.download({ url, filename, conflictAction: 'uniquify', saveAs: false }, async (dlid) => {
      if (!chrome.runtime.lastError && dlid) await removePendingById(id);
      await clearSnapshot(tabId);
      await removeSnapLocalByTab(tabId);
    });
  } catch (e) {
    await clearSnapshot(tabId);
    await removeSnapLocalByTab(tabId);
  }
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  // Fallback: export all auto snapshots belonging to the closed window
  const snaps = await findSnapLocalByWindow(windowId);
  for (const rec of snaps) {
    if (!rec || !rec.auto) continue;
    try {
      const html = buildHtmlFromData(rec.data || {});
      const filename = 'chatgpt_export_' + new Date().toISOString().replace(/[:.]/g,'-') + '.html';
      const id = String(Date.now()) + '-' + Math.random().toString(36).slice(2,8);
      await enqueuePending({ id, filename, html, createdAt: Date.now() });
      const url = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
      chrome.downloads.download({ url, filename, conflictAction: 'uniquify', saveAs: false }, async (dlid) => {
        if (!chrome.runtime.lastError && dlid) await removePendingById(id);
      });
    } catch (e) {}
  }
  // clean-out any tabs from that window
  const all = await getSnapLocalAll();
  await setSnapLocalAll(all.filter(x => x.windowId !== windowId));
});

async function flushPending() {
  const list = await getPending();
  for (const item of list) {
    const url = 'data:text/html;charset=utf-8,' + encodeURIComponent(item.html);
    await new Promise((resolve) => {
      chrome.downloads.download({ url, filename: item.filename, conflictAction: 'uniquify', saveAs: false }, async (dlid) => {
        if (!chrome.runtime.lastError && dlid) await removePendingById(item.id);
        resolve();
      });
    });
  }
}
chrome.runtime.onStartup.addListener(flushPending);
chrome.runtime.onInstalled.addListener(flushPending);

// Dedicated simple listener for text saves (MD/JSON)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === 'SAVE_TEXT_AS') {
    try {
      const body = String(msg.body || '');
      const mime = String(msg.mime || 'text/plain;charset=utf-8');
      const filename = (msg.filename && String(msg.filename)) || ('chatgpt_export_' + new Date().toISOString().replace(/[:.]/g,'-') + '.txt');
      const url = 'data:' + mime + ',' + encodeURIComponent(body);
      chrome.downloads.download({ url, filename, conflictAction: 'uniquify', saveAs: false }, () => {
        try { sendResponse({ok:true}); } catch(e){}
      });
      return true;
    } catch (e) {
      try { sendResponse({ok:false, error:String(e)}); } catch(_){}
    }
  }
});


// Open Options Page handler (from content script)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === 'OPEN_OPTIONS') {
    try {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        const url = chrome.runtime.getURL('settings.html');
        chrome.tabs.create({ url });
      }
      try { sendResponse({ ok: true }); } catch(e){}
    } catch (e) {
      try { sendResponse({ ok: false, error: String(e) }); } catch(_){}
    }
    return true;
  }
});
