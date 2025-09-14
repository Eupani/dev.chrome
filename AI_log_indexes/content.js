
(() => {
  if (window.__CGPT_INDEX_INSTALLED__) return;
  window.__CGPT_INDEX_INSTALLED__ = true;

  const PANEL_ID = "cgpt-index-panel";
  const FAB_ID = "cgpt-index-fab";
  const STORAGE_KEY_WIDTH = "cgpt-index-width";
  const STORAGE_KEY_VIS = "cgpt-index-visible";
  const SELECTORS = [
    '[data-message-author-role][data-message-id]',
    '[data-message-author-role]',
    'div[data-testid^="conversation-turn-"]',
    'main [role="listitem"]',
    'article[data-message-author-role]',
  ];
  let CACHED = [];

  // ===== Panel =====
  const panel = document.createElement('aside');
  panel.id = PANEL_ID;
  panel.setAttribute('aria-label', 'ChatGPT Conversation Index');
  panel.classList.add('cgpt-index-hidden');
  panel.innerHTML = ''
  + '<div class="cgpt-index-header">'
  + '  <div class="cgpt-index-title-row">'
  + '    <div class="cgpt-index-title">会話インデックス</div>'
  + '    <button id="cgpt-index-refresh" class="cgpt-btn" title="一覧を更新">⟳ 更新</button>'
  + '  </div>'
  + '  <div class="cgpt-index-actions">'
  + '    <input id="cgpt-index-filter" type="search" placeholder="フィルタ…" aria-label="フィルタ" />'
  + '    <label class="cgpt-index-chk"><input type="checkbox" id="cgpt-chk-user" checked> User</label>'
  + '    <label class="cgpt-index-chk"><input type="checkbox" id="cgpt-chk-assistant" checked> AI</label>'
  + '  </div>'
  + '  <div class="cgpt-index-sub">クリックで該当へ移動 / Alt+I で表示切替</div>'
  + '</div>'
  + '<div class="cgpt-index-resizer" title="ドラッグで幅を変更"></div>'
  + '<ul id="cgpt-index-list" class="cgpt-index-list" aria-label="メッセージ一覧"></ul>'
  + '<div class="cgpt-index-footer">'
  + '  <button id="cgpt-btn-md" class="cgpt-btn-primary" title="Markdownにエクスポート">Markdown</button>'
  + '  <button id="cgpt-btn-json" class="cgpt-btn" title="JSONにエクスポート">JSON</button>'
  + '  <button id="cgpt-btn-html" class="cgpt-btn" title="HTMLにエクスポート">HTML</button>'
  + '  <div class="cgpt-footer-spacer"></div>'
  + '  <button id="cgpt-open-settings" class="cgpt-btn" title="設定を開く">設定</button>'
  + '</div>';
  document.documentElement.appendChild(panel);

  // ===== FAB =====
  const fab = document.createElement('button');
  fab.id = FAB_ID;
  fab.setAttribute('aria-label', '会話インデックスの表示切替');
  fab.title = '会話インデックスの表示切替 (Alt+I)';
  fab.innerHTML = '<span class="cgpt-fab-dot" aria-hidden="true"></span>';
  document.documentElement.appendChild(fab);
  fab.addEventListener('click', togglePanel);
  
  window.addEventListener('scroll', ()=> hideBubble(true), {passive:true});
  window.addEventListener('resize', ()=> hideBubble(true));
  fab.addEventListener('click', ()=> hideBubble(true));


  const listEl = panel.querySelector('#cgpt-index-list');
  const filterEl = panel.querySelector('#cgpt-index-filter');
  const refreshBtn = panel.querySelector('#cgpt-index-refresh');
  const chkUser = panel.querySelector('#cgpt-chk-user');
  const chkAssistant = panel.querySelector('#cgpt-chk-assistant');
  const btnMD = panel.querySelector('#cgpt-btn-md');
  const btnJSON = panel.querySelector('#cgpt-btn-json');
  const btnHTML = panel.querySelector('#cgpt-btn-html');
  const resizer = panel.querySelector('.cgpt-index-resizer');
  const btnSettings = panel.querySelector('#cgpt-open-settings');

  // ===== Panel open/close =====
  function openPanel(){ panel.classList.remove('cgpt-index-hidden'); document.documentElement.classList.add('cgpt-index-open'); setPageOffsetByPanelWidth(); try{localStorage.setItem(STORAGE_KEY_VIS,'visible');}catch{} }
  function closePanel(){ panel.classList.add('cgpt-index-hidden'); document.documentElement.classList.remove('cgpt-index-open'); setPageOffsetByPanelWidth(); try{localStorage.setItem(STORAGE_KEY_VIS,'hidden');}catch{} }
  function togglePanel(){ panel.classList.contains('cgpt-index-hidden') ? openPanel() : closePanel(); }
  try {
    const savedW = localStorage.getItem(STORAGE_KEY_WIDTH);
    if (savedW) panel.style.width = savedW;
    const vis = localStorage.getItem(STORAGE_KEY_VIS);
    if (vis !== 'hidden') openPanel(); else closePanel();
  } catch { openPanel(); }

  // ===== Utils =====
  function setPageOffsetByPanelWidth() {
    const w = panel.getBoundingClientRect().width;
    document.documentElement.style.setProperty('--cgpt-index-width', w + 'px');
  }
  function normalizeText(el){
    let t = (el.innerText || el.textContent || '').replace(/\s+/g,' ').trim();
    return t;
  }
  function roleOf(el){
    const r = el.getAttribute('data-message-author-role') || el.dataset.messageAuthorRole;
    if (r) return r;
    const t = (el.innerText||'').slice(0,12);
    if (/^(You|ユーザー|User)\b/.test(t)) return 'user';
    return 'assistant';
  }
  function roots(){
    const list=[document];
    document.querySelectorAll('*').forEach(n=>{ if (n.shadowRoot) list.push(n.shadowRoot); });
    return list;
  }
  function getMessageNodes(){
    const seen=new Set(); const nodes=[];
    for(const sel of SELECTORS){
      for (const root of roots()){
        root.querySelectorAll(sel).forEach(el=>{
          if(!(el instanceof Element)) return;
          if(el.closest('#'+PANEL_ID)) return;
          let container=el;
          if(!container.hasAttribute('data-message-author-role')){
            const p=el.closest('[data-message-author-role]'); if(p) container=p;
          }
          const text=(container.innerText||'').trim(); if(!text) return;
          const mid=container.getAttribute('data-message-id')||container.dataset.messageId||(container.id||'');
          const key= mid?('mid:'+mid):('len:'+container.outerHTML.length+':'+container.innerText.length);
          if(seen.has(key)) return; seen.add(key);
          nodes.push(container);
        });
        if(nodes.length) break;
      }
    }
    return nodes;
  }
  function firstLine(s){ return (s||'').split(/\n/)[0].slice(0,160); }

  function pad2(n){ return (n<10?'0':'') + n; }
  function fmtLocal(iso){
    try{
      const d = (iso instanceof Date) ? iso : new Date(iso);
      if (isNaN(d)) return '';
      return d.getFullYear() + '/' + pad2(d.getMonth()+1) + '/' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
    }catch(e){ return ''; }
  }
  function seenISO(el){
    try{
      if (el && el.dataset && el.dataset.cgptSeenAt) return el.dataset.cgptSeenAt;
      let dt = null;
      try{
        const t = el && (el.querySelector && (el.querySelector('time[datetime]') || el.querySelector('time')));
        if (t){
          const raw = t.getAttribute('datetime') || t.getAttribute('title') || t.textContent;
          const d = new Date(raw);
          if (!isNaN(d)) dt = d;
        }
      }catch(e){}
      if (!dt) dt = new Date();
      const iso = dt.toISOString();
      try{ if (el && el.dataset) el.dataset.cgptSeenAt = iso; }catch(e){}
      return iso;
    }catch(e){ return new Date().toISOString(); }
  }

  // ===== Build list =====
  function rebuild(){
    const nodes = getMessageNodes();
    const lines = [];
    for(const el of nodes){
      const role = roleOf(el);
      const text = normalizeText(el);
      if (role==='user' && !chkUser.checked) continue;
      if (role!=='user' && !chkAssistant.checked) continue;
      const line = firstLine(text);
      const id = el.getAttribute('data-message-id') || el.id || '';
      const iso = seenISO(el);
      const when = fmtLocal(iso);
      lines.push({el, role, line, id, text, time: when, timeISO: iso});
    }
    const q = (filterEl.value || '').trim().toLowerCase();
    const filtered = q ? lines.filter(x=> (x.line + ' ' + (x.text||'')).toLowerCase().includes(q)) : lines;

    listEl.innerHTML = '';
    filtered.forEach((x, i)=>{
      const li = document.createElement('li');
      li.className = 'cgpt-index-item ' + (x.role==='user'?'u':'a');
      const pillClass = (x.role==='user'?'is-user':'');
      const pillLabel = (x.role==='user'?'User':'AI');
      const head = x.line.replace(/[<>]/g, c => c === '<' ? '&lt;' : '&gt;');
      li.innerHTML = `<span class="rolepill ${pillClass}">${pillLabel}</span><span class="msg-time">${x.time||""}</span><span class="cgpt-index-item-head">${x.line.replace(/[<>]/g, c => c === '<' ? '&lt;' : '&gt;')}</span>`;
      li.dataset.full = x.text;
      li.title = x.line;
      li.addEventListener('mouseenter', ()=>{ showBubbleForLI(li); });
      li.addEventListener('mouseleave', ()=>{ hideBubble(false); });
      li.addEventListener('click', ()=>{
        try{ x.el.scrollIntoView({behavior:'smooth', block:'center'}); }catch{}
        try{ x.el.classList.add('cgpt-index-highlight'); setTimeout(()=>x.el.classList.remove('cgpt-index-highlight'), 800); }catch{}
      });
      listEl.appendChild(li);
    });
  
    try {
      if (typeof lines !== 'undefined' && Array.isArray(lines) && lines.length) {
        const messages = lines.map((x,i) => ({ idx: i+1, role: x.role==='user'?'user':'assistant', text: String(x.text||x.line||''), time: x.time||'' }));
        const title = (document.title || 'ChatGPT').replace(/[\\/:*?"<>|]+/g,'_');
        window.__CGPT_LAST_SNAPSHOT__ = { meta: { title, url: location.href, exported_at: new Date().toISOString() }, messages };
      }
    } catch(e){}

    // ★★★ ここを関数の中に移動（lines が見える位置）
    CACHED = lines.map((x,i)=>({
      index: i+1,
      id: x.id || ('cgpt-exp-' + (i+1)),
      role: x.role === 'user' ? 'user' : 'assistant',
      text: String(x.text || x.line || ''),
      time: x.time || ''
    }));
  }

  // ===== Preview Bubble (吹き出し) =====
  const bubble = document.createElement('div');
  bubble.id = 'cgpt-index-bubble';
  bubble.setAttribute('role','tooltip');
  bubble.className = 'cgpt-index-bubble';
  bubble.style.display = 'none';
  document.documentElement.appendChild(bubble);

  let bubbleTimer = null;

  function hideBubble(immediate){
    if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer=null; }
    if (immediate) {
      bubble.style.display='none';
      bubble.classList.remove('left','right');
      bubble.textContent='';
    } else {
      bubbleTimer = setTimeout(()=>{ bubble.style.display='none'; bubble.classList.remove('left','right'); bubble.textContent=''; }, 80);
    }
  }

  function showBubbleForLI(li){
    const text = (li && li.dataset && (li.dataset.full || li.dataset.full === '')) ? li.dataset.full : (li ? (li.getAttribute('title') || li.textContent || '') : '');
    if (!text) return;
    if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer=null; }
    bubble.textContent = text;
    bubble.style.display = 'block';
    bubble.style.visibility = 'hidden'; // measure first

    // desired width
    const width = Math.min(460, Math.max(280, window.innerWidth * 0.35));
    bubble.style.width = width + 'px';

    // measure height with current content
    const rect = li.getBoundingClientRect();
    const bcr = bubble.getBoundingClientRect();
    let left = rect.left - width - 16;
    let top = rect.top + (rect.height/2) - (bcr.height/2);
    top = Math.max(12, Math.min(top, window.innerHeight - bcr.height - 12));

    // if no space on the left, place to right of panel/item
    if (left < 4) {
      left = rect.right + 16;
      bubble.classList.remove('left'); bubble.classList.add('right');
    } else {
      bubble.classList.remove('right'); bubble.classList.add('left');
    }

    bubble.style.left = Math.round(left) + 'px';
    bubble.style.top  = Math.round(top + window.scrollY) + 'px';
    bubble.style.visibility = 'visible';
  }

// ===== Export helpers =====
function currentPageMeta(){
  return {
    title: (document.title || 'ChatGPT'),
    url: location.href,
    exported_at: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
}
function filteredMessages(){
  const kw = (filterEl.value||'').trim().toLowerCase();
  const showU = chkUser.checked, showA = chkAssistant.checked;
  return CACHED.filter(m=>{
    const roleOK = (m.role==='user'&&showU) || (m.role==='assistant'&&showA);
    const textOK = !kw || (m.text||'').toLowerCase().includes(kw);
    return roleOK && textOK;
  });
}
function mdEscape(s){ return String(s||'').replace(/^#/gm,'\\#'); }
function baseFileName(){
  const title = (document.title || 'chatgpt').replace(/[\\\/:*?"<>|]+/g,'_').slice(0,60);
  return `${title}_${timestampForFile()}`;
}
function timestampForFile(){ return new Date().toISOString().replace(/[:.]/g,'-'); }

// ⬇︎ここが重要：</script> を <\/script> に変換するために **'\\/'** を使う
function escJSON(s){
  return String(s)
    .replace(/[&<>]/g, c => c==='&'?'&amp;':(c==='<')?'&lt;':'&gt;')
    .replace(/<\/script/gi, '<\\/script'); // ← これが1本バックスラッシュだと壊れます
}

function saveTextAs(body, mime, filename){
  try { chrome.runtime.sendMessage({ type: 'SAVE_TEXT_AS', body, mime, filename }); } catch(e) {}
}

function exportJSON(){
  const data = { meta: currentPageMeta(), messages: filteredMessages() };
  saveTextAs(JSON.stringify(data, null, 2), 'application/json;charset=utf-8', baseFileName()+'.json');
}
function exportMarkdown(){
  const meta = currentPageMeta();
  const msgs = filteredMessages();
  let md = `# ChatGPT Conversation Export

- Title: ${meta.title}
- URL: ${meta.url}
- Exported: ${meta.exported_at} (${meta.timezone})

---
`;
  for (const m of msgs){
    const role = m.role==='user'?'User':'AI';
    md += `### ${role}  \\
*Time:* ${m.time}

${mdEscape(m.text)}

---
`;
  }
  saveTextAs(md, 'text/markdown;charset=utf-8', baseFileName()+'.md');
}

// === HTML（サイドバー付き・今の見た目）のエクスポート ===
function exportHTML(){
  const meta = currentPageMeta();
  const msgs = filteredMessages();
  const data = { meta, messages: msgs };

  // JSONを<script type="application/json">に安全に埋め込む
  const dataJSON = escJSON(JSON.stringify(data));

  // 内側 <script> に書くコードでは、外側テンプレ内のエスケープのため **'\\n'** を使う
  const page = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${meta.title.replace(/[&<>]/g, c=>c==='&'?'&amp;':(c==='<')?'&lt;':'&gt;')} - Export</title>
<style>
  :root{ --bg:#0b1020; --fg:#e5e7eb; --sub:#9ca3af; --border:rgba(255,255,255,.08); --card:#0f172a; --ai:#1f2937; --user:#1e3a8a; --bubble:#111827; --panel:#0f172a; --accent:#3b82f6; }
  @media (prefers-color-scheme: light){ :root{ --bg:#f8fafc; --fg:#111827; --sub:#6b7280; --border:rgba(0,0,0,.08); --card:#ffffff; --ai:#374151; --user:#1d4ed8; --bubble:#ffffff; --panel:#ffffff; --accent:#2563eb; } }
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans JP","Hiragino Kaku Gothic ProN","Meiryo",sans-serif;}
  .wrap{display:grid;grid-template-columns:1fr 340px;gap:12px;max-width:1200px;margin:20px auto;padding:0 12px;}
  @media (max-width:960px){ .wrap{grid-template-columns:1fr;} .panel{order:-1;position:static;height:auto;} }
  header{grid-column:1/-1;margin-bottom:2px} header h1{margin:0 0 6px;font-size:20px;font-weight:700} header .meta{font-size:12px;color:var(--sub)}
  .row{display:flex;gap:12px;align-items:flex-start}.row.ai{justify-content:flex-start}.row.user{justify-content:flex-end}
  .bubble{max-width:100%;background:var(--bubble);border:1px solid var(--border);border-radius:16px;padding:12px 14px;margin:10px 0;box-shadow:0 2px 8px rgba(0,0,0,.08)}
  .meta{font-size:11px;color:var(--sub);margin-bottom:6px}.badge{font-size:11px;border:1px solid var(--border);border-radius:999px;padding:2px 8px;font-weight:600;color:var(--ai)} .user .badge{color:var(--user)} .time{margin-left:6px}
  .content{white-space:pre-wrap;word-break:break-word}.content pre{background:rgba(0,0,0,.35);border:1px solid var(--border);border-radius:10px;padding:10px;overflow:auto}.content code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;font-size:12px}
  .panel{position:sticky;top:12px;height:calc(100vh - 24px);display:flex;flex-direction:column;background:var(--panel);border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.08)}
  .panel header{padding:10px 12px;border-bottom:1px solid var(--border)} .panel header .title{font-size:14px;font-weight:700} .panel .sub{font-size:11px;color:var(--sub);margin-top:4px}
  .controls{display:grid;grid-template-columns:1fr auto auto;gap:6px;padding:10px 12px;border-bottom:1px solid var(--border)}
  .controls input[type=search]{padding:8px 10px;border:1px solid var(--border);border-radius:10px;background:transparent;color:var(--fg)}
  .controls label{font-size:11px;display:flex;gap:6px;align-items:center}
  .list{list-style:none;margin:0;padding:8px 12px;overflow:auto;flex:1}
  .item{margin:6px 0}.link{display:grid;grid-template-columns:auto 1fr;gap:10px;padding:8px;width:100%;text-align:left;background:transparent;border:none;border-radius:10px;cursor:pointer;color:inherit}
  .link:hover{background:rgba(255,255,255,.06)} .rolepill{font-size:11px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;min-width:34px;text-align:center;font-weight:600;color:var(--ai)} .is-user{color:var(--user)}
  .link .head{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .footer{padding:10px 12px;border-top:1px solid var(--border);display:flex;gap:8px}.btn{padding:10px 12px;font-size:12px;border-radius:10px;border:1px solid var(--border);background:transparent;color:inherit;cursor:pointer}.btn.primary{background:var(--accent);color:#fff;border:none}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>ChatGPT Conversation Export</h1>
    <div class="meta">Title: ${meta.title.replace(/[&<>]/g, c=>c==='&'?'&amp;':(c==='<')?'&lt;':'&gt;')}<br>URL: <a href="${meta.url.replace(/[&<>]/g, c=>c==='&'?'&amp;':(c==='<')?'&lt;':'&gt;')}">${meta.url.replace(/[&<>]/g, c=>c==='&'?'&amp;':(c==='<')?'&lt;':'&gt;')}</a><br>Exported: ${meta.exported_at} (${meta.timezone})</div>
  </header>

  <main class="chat" id="chat"></main>

  <aside class="panel" id="panel">
    <header><div class="title">会話インデックス</div><div class="sub">クリックで本文へ移動／検索と役割で絞り込み</div></header>
    <div class="controls">
      <input id="q" type="search" placeholder="フィルタ...">
      <label><input type="checkbox" id="fUser" checked> User</label>
      <label><input type="checkbox" id="fAI" checked> AI</label>
    </div>
    <ul class="list" id="list"></ul>
    <div class="footer">
      <button class="btn primary" id="expMd">Markdown</button>
      <button class="btn" id="expJson">JSON</button>
    </div>
  </aside>
</div>

<script id="data" type="application/json">${dataJSON}</script>
<script>
  var DATA = JSON.parse(document.getElementById('data').textContent);
  var chat = document.getElementById('chat');
  var list = document.getElementById('list');
  var inF = document.getElementById('q');
  var cbU = document.getElementById('fUser');
  var cbA = document.getElementById('fAI');

  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function headLine(text){
    var t=String(text||'').replace(/\\s+/g,' ').trim();
    if(!t) return '(empty)';
    var m=t.match(/^(.{1,120}?)([。．.!?？]|$)/);
    return (m&&m[1])?m[1]:t.slice(0,120);
  }
  function renderBody(text){
    var FENCE = String.fromCharCode(96,96,96);
    var parts = String(text||'').split(FENCE);
    var out = '';
    for (var i=0;i<parts.length;i++){
      if (i % 2 === 1){
        var seg = parts[i]; var nl = seg.indexOf('\\\\n'); // ← **重要**: '\\n'
        var body = (nl !== -1) ? seg.slice(nl+1) : seg;
        out += '<pre><code>' + esc(body) + '</code></pre>';
      } else {
        var para = esc(parts[i]).replace(/\\n\\n+/g,'</p><p>').replace(/\\n/g,'<br>');
        if (i===0 && !/^\\s*<p>/.test(para)) out += '<p>';
        out += para;
      }
    }
    if (!/<\\/p>\\s*$/.test(out)) out += '</p>';
    return out;
  }

  function build(){
    chat.innerHTML=''; list.innerHTML='';
    var kw=(inF.value||'').toLowerCase();
    var showU=cbU.checked, showA=cbA.checked;
    var msgs = DATA.messages.filter(function(m){
      var roleOK=(m.role==='user'&&showU)||(m.role==='assistant'&&showA)||(!['user','assistant'].includes(m.role));
      var textOK=!kw||(m.text||'').toLowerCase().includes(kw);
      return roleOK && textOK;
    });
    for (var i=0;i<msgs.length;i++){
      var m=msgs[i];
      var row=document.createElement('section');
      row.className='row ' + (m.role==='user'?'user':'ai');
      row.id=m.id||('m'+(i+1));
      row.innerHTML='<div class="bubble"><div class="meta"><span class="badge">'+(m.role==='user'?'User':'AI')+'</span><span class="time">'+(m.time||'')+'</span></div><div class="content">'+renderBody(m.text||'')+'</div></div>';
      chat.appendChild(row);

      var li=document.createElement('li'); li.className='item';
      li.innerHTML='<button class="link"><span class="rolepill '+(m.role==='user'?'is-user':'')+'">'+(m.role==='user'?'User':'AI')+'</span><span class="head">'+esc(headLine(m.text||''))+'</span></button>';
      li.querySelector('.link').addEventListener('click', (function(targetId){ return function(){ var el=document.getElementById(targetId); if(el) el.scrollIntoView({behavior:'smooth', block:'start'}); }; })(row.id));
      list.appendChild(li);
    }
  }
  inF.addEventListener('input', build);
  cbU.addEventListener('change', build);
  cbA.addEventListener('change', build);
  build();

  function ts(){ return new Date().toISOString().replace(/[:.]/g,'-'); }
  function dl(blob, name){ var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(function(){URL.revokeObjectURL(a.href);}, 3000); }

  document.getElementById('expJson').addEventListener('click', function(){
    dl(new Blob([JSON.stringify(DATA,null,2)],{type:'application/json;charset=utf-8'}),'chatgpt_export_'+ts()+'.json');
  });
  document.getElementById('expMd').addEventListener('click', function(){
    var meta=DATA.meta, msgs=DATA.messages, md = '# ChatGPT Conversation Export\\n\\n- Title: '+meta.title+'\\n- URL: '+meta.url+'\\n- Exported: '+meta.exported_at+' ('+meta.timezone+')\\n\\n---\\n\\n';
    for (var i=0;i<msgs.length;i++){ var m=msgs[i]; var role=m.role==='user'?'User':(m.role==='assistant'?'AI':(m.role||'Unknown')); md += '### '+role+'  \\\\n*Time:* '+(m.time||'')+'\\n\\n'+String(m.text||'').replace(/^#/gm,'\\\\#')+'\\n\\n---\\n\\n'; }
    dl(new Blob([md],{type:'text/markdown;charset=utf-8'}),'chatgpt_export_'+ts()+'.md');
  });
</script>
</body></html>`;

  saveTextAs(page, 'text/html;charset=utf-8', baseFileName()+'.html');
}

  // ===== Wire buttons =====
btnMD.addEventListener('click', exportMarkdown);
btnJSON.addEventListener('click', exportJSON);
btnHTML.addEventListener('click', exportHTML);

  // Settings button opens options page
  btnSettings.addEventListener('click', ()=>{
    try{
      chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
    }catch(e){}
  });

  // ===== Resizer =====
  (function(){
  // Rolling snapshot for export fallback
  window.__CGPT_LAST_SNAPSHOT__ = null;

    let startX=0, startW=0, dragging=false;
    resizer.addEventListener('mousedown', (e)=>{
      dragging=true; startX=e.clientX; startW=panel.getBoundingClientRect().width;
      document.body.classList.add('cgpt-resizing');
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e)=>{
      if(!dragging) return;
      const w = Math.max(260, startW + (e.clientX - startX));
      panel.style.width = w + 'px';
      setPageOffsetByPanelWidth();
    }, {passive:true});
    window.addEventListener('mouseup', ()=>{
      if(!dragging) return;
      dragging=false; document.body.classList.remove('cgpt-resizing');
      try{ localStorage.setItem(STORAGE_KEY_WIDTH, panel.getBoundingClientRect().width + 'px'); }catch{}
    });
  })();

  // ===== Hotkey Alt+I (not while typing) =====
  function isEditable(target){ return !!(target && (target.closest('input,textarea,[contenteditable="true"]'))); }
  window.addEventListener('keydown', e=>{
    if (e.altKey && (e.key==='i'||e.key==='I') && !isEditable(e.target)) togglePanel();
  });

  // ===== Observe & rebuild =====
  const obs = new MutationObserver(mut=>{
    for(const m of mut){ if(m.type==='childList' || m.type==='attributes'){ rebuild(); break; } }
  });
  const startObserve = () => { if (document.body) obs.observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['data-message-id','data-message-author-role']}); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserve, {once:true});
  else startObserve();

  // quick initial populate
  setTimeout(rebuild, 800);
  // manual refresh
  refreshBtn.addEventListener('click', rebuild);
  filterEl.addEventListener('input', rebuild);
  chkUser.addEventListener('change', rebuild);
  chkAssistant.addEventListener('change', rebuild);

  // cleanup on unload
  window.addEventListener('beforeunload', ()=>{ try{obs.disconnect();}catch{} });

  // ===== Auto Idle & Settings integration (reuses export helpers) =====
  ;(function(){
  // Rolling snapshot for export fallback
  window.__CGPT_LAST_SNAPSHOT__ = null;

    const KEY = 'cgpt-settings-v1';
    const DEFAULTS = { autoEnabled: true, onClose: true, onBlurHidden: true, blurHiddenDelaySec: 60, onIdle: false, idleSec: 120, formats: ['html'] };
    function nowISO(){ try{ return new Date().toISOString(); } catch{ return ''; } }
    function loadSettings(){
      return new Promise(resolve=>{
        try {
          chrome.storage.sync.get(KEY, (res)=>{
            const v = (res && res[KEY]) ? res[KEY] : DEFAULTS;
            v.blurHiddenDelaySec = Math.min(600, Math.max(1, Number(v.blurHiddenDelaySec||60)));
            v.idleSec = Math.min(7200, Math.max(10, Number(v.idleSec||120)));
            if (!Array.isArray(v.formats) || v.formats.length === 0) v.formats = ['html'];
            resolve(v);
          });
        } catch(e) { resolve(DEFAULTS); }
      });
    }
    let cleanupFns = [];
    let exportedOnce = false;

    function installAuto(v){
      cleanupFns.forEach(fn=>{ try{fn();}catch{} });
      cleanupFns = [];
      exportedOnce = false;
      if (!v || !v.autoEnabled) return;

      function doExport(reason){
        // Decide whether we have something to export
        const probeNodes = (function(){ try{ return getMessageNodes(); }catch(e){ return []; } })();
        const hasSnap = !!(window.__CGPT_LAST_SNAPSHOT__ && Array.isArray(window.__CGPT_LAST_SNAPSHOT__.messages) && window.__CGPT_LAST_SNAPSHOT__.messages.length);
        if (!probeNodes.length && !hasSnap) {
          // Nothing to export; don't consume the one-shot guard
          try { console.warn('[cgpt-index] Skip export (no messages found)'); } catch(e){}
          return;
        }
        if (exportedOnce) return;
        const base = baseFileName();
        const wants = Array.isArray(v.formats) ? v.formats.slice() : ['html'];
        let saved = false;
        try {
          if (wants.includes('html')) exportHTML();
          if (wants.includes('md'))   exportMarkdown();
          if (wants.includes('json')) exportJSON();
        } catch(e){}
        if (saved) exportedOnce = true;
      }

      // Close
      if (v.onClose) {
        const onUnload = () => doExport('close');
        window.addEventListener('pagehide', onUnload);
        window.addEventListener('beforeunload', onUnload);
        cleanupFns.push(()=>{ window.removeEventListener('pagehide', onUnload); window.removeEventListener('beforeunload', onUnload); });
      }
      // Blur & Hidden (AND)
      if (v.onBlurHidden) {
        let blurred = false, hidden = document.hidden;
        let timer = null;
        const arm = () => { if (blurred && hidden && !timer) { timer = setTimeout(()=>{ timer=null; doExport('blurhidden'); }, Math.max(1, v.blurHiddenDelaySec)*1000); } };
        const disarm = () => { if (timer) { clearTimeout(timer); timer=null; } };
        const onBlur = () => { blurred = true; arm(); };
        const onFocus = () => { blurred = false; disarm(); };
        const onVis = () => { hidden = document.hidden; if (!hidden) disarm(); else arm(); };
        window.addEventListener('blur', onBlur);
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVis);
        cleanupFns.push(()=>{ window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVis); if (timer) clearTimeout(timer); });
      }
      // Idle
      if (v.onIdle) {
        let idleTimer = null;
        const reset = () => { if (idleTimer) clearTimeout(idleTimer); idleTimer = setTimeout(()=>{ doExport('idle'); }, Math.max(10, v.idleSec)*1000); };
        const evs = ['mousemove','keydown','click','scroll','touchstart','pointerdown','wheel'];
        evs.forEach(ev=>window.addEventListener(ev, reset, {passive:true}));
        reset();
        cleanupFns.push(()=>{ if (idleTimer) clearTimeout(idleTimer); evs.forEach(ev=>window.removeEventListener(ev, reset)); });
      }
    }

    loadSettings().then(installAuto);
    try {
      chrome.storage.onChanged.addListener((changes, area)=>{
        if (area === 'sync' && changes && changes[KEY]) {
          const v = changes[KEY].newValue || DEFAULTS;
          installAuto(v);
        }
      });
    } catch {}
  })();

})();
