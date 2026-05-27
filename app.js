(function () {
  const lessons = Array.isArray(window.LESSONS) ? window.LESSONS : [];
  const quizBank = window.QUIZ_BANK || {};
  if (!lessons.length) {
    document.body.innerHTML = "<p style='padding:20px;'>未检测到课程数据，请检查 lessons-data.js。</p>";
    return;
  }

  const LS_PREFIX = "pep_lesson_state_v6_";
  const TEST_KEY = "pep_test_state_v2";
  const WRONG_KEY = "pep_wrong_bank_v2";
  const TEST_SIZE = 20;
  const idToIndex = new Map(lessons.map((l, i) => [l.id, i]));
  const state = { mode: "lesson", lessonIndex: 0, testTab: "quiz", deck: [] };

  const el = {
    menuLesson: document.getElementById("menu-lesson"),
    menuTest: document.getElementById("menu-test"),
    copyLinkBtn: document.getElementById("copy-link-btn"),
    progressText: document.getElementById("progress-text"),
    lessonView: document.getElementById("lesson-view"),
    testView: document.getElementById("test-view"),
    lessonList: document.getElementById("lesson-list"),
    lessonTitle: document.getElementById("lesson-title"),
    lessonContent: document.getElementById("lesson-content"),
    sceneId: document.getElementById("scene-id"),
    scenePrompt: document.getElementById("scene-prompt"),
    lessonSummary: document.getElementById("lesson-summary"),
    prevBtn: document.getElementById("prev-btn"),
    nextBtn: document.getElementById("next-btn"),
    testTabs: document.querySelectorAll(".test-tab"),
    generateTestBtn: document.getElementById("generate-test-btn"),
    submitTestBtn: document.getElementById("submit-test-btn"),
    testScore: document.getElementById("test-score"),
    testList: document.getElementById("test-question-list"),
    wrongCount: document.getElementById("wrong-count"),
    clearWrongBtn: document.getElementById("clear-wrong-btn")
  };

  const scenePromptMap = {
    L01: "语法岛地图开营，先认识英语句子的基本骨架。",
    L02: "句子零件工厂，学会把主语、谓语、宾语拼起来。",
    L03: "超市采购挑战，分清可数与不可数名词。",
    L04: "早餐桌配对赛，弄懂 a/an/the 与 some/any。",
    L05: "角色换装秀，练习主格、宾格和物主代词。",
    L06: "Be 动词指挥官，快速判断 am / is / are。",
    L07: "空间定位图，学会 there is / are。",
    L08: "日常时间轴，掌握一般现在时的最常见用法。",
    L09: "直播间正在进行中，感受 now 的动作。",
    L10: "昨日新闻回放，规则动词过去式登场。",
    L11: "记忆翻牌赛，不规则动词一口气拿下。",
    L12: "周末计划板，表达计划和预测。",
    L13: "时光隧道，比较现在、过去和未来。",
    L14: "校园规则海报，理解 can / must / should。",
    L15: "描述力升级赛，让句子更生动。",
    L16: "运动会成绩榜，比较级和最高级出场。",
    L17: "教室地图与日程表，学会介词定位。",
    L18: "校园采访现场，问句和答句一起练。",
    L19: "故事接龙工坊，把句子连起来。",
    L20: "语法大冒险总复盘，查漏补缺。"
  };

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function attr(s) { return esc(s).replace(/"/g, "&quot;"); }
  function fmt(s) { return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>"); }
  function norm(s) {
    return String(s || "").normalize("NFKC").toLowerCase().replace(/[’'"`.,!?;:，。！？；：（）()\-]/g, "").replace(/\s+/g, "").trim();
  }
  function parseSections(md) {
    const out = [];
    let cur = null;
    String(md || "").split(/\r?\n/).forEach((line) => {
      const m = line.match(/^###\s+(.+)/);
      if (m) { if (cur) out.push(cur); cur = { heading: m[1].trim(), lines: [] }; return; }
      if (cur) cur.lines.push(line);
    });
    if (cur) out.push(cur);
    return out;
  }
  function bullets(lines) { return lines.map((l) => l.trim()).filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim()); }
  function ordered(lines) { return lines.map((l) => l.trim()).map((l) => (l.match(/^\d+\.\s+(.+)/) || [])[1]).filter(Boolean); }
  function loadJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
  function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function loadLessonState(id) { return loadJson(LS_PREFIX + id, { pitfall: {}, challenge: {} }); }
  function saveLessonState(id, data) { saveJson(LS_PREFIX + id, data); }
  function loadTestState() { return loadJson(TEST_KEY, { deck: [], answers: {}, results: {} }); }
  function saveTestState(data) { saveJson(TEST_KEY, data); }
  function loadWrongBank() { return loadJson(WRONG_KEY, []); }
  function saveWrongBank(items) { saveJson(WRONG_KEY, items); }

  function evaluate(q, val) {
    if (q.type === "mcq") return Number(val) === Number(q.answer);
    const answers = Array.isArray(q.answers) ? q.answers : [];
    const u = norm(val);
    return answers.some((a) => norm(a) === u);
  }
  function answerText(q) { return q.type === "mcq" ? q.options[q.answer] : (q.answers || [""])[0]; }
  function readValue(card) {
    const checked = card.querySelector("input[type='radio']:checked");
    if (checked) return checked.value;
    const input = card.querySelector("[data-answer-input]");
    return input ? input.value : "";
  }
  function setFeedback(card, ok, msg) {
    const node = card && card.querySelector("[data-feedback]"); if (!node) return;
    node.className = ok === true ? "quiz-feedback correct" : ok === false ? "quiz-feedback wrong" : "quiz-feedback";
    node.textContent = msg;
  }
  function setReveal(card, text) { const node = card && card.querySelector("[data-reveal]"); if (node) node.textContent = text; }

  function renderLessonList() {
    el.lessonList.innerHTML = lessons.map((l, i) => `<li><button type="button" class="lesson-link" data-index="${i}" data-lesson-id="${l.id}"><span class="lesson-text">${esc(l.id)} ${esc(l.title)}</span><span class="done-mark"></span></button></li>`).join("");
    el.lessonList.querySelectorAll(".lesson-link").forEach((btn) => btn.addEventListener("click", () => setLesson(Number(btn.dataset.index))));
  }

  function renderTeacherTalk(lines) {
    return `<section class="section-card section-teachertalk"><h3>老师讲透</h3><p class="section-intro">先听讲解，再做题。把这一课最核心的规则一次讲清。</p><div class="teacher-talk-list">${bullets(lines).map((t) => `<p class="teacher-talk-item">${fmt(t)}</p>`).join("")}</div></section>`;
  }
  function renderRuleCard(lines) {
    return `<section class="section-card section-rulecard"><h3>语法魔法卡</h3><div class="rule-list">${ordered(lines).map((t) => `<p class="rule-item">${fmt(t)}</p>`).join("")}</div></section>`;
  }
  function renderPitfall(lesson, lines) {
    const state = loadLessonState(lesson.id);
    const pairs = [];
    const b = bullets(lines);
    for (let i = 0; i < b.length; i++) {
      if (b[i].startsWith("错：")) pairs.push({ wrong: b[i].slice(2).trim(), right: (b[i + 1] || "").startsWith("对：") ? (b[i + 1].slice(2).trim()) : "" });
    }
    return `<section class="section-card section-pitfallbox"><h3>避坑雷达</h3><p class="section-intro">先看说明，再动手改。这里专门检查本课最容易混淆、最容易写错的地方。</p><div class="pitfall-list">${pairs.map((p, idx) => {
      const saved = state.pitfall[idx]?.answer || "";
      const status = state.pitfall[idx]?.status;
      return `<article class="pitfall-card" data-pitfall-index="${idx}" data-right="${attr(p.right)}"><p class="pitfall-label">需要避的坑</p><p class="pitfall-explain">${fmt(p.wrong)}</p><p class="pitfall-label">易错句示例</p><p class="pitfall-wrong">${fmt(p.wrong)}</p><p class="pitfall-label">你来订正</p><textarea class="quiz-textarea pitfall-input" data-answer-input placeholder="请在这里改正句子">${esc(saved)}</textarea><div class="quiz-actions"><button type="button" class="mini-btn pitfall-grade">批改</button><button type="button" class="mini-btn light pitfall-show">查看订正</button></div><p class="${status === true ? 'quiz-feedback correct' : status === false ? 'quiz-feedback wrong' : 'quiz-feedback'}" data-feedback>${status === true ? '批改结果：正确' : status === false ? '批改结果：再想一想' : '批改结果：未批改'}</p><p class="pitfall-right" data-reveal>${status === true ? `订正：${esc(p.right)}` : ''}</p></article>`;
    }).join("")}</div></section>`;
  }
  function renderPractice(title, lines) {
    return `<section class="section-card section-practice"><h3>${title}</h3><p class="section-intro">这是开放练习区。可以先口头说，再书写。</p><ol class="practice-list">${ordered(lines).map((t) => `<li>${fmt(t)}</li>`).join("")}</ol></section>`;
  }
  function renderExit(lines) {
    const badge = bullets(lines).find((t) => t.startsWith("自评徽章："));
    return `<section class="section-card section-exitticket"><h3>课堂回顾</h3><ol class="practice-list">${ordered(lines).map((t) => `<li>${fmt(t)}</li>`).join("")}</ol>${badge ? `<p class="badge-line">${fmt(badge)}</p>` : ''}</section>`;
  }
  function renderChallenge(lesson) {
    const qs = quizBank[lesson.id] || [];
    const state = loadLessonState(lesson.id);
    if (!qs.length) return "";
    return `<section class="section-card section-challenge"><h3>闯关挑战</h3><p class="section-intro">这一关可以直接输入答案，提交后系统会自动批改。改错题也支持批改。</p><div class="quiz-toolbar"><p class="quiz-score" data-lesson-score>当前得分：0 / ${qs.length}</p><div class="quiz-tools"><button type="button" class="mini-btn" data-lesson-grade-all>一键批改全部</button><button type="button" class="mini-btn light" data-lesson-reset>重置本课作答</button></div></div><div class="quiz-list">${qs.map((q, idx) => {
      const saved = state.challenge[q.id]?.answer ?? "";
      const status = state.challenge[q.id]?.status;
      return `<article class="quiz-card" data-qid="${q.id}" data-lesson-id="${lesson.id}"><p class="quiz-title">${idx + 1}. ${fmt(q.prompt)}</p>${q.type === 'mcq' ? `<div class="quiz-options">${q.options.map((o, i) => `<label class="quiz-option"><input type="radio" name="${lesson.id}_${q.id}" value="${i}" ${Number(saved) === i ? 'checked' : ''}><span>${fmt(o)}</span></label>`).join("")}</div>` : q.type === 'correct' ? `<textarea class="quiz-textarea" data-answer-input placeholder="在这里改正句子">${esc(saved)}</textarea>` : `<input class="quiz-input" data-answer-input type="text" value="${attr(saved)}" placeholder="在这里输入答案">`}<div class="quiz-actions"><button type="button" class="mini-btn lesson-grade">提交批改</button><button type="button" class="mini-btn light lesson-show">查看答案</button></div><p class="${status === true ? 'quiz-feedback correct' : status === false ? 'quiz-feedback wrong' : 'quiz-feedback'}" data-feedback>${status === true ? '批改结果：正确' : status === false ? '批改结果：错误' : '批改结果：未批改'}</p><p class="quiz-answer" data-reveal>${status === true ? `参考答案：${esc(answerText(q))}` : ''}</p></article>`;
    }).join("")}</div></section>`;
  }

  function renderLesson(lesson) {
    const sections = parseSections(lesson.markdown);
    const map = new Map(sections.map((s) => [s.heading, s.lines]));
    const html = [];
    if (map.has('TeacherTalk')) html.push(renderTeacherTalk(map.get('TeacherTalk')));
    if (map.has('RuleCard')) html.push(renderRuleCard(map.get('RuleCard')));
    if (map.has('PitfallBox')) html.push(renderPitfall(lesson, map.get('PitfallBox')));
    ['PracticeA', 'PracticeB', 'PracticeC'].forEach((h) => { if (map.has(h)) html.push(renderPractice(h.replace('Practice', '练习 '), map.get(h))); });
    if (map.has('ExitTicket')) html.push(renderExit(map.get('ExitTicket')));
    html.push(renderChallenge(lesson));
    return html.join('');
  }

  function markDone() {
    el.lessonList.querySelectorAll('.lesson-link').forEach((btn) => {
      const lessonId = btn.dataset.lessonId;
      const qs = quizBank[lessonId] || [];
      const st = loadLessonState(lessonId);
      const done = qs.length && qs.every((q) => st.challenge[q.id]?.status === true);
      const mark = btn.querySelector('.done-mark');
      if (mark) mark.textContent = done ? '全对' : '';
    });
  }

  function refreshLessonScore(lessonId) {
    const st = loadLessonState(lessonId);
    const qs = quizBank[lessonId] || [];
    const ok = qs.filter((q) => st.challenge[q.id]?.status === true).length;
    const score = el.lessonContent.querySelector('[data-lesson-score]');
    if (score) score.textContent = `当前得分：${ok} / ${qs.length}`;
  }

  function setLesson(index) {
    state.mode = 'lesson';
    state.lessonIndex = Math.max(0, Math.min(index, lessons.length - 1));
    el.lessonView.hidden = false;
    el.testView.hidden = true;
    el.menuLesson.classList.add('active');
    el.menuTest.classList.remove('active');
    const lesson = lessons[state.lessonIndex];
    el.lessonTitle.textContent = `${lesson.id} ${lesson.title}`;
    el.progressText.textContent = `${lesson.id} / L20`;
    el.sceneId.textContent = lesson.id;
    el.scenePrompt.textContent = scenePromptMap[lesson.id] || '';
    el.lessonSummary.textContent = scenePromptMap[lesson.id] || '';
    el.lessonContent.innerHTML = renderLesson(lesson);
    el.prevBtn.disabled = state.lessonIndex === 0;
    el.nextBtn.disabled = state.lessonIndex === lessons.length - 1;
    history.replaceState(null, '', `#lesson/${lesson.id}`);
    bindLessonEvents(lesson.id);
    markDone();
    refreshLessonScore(lesson.id);
  }

  function bindLessonEvents(lessonId) {
    const content = el.lessonContent;
    content.querySelectorAll('.pitfall-card').forEach((card) => {
      const idx = card.dataset.pitfallIndex;
      const input = card.querySelector('[data-answer-input]');
      const right = card.dataset.right || '';
      card.querySelector('.pitfall-grade').addEventListener('click', () => {
        const value = input ? input.value : '';
        const ok = evaluate({ type: 'fill', answers: [right] }, value);
        const st = loadLessonState(lessonId);
        st.pitfall[idx] = { answer: value, status: ok };
        saveLessonState(lessonId, st);
        setFeedback(card, ok, ok ? '批改结果：正确' : '批改结果：再想一想');
        setReveal(card, ok ? `订正：${right}` : '');
        if (!ok) upsertWrong({ key: `pitfall_${lessonId}_${idx}`, kind: 'pitfall', lessonId, questionId: `pitfall_${idx}`, prompt: card.querySelector('.pitfall-wrong')?.textContent || '', type: 'correct', answers: [right], userAnswer: value, sourceLessonId: lessonId }); else removeWrong(`pitfall_${lessonId}_${idx}`);
        updateWrongCount();
      });
      card.querySelector('.pitfall-show').addEventListener('click', () => setReveal(card, `订正：${right}`));
      input.addEventListener('input', () => {
        const st = loadLessonState(lessonId);
        st.pitfall[idx] = st.pitfall[idx] || {};
        st.pitfall[idx].answer = input.value;
        saveLessonState(lessonId, st);
      });
    });

    content.querySelectorAll('.quiz-card[data-lesson-id]').forEach((card) => {
      const qid = card.dataset.qid;
      const q = (quizBank[lessonId] || []).find((x) => x.id === qid);
      card.querySelectorAll("input[type='radio']").forEach((r) => r.addEventListener('change', () => {
        const st = loadLessonState(lessonId);
        st.challenge[qid] = st.challenge[qid] || {};
        st.challenge[qid].answer = readValue(card);
        saveLessonState(lessonId, st);
      }));
      const input = card.querySelector('[data-answer-input]');
      if (input) input.addEventListener('input', () => {
        const st = loadLessonState(lessonId);
        st.challenge[qid] = st.challenge[qid] || {};
        st.challenge[qid].answer = input.value;
        saveLessonState(lessonId, st);
      });
      card.querySelector('.lesson-grade').addEventListener('click', () => gradeLessonQuestion(lessonId, card, q));
      card.querySelector('.lesson-show').addEventListener('click', () => setReveal(card, `参考答案：${answerText(q)}`));
    });

    const gradeAll = content.querySelector('[data-lesson-grade-all]');
    gradeAll?.addEventListener('click', () => {
      (quizBank[lessonId] || []).forEach((q) => {
        const card = content.querySelector(`[data-qid='${q.id}']`);
        if (card) gradeLessonQuestion(lessonId, card, q);
      });
      refreshLessonScore(lessonId);
      markDone();
    });

    content.querySelector('[data-lesson-reset]')?.addEventListener('click', () => {
      localStorage.removeItem(LS_PREFIX + lessonId);
      setLesson(state.lessonIndex);
    });
  }

  function gradeLessonQuestion(lessonId, card, q) {
    const value = readValue(card);
    const st = loadLessonState(lessonId);
    st.challenge[q.id] = st.challenge[q.id] || {};
    st.challenge[q.id].answer = value;
    if (!String(value).trim()) {
      st.challenge[q.id].status = null;
      saveLessonState(lessonId, st);
      setFeedback(card, null, '批改结果：请先作答');
      return false;
    }
    const ok = evaluate(q, value);
    st.challenge[q.id].status = ok;
    saveLessonState(lessonId, st);
    setFeedback(card, ok, ok ? '批改结果：正确' : '批改结果：错误，请根据提示再改一次');
    setReveal(card, `参考答案：${answerText(q)}`);
    const key = `${lessonId}__${q.id}`;
    if (ok) removeWrong(key); else upsertWrong({ key, kind: 'lesson', lessonId, questionId: q.id, prompt: q.prompt, type: q.type, options: q.options || [], answers: q.answers || [], answer: q.answer, userAnswer: value, sourceLessonId: lessonId });
    updateWrongCount();
    refreshLessonScore(lessonId);
    markDone();
    return ok;
  }

  function updateWrongCount() { if (el.wrongCount) el.wrongCount.textContent = String(loadWrongBank().length); }
  function removeWrong(key) { saveWrongBank(loadWrongBank().filter((x) => x.key !== key)); }
  function upsertWrong(item) {
    const bank = loadWrongBank();
    const idx = bank.findIndex((x) => x.key === item.key);
    const next = { ...item, updatedAt: Date.now() };
    if (idx >= 0) bank[idx] = next; else bank.unshift(next);
    saveWrongBank(bank);
  }
  function rebuildTestDeck() {
    const all = [];
    Object.entries(quizBank).forEach(([lessonId, qs]) => qs.forEach((q) => all.push({ ...q, sourceLessonId: lessonId, key: `${lessonId}__${q.id}` })));
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    state.deck = all.slice(0, TEST_SIZE);
    saveTestState({ deck: state.deck, answers: {}, results: {} });
  }

  function renderTestList() {
    const testState = loadTestState();
    if (!state.deck.length) {
      rebuildTestDeck();
    } else {
      const persisted = testState.deck;
      if (Array.isArray(persisted) && persisted.length) state.deck = persisted;
    }
    const deck = state.deck;
    const html = deck.map((q, idx) => {
      const saved = testState.answers?.[q.key] ?? '';
      const status = testState.results?.[q.key];
      return `<article class="quiz-card" data-test-key="${q.key}" data-question-type="${q.type}"><p class="quiz-title">${idx + 1}. ${fmt(q.prompt)}</p>${q.type === 'mcq' ? `<div class="quiz-options">${q.options.map((o, i) => `<label class="quiz-option"><input type="radio" name="${q.key}" value="${i}" ${Number(saved) === i ? 'checked' : ''}><span>${fmt(o)}</span></label>`).join('')}</div>` : q.type === 'correct' ? `<textarea class="quiz-textarea" data-answer-input placeholder="在这里改正句子">${esc(saved)}</textarea>` : `<input class="quiz-input" data-answer-input type="text" value="${attr(saved)}" placeholder="在这里输入答案">`}<p class="${status === true ? 'quiz-feedback correct' : status === false ? 'quiz-feedback wrong' : 'quiz-feedback'}" data-feedback>${status === true ? '批改结果：正确' : status === false ? '批改结果：错误' : '批改结果：未批改'}</p><p class="quiz-answer" data-reveal>${status === true ? `参考答案：${esc(answerText(q))}` : ''}</p></article>`;
    }).join('');
    el.testList.innerHTML = html || '<section class="section-card"><h3>请先生成 20 题</h3></section>';
    el.testScore.textContent = `当前得分：${Object.values(testState.results || {}).filter(Boolean).length} / ${deck.length}`;
    el.testTabs.forEach((t) => t.classList.toggle('active', t.dataset.testTab === state.testTab));
    el.submitTestBtn.hidden = state.testTab !== 'quiz';
    el.generateTestBtn.hidden = state.testTab !== 'quiz';
    el.clearWrongBtn && (el.clearWrongBtn.hidden = state.testTab !== 'wrong');
    bindTestEvents();
    updateWrongCount();
  }

  function bindTestEvents() {
    if (state.testTab === 'quiz') {
      el.testList.querySelectorAll('.quiz-card[data-test-key]').forEach((card) => {
        const key = card.dataset.testKey;
        const q = state.deck.find((x) => x.key === key);
        if (!q) return;
        card.querySelectorAll("input[type='radio']").forEach((r) => r.addEventListener('change', () => {
          const st = loadTestState();
          st.answers[key] = readValue(card);
          saveTestState(st);
        }));
        const input = card.querySelector('[data-answer-input]');
        if (input) input.addEventListener('input', () => { const st = loadTestState(); st.answers[key] = input.value; saveTestState(st); });
      });
      return;
    }

    el.testList.querySelectorAll('.quiz-card[data-wrong-key]').forEach((card) => {
      const key = card.dataset.wrongKey;
      const item = loadWrongBank().find((x) => x.key === key);
      if (!item) return;
      const input = card.querySelector('[data-answer-input]');
      card.querySelectorAll("input[type='radio']").forEach((r) => r.addEventListener('change', () => {
        const bank = loadWrongBank();
        const target = bank.find((x) => x.key === key);
        if (target) { target.userAnswer = readValue(card); saveWrongBank(bank); }
      }));
      if (input) input.addEventListener('input', () => { const bank = loadWrongBank(); const target = bank.find((x) => x.key === key); if (target) { target.userAnswer = input.value; saveWrongBank(bank); } });
      card.querySelector('.wrong-grade').addEventListener('click', () => {
        const value = readValue(card);
        const ok = evaluate(item, value);
        setFeedback(card, ok, ok ? '批改结果：正确，已移出错题集' : '批改结果：错误，请继续订正');
        if (ok) { removeWrong(key); renderTest(); } else { const bank = loadWrongBank(); const target = bank.find((x) => x.key === key); if (target) { target.userAnswer = value; saveWrongBank(bank); } }
      });
      card.querySelector('.wrong-remove').addEventListener('click', () => { removeWrong(key); renderTest(); });
    });
  }

  function renderWrongList() {
    const items = loadWrongBank();
    if (!items.length) {
      el.testList.innerHTML = `<section class="section-card"><h3>错题集</h3><p>当前还没有错题。你在测试里做错的题会自动加入这里。</p></section>`;
      return;
    }
    el.testList.innerHTML = `<section class="section-card section-wrongbank"><h3>错题集</h3><p class="section-intro">错题会自动保存。你可以在这里重新作答，答对后会从错题集移除。</p><div class="quiz-list">${items.map((q, idx) => `<article class="quiz-card" data-wrong-key="${q.key}"><p class="quiz-title">${idx + 1}. ${fmt(q.prompt)}</p>${q.type === 'mcq' ? `<div class="quiz-options">${q.options.map((o, i) => `<label class="quiz-option"><input type="radio" name="wrong_${q.key}" value="${i}" ${Number(q.userAnswer) === i ? 'checked' : ''}><span>${fmt(o)}</span></label>`).join('')}</div>` : q.type === 'correct' ? `<textarea class="quiz-textarea" data-answer-input placeholder="在这里改正句子">${esc(q.userAnswer || '')}</textarea>` : `<input class="quiz-input" data-answer-input type="text" value="${attr(q.userAnswer || '')}" placeholder="在这里输入答案">`}<div class="quiz-actions"><button type="button" class="mini-btn wrong-grade">重新批改</button><button type="button" class="mini-btn light wrong-remove">移出错题集</button></div><p class="quiz-feedback">等待重新作答</p><p class="quiz-answer" data-reveal>参考答案：${esc(answerText(q))}</p></article>`).join('')}</div></section>`;
  }

  function renderTest() {
    el.lessonView.hidden = true;
    el.testView.hidden = false;
    el.menuLesson.classList.remove('active');
    el.menuTest.classList.add('active');
    el.testTabs.forEach((t) => t.classList.toggle('active', t.dataset.testTab === state.testTab));
    if (state.testTab === 'quiz') renderTestList(); else renderWrongList();
    history.replaceState(null, '', state.testTab === 'wrong' ? '#wrong' : '#test');
  }

  function setMode(mode, opts = {}) {
    state.mode = mode;
    if (mode === 'lesson') {
      setLesson(opts.index ?? state.lessonIndex);
    } else {
      state.testTab = opts.tab || state.testTab || 'quiz';
      renderTest();
    }
  }

  function parseRoute() {
    const hash = window.location.hash.replace(/^#/, '').trim();
    if (hash === 'test') return { mode: 'test', tab: 'quiz' };
    if (hash === 'wrong') return { mode: 'test', tab: 'wrong' };
    if (hash.startsWith('lesson/')) {
      const id = hash.split('/')[1]?.toUpperCase();
      return { mode: 'lesson', index: idToIndex.get(id) ?? 0 };
    }
    return { mode: 'lesson', index: 0 };
  }

  function bindGlobal() {
    el.menuLesson.addEventListener('click', () => setMode('lesson', { index: state.lessonIndex }));
    el.menuTest.addEventListener('click', () => { state.testTab = 'quiz'; setMode('test', { tab: 'quiz' }); });
    el.prevBtn.addEventListener('click', () => setLesson(state.lessonIndex - 1));
    el.nextBtn.addEventListener('click', () => setLesson(state.lessonIndex + 1));
    el.testTabs.forEach((tab) => tab.addEventListener('click', () => { state.testTab = tab.dataset.testTab || 'quiz'; if (state.mode !== 'test') setMode('test', { tab: state.testTab }); else renderTest(); }));
    el.generateTestBtn.addEventListener('click', () => { state.testTab = 'quiz'; rebuildTestDeck(); renderTest(); });
    el.submitTestBtn.addEventListener('click', () => {
      const st = loadTestState();
      state.deck.forEach((q) => {
        const card = el.testList.querySelector(`[data-test-key='${q.key}']`);
        if (!card) return;
        const value = readValue(card);
        st.answers[q.key] = value;
        const ok = evaluate(q, value);
        st.results[q.key] = ok;
        setFeedback(card, ok, ok ? '批改结果：正确' : '批改结果：错误，请继续订正');
        setReveal(card, `参考答案：${answerText(q)}`);
        if (ok) removeWrong(q.key); else upsertWrong({ key: q.key, kind: 'test', lessonId: q.sourceLessonId, questionId: q.id, prompt: q.prompt, type: q.type, options: q.options || [], answers: q.answers || [], answer: q.answer, userAnswer: value, sourceLessonId: q.sourceLessonId });
      });
      saveTestState(st);
      renderTest();
    });
    el.clearWrongBtn?.addEventListener('click', () => { localStorage.removeItem(WRONG_KEY); renderTest(); });
    el.copyLinkBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(window.location.href); el.copyLinkBtn.textContent = '已复制链接'; } catch { el.copyLinkBtn.textContent = '复制失败'; }
      setTimeout(() => { el.copyLinkBtn.textContent = '复制当前链接'; }, 1200);
    });
    window.addEventListener('hashchange', () => {
      const route = parseRoute();
      if (route.mode === 'lesson') setMode('lesson', { index: route.index }); else setMode('test', { tab: route.tab });
    });
    window.addEventListener('keydown', (e) => {
      if (state.mode === 'lesson') {
        if (e.key === 'ArrowLeft') setLesson(state.lessonIndex - 1);
        if (e.key === 'ArrowRight') setLesson(state.lessonIndex + 1);
      }
    });
  }

  function updateWrongCountText() { if (el.wrongCount) el.wrongCount.textContent = String(loadWrongBank().length); }

  function init() {
    renderLessonList();
    bindGlobal();
    const route = parseRoute();
    if (route.mode === 'test') {
      state.testTab = route.tab || 'quiz';
      if (!loadTestState().deck.length) rebuildTestDeck();
      setMode('test', { tab: state.testTab });
    } else {
      setMode('lesson', { index: route.index || 0 });
    }
    updateWrongCountText();
  }

  function upsertWrong(item) {
    const bank = loadWrongBank();
    const idx = bank.findIndex((x) => x.key === item.key);
    const next = { ...item, updatedAt: Date.now() };
    if (idx >= 0) bank[idx] = next; else bank.unshift(next);
    saveWrongBank(bank);
  }
  function removeWrong(key) { saveWrongBank(loadWrongBank().filter((x) => x.key !== key)); }

  init();
})();
