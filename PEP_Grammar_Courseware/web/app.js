(function () {
  const lessons = Array.isArray(window.LESSONS) ? window.LESSONS : [];
  const quizBank = window.QUIZ_BANK || {};

  if (!lessons.length) {
    document.body.innerHTML = "<p style='padding:20px;'>未检测到课程数据，请检查 lessons-data.js。</p>";
    return;
  }

  const STORAGE_PREFIX = "pep_quiz_state_v4_";

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

  const sectionNameMap = {
    LessonMeta: "今天你会",
    WarmupScene: "故事开场",
    RuleCard: "语法魔法卡",
    PitfallBox: "避坑雷达",
    PracticeA: "A关 拓展题（非自动批改）",
    PracticeB: "B关 拓展题（非自动批改）",
    PracticeC: "C关 拓展题（非自动批改）",
    FunMission: "游戏任务",
    ExitTicket: "通关小测"
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
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeAttr(text) {
    return escapeHtml(text).replace(/"/g, "&quot;");
  }

  function inlineFormat(text) {
    const escaped = escapeHtml(text);
    return escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  function normalizeText(text) {
    return String(text)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9?\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function splitSections(markdown) {
    const lines = markdown.split(/\r?\n/);
    const sections = [];
    let current = null;
    lines.forEach((line) => {
      const h = line.match(/^###\s+(.+)/);
      if (h) {
        if (current) {
          sections.push(current);
        }
        current = { heading: h[1].trim(), lines: [] };
        return;
      }
      if (current) {
        current.lines.push(line);
      }
    });
    if (current) {
      sections.push(current);
    }
    return sections;
  }

  function parseBullets(lines) {
    return lines
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2).trim());
  }

  function parseOrdered(lines) {
    return lines
      .map((line) => line.trim())
      .map((line) => {
        const m = line.match(/^\d+\.\s+(.+)/);
        return m ? m[1].trim() : null;
      })
      .filter(Boolean);
  }

  function loadQuizState(lessonId) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + lessonId);
      if (!raw) {
        return { answers: {}, results: {} };
      }
      const data = JSON.parse(raw);
      return {
        answers: data.answers || {},
        results: data.results || {}
      };
    } catch (_err) {
      return { answers: {}, results: {} };
    }
  }

  function saveQuizState(lessonId, data) {
    localStorage.setItem(STORAGE_PREFIX + lessonId, JSON.stringify(data));
  }

  function countQuizScore(lessonId) {
    const questions = quizBank[lessonId] || [];
    const quizState = loadQuizState(lessonId);
    let correct = 0;
    questions.forEach((q) => {
      if (quizState.results[q.id] === true) {
        correct += 1;
      }
    });
    return { correct, total: questions.length };
  }

  function evaluateQuestion(question, userAnswer) {
    if (question.type === "mcq") {
      return Number(userAnswer) === Number(question.answer);
    }

    if (!Array.isArray(question.answers) || question.answers.length === 0) {
      return false;
    }

    const normalizedUser = normalizeText(userAnswer || "");
    return question.answers.some((answer) => normalizeText(answer) === normalizedUser);
  }

  function findQuestion(lessonId, qid) {
    const questions = quizBank[lessonId] || [];
    return questions.find((q) => q.id === qid) || null;
  }

  function renderMeta(lines) {
    const bullets = parseBullets(lines);
    return [
      "<section class='section-card section-lessonmeta'>",
      `<h3>${sectionNameMap.LessonMeta}</h3>`,
      "<div class='goal-grid'>",
      bullets
        .map((item) => {
          const split = item.split("：");
          if (split.length > 1) {
            return `<div class='goal-item'><p class='goal-key'>${inlineFormat(split[0])}</p><p>${inlineFormat(split.slice(1).join("："))}</p></div>`;
          }
          return `<div class='goal-item'><p>${inlineFormat(item)}</p></div>`;
        })
        .join(""),
      "</div>",
      "</section>"
    ].join("");
  }

  function renderWarmup(lines) {
    const bullets = parseBullets(lines);
    const ordered = parseOrdered(lines);
    const sceneText = bullets.find((item) => item.startsWith("图：")) || "";
    return [
      "<section class='section-card section-warmupscene'>",
      `<h3>${sectionNameMap.WarmupScene}</h3>`,
      sceneText ? `<p class='scene-desc'>${inlineFormat(sceneText)}</p>` : "",
      "<div class='chat-list'>",
      ordered.map((line) => `<p class='chat-line'>${inlineFormat(line)}</p>`).join(""),
      "</div>",
      "</section>"
    ].join("");
  }

  function renderRule(lines) {
    const ordered = parseOrdered(lines);
    return [
      "<section class='section-card section-rulecard'>",
      `<h3>${sectionNameMap.RuleCard}</h3>`,
      "<div class='rule-list'>",
      ordered.map((item) => `<p class='rule-item'>${inlineFormat(item)}</p>`).join(""),
      "</div>",
      "</section>"
    ].join("");
  }

  function renderPitfall(lines) {
    const bullets = parseBullets(lines);
    const pairs = [];
    for (let i = 0; i < bullets.length; i += 1) {
      const text = bullets[i];
      if (!text.startsWith("错：")) {
        continue;
      }
      const wrong = text.replace(/^错：/, "").trim();
      const next = bullets[i + 1] || "";
      const right = next.startsWith("对：") ? next.replace(/^对：/, "").trim() : "";
      pairs.push({ wrong, right });
    }
    return [
      "<section class='section-card section-pitfallbox'>",
      `<h3>${sectionNameMap.PitfallBox}</h3>`,
      "<div class='pit-grid'>",
      pairs
        .map((pair) => {
          return [
            "<div class='pit-item'>",
            `<p><strong>易错句：</strong>${inlineFormat(pair.wrong)}</p>`,
            `<p><strong>正确句：</strong>${inlineFormat(pair.right)}</p>`,
            "</div>"
          ].join("");
        })
        .join(""),
      "</div>",
      "</section>"
    ].join("");
  }

  function renderPracticeSection(heading, lines) {
    const title = sectionNameMap[heading] || heading;
    const list = parseOrdered(lines);
    return [
      "<section class='section-card section-practice'>",
      `<h3>${title}</h3>`,
      "<p>提示：这部分是开放练习。自动批改请使用上方“智能批改闯关区”。</p>",
      "<ol>",
      list.map((item) => `<li>${inlineFormat(item)}</li>`).join(""),
      "</ol>",
      "</section>"
    ].join("");
  }

  function renderFun(lines) {
    const bullets = parseBullets(lines);
    return [
      "<section class='section-card section-funmission'>",
      `<h3>${sectionNameMap.FunMission}</h3>`,
      bullets.map((item) => `<p>${inlineFormat(item)}</p>`).join(""),
      "</section>"
    ].join("");
  }

  function renderExit(lines) {
    const list = parseOrdered(lines);
    const badgeLine = parseBullets(lines).find((item) => item.startsWith("自评徽章："));
    return [
      "<section class='section-card section-exitticket'>",
      `<h3>${sectionNameMap.ExitTicket}</h3>`,
      "<ol>",
      list.map((item) => `<li>${inlineFormat(item)}</li>`).join(""),
      "</ol>",
      badgeLine ? `<p class='badge-line'>${inlineFormat(badgeLine)}</p>` : "",
      "</section>"
    ].join("");
  }

  function questionInputHtml(lessonId, question, quizState) {
    const saved = quizState.answers[question.id];
    if (question.type === "mcq") {
      return [
        "<div class='quiz-options'>",
        question.options
          .map((option, idx) => {
            const checked = Number(saved) === idx ? "checked" : "";
            const inputId = `${lessonId}_${question.id}_${idx}`;
            return [
              "<label class='quiz-option' for='",
              inputId,
              "'>",
              `<input id='${inputId}' type='radio' name='${lessonId}_${question.id}' data-qid='${question.id}' data-qtype='mcq' value='${idx}' ${checked}>`,
              `<span>${inlineFormat(option)}</span>`,
              "</label>"
            ].join("");
          })
          .join(""),
        "</div>"
      ].join("");
    }

    if (question.type === "correct") {
      return `<textarea class='quiz-textarea' data-qid='${question.id}' data-qtype='text' placeholder='在这里改正句子'>${escapeHtml(saved || "")}</textarea>`;
    }

    return `<input class='quiz-input' type='text' data-qid='${question.id}' data-qtype='text' value='${escapeAttr(saved || "")}' placeholder='在这里输入答案'>`;
  }

  function feedbackClass(status) {
    if (status === true) {
      return "quiz-feedback correct";
    }
    if (status === false) {
      return "quiz-feedback wrong";
    }
    return "quiz-feedback";
  }

  function feedbackText(status) {
    if (status === true) {
      return "批改结果：正确";
    }
    if (status === false) {
      return "批改结果：错误，请再试一次";
    }
    return "批改结果：未批改";
  }

  function renderQuizSection(lessonId) {
    const questions = quizBank[lessonId] || [];
    if (!questions.length) {
      return "";
    }
    const quizState = loadQuizState(lessonId);
    const score = countQuizScore(lessonId);
    return [
      "<section class='section-card section-autoquiz' id='auto-quiz'>",
      "<h3>智能批改闯关区</h3>",
      "<p>在输入框里直接作答，点“提交批改”立即判断对错。改错题也可以直接批改。</p>",
      `<div class='quiz-toolbar'><p id='quiz-score' class='quiz-score'>当前得分：${score.correct} / ${score.total}</p><div class='quiz-tools'><button type='button' id='grade-all-btn' class='mini-btn'>一键批改全部</button><button type='button' id='reset-lesson-btn' class='mini-btn light'>重置本课答案</button></div></div>`,
      "<div class='quiz-list'>",
      questions
        .map((question, idx) => {
          const status = Object.prototype.hasOwnProperty.call(quizState.results, question.id)
            ? quizState.results[question.id]
            : null;
          return [
            `<article class='quiz-card' data-qid='${question.id}'>`,
            `<p class='quiz-title'>${idx + 1}. ${inlineFormat(question.prompt)}</p>`,
            questionInputHtml(lessonId, question, quizState),
            `<div class='quiz-actions'><button type='button' class='mini-btn submit-q-btn' data-qid='${question.id}'>提交批改</button><button type='button' class='mini-btn light show-answer-btn' data-qid='${question.id}'>查看答案</button></div>`,
            `<p class='${feedbackClass(status)}' data-role='feedback'>${feedbackText(status)}</p>`,
            "<p class='quiz-answer' data-role='answer'></p>",
            "</article>"
          ].join("");
        })
        .join(""),
      "</div>",
      "</section>"
    ].join("");
  }

  function renderLessonHtml(lesson) {
    const sections = splitSections(lesson.markdown);
    const html = [];
    html.push(renderQuizSection(lesson.id));

    sections.forEach((section) => {
      if (section.heading === "LessonMeta") {
        html.push(renderMeta(section.lines));
        return;
      }
      if (section.heading === "WarmupScene") {
        html.push(renderWarmup(section.lines));
        return;
      }
      if (section.heading === "RuleCard") {
        html.push(renderRule(section.lines));
        return;
      }
      if (section.heading === "PitfallBox") {
        html.push(renderPitfall(section.lines));
        return;
      }
      if (section.heading === "PracticeA" || section.heading === "PracticeB" || section.heading === "PracticeC") {
        html.push(renderPracticeSection(section.heading, section.lines));
        return;
      }
      if (section.heading === "FunMission") {
        html.push(renderFun(section.lines));
        return;
      }
      if (section.heading === "ExitTicket") {
        html.push(renderExit(section.lines));
      }
    });

    return html.join("");
  }

  function readQuestionAnswer(lessonId, qid) {
    const question = findQuestion(lessonId, qid);
    if (!question) {
      return "";
    }
    if (question.type === "mcq") {
      const checked = document.querySelector(`input[name='${lessonId}_${qid}']:checked`);
      return checked ? checked.value : "";
    }
    const node = document.querySelector(`[data-qid='${qid}'][data-qtype='text']`);
    return node ? node.value : "";
  }

  function writeFeedback(lessonId, qid, result, message) {
    const card = el.lessonContent.querySelector(`.quiz-card[data-qid='${qid}']`);
    if (!card) {
      return;
    }
    const feedback = card.querySelector("[data-role='feedback']");
    if (!feedback) {
      return;
    }
    feedback.className = feedbackClass(result);
    feedback.textContent = message;
  }

  function showAnswer(lessonId, qid) {
    const question = findQuestion(lessonId, qid);
    const card = el.lessonContent.querySelector(`.quiz-card[data-qid='${qid}']`);
    if (!question || !card) {
      return;
    }
    const answerNode = card.querySelector("[data-role='answer']");
    if (!answerNode) {
      return;
    }
    const answerText = Array.isArray(question.answers)
      ? question.answers[0]
      : question.options[question.answer];
    answerNode.textContent = "参考答案：" + answerText;
  }

  function gradeOne(lessonId, qid) {
    const question = findQuestion(lessonId, qid);
    if (!question) {
      return false;
    }
    const value = readQuestionAnswer(lessonId, qid);
    const quizState = loadQuizState(lessonId);
    quizState.answers[qid] = value;

    if (!String(value).trim()) {
      writeFeedback(lessonId, qid, null, "请先作答再批改");
      saveQuizState(lessonId, quizState);
      return false;
    }

    const correct = evaluateQuestion(question, value);
    quizState.results[qid] = correct;
    saveQuizState(lessonId, quizState);

    if (correct) {
      writeFeedback(lessonId, qid, true, "批改结果：正确");
    } else {
      writeFeedback(lessonId, qid, false, "批改结果：错误，请根据提示再改一次");
    }
    return correct;
  }

  function refreshScore(lessonId) {
    const scoreNode = document.getElementById("quiz-score");
    if (!scoreNode) {
      return;
    }
    const score = countQuizScore(lessonId);
    scoreNode.textContent = `当前得分：${score.correct} / ${score.total}`;
  }

  function bindQuizEvents(lessonId) {
    const quizSection = document.getElementById("auto-quiz");
    if (!quizSection) {
      return;
    }

    quizSection.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const qid = target.getAttribute("data-qid");
      if (!qid) {
        return;
      }
      const quizState = loadQuizState(lessonId);
      quizState.answers[qid] = readQuestionAnswer(lessonId, qid);
      saveQuizState(lessonId, quizState);
    });

    const submitButtons = quizSection.querySelectorAll(".submit-q-btn");
    submitButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const qid = btn.getAttribute("data-qid");
        if (!qid) {
          return;
        }
        gradeOne(lessonId, qid);
        refreshScore(lessonId);
        refreshLessonDoneMarks();
      });
    });

    const answerButtons = quizSection.querySelectorAll(".show-answer-btn");
    answerButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const qid = btn.getAttribute("data-qid");
        if (!qid) {
          return;
        }
        showAnswer(lessonId, qid);
      });
    });

    const gradeAllBtn = document.getElementById("grade-all-btn");
    if (gradeAllBtn) {
      gradeAllBtn.addEventListener("click", () => {
        const questions = quizBank[lessonId] || [];
        questions.forEach((q) => {
          gradeOne(lessonId, q.id);
        });
        refreshScore(lessonId);
        refreshLessonDoneMarks();
      });
    }

    const resetBtn = document.getElementById("reset-lesson-btn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        localStorage.removeItem(STORAGE_PREFIX + lessonId);
        renderLesson(state.index);
      });
    }
  }

  function isLessonDone(lessonId) {
    const questions = quizBank[lessonId] || [];
    if (!questions.length) {
      return false;
    }
    const quizState = loadQuizState(lessonId);
    return questions.every((q) => quizState.results[q.id] === true);
  }

  function refreshLessonDoneMarks() {
    const buttons = el.lessonList.querySelectorAll(".lesson-link");
    buttons.forEach((btn) => {
      const lessonId = btn.getAttribute("data-lesson-id");
      const markNode = btn.querySelector(".done-mark");
      if (!lessonId || !markNode) {
        return;
      }
      markNode.textContent = isLessonDone(lessonId) ? "全对" : "";
    });
  }

  function renderLesson(index) {
    const lesson = lessons[index];
    state.index = index;

    el.lessonTitle.textContent = `${lesson.id} ${lesson.title}`;
    el.progressText.textContent = `${lesson.id} / L20`;
    el.sceneId.textContent = lesson.id;
    el.scenePrompt.textContent = scenePromptMap[lesson.id] || "";
    el.lessonContent.innerHTML = renderLessonHtml(lesson);

    const buttons = el.lessonList.querySelectorAll(".lesson-link");
    buttons.forEach((btn) => {
      const isActive = Number(btn.getAttribute("data-index")) === index;
      btn.classList.toggle("active", isActive);
    });

    el.prevBtn.disabled = index === 0;
    el.nextBtn.disabled = index === lessons.length - 1;

    const hash = `#${lesson.id}`;
    if (window.location.hash !== hash) {
      history.replaceState(null, "", hash);
    }

    bindQuizEvents(lesson.id);
    refreshScore(lesson.id);
    refreshLessonDoneMarks();
  }

  function goTo(index) {
    if (index < 0 || index >= lessons.length) {
      return;
    }
    renderLesson(index);
  }

  function initLessonList() {
    const fragment = document.createDocumentFragment();
    lessons.forEach((lesson, idx) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lesson-link";
      btn.setAttribute("data-index", String(idx));
      btn.setAttribute("data-lesson-id", lesson.id);
      btn.innerHTML = `<span class='lesson-text'>${escapeHtml(lesson.id)} ${escapeHtml(lesson.title)}</span><span class='done-mark'></span>`;
      btn.addEventListener("click", () => goTo(idx));
      li.appendChild(btn);
      fragment.appendChild(li);
    });
    el.lessonList.appendChild(fragment);
  }

  function startIndexFromHash() {
    const hash = window.location.hash.replace("#", "").trim().toUpperCase();
    if (idToIndex.has(hash)) {
      return idToIndex.get(hash);
    }
    return 0;
  }

  function bindGlobalEvents() {
    el.prevBtn.addEventListener("click", () => goTo(state.index - 1));
    el.nextBtn.addEventListener("click", () => goTo(state.index + 1));

    window.addEventListener("hashchange", () => {
      const idx = startIndexFromHash();
      goTo(idx);
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        goTo(state.index - 1);
      }
      if (event.key === "ArrowRight") {
        goTo(state.index + 1);
      }
    });

    el.copyLinkBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        el.copyLinkBtn.textContent = "已复制";
      } catch (_err) {
        el.copyLinkBtn.textContent = "复制失败";
      }
      setTimeout(() => {
        el.copyLinkBtn.textContent = "复制本课链接";
      }, 1200);
    });
  }

  initLessonList();
  bindGlobalEvents();
  goTo(startIndexFromHash());
})();
