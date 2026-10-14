'use strict';

/* ==========================================================
   1. STORE  (localStorage stands in for a backend/API)
   ========================================================== */
const DB_KEY = 'quiz-db-v3', USER_KEY = 'quiz-user', TEST_KEY = 'quiz-test-v3';
const LETTERS = 'ABCD';

const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ } };
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

const SAMPLE = [
  ['Thủ đô của Việt Nam là thành phố nào?', ['Huế', 'Hà Nội', 'Đà Nẵng', 'Cần Thơ'], 1],
  ['Sông nào dài nhất Việt Nam?', ['Sông Hồng', 'Sông Đà', 'Sông Mê Công', 'Sông Cả'], 2],
  ['Đỉnh núi cao nhất Việt Nam là?', ['Phan Xi Păng', 'Bạch Mã', 'Langbiang', 'Ngọc Linh'], 0],
  ['HTML là viết tắt của?', ['HyperText Markup Language', 'High Tech Modern Language', 'Home Tool Markup Language', 'Hyper Transfer Mode Link'], 0],
  ['1 byte bằng bao nhiêu bit?', ['4', '8', '16', '32'], 1],
].map(([text, options, correct]) => ({ text, options, correct }));

const TIN = [
  ['CPU là viết tắt của?', ['Central Processing Unit', 'Computer Personal Unit', 'Central Program Utility', 'Control Process Union'], 0],
  ['Phần mở rộng của tệp ảnh phổ biến là?', ['.exe', '.jpg', '.sys', '.dll'], 1],
  ['Bộ nhớ nào mất dữ liệu khi tắt máy?', ['ROM', 'SSD', 'RAM', 'HDD'], 2],
  ['Giao thức truy cập web an toàn là?', ['FTP', 'HTTP', 'SMTP', 'HTTPS'], 3],
].map(([text, options, correct]) => ({ text, options, correct }));

/** Tests the student can open (would come from an API). */
const EXAMS = [
  { id: 'e1', code: 'TN012', title: 'Kiểm tra mẫu: Kiến thức chung', ownerName: 'Phạm Bích Như', dueText: 'Hạn nộp: 31/12/2026', minutes: 10, maxAttempts: 5, questions: SAMPLE },
  { id: 'e2', code: 'TH015', title: 'Tin học cơ bản', ownerName: 'Phạm Bích Như', dueText: 'Không thời hạn', minutes: 5, maxAttempts: 3, questions: TIN },
];

/** Sample classmates so the leaderboard has something to show (mock data). */
const MOCK_RANKING = [['Nguyễn Minh Anh', 9, 300], ['Trần Gia Bảo', 8, 420], ['Lê Thu Hà', 7, 380]];

function seedDb() {
  return { attempts: [], started: [] };
}

let db = read(DB_KEY, null) || seedDb();
const commit = () => write(DB_KEY, db);

/* ==========================================================
   2. APP STATE
   ========================================================== */
/* The login page is built separately. After a successful login it should save the student as
     localStorage.setItem('quiz-user', JSON.stringify({ id: '...', name: '...', code: '...' }))
   and redirect to index.html. Until then a guest student is used so the pages can be previewed. */
const GUEST = { id: 'guest', name: 'Học sinh', code: 'HS0001' };
let me = read(USER_KEY, null) || GUEST;
let route = { name: 'home', id: null };
let session = null;         // test being taken (also saved to TEST_KEY so a refresh can resume)
let timerId = null;

/* Display preferences (dark mode) */
const PREF_KEY = 'quiz-prefs-v2';
const prefs = { dark: false, ...read(PREF_KEY, {}) };
const savePrefs = () => write(PREF_KEY, prefs);
const applyTheme = () => document.documentElement.setAttribute('data-bs-theme', prefs.dark ? 'dark' : 'light');
applyTheme();


