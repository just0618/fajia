const $ = s => document.querySelector(s);
const arr = x => Array.isArray(x) ? x : [];
const num = (x, fallback = 0) => Number.isFinite(Number(x)) ? Number(x) : fallback;
const esc = v => String(v ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function fmtTime(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false
  }).format(d);
}

function fmtWindow(w) {
  if (!w) return "";
  const a = fmtTime(w.window_start || w.start);
  const b = fmtTime(w.window_end || w.end);
  return [a, b].filter(Boolean).join(" – ");
}

function emptyCard(text) {
  return `<div class="empty-card">${esc(text)}</div>`;
}

function themeCard(x, tone = "neutral") {
  return `
    <article class="theme-card ${tone}">
      <div class="theme-card-top">
        <span class="theme-category">${esc(x.category || x.tier || "")}</span>
        <strong>${num(x.support)} 条</strong>
      </div>
      <h3>${esc(x.title || "未命名主题")}</h3>
      ${x.aspect ? `<div class="theme-meta">${esc(x.aspect)}</div>` : ""}
    </article>`;
}

function renderRecent(data) {
  const r = data.recent_topics || {};
  const note = $("#recent-note");
  const box = $("#recent-topics");

  if (r.status === "HOLD") {
    note.textContent = r.notice || "当前热点暂不可用。";
    box.innerHTML = emptyCard("当前热点模块暂不可用，其他模块仍正常更新。");
    return;
  }

  note.textContent = r.notice || (r.data_window ? `最近 24 小时 · ${fmtWindow(r.data_window)}` : "最近 24 小时");
  const items = arr(r.items);

  if (!items.length) {
    box.innerHTML = emptyCard(r.notice || "当前时间窗口内暂未形成满足独立证据要求的热点。");
    return;
  }

  box.innerHTML = items.map(x => `
    <article class="topic-card">
      <div class="topic-rank">${String(x.rank || "").padStart(2, "0")}</div>
      <div class="topic-main">
        <div class="topic-family">${esc(x.family_title || "")}</div>
        <h3>${esc(x.title || x.family_title || "未命名议题")}</h3>
        <p>${esc(x.summary || "")}</p>
        <div class="chips">
          <span>${num(x.independent_support_count)} 条独立支持</span>
          <span>${esc(x.evidence_tier || "")}</span>
          ${num(x.reaction_heat_count) ? `<span>反应热度 ${num(x.reaction_heat_count)}</span>` : ""}
        </div>
      </div>
    </article>
  `).join("");
}

function renderPositive(data) {
  const p = data.positive_feedback || {};
  $("#positive-note").textContent = p.notice || "当前窗口中的正向反馈主题。";
  const items = arr(p.main_themes);
  $("#positive-themes").innerHTML = items.length
    ? items.map(x => themeCard(x, "positive")).join("")
    : emptyCard("当前窗口暂无足够稳定的正向主题。");
}

function renderNegative(data) {
  const n = data.negative_feedback || {};
  if (n.description) $("#negative-note").textContent = n.description;
  const items = arr(n.main_themes);
  $("#negative-themes").innerHTML = items.length
    ? items.map(x => themeCard(x, "negative")).join("")
    : emptyCard("当前窗口暂无足够稳定的负向主题。");
}

function renderTargets(data) {
  const t = data.negative_targets || {};
  const items = arr(t.targets);
  const max = Math.max(1, ...items.map(x => num(x.support)));
  const warning = t.unresolved_review || {};

  $("#negative-target-warning").innerHTML = warning.count
    ? `<div class="warning-card">${esc(warning.notice || `当前有 ${warning.count} 条负面讨论尚未稳定归因。`)}</div>`
    : "";

  $("#negative-targets").innerHTML = items.length
    ? items.map(x => `
      <div class="target-row">
        <div class="target-head"><strong>${esc(x.title || "其他")}</strong><span>${num(x.support)} 条</span></div>
        <div class="bar"><span style="width:${Math.max(3, Math.min(100, num(x.support) / max * 100))}%"></span></div>
        <div class="target-category">${esc(x.category || "")}</div>
      </div>`).join("")
    : emptyCard("当前没有可稳定归因的负面对象。 ");
}

