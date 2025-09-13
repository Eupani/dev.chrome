(() => {
  if (window.__CGPT_INDEX_INSTALLED__) return;
  window.__CGPT_INDEX_INSTALLED__ = true;

  const PANEL_ID = "cgpt-index-panel";
  const FAB_ID = "cgpt-index-fab";
  const STORAGE_KEY_WIDTH = "cgpt-index-width";
  const STORAGE_KEY_VIS = "cgpt-index-visible";
  const TIMES_KEY_PREFIX = "cgpt-index-times:v1:";

  const SELECTORS = [
    '[data-message-author-role][data-message-id]',
    '[data-message-author-role]',
    'div[data-testid^="conversation-turn-"]',
    'main [role="listitem"]',
    'article[data-message-author-role]',
  ];

  // ===== Panel =====
  const panel = document.createElement('aside');
  panel.id = PANEL_ID;
  panel.setAttribute('aria-label', 'ChatGPT Conversation Index');
  panel.innerHTML = `
    <div class="cgpt-index-header">
      <div class="cgpt-index-title-row">
        <div class="cgpt-index-title">会話インデックス</div>
        <button id="cgpt-index-refresh" class="cgpt-btn" title="一覧を更新">⟳ 更新</button>
      </div>
      <div class="cgpt-index-actions">
        <input id="cgpt-index-filter" type="search" placeholder="フィルタ…" aria-label="フィルタ" />
        <label class="cgpt-index-chk"><input type="checkbox" id="cgpt-chk-user" checked> User</label>
        <label class="cgpt-index-chk"><input type="checkbox" id="cgpt-chk-assistant" checked> AI</label>
      </div>
      <div class="cgpt-index-sub">クリックで該当へ移動 / Alt+I で表示切替</div>
    </div>
    <div class="cgpt-index-resizer" title="ドラッグで幅を変更"></div>
    <ul id="cgpt-index-list" class="cgpt-index-list" aria-label="メッセージ一覧"></ul>
    <div class="cgpt-index-footer">
      <button id="cgpt-btn-md" class="cgpt-btn-primary" title="Markdownにエクスポート">Markdown</button>
      <button id="cgpt-btn-json" class="cgpt-btn" title="JSONにエクスポート">JSON</button>
      <button id="cgpt-btn-html" class="cgpt-btn" title="HTMLにエクスポート">HTML</button>
      <div class="cgpt-footer-spacer"></div>
    </div>
  `;
  document.documentElement.appendChild(panel);

  // ===== FAB =====
  const fab = document.createElement('button');
  fab.id = FAB_ID;
  fab.setAttribute('aria-label', '会話インデックスの表示切替');
  fab.title = '会話インデックスの表示切替 (Alt+I)';
  fab.innerHTML = '<span class="cgpt-fab-dot" aria-hidden="true"></span>';
  document.documentElement.appendChild(fab);

  const listEl = panel.querySelector('#cgpt-index-list');
  const filterEl = panel.querySelector('#cgpt-index-filter');
  const refreshBtn = panel.querySelector('#cgpt-index-refresh');
  const chkUser = panel.querySelector('#cgpt-chk-user');
  const chkAssistant = panel.querySelector('#cgpt-chk-assistant');
  const btnMD = panel.querySelector('#cgpt-btn-md');
  const btnJSON = panel.querySelector('#cgpt-btn-json');
  const btnHTML = panel.querySelector('#cgpt-btn-html');
  const resizer = panel.querySelector('.cgpt-index-resizer');

  // ===== Times =====
  const timesKey = () => TIMES_KEY_PREFIX + (location.origin + location.pathname);
  let TIMES = {};
  try { TIMES = JSON.parse(localStorage.getItem(timesKey()) || "{}"); } catch { TIMES = {}; }
  const saveTimes = (() => { let t=null; return ()=>{ clearTimeout(t); t=setTimeout(()=>{ try{localStorage.setItem(timesKey(), JSON.stringify(TIMES));}catch{} },300); };})();
  const ensureTime = (key) => { if(!TIMES[key]){ TIMES[key]=new Date().toISOString(); saveTimes(); } return TIMES[key]; };

  // ===== State restore =====
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
  function openPanel(){ panel.classList.remove('cgpt-index-hidden'); document.documentElement.classList.add('cgpt-index-open'); setPageOffsetByPanelWidth(); try{localStorage.setItem(STORAGE_KEY_VIS,'visible');}catch{} }
  function closePanel(){ panel.classList.add('cgpt-index-hidden'); document.documentElement.classList.remove('cgpt-index-open'); try{localStorage.setItem(STORAGE_KEY_VIS,'hidden');}catch{} }
  function togglePanel(){ panel.classList.contains('cgpt-index-hidden') ? openPanel() : closePanel(); }

  function normalizeText(el){ return (el.innerText||'').replace(/\s+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim(); }
  function roleOf(el){ const r=el.getAttribute('data-message-author-role'); if(r) return r; const t=(el.innerText||'').slice(0,12); return t.startsWith('You')?'user':'assistant'; }

  function getMessageNodes(){
    const seen=new Set(); const nodes=[];
    for(const sel of SELECTORS){
      document.querySelectorAll(sel).forEach(el=>{
        if(!(el instanceof Element)) return;
        if(el.closest('#'+PANEL_ID)) return;
        const text=(el.innerText||'').trim(); if(!text) return;
        let container=el;
        if(!container.hasAttribute('data-message-author-role')){
          const p=el.closest('[data-message-author-role]'); if(p) container=p;
        }
        const mid=container.getAttribute('data-message-id')||container.dataset.messageId||(container.id||'');
        const key= mid?`mid:${mid}`:`len:${container.outerHTML.length}:${container.innerText.length}`;
        if(seen.has(key)) return; seen.add(key);
        nodes.push(container);
      });
      if(nodes.length) break;
    }
    return nodes;
  }

  function headLine(text){
    const t=(text||'').replace(/\s+/g,' ').trim();
    if(!t) return '(empty)';
    const m=t.match(/^(.{1,120}?)([。．.!?？]|$)/);
    return (m&&m[1])?m[1]:t.slice(0,120);
  }

  let cachedMessages = [];
  function collectMessages(){
    const nodes = getMessageNodes();
    return nodes.map((el,i)=>{
      if(!el.id) el.id = `cgpt-msg-${i+1}`;
      const mid = el.getAttribute('data-message-id')||el.dataset.messageId||null;
      const key = mid?`mid:${mid}`:el.id;
      const ts = ensureTime(key);
      return { index:i+1, id:el.id, key, mid, role:roleOf(el), text:normalizeText(el), head: headLine(normalizeText(el)), time:ts, el };
    });
  }

  function buildIndex(){
    cachedMessages = collectMessages();
    listEl.innerHTML='';
    for(const m of cachedMessages){
      const li=document.createElement('li');
      li.className='cgpt-index-item';
      li.dataset.target=m.id; li.dataset.role=m.role;
      li.innerHTML = `<button class="cgpt-index-link" title="メッセージへ移動"><span class="cgpt-index-role ${m.role==='user'?'is-user':'is-ai'}">${m.role==='user'?'User':'AI'}</span><span class="cgpt-index-snippet">${escapeHtml(m.head)}</span></button>`;
      listEl.appendChild(li);
    }
    applyFilter();
  }

  function escapeHtml(s){ return s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function applyFilter(){
    const kw=filterEl.value.trim().toLowerCase();
    const showUser=chkUser.checked, showAssistant=chkAssistant.checked;
    listEl.querySelectorAll('.cgpt-index-item').forEach(li=>{
      const role=li.dataset.role;
      const snip=li.querySelector('.cgpt-index-snippet')?.textContent?.toLowerCase()||'';
      const roleOK=(role==='user'&&showUser)||(role==='assistant'&&showAssistant)||(!['user','assistant'].includes(role));
      const textOK=!kw||snip.includes(kw);
      li.style.display=(roleOK&&textOK)?'':'none';
    });
  }

  // Events
  listEl.addEventListener('click', e=>{
    const btn=e.target.closest('.cgpt-index-link'); if(!btn) return;
    const li=btn.closest('.cgpt-index-item'); const id=li?.dataset.target; if(!id) return;
    const target=document.getElementById(id); if(!target) return;
    target.scrollIntoView({behavior:'smooth', block:'start'});
    target.classList.add('cgpt-index-highlight'); setTimeout(()=>target.classList.remove('cgpt-index-highlight'),1400);
  });
  filterEl.addEventListener('input', applyFilter);
  chkUser.addEventListener('change', applyFilter);
  chkAssistant.addEventListener('change', applyFilter);
  refreshBtn.addEventListener('click', buildIndex);
  btnJSON.addEventListener('click', () => exportJSON());
  btnMD.addEventListener('click', () => exportMarkdown());
  btnHTML.addEventListener('click', () => exportHTMLInteractive());

  window.addEventListener('keydown', e=>{ if(e.altKey && (e.key==='i'||e.key==='I')) togglePanel(); });
  fab.addEventListener('click', togglePanel);

  // Resizer
  (()=>{
    let dragging=false, startX=0, startWidth=0;
    const minW=260, maxW=Math.min(window.innerWidth*0.7,760);
    const move=(e)=>{ if(!dragging) return; const dx=startX-e.clientX; let w=Math.min(Math.max(startWidth+dx,minW),maxW); panel.style.width=w+'px'; setPageOffsetByPanelWidth(); };
    const up=()=>{ if(!dragging) return; dragging=false; document.removeEventListener('mousemove',move); document.removeEventListener('mouseup',up); try{localStorage.setItem(STORAGE_KEY_WIDTH, panel.style.width);}catch{} };
    resizer.addEventListener('mousedown', e=>{ dragging=true; startX=e.clientX; startWidth=panel.getBoundingClientRect().width; document.addEventListener('mousemove',move); document.addEventListener('mouseup',up); });
  })();

  // Auto rebuild on DOM changes
  const rebuild = (()=>{ let t=null; return ()=>{ clearTimeout(t); t=setTimeout(buildIndex, 400); }; })();
  const obs = new MutationObserver(mut=>{ for(const m of mut){ if(m.type==='childList'||m.type==='attributes'){ rebuild(); break; } } });
  obs.observe(document.body, {subtree:true, childList:true, attributes:false});
  setTimeout(buildIndex, 800);

  // ===== Export helpers =====
  function currentPageMeta(){ const url=location.href; const title=document.title||'ChatGPT Conversation'; const now=new Date().toISOString(); return {url,title,exported_at:now,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone}; }
  function filteredMessages(){ const kw=filterEl.value.trim().toLowerCase(); const showUser=chkUser.checked, showAssistant=chkAssistant.checked; return cachedMessages.filter(m=>{ const roleOK=(m.role==='user'&&showUser)||(m.role==='assistant'&&showAssistant)||(!['user','assistant'].includes(m.role)); const textOK=!kw||m.text.toLowerCase().includes(kw); return roleOK&&textOK; }); }

  function exportJSON(){
    const data={ meta: currentPageMeta(), messages: filteredMessages().map(({index,id,mid,role,text,time})=>({index,id,message_id:mid,role,text,time})) };
    downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}), `chatgpt_export_${timestampForFile()}.json`);
  }
  function mdEscape(s){ return s.replace(/^#/gm,'\\#'); }
  function exportMarkdown(){
    const meta=currentPageMeta(), msgs=filteredMessages();
    let md=`# ChatGPT Conversation Export\n\n- Title: ${meta.title}\n- URL: ${meta.url}\n- Exported: ${meta.exported_at} (${meta.timezone})\n\n---\n\n`;
    for(const m of msgs){ const roleTag=m.role==='user'?'User':(m.role==='assistant'?'AI':(m.role||'Unknown')); md+=`### ${roleTag}  \\\n*Time:* ${m.time}\n\n${mdEscape(m.text)}\n\n---\n\n`; }
    downloadBlob(new Blob([md],{type:'text/markdown;charset=utf-8'}), `chatgpt_export_${timestampForFile()}.md`);
  }

  // ==== Export HTML: interactive bubble layout with sidebar index ====
  function exportHTMLInteractive(){
    const meta=currentPageMeta(), msgs=filteredMessages();
    const data = { meta, messages: msgs };

    // JSONを<script type=application/json>に埋め込むためのエスケープ
    const escJSON = (s) => s.replace(/[&<>]/g, (c)=> c==='&'?'&amp;':(c==='<')?'&lt;':'&gt;').replace(/<\/script/gi,'<\\/script');

    // ===== ここからはテンプレート（内側scriptはバッククォートを一切使わない） =====
    const pageHtml = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${meta.title.replace(/[&<>]/g, (c)=> c==='&'?'&amp;':(c==='<')?'&lt;':'&gt;')} - Export</title>
<style>
  :root{
    --bg:#0b1020; --fg:#e5e7eb; --sub:#9ca3af; --border:rgba(255,255,255,.08);
    --card:#0f172a; --ai:#1f2937; --user:#1e3a8a; --bubble:#111827;
    --panel:#0f172a; --accent:#3b82f6;
  }
  @media (prefers-color-scheme: light){
    :root{ --bg:#f8fafc; --fg:#111827; --sub:#6b7280; --border:rgba(0,0,0,.08);
           --card:#ffffff; --ai:#374151; --user:#1d4ed8; --bubble:#ffffff; --panel:#ffffff; --accent:#2563eb; }
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans JP","Hiragino Kaku Gothic ProN","Meiryo",sans-serif;}
  .wrap{display:grid; grid-template-columns: 1fr 340px; gap: 12px; max-width:1200px; margin: 20px auto; padding: 0 12px;}
  @media (max-width: 960px){ .wrap{grid-template-columns:1fr;} .panel{order:-1; position:static; height:auto;} }
  header{grid-column: 1 / -1; margin-bottom:2px}
  header h1{margin:0 0 6px; font-size:20px; font-weight:700}
  header .meta{font-size:12px; color:var(--sub)}
  .chat{}
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
  .anchor{position:relative; top:-8px}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>ChatGPT Conversation Export</h1>
    <div class="meta">Title: ${meta.title.replace(/[&<>]/g, (c)=> c==='&'?'&amp;':(c==='<')?'&lt;':'&gt;')}<br>URL: <a href="${meta.url.replace(/[&<>]/g, (c)=> c==='&'?'&amp;':(c==='<')?'&lt;':'&gt;')}">${meta.url.replace(/[&<>]/g, (c)=> c==='&'?'&amp;':(c==='<')?'&lt;':'&gt;')}</a><br>Exported: ${meta.exported_at} (${meta.timezone})</div>
  </header>

  <main class="chat" id="chat"></main>

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

<script id="data" type="application/json">${escJSON(JSON.stringify(data))}</script>
<script>
  var DATA = JSON.parse(document.getElementById('data').textContent);
  var chat = document.getElementById('chat');
  var list = document.getElementById('list');
  var inF = document.getElementById('f');
  var cbU = document.getElementById('u');
  var cbA = document.getElementById('a');

  function esc(s){ return s.replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function headLine(text){
    var t=(text||'').replace(/\\s+/g,' ').trim();
    if(!t) return '(empty)';
    var m=t.match(/^(.{1,120}?)([。．.!?？]|$)/);
    return (m&&m[1])?m[1]:t.slice(0,120);
  }

  function renderBody(text){
    // FENCE =  (backtick x3), but avoid typing backticks to keep outer template literal safe
    var FENCE = String.fromCharCode(96,96,96);
    var parts = text.split(FENCE);
    var out = '';
    for (var i=0;i<parts.length;i++){
      if (i % 2 === 1) {
        var seg = parts[i];
        var nl = seg.indexOf('\\n');
        var lang = '', body = seg;
        if (nl !== -1) { lang = seg.slice(0, nl).trim(); body = seg.slice(nl+1); }
        out += '<pre><code>' + esc(body) + '</code></pre>';
      } else {
        var para = esc(parts[i]).replace(/\\n\\n+/g,'</p><p>').replace(/\\n/g,'<br>');
        if (i === 0 && para.indexOf('<p>') !== 0) out += '<p>';
        out += para;
      }
    }
    if (out.slice(-4) !== '</p>') out += '</p>';
    return out;
  }

  function build(){
    chat.innerHTML='';
    list.innerHTML='';
    var kw = inF.value.trim().toLowerCase();
    var showU = cbU.checked, showA = cbA.checked;
    var msgs = DATA.messages.filter(function(m){
      var roleOK = (m.role==='user'&&showU) || (m.role==='assistant'&&showA) || (!['user','assistant'].includes(m.role));
      var textOK = !kw || (m.text||'').toLowerCase().includes(kw);
      return roleOK && textOK;
    });
    for (var i=0;i<msgs.length;i++){
      var m = msgs[i];
      var row = document.createElement('section');
      row.className = 'row ' + (m.role==='user'?'user':'ai');
      row.id = m.id;
      row.innerHTML = '<div class="bubble"><div class="meta"><span class="badge">' + (m.role==='user'?'User':'AI') + '</span><span class="time">' + m.time + '</span></div><div class="content">' + renderBody(m.text) + '</div></div>';
      chat.appendChild(row);

      var li = document.createElement('li');
      li.className='item';
      li.innerHTML = '<button class="link"><span class="rolepill '+(m.role==='user'?'is-user':'')+'">'+(m.role==='user'?'User':'AI')+'</span><span class="head">'+esc(headLine(m.text))+'</span></button>';
      li.querySelector('.link').addEventListener('click', function(targetId){
        return function(){ var el = document.getElementById(targetId); if (el) el.scrollIntoView({behavior:'smooth', block:'start'}); };
      }(m.id));
      list.appendChild(li);
    }
  }
  inF.addEventListener('input', build);
  cbU.addEventListener('change', build);
  cbA.addEventListener('change', build);
  build();

  function timestamp(){ return new Date().toISOString().replace(/[:.]/g,'-'); }
  function dl(blob, name){ var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(function(){URL.revokeObjectURL(a.href);}, 3000); }

  document.getElementById('dljson').addEventListener('click', function () {
    var payload = JSON.stringify(DATA, null, 2);
    dl(new Blob([payload], {type:'application/json'}), 'chatgpt_export_'+timestamp()+'.json');
  });
  document.getElementById('dlmd').addEventListener('click', function () {
    var meta = DATA.meta;
    var msgs = DATA.messages;
    var md = '# ChatGPT Conversation Export\\n\\n' +
      '- Title: ' + meta.title + '\\n' +
      '- URL: ' + meta.url + '\\n' +
      '- Exported: ' + meta.exported_at + ' (' + meta.timezone + ')\\n\\n---\\n\\n';
    for (var i=0;i<msgs.length;i++){
      var m = msgs[i];
      var role = m.role==='user'?'User':(m.role==='assistant'?'AI':(m.role||'Unknown'));
      md += '### ' + role + '  \\\\n*Time:* ' + m.time + '\\n\\n' + m.text.replace(/^#/gm, '\\\\#') + '\\n\\n---\\n\\n';
    }
    dl(new Blob([md], {type:'text/markdown;charset=utf-8'}), 'chatgpt_export_'+timestamp()+'.md');
  });
</script>
</body></html>`;

    downloadBlob(new Blob([pageHtml], {type:'text/html;charset=utf-8'}), `chatgpt_export_${timestampForFile()}.html`);
  }

  function timestampForFile(){ return new Date().toISOString().replace(/[:.]/g,'-'); }
  function downloadBlob(blob, filename){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),4000); }

  // Cleanup
  window.addEventListener('beforeunload', ()=>{ try{obs.disconnect();}catch{} });
})();