/* ==========================================================
   3. HELPERS
   ========================================================== */
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const getExam = (id) => EXAMS.find((e) => e.id === id);
const examAttempts = (examId) => db.attempts.filter((a) => a.examId === examId);
const myAttempts = (examId) => examAttempts(examId).filter((a) => a.userId === me.id);
const bestScore = (examId) => Math.max(...myAttempts(examId).map((a) => a.score));
const initial = (name) => name.trim()[0].toUpperCase();

function formatNow() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const formatDuration = (s) => (s < 60 ? `${s} giây` : `${Math.round(s / 60)} phút`);

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast-msg';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}
function showModal(title, html) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html;
  bootstrap.Modal.getOrCreateInstance('#modal').show();
}
const hideModal = () => bootstrap.Modal.getOrCreateInstance('#modal').hide();

/** Best attempt per student, ranked by score then speed. */
function standings(examId) {
  const best = {};
  examAttempts(examId).forEach((a) => {
    const b = best[a.userId];
    if (!b || a.score > b.score || (a.score === b.score && a.seconds < b.seconds)) best[a.userId] = a;
  });
  const mock = MOCK_RANKING.map(([userName, score, seconds], i) => ({ userId: `mock${i}`, userName, score, seconds }));
  return [...Object.values(best), ...mock].sort((x, y) => y.score - x.score || x.seconds - y.seconds);
}
const rankOf = (examId) => standings(examId).findIndex((a) => a.userId === me.id) + 1 || '-';

/* ==========================================================
   4. TEMPLATES (shell + pieces reused by several screens)
   ========================================================== */
const iconBox = (icon, tone, extra = '') => `<span class="icon-box ${extra} tone-${tone}"><i class="bi bi-${icon}"></i></span>`;
const infoRow = (icon, tone, label, value) =>
  `<div class="info-row">${iconBox(icon, tone)}<span class="text-secondary flex-grow-1">${label}</span><b class="fw-medium">${value}</b></div>`;
const navTarget = (to, id = '') => `data-action="go" data-to="${to}" data-id="${id}"`;
const backLink = (attrs) => `<button class="back-link" ${attrs}><i class="bi bi-chevron-left"></i> Quay lại</button>`;
const pageTitle = (html) => `<h5 class="page-title">${html}</h5>`;

const startedExams = () => db.started.filter((x) => x.userId === me.id).map((x) => getExam(x.examId)).filter(Boolean);
const isDone = (exam) => myAttempts(exam.id).length > 0;

/** Which sidebar button is highlighted on each screen. */
const NAV = { home: 'classes', exam: 'classes', detail: 'classes', result: 'classes', courses: 'courses' };

function shell(content, nav) {
  const sideBtn = (key, icon, action, title) => `<button class="side-btn ${nav === key ? 'active' : ''}" title="${title}" ${action}><i class="bi bi-${icon}"></i></button>`;
  const item = (action, icon, label, attrs = '') => `<li><a class="dropdown-item" href="#" data-action="${action}" ${attrs}><i class="bi bi-${icon}"></i>${label}</a></li>`;
  return `
  <div class="shell">
    <aside class="side">
      <div class="logo"><i class="bi bi-mortarboard-fill"></i></div>
      ${sideBtn('classes', 'layers', navTarget('home'), 'Đề thi')}
      ${sideBtn('courses', 'journal-bookmark', navTarget('courses'), 'Khóa học')}
      <div class="side-bottom">${sideBtn('', 'gear', 'data-action="openSettings"', 'Cài đặt')}</div>
    </aside>
    <div class="main-wrap">
      <header class="top">
        <button class="icon-btn" ${navTarget('notifications')} title="Thông báo"><i class="bi bi-bell"></i></button>
        <div class="dropdown">
          <button class="user-btn" data-bs-toggle="dropdown"><span class="avatar">${esc(initial(me.name))}</span>
            <span class="d-none d-sm-block text-start lh-sm"><span class="d-block small fw-medium">${esc(me.name)}</span><span class="d-block text-secondary" style="font-size:.7rem">Học sinh</span></span></button>
          <ul class="dropdown-menu dropdown-menu-end user-menu">
            ${item('go', 'person', 'Tài Khoản', 'data-to="account" data-id=""')}
            ${item('becomeTeacher', 'shield-check', 'Đăng ký làm giáo viên')}
            ${item('refresh', 'arrow-repeat', 'Refresh')}
            <li><hr class="dropdown-divider"></li>
            ${item('openQr', 'upc-scan', 'QR đăng nhập')}
            ${item('openForgotQr', 'qr-code', 'Tạo QR quên mật khẩu')}
            ${item('logout', 'box-arrow-right', 'Đăng xuất')}
          </ul>
        </div>
      </header>
      <main class="content">${content}</main>
    </div>
  </div>`;
}

