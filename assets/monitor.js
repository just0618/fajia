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
  const badgeClass = (x) => String(x || "DIRECT").toLowerCase();

  function renderSummary(platformKey) {
    const p = DATA.platforms[platformKey];
    const relationShare = p.relation.discussion_share ?? p.relation.discussion_count / p.strict_organic;
    $("#platformSummary").innerHTML = `
      <div class="summary-card headline"><span>${p.label}当前画像</span><strong>${p.headline}</strong></div>
      <div class="summary-card"><span>Strict organic</span><strong>${p.strict_organic.toLocaleString()}</strong></div>
      <div class="summary-card"><span>E08 不满/愤怒</span><strong>${pct(p.dissatisfaction.share)}</strong></div>
      <div class="summary-card"><span>关系讨论</span><strong>${pct(relationShare)}</strong></div>
    `;
  }

  function renderHotspots(platformKey) {
    const p = DATA.platforms[platformKey];
    $("#hotspotList").innerHTML = p.hotspots.map((h) => `
      <article class="hotspot-card">
        <div class="hotspot-rank">${String(h.rank).padStart(2,"0")}</div>
        <div class="hotspot-main">
          <h3>${h.title}</h3>
          ${h.summary ? `<p>${h.summary}</p>` : ""}
          ${h.caveat ? `<p class="caveat">${h.caveat}</p>` : ""}
        </div>
        <div class="hotspot-meta">
          <span class="badge ${badgeClass(h.evidence_level)}">${h.evidence_level}</span>
          <span class="support">support ${h.support}</span>
        </div>
      </article>
    `).join("");
  }

  function renderInsights() {
    $("#insightGrid").innerHTML = DATA.insights.map((i) => `
      <article class="insight-card">
        <span class="badge ${badgeClass(i.level)}">${i.level}</span>
        <h3>${i.title}</h3>
        <p>${i.statement}</p>
        <details>
          <summary>证据与边界</summary>
          <ul class="evidence-list">${i.evidence.map(e => `<li>${e}</li>`).join("")}</ul>
          <p class="caveat">${i.guardrail}</p>
        </details>
      </article>
    `).join("");
  }

  function renderBars(root, rows, valueKey, maxN=6) {
    const items = rows.slice(0, maxN);
    const max = Math.max(...items.map(x => Number(x[valueKey] || x.comment_share || x.share || 0)), 0.0001);
    root.innerHTML = items.map((x) => {
      const v = Number(x[valueKey] ?? x.comment_share ?? x.share ?? 0);
      return `
        <div class="bar-row">
          <span class="bar-label">${x.label}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${Math.max(3, v/max*100)}%"></span></span>
          <span class="bar-value">${pct(v)}</span>
        </div>`;
    }).join("");
  }

  function renderStats() {
    const w = DATA.platforms.weibo;
    const d = DATA.platforms.douban;
    renderBars($("#weiboTargets"), w.dissatisfaction.top_targets, "share_within_E08", 6);
    renderBars($("#doubanTopics"), d.top_substantive_topics, "comment_share", 6);

    $("#weiboRelation").innerHTML = `
      <div class="metric"><span>关系讨论</span><strong>${pct(w.relation.discussion_share)}</strong></div>
      <div class="metric"><span>负向关系判断</span><strong>${w.relation.negative_count || 0}</strong></div>
      <div class="metric" style="grid-column:1/-1"><span>解释</span><strong style="font-size:13px;line-height:1.6">当前微博严格语料中，关系议题不是主要冲突。</strong></div>
    `;
    $("#doubanRelation").innerHTML = `
      <div class="metric"><span>关系讨论</span><strong>${pct(d.relation.discussion_share)}</strong></div>
      <div class="metric"><span>unresolved</span><strong>${pct(d.relation.unresolved_relation_share)}</strong></div>
      <div class="metric"><span>resolved positive</span><strong>${pct(d.relation.resolved_positive_share)}</strong></div>
      <div class="metric"><span>resolved negative</span><strong>${pct(d.relation.resolved_negative_share)}</strong></div>
    `;
  }

  function renderGuardrails() {
    $("#guardrails").innerHTML = DATA.guardrails.map(x => `<div class="guardrail">${x}</div>`).join("");
    const w = DATA.windows.weibo;
    const d = DATA.windows.douban;
    $("#methodDetail").textContent =
`微博窗口：${w.start} → ${w.end}
豆瓣窗口：${d.start} → ${d.end}

${DATA.windows.comparison_warning}

数据层级：
${DATA.methodology.hierarchy.map((x,i)=>`${i+1}. ${x}`).join("\n")}

前端仅读取静态 JSON；API Key / crawler / AI pipeline 不进入公开仓库。`;
  }

  function switchPlatform(key) {
    currentPlatform = key;
    $$(".seg-btn").forEach(b => b.classList.toggle("active", b.dataset.platform === key));
    renderSummary(key);
    renderHotspots(key);
  }

  async function boot() {
    try {
      const res = await fetch("./data/dashboard.json", {cache:"no-store"});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      DATA = await res.json();
      $("#generatedAt").textContent = `快照生成 ${fmtDate(DATA.generated_at)}`;
      $("#snapshotStatus").textContent = "快照已加载";
      $("#snapshotStatus").classList.add("ready");
      renderInsights();
      renderStats();
      renderGuardrails();
      switchPlatform(currentPlatform);
      $$(".seg-btn").forEach(btn => btn.addEventListener("click", () => switchPlatform(btn.dataset.platform)));
    } catch (err) {
      console.error(err);
      $("#snapshotStatus").textContent = "数据读取失败";
      $("#hotspotList").innerHTML = `<div class="error-box">无法读取 ./data/dashboard.json。部署到 EdgeOne/GitHub Pages 后会正常通过 HTTP 读取；若在本地双击 HTML，请使用本地 HTTP server 预览。</div>`;
    }
  }
  boot();
})();