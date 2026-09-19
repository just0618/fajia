const $ = s => document.querySelector(s);

function arr(x) {
  return Array.isArray(x) ? x : [];
}

function num(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function pct(x) {
  const n = num(x);
  const v = n <= 1 ? n * 100 : n;
  return `${v.toFixed(1)}%`;
}

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function platformData(data, name) {
  return (data.platforms || {})[name] || {};
}

function titleOf(x) {
  return (
    x.family_title_display ||
    x.topic_title_display ||
    x.family_title ||
    x.topic_title ||
    x.title ||
    "未命名议题"
  );
}

function timeOf(x) {
  return x.display_time || "";
}

function platformWindow(p) {
  return (
    p.data_window?.display ||
    [p.data_window?.start, p.data_window?.end]
      .filter(Boolean)
      .join(" – ")
  );
}

function topicFamilies(p) {
  return arr(p.top_families).length
    ? arr(p.top_families)
    : arr(p.families);
}

function familyEvidence(f) {
  return num(
    f.visible_unique_evidence_items ??
    f.family_unique_evidence_items ??
    f.evidence_count ??
    0
  );
}

function familyChildren(f) {
  return num(
    f.visible_child_count ??
    f.child_count ??
    arr(f.member_topic_ids).length ??
    arr(f.members).length
  );
}

/* =========================================================
   最近谈什么
   ========================================================= */

function renderTopics(data, name) {
  const p = platformData(data, name);
  const families = topicFamilies(p);

  const visibleHotspots =
    num(p.summary?.visible_hotspots) ||
    num(p.visible_hotspots) ||
    arr(p.hotspots).length;

  const visibleFamilies =
    num(p.summary?.visible_families) ||
    families.length;

  $(`#${name}-topic-stat`).textContent =
    `${visibleHotspots} 个热点 · ${visibleFamilies} 个主题`;

  const w = platformWindow(p);
  $(`#${name}-window`).textContent =
    w ? `数据窗口：${w}` : "";

  $(`#${name}-topics`).innerHTML =
    families.map((f, i) => {
      const tm = timeOf(f);

      return `
        <div class="rank-row">
          <div class="rank-no">
            ${String(i + 1).padStart(2, "0")}
          </div>

          <div>
            <div class="rank-title">
              ${esc(titleOf(f))}
            </div>

            <div class="rank-sub">
              <span>${familyChildren(f)} 个具体议题</span>
              ${tm ? `<span>${esc(tm)}</span>` : ""}
            </div>
          </div>

          <div class="count-pill">
            ${familyEvidence(f)} 条讨论
          </div>
        </div>
      `;
    })
    .join("");
}

/* =========================================================
   主要不满
   ========================================================= */

function dissatisfactionItems(p) {
  return arr(p.top_dissatisfactions);
}

function renderDissatisfaction(data, name) {
  const p = platformData(data, name);

  $(`#${name}-dissatisfaction`).innerHTML =
    dissatisfactionItems(p)
      .map((x, i) => {
        const negative =
          num(x.negative_evidence_count);

        const density =
          x.negativity_rate ??
          x.negative_evidence_share ??
          0;

        const coverage =
          x.platform_negative_coverage ??
          0;

        const complaints = arr(
          x.representative_complaints_display ||
          x.representative_complaints
        );

        const tm = timeOf(x);

        return `
          <div class="dissatisfaction-item">
            <div class="dissatisfaction-title-row">
              <div class="dissatisfaction-title">
                ${i + 1}. ${esc(titleOf(x))}
              </div>

              <div class="dissatisfaction-count">
                ${negative}
              </div>
            </div>

            <div class="metrics">
              <span class="metric">
                议题负面浓度 ${pct(density)}
              </span>

              <span class="metric">
                平台负面覆盖 ${pct(coverage)}
              </span>

              ${
                tm
                  ? `<span class="metric">${esc(tm)}</span>`
                  : ""
              }
            </div>

            ${complaints
              .slice(0, 2)
              .map(c => `
                <p class="complaint">
                  · ${esc(c)}
                </p>
              `)
              .join("")}
          </div>
        `;
      })
      .join("");
}

/* =========================================================
   Targets
   ========================================================= */

function targetItems(p) {
  const t = p.top_targets || {};

  return arr(
    t.actionable_grouped ||
    t.all_grouped ||
    t
  );
}

function targetLabel(x) {
  return (
    x.target_label ||
    x.target_name ||
    x.label ||
    x.target_group ||
    "其他"
  );
}

function targetCoverage(x) {
  return num(
    x.share_of_negative_evidence ??
    x.coverage ??
    x.share ??
    0
  );
}

function targetCount(x) {
  return num(
    x.negative_evidence_count ??
    x.negative_count ??
    x.count ??
    0
  );
}

function targetMap(p) {
  const out = new Map();

  targetItems(p).forEach(x => {
    out.set(targetLabel(x), x);
  });

  return out;
}

function renderTargetComparison(data) {
  const weibo = platformData(data, "weibo");
  const douban = platformData(data, "douban");

  const wm = targetMap(weibo);
  const dm = targetMap(douban);

  const preferredOrder = [
    "艺人/双人关系",
    "公司/运营",
    "粉圈生态",
    "商务/作品/物料",
    "平台"
  ];

  const allLabels = [
    ...new Set([
      ...preferredOrder,
      ...wm.keys(),
      ...dm.keys()
    ])
  ].filter(label => wm.has(label) || dm.has(label));

  $("#target-comparison").innerHTML =
    allLabels.map((label, index) => {
      const w = wm.get(label) || {};
      const d = dm.get(label) || {};

      const wc = targetCount(w);
      const dc = targetCount(d);

      const wp = targetCoverage(w);
      const dp = targetCoverage(d);

      const wpct = wp <= 1 ? wp * 100 : wp;
      const dpct = dp <= 1 ? dp * 100 : dp;

      return `
        <div class="target-comparison-row">
          <div class="target-rank">
            ${String(index + 1).padStart(2, "0")}
          </div>

          <div class="target-main">
            <div class="target-label">
              ${esc(label)}
            </div>

            <div class="dual-bars">
              <div class="dual-bar-row">
                <span class="dual-platform weibo-text">
                  微博
                </span>

                <div class="dual-bar-track">
                  <span
                    class="dual-bar-fill weibo-fill"
                    style="width:${Math.min(100, wpct)}%">
                  </span>
                </div>

                <strong>${wpct.toFixed(1)}%</strong>
                <small>${wc} 条</small>
              </div>

              <div class="dual-bar-row">
                <span class="dual-platform douban-text">
                  豆瓣
                </span>

                <div class="dual-bar-track">
                  <span
                    class="dual-bar-fill douban-fill"
                    style="width:${Math.min(100, dpct)}%">
                  </span>
                </div>

                <strong>${dpct.toFixed(1)}%</strong>
                <small>${dc} 条</small>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");
}

/* =========================================================
   平台差异
   ========================================================= */

function topFamilies(p, n = 3) {
  return topicFamilies(p).slice(0, n);
}

function topDissatisfactions(p, n = 3) {
  return dissatisfactionItems(p).slice(0, n);
}

function topTargets(p, n = 3) {
  return targetItems(p)
    .filter(x => targetCount(x) > 0)
    .slice(0, n);
}

function findTarget(p, label) {
  return targetItems(p).find(
    x => targetLabel(x) === label
  ) || {};
}

function topFamilyItem(p, index = 0) {
  return topicFamilies(p)[index] || {};
}

function topDissItem(p, index = 0) {
  return dissatisfactionItems(p)[index] || {};
}

function insightCard({
  level,
  title,
  statement,
  evidence = [],
  guardrail
}) {
  return `
    <article class="insight-card">
      <div class="insight-level ${level.toLowerCase()}">
        ${esc(level)}
      </div>

      <h3>${esc(title)}</h3>

      <p class="insight-statement">
        ${esc(statement)}
      </p>

      <details class="insight-evidence">
        <summary>证据与边界</summary>

        <div class="insight-evidence-body">
          <ul>
            ${evidence.map(x =>
              `<li>${esc(x)}</li>`
            ).join("")}
          </ul>

          <div class="insight-guardrail">
            <strong>阅读边界</strong>
            <span>${esc(guardrail)}</span>
          </div>
        </div>
      </details>
    </article>
  `;
}

function renderPlatformInsights(data) {
  const w = platformData(data, "weibo");
  const d = platformData(data, "douban");

  const wTop = topFamilyItem(w, 0);
  const wSecond = topFamilyItem(w, 1);

  const dTop = topFamilyItem(d, 0);
  const dSecond = topFamilyItem(d, 1);
  const dThird = topFamilyItem(d, 2);

  const wDiss = topDissItem(w, 0);
  const dDiss = topDissItem(d, 0);

  const wCompany = findTarget(w, "公司/运营");
  const dCompany = findTarget(d, "公司/运营");

  const wFandom = findTarget(w, "粉圈生态");
  const dFandom = findTarget(d, "粉圈生态");

  const wRelation = findTarget(w, "艺人/双人关系");
  const dRelation = findTarget(d, "艺人/双人关系");

  const asPct = x => {
    const v = targetCoverage(x);
    return v <= 1 ? v * 100 : v;
  };

  const wc = asPct(wCompany);
  const dc = asPct(dCompany);

  const wf = asPct(wFandom);
  const df = asPct(dFandom);

  const wr = asPct(wRelation);
  const dr = asPct(dRelation);

  const cards = [
    {
      level: "DIRECT",
      title:
        `微博当前压力更集中在“${titleOf(wTop)}”及运营治理议题`,
      statement:
        `微博当前排名第一的讨论主题是“${titleOf(wTop)}”；`
        + `第二位“${titleOf(wSecond)}”也带有明确的安排与信息透明诉求。`,
      evidence: [
        `微博 Top 1：${titleOf(wTop)}，${familyEvidence(wTop)} 条有效讨论证据`,
        `微博主要不满 Top 1：${titleOf(wDiss)}，${num(wDiss.negative_evidence_count)} 条负面证据`,
        `微博负面指向：公司/运营 ${wc.toFixed(1)}%`,
        `微博负面指向：粉圈生态 ${wf.toFixed(1)}%`
      ],
      guardrail:
        "这里只描述当前微博样本中的讨论结构，不外推为全部微博用户的长期态度。"
    },

    {
      level: "DIRECT",
      title:
        `豆瓣当前讨论核心是“${titleOf(dTop)}”，并延伸到互动与关系解释`,
      statement:
        `豆瓣当前最强主题是“${titleOf(dTop)}”，`
        + `其后连续出现“${titleOf(dSecond)}”和“${titleOf(dThird)}”。`
        + `相比单纯催更，讨论更容易继续延伸到互动质量和关系状态。`,
      evidence: [
        `豆瓣 Top 1：${titleOf(dTop)}，${familyEvidence(dTop)} 条有效讨论证据`,
        `豆瓣 Top 2：${titleOf(dSecond)}，${familyEvidence(dSecond)} 条有效讨论证据`,
        `豆瓣 Top 3：${titleOf(dThird)}，${familyEvidence(dThird)} 条有效讨论证据`,
        `豆瓣负面指向：艺人/双人关系 ${dr.toFixed(1)}%`
      ],
      guardrail:
        "关系讨论频繁不等于关系事实本身发生变化；这里描述的是讨论对象和解释框架。"
    },

    {
      level: "DIRECT",
      title:
        "运营与粉圈治理压力在微博更突出，而豆瓣更集中于艺人/双人关系",
      statement:
        `微博的公司/运营和粉圈生态负面覆盖分别为 `
        + `${wc.toFixed(1)}% 和 ${wf.toFixed(1)}%；`
        + `豆瓣对应为 ${dc.toFixed(1)}% 和 ${df.toFixed(1)}%。`
        + `豆瓣艺人/双人关系覆盖为 ${dr.toFixed(1)}%。`,
      evidence: [
        `微博 公司/运营：${wc.toFixed(1)}%`,
        `豆瓣 公司/运营：${dc.toFixed(1)}%`,
        `微博 粉圈生态：${wf.toFixed(1)}%`,
        `豆瓣 粉圈生态：${df.toFixed(1)}%`,
        `微博 艺人/双人关系：${wr.toFixed(1)}%`,
        `豆瓣 艺人/双人关系：${dr.toFixed(1)}%`
      ],
      guardrail:
        "各平台采集结构不同，因此适合比较议题结构，不把覆盖率差直接解释为平台总热度差。"
    },

    {
      level: "INFERRED",
      title:
        "两个平台承担了不同功能：微博更像“公开诉求/治理场”，豆瓣更像“解释与拼图场”",
      statement:
        `微博更容易围绕后援会、运营、直播排期形成明确诉求；`
        + `豆瓣则更常从停更、互动质量和关系状态继续展开解释。`,
      evidence: [
        `微博当前 Top 2：${titleOf(wTop)}；${titleOf(wSecond)}`,
        `豆瓣当前 Top 3：${titleOf(dTop)}；${titleOf(dSecond)}；${titleOf(dThird)}`,
        `微博公司/运营覆盖 ${wc.toFixed(1)}%`,
        `豆瓣艺人/双人关系覆盖 ${dr.toFixed(1)}%`
      ],
      guardrail:
        "这是基于当前样本结构的功能性归纳，不表示两个平台用户具有固定的人格或立场差异。"
    },

    {
      level: "INFERRED",
      title:
        "“直播与双人内容供给不足”可能是两个平台共同焦点，但表达方式不同",
      statement:
        `微博侧更直接表现为催直播、催预告和要求明确安排；`
        + `豆瓣侧则在长期停更基础上继续讨论互动质量、物料供给和关系状态。`,
      evidence: [
        `微博：${titleOf(wSecond)}，${familyEvidence(wSecond)} 条讨论证据`,
        `豆瓣：${titleOf(dTop)}，${familyEvidence(dTop)} 条讨论证据`,
        `豆瓣：${titleOf(dSecond)}，${familyEvidence(dSecond)} 条讨论证据`,
        `豆瓣主要不满 Top 1：${titleOf(dDiss)}，${num(dDiss.negative_evidence_count)} 条负面证据`
      ],
      guardrail:
        "“共同焦点”是跨平台归纳，不表示两个平台全部讨论由同一个原因驱动。"
    },

    {
      level: "HYPOTHESIS",
      title:
        "双人信息供给不足可能形成“信息真空”，并把两个平台推向不同讨论路径",
      statement:
        `一种待验证的解释是：当直播、双人物料和公开互动信息减少时，`
        + `微博更容易转化为催播、催预告和运营诉求；`
        + `豆瓣则更容易依靠已有互动细节和时间线继续进行关系解释。`,
      evidence: [
        "微博存在明确的直播排期与预告透明度诉求",
        `豆瓣最大主题：${titleOf(dTop)}`,
        `豆瓣关系相关主题进入前三：${titleOf(dThird)}`,
        `豆瓣艺人/双人关系负面覆盖 ${dr.toFixed(1)}%`
      ],
      guardrail:
        "这是机制假设，不是当前数据已经证明的因果关系；需要更长时间序列或事件前后比较验证。"
    }
  ];

  $("#platform-insights").innerHTML =
    cards.map(insightCard).join("");
}

/* =========================================================
   Load
   ========================================================= */

fetch("./data/dashboard.json", {
  cache: "no-store"
})
  .then(r => {
    if (!r.ok) {
      throw new Error(`HTTP ${r.status}`);
    }
    return r.json();
  })
  .then(data => {
    $("#overall-window").textContent =
      data.data_window?.display ||
      [
        data.data_window?.start,
        data.data_window?.end
      ].filter(Boolean).join(" – ") ||
      "当前分析窗口";

    renderTopics(data, "weibo");
    renderTopics(data, "douban");

    renderDissatisfaction(data, "weibo");
    renderDissatisfaction(data, "douban");

    renderTargetComparison(data);
    renderPlatformInsights(data);
  })
  .catch(err => {
    console.error(err);

    document.body.insertAdjacentHTML(
      "beforeend",
      `
        <div style="
          position:fixed;
          left:20px;
          bottom:20px;
          z-index:100;
          background:#fff;
          border:1px solid #ddd;
          border-radius:14px;
          padding:12px 16px;
          color:#b22;">
          数据读取失败：${esc(err.message)}
        </div>
      `
    );
  });