function examRow(exam) {
  return `<div class="exam-row" ${navTarget('exam', exam.id)}><span class="file-ico"><i class="bi bi-file-earmark-check"></i></span>
    <div class="flex-grow-1"><div class="fw-medium">${esc(exam.title)}</div>
      <div class="small text-secondary">Điểm của bạn: <b>${isDone(exam) ? bestScore(exam.id) : '-'}</b></div>
      <div class="small text-secondary">Thời gian vào thi: ${esc(exam.dueText)}</div></div>
    <div class="small text-secondary text-end d-none d-sm-block">${exam.minutes} phút<br>${exam.questions.length} câu</div></div>`;
}
const examSection = (title, list) => list.length
  ? `<h6 class="fw-semibold mt-4 mb-2">${title} (${list.length})</h6><div class="panel pb-2">${list.map(examRow).join('')}</div>` : '';

/* ==========================================================
   5. SCREENS
   ========================================================== */
const screens = {};

/* ---- Home: the student's tests ---- */
function myExamsHtml(query) {
  const all = startedExams();
  if (!all.length) return '<div class="panel text-center text-secondary py-5"><i class="bi bi-inbox display-5"></i><p class="mt-3 mb-0">Chưa có bài thi nào.<br>Bấm “Tìm giáo viên” để nhập mã đề hoặc tìm đề thi.</p></div>';
  const list = all.filter((e) => e.title.toLowerCase().includes(query.toLowerCase()));
  if (!list.length) return '<div class="panel text-center text-secondary py-4">Không tìm thấy đề thi phù hợp.</div>';
  return examSection('Chờ làm', list.filter((e) => !isDone(e))) + examSection('Đã hoàn thành', list.filter(isDone));
}

screens.home = () => `${pageTitle('Đề thi của tôi')}
  <div class="d-flex justify-content-between align-items-center gap-2 flex-wrap mb-2">
    <div class="search-box"><input class="form-control" placeholder="Tìm kiếm đề thi" data-input="filterMyExams"><i class="bi bi-search"></i></div>
    <button class="btn btn-primary" data-action="openCode"><i class="bi bi-plus-lg me-2"></i>Tìm giáo viên</button>
  </div>
  <div id="my-exams">${myExamsHtml('')}</div>`;

/* ---- Danh sách khóa học ---- */
screens.courses = () => `${backLink(navTarget('home'))}
  <div class="d-flex justify-content-between align-items-center gap-2 flex-wrap mb-3">
    <h5 class="page-title mb-0">Danh sách khóa học <span class="fw-normal">(0 Khóa học)</span></h5>
    <div class="search-box"><input class="form-control" placeholder="Tìm kiếm"><i class="bi bi-search"></i></div></div>
  <div class="panel text-center py-5"><i class="bi bi-inbox display-4 text-primary"></i><div class="small mt-2">Chưa có khóa học nào</div></div>`;

/* ---- Account ---- */
screens.account = () => {
  const row = (action, icon, tone, label) => `<div class="menu-row" data-action="${action}">${iconBox(icon, tone, 'icon-box-lg')}<span class="flex-grow-1">${label}</span><i class="bi bi-chevron-right text-secondary"></i></div>`;
  return `${backLink(navTarget('home'))}
  <div style="max-width:560px">
    <div class="app-card p-4 mb-4 text-center"><span class="avatar avatar-lg">${esc(initial(me.name))}</span><h5 class="fw-semibold mt-3">${esc(me.name)}</h5>
      <div class="text-secondary">${esc(me.code)} • Học sinh</div></div>
    <div class="app-card mb-4">${row('openProfile', 'person', 'blue', 'Thông tin tài khoản')}</div>
    <button class="btn btn-outline-secondary w-100 py-2" data-action="logout"><i class="bi bi-box-arrow-right me-2"></i>Đăng xuất</button></div>`;
};

