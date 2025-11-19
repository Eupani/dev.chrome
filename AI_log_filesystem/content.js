(() => {
  if (window.__CGPT_EXPORTER_READY__) return;
  window.__CGPT_EXPORTER_READY__ = true;

  if (!('showSaveFilePicker' in self)) {
    console.warn('File System Access API 未対応のため終了');
    return;
  }

  // ========= 状態 =========
  let fileHandle = null;                  // 出力先ファイル
  let currentFormat = 'html';             // 'html' | 'md' | 'json'（表示のみ。変更は設定画面で）
  let autoConnect = true;                 // 起動時、自動接続（設定画面で管理）
  let sidebarCollapsed = false;
  let sidebarWidth = 340;
  let debounceWrite = null;
  let debounceIndex = null;

  const EXT  = { html: '.html', md: '.md', json: '.json' };
  const MIME = { html: 'text/html', md: 'text/markdown', json: 'application/json' };

  // ========= IndexedDB（同一オリジンにハンドル永続化） =========
  const DB_NAME = 'cgpt-exporter';
  const STORE = 'handles';
  let dbPromise;
  function idb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  async function idbGetDefault(fmt) {
    const db = await idb();
    return await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(`default:${fmt}`);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => rej(req.error);
    });
  }
  // （設定画面からの指示用：登録/解除）
  async function idbPutDefault(fmt, handle) {
    const db = await idb();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(handle, `default:${fmt}`);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }
  async function idbDeleteDefault(fmt) {
    const db = await idb();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(`default:${fmt}`);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }

  // ========= 設定の復元 → UI構築 → 自動接続試行 =========
  try {
    chrome.storage?.local.get(
      ['cgpt_export_format', 'cgpt_sidebar_collapsed', 'cgpt_sidebar_width', 'cgpt_autoconnect'],
      async (res) => {
        if (res?.cgpt_export_format && ['html','md','json'].includes(res.cgpt_export_format)) currentFormat = res.cgpt_export_format;
        if (typeof res?.cgpt_sidebar_collapsed === 'boolean') sidebarCollapsed = res.cgpt_sidebar_collapsed;
        if (typeof res?.cgpt_sidebar_width === 'number' && res.cgpt_sidebar_width >= 240 && res.cgpt_sidebar_width <= 720) sidebarWidth = res.cgpt_sidebar_width;
        if (typeof res?.cgpt_autoconnect === 'boolean') autoConnect = res.cgpt_autoconnect;

        mountUI();
        if (autoConnect) tryAutoConnectFromDefault(currentFormat, { allowPrompt: false, silent: true }).catch(console.warn);
      }
    );
  } catch {
    mountUI();
    if (autoConnect) tryAutoConnectFromDefault(currentFormat, { allowPrompt: false, silent: true }).catch(console.warn);
  }

  function saveSidebarPrefs() {
    try {
      chrome.storage?.local.set({
        cgpt_sidebar_collapsed: sidebarCollapsed,
        cgpt_sidebar_width: sidebarWidth
      });
    } catch {}
  }

  // ========= スタイル（右サイドバー、モノクロ、スクロール修正） =========
  function injectStyle() {
    const style = document.createElement('style');
    style.id = 'cgpt-exporter-style';
    style.textContent = `
:root {
  --sb-bg: #fff; --sb-fg: #111; --sb-sub: #666; --sb-border: rgba(0,0,0,.12); --sb-shadow: rgba(0,0,0,.12);
  --sb-width: ${sidebarWidth}px;
}
@media (prefers-color-scheme: dark) {
  :root { --sb-bg: #101217; --sb-fg: #e6e7ea; --sb-sub: #9aa0a6; --sb-border: rgba(255,255,255,.14); --sb-shadow: rgba(0,0,0,.5); }
}
html.cgpt-with-sidebar:not(.cgpt-sidebar-collapsed) body { padding-right: var(--sb-width) !important; transition: padding-right .2s ease; }
#cgpt-sidebar {
  position: fixed; top: 0; right: 0; bottom: 0; width: var(--sb-width); max-width: 60vw;
  background: var(--sb-bg); color: var(--sb-fg); z-index: 2147483646;
  border-left: 1px solid var(--sb-border); box-shadow: -2px 0 18px var(--sb-shadow);
  display: flex; flex-direction: column; min-height: 0;
}
html.cgpt-sidebar-collapsed #cgpt-sidebar { width: 46px !important; }
#cgpt-sb-header { display:flex; align-items:center; gap:8px; padding:10px; border-bottom:1px solid var(--sb-border); flex:0 0 auto; }
#cgpt-sb-title { font-weight:700; font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:var(--sb-sub); }
#cgpt-sb-controls { padding:10px; display:grid; gap:8px; border-bottom:1px solid var(--sb-border); flex:0 0 auto; }
#cgpt-sb-controls .row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
#cgpt-sb-controls button {
  background: transparent; color: var(--sb-fg); border:1px solid var(--sb-border);
  border-radius:10px; padding:6px 8px; cursor:pointer;
}
#cgpt-sb-controls button:hover { background: rgba(127,127,127,.08); }
#cgpt-sb-status { color: var(--sb-sub); font-size:12px; padding:0 10px 10px; border-bottom:1px solid var(--sb-border); flex:0 0 auto; }
#cgpt-sb-index { flex:1 1 auto; min-height:0; overflow-y:auto; overscroll-behavior:contain; -webkit-overflow-scrolling:touch; padding:8px 0 10px; }
.cgpt-index-item { padding:8px 10px; border-bottom:1px dashed var(--sb-border); cursor:pointer; }
.cgpt-index-item:hover { background: rgba(127,127,127,.08); }
.cgpt-index-topline { display:flex; justify-content:space-between; gap:8px; font-size:11px; color:var(--sb-sub); }
.cgpt-index-body { margin-top:4px; font-size:12px; color:var(--sb-fg); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#cgpt-sb-footer { padding:8px 10px; color:var(--sb-sub); border-top:1px solid var(--sb-border); font-size:11px; flex:0 0 auto; }
#cgpt-sb-collapse {
  margin-left:auto; border-radius:8px; width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center;
  border:1px solid var(--sb-border); cursor:pointer; background:transparent;
}
#cgpt-sb-resizer { position:absolute; top:0; left:-4px; width:8px; height:100%; cursor:ew-resize; opacity:.001; }
html.cgpt-sidebar-collapsed #cgpt-sb-resizer { display:none; }
.cgpt-highlight { outline:2px dashed var(--sb-sub); outline-offset:4px; transition:outline-color .6s ease; }
#cgpt-pick-overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); z-index:2147483647; display:flex; align-items:center; justify-content:center; }
#cgpt-pick-card {
  background:var(--sb-bg); color:var(--sb-fg); border:1px solid var(--sb-border); border-radius:12px; padding:16px; width:420px; box-shadow:0 8px 24px var(--sb-shadow);
}`;
    document.head.appendChild(style);
  }

  // ========= UI（必要最低限） =========
  function mountUI() {
    injectStyle();
    document.documentElement.classList.add('cgpt-with-sidebar');
    if (sidebarCollapsed) document.documentElement.classList.add('cgpt-sidebar-collapsed');

    const sb = document.createElement('aside');
    sb.id = 'cgpt-sidebar';
    sb.innerHTML = `
      <div id="cgpt-sb-header">
        <div id="cgpt-sb-title">Chat Index</div>
        <button id="cgpt-sb-collapse" title="開閉">❯</button>
      </div>
      <div id="cgpt-sb-controls">
        <div class="row">
          <button id="cgpt-btn-connect">📄 出力先を接続</button>
          <button id="cgpt-btn-save">💾 今すぐ保存</button>
          <button id="cgpt-open-options" title="設定画面を開く">⚙️ 設定</button>
        </div>
        <div class="row" style="opacity:.7">
          <span id="cgpt-format-label">形式: ${currentFormat.toUpperCase()}（変更は設定で）</span>
        </div>
      </div>
      <div id="cgpt-sb-status">未接続</div>
      <div id="cgpt-sb-index" role="list"></div>
      <div id="cgpt-sb-footer">Monochrome • auto-save & index</div>
      <div id="cgpt-sb-resizer" aria-hidden="true"></div>
    `;
    document.documentElement.appendChild(sb);

    const btnConnect = sb.querySelector('#cgpt-btn-connect');
    const btnSave    = sb.querySelector('#cgpt-btn-save');
    const statusEl   = sb.querySelector('#cgpt-sb-status');
    const collapseBtn= sb.querySelector('#cgpt-sb-collapse');
    const resizer    = sb.querySelector('#cgpt-sb-resizer');
    const btnOptions = sb.querySelector('#cgpt-open-options');

    setStatus('未接続');

    // 設定画面を確実に開く（background経由）
    btnOptions.addEventListener('click', (e) => {
      e.preventDefault();
      try { chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }); }
      catch { window.open(chrome.runtime.getURL('options.html'), '_blank'); }
    });

    // 出力先を接続：まずデフォルトに対して（ユーザー操作内）requestPermissionを試行
    btnConnect.addEventListener('click', async () => {
      const ok = await tryAutoConnectFromDefault(currentFormat, { allowPrompt: true, silent: true });
      if (!ok) await pickFile().catch(() => {});
    });

    btnSave.addEventListener('click', () => writeNow().catch(console.error));

    // サイドバー開閉
    collapseBtn.addEventListener('click', () => {
      sidebarCollapsed = !sidebarCollapsed;
      document.documentElement.classList.toggle('cgpt-sidebar-collapsed', sidebarCollapsed);
      saveSidebarPrefs();
      document.documentElement.style.setProperty('--sb-width', `${sidebarWidth}px`);
    });

    // リサイズ（右側）
    let dragging = false;
    resizer.addEventListener('mousedown', (e) => { dragging = true; e.preventDefault(); document.body.style.userSelect = 'none'; });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const w = Math.max(240, Math.min(720, window.innerWidth - e.clientX));
      sidebarWidth = w;
      document.documentElement.style.setProperty('--sb-width', `${sidebarWidth}px`);
    });
    window.addEventListener('mouseup', () => {
      if (dragging) { dragging = false; document.body.style.userSelect = ''; saveSidebarPrefs(); }
    });

    window.__CGPT_SIDEBAR_API__ = { setStatus: (msg)=> statusEl.textContent = msg };

    startObservers();
    rebuildIndexSoon();
  }

  function setStatus(msg) { window.__CGPT_SIDEBAR_API__?.setStatus?.(msg); }

  // ========= 自動接続（起動時は queryPermission のみ） =========
  async function tryAutoConnectFromDefault(fmt, { allowPrompt = false, silent = false } = {}) {
    try {
      const def = await idbGetDefault(fmt);
      if (!def) { if (!silent) setStatus('デフォルト未設定'); return false; }

      const q = await def.queryPermission?.({ mode: 'readwrite' });
      if (q === 'granted') {
        fileHandle = def;
        setStatus(`接続済み（デフォルト）: ${fileHandle.name}`);
        await writeNow();
        return true;
      }
      if (!allowPrompt) { if (!silent) setStatus('権限が必要です。📄 出力先を接続 をクリックしてください。'); return false; }
      const r = await def.requestPermission?.({ mode: 'readwrite' });
      if (r === 'granted') {
        fileHandle = def;
        setStatus(`接続済み（デフォルト）: ${fileHandle.name}`);
        await writeNow();
        return true;
      } else {
        if (!silent) setStatus('権限が付与されませんでした。手動で保存先を選択してください。');
        return false;
      }
    } catch (e) {
      if (!silent) setStatus('自動接続に失敗しました。手動で接続してください。');
      return false;
    }
  }

  // ========= 出力先選択（ユーザー操作で1回） =========
  async function pickFile() {
    try {
      const suggestedName = `chatgpt-${new Date().toISOString().slice(0,10)}${EXT[currentFormat]}`;
      const typeDesc = currentFormat === 'html' ? 'HTML' : currentFormat === 'md' ? 'Markdown' : 'JSON';
      const accept = {}; accept[MIME[currentFormat]] = [EXT[currentFormat]];
      const handle = await showSaveFilePicker({ suggestedName, types: [{ description: typeDesc, accept }] });
      const perm = await handle.requestPermission?.({ mode: 'readwrite' });
      if (perm && perm !== 'granted') { alert('書き込み権限が許可されませんでした。'); return; }
      fileHandle = handle;
      setStatus(`接続済み: ${fileHandle.name}`);
      await writeNow();
    } catch (e) { console.error(e); }
  }

  // ========= Optionsとの連携（デフォルト登録・解除は設定画面からのみ） =========
  chrome.runtime?.onMessage?.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'pickDefaultForFormat' && ['html','md','json'].includes(msg.format)) {
      currentFormat = msg.format; // 表示だけ合わせる
      showPickOverlay(); // クリック→ picker → idbPutDefault
      sendResponse?.({ok:true});
      return true;
    }
    if (msg?.type === 'clearDefaultForFormat' && ['html','md','json'].includes(msg.format)) {
      idbDeleteDefault(msg.format).then(()=> setStatus(`デフォルト解除（${msg.format.toUpperCase()}）`));
      sendResponse?.({ok:true});
      return true;
    }
  });

  function showPickOverlay() {
    const ov = document.createElement('div');
    ov.id = 'cgpt-pick-overlay';
    ov.innerHTML = `
      <div id="cgpt-pick-card">
        <div style="font-weight:700; margin-bottom:8px;">デフォルト保存先の設定</div>
        <div style="font-size:13px; color: var(--sb-sub); margin-bottom:12px;">
          「保存先を選ぶ」をクリックし、${currentFormat.toUpperCase()} のデフォルトに登録します（以後は自動接続＆自動保存）。
        </div>
        <div style="display:flex; gap:8px; justify-content:flex-end">
          <button id="cgpt-pick-cancel" style="border:1px solid var(--sb-border); border-radius:10px; padding:6px 10px; background:transparent; cursor:pointer;">キャンセル</button>
          <button id="cgpt-pick-go" style="border:1px solid var(--sb-border); border-radius:10px; padding:6px 10px; cursor:pointer;">保存先を選ぶ</button>
        </div>
      </div>
    `;
    document.body.appendChild(ov);
    ov.querySelector('#cgpt-pick-cancel').onclick = () => ov.remove();
    ov.querySelector('#cgpt-pick-go').onclick = async () => {
      try {
        await pickFile();
        if (fileHandle) await idbPutDefault(currentFormat, fileHandle);
        ov.remove();
        setStatus(`デフォルト保存: ${fileHandle?.name || ''}`);
        // 表示の形式ラベル更新
        const lbl = document.getElementById('cgpt-format-label');
        if (lbl) lbl.textContent = `形式: ${currentFormat.toUpperCase()}（変更は設定で）`;
      } catch (e) { console.error(e); setStatus('デフォルト保存に失敗'); ov.remove(); }
    };
  }

  // ========= メッセージ収集・インデックス =========
  const idToFirstSeen = new Map();
  const elToId = new WeakMap();
  const SELECTORS = [
    '[data-message-author-role][data-message-id]',
    'article[data-message-author-role]',
    'main [role="listitem"]',
    '[data-message-author-role]'
  ];
  function getNodeId(n) {
    const id = n.getAttribute?.('data-message-id') || n.id;
    if (id) return id;
    if (elToId.has(n)) return elToId.get(n);
    const gen = `msg-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    elToId.set(n, gen);
    return gen;
  }
  function extractPlainText(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('button,svg,menu,textarea,select,nav,header,footer,[role="button"],[data-testid="copy-code-button"]').forEach(e => e.remove());
    return (clone.innerText || '').trim();
  }
  function roleFrom(el) {
    return el.getAttribute?.('data-message-author-role')
        || el.closest?.('[data-message-author-role]')?.getAttribute('data-message-author-role')
        || 'unknown';
  }
  function formatClock(d) { try { return d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); } catch { return ''; } }
  function collectMessagesWithNodes() {
    const nodes = Array.from(document.querySelectorAll(SELECTORS.join(',')));
    const seen = new Set();
    const list = [];
    for (const n of nodes) {
      const id = getNodeId(n);
      if (seen.has(id)) continue;
      seen.add(id);
      const role = roleFrom(n);
      const text = extractPlainText(n);
      if (!text) continue;
      if (!idToFirstSeen.has(id)) idToFirstSeen.set(id, new Date());
      list.push({ id, role, text, node: n, seenAt: idToFirstSeen.get(id) });
    }
    return list;
  }

  function rebuildIndex() {
    const wrap = document.querySelector('#cgpt-sb-index');
    if (!wrap) return;
    const messages = collectMessagesWithNodes();
    const frag = document.createDocumentFragment();
    messages.forEach((m) => {
      const item = document.createElement('div');
      item.className = 'cgpt-index-item';
      item.setAttribute('role', 'listitem');
      item.dataset.msgId = m.id;

      const topline = document.createElement('div');
      topline.className = 'cgpt-index-topline';
      const left = document.createElement('div');
      left.textContent = (m.role || '').toLowerCase();
      const right = document.createElement('div');
      right.textContent = formatClock(m.seenAt);
      topline.appendChild(left); topline.appendChild(right);

      const body = document.createElement('div');
      body.className = 'cgpt-index-body';
      body.textContent = m.text.replace(/\s+/g, ' ').slice(0, 160);

      item.appendChild(topline);
      item.appendChild(body);

      item.addEventListener('click', () => {
        try {
          m.node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          m.node?.classList?.add('cgpt-highlight');
          setTimeout(() => m.node?.classList?.remove('cgpt-highlight'), 900);
        } catch {}
      });

      frag.appendChild(item);
    });
    wrap.innerHTML = '';
    wrap.appendChild(frag);
  }
  function rebuildIndexSoon() {
    clearTimeout(debounceIndex);
    debounceIndex = setTimeout(rebuildIndex, 250);
  }

  // ========= 出力 =========
  function buildHTML(messages) {
    const title = (document.title || 'ChatGPT Transcript').trim().replace(/\s+/g, ' ');
    const savedAt = new Date().toLocaleString();
    const url = location.href;
    const cards = messages.map(m => `
<section class="msg" style="background:var(--panel,#fff);border:1px solid rgba(0,0,0,.12);border-radius:14px;padding:14px 16px;margin:0 0 14px;">
  <div style="display:flex;justify-content:space-between;gap:8px;">
    <div style="font-weight:600;font-size:12px;text-transform:uppercase;opacity:.75;">${escapeHtml(m.role)}</div>
    <time style="font-size:11px;opacity:.6;">${escapeHtml(formatClock(m.seenAt))}</time>
  </div>
  <div style="white-space:pre-wrap;word-break:break-word;margin-top:6px;">${escapeHtml(m.text)}</div>
</section>`.trim()).join('\n');

    return `<!doctype html>
<html lang="ja"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root{--bg:#fff;--fg:#111;--sub:#666;--border:rgba(0,0,0,.12);--panel:#fff;--shadow:rgba(0,0,0,.12)}
@media (prefers-color-scheme:dark){:root{--bg:#0b0f16;--fg:#e5e7eb;--sub:#9aa0a6;--border:rgba(255,255,255,.14);--panel:#101217;--shadow:rgba(0,0,0,.5)}}
*{box-sizing:border-box} html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.7 system-ui,-apple-system,Segoe UI,Roboto,"Noto Sans JP",sans-serif}
header{position:sticky;top:0;background:linear-gradient(180deg,rgba(127,127,127,.06),transparent);padding:24px;border-bottom:1px solid var(--border);backdrop-filter:saturate(130%) blur(2px)}
h1{margin:0 0 6px;font-size:20px}.meta{color:var(--sub);font-size:12px}
main{padding:24px}
code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:.95em}
footer{padding:24px;color:var(--sub);font-size:12px;border-top:1px solid var(--border)}
</style>
</head>
<body>
<header><h1>${escapeHtml(title)}</h1><div class="meta">Saved at: ${escapeHtml(savedAt)} / Source: <a href="${escapeHtml(url)}">${escapeHtml(url)}</a></div></header>
<main class="transcript">
${cards}
</main>
<footer>Generated by ChatGPT Auto Save (Monochrome)</footer>
</body></html>`;
  }
  function buildMD(messages) {
    const header =
`# ChatGPT Transcript
- Host: ${location.hostname}
- Saved At: ${new Date().toLocaleString()}
- URL: ${location.href}

`;
    const body = messages.map(m =>
`### ${m.role.toUpperCase()}  \`${formatClock(m.seenAt)}\`

${m.text}
`).join('\n---\n\n');
    return header + body;
  }
  function buildJSON(messages) {
    const payload = {
      title: (document.title || 'ChatGPT Transcript').trim(),
      url: location.href,
      savedAt: new Date().toISOString(),
      messages: messages.map(m => ({ id: m.id, role: m.role, time: m.seenAt?.toISOString?.() || null, text: m.text }))
    };
    return JSON.stringify(payload, null, 2);
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) =>
      c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
    );
  }

  async function writeNow() {
    if (!fileHandle) { setStatus('未接続（設定でデフォルトを登録しておくと自動接続されます）'); return; }
    const messages = collectMessagesWithNodes();
    const data = currentFormat === 'html' ? buildHTML(messages)
               : currentFormat === 'md'   ? buildMD(messages)
               : buildJSON(messages);
    const writable = await fileHandle.createWritable();
    await writable.write(new Blob([data], { type: MIME[currentFormat] }));
    await writable.close();
    setStatus(`保存完了: ${fileHandle.name}（${new Date().toLocaleTimeString()}）`);
  }
  function scheduleWrite() {
    if (!fileHandle) return;
    clearTimeout(debounceWrite);
    debounceWrite = setTimeout(() => writeNow().catch(console.error), 800);
  }

  // ========= 監視 =========
  function startObservers() {
    const root = document.querySelector('main') || document.body;
    const mo = new MutationObserver(() => { scheduleWrite(); rebuildIndexSoon(); });
    mo.observe(root, { childList: true, subtree: true, characterData: true });

    window.addEventListener('beforeunload', () => {
      if (fileHandle) { try { navigator.locks?.request?.('cgpt-save', writeNow); } catch {} }
    });
  }
})();
