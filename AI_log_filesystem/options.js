(async () => {
  const fmtSel = document.getElementById('fmt');
  const autoCk = document.getElementById('autoconn');
  const openBtn = document.getElementById('btn-open-chat');
  const pickBtn = document.getElementById('btn-pick-default');
  const clearBtn= document.getElementById('btn-clear-default');
  const status  = document.getElementById('status');

  // 設定の復元
  chrome.storage.local.get(['cgpt_export_format','cgpt_autoconnect'], (res) => {
    if (res?.cgpt_export_format) fmtSel.value = res.cgpt_export_format;
    if (typeof res?.cgpt_autoconnect === 'boolean') autoCk.checked = res.cgpt_autoconnect;
  });

  fmtSel.addEventListener('change', () => {
    chrome.storage.local.set({ cgpt_export_format: fmtSel.value }, () => {
      status.textContent = `形式を ${fmtSel.value.toUpperCase()} に保存しました。`;
    });
  });
  autoCk.addEventListener('change', () => {
    chrome.storage.local.set({ cgpt_autoconnect: !!autoCk.checked }, () => {
      status.textContent = `起動時自動接続: ${autoCk.checked ? 'ON' : 'OFF'}`;
    });
  });

  openBtn.addEventListener('click', async () => {
    const url = 'https://chat.openai.com/';
    await chrome.tabs.create({ url });
  });

  // デフォルト設定: ChatGPTタブに指示を送り、ページ側のパネルからpicker→IDB保存
  pickBtn.addEventListener('click', async () => {
    const fmt = fmtSel.value;
    let tabs = await chrome.tabs.query({ url: ['https://chat.openai.com/*','https://chatgpt.com/*'] });
    let tabId;
    if (tabs.length) {
      tabId = tabs[0].id;
      await chrome.tabs.update(tabId, { active: true });
    } else {
      const created = await chrome.tabs.create({ url: 'https://chat.openai.com/' });
      tabId = created.id;
    }
    setTimeout(async () => {
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'pickDefaultForFormat', format: fmt });
        status.innerHTML = `ChatGPTタブにパネルを表示しました。<span class="ok">「保存先を選ぶ」</span>をクリックしてください。`;
      } catch (e) {
        status.textContent = 'ページ読み込み後にもう一度お試しください。';
      }
    }, 800);
  });

  clearBtn.addEventListener('click', async () => {
    const fmt = fmtSel.value;
    let tabs = await chrome.tabs.query({ url: ['https://chat.openai.com/*','https://chatgpt.com/*'] });
    if (!tabs.length) { status.textContent = 'ChatGPTタブを開いてから実行してください。'; return; }
    try {
      await chrome.tabs.sendMessage(tabs[0].id, { type: 'clearDefaultForFormat', format: fmt });
      status.textContent = `デフォルト（${fmt.toUpperCase()}）を解除しました。`;
    } catch {
      status.textContent = '解除に失敗しました。サイドバーの🗑ボタンからも実行できます。';
    }
  });
})();