/* ---- Notifications ---- */
screens.notifications = () =>
  `${backLink(navTarget('home'))}${pageTitle('Thông báo')}<div class="panel text-center text-secondary py-5">Chưa có thông báo</div>`;

/* ---- Exam detail + history ---- */
screens.exam = () => {
  const exam = getExam(route.id);
  const mine = myAttempts(exam.id), left = exam.maxAttempts - mine.length;
  const history = mine.map((a) => `
    <div class="app-card mb-3 overflow-hidden">
      <div class="d-flex justify-content-between p-3 border-bottom"><b class="text-secondary fw-medium">Điểm:</b><b class="fs-3" style="color:var(--red);line-height:1">${a.score}</b></div>
      <div class="px-3">${infoRow('alarm', 'red', 'Thời gian làm bài:', formatDuration(a.seconds))}${infoRow('check-circle', 'green', 'Số câu đúng:', `${a.correct}/${a.total} câu`)}
        <div class="text-end fst-italic text-secondary small py-2">${a.date}</div></div>
      <div class="history-footer" ${navTarget('detail', a.id)}><i class="bi bi-eye me-2"></i>Xem chi tiết bài làm</div></div>`).join('')
    || '<div class="panel text-secondary text-center py-4">Bạn chưa làm đề này.</div>';
  return `${backLink(navTarget('home'))}
  <div class="row g-4"><div class="col-lg-5">
    <div class="app-card p-3 mb-4"><h5 class="fw-semibold mb-0">${esc(exam.title)}</h5>
      ${infoRow('person', 'blue', 'Giáo viên:', esc(exam.ownerName))}${infoRow('alarm', 'red', 'Thời gian làm bài:', `${exam.minutes} phút`)}
      ${infoRow('fonts', 'blue', 'Loại đề:', 'Trắc nghiệm')}${infoRow('info-circle', 'green', 'Số lượng câu hỏi:', `${exam.questions.length} câu`)}
      ${infoRow('heart', 'amber', 'Số lượt làm đề còn lại:', `${left}/${exam.maxAttempts} lượt`)}
      <button class="btn btn-yellow w-100 py-2 mt-3" ${left > 0 ? '' : 'disabled'} data-action="startTest" data-id="${exam.id}"><i class="bi bi-pencil me-2"></i>${left > 0 ? 'Bắt đầu thi' : 'Hết lượt làm bài'}</button></div>
    <h6 class="fw-semibold mb-2">Xếp hạng</h6>
    <div class="rank-card">${iconBox('trophy', 'blue')}<span class="fs-5 flex-grow-1">Thứ hạng: ${rankOf(exam.id)}</span>
      <a class="text-white" href="#" data-action="openLeaderboard" data-id="${exam.id}">Bảng xếp hạng ›</a></div></div>
    <div class="col-lg-7"><h6 class="fw-semibold mb-2">Lịch sử làm bài</h6>${history}</div></div>`;
};

