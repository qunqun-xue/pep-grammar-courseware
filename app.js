(function () {
  const lessons = Array.isArray(window.LESSONS) ? window.LESSONS : [];
  const quizBank = window.QUIZ_BANK || {};

  if (!lessons.length) {
    document.body.innerHTML = "<p style='padding:20px;'>鏈娴嬪埌璇剧▼鏁版嵁锛岃妫€鏌?lessons-data.js銆?/p>";
    return;
  }

  const KEYS = {
    lesson: 'pep_lesson_state_v6_',
    pitfall: 'pep_pitfall_state_v2_',
    exit: 'pep_exit_state_v2_',
    ui: 'pep_ui_state_v2',
    test: 'pep_test_state_v2',
    wrongbook: 'pep_wrongbook_v2'
  };

  const sectionNameMap = {
    RuleCard: '语法魔法卡',
    TeacherTalk: '老师讲透', 
    PitfallBox: '閬垮潙闆疯揪',
    PracticeA: 'A鍏?缁冧範',
    PracticeB: 'B鍏?缁冧範',
    PracticeC: 'C鍏?缁冧範',
    ExitTicket: '通关小测'
  };

  const el = {
    lessonList: document.getElementById('lesson-list'),
    lessonTitle: document.getElementById('lesson-title'),
    lessonContent: document.getElementById('lesson-content'),
    progressText: document.getElementById('progress-text'),
    prevBtn: document.getElementById('prev-btn'),
    nextBtn: document.getElementById('next-btn'),
    copyLinkBtn: document.getElementById('copy-link-btn'),
    tabLearn: document.getElementById('tab-learn'),
    tabTest: document.getElementById('tab-test'),
    learnView: document.getElementById('learn-view'),
    testView: document.getElementById('test-view'),
    subtabExam: document.getElementById('subtab-exam'),
    subtabWrong: document.getElementById('subtab-wrong'),
    examPanel: document.getElementById('exam-panel'),
    wrongbookPanel: document.getElementById('wrongbook-panel'),
    submitTestBtn: document.getElementById('submit-test-btn'),
    testSubmitArea: document.getElementById('test-submit-area'),
    testSummary: document.getElementById('test-summary'),
    testPaper: document.getElementById('test-paper'),
    wrongbookList: document.getElementById('wrongbook-list'),
    clearWrongbookBtn: document.getElementById('clear-wrongbook-btn')
  };

  const idToIndex = new Map(lessons.map((lesson, idx) => [lesson.id, idx]));
  const state = {
    index: 0,
    mode: loadJSON(KEYS.ui, { mode: 'learn' }).mode || 'learn',
    test: loadJSON(KEYS.test, null),
    wrongbook: loadJSON(KEYS.wrongbook, [])
  };

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_err) {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttr(text) {
    return escapeHtml(text).replace(/"/g, '&quot;');
  }

  function inlineFormat(text) {
    return escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function normalizeText(text) {
    return String(text || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[鈥?]/g, '')
      .replace(/[^a-z0-9?\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function splitSections(markdown) {
    const sections = [];
    let current = null;
    String(markdown || '').split(/\r?\n/).forEach((line) => {
      const match = line.match(/^###\s+(.+)/);
      if (match) {
        if (current) sections.push(current);
        current = { heading: match[1].trim(), lines: [] };
        return;
      }
      if (current) current.lines.push(line);
    });
    if (current) sections.push(current);
    return sections;
  }

  function parseBullets(lines) {
    return lines.map((line) => line.trim()).filter((line) => line.startsWith('- ')).map((line) => line.slice(2).trim());
  }

  function parseOrdered(lines) {
    return lines.map((line) => line.trim()).map((line) => {
      const match = line.match(/^\d+\.\s+(.+)/);
      return match ? match[1].trim() : null;
    }).filter(Boolean);
  }

  function loadModuleState(prefix, lessonId) {
    try {
      const raw = localStorage.getItem(prefix + lessonId);
      if (!raw) return { answers: {}, results: {} };
      const data = JSON.parse(raw);
      return { answers: data.answers || {}, results: data.results || {} };
    } catch (_err) {
      return { answers: {}, results: {} };
    }
  }

  function saveModuleState(prefix, lessonId, data) {
    localStorage.setItem(prefix + lessonId, JSON.stringify(data));
  }

  function feedbackClass(status) {
    if (status === true) return 'quiz-feedback correct';
    if (status === false) return 'quiz-feedback wrong';
    return 'quiz-feedback';
  }

  function feedbackText(status) {
    if (status === true) return '批改结果：正确';
    if (status === false) return '批改结果：错误，请再试一次';
    if (status === null) return '请先作答再批改';
    return '批改结果：未批改';
  }

  function parsePitfallPairs(lines) {
    const bullets = parseBullets(lines);
    const pairs = [];
    for (let i = 0; i < bullets.length; i += 1) {
      const wrong = bullets[i].match(/^閿橻锛?]\s*(.+)$/);
      const right = (bullets[i + 1] || '').match(/^瀵筟锛?]\s*(.+)$/);
      if (wrong && right) {
        pairs.push({ id: `pit_${pairs.length + 1}`, wrong: wrong[1].trim(), right: right[1].trim() });
      }
    }
    return pairs;
  }

  function evaluateQuestion(question, answer) {
    if (question.type === 'mcq') return Number(answer) === Number(question.answer);
    if (!Array.isArray(question.answers) || !question.answers.length) return false;
    const normalized = normalizeText(answer);
    return question.answers.some((item) => normalizeText(item) === normalized);
  }

  function getAnswerText(question) {
    return question.type === 'mcq' ? question.options[question.answer] : (Array.isArray(question.answers) ? question.answers[0] : '');
  }

  function getQuestionInputValue(root, lessonId, qid) {
    const checked = root.querySelector(`input[name='${lessonId}_${qid}']:checked`);
    if (checked instanceof HTMLInputElement) return checked.value;
    const textNode = root.querySelector(`[data-qid='${qid}'][data-qtype='text']`);
    return (textNode instanceof HTMLTextAreaElement || textNode instanceof HTMLInputElement) ? textNode.value : '';
  }

  function questionInputHtml(scope, lessonId, question, savedValue) {
    if (question.type === 'mcq') {
      return ['<div class="quiz-options">', question.options.map((option, idx) => {
        const inputId = `${scope}_${lessonId}_${question.id}_${idx}`;
        const checked = Number(savedValue) === idx ? 'checked' : '';
        return [`<label class='quiz-option' for='${inputId}'>`, `<input id='${inputId}' type='radio' name='${lessonId}_${question.id}' data-qid='${question.id}' data-qtype='mcq' value='${idx}' ${checked}>`, `<span>${inlineFormat(option)}</span>`, '</label>'].join('');
      }).join(''), '</div>'].join('');
    }
    if (question.type === 'correct') {
      return `<textarea class='quiz-textarea' data-qid='${question.id}' data-qtype='text' placeholder='鍦ㄨ繖閲屾敼姝ｅ彞瀛?>${escapeHtml(savedValue || '')}</textarea>`;
    }
    return `<input class='quiz-input' type='text' data-qid='${question.id}' data-qtype='text' value='${escapeAttr(savedValue || '')}' placeholder='鍦ㄨ繖閲岃緭鍏ョ瓟妗?>`;
  }

  function renderRule(lines) {
    const ordered = parseOrdered(lines);
    return [`<section class='section-card section-rulecard'><h3>${sectionNameMap.RuleCard}</h3><div class='rule-list'>`, ordered.map((item) => `<p class='rule-item'>${inlineFormat(item)}</p>`).join(''), '</div></section>'].join('');
  }

  function renderTeacherTalk(lines) {
    const bullets = parseBullets(lines);
    return [`<section class='section-card section-teachertalk'><h3>${sectionNameMap.TeacherTalk}</h3><div class='teacher-talk-box'>`, bullets.map((item) => `<p class='teacher-talk-item'>${inlineFormat(item)}</p>`).join(''), '</div></section>'].join('');
  }

  function renderPitfall(lessonId, lines) {
    const pairs = parsePitfallPairs(lines);
    const pitState = loadModuleState(KEYS.pitfall, lessonId);
    return [`<section class='section-card section-pitfallbox'><h3>${sectionNameMap.PitfallBox}</h3><div class='pitfall-intro'><p>鍏堣璇存槑锛屽啀鐪嬫槗閿欏彞锛氬厛鎵句富璇€佸姩璇嶅拰鏃舵€侊紝鍐嶆鏌ヤ汉绉般€佽瘝褰㈠拰鏍囩偣銆?/p><p>鍦ㄨ緭鍏ユ閲屽啓鍑轰綘鐨勮姝ｅ彞锛岀偣鍑绘彁浜ゅ悗绯荤粺浼氳嚜鍔ㄦ壒鏀癸紝骞朵繚鐣欎綘鐨勭瓟妗堛€?/p></div><div class='pit-grid'>`, pairs.map((pair) => {
      const answer = pitState.answers[pair.id] || '';
      const status = Object.prototype.hasOwnProperty.call(pitState.results, pair.id) ? pitState.results[pair.id] : null;
      return [`<article class='pit-card' data-pit-qid='${pair.id}' data-answer='${escapeAttr(pair.right)}'>`, `<p class='pit-wrong'><strong>鏄撻敊鍙ワ細</strong>${inlineFormat(pair.wrong)}</p>`, '<p><strong>璇蜂綘璁㈡锛?/strong></p>', `<textarea class='quiz-textarea pit-input' data-pit-qid='${pair.id}' placeholder='鍦ㄨ繖閲岃緭鍏ヤ綘鐨勮姝ｅ彞'>${escapeHtml(answer)}</textarea>`, '<div class="pit-actions">', `<button type='button' class='mini-btn pit-submit-btn' data-pit-qid='${pair.id}'>鎻愪氦鎵规敼</button>`, `<button type='button' class='mini-btn light pit-show-btn' data-pit-qid='${pair.id}'>鏌ョ湅璁㈡</button>`, '</div>', `<p class='${feedbackClass(status)}' data-pit-role='feedback'>${feedbackText(status)}</p>`, "<p class='quiz-answer' data-pit-role='answer'></p>", '</article>'].join('');
    }).join(''), '</div></section>'].join('');
  }

  function renderPracticeSection(heading, lines) {
    const list = parseOrdered(lines);
    const title = sectionNameMap[heading] || heading;
    return [`<section class='section-card section-practice'><h3>${title}</h3><p>鎻愮ず锛氳繖閮ㄥ垎鏄紑鏀剧粌涔狅紝閫傚悎鍏堣嚜宸辨兂涓€鎯筹紝鍐嶅鐓у皬娴嬪珐鍥恒€?/p><ol>`, list.map((item) => `<li>${inlineFormat(item)}</li>`).join(''), '</ol></section>'].join('');
  }

  function countLessonScore(lessonId) {
    const questions = quizBank[lessonId] || [];
    const lessonState = loadModuleState(KEYS.lesson, lessonId);
    let correct = 0;
    questions.forEach((question) => { if (lessonState.results[question.id] === true) correct += 1; });
    return { correct, total: questions.length };
  }
  function writeLessonFeedback(lessonId, qid, result, message) {
    const card = el.lessonContent.querySelector(`.quiz-card[data-qid='${qid}']`);
    if (!card) return;
    const node = card.querySelector('[data-role="feedback"]');
    if (node instanceof HTMLElement) {
      node.className = feedbackClass(result);
      node.textContent = message;
    }
  }

  function showLessonAnswer(lessonId, qid) {
    const question = (quizBank[lessonId] || []).find((item) => item.id === qid);
    const card = el.lessonContent.querySelector(`.quiz-card[data-qid='${qid}']`);
    if (!question || !card) return;
    const node = card.querySelector('[data-role="answer"]');
    if (node instanceof HTMLElement) {
      node.textContent = '鍙傝€冪瓟妗堬細' + getAnswerText(question);
    }
  }

  function gradeLessonQuestion(lessonId, qid) {
    const question = (quizBank[lessonId] || []).find((item) => item.id === qid);
    if (!question) return false;
    const value = getQuestionInputValue(el.lessonContent, lessonId, qid);
    const lessonState = loadModuleState(KEYS.lesson, lessonId);
    lessonState.answers[qid] = value;
    const correct = String(value).trim() ? evaluateQuestion(question, value) : false;
    lessonState.results[qid] = correct;
    saveModuleState(KEYS.lesson, lessonId, lessonState);
    writeLessonFeedback(lessonId, qid, String(value).trim() ? correct : null, String(value).trim() ? (correct ? '批改结果：正确' : '批改结果：错误，请再试一次') : '请先作答再批改');
    return correct;
  }

  function refreshLessonScore(lessonId) {
    const scoreNode = document.getElementById('quiz-score');
    if (!scoreNode) return;
    const score = countLessonScore(lessonId);
    scoreNode.textContent = '当前得分：' + score.correct + ' / ' + score.total;
  }

  function isLessonDone(lessonId) {
    const questions = quizBank[lessonId] || [];
    if (!questions.length) return false;
    const lessonState = loadModuleState(KEYS.lesson, lessonId);
    return questions.every((question) => lessonState.results[question.id] === true);
  }

  function refreshLessonDoneMarks() {
    el.lessonList.querySelectorAll('.lesson-link').forEach((btn) => {
      const lessonId = btn.getAttribute('data-lesson-id');
      const mark = btn.querySelector('.done-mark');
      if (!lessonId || !(mark instanceof HTMLElement)) return;
      mark.textContent = isLessonDone(lessonId) ? '鍏ㄥ' : '';
    });
  }

  function renderExitTicket(lessonId, lines) {
    const questions = (quizBank[lessonId] || []).slice(0, 3);
    const exitState = loadModuleState(KEYS.exit, lessonId);
    const badgeLine = parseBullets(lines).find((item) => item.includes('自评徽章'));
    return [
      "<section class='section-card section-exitticket'>",
      `<h3>${sectionNameMap.ExitTicket}</h3>`,
      '<p>璇峰畬鎴愪笅闈?3 棰樺皬娴嬶紝鎻愪氦鍚庡嵆鍙嚜鍔ㄦ壒鏀广€?/p>',
      "<div class='exit-list'>",
      questions.map((question, idx) => {
        const stateKey = `exit_${question.id}`;
        const saved = exitState.answers[stateKey];
        const status = Object.prototype.hasOwnProperty.call(exitState.results, stateKey) ? exitState.results[stateKey] : null;
        return [
          `<article class='quiz-card exit-card' data-exit-qid='${question.id}'>`,
          `<p class='quiz-title'>${idx + 1}. ${inlineFormat(question.prompt)}</p>`,
          questionInputHtml('exit', lessonId, question, saved),
          `<div class='quiz-actions'><button type='button' class='mini-btn exit-submit-btn' data-exit-qid='${question.id}'>鎻愪氦鎵规敼</button><button type='button' class='mini-btn light exit-answer-btn' data-exit-qid='${question.id}'>鏌ョ湅绛旀</button></div>`,
          `<p class='${feedbackClass(status)}' data-exit-role='feedback'>${feedbackText(status)}</p>`,
          "<p class='quiz-answer' data-exit-role='answer'></p>",
          '</article>'
        ].join('');
      }).join(''),
      '</div>',
      badgeLine ? `<p class='badge-line'>${inlineFormat(badgeLine)}</p>` : '',
      '</section>'
    ].join('');
  }

  function renderLessonHtml(lesson) {
    const sectionMap = {};
    splitSections(lesson.markdown).forEach((section) => { sectionMap[section.heading] = section; });
    const html = [];
    ['RuleCard', 'TeacherTalk', 'PitfallBox', 'PracticeA', 'PracticeB', 'PracticeC', 'ExitTicket'].forEach((key) => {
      const section = sectionMap[key];
      if (!section) return;
      if (key === 'RuleCard') html.push(renderRule(section.lines));
      else if (key === 'TeacherTalk') html.push(renderTeacherTalk(section.lines));
      else if (key === 'PitfallBox') html.push(renderPitfall(lesson.id, section.lines));
      else if (key === 'PracticeA' || key === 'PracticeB' || key === 'PracticeC') html.push(renderPracticeSection(section.heading, section.lines));
      else if (key === 'ExitTicket') html.push(renderExitTicket(lesson.id, section.lines));
    });
    return html.join('');
  }

  function bindLessonQuizEvents(lessonId) {
    const quizSection = document.getElementById('auto-quiz');
    if (!quizSection) return;

    quizSection.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const qid = target.getAttribute('data-qid');
      if (!qid) return;
      const lessonState = loadModuleState(KEYS.lesson, lessonId);
      lessonState.answers[qid] = getQuestionInputValue(el.lessonContent, lessonId, qid);
      saveModuleState(KEYS.lesson, lessonId, lessonState);
    });

    quizSection.querySelectorAll('.submit-q-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qid = btn.getAttribute('data-qid');
        if (!qid) return;
        gradeLessonQuestion(lessonId, qid);
        refreshLessonScore(lessonId);
        refreshLessonDoneMarks();
      });
    });

    quizSection.querySelectorAll('.show-answer-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qid = btn.getAttribute('data-qid');
        if (qid) showLessonAnswer(lessonId, qid);
      });
    });

    const gradeAllBtn = document.getElementById('grade-all-btn');
    if (gradeAllBtn) {
      gradeAllBtn.addEventListener('click', () => {
        (quizBank[lessonId] || []).forEach((question) => gradeLessonQuestion(lessonId, question.id));
        refreshLessonScore(lessonId);
        refreshLessonDoneMarks();
      });
    }

    const resetBtn = document.getElementById('reset-lesson-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        localStorage.removeItem(KEYS.lesson + lessonId);
        renderLesson(state.index);
      });
    }
  }

  function bindPitfallEvents(lessonId) {
    const section = document.querySelector('.section-pitfallbox');
    if (!section) return;

    section.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLTextAreaElement)) return;
      const qid = target.getAttribute('data-pit-qid');
      if (!qid) return;
      const pitState = loadModuleState(KEYS.pitfall, lessonId);
      pitState.answers[qid] = target.value;
      saveModuleState(KEYS.pitfall, lessonId, pitState);
    });

    section.querySelectorAll('.pit-submit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qid = btn.getAttribute('data-pit-qid');
        if (!qid) return;
        const card = section.querySelector(`.pit-card[data-pit-qid='${qid}']`);
        if (!card) return;
        const input = card.querySelector('.pit-input');
        const feedback = card.querySelector('[data-pit-role="feedback"]');
        if (!(input instanceof HTMLTextAreaElement) || !(feedback instanceof HTMLElement)) return;
        const value = input.value.trim();
        if (!value) {
          feedback.className = feedbackClass(null);
          feedback.textContent = '请先输入你的订正句。';
          return;
        }
        const answer = card.getAttribute('data-answer') || '';
        const correct = normalizeText(value) === normalizeText(answer);
        const pitState = loadModuleState(KEYS.pitfall, lessonId);
        pitState.answers[qid] = input.value;
        pitState.results[qid] = correct;
        saveModuleState(KEYS.pitfall, lessonId, pitState);
        feedback.className = feedbackClass(correct);
        feedback.textContent = correct ? '批改结果：正确' : '批改结果：错误，请再修改一次';
      });
    });

    section.querySelectorAll('.pit-show-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qid = btn.getAttribute('data-pit-qid');
        if (!qid) return;
        const card = section.querySelector(`.pit-card[data-pit-qid='${qid}']`);
        if (!card) return;
        const answerNode = card.querySelector('[data-pit-role="answer"]');
        if (answerNode instanceof HTMLElement) {
          answerNode.textContent = '鍙傝€冭姝ｏ細' + (card.getAttribute('data-answer') || '');
        }
      });
    });
  }

  function readExitAnswer(lessonId, qid) {
    const checked = document.querySelector(`input[name='${lessonId}_exit_${qid}']:checked`);
    if (checked instanceof HTMLInputElement) return checked.value;
    const textNode = document.querySelector(`[data-exit-qid='${qid}'][data-exit-qtype='text']`);
    return (textNode instanceof HTMLTextAreaElement || textNode instanceof HTMLInputElement) ? textNode.value : '';
  }

  function bindExitTicketEvents(lessonId) {
    const section = document.querySelector('.section-exitticket');
    if (!section) return;

    section.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const qid = target.getAttribute('data-exit-qid');
      if (!qid) return;
      const exitState = loadModuleState(KEYS.exit, lessonId);
      exitState.answers[`exit_${qid}`] = readExitAnswer(lessonId, qid);
      saveModuleState(KEYS.exit, lessonId, exitState);
    });

    section.querySelectorAll('.exit-submit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qid = btn.getAttribute('data-exit-qid');
        if (!qid) return;
        const question = (quizBank[lessonId] || []).find((item) => item.id === qid);
        const card = section.querySelector(`.exit-card[data-exit-qid='${qid}']`);
        const feedback = card?.querySelector('[data-exit-role="feedback"]');
        if (!question || !(feedback instanceof HTMLElement)) return;
        const value = readExitAnswer(lessonId, qid);
        if (!String(value).trim()) {
          feedback.className = feedbackClass(null);
          feedback.textContent = '请先作答再批改。';
          return;
        }
        const correct = evaluateQuestion(question, value);
        const exitState = loadModuleState(KEYS.exit, lessonId);
        exitState.answers[`exit_${qid}`] = value;
        exitState.results[`exit_${qid}`] = correct;
        saveModuleState(KEYS.exit, lessonId, exitState);
        feedback.className = feedbackClass(correct);
        feedback.textContent = correct ? '批改结果：正确' : '批改结果：错误，请再修改一次';
      });
    });

    section.querySelectorAll('.exit-answer-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qid = btn.getAttribute('data-exit-qid');
        if (!qid) return;
        const question = (quizBank[lessonId] || []).find((item) => item.id === qid);
        const card = section.querySelector(`.exit-card[data-exit-qid='${qid}']`);
        const node = card?.querySelector('[data-exit-role="answer"]');
        if (question && node instanceof HTMLElement) {
          node.textContent = '鍙傝€冪瓟妗堬細' + getAnswerText(question);
        }
      });
    });
  }
  function renderLessonHtml(lesson) {
    const sectionMap = {};
    splitSections(lesson.markdown).forEach((section) => { sectionMap[section.heading] = section; });
    const html = [];
    ['RuleCard', 'TeacherTalk', 'PitfallBox', 'PracticeA', 'PracticeB', 'PracticeC', 'ExitTicket'].forEach((key) => {
      const section = sectionMap[key];
      if (!section) return;
      if (key === 'RuleCard') html.push(renderRule(section.lines));
      else if (key === 'TeacherTalk') html.push(renderTeacherTalk(section.lines));
      else if (key === 'PitfallBox') html.push(renderPitfall(lesson.id, section.lines));
      else if (key === 'PracticeA' || key === 'PracticeB' || key === 'PracticeC') html.push(renderPracticeSection(section.heading, section.lines));
      else if (key === 'ExitTicket') html.push(renderExitTicket(lesson.id, section.lines));
    });
    return html.join('');
  }

  function bindLessonQuizEvents(lessonId) {
    const quizSection = document.getElementById('auto-quiz');
    if (!quizSection) return;

    quizSection.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const qid = target.getAttribute('data-qid');
      if (!qid) return;
      const lessonState = loadModuleState(KEYS.lesson, lessonId);
      lessonState.answers[qid] = getQuestionInputValue(el.lessonContent, lessonId, qid);
      saveModuleState(KEYS.lesson, lessonId, lessonState);
    });

    quizSection.querySelectorAll('.submit-q-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qid = btn.getAttribute('data-qid');
        if (!qid) return;
        gradeLessonQuestion(lessonId, qid);
        refreshLessonScore(lessonId);
        refreshLessonDoneMarks();
      });
    });

    quizSection.querySelectorAll('.show-answer-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qid = btn.getAttribute('data-qid');
        if (qid) showLessonAnswer(lessonId, qid);
      });
    });

    const gradeAllBtn = document.getElementById('grade-all-btn');
    if (gradeAllBtn) {
      gradeAllBtn.addEventListener('click', () => {
        (quizBank[lessonId] || []).forEach((question) => gradeLessonQuestion(lessonId, question.id));
        refreshLessonScore(lessonId);
        refreshLessonDoneMarks();
      });
    }

    const resetBtn = document.getElementById('reset-lesson-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        localStorage.removeItem(KEYS.lesson + lessonId);
        renderLesson(state.index);
      });
    }
  }

  function bindPitfallEvents(lessonId) {
    const section = document.querySelector('.section-pitfallbox');
    if (!section) return;

    section.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLTextAreaElement)) return;
      const qid = target.getAttribute('data-pit-qid');
      if (!qid) return;
      const pitState = loadModuleState(KEYS.pitfall, lessonId);
      pitState.answers[qid] = target.value;
      saveModuleState(KEYS.pitfall, lessonId, pitState);
    });

    section.querySelectorAll('.pit-submit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qid = btn.getAttribute('data-pit-qid');
        if (!qid) return;
        const card = section.querySelector(`.pit-card[data-pit-qid='${qid}']`);
        if (!card) return;
        const input = card.querySelector('.pit-input');
        const feedback = card.querySelector('[data-pit-role="feedback"]');
        if (!(input instanceof HTMLTextAreaElement) || !(feedback instanceof HTMLElement)) return;
        const value = input.value.trim();
        if (!value) {
          feedback.className = feedbackClass(null);
          feedback.textContent = '请先输入你的订正句。';
          return;
        }
        const answer = card.getAttribute('data-answer') || '';
        const correct = normalizeText(value) === normalizeText(answer);
        const pitState = loadModuleState(KEYS.pitfall, lessonId);
        pitState.answers[qid] = input.value;
        pitState.results[qid] = correct;
        saveModuleState(KEYS.pitfall, lessonId, pitState);
        feedback.className = feedbackClass(correct);
        feedback.textContent = correct ? '批改结果：正确' : '批改结果：错误，请再修改一次';
      });
    });

    section.querySelectorAll('.pit-show-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qid = btn.getAttribute('data-pit-qid');
        if (!qid) return;
        const card = section.querySelector(`.pit-card[data-pit-qid='${qid}']`);
        if (!card) return;
        const answerNode = card.querySelector('[data-pit-role="answer"]');
        if (answerNode instanceof HTMLElement) {
          answerNode.textContent = '鍙傝€冭姝ｏ細' + (card.getAttribute('data-answer') || '');
        }
      });
    });
  }

  function readExitAnswer(lessonId, qid) {
    const checked = document.querySelector(`input[name='${lessonId}_exit_${qid}']:checked`);
    if (checked instanceof HTMLInputElement) return checked.value;
    const textNode = document.querySelector(`[data-exit-qid='${qid}'][data-exit-qtype='text']`);
    return (textNode instanceof HTMLTextAreaElement || textNode instanceof HTMLInputElement) ? textNode.value : '';
  }

  function bindExitTicketEvents(lessonId) {
    const section = document.querySelector('.section-exitticket');
    if (!section) return;

    section.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const qid = target.getAttribute('data-exit-qid');
      if (!qid) return;
      const exitState = loadModuleState(KEYS.exit, lessonId);
      exitState.answers[`exit_${qid}`] = readExitAnswer(lessonId, qid);
      saveModuleState(KEYS.exit, lessonId, exitState);
    });

    section.querySelectorAll('.exit-submit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qid = btn.getAttribute('data-exit-qid');
        if (!qid) return;
        const question = (quizBank[lessonId] || []).find((item) => item.id === qid);
        const card = section.querySelector(`.exit-card[data-exit-qid='${qid}']`);
        const feedback = card?.querySelector('[data-exit-role="feedback"]');
        if (!question || !(feedback instanceof HTMLElement)) return;
        const value = readExitAnswer(lessonId, qid);
        if (!String(value).trim()) {
          feedback.className = feedbackClass(null);
          feedback.textContent = '请先作答再批改。';
          return;
        }
        const correct = evaluateQuestion(question, value);
        const exitState = loadModuleState(KEYS.exit, lessonId);
        exitState.answers[`exit_${qid}`] = value;
        exitState.results[`exit_${qid}`] = correct;
        saveModuleState(KEYS.exit, lessonId, exitState);
        feedback.className = feedbackClass(correct);
        feedback.textContent = correct ? '批改结果：正确' : '批改结果：错误，请再修改一次';
      });
    });

    section.querySelectorAll('.exit-answer-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qid = btn.getAttribute('data-exit-qid');
        if (!qid) return;
        const question = (quizBank[lessonId] || []).find((item) => item.id === qid);
        const card = section.querySelector(`.exit-card[data-exit-qid='${qid}']`);
        const node = card?.querySelector('[data-exit-role="answer"]');
        if (question && node instanceof HTMLElement) {
          node.textContent = '鍙傝€冪瓟妗堬細' + getAnswerText(question);
        }
      });
    });
  }

  function renderLesson(index) {
    const lesson = lessons[index];
    if (!lesson) return;
    state.index = index;
    el.lessonTitle.textContent = `${lesson.id} ${lesson.title}`;
    el.progressText.textContent = `${lesson.id} / L20`;
    el.lessonContent.innerHTML = renderLessonHtml(lesson);
    el.lessonList.querySelectorAll('.lesson-link').forEach((btn) => {
      const isActive = Number(btn.getAttribute('data-index')) === index;
      btn.classList.toggle('active', isActive);
    });
    el.prevBtn.disabled = index === 0;
    el.nextBtn.disabled = index === lessons.length - 1;
    const hash = `#${lesson.id}`;
    if (window.location.hash !== hash) history.replaceState(null, '', hash);
    bindLessonQuizEvents(lesson.id);
    bindPitfallEvents(lesson.id);
    bindExitTicketEvents(lesson.id);
    refreshLessonScore(lesson.id);
    refreshLessonDoneMarks();
  }

  function goTo(index) {
    if (index < 0 || index >= lessons.length) return;
    renderLesson(index);
  }

  function initLessonList() {
    const fragment = document.createDocumentFragment();
    lessons.forEach((lesson, idx) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lesson-link';
      btn.setAttribute('data-index', String(idx));
      btn.setAttribute('data-lesson-id', lesson.id);
      btn.innerHTML = `<span class='lesson-text'>${escapeHtml(lesson.id)} ${escapeHtml(lesson.title)}</span><span class='done-mark'></span>`;
      btn.addEventListener('click', () => goTo(idx));
      li.appendChild(btn);
      fragment.appendChild(li);
    });
    el.lessonList.appendChild(fragment);
  }

  function startIndexFromHash() {
    const hash = window.location.hash.replace('#', '').trim().toUpperCase();
    if (idToIndex.has(hash)) return idToIndex.get(hash);
    return 0;
  }

  function buildQuestionPool() {
    const pool = [];
    lessons.forEach((lesson, lessonIndex) => {
      (quizBank[lesson.id] || []).forEach((question, questionIndex) => {
        pool.push({
          uid: `${lesson.id}_${question.id}_${questionIndex}`,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          lessonIndex,
          questionIndex,
          ...question
        });
      });
    });
    return pool;
  }

  function shuffleCopy(items) {
    const arr = items.slice();
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function pickRandomQuestions(count) {
    const shuffled = shuffleCopy(buildQuestionPool());
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  function saveTestState(testState) {
    state.test = testState;
    saveJSON(KEYS.test, testState);
  }

  function getTestAnswerValue(root, item) {
    if (item.type === 'mcq') {
      const checked = root.querySelector(`input[name='${item.uid}_${item.id}']:checked`);
      return checked instanceof HTMLInputElement ? checked.value : '';
    }
    const node = root.querySelector(`[data-test-uid='${item.uid}'][data-test-qtype='text']`);
    return (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement) ? node.value : '';
  }

  function renderTestQuestion(item, index, savedAnswer, savedResult) {
    const isWrong = savedResult === false;
    const correctAnswer = getAnswerText(item);
    let errorDetail = '';
    if (isWrong && savedAnswer) {
      errorDetail = `<div class='error-detail'><p class='error-label'>浣犵殑绛旀锛?/p><p class='user-answer'>${inlineFormat(savedAnswer)}</p><p class='correct-label'>姝ｇ‘绛旀锛?/p><p class='correct-answer'>${inlineFormat(correctAnswer)}</p></div>`;
    } else if (isWrong && !savedAnswer) {
      errorDetail = `<div class='error-detail'><p class='error-label'>鏈綔绛?/p><p class='correct-label'>姝ｇ‘绛旀锛?/p><p class='correct-answer'>${inlineFormat(correctAnswer)}</p></div>`;
    }
    return [
      `<article class='test-card' data-test-uid='${item.uid}' data-lesson-id='${item.lessonId}' data-question-id='${item.id}'>`,
      `<p class='test-source'>${item.lessonId} ${item.lessonTitle}</p>`,
      `<p class='quiz-title'>${index + 1}. ${inlineFormat(item.prompt)}</p>`,
      questionInputHtml('test', item.uid, item, savedAnswer),
      `<p class='${feedbackClass(savedResult)}' data-test-role='feedback'>${savedResult === undefined ? '批改结果：未批改' : savedResult ? '批改结果：正确' : '批改结果：错误'}</p>`,
      errorDetail,
      '</article>'
    ].join('');
  }

  function renderTestPaper() {
    const testState = state.test && Array.isArray(state.test.items) ? state.test : { items: [], answers: {}, results: {}, submitted: false };
    if (!testState.items.length) {
      el.testPaper.innerHTML = "<p class='empty-state'>正在生成测试题...</p>";
      el.testSummary.textContent = '正在加载测试...';
      if (el.testSubmitArea) el.testSubmitArea.classList.add('hidden');
      return;
    }
    const scored = Object.values(testState.results || {}).filter(Boolean).length;
    const answered = Object.keys(testState.answers || {}).length;
    el.testSummary.textContent = testState.submitted
      ? `已提交：${scored} 题正确，错题 ${testState.items.length - scored} 题。`
      : `当前已作答 ${answered} / ${testState.items.length} 题。完成后点击“提交整卷批改”。`;
    el.testPaper.innerHTML = testState.items.map((item, idx) => {
      const savedAnswer = testState.answers[item.uid] || '';
      const savedResult = Object.prototype.hasOwnProperty.call(testState.results || {}, item.uid) ? testState.results[item.uid] : undefined;
      return renderTestQuestion(item, idx, savedAnswer, savedResult);
    }).join('');
    if (el.testSubmitArea) {
      el.testSubmitArea.classList.toggle('hidden', testState.submitted);
    }
  }

  function bindTestPaperEvents() {
    const paper = el.testPaper;
    if (!paper) return;
    if (paper.dataset.bound === '1') return;
    paper.dataset.bound = '1';
    paper.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const uid = target.getAttribute('data-test-uid');
      if (!uid || !state.test || !Array.isArray(state.test.items)) return;
      const item = state.test.items.find((q) => q.uid === uid);
      if (!item) return;
      state.test.answers[uid] = getTestAnswerValue(paper, item);
      saveTestState(state.test);
      renderTestPaper();
      bindTestPaperEvents();
    });
  }

  function addWrongbookItem(item, userAnswer) {
    const correctAnswer = getAnswerText(item);
    const next = (state.wrongbook || []).filter((entry) => entry.uid !== item.uid);
    next.unshift({
      uid: item.uid,
      lessonId: item.lessonId,
      lessonTitle: item.lessonTitle,
      questionId: item.id,
      type: item.type,
      prompt: item.prompt,
      userAnswer,
      correctAnswer,
      updatedAt: Date.now()
    });
    state.wrongbook = next;
    saveJSON(KEYS.wrongbook, next);
  }

  function removeWrongbookItem(uid) {
    const next = (state.wrongbook || []).filter((entry) => entry.uid !== uid);
    state.wrongbook = next;
    saveJSON(KEYS.wrongbook, next);
    renderWrongbook();
  }

  function renderWrongbook() {
    const list = state.wrongbook || [];
    if (!list.length) {
      el.wrongbookList.innerHTML = "<p class='empty-state'>杩樻病鏈夐敊棰樸€傚畬鎴愪竴娆℃祴璇曞悗锛岄敊棰樹細鑷姩鍑虹幇鍦ㄨ繖閲屻€?/p>";
      return;
    }
    el.wrongbookList.innerHTML = list.map((entry, idx) => [
      `<article class='wrongbook-card' data-wrong-uid='${entry.uid}'>`,
      `<p class='wrongbook-source'>${idx + 1}. ${escapeHtml(entry.lessonId)} ${escapeHtml(entry.lessonTitle)}</p>`,
      `<p class='quiz-title'>${inlineFormat(entry.prompt)}</p>`,
      `<p><strong>浣犵殑绛旀锛?/strong>${entry.userAnswer ? inlineFormat(entry.userAnswer) : "<span class='muted'>鏈綔绛?/span>"}</p>`,
      `<p><strong>姝ｇ‘绛旀锛?/strong>${inlineFormat(entry.correctAnswer)}</p>`,
      `<div class='wrongbook-actions'><button type='button' class='mini-btn light wrong-remove-btn' data-wrong-uid='${entry.uid}'>绉诲嚭閿欓闆?/button></div>`,
      '</article>'
    ].join('')).join('');
    el.wrongbookList.querySelectorAll('.wrong-remove-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const uid = btn.getAttribute('data-wrong-uid');
        if (uid) removeWrongbookItem(uid);
      });
    });
  }

  function generateTestSheet() {
    const items = pickRandomQuestions(20);
    saveTestState({ id: `test_${Date.now()}`, items, answers: {}, results: {}, submitted: false, generatedAt: Date.now() });
    setTestSubMode('exam');
    renderTestPaper();
    bindTestPaperEvents();
  }

  function gradeCurrentTest() {
    if (!state.test || !Array.isArray(state.test.items) || !state.test.items.length) return;
    const paper = el.testPaper;
    const nextResults = {};
    let correctCount = 0;
    let blankCount = 0;
    state.test.items.forEach((item) => {
      const userAnswer = getTestAnswerValue(paper, item);
      state.test.answers[item.uid] = userAnswer;
      const card = paper.querySelector(`.test-card[data-test-uid='${item.uid}']`);
      const feedback = card?.querySelector('[data-test-role="feedback"]');
      if (!String(userAnswer).trim()) {
        nextResults[item.uid] = false;
        blankCount += 1;
        if (feedback instanceof HTMLElement) {
          feedback.className = feedbackClass(null);
          feedback.textContent = '鎵规敼缁撴灉锛氭湭浣滅瓟';
        }
        return;
      }
      const correct = evaluateQuestion(item, userAnswer);
      nextResults[item.uid] = correct;
      if (correct) correctCount += 1;
      if (feedback instanceof HTMLElement) {
        feedback.className = feedbackClass(correct);
        feedback.textContent = correct ? '批改结果：正确' : '批改结果：错误，请再修改一次';
      }
      if (correct) {
        state.wrongbook = (state.wrongbook || []).filter((entry) => entry.uid !== item.uid);
        saveJSON(KEYS.wrongbook, state.wrongbook);
      } else {
        addWrongbookItem(item, userAnswer);
      }
    });
    state.test.results = nextResults;
    state.test.submitted = true;
    saveTestState(state.test);
    el.testSummary.textContent = '本次得分：' + correctCount + ' / ' + state.test.items.length + '，未作答 ' + blankCount + ' 题，错题 ' + (state.test.items.length - correctCount) + ' 题。错题已加入错题集。';
    renderWrongbook();
    renderTestPaper();
    bindTestPaperEvents();
    if (el.testSubmitArea) {
      el.testSubmitArea.classList.add('hidden');
    }
  }

  function renderTestView() {
    if (!state.test || !state.test.items || !state.test.items.length) {
      generateTestSheet();
      return;
    }
    renderTestPaper();
    renderWrongbook();
    bindTestPaperEvents();
    if (el.testSubmitArea) {
      el.testSubmitArea.classList.toggle('hidden', state.test.submitted);
    }
  }

  function setTestSubMode(submode) {
    el.subtabExam.classList.toggle('active', submode === 'exam');
    el.subtabWrong.classList.toggle('active', submode === 'wrong');
    el.examPanel.classList.toggle('hidden', submode !== 'exam');
    el.wrongbookPanel.classList.toggle('hidden', submode !== 'wrong');
    if (submode === 'wrong') renderWrongbook();
  }

  function switchMode(mode) {
    state.mode = mode;
    saveJSON(KEYS.ui, { mode });
    el.tabLearn.classList.toggle('active', mode === 'learn');
    el.tabTest.classList.toggle('active', mode === 'test');
    el.learnView.classList.toggle('hidden', mode !== 'learn');
    el.testView.classList.toggle('hidden', mode !== 'test');
    if (mode === 'test') renderTestView();
    else renderLesson(state.index);
  }

  function bindGlobalEvents() {
    el.prevBtn.addEventListener('click', () => goTo(state.index - 1));
    el.nextBtn.addEventListener('click', () => goTo(state.index + 1));
    el.tabLearn.addEventListener('click', () => switchMode('learn'));
    el.tabTest.addEventListener('click', () => switchMode('test'));
    el.subtabExam.addEventListener('click', () => setTestSubMode('exam'));
    el.subtabWrong.addEventListener('click', () => setTestSubMode('wrong'));
    el.submitTestBtn.addEventListener('click', gradeCurrentTest);
    el.clearWrongbookBtn.addEventListener('click', () => {
      state.wrongbook = [];
      saveJSON(KEYS.wrongbook, []);
      renderWrongbook();
    });
    window.addEventListener('hashchange', () => {
      if (state.mode !== 'learn') return;
      goTo(startIndexFromHash());
    });
    window.addEventListener('keydown', (event) => {
      if (state.mode !== 'learn') return;
      if (event.key === 'ArrowLeft') goTo(state.index - 1);
      if (event.key === 'ArrowRight') goTo(state.index + 1);
    });
    el.copyLinkBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        el.copyLinkBtn.textContent = '已复制';
      } catch (_err) {
        el.copyLinkBtn.textContent = '澶嶅埗澶辫触';
      }
      setTimeout(() => { el.copyLinkBtn.textContent = '澶嶅埗褰撳墠閾炬帴'; }, 1200);
    });
  }

  initLessonList();
  bindGlobalEvents();
  const startIndex = startIndexFromHash();
  goTo(startIndex);
  switchMode(state.mode === 'test' ? 'test' : 'learn');
  if (state.mode === 'test') {
    setTestSubMode('exam');
    renderTestView();
  }
})();




