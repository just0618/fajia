(() => {
  "use strict";

  const arr =
    x => Array.isArray(x) ? x : [];

  const num =
    x => Number.isFinite(Number(x))
      ? Number(x)
      : 0;

  const esc = value =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  let payload = null;


  function sourceCounts(data) {
    const counts =
      data?.meta
        ?.current_72h_source_counts
      || {};

    let weibo = 0;
    let douban = 0;

    for (const [key, value]
      of Object.entries(counts)) {

      if (String(key)
        .startsWith("weibo_")) {
        weibo += num(value);
      }

      if (String(key)
        .startsWith("douban_")) {
        douban += num(value);
      }
    }

    const total =
      num(
        data?.meta
          ?.current_72h_rows
      )
      || weibo + douban;

    return {
      total,
      weibo,
      douban
    };
  }


  function fmtDateTime(value) {
    if (!value) return "—";

    const d =
      new Date(value);

    if (Number.isNaN(
      d.getTime()
    )) {
      return String(value);
    }

    return d.toLocaleString(
      "zh-CN",
      {
        hour12: false,
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }
    );
  }


  function renderStagingBanner(data) {
    const notice =
      data?.meta
        ?.staging_notice;

    if (!notice) return;

    let box =
      document.querySelector(
        ".v24-staging-banner"
      );

    if (!box) {
      box =
        document.createElement(
          "div"
        );

      box.className =
        "v24-staging-banner";

      const main =
        document.querySelector(
          "main"
        );

      if (main) {
        main.prepend(box);
      }
    }

    box.textContent =
      notice;
  }


  function renderOverview(data) {
    const hero =
      document.querySelector(
        ".hero"
      );

    if (!hero) return;

    let section =
      document.querySelector(
        "#v24-overview"
      );

    if (!section) {
      section =
        document.createElement(
          "section"
        );

      section.id =
        "v24-overview";

      section.className =
        "v24-overview";

      hero.insertAdjacentElement(
        "afterend",
        section
      );
    }

    const counts =
      sourceCounts(data);

    const wTime =
      fmtDateTime(
        data?.meta
          ?.weibo_recent_updated_at
      );

    const dTime =
      fmtDateTime(
        data?.meta
          ?.douban_recent_updated_at
      );

    section.innerHTML = `
      <div class="v24-overview-head">
        <div>
          <div class="section-kicker">
            CURRENT 72H
          </div>

          <h2>
            当前窗口概览
          </h2>
        </div>

        <p>
          总量用于描述当前覆盖规模；
          微博与豆瓣按来源字段分别汇总。
        </p>
      </div>

      <div class="v24-overview-grid">

        <article
          class="v24-overview-card total"
        >
          <div class="v24-overview-label">
            当前语义样本
          </div>

          <div class="v24-overview-value">
            ${counts.total}
            <span>条 / 72h</span>
          </div>

          <div class="v24-overview-meta">
            当前窗口覆盖总量
          </div>
        </article>

        <article
          class="v24-overview-card weibo"
        >
          <div class="v24-overview-label">
            微博
          </div>

          <div class="v24-overview-value">
            ${counts.weibo}
            <span>条</span>
          </div>

          <div class="v24-overview-meta">
            最近热点更新：
            ${esc(wTime)}
          </div>
        </article>

        <article
          class="v24-overview-card douban"
        >
          <div class="v24-overview-label">
            豆瓣
          </div>

          <div class="v24-overview-value">
            ${counts.douban}
            <span>条</span>
          </div>

          <div class="v24-overview-meta">
            最近热点更新：
            ${esc(dTime)}
          </div>
        </article>

      </div>
    `;
  }


  function installMobileTabs(
    selector
  ) {
    const grid =
      document.querySelector(
        selector
      );

    if (!grid) return;

    const weibo =
      grid.querySelector(
        ".platform-section-card.weibo"
      );

    const douban =
      grid.querySelector(
        ".platform-section-card.douban"
      );

    if (!weibo || !douban) {
      return;
    }

    const key =
      selector.replace(
        /[^a-z0-9]/gi,
        "-"
      );

    let tabs =
      grid.previousElementSibling;

    if (
      !tabs
      || !tabs.classList
        .contains(
          "v24-mobile-tabs"
        )
    ) {
      tabs =
        document.createElement(
          "div"
        );

      tabs.className =
        "v24-mobile-tabs";

      tabs.dataset.for =
        key;

      tabs.innerHTML = `
        <button
          type="button"
          class="v24-mobile-tab active"
          data-platform="weibo"
          aria-selected="true"
        >
          微博
        </button>

        <button
          type="button"
          class="v24-mobile-tab"
          data-platform="douban"
          aria-selected="false"
        >
          豆瓣
        </button>
      `;

      grid.insertAdjacentElement(
        "beforebegin",
        tabs
      );
    }

    const buttons =
      arr([
        ...tabs.querySelectorAll(
          ".v24-mobile-tab"
        )
      ]);

    const cards = {
      weibo,
      douban
    };

    let active =
      tabs.dataset.active
      || "weibo";

    const apply = () => {
      const mobile =
        window.matchMedia(
          "(max-width: 900px)"
        ).matches;

      for (
        const [platform, card]
        of Object.entries(cards)
      ) {
        if (mobile) {
          card.dataset
            .v24MobileHidden =
            String(
              platform !== active
            );
        } else {
          delete card.dataset
            .v24MobileHidden;
        }
      }

      for (const button
        of buttons) {

        const selected =
          button.dataset
            .platform
          === active;

        button.classList.toggle(
          "active",
          selected
        );

        button.setAttribute(
          "aria-selected",
          String(selected)
        );
      }
    };

    if (
      tabs.dataset.bound
      !== "1"
    ) {
      for (const button
        of buttons) {

        button.addEventListener(
          "click",
          () => {
            active =
              button.dataset
                .platform
              || "weibo";

            tabs.dataset.active =
              active;

            apply();
          }
        );
      }

      window.addEventListener(
        "resize",
        apply,
        {
          passive: true
        }
      );

      tabs.dataset.bound =
        "1";
    }

    apply();
  }


  function enforceDoubanPending(
    data
  ) {
    const block =
      data?.recent_topics
        ?.by_platform
        ?.douban
      || {};

    const ready =
      block.publishable
        !== false
      && arr(block.items).length > 0
      && ![
        "PENDING_FRESH",
        "STALE_FOR_LIVE",
        "NO_CURRENT_DATA"
      ].includes(
        String(block.status)
      );

    if (ready) return;

    const card =
      document.querySelector(
        "#recent-platforms "
        + ".platform-section-card.douban"
      );

    if (!card) return;

    const status =
      card.querySelector(
        ".platform-section-status"
      );

    if (status) {
      status.textContent =
        "数据准备中";

      status.classList.add(
        "pending"
      );
    }

    const body =
      card.querySelector(
        ".platform-section-body"
      );

    if (body) {
      body.innerHTML = `
        <div class="v24-pending-card">
          ${esc(
            block.notice
            || "Fresh Douban recent topics "
            + "尚未完成，本栏暂不展示历史热点。"
          )}
        </div>
      `;
    }
  }


  function normalizeTitle(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
  }


  function topicList(block) {
    if (Array.isArray(block)) {
      return block;
    }

    if (
      block
      && Array.isArray(
        block.topics
      )
    ) {
      return block.topics;
    }

    return [];
  }


  function directInsightBuckets(
    data
  ) {
    const pc =
      data?.platform_comparison
      || {};

    const top =
      pc.top_topics || {};

    const w =
      topicList(
        top.weibo
      );

    const d =
      topicList(
        top.douban
      );

    const result = {
      common: [],
      difference: [],
      inferred: [],
      watch: []
    };

    const dMap =
      new Map(
        d.map(
          x => [
            normalizeTitle(
              x.title
            ),
            x
          ]
        )
      );

    const common =
      w.filter(
        x =>
          dMap.has(
            normalizeTitle(
              x.title
            )
          )
      )
      .slice(0, 3);

    if (common.length) {
      result.common.push({
        title:
          "两平台当前均出现的主题",
        text:
          common
            .map(
              x =>
                `「${x.title}」`
            )
            .join("、")
          + " 同时出现在当前已覆盖"
          + "微博与豆瓣主题中。"
      });
    }

    const wt =
      w[0]?.title;

    const dt =
      d[0]?.title;

    if (
      wt
      && dt
      && normalizeTitle(wt)
        !== normalizeTitle(dt)
    ) {
      result.difference.push({
        title:
          "当前讨论重点存在差异",
        text:
          `当前已覆盖微博样本中较多涉及「${wt}」，`
          + `豆瓣当前样本中较多涉及「${dt}」。`
      });
    }

    for (const item
      of arr(pc.insights)) {

      const type =
        String(
          item.type
          || item.level
          || ""
        ).toUpperCase();

      const bucket =
        String(
          item.bucket
          || item.group
          || ""
        ).toLowerCase();

      const entry = {
        title:
          item.title || "",
        text:
          item.statement
          || item.summary
          || ""
      };

      if (
        bucket === "common"
        || bucket === "shared"
      ) {
        result.common.push(
          entry
        );
      } else if (
        bucket === "difference"
        || bucket === "diff"
      ) {
        result.difference.push(
          entry
        );
      } else if (
        bucket === "watch"
        || type === "HYPOTHESIS"
      ) {
        result.watch.push(
          entry
        );
      } else if (
        type === "INFERRED"
      ) {
        result.inferred.push(
          entry
        );
      }
    }

    return result;
  }


  function bucketHTML(
    title,
    tag,
    items,
    empty
  ) {
    return `
      <article
        class="v24-insight-bucket"
      >
        <div
          class="v24-insight-bucket-head"
        >
          <div
            class="v24-insight-bucket-title"
          >
            ${esc(title)}
          </div>

          <span
            class="v24-insight-bucket-tag"
          >
            ${esc(tag)}
          </span>
        </div>

        ${
          items.length
            ? items
              .slice(0, 3)
              .map(
                x => `
                  <div
                    class="v24-insight-item"
                  >
                    <strong>
                      ${esc(x.title)}
                    </strong>

                    <p>
                      ${esc(x.text)}
                    </p>
                  </div>
                `
              )
              .join("")
            : `
              <div
                class="v24-insight-empty"
              >
                ${esc(empty)}
              </div>
            `
        }
      </article>
    `;
  }


  function renderInsightBuckets(
    data
  ) {
    const host =
      document.querySelector(
        "#platform-comparison"
      );

    if (!host) return;

    const buckets =
      directInsightBuckets(
        data
      );

    let shell =
      host.querySelector(
        ".v24-insight-shell"
      );

    if (!shell) {
      shell =
        document.createElement(
          "div"
        );

      shell.className =
        "v24-insight-shell";

      host.appendChild(shell);
    }

    shell.innerHTML = `
      <div
        class="v24-insight-shell-head"
      >
        <div>
          <div class="section-kicker">
            INSIGHTS
          </div>

          <h3>
            跨平台可以得出什么
          </h3>
        </div>

        <p>
          DIRECT 只描述当前样本直接支持的观察；
          INFERRED 为谨慎综合；
          待观察项不作为已确认事实。
        </p>
      </div>

      <div class="v24-insight-buckets">

        ${bucketHTML(
          "共同点",
          "DIRECT",
          buckets.common,
          "当前尚未识别出稳定、可直接支持的共同主题。"
        )}

        ${bucketHTML(
          "差异",
          "DIRECT",
          buckets.difference,
          "当前尚未形成可直接支持的平台差异描述。"
        )}

        ${bucketHTML(
          "推断",
          "INFERRED",
          buckets.inferred,
          "当前没有达到展示要求的跨平台推断。"
        )}

        ${bucketHTML(
          "待观察",
          "WATCH",
          buckets.watch,
          "等待后续连续窗口或更多证据后再提出机制性判断。"
        )}

      </div>

      <div class="v24-insight-guardrail">
        平台来源、采集结构与互动场景不同；
        此处仅作当前已覆盖样本的描述性比较，
        不把平台差异解释为受控因果效应。
      </div>
    `;

    document.body.classList.add(
      "v24-enhanced"
    );
  }


  function enhance(data) {
    renderStagingBanner(data);
    renderOverview(data);

    installMobileTabs(
      "#recent-platforms"
    );

    installMobileTabs(
      "#positive-platforms"
    );

    installMobileTabs(
      "#negative-platforms"
    );

    enforceDoubanPending(data);
    renderInsightBuckets(data);
  }


  async function loadPayload() {
    try {
      const response =
        await fetch(
          "./data/dashboard.json",
          {
            cache: "no-store"
          }
        );

      if (!response.ok) {
        return;
      }

      payload =
        await response.json();

      enhance(payload);

    } catch (_) {
      // Staging enhancement must never
      // break the existing dashboard.
    }
  }


  let enhancing = false;
  let scheduled = false;

  const observerConfig = {
    childList: true,
    subtree: true
  };

  const runEnhanceSafely = () => {
    if (!payload || enhancing) {
      return;
    }

    enhancing = true;
    observer.disconnect();

    try {
      enhance(payload);
    } finally {
      enhancing = false;

      observer.observe(
        document.body,
        observerConfig
      );
    }
  };

  const scheduleEnhance = () => {
    if (
      !payload
      || enhancing
      || scheduled
    ) {
      return;
    }

    scheduled = true;

    requestAnimationFrame(
      () => {
        scheduled = false;
        runEnhanceSafely();
      }
    );
  };

  const observer =
    new MutationObserver(
      scheduleEnhance
    );

  document.addEventListener(
    "DOMContentLoaded",
    () => {

      observer.observe(
        document.body,
        observerConfig
      );

      loadPayload();
    }
  );

})();
