/**
 * Giải Bài Tập AI — Frontend Application (Vietnamese)
 */

const state = {
    selectedSubject: 'general',
    isLoading: false,
    lastRawAnswer: '',
    lastQuestion: '',
    theme: localStorage.getItem('hw-theme') || 'dark',
    bookmarks: JSON.parse(localStorage.getItem('hw-bookmarks') || '[]'),
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
    questionInput: $('#questionInput'),
    solveBtn: $('#solveBtn'),
    btnText: $('.btn-text'),
    btnLoading: $('.btn-loading'),
    charCount: $('#charCount'),
    clearInput: $('#clearInput'),
    answerSection: $('#answerSection'),
    answerBody: $('#answerBody'),
    answerMeta: $('#answerMeta'),
    errorSection: $('#errorSection'),
    errorMessage: $('#errorMessage'),
    themeToggle: $('#themeToggle'),
    sunIcon: $('#sunIcon'),
    moonIcon: $('#moonIcon'),
    historyToggle: $('#historyToggle'),
    historySidebar: $('#historySidebar'),
    bookmarksSidebar: $('#bookmarksSidebar'),
    sidebarOverlay: $('#sidebarOverlay'),
    closeSidebar: $('#closeSidebar'),
    closeBookmarks: $('#closeBookmarks'),
    historyList: $('#historyList'),
    historyBadge: $('#historyBadge'),
    emptyHistory: $('#emptyHistory'),
    clearHistoryBtn: $('#clearHistoryBtn'),
    copyAllBtn: $('#copyAllBtn'),
    newQuestionBtn: $('#newQuestionBtn'),
    retryBtn: $('#retryBtn'),
    toastContainer: $('#toastContainer'),
    particleCanvas: $('#particleCanvas'),
    modelSelect: $('#modelSelect'),
    bookmarkBtn: $('#bookmarkBtn'),
    bookmarksList: $('#bookmarksList'),
    emptyBookmarks: $('#emptyBookmarks'),
    historySearch: $('#historySearch'),
    imageInput: $('#imageInput'),
    uploadBtn: $('#uploadBtn'),
    imagePreview: $('#imagePreview'),
    previewImg: $('#previewImg'),
    removeImage: $('#removeImage'),
    navHome: $('#navHome'),
    navHistory: $('#navHistory'),
    navBookmarks: $('#navBookmarks'),
    navSettings: $('#navSettings'),
    webSearchToggle: $('#webSearchToggle'),
};

// ===== Theme =====
function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    state.theme = t;
    localStorage.setItem('hw-theme', t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === 'dark' ? '#0f0f1a' : '#f0f0f8';
    dom.sunIcon.style.display = t === 'dark' ? 'block' : 'none';
    dom.moonIcon.style.display = t === 'light' ? 'block' : 'none';
}
dom.themeToggle.addEventListener('click', () => applyTheme(state.theme === 'dark' ? 'light' : 'dark'));
applyTheme(state.theme);

// ===== Subject =====
$$('.subject-chip').forEach(c => {
    c.addEventListener('click', () => {
        $$('.subject-chip').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
        state.selectedSubject = c.dataset.subject;
    });
});

// ===== Char count =====
dom.questionInput.addEventListener('input', () => {
    dom.charCount.textContent = `${dom.questionInput.value.length} ky tu`;
});
dom.clearInput.addEventListener('click', () => {
    dom.questionInput.value = '';
    dom.charCount.textContent = '0 ky tu';
    dom.questionInput.focus();
});

// ===== Toast =====
function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    dom.toastContainer.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

// ===== Image Upload =====
dom.uploadBtn.addEventListener('click', () => dom.imageInput.click());
dom.imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        dom.previewImg.src = ev.target.result;
        dom.imagePreview.style.display = 'block';
        dom.uploadBtn.style.display = 'none';
    };
    reader.readAsDataURL(file);
});
dom.removeImage.addEventListener('click', () => {
    dom.imageInput.value = '';
    dom.imagePreview.style.display = 'none';
    dom.uploadBtn.style.display = 'inline-flex';
});

// ===== Solve =====
async function solveQuestion() {
    const question = dom.questionInput.value.trim();
    // Get image data if uploaded
    const hasImage = dom.imagePreview.style.display !== 'none' && dom.previewImg.src;
    const imageData = hasImage ? dom.previewImg.src : null;

    if (!question && !imageData) {
        showToast('Vui long nhap cau hoi hoac tai anh bai tap!', 'warning');
        dom.questionInput.focus();
        return;
    }
    if (state.isLoading) return;

    state.lastQuestion = question || '[Anh bai tap]';
    setLoading(true);
    hideError();
    hideAnswer();

    try {
        const bodyData = {
            question: question || '',
            subject: state.selectedSubject,
            model: dom.modelSelect.value,
            web_search: dom.webSearchToggle.checked,
        };
        // Attach image if present
        if (imageData) {
            bodyData.image_data = imageData;
        }
        const resp = await fetch('/solve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyData),
        });
        const data = await resp.json();
        if (data.success) {
            state.lastRawAnswer = data.answer_text;
            renderAnswer(data);
            loadHistory();
        } else {
            showError(data.error || 'Loi khong xac dinh.');
        }
    } catch (err) {
        showError('Loi mang. Vui long kiem tra ket noi internet.');
    } finally {
        setLoading(false);
    }
}