/* ---- Student: taking a test ---- */
screens.take = () => {
  const { questions, answers, index } = session;
  const q = questions[index], last = index === questions.length - 1;
  return `
  <div class="exam-bar"><button class="btn p-0 border-0" data-action="leaveTest"><i class="bi bi-x-lg fs-4"></i></button>
    <div class="flex-grow-1 text-center fw-medium text-truncate px-2">${esc(session.title)}</div><b id="clock" class="fs-5">--:--</b></div>
  <div class="exam-wrap p-3">
    <div class="d-flex flex-wrap gap-2 mb-3">${questions.map((_, i) => `<button class="q-btn ${answers[i] !== undefined ? 'answered' : ''} ${i === index ? 'current' : ''}" data-action="jump" data-id="${i}">${i + 1}</button>`).join('')}</div>
    <div class="app-card p-3 mb-3"><div class="text-secondary small mb-1">Câu ${index + 1}/${questions.length}</div><div class="fs-5 fw-medium">${esc(q.text)}</div></div>
    ${q.options.map((o, k) => `<div class="option mb-2 ${answers[index] === k ? 'selected' : ''}" data-action="answer" data-id="${k}"><b class="text-primary">${LETTERS[k]}.</b>${esc(o)}</div>`).join('')}
    <div class="d-flex gap-2 mt-4"><button class="btn btn-outline-secondary flex-fill" ${index ? '' : 'disabled'} data-action="step" data-id="-1">Câu trước</button>
      ${last ? '<button class="btn btn-yellow flex-fill" data-action="submit">Nộp bài</button>' : '<button class="btn btn-primary flex-fill" data-action="step" data-id="1">Câu sau</button>'}</div>
    <button class="btn btn-link w-100 mt-2" data-action="submit">Nộp bài sớm</button></div>`;
};

screens.result = () => {
  const a = session.result;
  return `<div class="text-center p-4" style="padding-top:6vh!important"><div class="text-secondary">Điểm của bạn</div>
    <div style="font-size:5rem;font-weight:600;line-height:1.1;color:${a.score >= 5 ? 'var(--green)' : 'var(--red)'}">${a.score}</div>
    <p class="text-secondary">Đúng ${a.correct}/${a.total} câu • ${formatDuration(a.seconds)}</p>
    <button class="btn btn-primary w-100 py-2 mb-2" ${navTarget('detail', a.id)}>Xem chi tiết bài làm</button>
    <button class="btn btn-outline-dark w-100 py-2" ${navTarget('home')}>Về trang chủ</button></div>`;
};

screens.detail = () => {
  const a = db.attempts.find((x) => x.id === route.id && x.userId === me.id);
  if (!a) return screens.home();
  const cards = a.questions.map((q, i) => {
    const chosen = a.answers[i];
    const rows = q.options.map((o, k) => {
      const status = k === q.correct ? 'correct' : k === chosen ? 'wrong' : '';
      const mark = k === q.correct ? '<i class="bi bi-check-lg ms-auto text-success"></i>' : k === chosen ? '<i class="bi bi-x-lg ms-auto text-danger"></i>' : '';
      return `<div class="option mb-1 ${status}"><b>${LETTERS[k]}.</b>${esc(o)}${mark}</div>`;
    }).join('');
    return `<div class="app-card p-3 mb-3"><div class="fw-medium mb-2">Câu ${i + 1}. ${esc(q.text)}</div>${rows}${chosen < 0 ? '<div class="small text-danger mt-1">Bạn chưa trả lời câu này</div>' : ''}</div>`;
  }).join('');
  return `${backLink(navTarget('exam', a.examId))}<div style="max-width:760px">
    <div class="app-card p-3 mb-3 d-flex justify-content-between"><span>Điểm: <b style="color:var(--red)">${a.score}</b></span><span>Đúng ${a.correct}/${a.total}</span></div>${cards}</div>`;
};

/* ==========================================================
   6. RENDER & NAVIGATION
   ========================================================== */
function render() {
  const html = screens[route.name]();
  $('#app').innerHTML = route.name === 'take' ? html : shell(html, NAV[route.name] || '');
}

function navigate(name, id = null) {
  if (name !== 'take') clearInterval(timerId);
  route = { name, id };
  render();
  window.scrollTo(0, 0);
}

/* ==========================================================
   7. TEST SESSION
   ========================================================== */
function startTest(examId) {
  const exam = getExam(examId);
  if (!exam) return toast('Đề thi không còn tồn tại');
  if (session && session.examId === examId && !session.result && session.endsAt > Date.now()) return resumeSession();   // continue an unfinished test
  if (myAttempts(examId).length >= exam.maxAttempts) return toast('Bạn đã hết lượt làm bài');
  if (!db.started.some((s) => s.userId === me.id && s.examId === examId)) { db.started.push({ userId: me.id, examId }); commit(); }
  session = {
    userId: me.id, examId, title: exam.title, questions: exam.questions.map((q) => ({ ...q })), answers: {}, index: 0,
    startedAt: Date.now(), endsAt: Date.now() + exam.minutes * 60000,
  };
  resumeSession();
}

