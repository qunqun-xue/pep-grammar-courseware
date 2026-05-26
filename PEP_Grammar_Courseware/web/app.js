(function () {
  const lessons = Array.isArray(window.LESSONS) ? window.LESSONS : [];
  if (!lessons.length) {
    document.body.innerHTML = "<p style='padding:20px;'>未检测到课程数据，请检查 lessons-data.js。</p>";
    return;
  }

  const scenePromptMap = {
    L01: "卡通风语法岛地图，五个区域，明亮小学课堂风",
    L02: "机器人句子工厂，S/V/O零件卡，儿童科幻插画",
    L03: "超市货架，可数与不可数食物分区，标签清晰",
    L04: "早餐餐桌，egg/apple/milk/bread，温暖晨光",
    L05: "三个学生交换文具，代词气泡对话框",
    L06: "班级点名场景，am/is/are标牌，活泼风格",
    L07: "卧室俯视图，there is/are 标签，物品定位清楚",
    L08: "日常时间轴，起床上学写作业，清晰时间图标",
    L09: "直播画面分屏，多人同时动作，进行时标签",
    L10: "昨天活动照片墙，足球作业看电视，回忆滤镜",
    L11: "周末动物园场景，went/ate/saw 对话气泡",
    L12: "周末计划板，天气图标与计划便签，未来感",
    L13: "时光隧道 past-now-future，四种时态卡片",
    L14: "校园规则海报墙，can/must/should 图标化",
    L15: "运动会场景，快跑与认真写字对比，形副标签",
    L16: "三名运动员领奖台，比较级与最高级标签",
    L17: "教室地图+日程表，in/on/at 可视化",
    L18: "校园采访现场，记者话筒与问号元素",
    L19: "四格漫画故事，and/but/because/if 连接词桥",
    L20: "密室闯关地图，四道语法关卡，英雄通关风"
  };

  const el = {
    lessonList: document.getElementById("lesson-list"),
    lessonTitle: document.getElementById("lesson-title"),
    lessonContent: document.getElementById("lesson-content"),
    progressText: document.getElementById("progress-text"),
    prevBtn: document.getElementById("prev-btn"),
    nextBtn: document.getElementById("next-btn"),
    copyLinkBtn: document.getElementById("copy-link-btn"),
    scenePrompt: document.getElementById("scene-prompt"),
    sceneId: document.getElementById("scene-id")
  };

  const idToIndex = new Map(lessons.map((lesson, idx) => [lesson.id, idx]));
  const state = { index: 0 };

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function formatInline(text) {
    const escaped = escapeHtml(text);
    return escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  function markdownToHtml(markdown) {
    const lines = markdown.split(/\r?\n/);
    let html = "";
    let listType = null;

    function closeList() {
      if (listType) {
        html += `</${listType}>`;
        listType = null;
      }
    }

    lines.forEach((rawLine) => {
      const line = rawLine.trimEnd();
      if (!line.trim()) {
        closeList();
        return;
      }

      const headingMatch = line.match(/^###\s+(.+)/);
      if (headingMatch) {
        closeList();
        html += `<h3>${formatInline(headingMatch[1])}</h3>`;
        return;
      }

      if (/^---+$/.test(line.trim())) {
        closeList();
        return;
      }

      const unorderedMatch = line.match(/^-\s+(.+)/);
      if (unorderedMatch) {
        if (listType !== "ul") {
          closeList();
          html += "<ul>";
          listType = "ul";
        }
        html += `<li>${formatInline(unorderedMatch[1])}</li>`;
        return;
      }

      const orderedMatch = line.match(/^\d+\.\s+(.+)/);
      if (orderedMatch) {
        if (listType !== "ol") {
          closeList();
          html += "<ol>";
          listType = "ol";
        }
        html += `<li>${formatInline(orderedMatch[1])}</li>`;
        return;
      }

      closeList();
      html += `<p>${formatInline(line.trim())}</p>`;
    });

    closeList();
    return html;
  }

  function sectionClassName(heading) {
    const key = heading.toLowerCase().replace(/[^\w]/g, "");
    return `section-${key}`;
  }

  function splitSections(markdown) {
    const lines = markdown.split(/\r?\n/);
    const sections = [];
    let current = null;

    lines.forEach((line) => {
      const headingMatch = line.match(/^###\s+(.+)/);
      if (headingMatch) {
        if (current) {
          sections.push(current);
        }
        current = { heading: headingMatch[1].trim(), lines: [] };
        return;
      }
      if (!current) {
        return;
      }
      current.lines.push(line);
    });

    if (current) {
      sections.push(current);
    }
    return sections;
  }

  function renderLesson(idx) {
    const lesson = lessons[idx];
    state.index = idx;

    el.lessonTitle.textContent = `${lesson.id} ${lesson.title}`;
    el.progressText.textContent = `${lesson.id} / L20`;
    el.sceneId.textContent = lesson.id;
    el.scenePrompt.textContent = scenePromptMap[lesson.id] || "课堂情景图";

    const sections = splitSections(lesson.markdown);
    el.lessonContent.innerHTML = sections
      .map((section) => {
        const contentHtml = markdownToHtml(section.lines.join("\n"));
        return [
          `<section class="section-card ${sectionClassName(section.heading)}">`,
          `<h3>${escapeHtml(section.heading)}</h3>`,
          contentHtml,
          "</section>"
        ].join("");
      })
      .join("");

    el.prevBtn.disabled = idx === 0;
    el.nextBtn.disabled = idx === lessons.length - 1;

    const lessonButtons = el.lessonList.querySelectorAll(".lesson-link");
    lessonButtons.forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.index) === idx);
    });

    const nextHash = `#${lesson.id}`;
    if (window.location.hash !== nextHash) {
      history.replaceState(null, "", nextHash);
    }
  }

  function goToByIndex(nextIndex) {
    if (nextIndex < 0 || nextIndex >= lessons.length) {
      return;
    }
    renderLesson(nextIndex);
  }

  function initLessonList() {
    const fragment = document.createDocumentFragment();
    lessons.forEach((lesson, idx) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lesson-link";
      btn.dataset.index = String(idx);
      btn.textContent = `${lesson.id} ${lesson.title}`;
      btn.addEventListener("click", () => goToByIndex(idx));
      li.appendChild(btn);
      fragment.appendChild(li);
    });
    el.lessonList.appendChild(fragment);
  }

  function startFromHash() {
    const hash = window.location.hash.replace("#", "").trim().toUpperCase();
    if (idToIndex.has(hash)) {
      return idToIndex.get(hash);
    }
    return 0;
  }

  function bindEvents() {
    el.prevBtn.addEventListener("click", () => goToByIndex(state.index - 1));
    el.nextBtn.addEventListener("click", () => goToByIndex(state.index + 1));

    window.addEventListener("hashchange", () => {
      const hash = window.location.hash.replace("#", "").trim().toUpperCase();
      if (idToIndex.has(hash)) {
        goToByIndex(idToIndex.get(hash));
      }
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        goToByIndex(state.index - 1);
      }
      if (event.key === "ArrowRight") {
        goToByIndex(state.index + 1);
      }
    });

    el.copyLinkBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        el.copyLinkBtn.textContent = "已复制";
        setTimeout(() => {
          el.copyLinkBtn.textContent = "复制本课链接";
        }, 1200);
      } catch (_err) {
        el.copyLinkBtn.textContent = "复制失败";
        setTimeout(() => {
          el.copyLinkBtn.textContent = "复制本课链接";
        }, 1200);
      }
    });
  }

  initLessonList();
  bindEvents();
  renderLesson(startFromHash());
})();

