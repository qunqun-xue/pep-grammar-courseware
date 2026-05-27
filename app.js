(function () {
  const lessons = Array.isArray(window.LESSONS) ? window.LESSONS : [];
  const quizBank = window.QUIZ_BANK || {};
  if (!lessons.length) {
    document.body.innerHTML = '<p style="padding:20px;">未检测到课程数据，请检查 lessons-data.js。</p>';
    return;
  }

  const LS_PREFIX = 'pep_lesson_state_v7_';
  const TEST_KEY = 'pep_test_state_v4';
  const WRONG_KEY = 'pep_wrong_bank_v4';
  const TEST_SIZE = 20;
  const idToIndex = new Map(lessons.map((l, i) => [l.id, i]));
  const state = { mode: 'lesson', lessonIndex: 0, testTab: 'quiz', deck: [] };

  const el = {
    menuLesson: document.getElementById('menu-lesson'),
    menuTest: document.getElementById('menu-test'),
    progressText: document.getElementById('progress-text'),
    lessonView: document.getElementById('lesson-view'),
    testView: document.getElementById('test-view'),
    lessonList: document.getElementById('lesson-list'),
    lessonTitle: document.getElementById('lesson-title'),
    lessonContent: document.getElementById('lesson-content'),
    sceneId: document.getElementById('scene-id'),
    prevBtn: document.getElementById('prev-btn'),
    nextBtn: document.getElementById('next-btn'),
    testTabs: document.querySelectorAll('.test-tab'),
    submitTestBtn: document.getElementById('submit-test-btn'),
    testScore: document.getElementById('test-score'),
    testList: document.getElementById('test-question-list'),
    wrongCount: document.getElementById('wrong-count'),
    clearWrongBtn: document.getElementById('clear-wrong-btn')
  };

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const attr = (s) => esc(s).replace(/"/g, '&quot;');
  const fmt = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
  const norm = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/[’'"`.,!?;:，。！？；：（）()\-]/g, '').replace(/\s+/g, '').trim();
  const loadJson = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) || f; } catch { return f; } };
  const saveJson = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const loadLessonState = (id) => loadJson(LS_PREFIX + id, { pitfall: {}, challenge: {}, submitted: false });
  const saveLessonState = (id, data) => saveJson(LS_PREFIX + id, data);
  const loadTestState = () => loadJson(TEST_KEY, { deck: [], answers: {}, results: {}, submitted: false });
  const saveTestState = (data) => saveJson(TEST_KEY, data);
  const loadWrongBank = () => loadJson(WRONG_KEY, []);
  const saveWrongBank = (items) => saveJson(WRONG_KEY, items);

  function parseSections(md) {
    const out = [];
    let cur = null;
    String(md || '').split(/\r?\n/).forEach((line) => {
      const m = line.match(/^###\s+(.+)/);
      if (m) { if (cur) out.push(cur); cur = { heading: m[1].trim(), lines: [] }; return; }
      if (cur) cur.lines.push(line);
    });
    if (cur) out.push(cur);
    return out;
  }
  const bullets = (lines) => lines.map((l) => l.trim()).filter((l) => l.startsWith('- ')).map((l) => l.slice(2).trim());
  const ordered = (lines) => lines.map((l) => l.trim()).map((l) => (l.match(/^\d+\.\s+(.+)/) || [])[1]).filter(Boolean);
  const lessonSections = (lesson) => new Map(parseSections(lesson.markdown).map((s) => [s.heading, s.lines]));
  const collectExamples = (lesson) => {
    const out = [];
    parseSections(lesson.markdown).forEach((sec) => sec.lines.forEach((line) => {
      const m = line.match(/Example:\s*(.+)/i);
      if (m) out.push(m[1].trim());
    }));
    return out;
  };
  const pickExamples = (examples, idx) => {
    if (!examples.length) return [];
    const a = examples[(idx * 2) % examples.length];
    const b = examples[(idx * 2 + 1) % examples.length];
    return [...new Set([a, b].filter(Boolean))];
  };

  function evaluate(q, val) {
    if (q.type === 'mcq') return Number(val) === Number(q.answer);
    const answers = Array.isArray(q.answers) ? q.answers : [];
    const u = norm(val);
    return answers.some((a) => norm(a) === u);
  }
  const answerText = (q) => q.type === 'mcq' ? q.options[q.answer] : (q.answers || [''])[0];
  function readValue(card) {
    const checked = card.querySelector("input[type='radio']:checked");
    if (checked) return checked.value;
    const input = card.querySelector('[data-answer-input]');
    return input ? input.value : '';
  }
  function setFeedback(card, ok, msg) {
    const node = card && card.querySelector('[data-feedback]'); if (!node) return;
    node.className = ok === true ? 'quiz-feedback correct' : ok === false ? 'quiz-feedback wrong' : 'quiz-feedback';
    node.textContent = msg;
  }
  function setReveal(card, text) { const node = card && card.querySelector('[data-reveal]'); if (node) node.textContent = text; }

  function renderLessonList() {
    el.lessonList.innerHTML = lessons.map((l, i) => `<li><button type="button" class="lesson-link" data-index="${i}" data-lesson-id="${l.id}"><span class="lesson-text">${esc(l.id)} ${esc(l.title)}</span><span class="done-mark"></span></button></li>`).join('');
    el.lessonList.querySelectorAll('.lesson-link').forEach((btn) => btn.addEventListener('click', () => setLesson(Number(btn.dataset.index))));
  }

  function renderMeta(lines) {
    if (!lines || !lines.length) return '';
    return `<section class="section-card section-meta"><h3>本课目标</h3><ol class="meta-list">${ordered(lines).map((t) => `<li class="meta-item">${fmt(t)}</li>`).join('')}</ol></section>`;
  }

  function renderTeacherTalk(lesson, lines) {
    const examples = collectExamples(lesson);
    return `<section class="section-card section-teachertalk"><h3>老师讲透</h3><p class="section-intro">先把规则讲清，再看例子，最后自己动手。</p><div class="teacher-talk-list">${bullets(lines).map((t, i) => {
      const picks = pickExamples(examples, i);
      return `<article class="teacher-talk-item"><p class="teacher-talk-text">${fmt(t)}</p>${picks.length ? `<div class="teacher-example-list">${picks.map((x) => `<p class="teacher-example">例如：${fmt(x)}</p>`).join('')}</div>` : ''}</article>`;
    }).join('')}</div></section>`;
  }

  function renderPitfall(lesson, lines) {
    const st = loadLessonState(lesson.id);
    const pairs = [];
    const b = bullets(lines);
    for (let i = 0; i < b.length; i++) if (b[i].startsWith('错：')) pairs.push({ wrong: b[i].slice(2).trim(), right: (b[i + 1] || '').startsWith('对：') ? b[i + 1].slice(2).trim() : '' });
    return `<section class="section-card section-pitfallbox"><h3>避坑雷达</h3><p class="section-intro">先看说明，再改句子。这里专门检查本课最容易混淆的表达。</p><div class="pitfall-list">${pairs.map((p, idx) => {
      const saved = st.pitfall[idx]?.answer || '';
      const submitted = !!st.submitted;
      const ok = st.pitfall[idx]?.status;
      return `<article class="pitfall-card" data-pitfall-index="${idx}" data-right="${attr(p.right)}"><p class="pitfall-note">这类题要检查句式是否完整、词形是否正确。先看示例，再订正。</p><p class="pitfall-label">易错句示例</p><p class="pitfall-wrong">${fmt(p.wrong)}</p><p class="pitfall-label">你来订正</p><textarea class="quiz-textarea pitfall-input" data-answer-input placeholder="请改正句子">${esc(saved)}</textarea>${submitted ? `<p class="${ok === true ? 'quiz-feedback correct' : ok === false ? 'quiz-feedback wrong' : 'quiz-feedback'}" data-feedback>${ok === true ? '批改结果：正确' : ok === false ? '批改结果：再想一想' : '批改结果：未批改'}</p><p class="pitfall-right" data-reveal>${ok === true ? `订正：${esc(p.right)}` : ''}</p>` : ''}</article>`;
    }).join('')}</div></section>`;
  }

  function renderPractice(title, lines) {
    return `<section class="section-card section-practice"><h3>${title}</h3><p class="section-intro">先自己想，再写答案。可以边说边写。</p><ol class="practice-list">${ordered(lines).map((t) => `<li>${fmt(t)}</li>`).join('')}</ol></section>`;
  }

  function renderExit(lines) {
    const badge = bullets(lines).find((t) => t.startsWith('自评徽章：'));
    return `<section class="section-card section-exitticket"><h3>课堂回顾</h3><ol class="practice-list">${ordered(lines).map((t) => `<li>${fmt(t)}</li>`).join('')}</ol>${badge ? `<p class="badge-line">${fmt(badge)}</p>` : ''}</section>`;
  }

  function renderChallenge(lesson) {
    const qs = quizBank[lesson.id] || [];
    if (!qs.length) return '';
    const st = loadLessonState(lesson.id);
    return `<section class="section-card section-challenge"><h3>闯关挑战</h3><p class="section-intro">这一关全部做完后，再在底部一次提交。提交前不会显示批改结果。</p><div class="quiz-list">${qs.map((q, idx) => {
      const saved = st.challenge[q.id]?.answer ?? '';
      const ok = st.challenge[q.id]?.status;
      const submitted = !!st.submitted;
      const disabled = submitted ? 'disabled' : '';
      const body = q.type === 'mcq'
        ? `<div class="quiz-options">${q.options.map((o, i) => `<label class="quiz-option"><input ${disabled} type="radio" name="${lesson.id}_${q.id}" value="${i}" ${Number(saved) === i ? 'checked' : ''}><span>${fmt(o)}</span></label>`).join('')}</div>`
        : q.type === 'correct'
          ? `<textarea ${disabled} class="quiz-textarea" data-answer-input placeholder="在这里改正句子">${esc(saved)}</textarea>`
          : `<input ${disabled} class="quiz-input" data-answer-input type="text" value="${attr(saved)}" placeholder="在这里输入答案">`;
      const result = submitted ? `<p class="${ok === true ? 'quiz-feedback correct' : ok === false ? 'quiz-feedback wrong' : 'quiz-feedback'}" data-feedback>${ok === true ? '批改结果：正确' : ok === false ? '批改结果：错误' : '批改结果：未批改'}</p><p class="quiz-answer" data-reveal>${ok === true ? `参考答案：${esc(answerText(q))}` : ''}${ok === false ? `参考答案：${esc(answerText(q))}；知识点提醒：请先看题干里的时间、主语或数量，再选对形式。` : ''}</p>` : '';
      return `<article class="quiz-card" data-qid="${q.id}" data-lesson-id="${lesson.id}"><p class="quiz-title">${idx + 1}. ${fmt(q.prompt)}</p>${body}${result}</article>`;
    }).join('')}</div><div class="lesson-submit-wrap"><button type="button" class="page-btn submit-btn" data-lesson-submit>提交批改</button></div></section>`;
  }

  function renderLesson(lesson) {
    const map = lessonSections(lesson);
    const html = [];
    if (map.has('TeacherTalk')) html.push(renderTeacherTalk(lesson, map.get('TeacherTalk')));
    if (map.has('LessonMeta')) html.push(renderMeta(map.get('LessonMeta')));
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
      const done = !!st.submitted && qs.length && qs.every((q) => st.challenge[q.id]?.status === true);
      const mark = btn.querySelector('.done-mark');
      if (mark) mark.textContent = done ? '全对' : '';
    });
  }

  function refreshLessonScore(lessonId) {
    const st = loadLessonState(lessonId);
    const qs = quizBank[lessonId] || [];
    const ok = qs.filter((q) => st.challenge[q.id]?.status === true).length;
    const score = el.lessonContent.querySelector('[data-lesson-score]');
    if (score) score.textContent = st.submitted ? `当前得分：${ok} / ${qs.length}` : `当前得分：${Object.keys(st.challenge || {}).filter((k) => st.challenge[k]?.answer !== undefined && String(st.challenge[k]?.answer).trim() !== '').length} / ${qs.length}`;
  }

  function bindLessonEvents(lessonId) {
    const lesson = lessons[state.lessonIndex];
    const content = el.lessonContent;
    content.querySelectorAll('.pitfall-card').forEach((card) => {
      const idx = Number(card.dataset.pitfallIndex);
      const input = card.querySelector('[data-answer-input]');
      const right = card.dataset.right || '';
      input?.addEventListener('input', () => {
        const st = loadLessonState(lessonId);
        st.pitfall[idx] = st.pitfall[idx] || {};
        st.pitfall[idx].answer = input.value;
        if (st.submitted) { st.submitted = false; st.pitfall = Object.fromEntries(Object.entries(st.pitfall).map(([k, v]) => [k, { answer: v.answer } ])); }
        saveLessonState(lessonId, st);
        if (st.submitted) setLesson(state.lessonIndex);
      });
    });
    content.querySelectorAll('.quiz-card[data-lesson-id]').forEach((card) => {
      const qid = card.dataset.qid;
      const q = (quizBank[lessonId] || []).find((x) => x.id === qid);
      const saveAnswer = () => {
        const st = loadLessonState(lessonId);
        st.challenge[qid] = st.challenge[qid] || {};
        st.challenge[qid].answer = readValue(card);
        if (st.submitted) { st.submitted = false; Object.keys(st.challenge).forEach((k) => { if (st.challenge[k]) delete st.challenge[k].status; }); }
        saveLessonState(lessonId, st);
        if (st.submitted) setLesson(state.lessonIndex);
      };
      card.querySelectorAll("input[type='radio']").forEach((r) => r.addEventListener('change', saveAnswer));
      card.querySelector('[data-answer-input]')?.addEventListener('input', saveAnswer);
    });
    content.querySelector('[data-lesson-submit]')?.addEventListener('click', () => {
      const st = loadLessonState(lessonId);
      const qs = quizBank[lessonId] || [];
      st.submitted = true;
      qs.forEach((q) => {
        const card = content.querySelector(`[data-qid='${q.id}']`);
        if (!card) return;
        const value = readValue(card);
        st.challenge[q.id] = st.challenge[q.id] || {};
        st.challenge[q.id].answer = value;
        const ok = evaluate(q, value);
        st.challenge[q.id].status = ok;
        if (ok) removeWrong(`${lessonId}__${q.id}`);
        else upsertWrong({ key: `${lessonId}__${q.id}`, kind: 'lesson', lessonId, questionId: q.id, prompt: q.prompt, type: q.type, options: q.options || [], answers: q.answers || [], answer: q.answer, userAnswer: value, sourceLessonId: lessonId });
      });
      saveLessonState(lessonId, st);
      renderLesson(lesson);
      bindLessonEvents(lessonId);
      refreshLessonScore(lessonId);
      updateWrongCount();
      markDone();
    });
    refreshLessonScore(lessonId);
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
    el.lessonContent.innerHTML = renderLesson(lesson);
    el.prevBtn.disabled = state.lessonIndex === 0;
    el.nextBtn.disabled = state.lessonIndex === lessons.length - 1;
    history.replaceState(null, '', `#lesson/${lesson.id}`);
    bindLessonEvents(lesson.id);
    markDone();
  }

  function upsertWrong(item) {
    const bank = loadWrongBank();
    const idx = bank.findIndex((x) => x.key === item.key);
    const next = { ...item, updatedAt: Date.now() };
    if (idx >= 0) bank[idx] = next; else bank.unshift(next);
    saveWrongBank(bank);
  }
  const removeWrong = (key) => saveWrongBank(loadWrongBank().filter((x) => x.key !== key));
  const updateWrongCount = () => { if (el.wrongCount) el.wrongCount.textContent = String(loadWrongBank().length); };

  function rebuildTestDeck() {
    const all = [];
    Object.entries(quizBank).forEach(([lessonId, qs]) => qs.forEach((q) => all.push({ ...q, sourceLessonId: lessonId, key: `${lessonId}__${q.id}` })));
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    state.deck = all.slice(0, TEST_SIZE);
    saveTestState({ deck: state.deck, answers: {}, results: {}, submitted: false });
  }

  function renderTestList() {
    const testState = loadTestState();
    if (!state.deck.length) state.deck = Array.isArray(testState.deck) && testState.deck.length ? testState.deck : (rebuildTestDeck(), loadTestState().deck || state.deck);
    const deck = state.deck;
    const submitted = !!testState.submitted;
    el.testList.innerHTML = deck.length ? deck.map((q, idx) => {
      const saved = testState.answers?.[q.key] ?? '';
      const ok = testState.results?.[q.key];
      const disabled = submitted ? 'disabled' : '';
      const body = q.type === 'mcq'
        ? `<div class="quiz-options">${q.options.map((o, i) => `<label class="quiz-option"><input ${disabled} type="radio" name="${q.key}" value="${i}" ${Number(saved) === i ? 'checked' : ''}><span>${fmt(o)}</span></label>`).join('')}</div>`
        : q.type === 'correct'
          ? `<textarea ${disabled} class="quiz-textarea" data-answer-input placeholder="在这里改正句子">${esc(saved)}</textarea>`
          : `<input ${disabled} class="quiz-input" data-answer-input type="text" value="${attr(saved)}" placeholder="在这里输入答案">`;
      const result = submitted ? `<p class="${ok === true ? 'quiz-feedback correct' : ok === false ? 'quiz-feedback wrong' : 'quiz-feedback'}" data-feedback>${ok === true ? '批改结果：正确' : ok === false ? '批改结果：错误' : '批改结果：未批改'}</p><p class="quiz-answer" data-reveal>${ok === true ? `参考答案：${esc(answerText(q))}` : ok === false ? `参考答案：${esc(answerText(q))}；知识点提醒：先找时间词、主语或数量词，再决定形式。` : ''}</p>` : '';
      return `<article class="quiz-card" data-test-key="${q.key}" data-question-type="${q.type}"><p class="quiz-title">${idx + 1}. ${fmt(q.prompt)}</p>${body}${result}</article>`;
    }).join('') : '<section class="section-card"><h3>题目加载中</h3></section>';
    el.testScore.textContent = `当前得分：${Object.values(testState.results || {}).filter(Boolean).length} / ${deck.length}`;
    el.testTabs.forEach((t) => t.classList.toggle('active', t.dataset.testTab === state.testTab));
    el.submitTestBtn.hidden = submitted;
    el.clearWrongBtn && (el.clearWrongBtn.hidden = state.testTab !== 'wrong');
    bindTestEvents();
    updateWrongCount();
  }

  function renderWrongList() {
    const items = loadWrongBank();
    if (!items.length) {
      el.testList.innerHTML = `<section class="section-card"><h3>错题集</h3><p>当前还没有错题。你在测试里做错的题会自动加入这里。</p></section>`;
      return;
    }
    el.testList.innerHTML = `<section class="section-card section-wrongbank"><h3>错题集</h3><p class="section-intro">这里保存你做错过的题。可以重新作答，答对后会自动移出。</p><div class="quiz-list">${items.map((q, idx) => `<article class="quiz-card" data-wrong-key="${q.key}"><p class="quiz-title">${idx + 1}. ${fmt(q.prompt)}</p>${q.type === 'mcq' ? `<div class="quiz-options">${q.options.map((o, i) => `<label class="quiz-option"><input type="radio" name="wrong_${q.key}" value="${i}" ${Number(q.userAnswer) === i ? 'checked' : ''}><span>${fmt(o)}</span></label>`).join('')}</div>` : q.type === 'correct' ? `<textarea class="quiz-textarea" data-answer-input placeholder="在这里改正句子">${esc(q.userAnswer || '')}</textarea>` : `<input class="quiz-input" data-answer-input type="text" value="${attr(q.userAnswer || '')}" placeholder="在这里输入答案">`}<div class="quiz-actions"><button type="button" class="mini-btn wrong-grade">重新批改</button><button type="button" class="mini-btn light wrong-remove">移出错题集</button></div><p class="quiz-feedback">等待重新作答</p><p class="quiz-answer" data-reveal>参考答案：${esc(answerText(q))}</p></article>`).join('')}</div></section>`;
    bindTestEvents();
  }

  function bindTestEvents() {
    if (state.testTab === 'quiz') {
      const testState = loadTestState();
      el.testList.querySelectorAll('.quiz-card[data-test-key]').forEach((card) => {
        const key = card.dataset.testKey;
        if (testState.submitted) return;
        const saveAnswer = () => { const st = loadTestState(); st.answers[key] = readValue(card); saveTestState(st); };
        card.querySelectorAll("input[type='radio']").forEach((r) => r.addEventListener('change', saveAnswer));
        card.querySelector('[data-answer-input]')?.addEventListener('input', saveAnswer);
      });
      return;
    }
    el.testList.querySelectorAll('.quiz-card[data-wrong-key]').forEach((card) => {
      const key = card.dataset.wrongKey;
      const item = loadWrongBank().find((x) => x.key === key);
      if (!item) return;
      const saveAnswer = () => { const bank = loadWrongBank(); const target = bank.find((x) => x.key === key); if (target) { target.userAnswer = readValue(card); saveWrongBank(bank); } };
      card.querySelectorAll("input[type='radio']").forEach((r) => r.addEventListener('change', saveAnswer));
      card.querySelector('[data-answer-input]')?.addEventListener('input', saveAnswer);
      card.querySelector('.wrong-grade')?.addEventListener('click', () => {
        const value = readValue(card);
        const ok = evaluate(item, value);
        setFeedback(card, ok, ok ? '批改结果：正确，已移出错题集' : '批改结果：错误，请继续订正');
        setReveal(card, ok ? `参考答案：${answerText(item)}` : `参考答案：${answerText(item)}`);
        if (ok) { removeWrong(key); renderTest(); } else { const bank = loadWrongBank(); const target = bank.find((x) => x.key === key); if (target) { target.userAnswer = value; saveWrongBank(bank); } }
      });
      card.querySelector('.wrong-remove')?.addEventListener('click', () => { removeWrong(key); renderTest(); });
    });
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
    if (mode === 'lesson') setLesson(opts.index ?? state.lessonIndex);
    else { state.testTab = opts.tab || state.testTab || 'quiz'; renderTest(); }
  }

  function parseRoute() {
    const hash = window.location.hash.replace(/^#/, '').trim();
    if (hash === 'test') return { mode: 'test', tab: 'quiz' };
    if (hash === 'wrong') return { mode: 'test', tab: 'wrong' };
    if (hash.startsWith('lesson/')) { const id = hash.split('/')[1]?.toUpperCase(); return { mode: 'lesson', index: idToIndex.get(id) ?? 0 }; }
    return { mode: 'lesson', index: 0 };
  }

  function bindGlobal() {
    el.menuLesson.addEventListener('click', () => setMode('lesson', { index: state.lessonIndex }));
    el.menuTest.addEventListener('click', () => { state.testTab = 'quiz'; setMode('test', { tab: 'quiz' }); });
    el.prevBtn.addEventListener('click', () => setLesson(state.lessonIndex - 1));
    el.nextBtn.addEventListener('click', () => setLesson(state.lessonIndex + 1));
    el.testTabs.forEach((tab) => tab.addEventListener('click', () => { state.testTab = tab.dataset.testTab || 'quiz'; if (state.mode !== 'test') setMode('test', { tab: state.testTab }); else renderTest(); }));
    el.submitTestBtn.addEventListener('click', () => {
      const st = loadTestState();
      st.submitted = true;
      state.deck.forEach((q) => {
        const card = el.testList.querySelector(`[data-test-key='${q.key}']`);
        if (!card) return;
        const value = readValue(card);
        st.answers[q.key] = value;
        const ok = evaluate(q, value);
        st.results[q.key] = ok;
        if (ok) removeWrong(q.key);
        else upsertWrong({ key: q.key, kind: 'test', lessonId: q.sourceLessonId, questionId: q.id, prompt: q.prompt, type: q.type, options: q.options || [], answers: q.answers || [], answer: q.answer, userAnswer: value, sourceLessonId: q.sourceLessonId });
      });
      saveTestState(st);
      renderTest();
      updateWrongCount();
    });
    el.clearWrongBtn?.addEventListener('click', () => { localStorage.removeItem(WRONG_KEY); if (state.mode === 'test' && state.testTab === 'wrong') renderWrongList(); updateWrongCount(); });
    window.addEventListener('hashchange', () => { const route = parseRoute(); setMode(route.mode, route); });
    window.addEventListener('keydown', (e) => {
      if (state.mode === 'lesson') {
        if (e.key === 'ArrowLeft') setLesson(state.lessonIndex - 1);
        if (e.key === 'ArrowRight') setLesson(state.lessonIndex + 1);
      }
    });
  }

  function markWrongCount() { updateWrongCount(); }

  function init() {
    renderLessonList();
    bindGlobal();
    const route = parseRoute();
    if (route.mode === 'test') {
      if (!loadTestState().deck.length) rebuildTestDeck();
      state.testTab = route.tab || 'quiz';
      setMode('test', { tab: state.testTab });
    } else setMode('lesson', { index: route.index || 0 });
    markWrongCount();
  }

  init();
})();

