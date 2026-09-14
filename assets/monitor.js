(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  let DATA = null;
  let currentPlatform = "weibo";

  const pct = (x, digits=1) => `${(Number(x || 0) * 100).toFixed(digits)}%`;
  const fmtDate = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  };
  const fmtRange = (w) => `${fmtDate(w?.start)} ～ ${fmtDate(w?.end)}`;
  const badgeText = (x) => ({DIRECT:"直接证据",INFERRED:"归纳观察",HYPOTHESIS:"集中猜测"}[String(x||"").toUpperCase()] || "直接证据");
  const badgeClass = (x) => String(x || "DIRECT").toLowerCase();
  const windowAligned = () => Boolean(DATA.windows?.aligned_for_comparison);
  const compareState = () => windowAligned() ? "同时间窗，可直接比较" : "当前时间窗不同，仅并列展示";

  function renderSources(){
    const sw=DATA.sources?.weibo || {};
    const sd=DATA.sources?.douban || {};
    $("#weiboSource").textContent = `${sw.label || "微博超话"}${sw.anchor ? ` · ${sw.anchor}` : ""} · ${fmtRange(DATA.windows.weibo)}`;
    $("#doubanSource").textContent = `${sd.label || "豆瓣闲聊楼"}${sd.anchor ? ` · ${sd.anchor}` : ""} · ${fmtRange(DATA.windows.douban)}`;
    $("#windowWarning").textContent = windowAligned()
      ? "本期微博与豆瓣已使用同一时间窗口，可进行同口径平台比较。"
      : `当前微博与豆瓣不是同一时间窗口，因此下方统计只做“同指标并列展示”，不解读为平台高低差异。${DATA.windows.comparison_warning || ""}`;
  }

  function renderSummary(platformKey) {
    const p = DATA.platforms[platformKey];
    const relationShare = p.relation.discussion_share ?? p.relation.discussion_count / p.strict_organic;
    $("#platformSummary").innerHTML = `
      <div class="summary-card headline"><span>${p.label}当前概况</span><strong>${p.headline}</strong></div>
      <div class="summary-card"><span>纳入统计的有效讨论</span><strong>${p.strict_organic.toLocaleString()}</strong></div>
      <div class="summary-card"><span>明确不满/愤怒</span><strong>${pct(p.dissatisfaction.share)}</strong></div>
      <div class="summary-card"><span>提到两人关系本身</span><strong>${pct(relationShare)}</strong></div>`;
  }

  function renderHotspots(platformKey) {
    const p = DATA.platforms[platformKey];
    $("#hotspotList").innerHTML = p.hotspots.map((h) => `
      <article class="hotspot-card">
        <div class="hotspot-rank">${String(h.rank).padStart(2,"0")}</div>
        <div class="hotspot-main"><h3>${h.title}</h3>${h.summary ? `<p>${h.summary}</p>` : ""}${h.caveat ? `<p class="caveat">边界：${h.caveat}</p>` : ""}</div>
        <div class="hotspot-meta"><span class="badge ${badgeClass(h.evidence_level)}">${badgeText(h.evidence_level)}</span><span class="support">独立证据 ${h.support}</span></div>
      </article>`).join("");
  }

  function renderInsights() {
    $("#insightGrid").innerHTML = DATA.insights.map((i) => `
      <article class="insight-card">
        <span class="badge ${badgeClass(i.level)}">${badgeText(i.level)}</span>
        <h3>${i.title}</h3><p>${i.statement}</p>
        <details><summary>证据与边界</summary><ul class="evidence-list">${i.evidence.map(e => `<li>${e}</li>`).join("")}</ul><p class="caveat">${i.guardrail}</p></details>
      </article>`).join("");
  }

  const unionByCode = (a,b) => {
    const m=new Map();
    [...a,...b].forEach(x => { if(!m.has(x.code)) m.set(x.code,x.label); });
    return [...m.entries()].map(([code,label])=>({code,label}));
  };
  const valueFor=(rows,code,key)=>Number((rows.find(x=>x.code===code)||{})[key]||0);

  function renderCompareRows(root, defs, wRows, dRows, wKey, dKey){
    root.innerHTML=defs.map(x=>{
      const w=valueFor(wRows,x.code,wKey), d=valueFor(dRows,x.code,dKey);
      const max=Math.max(w,d,.0001);
      return `<div class="compare-row"><div class="compare-label">${x.label}</div><div class="compare-pair">
        <div class="compare-line"><span class="compare-platform wb">微博</span><span class="compare-track"><span class="compare-fill wb" style="width:${Math.max(w?3:0,w/max*100)}%"></span></span><span class="compare-value">${pct(w)}</span></div>
        <div class="compare-line"><span class="compare-platform db">豆瓣</span><span class="compare-track"><span class="compare-fill db" style="width:${Math.max(d?3:0,d/max*100)}%"></span></span><span class="compare-value">${pct(d)}</span></div>
      </div></div>`;
    }).join("");
  }

  function renderStats() {
    const w=DATA.platforms.weibo, d=DATA.platforms.douban;
    const targets=unionByCode(w.dissatisfaction.top_targets,d.dissatisfaction.top_targets);
    renderCompareRows($("#crossTargets"),targets,w.dissatisfaction.top_targets,d.dissatisfaction.top_targets,"share_within_E08","comment_share");

    const wTopics=w.focus_topics || w.dissatisfaction.top_topics || [];
    const dTopics=d.top_substantive_topics || d.dissatisfaction.top_topics || [];
    const topics=unionByCode(wTopics,dTopics);
    renderCompareRows($("#crossTopics"),topics,wTopics,dTopics,"share","comment_share");

    ["#targetCompareState","#topicCompareState","#relationCompareState"].forEach(id=>$(id).textContent=compareState());
    const wr=w.relation.discussion_share ?? w.relation.discussion_count/w.strict_organic;
    const dr=d.relation.discussion_share ?? 0;
    $("#relationPlain").innerHTML=`
      <div class="relation-card"><span>微博 · 关系本身成为讨论对象</span><strong>${pct(wr)}</strong><p>明确负向关系判断：${w.relation.negative_count || 0} 条。这里的低占比只表示“关系本身不是这一窗口的主要讨论对象”。</p></div>
      <div class="relation-card"><span>豆瓣 · 关系本身成为讨论对象</span><strong>${pct(dr)}</strong><p>其中仍无法确认方向：${pct(d.relation.unresolved_relation_share)}；明确正向：${pct(d.relation.resolved_positive_share)}；明确负向：${pct(d.relation.resolved_negative_share)}。高讨论量不能写成“关系恶化”。</p></div>`;
  }

  function renderGuardrails() {
    $("#guardrails").innerHTML=DATA.guardrails.map(x=>`<div class="guardrail">${x}</div>`).join("");
    const w=DATA.windows.weibo,d=DATA.windows.douban;
    $("#methodDetail").textContent=`微博数据源：${DATA.sources?.weibo?.label || "微博超话"}${DATA.sources?.weibo?.anchor ? ` · ${DATA.sources.weibo.anchor}` : ""}\n微博窗口：${w.start} → ${w.end}\n\n豆瓣数据源：${DATA.sources?.douban?.label || "豆瓣闲聊楼"}${DATA.sources?.douban?.anchor ? ` · ${DATA.sources.douban.anchor}` : ""}\n豆瓣窗口：${d.start} → ${d.end}\n\n${windowAligned()?"两个平台时间窗口已对齐，可进行同口径比较。":DATA.windows.comparison_warning}\n\n分析层级：\n${DATA.methodology.hierarchy.map((x,i)=>`${i+1}. ${x}`).join("\n")}\n\n公开页面只读取静态 JSON；接口密钥、爬虫与模型调用不进入公开仓库。`;
  }

  function switchPlatform(key){currentPlatform=key;$$('.seg-btn').forEach(b=>b.classList.toggle('active',b.dataset.platform===key));renderSummary(key);renderHotspots(key);}

  async function boot(){
    try{
      const res=await fetch("./data/dashboard.json",{cache:"no-store"});if(!res.ok)throw new Error(`HTTP ${res.status}`);DATA=await res.json();
      $("#generatedAt").textContent=`快照生成 ${fmtDate(DATA.generated_at)}`;$("#snapshotStatus").textContent="快照已加载";$("#snapshotStatus").classList.add("ready");
      renderSources();renderInsights();renderStats();renderGuardrails();switchPlatform(currentPlatform);$$('.seg-btn').forEach(btn=>btn.addEventListener('click',()=>switchPlatform(btn.dataset.platform)));
    }catch(err){console.error(err);$("#snapshotStatus").textContent="数据读取失败";$("#hotspotList").innerHTML=`<div class="error-box">无法读取舆情快照数据。</div>`;}
  }
  boot();
})();