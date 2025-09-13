// ChatGPT Conversation Index - Settings (CSP-safe, clean)
(() => {
  const KEY = 'cgpt-settings-v1';
  const DEFAULTS = {
    autoEnabled: true,
    onClose: true,
    onBlurHidden: true,
    blurHiddenDelaySec: 60,
    onIdle: false,
    idleSec: 120,
    formats: ['html']
  };

  const $ = (id) => document.getElementById(id);

  function setDisabledForTriggers(disabled){
    const ids = ['onClose','onBlurHidden','blurHiddenDelaySec','onIdle','idleSec'];
    ids.forEach(id=>{
      const el = $(id);
      if (!el) return;
      el.disabled = !!disabled;
      const row = el.closest('.row');
      if (row){
        if (disabled) row.classList.add('disabled-block'); else row.classList.remove('disabled-block');
      
    // 保存形式（HTML/Markdown/JSON）も一括で無効化
    try {
      var fmtChecks = document.querySelectorAll('.fmtCheck');
      fmtChecks.forEach(function(el){ el.disabled = !!disabled; });
      var fmt = document.querySelector('.fmt');
      var fmtRow = fmt ? fmt.closest('.row') : null;
      if (fmtRow){
        if (disabled) fmtRow.classList.add('disabled-block'); else fmtRow.classList.remove('disabled-block');
      }
    } catch(e){}
  }
    });
  }

  function wireAutoEnabledToggle(){
    const a = $('autoEnabled');
    if (!a) return;
    const apply = ()=> setDisabledForTriggers(!a.checked);
    a.addEventListener('change', apply);
    apply(); // initial
  }

  function load(cb){
    try {
      chrome.storage.sync.get(KEY, (res)=>{
        const v = res && res[KEY] ? res[KEY] : DEFAULTS;
        $('autoEnabled').checked = !!v.autoEnabled;
        $('onClose').checked = !!v.onClose;
        $('onBlurHidden').checked = !!v.onBlurHidden;
        $('blurHiddenDelaySec').value = Number(v.blurHiddenDelaySec||15);
        $('onIdle').checked = !!v.onIdle;
        $('idleSec').value = Number(v.idleSec||300);
        document.querySelectorAll('.fmtCheck').forEach(el=>{
          el.checked = Array.isArray(v.formats) ? v.formats.includes(el.value) : (el.value==='html');
        });
        wireAutoEnabledToggle();
        if (cb) cb(v);
      });
    } catch(e){
      console.error('[settings] load error', e);
    }
  }

  function save(){
    const v = {
      autoEnabled: $('autoEnabled').checked,
      onClose: $('onClose').checked,
      onBlurHidden: $('onBlurHidden').checked,
      blurHiddenDelaySec: Math.min(600, Math.max(1, Math.floor(Number($('blurHiddenDelaySec').value||60)))),
      onIdle: $('onIdle').checked,
      idleSec: Math.min(7200, Math.max(10, Math.floor(Number($('idleSec').value||120)))),
      formats: Array.from(document.querySelectorAll('.fmtCheck')).filter(x=>x.checked).map(x=>x.value)
    };
    try {
      const obj = {}; obj[KEY] = v;
      chrome.storage.sync.set(obj, ()=>{
        const toast = document.getElementById('okToastFixed');
        if (toast) { toast.classList.add('show'); setTimeout(()=> toast.classList.remove('show'), 1600); }
      });
    } catch(e){
      console.error('[settings] save error', e);
    }
  }

  function resetDefaults(){
    try {
      const obj = {}; obj[KEY] = DEFAULTS;
      chrome.storage.sync.set(obj, ()=> load());
    } catch(e){
      console.error('[settings] reset error', e);
    }
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    const saveBtn = document.getElementById('saveBtn');
    const resetBtn = document.getElementById('resetBtn');
    if (saveBtn) saveBtn.addEventListener('click', save);
    if (resetBtn) resetBtn.addEventListener('click', resetDefaults);
    load();
  });

})();