function resumeSession() {
  write(TEST_KEY, session);
  route = { name: 'take', id: session.examId };
  render();
  clearInterval(timerId);
  timerId = setInterval(tickClock, 500);
  tickClock();
}

function tickClock() {
  const left = Math.max(0, Math.round((session.endsAt - Date.now()) / 1000));
  const clock = $('#clock');
  if (clock) {
    clock.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
    clock.classList.toggle('text-danger', left < 60);
  }
  if (left <= 0) { toast('Hết giờ, hệ thống tự nộp bài'); submitTest(true); }
}

/** Grading happens here: compare each answer with the stored correct index. */
function submitTest(auto = false) {
  const total = session.questions.length, answered = Object.keys(session.answers).length;
  if (!auto && answered < total && !confirm(`Bạn mới trả lời ${answered}/${total} câu. Nộp bài ngay?`)) return;
  clearInterval(timerId);
  const correct = session.questions.filter((q, i) => session.answers[i] === q.correct).length;
  const attempt = {
    id: uid(), examId: session.examId, userId: me.id, userName: me.name, userCode: me.code,
    score: Math.round((correct / total) * 100) / 10, correct, total,
    seconds: Math.min(Math.round((Date.now() - session.startedAt) / 1000), Math.round((session.endsAt - session.startedAt) / 1000)),
    date: formatNow(), questions: session.questions, answers: session.questions.map((_, i) => session.answers[i] ?? -1),
  };
  db.attempts.unshift(attempt);
  commit();
  localStorage.removeItem(TEST_KEY);
  session.result = attempt;
  route = { name: 'result', id: null };
  render();
}

/* ==========================================================
   8. MODAL CONTENT
   ========================================================== */
const searchHtml = (q) => EXAMS.filter((e) => (e.title + e.code).toLowerCase().includes(q.toLowerCase())).map((e) => `
  <div class="p-3 border rounded-3 mb-2 clickable" data-action="openExam" data-id="${e.id}"><div class="fw-medium">${esc(e.title)}</div>
  <div class="small text-secondary">${esc(e.ownerName)} • ${e.minutes} phút • ${e.questions.length} câu</div></div>`).join('')
  || '<div class="text-secondary text-center">Không tìm thấy đề thi phù hợp.</div>';

/* ==========================================================
   9. ACTIONS  (every button maps to one function here)
   ========================================================== */
/** Set this to your login page (e.g. 'login.html') so "Đăng xuất" sends the student there. */
const LOGIN_URL = '';

