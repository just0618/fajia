const $ = s => document.querySelector(s);
const arr = x => Array.isArray(x) ? x : [];
const num = (x, fallback = 0) =>
  Number.isFinite(Number(x)) ? Number(x) : fallback;

const esc = v => String(v ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

let latestData = null;
let historyIndex = null;
let activeHistoryId = null;

const SUPPORTED_VERSIONS = new Set([
  "FAJIA_MONITOR_FRONTEND_PAYLOAD_V2.2",
  "FAJIA_MONITOR_FRONTEND_PAYLOAD_V2.4_PREVIEW",
  "FAJIA_MONITOR_FRONTEND_PAYLOAD_V2.4_FORMAL_CANDIDATE_V1.0"
]);

const STATUS_CN = {
  READY: "覆盖正常",
  HOLD: "暂缓展示",
  UNKNOWN: "状态未知",
  EVENT_CONCENTRATED: "事件集中",
  LOW_SAMPLE: "样本较少",
  NO_CURRENT_DATA: "暂无当前数据",
  BASELINE_NOT_WIRED: "趋势积累中",
  SNAPSHOT_HISTORY_PENDING: "历史快照积累中",
  DEGRADED: "部分覆盖",
  PARTIAL: "部分可用",
  AGING: "更新稍旧",
  STALE_FOR_LIVE: "快照较旧"
};

function statusCN(v) {
  return STATUS_CN[v] || v || "状态未知";
}

function fmtTime(v) {
  if (!v) return "";

  const d = new Date(v);

  if (Number.isNaN(d.getTime())) {
    return String(v);
  }

  return new Intl.DateTimeFormat(
    "zh-CN",
    {
      timeZone: "Asia/Taipei",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }
  ).format(d);
}

function fmtWindow(w) {
  if (!w) return "";

  const a = fmtTime(
    w.window_start || w.start
  );

  const b = fmtTime(
    w.window_end || w.end
  );

  return [a, b]
    .filter(Boolean)
    .join(" – ");
}

function emptyCard(text) {
  return `
    <div class="empty-card">
      ${esc(text)}
    </div>
  `;
}

function positiveSummary(x) {
  const aspect = String(
    x.aspect || ""
  ).toUpperCase();

  const category = String(
    x.category || ""
  );

  const title = String(
    x.title || ""
  );

  if (
    aspect === "APPEARANCE"
    || category.includes("人物")
  ) {
    return "讨论主要集中在外形状态、妆造与整体视觉呈现等正向评价。";
  }

  if (
    aspect === "INTERACTION"
    || category.includes("互动")
  ) {
    return "讨论主要集中在两人的互动细节、相处方式与同框表现。";
  }

  if (
    aspect === "RELEASE_SPEED"
    || title.includes("速度")
  ) {
    return "讨论主要集中在物料更新效率、发布速度与跟进节奏。";
  }

  if (
    aspect === "MATERIAL_CARE"
    || title.includes("用心")
  ) {
    return "讨论主要集中在物料细节、呈现完成度与内容设计上的用心程度。";
  }

  if (
    aspect.startsWith("MATERIAL_")
    || category.includes("物料")
    || category.includes("运营")
  ) {
    return "讨论主要集中在物料质量、内容呈现与发布体验等方面。";
  }

  if (
    aspect === "BUSINESS_FIT"
  ) {
    return "讨论主要集中在商务合作匹配度、品牌呈现与整体氛围。";
  }

  if (
    aspect === "PERFORMANCE"
  ) {
    return "讨论主要集中在现场或内容中的人物表现与完成度。";
  }

  return `围绕“${title || "该主题"}”形成了较集中的正向反馈。`;
}

function negativeSummary(x) {
  const category = String(
    x.category || ""
  );

  const title = String(
    x.title || ""
  );

  if (
    category.includes("组织")
    || title.includes("后援会")
  ) {
    return "讨论主要集中在组织安排、沟通机制、管理方式与执行过程。";
  }

  if (
    category.includes("数据")
    || title.includes("数据")
    || title.includes("点赞")
  ) {
    return "讨论主要集中在官宣反馈、互动数据与相关数据表现带来的担忧。";
  }

  if (
    category.includes("粉圈")
    || title.includes("粉丝")
  ) {
    return "讨论主要集中在部分粉丝行为、交流方式及其对整体讨论环境的影响。";
  }

  if (
    category.includes("应援")
    || title.includes("应援")
  ) {
    return "讨论主要集中在应援方案、资源安排与具体执行方式。";
  }

  if (
    category.includes("舆论")
    || title.includes("造谣")
    || title.includes("攻击")
  ) {
    return "讨论主要集中在造谣、攻击及外部负面信息扩散带来的影响。";
  }

  return `围绕“${title || "该主题"}”形成了较集中的负向反馈或担忧。`;
}

function themeCard(
  x,
  tone = "neutral"
) {
  const summary = tone === "positive"
    ? positiveSummary(x)
    : negativeSummary(x);

  return `
    <article class="theme-card ${tone}">
      <div class="theme-card-top">
        <span class="theme-category">
          ${esc(x.category || x.tier || "")}
        </span>

        <strong>
          ${num(x.support)} 条
        </strong>
      </div>

      <h3>
        ${esc(x.title || "未命名主题")}
      </h3>

      <p class="theme-summary">
        ${esc(summary)}
      </p>
    </article>
  `;
}

function platformSection(
  label,
  tone,
  status,
  notice,
  body
) {
  return `
    <article class="platform-section-card ${tone}">
      <div class="platform-section-head">
        <div>
          <div class="platform-section-label">
            ${esc(label)}
          </div>

          <span class="platform-section-status ${
            String(status || "UNKNOWN")
              .toLowerCase()
          }">
            ${esc(statusCN(status))}
          </span>
        </div>

        ${
          notice
            ? `
              <p>
                ${esc(notice)}
              </p>
            `
            : ""
        }
      </div>

      <div class="platform-section-body">
        ${body}
      </div>
    </article>
  `;
}

function recentTopicCards(items) {
  if (!items.length) {
    return emptyCard(
      "当前时间窗口内暂未形成满足独立证据要求的热点。"
    );
  }

  return `
    <div class="topic-grid platform-topic-grid">
      ${items.map(x => `
        <article class="topic-card">
          <div class="topic-rank">
            ${String(x.rank || "")
              .padStart(2, "0")}
          </div>

          <div class="topic-main">
            <div class="topic-family">
              ${esc(x.family_title || "")}
            </div>

            <h3>
              ${esc(
                x.title
                || x.family_title
                || "未命名议题"
              )}
            </h3>

            <p>
              ${esc(x.summary || "")}
            </p>

            <div class="chips">
              <span>
                ${num(
                  x.independent_support_count
                )} 条独立支持
              </span>

              ${
                x.evidence_tier
                  ? `
                    <span>
                      ${esc(x.evidence_tier)}
                    </span>
                  `
                  : ""
              }

              ${
                num(x.reaction_heat_count)
                  ? `
                    <span>
                      反应热度
                      ${num(
                        x.reaction_heat_count
                      )}
                    </span>
                  `
                  : ""
              }
            </div>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}


const SOURCE_PUBLIC_LABELS = {
  weibo_chaohua: "超话",
  weibo_comment: "评论区",
  weibo_repost: "转发区",
  douban_chat: "闲聊楼"
};

function buildPlatformSourceNote(
  data,
  platform,
  dataWindow
) {
  const sources =
    arr(
      data?.source_discussion?.sources
    ).filter(
      s => {
        const family =
          String(
            s.source_family || ""
          );

        return platform === "weibo"
          ? family.startsWith("weibo_")
          : family.startsWith("douban_");
      }
    );

  const active =
    sources.filter(
      s =>
        num(s.rows) > 0
        && (
          s.coverage?.status
          !== "NO_CURRENT_DATA"
        )
    );

  const unavailable =
    sources.filter(
      s =>
        num(s.rows) <= 0
        || (
          s.coverage?.status
          === "NO_CURRENT_DATA"
        )
    );

  const labels =
    active.map(
      s =>
        SOURCE_PUBLIC_LABELS[
          s.source_family
        ]
        || s.title
        || s.source_family
    );

  const unavailableLabels =
    unavailable.map(
      s =>
        SOURCE_PUBLIC_LABELS[
          s.source_family
        ]
        || s.title
        || s.source_family
    );

  const rows =
    active.reduce(
      (sum, s) =>
        sum + num(s.rows),
      0
    );

  const parts = [];

  if (labels.length) {
    parts.push(
      `数据来源：${labels.join(" · ")}`
    );
  } else {
    parts.push(
      "当前暂无可用来源"
    );
  }

  parts.push(
    `当前纳入 ${rows} 条讨论`
  );

  if (
    unavailableLabels.length
  ) {
    parts.push(
      `${
        unavailableLabels.join("、")
      }当前窗口暂无可用数据`
    );
  }

  if (dataWindow) {
    parts.push(
      `数据窗口 · ${
        fmtWindow(dataWindow)
      }`
    );
  }

  return (
    parts.join("；")
    + "。"
  );
}


function renderRecent(data) {
  const r =
    data.recent_topics || {};

  const box =
    $("#recent-platforms");

  if (!box) return;

  if (r.by_platform) {
    $("#recent-note").textContent =
      "样本量表示当前采集范围内纳入分析的讨论数量，不代表平台整体讨论规模。";

    const rows = [
      ["weibo", "微博", "weibo"],
      ["douban", "豆瓣", "douban"]
    ];

    box.innerHTML =
      rows.map(
        ([key, label, tone]) => {
          const b =
            r.by_platform[key]
            || {};

          let notice =
              buildPlatformSourceNote(
                data,
                key,
                b.data_window
              );

            if (
              b.status
              === "STALE_FOR_LIVE"
            ) {
              notice =
                "当前使用较旧快照，不作为实时结论。 "
                + notice;
            }

          return platformSection(
            label,
            tone,
            b.status || "UNKNOWN",
            notice,
            recentTopicCards(
              arr(b.items)
            )
          );
        }
      ).join("");

    return;
  }

  $("#recent-note").textContent =
    r.notice
    || (
      r.data_window
        ? `历史数据窗口 · ${
            fmtWindow(
              r.data_window
            )
          }`
        : "历史快照"
    );

  box.innerHTML =
    platformSection(
      "历史快照 · 综合",
      "legacy",
      r.status || "UNKNOWN",
      "该历史版本尚未保存微博 / 豆瓣拆分。",
      recentTopicCards(
        arr(r.items)
      )
    );
}

function renderPositive(data) {
  const p =
    data.positive_feedback || {};

  const box =
    $("#positive-platforms");

  if (!box) return;

  $("#positive-note").textContent =
    p.notice
    || "正向反馈按微博与豆瓣分别统计，避免总体数字掩盖平台差异。";

  if (p.by_platform) {
    const rows = [
      ["weibo", "微博", "weibo"],
      ["douban", "豆瓣", "douban"]
    ];

    box.innerHTML =
      rows.map(
        ([key, label, tone]) => {
          const b =
            p.by_platform[key]
            || {};

          const items =
            arr(b.main_themes);

          const body =
            items.length
              ? `
                <div class="platform-theme-list">
                  ${items
                    .map(
                      x => themeCard(
                        x,
                        "positive"
                      )
                    )
                    .join("")}
                </div>
              `
              : emptyCard(
                  "当前平台暂无足够稳定的正向主题。"
                );

          return platformSection(
            label,
            tone,
            b.status || p.status || "READY",
            "",
            body
          );
        }
      ).join("");

    return;
  }

  const items =
    arr(p.main_themes);

  box.innerHTML =
    platformSection(
      "历史快照 · 综合",
      "legacy",
      p.status || "READY",
      "该历史版本尚未保存平台拆分。",
      items.length
        ? `
          <div class="platform-theme-list">
            ${items
              .map(
                x => themeCard(
                  x,
                  "positive"
                )
              )
              .join("")}
          </div>
        `
        : emptyCard(
            "当前窗口暂无足够稳定的正向主题。"
          )
    );
}

function renderNegative(data) {
  const n =
    data.negative_feedback || {};

  const box =
    $("#negative-platforms");

  if (!box) return;

  $("#negative-note").textContent =
    n.description
    || "汇总本期讨论中较明显的负向反馈、担忧、争议与批评，并按平台分别呈现。";

  if (n.by_platform) {
    const rows = [
      ["weibo", "微博", "weibo"],
      ["douban", "豆瓣", "douban"]
    ];

    box.innerHTML =
      rows.map(
        ([key, label, tone]) => {
          const b =
            n.by_platform[key]
            || {};

          const items =
            arr(b.main_themes);

          const body =
            items.length
              ? `
                <div class="platform-theme-list">
                  ${items
                    .map(
                      x => themeCard(
                        x,
                        "negative"
                      )
                    )
                    .join("")}
                </div>
              `
              : emptyCard(
                  "当前平台暂无足够稳定的负向主题。"
                );

          return platformSection(
            label,
            tone,
            b.status || n.status || "READY",
            "",
            body
          );
        }
      ).join("");

    return;
  }

  const items =
    arr(n.main_themes);

  box.innerHTML =
    platformSection(
      "历史快照 · 综合",
      "legacy",
      n.status || "READY",
      "该历史版本尚未保存平台拆分。",
      items.length
        ? `
          <div class="platform-theme-list">
            ${items
              .map(
                x => themeCard(
                  x,
                  "negative"
                )
              )
              .join("")}
          </div>
        `
        : emptyCard(
            "当前窗口暂无足够稳定的负向主题。"
          )
    );
}

function renderTargets(data) {
  const t =
    data.negative_targets || {};

  const items =
    arr(t.targets);

  const max = Math.max(
    1,
    ...items.map(
      x => num(x.support)
    )
  );

  const warning =
    t.unresolved_review || {};

  $("#negative-target-warning")
    .innerHTML =
    warning.count
      ? `
        <div class="warning-card">
          ${esc(
            warning.notice
            || `当前有 ${warning.count} 条负面讨论尚未稳定归因。`
          )}
        </div>
      `
      : "";

  $("#negative-targets")
    .innerHTML =
    items.length
      ? items.map(x => {
          const formalSplit =
              t.platform_split_status
              === "PASS";

            const splitRows =
              t.by_platform || {};

            const findPlatformCount =
              platform => {
                const row =
                  arr(
                    splitRows[platform]
                  ).find(
                    y =>
                      y.title === x.title
                      && y.category === x.category
                  );

                return num(
                  row
                    ? row.support
                    : 0
                );
              };

            const pc =
              x.platform_counts
              || (
                formalSplit
                  ? {
                      weibo:
                        findPlatformCount(
                          "weibo"
                        ),
                      douban:
                        findPlatformCount(
                          "douban"
                        )
                    }
                  : null
              );

          const w =
            pc
              ? num(pc.weibo)
              : 0;

          const d =
            pc
              ? num(pc.douban)
              : 0;

          const splitTotal =
            Math.max(
              1,
              w + d
            );

          return `
            <div class="target-row">
              <div class="target-head">
                <strong>
                  ${esc(
                    x.title
                    || "其他"
                  )}
                </strong>

                <span>
                  ${num(x.support)} 条
                </span>
              </div>

              <div class="bar">
                <span
                  style="width:${
                    Math.max(
                      3,
                      Math.min(
                        100,
                        num(x.support)
                        / max
                        * 100
                      )
                    )
                  }%"
                ></span>
              </div>

              ${
                pc
                  ? `
                    <div class="target-platform-line">
                      <span class="weibo">
                        微博 ${w}
                      </span>

                      <span class="douban">
                        豆瓣 ${d}
                      </span>
                    </div>

                    <div class="target-split-bar">
                      ${
                        w
                          ? `
                            <span
                              class="weibo"
                              style="width:${
                                w / splitTotal * 100
                              }%"
                            ></span>
                          `
                          : ""
                      }

                      ${
                        d
                          ? `
                            <span
                              class="douban"
                              style="width:${
                                d / splitTotal * 100
                              }%"
                            ></span>
                          `
                          : ""
                      }
                    </div>
                  `
                  : ""
              }

              <div class="target-category">
                ${esc(
                  x.category
                  || ""
                )}
              </div>
            </div>
          `;
        }).join("")
      : emptyCard(
          "当前没有可稳定归因的负面对象。"
        );
}

function sourceCard(s) {
  const cov =
    s.coverage || {};

  const topics =
    arr(s.topic_support)
      .slice(0, 5);

  const status =
    cov.status || "UNKNOWN";

  const notice =
    s.notice
    || cov.notice
    || "";

  return `
    <article class="source-card">
      <div class="source-card-head">
        <div>
          <span
            class="source-status ${status.toLowerCase()}"
          >
            ${esc(statusCN(status))}
          </span>

          <h3>
            ${esc(
              s.title
              || s.source_family
              || "来源"
            )}
          </h3>
        </div>

        <strong>
          ${num(s.rows)} 条
        </strong>
      </div>

      ${
        notice
          ? `
            <div class="source-notice">
              ${esc(notice)}
            </div>
          `
          : ""
      }

      <div class="source-topic-list">
        ${
          topics.length
            ? topics.map(x => `
              <div class="source-topic-row">
                <span>
                  ${esc(
                    x.title
                      || x.display_title
                      || x.ontology_label
                    || x.topic_code
                    || ""
                  )}
                </span>

                <strong>
                  ${num(
                    x.support_rows
                  )} 条
                </strong>
              </div>
            `).join("")
            : `
              <div class="muted">
                当前暂无可展示主题。
              </div>
            `
        }
      </div>
    </article>
  `;
}

function renderSources(data) {
  const s =
    data.source_discussion || {};

  const items =
    arr(s.sources);

  $("#source-discussion")
    .innerHTML =
    items.length
      ? items
          .map(sourceCard)
          .join("")
      : emptyCard(
          "当前暂无来源级讨论数据。"
        );
}

function aggregateTopics(
  sources
) {
  const map =
    new Map();

  sources.forEach(s => {
    arr(s.topic_support)
      .forEach(t => {
        const name =
          t.title
            || t.display_title
            || t.ontology_label
          || t.topic_code
          || "其他";

        map.set(
          name,
          (
            map.get(name)
            || 0
          )
          + num(t.support_rows)
        );
      });
  });

  return [...map.entries()]
    .map(
      ([title, support]) => ({
        title,
        support
      })
    )
    .sort(
      (a, b) =>
        b.support - a.support
    )
    .slice(0, 6);
}

function platformCard(
  title,
  rows,
  topics,
  tone
) {
  return `
    <article class="platform-card ${tone}">
      <div class="platform-card-head">
        <div>
          <div class="platform-label">
            ${esc(title)}
          </div>

          <div class="platform-count">
            ${num(rows)}
            <span>条当前讨论</span>
          </div>
        </div>
      </div>

      <div class="platform-topic-list">
        ${
          topics.length
            ? topics.map(
              (x, i) => `
                <div class="platform-topic-row">
                  <span class="platform-topic-rank">
                    ${String(i + 1)
                      .padStart(2, "0")}
                  </span>

                  <span class="platform-topic-name">
                    ${esc(x.title)}
                  </span>

                  <strong>
                    ${num(x.support)}
                  </strong>
                </div>
              `
            ).join("")
            : `
              <div class="muted">
                当前暂无足够主题数据。
              </div>
            `
        }
      </div>

      <div class="platform-footnote">
        上方为主题支持量，一条讨论可能同时涉及多个主题。
      </div>
    </article>
  `;
}

function insightCard(x) {
  const level =
    String(
      x.level
        || x.type
        || "DIRECT"
    ).toUpperCase();

  return `
    <article class="insight-card">
      <span class="insight-badge ${
        level.toLowerCase()
      }">
        ${esc(level)}
      </span>

      <h3>
        ${esc(x.title || "")}
      </h3>

      <p>
        ${esc(x.statement
          || x.summary
          || "")}
      </p>

      <details>
        <summary>
          证据与边界
        </summary>

        ${
          arr(x.evidence).length
            ? `
              <ul class="evidence-list">
                ${arr(x.evidence)
                  .map(
                    e => `
                      <li>
                        ${esc(e)}
                      </li>
                    `
                  )
                  .join("")}
              </ul>
            `
            : ""
        }

        ${
          x.guardrail
            ? `
              <p class="insight-guardrail">
                ${esc(x.guardrail)}
              </p>
            `
            : ""
        }
      </details>
    </article>
  `;
}

function renderPlatformComparison(
  data
) {
  const pc =
    data.platform_comparison || {};

  const source =
    data.source_discussion || {};

  const sources =
    arr(source.sources);

  const weiboSources =
    sources.filter(
      s =>
        String(
          s.source_family || ""
        ).startsWith("weibo_")
    );

  const doubanSources =
    sources.filter(
      s =>
        String(
          s.source_family || ""
        ).startsWith("douban_")
    );

  const box =
    $("#platform-comparison");

    const formalTopTopics =
      pc.top_topics || {};

    const weiboFormal =
      (
        formalTopTopics.weibo
        && !Array.isArray(
          formalTopTopics.weibo
        )
      )
        ? formalTopTopics.weibo
        : {};

    const doubanFormal =
      (
        formalTopTopics.douban
        && !Array.isArray(
          formalTopTopics.douban
        )
      )
        ? formalTopTopics.douban
        : {};

    const sourceRowCount =
      list =>
        list.reduce(
          (sum, s) =>
            sum + num(s.rows),
          0
        );

    const weiboRows =
      num(
        pc.weibo_current_rows
        || weiboFormal.rows
        || sourceRowCount(
          weiboSources
        )
      );

    const doubanRows =
      num(
        pc.douban_current_rows
        || doubanFormal.rows
        || sourceRowCount(
          doubanSources
        )
      );

  if (
    !(
        pc.status === "READY"
        || pc.status === "PARTIAL"
      )
    || !weiboRows
    || !doubanRows
  ) {
    box.innerHTML = `
      <article class="state-card platform-comparison-state">
        <div class="state-status">
          ${esc(
            statusCN(
              pc.status
              || "UNKNOWN"
            )
          )}
        </div>

        <p>
          ${esc(
            pc.notice
            || "当前缺少足够双平台新数据，暂不生成总体差异结论。"
          )}
        </p>
      </article>
    `;

    return;
  }

  const explicit =
    pc.top_topics || {};

  const weiboTopics =
    arr(explicit.weibo).length
      ? arr(explicit.weibo)
      : aggregateTopics(
          weiboSources
        );

  const doubanTopics =
    arr(explicit.douban).length
      ? arr(explicit.douban)
      : aggregateTopics(
          doubanSources
        );

  const insights =
    arr(pc.insights);

  box.innerHTML = `
    <div class="platform-topic-comparison">
      ${platformCard(
        "微博",
        weiboRows,
        weiboTopics,
        "weibo"
      )}

      ${platformCard(
        "豆瓣",
        doubanRows,
        doubanTopics,
        "douban"
      )}
    </div>

    <div class="comparison-subhead">
      <div>
        <div class="section-kicker">
          INSIGHTS
        </div>

        <h3>
          平台差异观察
        </h3>
      </div>

      <p>
        DIRECT 为数据直接支持；
        INFERRED 为基于当前结构的归纳；
        HYPOTHESIS 仅表示待验证假设。
      </p>
    </div>

    ${
      insights.length
        ? `
          <div class="insight-grid">
            ${insights
              .map(insightCard)
              .join("")}
          </div>
        `
        : emptyCard(
            "当前尚未形成满足证据要求的平台差异洞察。"
          )
    }
  `;
}

function renderStateCard(
  id,
  section,
  fallback
) {
  const el =
    $(id);

  if (!el) return;

  const status =
    section?.status
    || "UNKNOWN";

  const notice =
    section?.notice
    || fallback;

  el.innerHTML = `
    <div
      class="state-status ${String(status).toLowerCase()}"
    >
      ${esc(statusCN(status))}
    </div>

    <p>
      ${esc(
        notice
        || "暂无更多信息。"
      )}
    </p>
  `;
}


function renderDiscussionChange(
  data
) {
  const dc =
    data?.discussion_change
    || {};

  const el =
    $("#discussion-change");

  if (!el) return;

  if (
    ![
      "SHORT_INTERVAL_STABLE",
      "READY"
    ].includes(
      String(dc.status || "")
    )
  ) {
    renderStateCard(
      "#discussion-change",
      dc,
      "趋势模块将在连续可比 V2.4 快照积累后接入。"
    );

    return;
  }

  const fmtShare = value => {
    if (
      value === null
      || value === undefined
    ) {
      return "—";
    }

    const n = Number(value);

    return Number.isFinite(n)
      ? `${(n * 100).toFixed(1)}%`
      : "—";
  };

  const fmtDelta = value => {
    if (
      value === null
      || value === undefined
      || !Number.isFinite(
        Number(value)
      )
    ) {
      return "";
    }

    const n = Number(value);

    return `${
      n > 0 ? "+" : ""
    }${n.toFixed(1)}pp`;
  };

  const kindCN = {
    NEW: "新出现",
    RISING: "明显升温",
    MILD_RISING: "温和升温",
    FALLING: "明显降温",
    MILD_FALLING: "温和降温",
    DROPPED: "退出主要主题",
    STABLE: "基本稳定"
  };

  const platformCard =
    (key, label) => {

      const block =
        dc?.by_platform?.[key]
        || {};

      const changes =
        arr(block.changes)
          .slice()
          .sort(
            (a, b) =>
              Math.abs(
                num(b.delta_pp)
              )
              -
              Math.abs(
                num(a.delta_pp)
              )
          )
          .slice(0, 4);

      return `
        <article class="insight-card">
          <span class="insight-badge direct">
            ${esc(label)}
          </span>

          <h3>
            ${esc(
              dc.status === "SHORT_INTERVAL_STABLE"
                ? "当前主要主题波动较小"
                : "当前主要变化"
            )}
          </h3>

          ${
            changes.length
              ? `
                <ul class="evidence-list">
                  ${changes.map(x => `
                    <li>
                      <strong>
                        ${esc(x.title || "")}
                      </strong>
                      ·
                      ${esc(
                        fmtShare(
                          x.previous_share
                        )
                      )}
                      →
                      ${esc(
                        fmtShare(
                          x.current_share
                        )
                      )}
                      ${
                        fmtDelta(
                          x.delta_pp
                        )
                          ? `
                            ·
                            <strong>
                              ${esc(
                                fmtDelta(
                                  x.delta_pp
                                )
                              )}
                            </strong>
                          `
                          : ""
                      }
                      ·
                      ${esc(
                        kindCN[x.kind]
                        || x.kind
                        || ""
                      )}
                    </li>
                  `).join("")}
                </ul>
              `
              : `
                <p>
                  当前没有可展示的主题变化。
                </p>
              `
          }
        </article>
      `;
    };

  const statusTitle =
    dc.status === "SHORT_INTERVAL_STABLE"
      ? "短周期内讨论结构总体稳定"
      : "已形成可比趋势";

  const previous =
    dc.previous_snapshot
      ?.generated_at;

  const current =
    dc.current_snapshot
      ?.generated_at;

  el.innerHTML = `
    <div
      class="state-status ${
        String(dc.status)
          .toLowerCase()
      }"
    >
      ${esc(statusTitle)}
    </div>

    <p>
      ${esc(dc.notice || "")}
    </p>

    <div class="chips">
      <span>
        间隔
        ${num(
          dc.interval_hours
        ).toFixed(1)}h
      </span>

      <span>
        最大变化
        ${num(
          dc.max_abs_delta_pp
        ).toFixed(1)}pp
      </span>

      ${
        previous && current
          ? `
            <span>
              ${esc(fmtTime(previous))}
              →
              ${esc(fmtTime(current))}
            </span>
          `
          : ""
      }
    </div>

    <div
      class="insight-grid"
      style="margin-top:18px"
    >
      ${platformCard(
        "weibo",
        "微博"
      )}

      ${platformCard(
        "douban",
        "豆瓣"
      )}
    </div>
  `;
}


function showHistoryBanner(
  item
) {
  const banner =
    $("#history-banner");

  if (!banner) return;

  if (!item) {
    banner.hidden = true;
    banner.innerHTML = "";
    return;
  }

  banner.hidden = false;

  banner.innerHTML = `
    <div>
      <strong>
        正在查看历史快照
      </strong>

      <span>
        ${esc(
          fmtTime(
            item.generated_at
          )
        )}
      </span>
    </div>

    <button
      type="button"
      id="back-to-latest"
    >
      返回最新
    </button>
  `;

  $("#back-to-latest")
    ?.addEventListener(
      "click",
      () => loadLatest()
    );
}

function renderMeta(
  data,
  historyItem = null
) {
  const readiness =
    data.publish_readiness || {};

  $("#publish-status")
    .textContent =
    historyItem
      ? "历史快照"
      : (
        readiness.status
        === "DEGRADED"
          ? "可发布 · 有覆盖提示"
          : (
            readiness.status
            || "READY"
          )
      );

  $("#generated-at")
    .textContent =
    fmtTime(
      data.generated_at
    )
    || "—";

  $("#overall-window")
    .textContent =
    `${
      num(
        data.meta
          ?.current_72h_rows
      )
    } 条当前语义样本 · 72h`;

  $("#top-status-text")
    .textContent =
    historyItem
      ? "历史快照"
      : (
        data.platform_comparison
          ?.douban_current_rows
          > 0
          ? "双平台当前数据"
          : "微博当前数据"
      );

  showHistoryBanner(
    historyItem
  );
}

function renderDashboard(
  data,
  historyItem = null
) {
  renderMeta(
    data,
    historyItem
  );

  renderRecent(data);
  renderPositive(data);
  renderNegative(data);
  renderTargets(data);
  renderSources(data);
  renderPlatformComparison(data);

  renderDiscussionChange(
    data
  );

  renderHistory();
}

function historyCard(
  item
) {
  const active =
    item.id === activeHistoryId;

  const titles =
    arr(
      item.recent_titles
    )
    .slice(0, 2);

  return `
    <button
      type="button"
      class="history-item ${
        active
          ? "active"
          : ""
      }"
      data-history-id="${esc(
        item.id
      )}"
    >
      <div class="history-time">
        ${esc(
          fmtTime(
            item.generated_at
          )
        )}
      </div>

      <div class="history-stats">
        <span>
          ${num(
            item.current_72h_rows
          )} 条
        </span>

        <span>
          ${num(
            item.recent_topic_count
          )} 个热点
        </span>

        <span>
          微博
          ${num(
            item.weibo_current_rows
          )}
        </span>

        <span>
          豆瓣
          ${num(
            item.douban_current_rows
          )}
        </span>
      </div>

      ${
        titles.length
          ? `
            <div class="history-topic-preview">
              ${titles
                .map(
                  x => `<span>${esc(x)}</span>`
                )
                .join("")}
            </div>
          `
          : ""
      }
    </button>
  `;
}

function renderHistory() {
  const box =
    $("#history");

  if (!box) return;

  if (!historyIndex) {
    box.innerHTML =
      emptyCard(
        "正在读取历史快照…"
      );

    return;
  }

  const items =
    arr(
      historyIndex.snapshots
    );

  if (!items.length) {
    box.innerHTML =
      emptyCard(
        "当前还没有可查看的历史快照。"
      );

    return;
  }

  box.innerHTML = `
    <div class="history-toolbar">
      <div>
        已保留
        <strong>
          ${items.length}
        </strong>
        个公开快照
      </div>

      ${
        activeHistoryId
          ? `
            <button
              type="button"
              class="history-latest-button"
              id="history-latest-button"
            >
              返回最新
            </button>
          `
          : `
            <span>
              当前显示最新数据
            </span>
          `
      }
    </div>

    <div class="history-grid">
      ${items
        .map(historyCard)
        .join("")}
    </div>
  `;

  box.querySelectorAll(
    "[data-history-id]"
  ).forEach(el => {
    el.addEventListener(
      "click",
      () => {
        const id =
          el.dataset.historyId;

        loadHistorySnapshot(id);
      }
    );
  });

  $("#history-latest-button")
    ?.addEventListener(
      "click",
      () => loadLatest()
    );
}

async function loadHistoryIndex() {
  try {
    const r = await fetch(
      "./data/history/index.json",
      {
        cache: "no-store"
      }
    );

    if (!r.ok) {
      throw new Error(
        `HTTP ${r.status}`
      );
    }

    historyIndex =
      await r.json();

    renderHistory();
  } catch (err) {
    console.error(
      "history index",
      err
    );

    const box =
      $("#history");

    if (box) {
      box.innerHTML =
        emptyCard(
          "历史索引暂时不可用，当前实时看板不受影响。"
        );
    }
  }
}

async function loadHistorySnapshot(
  id
) {
  const item =
    arr(
      historyIndex?.snapshots
    ).find(
      x => x.id === id
    );

  if (!item) {
    return;
  }

  try {
    const r = await fetch(
      `./data/history/${item.file}`,
      {
        cache: "no-store"
      }
    );

    if (!r.ok) {
      throw new Error(
        `HTTP ${r.status}`
      );
    }

    const data =
      await r.json();

    if (
      !SUPPORTED_VERSIONS.has(
        data.version
      )
    ) {
      throw new Error(
        "历史快照数据合同不匹配"
      );
    }

    activeHistoryId =
      item.id;

    renderDashboard(
      data,
      item
    );

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  } catch (err) {
    console.error(
      "history snapshot",
      err
    );
  }
}

async function loadLatest() {
  try {
    const r = await fetch(
      "./data/dashboard.json",
      {
        cache: "no-store"
      }
    );

    if (!r.ok) {
      throw new Error(
        `HTTP ${r.status}`
      );
    }

    const data =
      await r.json();

    if (
      !SUPPORTED_VERSIONS.has(
        data.version
      )
    ) {
      throw new Error(
        "数据合同不匹配"
      );
    }

    latestData =
      data;

    activeHistoryId =
      null;

    renderDashboard(
      data,
      null
    );
  } catch (err) {
    console.error(err);

    document.body
      .insertAdjacentHTML(
        "beforeend",
        `
          <div class="floating-error">
            数据读取失败：
            ${esc(err.message)}
          </div>
        `
      );
  }
}

Promise.all([
  loadLatest(),
  loadHistoryIndex()
]);
