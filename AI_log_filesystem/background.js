// 設定画面（options）を“必ず”開く係
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'OPEN_OPTIONS') {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage(() => {
        // まれに無反応な環境にフォールバック
        chrome.tabs.create({ url: chrome.runtime.getURL('options.html') }).catch(() => {});
      });
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html') }).catch(() => {});
    }
    sendResponse?.({ ok: true });
    return true;
  }
});