dom.solveBtn.addEventListener('click', solveQuestion);
dom.questionInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); solveQuestion(); }
});
dom.retryBtn.addEventListener('click', () => { hideError(); solveQuestion(); });

function setLoading(l) {
    state.isLoading = l;
    dom.solveBtn.disabled = l;
    dom.btnText.style.display = l ? 'none' : 'flex';
    dom.btnLoading.style.display = l ? 'flex' : 'none';
}

// ===== Render Answer =====
function renderAnswer(data) {
    marked.setOptions({
        highlight: (code, lang) => {
            if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
            return hljs.highlightAuto(code).value;
        },
        breaks: true, gfm: true,
    });

    dom.answerBody.innerHTML = marked.parse(data.answer_text);

    // Code blocks: copy + lang tag
    dom.answerBody.querySelectorAll('pre').forEach(pre => {
        const codeEl = pre.querySelector('code');
        if (!codeEl) return;
        const classes = codeEl.className || '';
        const langMatch = classes.match(/language-(\w+)/);
        const lang = langMatch ? langMatch[1] : '';
        if (lang) {
            const tag = document.createElement('span');
            tag.className = 'code-lang-tag';
            tag.textContent = lang;
            pre.style.position = 'relative';
            pre.appendChild(tag);
        }
        const btn = document.createElement('button');
        btn.className = 'code-copy-btn';
        btn.textContent = 'Sao chep';
        btn.addEventListener('click', () => {
            navigator.clipboard.writeText(codeEl.textContent).then(() => {
                btn.textContent = 'Da sao chep!';
                setTimeout(() => btn.textContent = 'Sao chep', 2000);
            });
        });
        pre.style.position = 'relative';
        pre.appendChild(btn);
    });

    // KaTeX
    if (typeof renderMathInElement !== 'undefined') {
        renderMathInElement(dom.answerBody, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\(', right: '\\)', display: false },
                { left: '\\[', right: '\\]', display: true },
            ],
            throwOnError: false,
        });
    }

    const subjectNames = { general:'Tong hop', math:'Toan', programming:'Lap trinh', physics:'Vat ly',
        chemistry:'Hoa hoc', biology:'Sinh hoc', history:'Lich su', literature:'Van hoc',
        english:'Tieng Anh', geography:'Dia ly' };
    dom.answerMeta.textContent = `Mo hinh: ${data.model_used || 'AI'} | Mon: ${subjectNames[state.selectedSubject] || state.selectedSubject}`;

    dom.answerSection.style.display = 'block';
    dom.answerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Reset rating
    $$('.star-btn').forEach(s => s.classList.remove('active'));
}

function hideAnswer() { dom.answerSection.style.display = 'none'; }
function showError(msg) {
    dom.errorMessage.textContent = msg;
    dom.errorSection.style.display = 'block';
    dom.errorSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function hideError() { dom.errorSection.style.display = 'none'; }

// ===== Copy All =====
dom.copyAllBtn.addEventListener('click', () => {
    if (state.lastRawAnswer) {
        navigator.clipboard.writeText(state.lastRawAnswer).then(() => showToast('Da sao chep loi giai!', 'success'));
    }
});

// ===== New Question =====
dom.newQuestionBtn.addEventListener('click', () => {
    hideAnswer(); hideError();
    dom.questionInput.value = '';
    dom.charCount.textContent = '0 ky tu';
    dom.questionInput.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ===== Bookmarks =====
dom.bookmarkBtn.addEventListener('click', () => {
    if (!state.lastRawAnswer || !state.lastQuestion) return;
    const bm = {
        id: Date.now(),
        question: state.lastQuestion.slice(0, 200),
        answer: state.lastRawAnswer,
        subject: state.selectedSubject,
        timestamp: new Date().toLocaleString('vi-VN'),
    };
    state.bookmarks.unshift(bm);
    if (state.bookmarks.length > 30) state.bookmarks.pop();
    localStorage.setItem('hw-bookmarks', JSON.stringify(state.bookmarks));
    showToast('Da luu loi giai!', 'success');
});

function renderBookmarks() {
    dom.bookmarksList.querySelectorAll('.history-item').forEach(el => el.remove());
    if (state.bookmarks.length === 0) { dom.emptyBookmarks.style.display = 'flex'; return; }
    dom.emptyBookmarks.style.display = 'none';
    state.bookmarks.forEach((bm, idx) => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `<span class="h-subject">${esc(bm.subject)}</span><div class="h-question">${esc(bm.question)}</div><span class="h-time">${esc(bm.timestamp)}</span>`;
        div.addEventListener('click', () => {
            dom.questionInput.value = bm.question;
            state.lastRawAnswer = bm.answer;
            state.lastQuestion = bm.question;
            renderAnswer({ answer_text: bm.answer, model_used: 'Saved' });
            closeSidebars();
        });
        dom.bookmarksList.appendChild(div);
    });
}

// ===== Rating =====
$$('.star-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const r = parseInt(btn.dataset.rating);
        $$('.star-btn').forEach((s, i) => s.classList.toggle('active', i < r));
        showToast(`Cam on! Ban da danh gia ${r} sao.`, 'success');
    });
});

