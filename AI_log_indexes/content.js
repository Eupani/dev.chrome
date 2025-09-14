
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

  const style = document.createElement('style');
  style.id = 'cgpt-index-style';
  style.textContent = `
    :root { --cgpt-index-width: 320px; }
    /* パネルは常に画面内（右固定）。max-width を 100vw 基準でクランプ */
    #${PANEL_ID} {
      position: fixed;
      top: 0;
      right: 0;
      height: 100vh;
      width: var(--cgpt-index-width);
      max-width: calc(100vw - 24px); /* 画面から24pxはみ出さない */
      min-width: 220px;
      box-sizing: border-box;
      z-index: 2147483647;
      overflow: auto;

      /* （任意の見た目・枠線。既存テーマがあるなら削ってOK） */
      background: rgba(17, 24, 39, .96);
      border-left: 1px solid rgba(255,255,255,.08);
      backdrop-filter: blur(6px);
    }

    /* FAB とプレビューバブルも安全に最前面へ */
    #${FAB_ID} { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; }
    #cgpt-index-bubble { position: absolute; z-index: 2147483647; }

    /* パネルを非表示にするとき */
    .cgpt-index-hidden { display: none !important; }
  `;
  document.documentElement.appendChild(style);

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
  function openPanel(){
    panel.classList.remove('cgpt-index-hidden');
    document.documentElement.classList.add('cgpt-index-open');
    setPageOffsetByPanelWidth();
    try{localStorage.setItem(STORAGE_KEY_VIS,'visible');}catch{}
    clampPanelWidthToViewport();               // ★ 追加：開くたびにクランプ
  }
  function closePanel(){ panel.classList.add('cgpt-index-hidden'); document.documentElement.classList.remove('cgpt-index-open'); setPageOffsetByPanelWidth(); try{localStorage.setItem(STORAGE_KEY_VIS,'hidden');}catch{} }
  function togglePanel(){ panel.classList.contains('cgpt-index-hidden') ? openPanel() : closePanel(); }
  try {
    const savedW = localStorage.getItem(STORAGE_KEY_WIDTH);
    if (savedW) panel.style.width = savedW;
    const vis = localStorage.getItem(STORAGE_KEY_VIS);
    if (vis !== 'hidden') openPanel(); else closePanel();
  } catch { openPanel(); }
  clampPanelWidthToViewport();

  // ===== Utils =====
  function clampPanelWidthToViewport() {
    const SAFE_MARGIN = 24;                     // 画面左右の安全マージン
    const vw = Math.max(320, window.innerWidth || document.documentElement.clientWidth || 0);
    const minW = Math.min(280, Math.max(220, vw - SAFE_MARGIN * 2)); // 画面が狭い時は最小幅も縮む
    const hardMax = Math.max(minW, Math.floor(vw * 0.6));            // 通常の上限
    const cssMax = vw - SAFE_MARGIN;                                 // CSS上の絶対上限（= calc(100vw - 24px) と一致させる）
    const maxW = Math.min(hardMax, cssMax);

    const cur = panel.getBoundingClientRect().width || minW;
    const clamped = Math.max(minW, Math.min(cur, maxW));

    // style.maxWidth / minWidth も同期（ローカル保存の幅が暴れても守る）
    panel.style.minWidth = minW + 'px';
    panel.style.maxWidth = cssMax + 'px';
    panel.style.width = clamped + 'px';

    // 変数は見た目調整用。横スクロールは発生しない（fixedなため）
    document.documentElement.style.setProperty('--cgpt-index-width', clamped + 'px');
  }
  window.addEventListener('resize', clampPanelWidthToViewport, {passive:true});
  clampPanelWidthToViewport();

  function setPageOffsetByPanelWidth() {
    const w = panel.getBoundingClientRect().width;
    document.documentElement.style.setProperty('--cgpt-index-width', w + 'px');
  }
  
  function normalizeText(el){
    return (el.innerText || el.textContent || '').replace(/\r\n?/g, '\n');
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
    for (const el of nodes){
      const role = roleOf(el);
      const text = normalizeText(el);        // ← 改行を保持した本文
      if (role==='user' && !chkUser.checked) continue;
      if (role!=='user' && !chkAssistant.checked) continue;

      const line = firstLine(text);          // ← 見出しは1行化だけ
      const id   = el.getAttribute('data-message-id') || el.id || '';
      const iso  = seenISO(el);
      const when = fmtLocal(iso);

      lines.push({ el, role, line, id, text, time: when, timeISO: iso });
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
      text: String(x.text || x.line || ''),   // ← normalizeText の raw が入る
      time: x.time || ''
    }));
  }

  // ===== Preview Bubble (吹き出し) =====
  const bubble = document.createElement('div');
  bubble.id = 'cgpt-index-bubble';
  bubble.setAttribute('role','tooltip');
  bubble.className = 'cgpt-index-bubble';
  bubble.style.whiteSpace   = 'pre-wrap';   // 改行保持＋折返し
  bubble.style.wordBreak    = 'break-word'; // 長い単語も折返し
  bubble.style.overflowWrap = 'anywhere';   // 連続英字/URLも安全に折返し
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
    const text = (li && li.dataset && (li.dataset.full || li.dataset.full === ''))
      ? li.dataset.full
      : (li ? (li.getAttribute('title') || li.textContent || '') : '');
    if (!text) return;

    if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer=null; }
    bubble.textContent = text;
    bubble.style.visibility = 'hidden';
    bubble.style.display = 'block';

    const rect = li.getBoundingClientRect();
    const margin = 16;
    const vw = window.innerWidth;
    const availableLeft  = Math.max(0, rect.left - margin);
    const availableRight = Math.max(0, vw - rect.right - margin);

    // 可用スペース内で 280–560px にクランプ
    let side = 'left';
    let width;
    if (availableLeft >= 280) {
      width = Math.min(560, availableLeft);
      side = 'left';
    } else {
      width = Math.min(560, Math.max(280, availableRight));
      side = 'right';
    }
    bubble.style.width = Math.round(width) + 'px';

    const bcr = bubble.getBoundingClientRect();
    let left = (side === 'left') ? (rect.left - width - margin) : (rect.right + margin);
    let top  = rect.top + (rect.height/2) - (bcr.height/2);

    // 画面内に収める
    top = Math.max(12, Math.min(top, window.innerHeight - bcr.height - 12));

    bubble.classList.remove('left','right');
    bubble.classList.add(side);
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
  const data = { meta: currentPageMeta(), messages: filteredMessages() };
  try {
    const html = (typeof buildHtmlFromData !== 'undefined')
      ? buildHtmlFromData(data)
      : (typeof self !== 'undefined' && self.buildHtmlFromData ? self.buildHtmlFromData(data) : '');
    if (!html) throw new Error('buildHtmlFromData missing');
    saveTextAs(html, 'text/html;charset=utf-8', baseFileName()+'.html');
  } catch(e) {
    try { console.error('[exportHTML] failed to build html', e); } catch(_) {}
    try { alert('HTMLの生成に失敗しました: '+ e); } catch(_) {}
  }
};

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
  (()=>{
    let dragging=false, startX=0, startWidth=0;
    const minW = 260;
    const maxW = () => {
      const SAFE_MARGIN = 24;
      const vw = Math.max(320, window.innerWidth || document.documentElement.clientWidth || 0);
      const cssMax = vw - SAFE_MARGIN;                 // CSS と同じ上限
      const hardMax = Math.floor(vw * 0.6);            // 通常の上限
      return Math.max(220, Math.min(cssMax, Math.max(280, hardMax)));
    };

    const move = (e) => {
      if (!dragging) return;
      const minW = parseFloat(panel.style.minWidth) || 220;
      let w = startWidth + (e.clientX - startX);       // 右端固定なので +dx（必要なら符号は環境に合わせて）
      w = Math.max(minW, Math.min(w, maxW()));
      panel.style.width = w + 'px';
      document.documentElement.style.setProperty('--cgpt-index-width', w + 'px');
    };
    const up=()=>{
      if(!dragging) return;
      dragging=false;
      document.removeEventListener('mousemove',move);
      document.removeEventListener('mouseup',up);
      try{ localStorage.setItem(STORAGE_KEY_WIDTH, panel.getBoundingClientRect().width + 'px'); }catch{}
    };
    resizer.addEventListener('mousedown', e=>{
      dragging=true; startX=e.clientX; startWidth=panel.getBoundingClientRect().width;
      document.addEventListener('mousemove',move);
      document.addEventListener('mouseup',up);
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