function sourceCard(s) {
  const cov = s.coverage || {};
  const topics = arr(s.topic_support).slice(0, 5);
  const status = cov.status || "UNKNOWN";
  const notice = s.notice || cov.notice || "";

  return `
    <article class="source-card">
      <div class="source-card-head">
        <div><span class="source-status ${status.toLowerCase()}">${esc(status)}</span><h3>${esc(s.title || s.source_family || "来源")}</h3></div>
        <strong>${num(s.rows)} 条</strong>
      </div>
      ${notice ? `<div class="source-notice">${esc(notice)}</div>` : ""}
      <div class="source-topic-list">
        ${topics.length ? topics.map(x => `
          <div class="source-topic-row">
            <span>${esc(x.display_title || x.ontology_label || x.topic_code || "")}</span>
            <strong>${num(x.support_rows)} 条</strong>
          </div>`).join("") : `<div class="muted">当前暂无可展示主题。</div>`}
      </div>
    </article>`;
}

function renderSources(data) {
  const s = data.source_discussion || {};
  const items = arr(s.sources);
  $("#source-discussion").innerHTML = items.length
    ? items.map(sourceCard).join("")
    : emptyCard("当前暂无来源级讨论数据。 ");
}

function renderStateCard(id, section, fallback) {
  const el = $(id);
  if (!el) return;
  const status = section?.status || "UNKNOWN";
  const notice = section?.notice || fallback;
  el.innerHTML = `
    <div class="state-status ${String(status).toLowerCase()}">${esc(status)}</div>
    <p>${esc(notice || "暂无更多信息。")}</p>`;
}

function renderMeta(data) {
  const readiness = data.publish_readiness || {};
  $("#publish-status").textContent = readiness.status === "DEGRADED" ? "可发布 · 有覆盖提示" : (readiness.status || "READY");
  $("#generated-at").textContent = fmtTime(data.generated_at) || "—";
  $("#overall-window").textContent = `${num(data.meta?.current_72h_rows)} 条当前语义样本 · 72h`;
  $("#top-status-text").textContent = data.platform_comparison?.douban_current_rows > 0 ? "双平台当前数据" : "微博当前数据";
}

function renderV22(data) {
  renderMeta(data);
  renderRecent(data);
  renderPositive(data);
  renderNegative(data);
  renderTargets(data);
  renderSources(data);

  renderStateCard(
    "#discussion-change",
    data.discussion_change,
    "趋势模块将在连续快照积累后接入。"
  );

  renderStateCard(
    "#platform-comparison",
    data.platform_comparison,
    "当前缺少足够双平台新数据，暂不生成总体差异结论。"
  );

  renderStateCard(
    "#history",
    data.history,
    "历史时间线将在稳定快照积累后接入。"
  );
}

function renderUnsupported(data) {
  $("#top-status-text").textContent = "前端等待 V2.2 数据";
  $("#publish-status").textContent = "数据合同不匹配";
  $("#overall-window").textContent = data?.data_window?.display || "旧版数据";
  $("#generated-at").textContent = "—";
  $("#recent-topics").innerHTML = emptyCard("当前预览前端已升级到 V2.2，但 data/dashboard.json 仍是旧版数据。同步服务器 V2.2 production payload 后即可显示实时微博内容。");
  ["#positive-themes", "#negative-themes", "#negative-targets", "#source-discussion"].forEach(id => {
    $(id).innerHTML = emptyCard("等待 V2.2 production payload。 ");
  });
  renderStateCard("#discussion-change", {}, "等待 V2.2 production payload。");
  renderStateCard("#platform-comparison", {}, "等待 V2.2 production payload。");
  renderStateCard("#history", {}, "等待 V2.2 production payload。");
}

fetch("./data/dashboard.json", { cache: "no-store" })
  .then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  })
  .then(data => {
    if (data.version === "FAJIA_MONITOR_FRONTEND_PAYLOAD_V2.2") {
      renderV22(data);
    } else {
      renderUnsupported(data);
    }
  })
  .catch(err => {
    console.error(err);
    document.body.insertAdjacentHTML("beforeend", `
      <div class="floating-error">数据读取失败：${esc(err.message)}</div>`);
  });