const actions = {
  /* session */
  logout() {
    clearInterval(timerId);
    session = null;
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TEST_KEY);
    if (LOGIN_URL) { location.href = LOGIN_URL; return; }
    me = GUEST;
    navigate('home');
    toast('Đã đăng xuất');
  },

  /* navigation */
  go: ({ to, id }) => navigate(to, id || null),
  openExam: ({ id }) => { hideModal(); navigate('exam', id); },

  /* student: finding tests */
  openCode() {
    showModal('Tìm giáo viên / nhập mã đề', `<label class="form-label small text-secondary">Mã đề do giáo viên cung cấp</label>
      <div class="input-group mb-3"><input id="exam-code" class="form-control text-uppercase" placeholder="Ví dụ: TN012" data-enter="joinByCode"><button class="btn btn-primary" data-action="joinByCode">Vào đề thi</button></div>
      <div class="small text-secondary mb-2">Hoặc tìm theo tên đề</div><input class="form-control mb-3" placeholder="Nhập tên đề..." data-input="searchExams"><div id="search-results">${searchHtml('')}</div>`);
  },

  /* top bar, user menu, settings */
  openSettings: () => showModal('Cài đặt', `<div class="d-flex justify-content-between align-items-center"><span>Chế độ tối</span>
    <div class="form-check form-switch fs-4 m-0"><input class="form-check-input" type="checkbox" ${prefs.dark ? 'checked' : ''} data-change="toggleDark"></div></div>`),
  toggleDark() { prefs.dark = !prefs.dark; savePrefs(); applyTheme(); render(); },
  becomeTeacher: () => showModal('Đăng ký làm giáo viên', '<p class="mb-0">Bản này chỉ gồm giao diện học sinh nên chưa hỗ trợ đăng ký tài khoản giáo viên.</p>'),
  refresh() { db = read(DB_KEY, db); render(); toast('Đã làm mới dữ liệu'); },
  openQr: () => showModal('QR đăng nhập', `<div class="text-center"><i class="bi bi-qr-code display-1"></i><p class="small text-secondary mt-2">Dùng ứng dụng trên điện thoại để quét và đăng nhập (mô phỏng). Mã: <b>${esc(me.code)}</b></p></div>`),
  openForgotQr: () => showModal('Tạo QR quên mật khẩu', `<div class="text-center"><i class="bi bi-qr-code display-1"></i><p class="small text-secondary mt-2">Đưa mã QR này cho giáo viên để đặt lại mật khẩu cho <b>${esc(me.code)}</b> (mô phỏng).</p></div>`),
  joinByCode() {
    const code = $('#exam-code').value.trim().toUpperCase(), exam = EXAMS.find((e) => e.code === code);
    if (!exam) return toast('Không tìm thấy đề thi với mã này');
    hideModal(); navigate('exam', exam.id);
  },
  openLeaderboard({ id }) {
    const rows = standings(id).slice(0, 10).map((a, i) => `<div class="d-flex justify-content-between py-2 border-bottom ${a.userId === me.id ? 'fw-semibold text-primary' : ''}"><span>${i + 1}. ${esc(a.userName)}</span><b>${a.score}</b></div>`).join('');
    showModal('Bảng xếp hạng', rows || '<div class="text-center text-secondary">Chưa có ai nộp bài.</div>');
  },

  /* student: test taking */
  startTest: ({ id }) => startTest(id),
  answer: ({ id }) => { session.answers[session.index] = +id; write(TEST_KEY, session); render(); },
  jump: ({ id }) => { session.index = +id; write(TEST_KEY, session); render(); },
  step: ({ id }) => { session.index += +id; write(TEST_KEY, session); render(); },
  submit: () => submitTest(),
  leaveTest() { if (confirm('Rời khỏi bài thi? Đồng hồ vẫn tiếp tục chạy và bài làm được lưu lại.')) { navigate('home'); } },

  /* account */
  openProfile: () => showModal('Thông tin tài khoản', `<p class="mb-1"><b>Họ tên:</b> ${esc(me.name)}</p><p class="mb-1"><b>Mã số:</b> ${esc(me.code)}</p><p><b>Vai trò:</b> Học sinh</p>`),
};

/* ==========================================================
   10. EVENTS  (one delegated listener per event type)
   ========================================================== */
const inputs = {
  searchExams: (v) => { $('#search-results').innerHTML = searchHtml(v); },
  filterMyExams: (v) => { $('#my-exams').innerHTML = myExamsHtml(v); },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !actions[el.dataset.action]) return;
  e.preventDefault();
  actions[el.dataset.action](el.dataset, el);
});
document.addEventListener('input', (e) => {
  inputs[e.target.dataset.input]?.(e.target.value);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset.enter) actions[e.target.dataset.enter]();
});
document.addEventListener('change', (e) => actions[e.target.dataset.change]?.());
window.addEventListener('storage', (e) => {   // keep other tabs in sync, but never interrupt a running test
  if (e.key !== DB_KEY || route.name === 'take') return;
  db = read(DB_KEY, db);
  render();
});

/* ==========================================================
   11. START
   ========================================================== */
const saved = read(TEST_KEY, null);
if (saved && saved.userId === me.id) { session = saved; resumeSession(); }
else render();