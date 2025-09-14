// export_template.js — shared HTML export template (manual & auto)
(function(){
  function esc(s){ return String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function escJSON(s){ return String(s||'').replace(/[&<>]/g, c => c==='&'?'&amp;':(c==='<'?'&lt;':'&gt;')).replace(/<\/script/gi,'<\\/script>'); }
  function renderBody(text){
    var FENCE=String.fromCharCode(96,96,96);
    var parts=String(text||'').split(FENCE), out='';
    for (var i=0;i<parts.length;i++){
      if (i%2===1){
        var seg=parts[i]; var nl=seg.indexOf('\n'); var body=(nl!==-1)?seg.slice(nl+1):seg;
        out += '<pre><code>'+esc(body)+'</code></pre>';
      } else {
        var para = esc(parts[i]).replace(/\n\n+/g,'</p><p>').replace(/\n/g,'<br>');
        out += (i===0?'<p>':'') + para;
      }
    }
    if (out.slice(-4)!=='</p>') out += '</p>';
    return out;
  }
  function headLine(text){ var t=String(text||'').replace(/\s+/g,' ').trim(); if(!t) return '(empty)'; var m=t.match(/^(.{1,120}?)([。．.!?？]|$)/); return (m&&m[1])?m[1]:t.slice(0,120); }

  function buildHtmlFromData(data){
    var meta = (data&&data.meta)||{};
    var msgs = (data&&data.messages)||[];

    // Build chat sections
    var chatHTML = '';
    for (var i=0;i<msgs.length;i++){
      var m = msgs[i];
      var role = (m.role==='user'?'user':'ai');
      chatHTML += '<section class="row '+role+'" id="'+esc(m.id||'')+'"><div class="bubble"><div class="meta"><span class="badge">'+(role==='user'?'User':'AI')+'</span><span class="time">'+esc(m.time||'')+'</span></div><div class="content">'+renderBody(m.text)+'</div></div></section>';
    }

    // Style (shared)
    
var style = [
      /* === Monochrome palette (Dark default) === */
      ':root{ --bg:#0e1116; --fg:#e7e7e7; --sub:#a5a5a5; --border:rgba(255,255,255,.10); --panel:#111418;'+
      ' --accent:#9ca3af; --ai:#c9c9c9; --user:#d3d3d3;'+
      ' --bubble-ai-bg:#151a20; --bubble-user-bg:#1e242b; --bubble-ai-fg:#e7e7e7; --bubble-user-fg:#e7e7e7;'+
      ' --bubble-max:clamp(320px, 52vw, 980px);'+
      ' --pill-ai-bg:#20252b; --pill-user-bg:#2b3036; --pill-fg:#e7e7e7;'+
      ' --btn-primary-bg:#2b2f34; --btn-primary-fg:#f5f5f5; }',
      /* Light mode override (Monochrome) */
      '@media (prefers-color-scheme: light){ :root{ --bg:#fafafa; --fg:#111111; --sub:#6f6f6f; --border:rgba(0,0,0,.10); --panel:#ffffff;'+
      ' --accent:#9aa0a6; --ai:#3b3b3b; --user:#3b3b3b;'+
      ' --bubble-ai-bg:#ffffff; --bubble-user-bg:#f3f4f6; --bubble-ai-fg:#111111; --bubble-user-fg:#111111;'+
      ' --pill-ai-bg:#e6e6e6; --pill-user-bg:#dcdcdc; --pill-fg:#111111;'+
      ' --btn-primary-bg:#2f2f2f; --btn-primary-fg:#ffffff; } }',
      '*{box-sizing:border-box}',
      /* Responsive base font */
      'body{margin:0;background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans JP","Hiragino Kaku Gothic ProN","Meiryo",sans-serif;font-size:clamp(13px,0.95vw,16px);line-height:1.55;}',
      /* 2-column responsive grid: main grows, panel scales with viewport */
      '.wrap{display:grid; grid-template-columns: minmax(0,1fr) clamp(260px,24vw,360px); gap: 12px; max-width:min(1660px, 100%); margin: 16px auto; padding: 0 12px;}',
      '@media (max-width:960px){ .wrap{grid-template-columns:1fr;} .panel{order:-1; position:static; height:auto;} }',
      'header{grid-column: 1 / -1; margin-bottom:2px}',
      'header h1{margin:0 0 6px; font-size:1.25rem; font-weight:700}',
      'header .meta{font-size:.85rem; color:var(--sub)}',
      /* Chat rows: left=AI, right=User */
      '.row{display:flex; gap:12px; align-items:flex-start}',
      '.row.ai{justify-content:flex-start}',
      '.row.user{justify-content:flex-end}',
      /* Bubble core: responsive width + per-role colors */
      '.bubble{position:relative; max-width: var(--bubble-max); width: fit-content; border: 1px solid var(--border); border-radius: 16px; padding: 12px 14px; margin: 10px 0; box-shadow: 0 2px 8px rgba(0,0,0,.08);}',
      '.row.ai   .bubble{ background:var(--bubble-ai-bg);   color:var(--bubble-ai-fg);   margin-right:auto;}',
      '.row.user .bubble{ background:var(--bubble-user-bg); color:var(--bubble-user-fg); margin-left:auto;}',
      /* Bubble tails */
      '.bubble::after{content:\"\"; position:absolute; top:14px; border:8px solid transparent;}',
      '.row.ai   .bubble::after{ left:-8px;  border-right-color: var(--bubble-ai-bg); }',
      '.row.user .bubble::after{ right:-8px; border-left-color:  var(--bubble-user-bg); }',
      /* Meta & content in bubbles */
      '.badge{font-size:.75rem; border:1px solid var(--border); border-radius:999px; padding:2px 8px; font-weight:600; color:var(--fg);}',
      '.user .badge{color:var(--fg)}',
      '.time{font-size:.75rem; color:var(--sub); margin-left:6px}',
      '.content{white-space:pre-wrap; word-break:break-word}',
      '.content pre{background:rgba(0,0,0,.35); border:1px solid var(--border); border-radius:10px; padding:10px; overflow:auto}',
      '.content code{font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace; font-size:.9em}',
      /* Side panel */
      '.panel{position:sticky; top:12px; height: calc(100vh - 24px); display:flex; flex-direction:column; background: var(--panel); border:1px solid var(--border); border-radius:12px; box-shadow: 0 2px 10px rgba(0,0,0,.08)}',
      '.panel header{padding:10px 12px; border-bottom:1px solid var(--border)}',
      '.panel header .title{font-size:14px; font-weight:700}',
      '.panel .sub{font-size:11px; color:var(--sub); margin-top:4px}',
      '.panel .controls{display:grid; grid-template-columns: 1fr auto auto; gap:6px; padding:10px 12px; border-bottom:1px solid var(--border)}',
      '.panel .controls input[type=search]{padding:8px 10px; border:1px solid var(--border); border-radius:10px; background:transparent; color:var(--fg)}',
      '.panel .controls label{font-size:11px; display:flex; gap:6px; align-items:center}',
      '.list{list-style:none; margin:0; padding:8px 12px; overflow:auto; flex:1}',
      '.item{margin:6px 0}',
      /* 2-line index items */
      '.link{display:block; padding:8px; width:100%; text-align:left; background:transparent; border:none; border-radius:10px; cursor:pointer; color:inherit}',
      '.link:hover{background: rgba(255,255,255,.06)}',
      /* role pills (index): monochrome but role-distinct */
      '.rolepill{font-size:11px; padding:6px 8px; border:1px solid var(--border); border-radius:8px; min-width:34px; text-align:center; font-weight:600; background:var(--pill-ai-bg); color:var(--pill-fg);}',
      '.is-user{background:var(--pill-user-bg); color:var(--pill-fg)}',
      '.link .meta{display:flex; gap:8px; align-items:center; margin:0 0 2px 0; font-size:11px; color:var(--sub)}',
      '.link .time{margin-left:6px}',
      '.link .head{white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}',
      '.footer{padding:10px 12px; border-top:1px solid var(--border); display:flex; gap:8px}',
      /* buttons: make primary high-contrast in both modes (no white-on-white) */ 
      '.btn{padding:10px 12px; font-size:12px; border-radius:10px; border:1px solid var(--border); background:transparent; color:inherit; cursor:pointer}',
      '.btn.primary{background: var(--btn-primary-bg); color: var(--btn-primary-fg); border:none}',
      '.btn.primary:hover{filter:brightness(1.05)}'
    ].join('\n');

    var parts = [];
    parts.push('<!doctype html>');
    parts.push('<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">');
    parts.push('<title>'+esc(meta.title||'ChatGPT Conversation')+' - Export</title>');
    parts.push('<style>'+style+'</style>');
    parts.push('</head><body>');
    parts.push('<div class="wrap">');
    parts.push('<header><h1>ChatGPT Conversation Export</h1><div class="meta">Title: '+esc(meta.title||'')+'<br>URL: <a href="'+esc(meta.url||'')+'">'+esc(meta.url||'')+'</a><br>Exported: '+esc(meta.exported_at||'')+' ('+esc(meta.timezone||'')+')</div></header>');
    parts.push('<main class="chat" id="chat">');
    parts.push(chatHTML);
    parts.push('</main>');

    // Side panel (index)
    parts.push('<aside class="panel" id="panel"><header><div class="title">会話インデックス</div><div class="sub">クリックで該当へ移動 / 検索・User/AIフィルタ</div></header><div class="controls"><input id="f" type="search" placeholder="フィルタ…"><label><input type="checkbox" id="u" checked> User</label><label><input type="checkbox" id="a" checked> AI</label></div><ul class="list" id="list"></ul><div class="footer"><button class="btn primary" id="dlmd">Markdown</button><button class="btn" id="dljson">JSON</button></div></aside>');

    // Embed data
    parts.push('<script id="data" type="application/json">'+escJSON(JSON.stringify({meta:meta, messages:msgs}))+'</script>');

    // Runtime script (list rendering, downloads)
    var runtime = [];
    runtime.push('(function(){');
    runtime.push('var DATA = (function(){ try { return JSON.parse(document.getElementById("data").textContent); } catch(e){ return {meta:{},messages:[]}; } })();');
    runtime.push('var chat=document.getElementById("chat"), list=document.getElementById("list"), inF=document.getElementById("f"), cbU=document.getElementById("u"), cbA=document.getElementById("a");');
    runtime.push('function esc(s){ return String(s||"").replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c];}); }');
    runtime.push('function headLine(text){ var t=String(text||"").replace(/\\s+/g," ").trim(); if(!t) return "(empty)"; var m=t.match(/^(.{1,120}?)([。．.!?？]|$)/); return (m&&m[1])?m[1]:t.slice(0,120); }');
    runtime.push('function renderBody(text){ var FENCE=String.fromCharCode(96,96,96); var parts=String(text||"").split(FENCE); var out=""; for(var i=0;i<parts.length;i++){ if(i%2===1){ var seg=parts[i]; var nl=seg.indexOf("\\n"); var body=seg; if(nl!==-1) body=seg.slice(nl+1); out+="<pre><code>"+esc(body)+"</code></pre>"; } else { var para=esc(parts[i]).replace(/\\n\\n+/g,"</p><p>").replace(/\\n/g,"<br>"); out+=(i===0?"<p>":"")+para; } } if(out.slice(-4)!=="</p>") out+="</p>"; return out; }');
    runtime.push('function build(){ chat.innerHTML=""; list.innerHTML=""; var kw=inF.value.trim().toLowerCase(); var showU=cbU.checked, showA=cbA.checked; var filtered=(DATA.messages||[]).filter(function(m){ var roleOK=(m.role==="user"&&showU)||(m.role==="assistant"&&showA)||(!["user","assistant"].includes(m.role)); var textOK=!kw||String(m.text||"").toLowerCase().includes(kw); return roleOK&&textOK; }); for(var i=0;i<filtered.length;i++){ var m=filtered[i]; var role=(m.role==="user"?"user":"ai"); var row=document.createElement("section"); row.className="row "+role; row.id=m.id; row.innerHTML="<div class=\\"bubble\\"><div class=\\"meta\\"><span class=\\"badge\\">"+(role==="user"?"User":"AI")+"</span><span class=\\"time\\">"+(m.time||"")+"</span></div><div class=\\"content\\">"+renderBody(m.text)+"</div></div>"; chat.appendChild(row); var li=document.createElement("li"); li.className="item"; li.innerHTML="<button class=\\"link\\"><div class=\\"meta\\"><span class=\\"rolepill "+(role==="user"?"is-user":"")+"\\">"+(role==="user"?"User":"AI")+"</span><span class=\\"time\\">"+(m.time||"")+"</span></div><div class=\\"head\\">"+esc(headLine(m.text))+"</div></button>"; li.querySelector(".link").addEventListener("click",(function(id){return function(){ var el=document.getElementById(id); if(el) el.scrollIntoView({behavior:\"smooth\", block:\"start\"}); };})(m.id)); list.appendChild(li); } }');
    runtime.push('inF.addEventListener("input", build); cbU.addEventListener("change", build); cbA.addEventListener("change", build); build();');
    runtime.push('function timestamp(){ return new Date().toISOString().replace(/[:.]/g,"-"); }');
    runtime.push('function dl(blob, name){ var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(function(){URL.revokeObjectURL(a.href);},3000); }');
    runtime.push('document.getElementById("dljson").addEventListener("click", function(){ var blob=new Blob([JSON.stringify(DATA,null,2)],{type:"application/json"}); dl(blob, "chatgpt_export_"+timestamp()+".json"); });');
    runtime.push('document.getElementById("dlmd").addEventListener("click", function(){ var md="# ChatGPT Conversation Export\\n\\n- Title: "+(DATA.meta.title||"")+"\\n- URL: "+(DATA.meta.url||"")+"\\n- Exported: "+(DATA.meta.exported_at||"")+" ("+(DATA.meta.timezone||"")+")\\n\\n---\\n\\n"; for(var i=0;i<DATA.messages.length;i++){ var m=DATA.messages[i]; var role=m.role==="user"?"User":(m.role==="assistant"?"AI":(m.role||"Unknown")); md+="### "+role+"  \\\\n*Time:* "+(m.time||"")+"\\n\\n"+String(m.text||"").replace(/^#/gm,"\\\\#")+"\\n\\n---\\n\\n"; } var blob=new Blob([md],{type:"text/markdown;charset=utf-8"}); dl(blob, "chatgpt_export_"+timestamp()+".md"); });');
    runtime.push('})();');

    parts.push('<script>'+runtime.join('\n')+'</script>');
    parts.push('</div></body></html>');

    return parts.join('\n');
  }

  try { self.buildHtmlFromData = buildHtmlFromData; } catch(e){}
})();