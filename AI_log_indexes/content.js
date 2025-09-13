(() => {
  if (window.__CGPT_INDEX_INSTALLED__) return;
  window.__CGPT_INDEX_INSTALLED__ = true;

  const PANEL_ID = "cgpt-index-panel";
  const FAB_ID = "cgpt-index-fab";
  const STORAGE_KEY_WIDTH = "cgpt-index-width";
  const STORAGE_KEY_VIS = "cgpt-index-visible";
  const TIMES_KEY_PREFIX = "cgpt-index-times:v1:";
  const AUTO_KEY = "cgpt-autoexport-enabled"; // 'on'|'off'

  // ===== Auto-export setting (default: on) =====
  let AUTO_EXPORT_ON_CLOSE = true;
  try {
    const val = localStorage.getItem(AUTO_KEY);
    if (val === 'off') AUTO_EXPORT_ON_CLOSE = false;
  } catch {}

  // Initial snapshot (so SW knows auto flag)
  try { chrome.runtime.sendMessage({ type: 'SNAPSHOT', data: { meta:{}, messages:[] }, auto: AUTO_EXPORT_ON_CLOSE }); } catch {}

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
  + '  <label class="cgpt-index-chk" title="タブ/ウィンドウを閉じる直前にHTMLを自動保存">'
  + '    <input type="checkbox" id="cgpt-autoexport" ' + (AUTO_EXPORT_ON_CLOSE ? 'checked' : '') + '> Auto HTML'
  + '  </label>'
  + '</div>';
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
  const autoChk = panel.querySelector('#cgpt-autoexport');

  // ===== Times =====
  const timesKey = () => TIMES_KEY_PREFIX + (location.origin + location.pathname);
  let TIMES = {};
  try { TIMES = JSON.parse(localStorage.getItem(timesKey()) || "{}"); } catch { TIMES = {}; }
  const saveTimes = (() => { let t=null; return ()=>{ clearTimeout(t); t=setTimeout(()=>{ try{localStorage.setItem(timesKey(), JSON.stringify(TIMES));}catch{} },300); };})();
  const ensureTime = (key) => { if(!TIMES[key]){ TIMES[key]=new Date().toISOString(); saveTimes(); } return TIMES[key]; };

  // ===== State restore =====
  function openPanel(){ panel.classList.remove('cgpt-index-hidden'); document.documentElement.classList.add('cgpt-index-open'); setPageOffsetByPanelWidth(); try{localStorage.setItem(STORAGE_KEY_VIS,'visible');}catch{} }
  function closePanel(){ panel.classList.add('cgpt-index-hidden'); document.documentElement.classList.remove('cgpt-index-open'); try{localStorage.setItem(STORAGE_KEY_VIS,'hidden');}catch{} }
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
        const key= mid?('mid:'+mid):('len:'+container.outerHTML.length+':'+container.innerText.length);
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
      if(!el.id) el.id = 'cgpt-msg-' + (i+1);
      const mid = el.getAttribute('data-message-id')||el.dataset.messageId||null;
      const key = mid?('mid:'+mid):el.id;
      const ts = ensureTime(key);
      const text = normalizeText(el);
      return { index:i+1, id:el.id, key, mid, role:roleOf(el), text:text, head: headLine(text), time:ts, el };
    });
  }

  function buildIndex(){
    cachedMessages = collectMessages();
    listEl.innerHTML='';
    for(const m of cachedMessages){
      const li=document.createElement('li');
      li.className='cgpt-index-item';
      li.dataset.target=m.id; li.dataset.role=m.role;
      li.innerHTML = '<button class="cgpt-index-link" title="メッセージへ移動"><span class="cgpt-index-role ' + (m.role==='user'?'is-user':'is-ai') + '">' + (m.role==='user'?'User':'AI') + '</span><span class="cgpt-index-snippet">' + escapeHtml(m.head) + '</span></button>';
      listEl.appendChild(li);
    }
    applyFilter();
    queueSnapshot();
  }

  function escapeHtml(s){ return s.replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  function applyFilter(){
    const kw=filterEl.value.trim().toLowerCase();
    const showUser=chkUser.checked, showAssistant=chkAssistant.checked;
    listEl.querySelectorAll('.cgpt-index-item').forEach(li=>{
      const role=li.dataset.role;
      const snip=(li.querySelector('.cgpt-index-snippet')?.textContent||'').toLowerCase();
      const roleOK=(role==='user'&&showUser)||(role==='assistant'&&showAssistant)||(!['user','assistant'].includes(role));
      const textOK=!kw||snip.includes(kw);
      li.style.display=(roleOK&&textOK)?'':'none';
    });
    queueSnapshot();
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
  btnHTML.addEventListener('click', () => downloadHTMLNow());

  window.addEventListener('keydown', e=>{ if(e.altKey && (e.key==='i'||e.key==='I')) togglePanel(); });
  fab.addEventListener('click', togglePanel);

  // Auto-export toggle
  autoChk.addEventListener('change', () => {
    AUTO_EXPORT_ON_CLOSE = autoChk.checked;
    try { localStorage.setItem(AUTO_KEY, AUTO_EXPORT_ON_CLOSE ? 'on' : 'off'); } catch {}
    try { chrome.runtime.sendMessage({ type: 'SNAPSHOT', data: buildData(false), auto: AUTO_EXPORT_ON_CLOSE }); } catch {}
  });

  // Resizer
  (()=>{
    let dragging=false, startX=0, startWidth=0;
    const minW=260, maxW=Math.min(window.innerWidth*0.7,760);
    const move=(e)=>{ if(!dragging) return; const dx=startX-e.clientX; let w=Math.min(Math.max(startWidth+dx,minW),maxW); panel.style.width=w+'px'; setPageOffsetByPanelWidth(); };
    const up=()=>{ if(!dragging) return; dragging=false; document.removeEventListener('mousemove',move); document.removeEventListener('mouseup',up); try{localStorage.setItem(STORAGE_KEY_WIDTH, panel.style.width);}catch{}; queueSnapshot(); };
    resizer.addEventListener('mousedown', e=>{ dragging=true; startX=e.clientX; startWidth=panel.getBoundingClientRect().width; document.addEventListener('mousemove',move); document.addEventListener('mouseup',up); });
  })();

  // Auto rebuild on DOM changes
  const rebuild = (()=>{ let t=null; return ()=>{ clearTimeout(t); t=setTimeout(buildIndex, 400); }; })();
  const obs = new MutationObserver(mut=>{ for(const m of mut){ if(m.type==='childList'||m.type==='attributes'){ rebuild(); break; } } });
  obs.observe(document.body, {subtree:true, childList:true, attributes:false});
  setTimeout(buildIndex, 800);

  // ===== Export helpers =====
  function currentPageMeta(){ const url=location.href; const title=document.title||'ChatGPT Conversation'; const now=new Date().toISOString(); return {url:url,title:title,exported_at:now,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone}; }
  function filteredMessages(){ const kw=filterEl.value.trim().toLowerCase(); const showUser=chkUser.checked, showAssistant=chkAssistant.checked; return (cachedMessages.length?cachedMessages:collectMessages()).filter(m=>{ const roleOK=(m.role==='user'&&showUser)||(m.role==='assistant'&&showAssistant)||(!['user','assistant'].includes(m.role)); const textOK=!kw||m.text.toLowerCase().includes(kw); return roleOK&&textOK; }); }
  function buildData(){ const meta=currentPageMeta(), msgs=filteredMessages(); return { meta: meta, messages: msgs.map(({index,id,mid,role,text,time})=>({ index:index, id:id, message_id:mid, role:role, text:text, time:time })) }; }

  function exportJSON(){
    const data=buildData();
    downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}), 'chatgpt_export_' + timestampForFile() + '.json');
  }
  function mdEscape(s){ return s.replace(/^#/gm,'\\#'); }
  function exportMarkdown(){
    const data=buildData(), meta=data.meta, msgs=data.messages;
    let md='# ChatGPT Conversation Export\\n\\n- Title: ' + meta.title + '\\n- URL: ' + meta.url + '\\n- Exported: ' + meta.exported_at + ' (' + meta.timezone + ')\\n\\n---\\n\\n';
    for(const m of msgs){ const roleTag=m.role==='user'?'User':(m.role==='assistant'?'AI':(m.role||'Unknown')); md+='### ' + roleTag + '  \\\\n*Time:* ' + m.time + '\\n\\n' + mdEscape(m.text) + '\\n\\n---\\n\\n'; }
    downloadBlob(new Blob([md],{type:'text/markdown;charset=utf-8'}), 'chatgpt_export_' + timestampForFile() + '.md');
  }

  function timestampForFile(){ return new Date().toISOString().replace(/[:.]/g,'-'); }
  function downloadBlob(blob, filename){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),4000); }

  function downloadHTMLNow(){
    const name = 'chatgpt_export_' + timestampForFile() + '.html';
    try {
      const data = buildData();
      // Unify with SW builder (same HTML as auto-export)
      chrome.runtime.sendMessage({ type: 'SNAPSHOT', data: data, auto: AUTO_EXPORT_ON_CLOSE }, function(){
        try { chrome.runtime.sendMessage({ type: 'SAVE_HTML_FROM_DATA', data: data, filename: name }, () => {}); } catch {}
      });
    } catch (e) {
      // Fallback: JSON-only page if messaging fails
      const html = '<!doctype html><meta charset="utf-8"><title>Export</title><body><pre>'+escapeHtml(JSON.stringify(buildData(),null,2))+'</pre></body>';
      downloadBlob(new Blob([html], {type:'text/html;charset=utf-8'}), name);
    }
  }

  // ===== Snapshot pipeline for stable auto export =====
  const queueSnapshot = (()=>{
    let t=null, lastSent=0;
    return function(){
      clearTimeout(t);
      t=setTimeout(()=>{
        const now=Date.now();
        if (now - lastSent < 3000) return; // throttle 3s
        lastSent = now;
        try { chrome.runtime.sendMessage({ type: 'SNAPSHOT', data: buildData(), auto: AUTO_EXPORT_ON_CLOSE }); } catch {}
      }, 600);
    };
  })();

  // Also snapshot on key user interactions
  ['click','keydown','scroll','pointerdown','touchstart','wheel'].forEach(ev=>{
    window.addEventListener(ev, ()=> queueSnapshot(), { passive:true });
  });

  // initial snapshot after load
  setTimeout(queueSnapshot, 1200);

  // Cleanup
  window.addEventListener('beforeunload', ()=>{ try{obs.disconnect();}catch{}; queueSnapshot(); });
})();