(() => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  let DATA=null,currentPlatform="weibo";
  const pct=(x,d=1)=>`${(Number(x||0)*100).toFixed(d)}%`;
  const fmtDate=iso=>{if(!iso)return"—";const d=new Date(iso);if(Number.isNaN(d.getTime()))return iso;return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`};
  const fmtRange=w=>`${fmtDate(w?.start)} ～ ${fmtDate(w?.end)}`;
  const badgeText=x=>({DIRECT:"直接证据",INFERRED:"归纳观察",HYPOTHESIS:"集中猜测"}[String(x||"").toUpperCase()]||"直接证据");
  const badgeClass=x=>String(x||"DIRECT").toLowerCase();
  const windowAligned=()=>Boolean(DATA.windows?.aligned_for_comparison);
  const compareState=()=>windowAligned()?"同时间窗，可直接比较":"当前时间窗不同，仅并列展示";
  const sourceInfo=()=>({
    weibo:{label:DATA.sources?.weibo?.label||"微博超话评论区",anchor:DATA.sources?.weibo?.anchor||"官方双人锚点帖：「九月见 #法嘉澳门见面会#」"},
    douban:{label:DATA.sources?.douban?.label||"豆瓣闲聊楼",anchor:DATA.sources?.douban?.anchor||"闲聊楼 59.0–60.0 采集语料"}
  });
  const zhEvidence=s=>String(s||"")
    .replace(/Weibo relationship discussion\s*=\s*1\/525\s*=\s*0\.19%/ig,"微博：关系本身成为讨论对象 1/525 = 0.19%")
    .replace(/negative relation\s*=\s*0/ig,"明确负向关系判断 = 0")
    .replace(/Douban relationship discussion\s*=\s*35\.6%/ig,"豆瓣：关系本身成为讨论对象 = 35.6%")
    .replace(/Douban unresolved relation\s*=\s*14\.8%/ig,"豆瓣：关系判断方向仍无法确认 = 14.8%")
    .replace(/Douban resolved negative relation\s*=\s*8\.5%/ig,"豆瓣：明确负向关系判断 = 8.5%")
    .replace(/NONE/gi,"无关系判断")
    .replace(/unresolved relation/gi,"关系判断方向仍无法确认")
    .replace(/Hotspot support/gi,"热点证据支持")
    .replace(/Direct Hotspots/gi,"近期热议")
    .replace(/Insight Layer/gi,"跨平台观察")
    .replace(/Statistical Overview/gi,"结构统计")
    .replace(/Topic · Emotion · Target · Relation/gi,"议题 · 情绪 · 指向对象 · 关系讨论")
    .replace(/DIRECT · INFERRED · HYPOTHESIS/gi,"直接证据 · 归纳观察 · 集中猜测");

  function renderSources(){const src=sourceInfo();$("#weiboSource").textContent=`${src.weibo.label} · ${src.weibo.anchor} · ${fmtRange(DATA.windows.weibo)}`;$("#doubanSource").textContent=`${src.douban.label} · ${src.douban.anchor} · ${fmtRange(DATA.windows.douban)}`;$("#windowWarning").textContent=windowAligned()?"本期微博与豆瓣已使用同一时间窗口，可进行同口径平台比较。":"当前微博与豆瓣不是同一时间窗口，因此下方统计只做“同指标并列展示”，不把百分比高低解释为平台差异。后续实时版会统一时间窗口后再开放直接比较。";}
  function renderSummary(k){const p=DATA.platforms[k],r=p.relation.discussion_share??p.relation.discussion_count/p.strict_organic;$("#platformSummary").innerHTML=`<div class="summary-card headline"><span>${p.label}当前概况</span><strong>${p.headline}</strong></div><div class="summary-card"><span>纳入统计的有效讨论</span><strong>${p.strict_organic.toLocaleString()}</strong></div><div class="summary-card"><span>明确不满/愤怒</span><strong>${pct(p.dissatisfaction.share)}</strong></div><div class="summary-card"><span>提到两人关系本身</span><strong>${pct(r)}</strong></div>`;}
  function renderHotspots(k){const p=DATA.platforms[k];$("#hotspotList").innerHTML=p.hotspots.map(h=>`<article class="hotspot-card"><div class="hotspot-rank">${String(h.rank).padStart(2,"0")}</div><div class="hotspot-main"><h3>${h.title}</h3>${h.summary?`<p>${h.summary}</p>`:""}${h.caveat?`<p class="caveat">边界：${h.caveat}</p>`:""}</div><div class="hotspot-meta"><span class="badge ${badgeClass(h.evidence_level)}">${badgeText(h.evidence_level)}</span><span class="support">证据支持 ${h.support}</span></div></article>`).join("");}
  function renderInsights(){$("#insightGrid").innerHTML=DATA.insights.map(i=>`<article class="insight-card"><span class="badge ${badgeClass(i.level)}">${badgeText(i.level)}</span><h3>${i.title}</h3><p>${i.statement}</p><details><summary>证据与边界</summary><ul class="evidence-list">${i.evidence.map(e=>`<li>${zhEvidence(e)}</li>`).join("")}</ul><p class="caveat">${zhEvidence(i.guardrail)}</p></details></article>`).join("");}
  const unionByCode=(a,b)=>{const m=new Map();[...a,...b].forEach(x=>{if(!m.has(x.code))m.set(x.code,x.label)});return [...m].map(([code,label])=>({code,label}))};
  const valueFor=(rows,code,key)=>Number((rows.find(x=>x.code===code)||{})[key]||0);
  function renderCompareRows(root,defs,wRows,dRows,wKey,dKey){root.innerHTML=defs.map(x=>{const w=valueFor(wRows,x.code,wKey),d=valueFor(dRows,x.code,dKey),mx=Math.max(w,d,.0001);return `<div class="compare-row"><div class="compare-label">${x.label}</div><div class="compare-pair"><div class="compare-line"><span class="compare-platform wb">微博</span><span class="compare-track"><span class="compare-fill wb" style="width:${Math.max(w?3:0,w/mx*100)}%"></span></span><span class="compare-value">${pct(w)}</span></div><div class="compare-line"><span class="compare-platform db">豆瓣</span><span class="compare-track"><span class="compare-fill db" style="width:${Math.max(d?3:0,d/mx*100)}%"></span></span><span class="compare-value">${pct(d)}</span></div></div></div>`}).join("");}
  function renderStats(){const w=DATA.platforms.weibo,d=DATA.platforms.douban;renderCompareRows($("#crossTargets"),unionByCode(w.dissatisfaction.top_targets,d.dissatisfaction.top_targets),w.dissatisfaction.top_targets,d.dissatisfaction.top_targets,"share_within_E08","comment_share");const wt=w.focus_topics||w.dissatisfaction.top_topics||[],dt=d.top_substantive_topics||d.dissatisfaction.top_topics||[];renderCompareRows($("#crossTopics"),unionByCode(wt,dt),wt,dt,"share","comment_share");["#targetCompareState","#topicCompareState","#relationCompareState"].forEach(id=>$(id).textContent=compareState());const wr=w.relation.discussion_share??w.relation.discussion_count/w.strict_organic,dr=d.relation.discussion_share??0;$("#relationPlain").innerHTML=`<div class="relation-card"><span>微博 · 关系本身成为讨论对象</span><strong>${pct(wr)}</strong><p>明确负向关系判断：${w.relation.negative_count||0} 条。低占比只说明这一窗口里，讨论重点主要不在“两人关系状态”本身。</p></div><div class="relation-card"><span>豆瓣 · 关系本身成为讨论对象</span><strong>${pct(dr)}</strong><p>其中关系判断方向仍无法确认：${pct(d.relation.unresolved_relation_share)}；明确正向：${pct(d.relation.resolved_positive_share)}；明确负向：${pct(d.relation.resolved_negative_share)}。讨论得多不能直接写成“关系变差”。</p></div>`;}
  function renderGuardrails(){const src=sourceInfo();$("#guardrails").innerHTML=DATA.guardrails.map(x=>`<div class="guardrail">${zhEvidence(x)}</div>`).join("");const w=DATA.windows.weibo,d=DATA.windows.douban;const hierarchy=["近期热议 / 看具体发生了什么","跨平台观察 / 区分直接证据、归纳观察与集中猜测","结构统计 / 议题、情绪、指向对象与关系讨论"];$("#methodDetail").textContent=`微博数据源：${src.weibo.label} · ${src.weibo.anchor}\n微博窗口：${w.start} → ${w.end}\n\n豆瓣数据源：${src.douban.label} · ${src.douban.anchor}\n豆瓣窗口：${d.start} → ${d.end}\n\n${windowAligned()?"两个平台时间窗口已对齐，可进行同口径比较。":"当前两个平台时间窗口不同，因此只并列展示同一类指标，不比较平台高低；后续实时版将按统一时间窗口产出。"}\n\n分析层级：\n${hierarchy.map((x,i)=>`${i+1}. ${x}`).join("\n")}\n\n公开页面只读取静态 JSON；接口密钥、爬虫与模型调用不进入公开仓库。`;}
  function switchPlatform(k){currentPlatform=k;$$('.seg-btn').forEach(b=>b.classList.toggle('active',b.dataset.platform===k));renderSummary(k);renderHotspots(k)}
  async function boot(){try{const r=await fetch("./data/dashboard.json",{cache:"no-store"});if(!r.ok)throw new Error(`HTTP ${r.status}`);DATA=await r.json();$("#generatedAt").textContent=`快照生成 ${fmtDate(DATA.generated_at)}`;$("#snapshotStatus").textContent="快照已加载";$("#snapshotStatus").classList.add("ready");renderSources();renderInsights();renderStats();renderGuardrails();switchPlatform(currentPlatform);$$('.seg-btn').forEach(b=>b.addEventListener('click',()=>switchPlatform(b.dataset.platform)))}catch(e){console.error(e);$("#snapshotStatus").textContent="数据读取失败";$("#hotspotList").innerHTML=`<div class="error-box">无法读取舆情快照数据。</div>`}}
  boot();
})();