// ===== Sidebars =====
function closeSidebars() {
    dom.historySidebar.classList.remove('open');
    dom.bookmarksSidebar.classList.remove('open');
    dom.sidebarOverlay.classList.remove('active');
}
function openSidebar(which) {
    closeSidebars();
    if (which === 'history') {
        dom.historySidebar.classList.add('open');
        loadHistory();
    } else if (which === 'bookmarks') {
        dom.bookmarksSidebar.classList.add('open');
        renderBookmarks();
    }
    dom.sidebarOverlay.classList.add('active');
}

dom.historyToggle.addEventListener('click', () => openSidebar('history'));
dom.closeSidebar.addEventListener('click', closeSidebars);
dom.closeBookmarks.addEventListener('click', closeSidebars);
dom.sidebarOverlay.addEventListener('click', closeSidebars);

// ===== Bottom Nav =====
dom.navHome.addEventListener('click', () => {
    closeSidebars();
    $$('.nav-item').forEach(n => n.classList.remove('active'));
    dom.navHome.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
});
dom.navHistory.addEventListener('click', () => {
    $$('.nav-item').forEach(n => n.classList.remove('active'));
    dom.navHistory.classList.add('active');
    openSidebar('history');
});
dom.navBookmarks.addEventListener('click', () => {
    $$('.nav-item').forEach(n => n.classList.remove('active'));
    dom.navBookmarks.classList.add('active');
    openSidebar('bookmarks');
});
dom.navSettings.addEventListener('click', () => {
    $$('.nav-item').forEach(n => n.classList.remove('active'));
    dom.navSettings.classList.add('active');
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    showToast(state.theme === 'dark' ? 'Giao dien toi' : 'Giao dien sang', 'info');
    setTimeout(() => {
        dom.navSettings.classList.remove('active');
        dom.navHome.classList.add('active');
    }, 500);
});

// ===== History =====
async function loadHistory() {
    try {
        const resp = await fetch('/history');
        const data = await resp.json();
        const items = data.history || [];
        if (items.length > 0) {
            dom.historyBadge.style.display = 'flex';
            dom.historyBadge.textContent = items.length;
        } else {
            dom.historyBadge.style.display = 'none';
        }
        dom.historyList.querySelectorAll('.history-item').forEach(el => el.remove());
        if (items.length === 0) { dom.emptyHistory.style.display = 'flex'; return; }
        dom.emptyHistory.style.display = 'none';

        const search = (dom.historySearch.value || '').toLowerCase();
        items.filter(i => !search || i.question.toLowerCase().includes(search)).forEach(item => {
            const div = document.createElement('div');
            div.className = 'history-item';
            div.innerHTML = `<span class="h-subject">${esc(item.subject)}</span><div class="h-question">${esc(item.question)}</div><span class="h-time">${esc(item.timestamp)}</span>`;
            div.addEventListener('click', () => {
                dom.questionInput.value = item.question;
                dom.charCount.textContent = `${item.question.length} ky tu`;
                $$('.subject-chip').forEach(c => c.classList.toggle('active', c.dataset.subject === item.subject));
                state.selectedSubject = item.subject;
                closeSidebars();
                dom.questionInput.focus();
            });
            dom.historyList.appendChild(div);
        });
    } catch (e) { /* silent */ }
}

dom.historySearch.addEventListener('input', loadHistory);
dom.clearHistoryBtn.addEventListener('click', async () => {
    try { await fetch('/clear-history', { method: 'POST' }); loadHistory(); showToast('Da xoa lich su!', 'info'); } catch (e) {}
});
loadHistory();

// ===== Utility =====
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// ===== Particles =====
(function() {
    const canvas = dom.particleCanvas, ctx = canvas.getContext('2d');
    let particles = [];
    const COUNT = 40;
    function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    resize(); window.addEventListener('resize', resize);
    class P {
        constructor() { this.reset(); }
        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 2 + 0.5;
            this.sx = (Math.random() - 0.5) * 0.3;
            this.sy = (Math.random() - 0.5) * 0.3;
            this.o = Math.random() * 0.5 + 0.1;
        }
        update() {
            this.x += this.sx; this.y += this.sy;
            if (this.x < 0 || this.x > canvas.width) this.sx *= -1;
            if (this.y < 0 || this.y > canvas.height) this.sy *= -1;
        }
        draw() {
            ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(99,102,241,${this.o})`; ctx.fill();
        }
    }
    for (let i = 0; i < COUNT; i++) particles.push(new P());
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => { p.update(); p.draw(); });
        for (let i = 0; i < particles.length; i++)
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x, dy = particles[i].y - particles[j].y;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < 120) {
                    ctx.beginPath(); ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(99,102,241,${0.05 * (1 - d / 120)})`;
                    ctx.lineWidth = 0.5; ctx.stroke();
                }
            }
        requestAnimationFrame(animate);
    }
    animate();
})();
