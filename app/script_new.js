// v202604141200
// === 脚本加载测试 ===
console.log('========================================');
console.log('script_new.js 已加载！版本: v202604141200');
console.log('========================================');
// ====================

// 全局变量
let currentSection = 'home';
let isLoggedIn = false;
let currentUser = null;
let isNightMode = false;
let dictEventsBound = false;
let wordbookActiveTab = 'preview';

// 单词数据
let words = [];
let wordsByFrequency = { high: [], medium: [], low: [] };

// 加载TypeWords格式的词库数据
let dict = null;
let dictList = [];
let dictCache = {}; // 词库缓存，避免重复加载

const USERS_STORAGE_KEY = 'wordAppUsers';
const SESSION_STORAGE_KEY = 'wordAppSession';
const REVIEW_WORDS_KEY = 'reviewWordsByDict';
const FAMILIAR_WORDS_KEY = 'familiarWordsByDict';
const DIFFICULT_WORDS_KEY = 'difficultWordsByDict';
const EBBINGHAUS_SCHEDULE_KEY = 'ebbinghausScheduleByDict';
const REVIEW_RATIO_KEY = 'dailyReviewRatioPercent';
const LAST_SELECTED_DICT_KEY = 'lastSelectedDictId';

const EBBINGHAUS_INTERVALS_DAYS = [1, 2, 4, 7, 15, 30];

let reviewRatioPercent = 30;
let systemPracticeMeta = { reviewCount: 0, newWordSet: null, reviewSessionSet: null };

function sendDebugLog(location, message, data, hypothesisId, runId = 'initial') {
    const payload = { sessionId: '451e28', runId, hypothesisId, location, message, data, timestamp: Date.now() };
    const url = 'http://127.0.0.1:7524/ingest/1c493355-b830-4178-9a25-fea6ce829c86';
    const sameOriginUrl =
        typeof window !== 'undefined' && window.location && window.location.origin
            ? `${window.location.origin}/debug-client-log`
            : null;

    // Prefer sendBeacon to reduce CORS/preflight issues.
    try {
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            if (sameOriginUrl) navigator.sendBeacon(sameOriginUrl, blob);
            navigator.sendBeacon(url, blob);
            return;
        }
    } catch {
        // ignore
    }

    // Fallback: fetch with keepalive.
    try {
        if (sameOriginUrl) {
            fetch(sameOriginUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                keepalive: true
            }).catch(() => {});
        }
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '451e28' },
            body: JSON.stringify(payload),
            keepalive: true
        }).catch(() => {});
    } catch {
        // ignore
    }
}

function loadWordBookMap(storageKey) {
    try {
        return JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch {
        return {};
    }
}

function saveWordBookMap(storageKey, map) {
    localStorage.setItem(storageKey, JSON.stringify(map));
}

function getWordsForDictFromMap(storageKey, dictId) {
    const m = loadWordBookMap(storageKey);
    return Array.isArray(m[dictId]) ? m[dictId] : [];
}

function addWordToWordBook(storageKey, dictId, word) {
    if (!dictId || !word) return;
    const m = loadWordBookMap(storageKey);
    if (!m[dictId]) m[dictId] = [];
    if (!m[dictId].includes(word)) m[dictId].push(word);
    saveWordBookMap(storageKey, m);
}

function removeWordFromWordBook(storageKey, dictId, word) {
    const m = loadWordBookMap(storageKey);
    if (!m[dictId]) return;
    m[dictId] = m[dictId].filter(w => w !== word);
    saveWordBookMap(storageKey, m);
}

function loadReviewRatioSetting() {
    try {
        const v = parseInt(localStorage.getItem(REVIEW_RATIO_KEY) || '30', 10);
        if (!Number.isNaN(v) && v >= 0 && v <= 100) reviewRatioPercent = v;
    } catch {
        reviewRatioPercent = 30;
    }
}

function saveReviewRatioSetting() {
    localStorage.setItem(REVIEW_RATIO_KEY, String(reviewRatioPercent));
}

function getEbbinghausSchedule() {
    try {
        return JSON.parse(localStorage.getItem(EBBINGHAUS_SCHEDULE_KEY) || '{}');
    } catch {
        return {};
    }
}

function saveEbbinghausSchedule(s) {
    localStorage.setItem(EBBINGHAUS_SCHEDULE_KEY, JSON.stringify(s));
}

function scheduleWordForReview(dictId, word) {
    if (!dictId || !word) return;
    const all = getEbbinghausSchedule();
    if (!all[dictId]) all[dictId] = {};
    const prev = all[dictId][word] || { level: 0 };
    const idx = Math.min(prev.level, EBBINGHAUS_INTERVALS_DAYS.length - 1);
    const days = EBBINGHAUS_INTERVALS_DAYS[idx];
    const d = new Date();
    d.setDate(d.getDate() + days);
    const nextDue = d.toISOString().split('T')[0];
    all[dictId][word] = { level: prev.level + 1, nextDue };
    saveEbbinghausSchedule(all);
}

function getDueReviewWordObjects(dictId, maxCount) {
    if (!dict || !dict.words || !dictId || maxCount <= 0) return [];
    const all = getEbbinghausSchedule()[dictId] || {};
    const today = getTodayString();
    const learnedCursor = Math.max(
        0,
        Math.min(
            dict.words.length,
            (currentDict && currentDict.id === dictId ? currentDict.lastLearnIndex : dict.lastLearnIndex) || 0
        )
    );
    // 获取熟词列表，排除熟词
    const familiarWords = new Set(getWordsForDictFromMap(FAMILIAR_WORDS_KEY, dictId));
    const due = Object.entries(all)
        .filter(([, meta]) => meta && meta.nextDue && meta.nextDue <= today)
        .sort((a, b) => String(a[1].nextDue).localeCompare(String(b[1].nextDue)))
        .map(([w]) => w)
        .filter(w => !familiarWords.has(w)) // 排除熟词
        .slice(0, maxCount);
    return due
        .map(w => dict.words.find(x => x.word === w))
        .filter(Boolean)
        .filter(w => {
            const di = w._dictIndex != null ? w._dictIndex : dict.words.findIndex(x => x.word === w.word);
            return di >= 0 && di < learnedCursor;
        });
}

function inferSceneRank(word) {
    const chunks = [];
    (word.trans || []).forEach(t => chunks.push(t.cn || ''));
    (word.sentences || []).forEach(s => {
        chunks.push(s.cn || '', s.c || '');
    });
    (word.phrases || []).forEach(p => {
        chunks.push(p.pCn || '', p.pContent || '');
    });
    const parts = chunks.join(' ');
    const rules = [
        [/工作|职场|公司|同事|会议|工资|简历|客户|项目|商务|办公|升职|面试/g, 1],
        [/学术|论文|研究|实验|理论|大学|课程|教授|考研|科学|分析|数据/g, 2],
        [/旅行|机场|酒店|护照|签证|地图|风景|游客/g, 3],
        [/计算机|网络|软件|程序|数据|系统|技术|互联网|手机|电子/g, 4],
        [/医院|医生|药物|治疗|疾病|健康|症状|手术/g, 5],
        [/吃|喝|买|家|朋友|日常|生活|学校|时间|天气|颜色|数字/g, 0]
    ];
    let best = 6;
    for (const [re, rank] of rules) {
        re.lastIndex = 0;
        if (re.test(parts)) best = Math.min(best, rank);
    }
    return best;
}

function rootGroupKey(word) {
    const r = word.relWords && word.relWords.root ? String(word.relWords.root).trim() : '';
    if (r) return r.replace(/\s+/g, '').slice(0, 28);
    if (Array.isArray(word.etymology) && word.etymology.length) {
        const e = word.etymology
            .map(x => (typeof x === 'string' ? x : x && (x.w || x.word)))
            .filter(Boolean)
            .join(' ')
            .trim();
        if (e) return e.replace(/\s+/g, '').slice(0, 28);
    }
    const w = (word.word || '').toLowerCase();
    return w.length >= 4 ? w.slice(0, 4) : w;
}

function sceneRankLabel(rank) {
    const m = {
        0: '日常生活',
        1: '职场商务',
        2: '学业学术',
        3: '旅行出行',
        4: '科技数字',
        5: '医疗健康',
        6: '综合其它'
    };
    return m[rank] != null ? m[rank] : '综合其它';
}

function wordSceneRankForDisplay(w) {
    return w._sceneRank != null ? w._sceneRank : inferSceneRank(w);
}

function wordRootKeyForDisplay(w) {
    return w._rootKey != null ? w._rootKey : rootGroupKey(w);
}

function applyLayeredSort(converted) {
    if (!Array.isArray(converted)) {
        console.error('applyLayeredSort: converted 不是数组:', converted);
        return [];
    }
    const list = converted.map((w, i) => ({ w, i }));
    list.forEach(item => {
        item.w._sceneRank = inferSceneRank(item.w);
        item.w._rootKey = rootGroupKey(item.w);
    });
    // 第一层：词根；第二层：场景等级；第三层：词书顺序（wordRank）稳定排序
    list.sort((a, b) => {
        const rk = String(a.w._rootKey).localeCompare(String(b.w._rootKey), 'zh-Hans-CN');
        if (rk !== 0) return rk;
        if (a.w._sceneRank !== b.w._sceneRank) return a.w._sceneRank - b.w._sceneRank;
        const ra = a.w._wordRank != null ? Number(a.w._wordRank) : a.i + 1;
        const rb = b.w._wordRank != null ? Number(b.w._wordRank) : b.i + 1;
        if (ra !== rb) return ra - rb;
        return String(a.w.word || '').localeCompare(String(b.w.word || ''), 'en');
    });
    list.forEach((item, di) => {
        item.w._dictIndex = di;
    });
    return list.map(x => x.w);
}

/** 将复习词与新学词合并为词表中的书内顺序（保持场景→词根聚类顺序） */
function mergeSessionWordsByBookOrder(dictRef, dueList, freshList) {
    const rank = w => {
        if (!w || !dictRef || !dictRef.words) return 1e9;
        if (w._dictIndex != null && Number.isFinite(w._dictIndex)) return w._dictIndex;
        const ix = dictRef.words.findIndex(x => x.word === w.word);
        return ix >= 0 ? ix : 1e9;
    };
    const byWord = new Map();
    for (const w of [...(dueList || []), ...(freshList || [])]) {
        if (!w || !w.word) continue;
        const r = rank(w);
        const prev = byWord.get(w.word);
        if (!prev || r < prev.rank) byWord.set(w.word, { w, rank: r });
    }
    const rows = Array.from(byWord.values());
    rows.sort((a, b) => a.rank - b.rank || String(a.w.word).localeCompare(String(b.w.word), 'en'));
    return rows.map(x => x.w);
}

function topUpSystemSessionWords(dictRef, baseWords, targetCount, familiarSet) {
    const existing = Array.isArray(baseWords) ? baseWords.slice() : [];
    if (!dictRef || !Array.isArray(dictRef.words) || existing.length >= targetCount) return existing;
    const used = new Set(existing.map(w => w && w.word).filter(Boolean));
    const fam = familiarSet instanceof Set ? familiarSet : new Set();

    const appendFromPool = preferNonFamiliar => {
        for (const w of dictRef.words) {
            if (!w || !w.word || used.has(w.word)) continue;
            if (preferNonFamiliar && fam.has(w.word)) continue;
            existing.push(w);
            used.add(w.word);
            if (existing.length >= targetCount) break;
        }
    };

    appendFromPool(true);
    if (existing.length < targetCount) appendFromPool(false);
    return existing;
}

function pickNewWordsForSystemSession(startIdx, count, familiarSet) {
    const out = [];
    const n = dict.words.length;
    if (!n || count <= 0) return out;
    for (let step = 0; step < n && out.length < count; step++) {
        const i = (startIdx + step) % n;
        const w = dict.words[i];
        if (w && !familiarSet.has(w.word)) out.push(w);
    }
    return out;
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function getActiveUserId() {
    if (isLoggedIn && currentUser && currentUser.username) return currentUser.username;
    return 'guest';
}

function loadRegisteredUsers() {
    try {
        return JSON.parse(localStorage.getItem(USERS_STORAGE_KEY) || '{}');
    } catch {
        return {};
    }
}

function saveRegisteredUsers(users) {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

function restoreSession() {
    try {
        const raw = localStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw) return;
        const { username } = JSON.parse(raw);
        if (username && loadRegisteredUsers()[username]) {
            isLoggedIn = true;
            currentUser = { username };
        }
    } catch {
        localStorage.removeItem(SESSION_STORAGE_KEY);
    }
}

function updateAuthUI() {
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const userLabel = document.getElementById('userDisplayName');
    if (isLoggedIn && currentUser && currentUser.username) {
        if (loginBtn) loginBtn.style.display = 'none';
        if (registerBtn) registerBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'inline-block';
        if (userLabel) {
            userLabel.textContent = currentUser.username;
            userLabel.style.display = 'inline';
        }
    } else {
        if (loginBtn) loginBtn.style.display = 'inline-block';
        if (registerBtn) registerBtn.style.display = 'inline-block';
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (userLabel) {
            userLabel.textContent = '';
            userLabel.style.display = 'none';
        }
    }
}

function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const next = input.nextElementSibling;
    const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
    input.setAttribute('type', type);
    if (next && next.classList && next.classList.contains('password-toggle')) {
        next.setAttribute('aria-label', type === 'password' ? '显示密码' : '隐藏密码');
    }
}

function handleLoginSubmit(e) {
    e.preventDefault();
    const username = (document.getElementById('loginUsername').value || '').trim();
    const password = document.getElementById('loginPassword').value || '';
    if (!username || !password) {
        alert('请输入用户名和密码');
        return;
    }
    const users = loadRegisteredUsers();
    if (!users[username] || users[username].password !== password) {
        alert('用户名或密码错误');
        return;
    }
    isLoggedIn = true;
    currentUser = { username };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ username }));
    updateAuthUI();
    switchSection('home');
    alert('登录成功');
}

function handleRegisterSubmit(e) {
    e.preventDefault();
    const username = (document.getElementById('registerUsername').value || '').trim();
    const email = (document.getElementById('registerEmail').value || '').trim();
    const password = document.getElementById('registerPassword').value;
    const confirm = document.getElementById('registerConfirmPassword').value;
    if (!username) {
        alert('请输入用户名');
        return;
    }
    if (password.length < 6) {
        alert('密码至少 6 位');
        return;
    }
    if (password !== confirm) {
        alert('两次密码不一致');
        return;
    }
    const users = loadRegisteredUsers();
    if (users[username]) {
        alert('用户名已存在');
        return;
    }
    users[username] = { password, email, createdAt: new Date().toISOString() };
    saveRegisteredUsers(users);
    isLoggedIn = true;
    currentUser = { username };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ username }));
    updateAuthUI();
    switchSection('home');
    alert('注册成功');
}

function handleLogout() {
    isLoggedIn = false;
    currentUser = null;
    localStorage.removeItem(SESSION_STORAGE_KEY);
    updateAuthUI();
    switchSection('home');
}

function trySyncProgressToServer() {
    if (!dict || !dict.id) return;
    const userId = getActiveUserId();
    if (userId === 'guest') return;
    const progress = studyProgress[dict.id];
    if (!progress) return;
    fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, dictId: dict.id, progress })
    }).catch(() => {});
}

function setWordbookTab(tab) {
    wordbookActiveTab = tab;
    document.querySelectorAll('.wordbook-tab').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-wordbook-tab') === tab);
    });
    refreshWordbookUI();
    updateNavItemActiveState();
}

function renderWordbookWordRows(wordStrings, withRemove, removeKind) {
    if (!wordStrings.length) return '<p class="text-gray-500 py-4 text-center">暂无记录</p>';
    const esc = w => escapeHtml(w);
    if (!withRemove) {
        return (
            '<ul class="wordbook-preview">' +
            wordStrings.map(w => `<li>${esc(w)}</li>`).join('') +
            '</ul>'
        );
    }
    return (
        '<ul class="wordbook-preview">' +
        wordStrings
            .map(
                w =>
            `<li class="wordbook-li-row"><span>${esc(w)}</span><button type="button" class="btn btn-secondary btn-sm wordbook-li-remove" onclick="removeWordFromUserBook(${InlineJs.toLiteral(removeKind)},${InlineJs.toLiteral(w)})">移除</button></li>`
            )
            .join('') +
        '</ul>'
    );
}

function removeWordFromUserBook(kind, word) {
    if (!dict || !dict.id) return;
    const k = kind === 'familiar' ? FAMILIAR_WORDS_KEY : DIFFICULT_WORDS_KEY;
    removeWordFromWordBook(k, dict.id, word);
    refreshWordbookUI();
}

function addWordToFamiliarBook(word) {
    // #region agent log
    sendDebugLog('script_new.js:383', 'familiar add clicked', {
        hasDict: !!currentDict,
        dictId: currentDict && currentDict.id ? currentDict.id : null,
        word
    }, 'H3');
    // #endregion
    if (!currentDict || !currentDict.id) {
        alert('请先选择词库');
        return;
    }
    addWordToWordBook(FAMILIAR_WORDS_KEY, currentDict.id, word);
    removeWordFromWordBook(DIFFICULT_WORDS_KEY, currentDict.id, word);
    refreshWordbookUI();
    // #region agent log
    sendDebugLog('script_new.js:390', 'familiar add stored', {
        dictId: currentDict.id,
        word,
        familiarCount: getWordsForDictFromMap(FAMILIAR_WORDS_KEY, currentDict.id).length,
        difficultCount: getWordsForDictFromMap(DIFFICULT_WORDS_KEY, currentDict.id).length
    }, 'H4');
    // #endregion
    alert(`「${word}」已加入熟词本`);
}

function addWordToDifficultBook(word) {
    // #region agent log
    sendDebugLog('script_new.js:393', 'difficult add clicked', {
        hasDict: !!currentDict,
        dictId: currentDict && currentDict.id ? currentDict.id : null,
        word
    }, 'H3');
    // #endregion
    if (!currentDict || !currentDict.id) {
        alert('请先选择词库');
        return;
    }
    addWordToWordBook(DIFFICULT_WORDS_KEY, currentDict.id, word);
    removeWordFromWordBook(FAMILIAR_WORDS_KEY, currentDict.id, word);
    refreshWordbookUI();
    // #region agent log
    sendDebugLog('script_new.js:400', 'difficult add stored', {
        dictId: currentDict.id,
        word,
        difficultCount: getWordsForDictFromMap(DIFFICULT_WORDS_KEY, currentDict.id).length,
        familiarCount: getWordsForDictFromMap(FAMILIAR_WORDS_KEY, currentDict.id).length
    }, 'H4');
    // #endregion
    alert(`「${word}」已加入生词本`);
}

function refreshWordbookUI() {
    const wordListEl = document.getElementById('wordList');
    const errorListEl = document.getElementById('errorList');
    if (!wordListEl) return;
    document.querySelectorAll('.wordbook-tab').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-wordbook-tab') === wordbookActiveTab);
    });
    const paneTitle = document.getElementById('wordbookPaneTitle');
    if (paneTitle) {
        paneTitle.textContent =
            wordbookActiveTab === 'familiar'
                ? '熟词本'
                : wordbookActiveTab === 'difficult'
                  ? '生词本'
                  : '词库单词预览';
    }
    let byDict = {};
    try {
        byDict = JSON.parse(localStorage.getItem(REVIEW_WORDS_KEY) || '{}');
    } catch {
        byDict = {};
    }
    const key = dict && dict.id ? dict.id : null;
    const reviewWords = key ? byDict[key] || [] : [];
    // #region agent log
    sendDebugLog('script_new.js:425', 'wordbook ui refresh', {
        activeTab: wordbookActiveTab,
        dictId: key,
        hasWords: !!(dict && dict.words && dict.words.length),
        reviewCount: reviewWords.length,
        familiarCount: key ? getWordsForDictFromMap(FAMILIAR_WORDS_KEY, key).length : 0,
        difficultCount: key ? getWordsForDictFromMap(DIFFICULT_WORDS_KEY, key).length : 0
    }, 'H5');
    // #endregion
    if (!dict || !dict.words || dict.words.length === 0) {
        wordListEl.innerHTML =
            '<p class="text-gray-500 py-4 text-center">请先在「学习」或「词库管理」中选择词库</p>';
        if (errorListEl) {
            errorListEl.innerHTML =
                '<p class="text-gray-500 py-4 text-center">暂无错题，练习中可点「添加到复习」</p>';
        }
        return;
    }

    if (wordbookActiveTab === 'preview') {
        const preview = dict.words.slice(0, 300);
        wordListEl.innerHTML =
            '<ul class="wordbook-preview">' +
            preview
                .map(w => {
                    const cn =
                        w.trans && w.trans[0] && w.trans[0].cn ? w.trans[0].cn : '—';
                    return `<li><b>${escapeHtml(w.word)}</b> — ${escapeHtml(cn)}</li>`;
                })
                .join('') +
            (dict.words.length > 300
                ? `<li class="text-gray-500">…共 ${dict.words.length} 词，此处仅预览前 300 个（已按场景→词根→书序排序）</li>`
                : '') +
            '</ul>';
    } else if (wordbookActiveTab === 'familiar') {
        const ws = getWordsForDictFromMap(FAMILIAR_WORDS_KEY, key);
        wordListEl.innerHTML = renderWordbookWordRows(ws, true, 'familiar');
    } else if (wordbookActiveTab === 'difficult') {
        const ws = getWordsForDictFromMap(DIFFICULT_WORDS_KEY, key);
        wordListEl.innerHTML = renderWordbookWordRows(ws, true, 'difficult');
    } else {
        wordListEl.innerHTML = '<p class="text-gray-500 py-4 text-center">未知标签</p>';
    }

    if (errorListEl) {
        if (reviewWords.length === 0) {
            errorListEl.innerHTML =
                '<p class="text-gray-500 py-4 text-center">暂无复习词，练习中可点「添加到复习」</p>';
        } else {
            errorListEl.innerHTML =
                '<ul>' +
                reviewWords.map(w => `<li>${escapeHtml(w)}</li>`).join('') +
                '</ul>';
        }
    }
}

// 加载词库列表
async function loadDictList() {
    try {
        // 直接从本地文件加载词库列表
        try {
            const response = await fetch('data/word.json');
            if (response.ok) {
                const data = await response.json();
                dictList = data || [];
                console.log('本地词库列表加载成功');
                console.log(`可用词库数: ${dictList.length}个`);
            } else {
                throw new Error('Failed to load dict list from local file');
            }
        } catch (localError) {
            console.log('本地词库列表加载失败，使用备用词库数据');
            
            // 使用备用词库数据
            dictList = [
                {
                    id: '大学英语四级',
                    name: '大学英语四级',
                    description: '大学英语四级词汇完整版',
                    category: '中国考试',
                    tags: ['中国考试'],
                    language: 'en',
                    url: 'CET4_MERGED.json',
                    length: 7508
                },
                {
                    id: '大学英语六级',
                    name: '大学英语六级',
                    description: '大学英语六级词汇完整版',
                    category: '中国考试',
                    tags: ['中国考试'],
                    language: 'en',
                    url: 'CET6_MERGED.json',
                    length: 5651
                },
                {
                    id: '考研词汇',
                    name: '考研词汇',
                    description: '研究生入学考试词汇完整版',
                    category: '中国考试',
                    tags: ['中国考试'],
                    language: 'en',
                    url: 'KAOYAN_MERGED.json',
                    length: 9602
                }
            ];
            
            console.log('使用备用词库数据');
            console.log(`可用词库数: ${dictList.length}个`);
        }
        
        // 加载本地存储中导入的词库
        try {
            const importedDictsJson = localStorage.getItem('importedDicts');
            if (importedDictsJson) {
                const importedDicts = JSON.parse(importedDictsJson);
                if (Array.isArray(importedDicts) && importedDicts.length > 0) {
                    // 避免重复添加
                    const existingDictIds = new Set(dictList.map(dict => dict.id));
                    const newDicts = importedDicts.filter(dict => !existingDictIds.has(dict.id));
                    if (newDicts.length > 0) {
                        dictList = [...dictList, ...newDicts];
                        console.log(`从本地存储加载 ${newDicts.length} 个导入的词库`);
                        console.log(`当前词库总数: ${dictList.length} 个`);
                    }
                }
            }
        } catch (error) {
            console.error('加载导入词库失败:', error);
        }
        
        // 显示词库列表
        displayDictList();
        
        // 加载推荐词库列表
        loadRecommendDictList();
        
        // 加载我的词库列表
        loadMyDictList();
    } catch (error) {
        console.error('加载词库列表失败:', error);
        alert('加载词库列表失败，请刷新页面重试');
    }
}

// 显示词库列表
function displayDictList() {
    // 现在我们使用displayDictGroups来显示分组词库
    displayDictGroups();
}

// 按标签分组词库
function groupByDictTags(dictList) {
    return dictList.reduce((result, dict) => {
        // 如果没有tags字段，使用category作为标签
        const tags = dict.tags || [dict.category];
        tags.forEach(tag => {
            if (result[tag]) {
                result[tag].push(dict);
            } else {
                result[tag] = [dict];
            }
        });
        return result;
    }, {});
}

// 按类别和标签分组显示词库
function displayDictGroups() {
    const dictGroupsElement = document.getElementById('dictGroups');
    if (!dictGroupsElement) return;
    
    // 按类别分组
    const groupedByCategory = dictList.reduce((result, dict) => {
        const category = dict.category;
        if (!result[category]) {
            result[category] = [];
        }
        result[category].push(dict);
        return result;
    }, {});
    
    // 生成分组HTML
    dictGroupsElement.innerHTML = Object.entries(groupedByCategory).map(([category, items]) => {
        const tagGroups = groupByDictTags(items);
        return `
            <div class="dict-group">
                <h4>${category}</h4>
                ${Object.entries(tagGroups).map(([tag, tagItems]) => `
                    <div class="dict-tag-group">
                        <h5>${tag}</h5>
                        <div class="dict-list">
                            ${tagItems.map(item => `
                                <div class="dict-item" id="${item.id}">
                                    <h3>${item.name}</h3>
                                    <p>${item.description}</p>
                                    <div class="word-count">单词数量: ${item.length}</div>
                                    <button onclick="selectDict('${item.id}')" class="btn btn-primary">选择词库</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }).join('');
}

// 搜索词库
function searchDict() {
    const searchKey = document.getElementById('dictSearch').value.toLowerCase();
    const searchResults = document.getElementById('searchResults');
    const dictGroups = document.getElementById('dictGroups');
    
    if (searchKey) {
        // 过滤词库列表
        const searchList = dictList.filter(item => {
            return (
                item.id.toLowerCase().includes(searchKey) ||
                item.name.toLowerCase().includes(searchKey) ||
                item.category.toLowerCase().includes(searchKey) ||
                item.tags.join('').replace('所有', '').toLowerCase().includes(searchKey) ||
                (item.url && item.url.toLowerCase().includes(searchKey))
            );
        });
        
        // 显示搜索结果
        searchResults.style.display = 'block';
        dictGroups.style.display = 'none';
        
        if (searchList.length === 0) {
            searchResults.innerHTML = '<p class="text-center text-secondary">没有找到相关词库</p>';
            return;
        }
        
        searchResults.innerHTML = `
            <h4>搜索结果 (${searchList.length})</h4>
            <div class="dict-list">
                ${searchList.map(item => `
                    <div class="dict-item">
                        <h3>${item.name}</h3>
                        <p>${item.description}</p>
                        <p>单词数量: ${item.length}</p>
                        <button onclick="selectDict('${item.id}')" class="btn btn-primary">选择词库</button>
                    </div>
                `).join('')}
            </div>
        `;
    } else {
        // 显示分组词库
        searchResults.style.display = 'none';
        dictGroups.style.display = 'block';
        displayDictGroups();
    }
}

// 初始化搜索功能
function initSearch() {
    const searchInput = document.getElementById('dictSearch');
    const searchBtn = document.getElementById('searchBtn');
    
    if (searchInput && searchBtn) {
        searchBtn.addEventListener('click', searchDict);
        searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                searchDict();
            }
        });
    }
}

// 选择词库
async function selectDict(dictId, options = {}) {
    const autoSwitch = options.autoSwitch !== false;
    const silent = options.silent === true;
    const selectedDict = dictList.find(item => item.id === dictId);
    if (!selectedDict) {
        console.error('词库不存在:', dictId);
        alert('词库不存在，请选择有效的词库');
        return;
    }
    
    console.log(`开始加载词库: ${selectedDict.name} (${dictId})`);
    
    // 检查缓存
    if (dictCache[dictId]) {
        console.log('从缓存加载词库数据');
        processDictData(selectedDict, dictCache[dictId], { autoSwitch });
        return;
    }
    
    // 显示加载提示
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'loadingOverlay';
    loadingDiv.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.7); display: flex; justify-content: center;
        align-items: center; z-index: 9999; flex-direction: column; color: white;
    `;
    loadingDiv.innerHTML = `
        <div style="font-size: 24px; margin-bottom: 20px;">正在加载词库: ${selectedDict.name}</div>
        <div style="font-size: 16px;">词库大小: ${selectedDict.length} 词</div>
        <div style="margin-top: 20px; font-size: 14px; color: #aaa;">首次加载可能需要一些时间，请耐心等待...</div>
    `;
    if (!silent) {
        document.body.appendChild(loadingDiv);
    }
    
    try {
        // 检查词库是否包含单词数据
        if (selectedDict.words && Array.isArray(selectedDict.words) && selectedDict.words.length > 0) {
            console.log(`词库包含单词数据，直接使用，共 ${selectedDict.words.length} 个单词`);
            dictCache[dictId] = selectedDict.words;
            processDictData(selectedDict, selectedDict.words, { autoSwitch });
            return;
        }
        
        // 检查是否是导入的词库
        if (selectedDict.imported) {
            console.log('导入的词库，从本地存储加载单词数据');
            
            // 从本地存储加载导入的词库数据
            try {
                const importedDictsJson = localStorage.getItem('importedDicts');
                if (importedDictsJson) {
                    const importedDicts = JSON.parse(importedDictsJson);
                    const importedDict = importedDicts.find(dict => dict.id === dictId);
                    if (importedDict && importedDict.words && Array.isArray(importedDict.words) && importedDict.words.length > 0) {
                        console.log(`从本地存储加载成功，共 ${importedDict.words.length} 个单词`);
                        dictCache[dictId] = importedDict.words;
                        processDictData(selectedDict, importedDict.words, { autoSwitch });
                        return;
                    }
                }
            } catch (error) {
                console.error('从本地存储加载导入词库失败:', error);
            }
        }
        
        // 先使用预设单词列表，让用户可以立即开始学习
        const presetWords = getPresetWords(selectedDict);
        if (presetWords && presetWords.length > 0) {
            console.log(`使用预设单词列表，共 ${presetWords.length} 个单词`);
            const presetWordsData = buildPresetWordsData(presetWords);
            
            // 立即处理预设单词列表
            processDictData(selectedDict, presetWordsData, { autoSwitch });
            
            // 在后台异步加载完整的词库数据
            console.log('开始在后台加载完整词库数据...');
            loadFullDictData(selectedDict);
            return;
        }
        
        // 直接从本地文件加载词库数据（跳过API调用）
        try {
            // 从 json-full 文件夹加载
            const localDictDataUrl = `data/json-full/${selectedDict.url}`;
            console.log(`开始加载词库文件: ${localDictDataUrl}`);
            
            const response = await fetch(localDictDataUrl);
            
            if (response.ok) {
                try {
                    const wordsData = await response.json();
                    console.log(`词库加载成功！共 ${wordsData.length} 个单词`);
                    
                    // 检查单词数据格式
                    if (Array.isArray(wordsData) && wordsData.length > 0) {
                        // 缓存词库数据
                        dictCache[dictId] = wordsData;
                        processDictData(selectedDict, wordsData, { autoSwitch });
                        return;
                    } else {
                        console.error('词库数据格式不正确');
                    }
                } catch (jsonError) {
                    console.error('JSON解析错误:', jsonError);
                }
            } else {
                console.error(`词库文件加载失败: ${response.status} ${response.statusText}`);
            }
        } catch (fetchError) {
            console.error('加载词库文件时发生错误:', fetchError);
        }
        
        // 如果执行到这里，说明加载失败
        console.error('词库加载失败');
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) loadingOverlay.remove();
        alert('加载词库失败，请查看控制台错误信息');
    } catch (error) {
        console.error('加载词库数据失败:', error);
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) loadingOverlay.remove();
        alert('加载词库失败，请检查网络连接');
    }
}

// 后台加载完整词库数据
async function loadFullDictData(selectedDict) {
    try {
        const localDictDataUrl = `data/json-full/${selectedDict.url}`;
        console.log(`后台开始加载完整词库文件: ${localDictDataUrl}`);
        
        const response = await fetch(localDictDataUrl);
        if (response.ok) {
            const wordsData = await response.json();
            console.log(`完整词库加载成功！共 ${wordsData.length} 个单词`);
            
            // 更新词库数据
            if (Array.isArray(wordsData) && wordsData.length > 0) {
                // 缓存词库数据
                dictCache[selectedDict.id] = wordsData;
                processDictData(selectedDict, wordsData);
                console.log('完整词库数据已更新，现在使用完整词库进行学习');
            }
        } else {
            console.error(`完整词库文件加载失败: ${response.status} ${response.statusText}`);
        }
    } catch (error) {
        console.error('后台加载完整词库失败:', error);
    }
}

// 获取预设单词列表
function getPresetWords(selectedDict) {
    const wordList = DictPreset.getPresetWordsForDict(selectedDict);
    console.log(`为词库 ${(selectedDict && selectedDict.id) || ''} 匹配到 ${wordList.length} 个预设单词`);
    return wordList;
}

function buildPresetWordsData(words) {
    return DictPreset.buildPresetWordsData(words);
}

// 从Free Dictionary API获取单词数据
async function fetchWordsFromApi(wordList) {
    const wordsData = [];
    
    // 限制并发请求数量
    const maxConcurrent = 5;
    let currentIndex = 0;
    
    while (currentIndex < wordList.length) {
        const batch = wordList.slice(currentIndex, currentIndex + maxConcurrent);
        const batchPromises = batch.map(async (word) => {
            try {
                const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
                if (!response.ok) return null;
                
                const data = await response.json();
                if (!data || !data[0]) return null;
                
                const wordData = data[0];
                
                // 构建符合TypeWords格式的单词数据
                return {
                    word: wordData.word,
                    phonetic0: wordData.phonetic || '',
                    phonetic1: wordData.phonetic || '',
                    trans: wordData.meanings.map(meaning => ({
                        pos: meaning.partOfSpeech || 'n.',
                        cn: meaning.definitions[0]?.definition || ''
                    })),
                    sentences: [],
                    phrases: [],
                    synos: [],
                    relWords: { root: word.substring(0, 3), rels: [] },
                    etymology: []
                };
            } catch (error) {
                console.error(`获取单词 ${word} 失败:`, error);
                return null;
            }
        });
        
        const batchResults = await Promise.all(batchPromises);
        const validResults = batchResults.filter(result => result !== null);
        wordsData.push(...validResults);
        
        currentIndex += maxConcurrent;
        
        // 避免请求过快
        if (currentIndex < wordList.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    return wordsData;
}

// 处理词库数据
function processDictData(selectedDict, wordsData, options = {}) {
    const autoSwitch = options.autoSwitch !== false;
    const saved = studyProgress[selectedDict.id];

    // 转换新的词库数据格式为旧的格式
    const convertedWordsData = wordsData.map((wordItem, idx) => {
        // 检查是否是新的格式
        if (wordItem.content && wordItem.content.word && wordItem.content.word.content) {
            const wordContent = wordItem.content.word.content;
            const rank =
                wordItem.wordRank != null ? Number(wordItem.wordRank) : idx + 1;
            return {
                word: wordItem.headWord,
                phonetic0: wordContent.usphone || wordContent.phone || '',
                phonetic1: wordContent.ukphone || wordContent.phone || '',
                trans: wordContent.trans ? wordContent.trans.map(t => ({
                    pos: t.pos || '',
                    cn: t.tranCn || ''
                })) : [],
                sentences: wordContent.sentence && wordContent.sentence.sentences ? wordContent.sentence.sentences.map(s => ({
                    c: s.sContent || '',
                    cn: s.sCn || ''
                })) : [],
                phrases: wordContent.phrase && wordContent.phrase.phrases ? wordContent.phrase.phrases.map(p => ({
                    pContent: p.pContent || '',
                    pCn: p.pCn || ''
                })) : [],
                synos: wordContent.syno && wordContent.syno.synos ? wordContent.syno.synos.map(s => ({
                    pos: s.pos || '',
                    tran: s.tran || '',
                    hwds: s.hwds || []
                })) : [],
                relWords: {
                    root: wordContent.remMethod ? wordContent.remMethod.val : '',
                    rels: wordContent.relWord && wordContent.relWord.rels ? wordContent.relWord.rels.map(r => ({
                        pos: r.pos || '',
                        words: r.words || []
                    })) : []
                },
                etymology: [],
                _wordRank: rank
            };
        }
        const w = { ...wordItem };
        if (w._wordRank == null) w._wordRank = idx + 1;
        return w;
    });

    // 优化排序过程
    const sortedWords = applyLayeredSort(convertedWordsData);

    let dictCursor = 0;
    if (saved && sortedWords.length > 0) {
        if (typeof saved.dictWordCursor === 'number') {
            dictCursor = Math.max(0, Math.min(saved.dictWordCursor, sortedWords.length - 1));
        } else if (typeof saved.lastIndex === 'number') {
            dictCursor = Math.max(0, Math.min(saved.lastIndex, sortedWords.length - 1));
        }
    }

    // 构建词典数据结构
    dict = {
        ...selectedDict,
        words: sortedWords,
        lastLearnIndex: dictCursor,
        perDayStudyNumber: dailyGoal || 20,
        statistics: [],
        custom: false,
        complete: false
    };
    
    // 提取单词数据
    words = dict.words;
    
    // 按「场景→词根→书序」排序后的顺序划分频率档（与词表顺序一致）
    const totalWords = words.length;
    const highCount = Math.floor(totalWords * 0.34);
    const mediumCount = Math.floor(totalWords * 0.33);
    
    wordsByFrequency = {
        high: words.slice(0, highCount),
        medium: words.slice(highCount, highCount + mediumCount),
        low: words.slice(highCount + mediumCount)
    };
    
    // 更新currentDict变量
    currentDict = dict;
    try {
        localStorage.setItem(LAST_SELECTED_DICT_KEY, selectedDict.id);
    } catch {}
    
    // 移除加载提示
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.remove();
    }
    
    // 显示词库单词列表
    displayDictWordsList();
    
    if (autoSwitch) {
        // 跳转到学习页面
        switchSection('learning');
        
        // 初始化学习模块，更新词库信息
        initStudyModule();
    } else {
        updateDictInfo();
        updateTaskInfo();
        displayDailyTask();
    }
}

// 显示词库单词列表（优化版 - 分页加载）
let currentWordPage = 0;
const WORDS_PER_PAGE = 100; // 每页显示100个单词

function displayDictWordsList(page = 0) {
    const dictWordsList = document.getElementById('dictWordsList');
    if (!dictWordsList) return;
    
    // 检查是否有词库数据
    if (!dict || !dict.words || dict.words.length === 0) {
        dictWordsList.innerHTML = '<p class="text-center text-gray-500 py-6">词库中没有单词</p>';
        return;
    }
    
    // 获取当天的任务单词
    const { words: dailyTaskWords } = resolvePracticeWords(WordPracticeMode.System);
    const totalWords = dailyTaskWords.length;
    const totalPages = Math.ceil(totalWords / WORDS_PER_PAGE);
    currentWordPage = page;
    
    // 计算当前页的单词范围
    const startIdx = page * WORDS_PER_PAGE;
    const endIdx = Math.min(startIdx + WORDS_PER_PAGE, totalWords);
    const currentPageWords = dailyTaskWords.slice(startIdx, endIdx);
    const prevInBook = startIdx > 0 ? dailyTaskWords[startIdx - 1] : null;

    console.log(`显示今日任务单词: ${startIdx + 1} - ${endIdx} / ${totalWords}`);

    const wordsHTML = currentPageWords
        .map((word, index) => {
            const phonetic = word.phonetic0 || word.phonetic1 || '';
            const definition =
                word.trans && word.trans.length > 0
                    ? word.trans.map(t => `${t.pos} ${t.cn}`).join('; ')
                    : '暂无释义';

            const globalIndex = startIdx + index;
            const sr = wordSceneRankForDisplay(word);
            const rk = wordRootKeyForDisplay(word);
            const isNewGroup =
                index === 0
                    ? !prevInBook ||
                      wordSceneRankForDisplay(prevInBook) !== sr ||
                      wordRootKeyForDisplay(prevInBook) !== rk
                    : wordSceneRankForDisplay(currentPageWords[index - 1]) !== sr ||
                      wordRootKeyForDisplay(currentPageWords[index - 1]) !== rk;
            const groupRow = isNewGroup
                ? `<li class="dict-word-group"><div class="dict-word-group-inner"><span class="dict-word-group-scene">${sceneRankLabel(sr)}</span><span class="dict-word-group-sep" aria-hidden="true">·</span><span class="dict-word-group-root">词根分组 ${escapeHtml(String(rk).slice(0, 40))}</span></div></li>`
                : '';

            return `${groupRow}
            <li>
                <div class="word-info">
                    <h4>${globalIndex + 1}. ${escapeHtml(word.word)} ${phonetic ? `[${escapeHtml(phonetic)}]` : ''}</h4>
                    <p>${escapeHtml(definition)}</p>
                </div>
                <div class="word-actions">
                    <button type="button" onclick="learnWord('${escapeHtml(word.word)}')">学习</button>
                    <button type="button" onclick="addWordToReview('${escapeHtml(word.word)}')">添加到复习</button>
                </div>
            </li>`;
        })
        .join('');
    
    // 生成分页控件
    const paginationHTML = `
        <div class="pagination" style="display: flex; justify-content: center; align-items: center; gap: 10px; margin-top: 20px; padding: 10px;">
            <button class="btn btn-secondary" onclick="displayDictWordsList(0)" ${page === 0 ? 'disabled' : ''}>首页</button>
            <button class="btn btn-secondary" onclick="displayDictWordsList(${page - 1})" ${page === 0 ? 'disabled' : ''}>上一页</button>
            <span style="padding: 0 20px;">第 ${page + 1} / ${totalPages} 页 (共 ${totalWords} 词)</span>
            <button class="btn btn-secondary" onclick="displayDictWordsList(${page + 1})" ${page >= totalPages - 1 ? 'disabled' : ''}>下一页</button>
            <button class="btn btn-secondary" onclick="displayDictWordsList(${totalPages - 1})" ${page >= totalPages - 1 ? 'disabled' : ''}>末页</button>
        </div>
    `;
    
    // 将HTML添加到容器中
    dictWordsList.innerHTML = `<ul>${wordsHTML}</ul>${paginationHTML}`;
    
    // 滚动到顶部
    dictWordsList.scrollTop = 0;
}

// 显示熟词本
function showFamiliarWords() {
    if (!currentDict || !currentDict.id) {
        alert('请先选择词库');
        return;
    }
    
    const familiarWords = getWordsForDictFromMap(FAMILIAR_WORDS_KEY, currentDict.id);
    
    // 过滤出熟词本中的单词，并去重
    const seenWords = new Set();
    const familiarWordDetails = dict.words.filter(word => {
        if (familiarWords.includes(word.word) && !seenWords.has(word.word)) {
            seenWords.add(word.word);
            return true;
        }
        return false;
    });
    
    // 切换到熟词本界面
    switchSection('familiarWords');
    // 显示熟词本单词
    displayFamiliarWords(familiarWordDetails);
}

// 显示生词本
function showDifficultWords() {
    if (!currentDict || !currentDict.id) {
        alert('请先选择词库');
        return;
    }
    
    const difficultWords = getWordsForDictFromMap(DIFFICULT_WORDS_KEY, currentDict.id);
    
    // 过滤出生词本中的单词，并去重
    const seenWords = new Set();
    const difficultWordDetails = dict.words.filter(word => {
        if (difficultWords.includes(word.word) && !seenWords.has(word.word)) {
            seenWords.add(word.word);
            return true;
        }
        return false;
    });
    
    // 切换到生词本界面
    switchSection('difficultWords');
    // 显示生词本单词
    displayDifficultWords(difficultWordDetails);
}

// 显示熟词本单词
function displayFamiliarWords(words) {
    const familiarWordsList = document.getElementById('familiarWordsList');
    if (!familiarWordsList) return;
    
    if (words.length === 0) {
        familiarWordsList.innerHTML = `<p class="text-center text-gray-500 py-6">熟词本为空</p>`;
        return;
    }
    
    // 生成单词列表的HTML
    const wordsHTML = words.map((word, index) => {
        // 获取单词的发音和释义
        const phonetic = word.phonetic0 || word.phonetic1 || '';
        const definition = word.trans && word.trans.length > 0 
            ? word.trans.map(t => `${t.pos} ${t.cn}`).join('; ') 
            : '暂无释义';
        
        return `
            <li>
                <div class="word-info">
                    <h4>${index + 1}. ${escapeHtml(word.word)} ${phonetic ? `[${escapeHtml(phonetic)}]` : ''}</h4>
                    <p>${escapeHtml(definition)}</p>
                </div>
                <div class="word-actions">
                    <button type="button" onclick="playPronunciation('${escapeHtml(word.word)}')">🔊 发音</button>
                    <button type="button" onclick="learnWord('${escapeHtml(word.word)}')">学习</button>
                    <button type="button" onclick="removeWordFromWordBook('${FAMILIAR_WORDS_KEY}', '${currentDict.id}', '${escapeHtml(word.word)}'); showFamiliarWords();">移除</button>
                </div>
            </li>
        `;
    }).join('');
    
    // 更新熟词本单词列表
    familiarWordsList.innerHTML = `
        <h3 style="margin-bottom: 20px; text-align: center;">熟词本 (共 ${words.length} 个单词)</h3>
        <ul>${wordsHTML}</ul>
    `;
    
    // 滚动到顶部
    familiarWordsList.scrollTop = 0;
}

// 显示生词本单词
function displayDifficultWords(words) {
    const difficultWordsList = document.getElementById('difficultWordsList');
    if (!difficultWordsList) return;
    
    if (words.length === 0) {
        difficultWordsList.innerHTML = `<p class="text-center text-gray-500 py-6">生词本为空</p>`;
        return;
    }
    
    // 生成单词列表的HTML
    const wordsHTML = words.map((word, index) => {
        // 获取单词的发音和释义
        const phonetic = word.phonetic0 || word.phonetic1 || '';
        const definition = word.trans && word.trans.length > 0 
            ? word.trans.map(t => `${t.pos} ${t.cn}`).join('; ') 
            : '暂无释义';
        
        return `
            <li>
                <div class="word-info">
                    <h4>${index + 1}. ${escapeHtml(word.word)} ${phonetic ? `[${escapeHtml(phonetic)}]` : ''}</h4>
                    <p>${escapeHtml(definition)}</p>
                </div>
                <div class="word-actions">
                    <button type="button" onclick="playPronunciation('${escapeHtml(word.word)}')">🔊 发音</button>
                    <button type="button" onclick="learnWord('${escapeHtml(word.word)}')">学习</button>
                    <button type="button" onclick="removeWordFromWordBook('${DIFFICULT_WORDS_KEY}', '${currentDict.id}', '${escapeHtml(word.word)}'); showDifficultWords();">移除</button>
                </div>
            </li>
        `;
    }).join('');
    
    // 更新生词本单词列表
    difficultWordsList.innerHTML = `
        <h3 style="margin-bottom: 20px; text-align: center;">生词本 (共 ${words.length} 个单词)</h3>
        <ul>${wordsHTML}</ul>
    `;
    
    // 滚动到顶部
    difficultWordsList.scrollTop = 0;
}

// 学习单个单词
function learnWord(word) {
    if (!dict || !dict.words || dict.words.length === 0) {
        alert('请先选择词库');
        return;
    }
    const idx = dict.words.findIndex(w => w.word === word);
    if (idx < 0) {
        alert('未找到该单词');
        return;
    }
    currentPracticeMode = WordPracticeMode.Free;
    practiceWords = dict.words.slice();
    currentWordIndex = idx;
    studyStartTime = Date.now();
    switchSection('practice');
    const titleEl = document.getElementById('practiceTitle');
    if (titleEl) titleEl.textContent = '单词学习';
    showCurrentWord();
}

// 添加单词到复习
function addWordToReview(word) {
    if (!dict || !dict.id) {
        alert('请先选择词库');
        return;
    }
    let byDict = {};
    try {
        byDict = JSON.parse(localStorage.getItem(REVIEW_WORDS_KEY) || '{}');
    } catch {
        byDict = {};
    }
    const key = dict.id;
    if (!byDict[key]) byDict[key] = [];
    if (!byDict[key].includes(word)) byDict[key].push(word);
    localStorage.setItem(REVIEW_WORDS_KEY, JSON.stringify(byDict));
    alert(`「${word}」已加入复习列表`);
}

// 启动时不加载整本词书（避免错误路径与超大 JSON）；请从「词库管理」选择
async function loadDefaultDict() {
    const savedId = localStorage.getItem(LAST_SELECTED_DICT_KEY);
    if (savedId && dictList.some(item => item.id === savedId)) {
        try {
            await selectDict(savedId, { autoSwitch: false, silent: true });
            console.log(`已恢复上次词库: ${savedId}`);
            return;
        } catch (error) {
            console.warn('恢复上次词库失败，回退为未选择状态:', error);
        }
    }
    dict = null;
    currentDict = null;
    words = [];
    wordsByFrequency = { high: [], medium: [], low: [] };
    console.log('请从词库管理选择词库后开始学习');
}

// 初始化函数
async function init() {
    restoreSession();
    loadStudyProgress();
    loadDailyGoal();
    loadReviewRatioSetting();
    loadStudyRecords();
    displayStudyStatistics();

    // 先绑定事件，避免词库列表网络请求卡住时整页按钮无法点击
    bindEvents();
    updateAuthUI();
    showSection('home');
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }

    await loadDictList();
    await loadDefaultDict();
}

// 绑定事件
function bindEvents() {
    // 导航链接点击事件
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function() {
            const section = this.getAttribute('data-section');
            const wt = this.getAttribute('data-wordbook-tab');
            if (section === 'wordbook' && wt) {
                wordbookActiveTab = wt;
            } else if (section === 'wordbook' && !wt) {
                wordbookActiveTab = 'preview';
            }
            switchSection(section);
        });
    });
    
    // 功能卡片点击事件
    document.querySelectorAll('.feature-card').forEach(card => {
        card.addEventListener('click', function() {
            // 功能卡片通过onclick属性调用switchSection
        });
    });
    
    // 快速操作按钮点击事件
    const continueLearningBtn = document.getElementById('continueLearningBtn');
    if (continueLearningBtn) {
        continueLearningBtn.addEventListener('click', function() {
            switchSection('learning');
        });
    }
    
    const todayChallengeBtn = document.getElementById('todayChallengeBtn');
    if (todayChallengeBtn) {
        todayChallengeBtn.addEventListener('click', function() {
            switchSection('entertainment');
        });
    }
    
    // 开始学习按钮点击事件
    const startLearningBtn = document.getElementById('startLearningBtn');
    if (startLearningBtn) {
        startLearningBtn.addEventListener('click', function() {
            if (!dict || !dict.words || dict.words.length === 0) {
                // 如果没有选择词库，先切换到学习页面
                switchSection('learning');
            } else {
                // 如果已经选择词库，直接开始智能学习
                startSystemPractice();
            }
        });
    }
    
    // 学习页面按钮点击事件
    const selectDictBtn = document.querySelector('button[onclick="showDictList()"]');
    if (selectDictBtn) {
        selectDictBtn.addEventListener('click', showDictList);
    }
    
    const changeProgressBtn = document.querySelector('button[onclick="changeProgress()"]');
    if (changeProgressBtn) {
        changeProgressBtn.addEventListener('click', changeProgress);
    }
    
    const changeDailyGoalBtn = document.querySelector('button[onclick="changeDailyGoal()"]');
    if (changeDailyGoalBtn) {
        changeDailyGoalBtn.addEventListener('click', changeDailyGoal);
    }
    
    const startFreePracticeBtn = document.querySelector('button[onclick="startFreePractice()"]');
    if (startFreePracticeBtn) {
        startFreePracticeBtn.addEventListener('click', startFreePractice);
    }
    
    // 学习模式菜单项点击事件
    const practiceModeMenu = document.getElementById('practiceModeMenu');
    if (practiceModeMenu) {
        const menuItems = practiceModeMenu.querySelectorAll('.menu-item');
        menuItems.forEach(item => {
            item.addEventListener('click', function (ev) {
                ev.stopPropagation();
                const onclick = this.getAttribute('onclick');
                if (onclick) {
                    eval(onclick);
                }
                practiceModeMenu.classList.add('hidden');
            });
        });
    }
    
    // 词库管理按钮点击事件
    const manageDictBtn = document.getElementById('manageDictBtn');
    if (manageDictBtn) {
        manageDictBtn.addEventListener('click', toggleManageDict);
    }
    
    const deleteDictBtn = document.getElementById('deleteDictBtn');
    if (deleteDictBtn) {
        deleteDictBtn.addEventListener('click', handleBatchDel);
    }
    
    const createPersonalDictBtn = document.querySelector('.color-link[onclick="createPersonalDict()"]');
    if (createPersonalDictBtn) {
        createPersonalDictBtn.addEventListener('click', createPersonalDict);
    }
    
    // 推荐词库更多按钮点击事件
    const moreDictBtn = document.querySelector('.color-link[onclick="showDictList()"]');
    if (moreDictBtn) {
        moreDictBtn.addEventListener('click', showDictList);
    }
    
    // 批量导入词库按钮点击事件
    const importDictBtn = document.getElementById('importDictBtn');
    if (importDictBtn) {
        importDictBtn.addEventListener('click', function() {
            document.getElementById('importDictDialog').style.display = 'flex';
        });
    }
    
    // 批量导入词库对话框按钮点击事件
    const importDictCancel = document.getElementById('importDictCancel');
    if (importDictCancel) {
        importDictCancel.addEventListener('click', function() {
            document.getElementById('importDictDialog').style.display = 'none';
        });
    }
    
    const importDictConfirm = document.getElementById('importDictConfirm');
    if (importDictConfirm) {
        importDictConfirm.addEventListener('click', importDictFromFile);
    }

    const loginNavBtn = document.getElementById('loginBtn');
    if (loginNavBtn) {
        loginNavBtn.addEventListener('click', () => switchSection('login'));
    }
    const registerNavBtn = document.getElementById('registerBtn');
    if (registerNavBtn) {
        registerNavBtn.addEventListener('click', () => switchSection('register'));
    }
    const logoutNavBtn = document.getElementById('logoutBtn');
    if (logoutNavBtn) {
        logoutNavBtn.addEventListener('click', handleLogout);
    }
    const showRegisterLink = document.getElementById('showRegister');
    if (showRegisterLink) {
        showRegisterLink.addEventListener('click', e => {
            e.preventDefault();
            switchSection('register');
        });
    }
    const showLoginLink = document.getElementById('showLogin');
    if (showLoginLink) {
        showLoginLink.addEventListener('click', e => {
            e.preventDefault();
            switchSection('login');
        });
    }
    const loginFormEl = document.getElementById('loginForm');
    if (loginFormEl) {
        loginFormEl.addEventListener('submit', handleLoginSubmit);
    }
    const registerFormEl = document.getElementById('registerForm');
    if (registerFormEl) {
        registerFormEl.addEventListener('submit', handleRegisterSubmit);
    }

    const practicePrimaryStart = document.getElementById('practicePrimaryStart');
    if (practicePrimaryStart) {
        practicePrimaryStart.addEventListener('click', e => {
            e.stopPropagation();
            const menu = document.getElementById('practiceModeMenu');
            if (menu) menu.classList.add('hidden');
            if (!dict || !dict.words || dict.words.length === 0) {
                alert('请先在上方点击「选择词库」加载一本词书');
                showDictList();
                return;
            }
            startSystemPractice();
        });
    }

    const practiceModeTrigger = document.getElementById('practiceModeTrigger');
    if (practiceModeTrigger) {
        practiceModeTrigger.addEventListener('click', e => {
            e.stopPropagation();
            togglePracticeModeMenu();
        });
    }

    bindMyStudyPeriodTabs();
}

// 从文件导入词库
function importDictFromFile() {
    const fileInput = document.getElementById('dictFileInput');
    if (!fileInput.files || fileInput.files.length === 0) {
        alert('请选择要导入的词库文件');
        return;
    }
    
    const file = fileInput.files[0];
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            
            let validDicts = [];
            
            // 检查数据格式
            if (Array.isArray(importedData)) {
                // 检查是否是词库列表
                if (importedData.length > 0 && importedData[0].id && importedData[0].name) {
                    // 词库列表格式
                    validDicts = importedData.filter(dict => {
                        if (dict.id && dict.name && dict.language) {
                            // 为没有url的词库添加默认url
                            if (!dict.url) {
                                dict.url = `${dict.id}.json`;
                            }
                            // 标记为导入的词库
                            dict.imported = true;
                            return true;
                        } else {
                            console.warn('无效的词库数据:', dict);
                            return false;
                        }
                    });
                } else {
                    // 单词列表格式，创建一个词库
                    const wordsData = importedData;
                    if (wordsData.length > 0 && wordsData[0].word) {
                        const localDict = {
                            id: 'imported_' + Date.now(),
                            name: '导入词库',
                            description: '从本地文件导入的词库',
                            length: wordsData.length,
                            category: '本地词库',
                            tags: ['所有', '英语'],
                            language: 'en',
                            url: 'local_file',
                            words: wordsData,
                            imported: true
                        };
                        validDicts.push(localDict);
                    } else {
                        throw new Error('词库文件格式错误，应该是词库列表或单词列表');
                    }
                }
            } else if (importedData.id && importedData.name) {
                // 单个词库格式
                const dict = importedData;
                // 为没有url的词库添加默认url
                if (!dict.url) {
                    dict.url = `${dict.id}.json`;
                }
                // 标记为导入的词库
                dict.imported = true;
                validDicts.push(dict);
            } else {
                throw new Error('词库文件格式错误');
            }
            
            if (validDicts.length === 0) {
                throw new Error('没有有效的词库数据');
            }
            
            // 将导入的词库添加到现有词库列表中
            // 避免重复添加
            const existingDictIds = new Set(dictList.map(dict => dict.id));
            const newDicts = validDicts.filter(dict => !existingDictIds.has(dict.id));
            
            dictList = [...dictList, ...newDicts];
            
            console.log(`成功导入 ${newDicts.length} 个词库`);
            console.log(`当前词库总数: ${dictList.length} 个`);
            
            // 保存到本地存储
            localStorage.setItem('importedDicts', JSON.stringify(newDicts));
            
            // 重新显示词库列表
            displayDictList();
            
            // 关闭导入对话框
            document.getElementById('importDictDialog').style.display = 'none';
            
            // 显示成功消息
            alert(`成功导入 ${newDicts.length} 个词库`);
        } catch (error) {
            console.error('导入词库失败:', error);
            alert('导入词库失败: ' + error.message);
        }
    };
    
    reader.onerror = function() {
        alert('读取文件失败');
    };
    
    reader.readAsText(file);
}

function updateNavItemActiveState() {
    document.querySelectorAll('.nav-item').forEach(item => {
        const sec = item.getAttribute('data-section');
        const wt = item.getAttribute('data-wordbook-tab');
        let active = sec === currentSection;
        if (active && sec === 'wordbook') {
            if (wt) active = wt === wordbookActiveTab;
            else active = wordbookActiveTab === 'preview';
        }
        item.classList.toggle('active', active);
    });
}

// 切换区域
function switchSection(section) {
    // 隐藏所有区域
    document.querySelectorAll('.section').forEach(sec => {
        sec.classList.remove('active');
        sec.style.display = 'none';
    });
    
    // 显示指定区域
    const targetSection = document.getElementById(section);
    if (targetSection) {
        targetSection.classList.add('active');
        targetSection.style.display = 'block';
    }
    
    // 更新当前区域
    currentSection = section;
    
    // 更新导航链接状态
    updateNavItemActiveState();
    
    // 如果是学习区域，初始化学习模块
    if (section === 'learning') {
        initStudyModule();
    }
    
    // 如果是词库管理区域，绑定词库管理相关事件
    if (section === 'dict') {
        bindDictEvents();
    }

    if (section === 'wordbook') {
        refreshWordbookUI();
    }

    if (section === 'my') {
        displayStudyStatistics();
    }
}

// 绑定词库管理相关事件
function bindDictEvents() {
    if (dictEventsBound) return;
    dictEventsBound = true;
    // 批量导入词库按钮点击事件
    const importDictBtn = document.getElementById('importDictBtn');
    if (importDictBtn) {
        importDictBtn.addEventListener('click', function() {
            document.getElementById('importDictDialog').style.display = 'flex';
        });
    }
    
    // 批量导入词库对话框按钮点击事件
    const importDictCancel = document.getElementById('importDictCancel');
    if (importDictCancel) {
        importDictCancel.addEventListener('click', function() {
            document.getElementById('importDictDialog').style.display = 'none';
        });
    }
    
    const importDictConfirm = document.getElementById('importDictConfirm');
    if (importDictConfirm) {
        importDictConfirm.addEventListener('click', importDictFromFile);
    }
    
    // 搜索按钮点击事件
    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) {
        searchBtn.addEventListener('click', searchDict);
    }
    
    // 搜索输入框回车事件
    const dictSearch = document.getElementById('dictSearch');
    if (dictSearch) {
        dictSearch.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchDict();
            }
        });
    }
}

// 显示指定区域（兼容旧代码）
function showSection(section) {
    switchSection(section);
}

// 主题切换
function toggleTheme() {
    isNightMode = !isNightMode;
    if (isNightMode) {
        document.body.classList.add('night-mode');
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.textContent = '☀️';
        }
    } else {
        document.body.classList.remove('night-mode');
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.textContent = '🌙';
        }
    }
}

// 页面加载完成后初始化
window.addEventListener('DOMContentLoaded', function () {
    // #region agent log
    sendDebugLog('script_new.js:domcontentloaded', 'page loaded', {
        href: typeof window !== 'undefined' && window.location ? window.location.href : null,
        origin: typeof window !== 'undefined' && window.location ? window.location.origin : null,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null
    }, 'H6');
    // #endregion
    init();
});

// 学习模块新功能
let currentDict = null;
let dailyGoal = 50;
let newWordsCount = 0;
let reviewWordsCount = 0;

// 初始化学习模块
function initStudyModule() {
    console.log('initStudyModule 被调用');
    
    // 绑定修改目标按钮
    bindChangeGoalButton();
    
    // 加载当前选择的词库
    if (currentDict) {
        updateDictInfo();
        updateTaskInfo();
        displayDailyTask();
    }
    
    // 加载学习统计数据
    updateStudyStats();
    
    // 加载我的词库列表
    loadMyDictList();
    
    // 加载推荐词库列表
    loadRecommendDictList();
}

// 更新词库信息
function updateDictInfo() {
    if (!currentDict) {
        const currentDictName = document.getElementById('currentDictName');
        const dictInfo = document.getElementById('dictInfo');
        const noDictMessage = document.getElementById('noDictMessage');
        const taskSection = document.getElementById('taskSection');
        
        if (currentDictName) currentDictName.textContent = '未选择词库';
        if (dictInfo) dictInfo.style.display = 'none';
        if (noDictMessage) noDictMessage.style.display = 'flex';
        if (taskSection) taskSection.style.display = 'none';
        return;
    }
    
    const currentDictName = document.getElementById('currentDictName');
    const dictInfo = document.getElementById('dictInfo');
    const noDictMessage = document.getElementById('noDictMessage');
    const taskSection = document.getElementById('taskSection');
    
    if (currentDictName) currentDictName.textContent = currentDict.name;
    if (dictInfo) dictInfo.style.display = 'block';
    if (noDictMessage) noDictMessage.style.display = 'none';
    if (taskSection) taskSection.style.display = 'block';
    
    // 计算学习进度
    const totalWords = currentDict.words ? currentDict.words.length : 0;
    const lastLearnIndex = currentDict.lastLearnIndex || 0;
    const progress = totalWords > 0 ? Math.max(0, Math.min(100, Math.round((lastLearnIndex / totalWords) * 100))) : 0;
    
    const studyProgress = document.getElementById('studyProgress');
    const progressText = document.getElementById('progressText');
    const wordCount = document.getElementById('wordCount');
    
    if (studyProgress) studyProgress.style.width = `${progress}%`;
    if (progressText) {
        if (progress >= 100) {
            progressText.textContent = '已学完，进入总复习阶段';
        } else {
            progressText.textContent = `当前进度：已学${progress}%`;
        }
    }
    if (wordCount) wordCount.textContent = `${lastLearnIndex} / ${totalWords} 词`;
    
    // 计算预计完成时间
    const perDayStudyNumber = currentDict.perDayStudyNumber || dailyGoal;
    const estimatedCompletion = document.getElementById('estimatedCompletion');
    if (estimatedCompletion) {
        if (progress >= 100) {
            estimatedCompletion.textContent = '预计完成时间：已完成';
        } else if (perDayStudyNumber > 0 && totalWords > lastLearnIndex) {
            const remainingWords = totalWords - lastLearnIndex;
            const estimatedDays = Math.ceil(remainingWords / perDayStudyNumber);
            estimatedCompletion.textContent = `预计完成时间：${estimatedDays}天`;
        } else {
            estimatedCompletion.textContent = '预计完成时间：未知';
        }
    }
    
    // 更新每日目标
    const dailyGoalElement = document.getElementById('dailyGoal');
    if (dailyGoalElement) dailyGoalElement.textContent = perDayStudyNumber;
}

// 更新任务信息
function updateTaskInfo() {
    if (!currentDict) return;

    const { words: taskWords } = resolvePracticeWords(WordPracticeMode.System);
    const reviewSet = systemPracticeMeta && systemPracticeMeta.reviewSessionSet ? systemPracticeMeta.reviewSessionSet : null;
    reviewWordsCount = reviewSet ? reviewSet.size : Math.min(taskWords.length, systemPracticeMeta.reviewCount || 0);
    newWordsCount = Math.max(0, taskWords.length - reviewWordsCount);
    
    const newWordsCountElement = document.getElementById('newWordsCount');
    const reviewWordsCountElement = document.getElementById('reviewWordsCount');
    const systemPracticeTextElement = document.getElementById('systemPracticeText');
    
    if (newWordsCountElement) newWordsCountElement.textContent = newWordsCount;
    if (reviewWordsCountElement) reviewWordsCountElement.textContent = reviewWordsCount;
    if (systemPracticeTextElement) systemPracticeTextElement.textContent = '开始学习';
}

// 更新学习统计（使用本地存储的真实数据）
function updateStudyStats() {
    displayStudyStatistics();
}

// 词库管理相关变量
let isManageDict = false;
let selectIds = [];

// 加载我的词库列表
function loadMyDictList() {
    const myDictList = document.getElementById('myDictList');
    if (!myDictList) return;
    
    // 模拟我的词库数据
    const myDicts = [
        { id: 'cet4', name: 'CET-4', length: 4500 },
        { id: 'cet6', name: 'CET-6', length: 6000 },
        { id: 'kaoyan', name: '考研英语', length: 5500 }
    ];
    
    myDictList.innerHTML = myDicts.map((dict, index) => `
        <div class="dict-item" onclick="selectDict('${dict.id}')">
            ${isManageDict ? `<input type="checkbox" class="dict-checkbox" data-id="${dict.id}" ${selectIds.includes(dict.id) ? 'checked' : ''} onchange="toggleSelectDict('${dict.id}')">` : ''}
            <h3>${dict.name}</h3>
            <p>单词数量: ${dict.length}</p>
        </div>
    `).join('');
}

// 切换词库管理模式
function toggleManageDict() {
    isManageDict = !isManageDict;
    selectIds = [];
    
    const manageDictBtn = document.getElementById('manageDictBtn');
    const deleteDictBtn = document.getElementById('deleteDictBtn');
    
    if (manageDictBtn) {
        manageDictBtn.textContent = isManageDict ? '取消' : '管理';
    }
    
    if (deleteDictBtn) {
        deleteDictBtn.style.display = isManageDict ? 'block' : 'none';
    }
    
    // 重新加载词库列表
    loadMyDictList();
}

// 切换词库选中状态
function toggleSelectDict(dictId) {
    const index = selectIds.indexOf(dictId);
    if (index > -1) {
        selectIds.splice(index, 1);
    } else {
        selectIds.push(dictId);
    }
}

// 批量删除词库
function handleBatchDel() {
    if (selectIds.length === 0) {
        alert('请选择要删除的词库');
        return;
    }
    
    if (confirm('确认删除所有选中词库？')) {
        // 模拟删除操作
        alert(`删除了 ${selectIds.length} 个词库`);
        selectIds = [];
        loadMyDictList();
    }
}

// 加载推荐词库列表
async function loadRecommendDictList() {
    const recommendDictList = document.getElementById('recommendDictList');
    if (!recommendDictList) return;
    
    try {
        // 从本地文件加载推荐词库列表
        const response = await fetch('../data/recommend_word.json');
        if (response.ok) {
            const recommendDicts = await response.json();
            console.log('推荐词库列表加载成功');
            const existingIds = new Set(dictList.map(d => d.id));
            const filtered = recommendDicts.filter(d => existingIds.has(d.id));
            const toShow =
                filtered.length > 0
                    ? filtered
                    : dictList.slice(0, Math.min(6, dictList.length));
            console.log(`展示推荐词库数: ${toShow.length}个`);
            recommendDictList.innerHTML = toShow
                .map(
                    d => `
                <div class="dict-item" onclick="selectDict('${d.id}')">
                    <h3>${escapeHtml(d.name)}</h3>
                    <p>单词数量: ${d.length}</p>
                </div>
            `
                )
                .join('');
        } else {
            renderRecommendFallback(recommendDictList);
        }
    } catch (error) {
        console.error('加载推荐词库列表失败:', error);
        renderRecommendFallback(recommendDictList);
    }
}

function renderRecommendFallback(container) {
    const existingIds = new Set(dictList.map(d => d.id));
    const fallback = [
        { id: 'cet4', name: 'CET-4', length: 4500 },
        { id: 'cet6', name: 'CET-6', length: 5500 },
        { id: 'kaoyan', name: '考研', length: 6000 }
    ].filter(d => existingIds.has(d.id));
    const toShow =
        fallback.length > 0 ? fallback : dictList.slice(0, Math.min(6, dictList.length));
    container.innerHTML = toShow
        .map(
            d => `
        <div class="dict-item" onclick="selectDict('${d.id}')">
            <h3>${escapeHtml(d.name)}</h3>
            <p>单词数量: ${d.length}</p>
        </div>
    `
        )
        .join('');
}

// 显示词库列表
function showDictList() {
    switchSection('dict');
}

// 学习模式枚举
const WordPracticeMode = {
    System: 0,      // 智能学习
    Free: 1,        // 自由练习
    Review: 2,      // 复习
    Shuffle: 3,     // 随机复习
    ReviewWordsTest: 4,  // 单词测试
    ShuffleWordsTest: 5  // 随机单词测试
};

// 记忆阶段
let currentMemoryStage = 1; // 1: 例句填空, 2: 释义选择, 3: 单词拼写

// 学习模式名称映射
const WordPracticeModeNameMap = {
    [WordPracticeMode.System]: '智能学习',
    [WordPracticeMode.Free]: '自由练习',
    [WordPracticeMode.Review]: '复习',
    [WordPracticeMode.Shuffle]: '随机复习',
    [WordPracticeMode.ReviewWordsTest]: '单词测试',
    [WordPracticeMode.ShuffleWordsTest]: '随机单词测试'
};

// 学习模式URL映射
const WordPracticeModeUrlMap = {
    [WordPracticeMode.System]: '/word/system',
    [WordPracticeMode.Free]: '/word/free',
    [WordPracticeMode.Review]: '/word/review',
    [WordPracticeMode.Shuffle]: '/word/shuffle',
    [WordPracticeMode.ReviewWordsTest]: '/word/test',
    [WordPracticeMode.ShuffleWordsTest]: '/word/random-test'
};

// 当前学习模式
let currentPracticeMode = WordPracticeMode.System;

// 当前学习的单词索引
let currentWordIndex = 0;

// 学习的单词列表
let practiceWords = [];

// 学习进度数据
let studyProgress = {};



// 学习记录数据
let studyRecords = {};

// 学习时间跟踪
let studyStartTime = 0;
let totalStudyTimeToday = 0;

// 去重单词列表的辅助函数
function deduplicateWords(words) {
    const uniqueWords = [];
    const addedWords = new Set();
    for (const word of words) {
        if (word && !addedWords.has(word.word)) {
            uniqueWords.push(word);
            addedWords.add(word.word);
        }
    }
    return uniqueWords;
}

// 为单词添加学习进度属性的辅助函数
function addLearningProgressAttributes(words) {
    const initialized = PracticeFlow.initializePracticeState(words).words;
    words.splice(0, words.length, ...initialized);
}

function getCurrentPracticeState() {
    return {
        words: practiceWords,
        currentMemoryStage,
        currentWordIndex
    };
}

function applyPracticeState(state) {
    practiceWords = Array.isArray(state && state.words) ? state.words : [];
    currentMemoryStage = state && state.currentMemoryStage ? state.currentMemoryStage : 1;
    currentWordIndex = state && typeof state.currentWordIndex === 'number' ? state.currentWordIndex : 0;
}

function setPracticeTitle(stage) {
    const practiceTitle = document.getElementById('practiceTitle');
    if (!practiceTitle) return;

    const modeName = WordPracticeModeNameMap[currentPracticeMode] || '学习';
    practiceTitle.textContent = modeName + ' - ' + PracticeFlow.getStageTitle(stage || currentMemoryStage);
}

function resolvePracticeWords(practiceInput) {
    if (Array.isArray(practiceInput)) {
        systemPracticeMeta = { reviewCount: 0, newWordSet: null, reviewSessionSet: null };
        return {
            practiceMode: currentPracticeMode,
            words: deduplicateWords(practiceInput)
        };
    }

    const practiceMode = practiceInput;
    let resolvedWords = [];

    switch (practiceMode) {
        case WordPracticeMode.System: {
            const goal = Math.min(
                dict.words.length,
                Math.max(1, (currentDict && currentDict.perDayStudyNumber) || dailyGoal)
            );
            const rRatio = Math.min(1, Math.max(0, reviewRatioPercent / 100));
            const plannedReviewCount = Math.min(goal, Math.round(goal * rRatio));
            const due = getDueReviewWordObjects(dict.id, plannedReviewCount);
            // 复习池可能不足（例如未到期或未学到），需用新词补齐到 goal
            const actualReviewCount = Math.min(goal, due.length);
            const newCount = Math.max(0, goal - actualReviewCount);
            const fam = new Set(getWordsForDictFromMap(FAMILIAR_WORDS_KEY, dict.id));
            const cursor = Math.min(
                Math.max(0, (currentDict && currentDict.lastLearnIndex) || 0),
                Math.max(0, dict.words.length - 1)
            );
            const fresh = pickNewWordsForSystemSession(cursor, newCount, fam);

            resolvedWords = mergeSessionWordsByBookOrder(dict, due, fresh);
            resolvedWords = topUpSystemSessionWords(dict, resolvedWords, goal, fam);
            const dueWordSet = new Set((due || []).map(w => w && w.word).filter(Boolean));
            const newWordSet = new Set((fresh || []).map(w => w && w.word).filter(Boolean));
            for (const w of resolvedWords) {
                if (w && w.word && !dueWordSet.has(w.word)) newWordSet.add(w.word);
            }
            const reviewSessionSet = new Set((due || []).map(w => w && w.word).filter(Boolean));
            systemPracticeMeta = { reviewCount: due.length, newWordSet, reviewSessionSet };
            if (resolvedWords.length === 0) {
                const uniqueWords = [];
                const addedWords = new Set();
                for (let i = 0; i < dict.words.length && uniqueWords.length < goal; i++) {
                    const word = dict.words[i];
                    if (word && !addedWords.has(word.word)) {
                        uniqueWords.push(word);
                        addedWords.add(word.word);
                    }
                }
                resolvedWords = uniqueWords;
                systemPracticeMeta = {
                    reviewCount: 0,
                    newWordSet: new Set(uniqueWords.map(w => w && w.word).filter(Boolean)),
                    reviewSessionSet: new Set()
                };
            }
            break;
        }
        case WordPracticeMode.Free:
            resolvedWords = deduplicateWords(dict.words);
            break;
        case WordPracticeMode.Review: {
            let byDict = {};
            try {
                byDict = JSON.parse(localStorage.getItem(REVIEW_WORDS_KEY) || '{}');
            } catch {
                byDict = {};
            }
            const list = (byDict[dict.id] || [])
                .map(w => dict.words.find(x => x.word === w))
                .filter(Boolean);
            const learnedCursor = Math.max(
                0,
                Math.min(dict.words.length, (currentDict && currentDict.lastLearnIndex) || 0)
            );
            const learnedPool = dict.words.filter((w, i) => i < learnedCursor);
            resolvedWords = deduplicateWords(list.length ? list : learnedPool);
            break;
        }
        case WordPracticeMode.Shuffle:
            resolvedWords = shuffleArray(deduplicateWords(dict.words));
            break;
        case WordPracticeMode.ReviewWordsTest:
            resolvedWords = deduplicateWords(dict.words);
            break;
        case WordPracticeMode.ShuffleWordsTest:
            resolvedWords = shuffleArray(deduplicateWords(dict.words));
            break;
        default:
            resolvedWords = deduplicateWords(dict.words);
            break;
    }

    return {
        practiceMode,
        words: resolvedWords
    };
}

// 开始学习
function startPractice(practiceInput) {
    if (!Array.isArray(practiceInput) && (!dict || !dict.words || dict.words.length === 0)) {
        alert('请先选择词库');
        return;
    }

    const { practiceMode, words } = resolvePracticeWords(practiceInput);
    currentPracticeMode = practiceMode;
    studyStartTime = Date.now();
    practiceWords = words;

    if (!practiceWords || practiceWords.length === 0) {
        alert('当前没有可练习的单词');
        return;
    }

    applyPracticeState(PracticeFlow.initializePracticeState(practiceWords));
    switchSection('practice');
    setPracticeTitle(1);
    showCurrentWord();
}

function escapeRegExpTyping(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pickExampleSentence(word) {
    if (word.sentences && word.sentences.length > 0) {
        const s = word.sentences[0];
        return { en: s.c || '', cn: s.cn || '' };
    }
    const w = word.word;
    return {
        en: `I need to learn the word "${w}" today.`,
        cn: '今天我要记住这个单词。'
    };
}

function splitSentenceForTyping(sentence, lemma) {
    const w = (lemma || '').trim();
    const s = (sentence || '').trim();
    if (!w) return { mode: 'full', expected: w };
    const re = new RegExp('\\b' + escapeRegExpTyping(w) + '\\b', 'i');
    const m = s.match(re);
    if (m) {
        const i = m.index;
        return {
            mode: 'inline',
            prefix: s.slice(0, i),
            suffix: s.slice(i + m[0].length),
            expected: w
        };
    }
    return { mode: 'full', en: s, expected: w };
}

function formatExtraLine(item) {
    if (item == null) return '';
    if (typeof item === 'string') return item;
    if (typeof item === 'object') {
        if (item.w) return item.w;
        if (item.word) return item.word;
        return JSON.stringify(item);
    }
    return String(item);
}

function unlockTypingPracticeLayout(layout) {
    layout.dataset.typingLocked = '0';
    const fb = layout.querySelector('#typingFeedback');
    if (fb) {
        fb.textContent = '正确！即将进入下一词';
        fb.hidden = false;
        fb.classList.remove('typing-feedback--error');
        fb.classList.add('typing-feedback--ok');
    }
    const input = layout.querySelector('#typingWordInput');
    if (input) {
        input.classList.remove('typing-blank-input--error');
        input.readOnly = true;
    }
    const nextBtn = layout.querySelector('.typing-next-main');
    if (nextBtn) {
        nextBtn.disabled = false;
        nextBtn.classList.add('typing-next-main--ready');
    }
}

/** @returns {'wrong'|'ok'} */
function tryCompleteTyping(layout) {
    const input = layout.querySelector('#typingWordInput');
    if (!input) {
        unlockTypingPracticeLayout(layout);
        return 'ok';
    }
    let expected = '';
    try {
        expected = decodeURIComponent(input.getAttribute('data-expected') || '').trim();
    } catch {
        expected = (input.getAttribute('data-expected') || '').trim();
    }
    const got = (input.value || '').trim();
    if (!got) {
        const fb = layout.querySelector('#typingFeedback');
        if (fb) {
            fb.textContent = '请在横线处输入单词，完成后按 Enter 或点「下一词」';
            fb.hidden = false;
            fb.classList.add('typing-feedback--error');
        }
        return 'wrong';
    }
    if (got.toLowerCase() !== expected.toLowerCase()) {
        const fb = layout.querySelector('#typingFeedback');
        if (fb) {
            fb.textContent = '拼写不对，再试一次';
            fb.hidden = false;
            fb.classList.add('typing-feedback--error');
        }
        input.classList.add('typing-blank-input--error');
        input.value = '';
        input.focus();
        recordQuizAttempt(false);
        return 'wrong';
    }
    unlockTypingPracticeLayout(layout);
    
    // 显示词组搭配卡片（如果是第三阶段）
    if (currentMemoryStage === 3) {
        const word = practiceWords[currentWordIndex];
        const phrasesList = (word.phrases || [])
            .map(p => `<li>${escapeHtml(p.pContent || p) || ''} - ${escapeHtml(p.pCn || '') || ''}</li>`)
            .join('');
        const synosList = (word.synos || [])
            .map(s => `<li>${escapeHtml(s.pos || '') || ''} ${escapeHtml(s.tran || '') || ''} - ${(s.hwds || []).map(h => escapeHtml(h.w || '')).join(', ')}</li>`)
            .join('');
        const rels = (word.relWords && word.relWords.rels) || [];
        const relsList = rels.map(r => `<li>${escapeHtml(r.pos || '') || ''} - ${(r.words || []).map(w => escapeHtml(w.hwd || '') + ' ' + escapeHtml(w.tran || '')).join(', ')}</li>`).join('');
        const rootText = word.relWords && word.relWords.root ? escapeHtml(word.relWords.root) : '';
        const ety = Array.isArray(word.etymology) ? word.etymology.map(formatExtraLine).filter(Boolean).join('；') : '';
        const rootBlock =
            rootText || ety
                ? `<p>${rootText ? `<strong>词根：</strong>${rootText}` : ''}${rootText && ety ? '<br/>' : ''}${
                      ety ? `<span class="typing-tab-empty">${escapeHtml(ety)}</span>` : ''
                  }</p>`
                : '';
        
        const extraCardHTML = `
            <div class="typing-card typing-card--extra">
                <div class="typing-tab-bar">
                    <div class="typing-tab-group">
                        <button type="button" class="typing-tab-btn typing-tab-btn--active" onclick="switchTypingTab(this,'phrases')">词组搭配</button>
                        <button type="button" class="typing-tab-btn" onclick="switchTypingTab(this,'derive')">派生</button>
                        <button type="button" class="typing-tab-btn" onclick="switchTypingTab(this,'root')">词根</button>
                        <button type="button" class="typing-tab-btn" onclick="switchTypingTab(this,'syno')">近义</button>
                    </div>
                    <span class="typing-tab-icons" aria-hidden="true">＋ ☰</span>
                </div>
                <div class="typing-tab-panel" data-typing-panel="phrases">
                    ${
                        phrasesList
                            ? `<ul>${phrasesList}</ul>`
                            : '<p class="typing-tab-empty">暂无词组搭配</p>'
                    }
                </div>
                <div class="typing-tab-panel" data-typing-panel="derive" hidden>
                    ${
                        relsList
                            ? `<ul>${relsList}</ul>`
                            : '<p class="typing-tab-empty">暂无派生信息</p>'
                    }
                </div>
                <div class="typing-tab-panel" data-typing-panel="root" hidden>
                    ${rootBlock || '<p class="typing-tab-empty">暂无词根信息</p>'}
                </div>
                <div class="typing-tab-panel" data-typing-panel="syno" hidden>
                    ${
                        synosList
                            ? `<ul>${synosList}</ul>`
                            : '<p class="typing-tab-empty">暂无近义词</p>'
                    }
                </div>
            </div>
        `;
        
        // 在卡片下方插入词组搭配卡片
        const footer = layout.querySelector('.typing-practice-footer');
        if (footer) {
            footer.insertAdjacentHTML('beforebegin', extraCardHTML);
        }
    }

    recordQuizAttempt(true);
    return 'ok';
}

function typingInputKeydown(ev) {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const layout = ev.target.closest('.typing-practice-layout');
    if (!layout || layout.dataset.typingLocked !== '1') return;
    const result = tryCompleteTyping(layout);
    if (result === 'ok') {
        queueMicrotask(() => nextWord());
    }
    // 如果是 stage_complete，不执行 nextWord，因为 showCurrentWord 会被调用
}

// 检查释义选择
function checkDefinition(event, selectedIndex, correctDefinition) {
    const layout = document.querySelector('.typing-practice-layout');
    if (!layout || layout.dataset.typingLocked !== '1') return;
    
    const selectedOption = event.currentTarget;
    const selectedText = selectedOption.querySelector('.option-text').textContent.trim();
    const correctText = decodeURIComponent(correctDefinition);
    
    const feedback = layout.querySelector('#typingFeedback');
    
    // 获取所有选项
    const allOptions = layout.querySelectorAll('.definition-option');
    allOptions.forEach(option => {
        option.classList.remove('definition-option--error');
    });
    
    if (selectedText === correctText) {
        recordQuizAttempt(true);
        // 正确
        feedback.textContent = '正确！';
        feedback.hidden = false;
        feedback.classList.remove('typing-feedback--error');
        feedback.classList.add('typing-feedback--correct');
        
        // 标记正确选项为绿色
        selectedOption.classList.add('definition-option--correct');
        
        // 禁用所有选项
        allOptions.forEach(option => {
            option.style.pointerEvents = 'none';
        });
        
        // 显示词组搭配卡片
        const word = practiceWords[currentWordIndex];
        const phrasesList = (word.phrases || [])
            .map(p => `<li>${escapeHtml(p.pContent || p) || ''} - ${escapeHtml(p.pCn || '') || ''}</li>`)
            .join('');
        const synosList = (word.synos || [])
            .map(s => `<li>${escapeHtml(s.pos || '') || ''} ${escapeHtml(s.tran || '') || ''} - ${(s.hwds || []).map(h => escapeHtml(h.w || '')).join(', ')}</li>`)
            .join('');
        const rels = (word.relWords && word.relWords.rels) || [];
        const relsList = rels.map(r => `<li>${escapeHtml(r.pos || '') || ''} - ${(r.words || []).map(w => escapeHtml(w.hwd || '') + ' ' + escapeHtml(w.tran || '')).join(', ')}</li>`).join('');
        const rootText = word.relWords && word.relWords.root ? escapeHtml(word.relWords.root) : '';
        const ety = Array.isArray(word.etymology) ? word.etymology.map(formatExtraLine).filter(Boolean).join('；') : '';
        const rootBlock =
            rootText || ety
                ? `<p>${rootText ? `<strong>词根：</strong>${rootText}` : ''}${rootText && ety ? '<br/>' : ''}${
                      ety ? `<span class="typing-tab-empty">${escapeHtml(ety)}</span>` : ''
                  }</p>`
                : '';
        
        const extraCardHTML = `
            <div class="typing-card typing-card--extra">
                <div class="typing-tab-bar">
                    <div class="typing-tab-group">
                        <button type="button" class="typing-tab-btn typing-tab-btn--active" onclick="switchTypingTab(this,'phrases')">词组搭配</button>
                        <button type="button" class="typing-tab-btn" onclick="switchTypingTab(this,'derive')">派生</button>
                        <button type="button" class="typing-tab-btn" onclick="switchTypingTab(this,'root')">词根</button>
                        <button type="button" class="typing-tab-btn" onclick="switchTypingTab(this,'syno')">近义</button>
                    </div>
                    <span class="typing-tab-icons" aria-hidden="true">＋ ☰</span>
                </div>
                <div class="typing-tab-panel" data-typing-panel="phrases">
                    ${
                        phrasesList
                            ? `<ul>${phrasesList}</ul>`
                            : '<p class="typing-tab-empty">暂无词组搭配</p>'
                    }
                </div>
                <div class="typing-tab-panel" data-typing-panel="derive" hidden>
                    ${
                        relsList
                            ? `<ul>${relsList}</ul>`
                            : '<p class="typing-tab-empty">暂无派生信息</p>'
                    }
                </div>
                <div class="typing-tab-panel" data-typing-panel="root" hidden>
                    ${rootBlock || '<p class="typing-tab-empty">暂无词根信息</p>'}
                </div>
                <div class="typing-tab-panel" data-typing-panel="syno" hidden>
                    ${
                        synosList
                            ? `<ul>${synosList}</ul>`
                            : '<p class="typing-tab-empty">暂无近义词</p>'
                    }
                </div>
            </div>
        `;
        
        // 在卡片下方插入词组搭配卡片
        const footer = layout.querySelector('.typing-practice-footer');
        if (footer) {
            footer.insertAdjacentHTML('beforebegin', extraCardHTML);
        }
        
        // 解锁布局，允许用户点击下一词
        unlockTypingPracticeLayout(layout);
        
        // 自动进入下一词
        queueMicrotask(() => nextWord());
    } else {
        recordQuizAttempt(false);
        // 错误
        feedback.textContent = '错误，请再试一次！';
        feedback.hidden = false;
        feedback.classList.remove('typing-feedback--correct');
        feedback.classList.add('typing-feedback--error');
        
        // 标记错误选项为红色
        selectedOption.classList.add('definition-option--error');
        setTimeout(() => {
            selectedOption.classList.remove('definition-option--error');
        }, 600);
    }
}

function playExampleSentence(text) {
    const t = (text || '').trim();
    // #region agent log
    sendDebugLog('script_new.js:2219', 'example pronunciation requested', {
        hasSpeechSynthesis: typeof speechSynthesis !== 'undefined',
        textLength: t.length,
        voicesCount: typeof speechSynthesis !== 'undefined' && speechSynthesis.getVoices ? speechSynthesis.getVoices().length : null
    }, t ? 'H1' : 'H2');
    // #endregion
    if (!t) {
        console.log('No text to pronounce');
        return;
    }
    try {
        // 确保语音服务已初始化
        if (typeof speechSynthesis === 'undefined') {
            console.error('SpeechSynthesis is not supported in this browser');
            return;
        }
        
        // 取消之前的发音
        speechSynthesis.cancel();
        
        // 创建发音对象
        const u = new SpeechSynthesisUtterance(t);
        u.lang = 'en-US';
        u.rate = 0.9; // 稍微放慢语速，便于学习
        
        // 播放发音
        speechSynthesis.speak(u);
        
        // #region agent log
        sendDebugLog('script_new.js:2226', 'example pronunciation speak called', {
            lang: u.lang,
            textPreview: t.slice(0, 80),
            speaking: speechSynthesis.speaking,
            pending: speechSynthesis.pending
        }, 'H1');
        // #endregion
    } catch (e) {
        // #region agent log
        sendDebugLog('script_new.js:2227', 'example pronunciation failed', {
            error: e && e.message ? e.message : String(e)
        }, 'H1');
        // #endregion
        console.error(e);
    }
}

function switchTypingTab(btn, name) {
    const root = btn && btn.closest('.typing-practice-layout');
    if (!root) return;
    root.querySelectorAll('.typing-tab-btn').forEach(b => {
        b.classList.toggle('typing-tab-btn--active', b === btn);
    });
    root.querySelectorAll('[data-typing-panel]').forEach(p => {
        p.hidden = p.getAttribute('data-typing-panel') !== name;
    });
}

// 显示当前单词（打字卡片布局）
function showCurrentWord() {
    const root = document.getElementById('practiceContent');
    if (!practiceWords || practiceWords.length === 0) {
        root.innerHTML = '<p class="text-center">没有单词可学习</p>';
        return;
    }

    if (currentWordIndex < 0 || currentWordIndex >= practiceWords.length) {
        root.innerHTML = '<p class="text-center">学习完成</p>';
        return;
    }

    const word = practiceWords[currentWordIndex];
    const phonetic = word.phonetic0 || word.phonetic1 || '';
    const ex = pickExampleSentence(word);
    const split = splitSentenceForTyping(ex.en, word.word);

    const defRows =
        word.trans && word.trans.length > 0
            ? word.trans
                  .map(
                      t => `
            <div class="typing-def-row" style="display: flex; align-items: center; gap: 8px;">
                <span class="pos" style="font-weight: 600; color: #6c757d; min-width: 40px;">${escapeHtml(t.pos || '')}</span>
                <span class="cn" style="font-size: 1.1rem; color: #333; line-height: 1.5;">${escapeHtml(t.cn || '')}</span>
            </div>`
                  )
                  .join('')
            : `<div class="typing-def-row"><span class="cn">暂无释义</span></div>`;

    const phrasesList = (word.phrases || [])
        .map(p => `<li>${escapeHtml(p.pContent || p) || ''} - ${escapeHtml(p.pCn || '') || ''}</li>`)
        .join('');
    const synosList = (word.synos || [])
        .map(s => `<li>${escapeHtml(s.pos || '') || ''} ${escapeHtml(s.tran || '') || ''} - ${(s.hwds || []).map(h => escapeHtml(h.w || '')).join(', ')}</li>`)
        .join('');
    const rels = (word.relWords && word.relWords.rels) || [];
    const relsList = rels.map(r => `<li>${escapeHtml(r.pos || '') || ''} - ${(r.words || []).map(w => escapeHtml(w.hwd || '') + ' ' + escapeHtml(w.tran || '')).join(', ')}</li>`).join('');
    const rootText = word.relWords && word.relWords.root ? escapeHtml(word.relWords.root) : '';
    const ety = Array.isArray(word.etymology) ? word.etymology.map(formatExtraLine).filter(Boolean).join('；') : '';
    const rootBlock =
        rootText || ety
            ? `<p>${rootText ? `<strong>词根：</strong>${rootText}` : ''}${rootText && ety ? '<br/>' : ''}${
                  ety ? `<span class="typing-tab-empty">${escapeHtml(ety)}</span>` : ''
              }</p>`
            : '';

    let contentBlock = '';
    const expected = split.expected || word.word;
    const inpW = Math.min(14, Math.max(5, expected.length + 2));
    const expectedEnc = encodeURIComponent(expected);

    // 根据当前记忆阶段显示不同内容
    switch (currentMemoryStage) {
        case 1: // 第一阶段：例句填空
            if (split.mode === 'inline') {
                contentBlock = `
                    <div class="typing-word-header">
                        <h2 class="typing-word-headword">${escapeHtml(word.word)}</h2>
                        <button type="button" class="typing-phonetic-pill" onclick="playPronunciation(${InlineJs.toLiteral(word.word)})" title="播放单词">
                            英 🔊 ${phonetic ? escapeHtml('/' + phonetic.replace(/^\/*|\/*$/g, '') + '/') : ''}
                        </button>
                        <div class="typing-def-list">${defRows}</div>
                    </div>
                    <p class="typing-sentence-line">
                        <span class="en-before">${escapeHtml(split.prefix)}</span><input type="text" id="typingWordInput" class="typing-blank-input" data-expected="${expectedEnc}"
                            autocomplete="off" spellcheck="false" maxlength="64" style="width:${inpW}ch"
                            onkeydown="typingInputKeydown(event)" aria-label="在句中输入单词"
                        /><span class="en-after">${escapeHtml(split.suffix)}</span>
                    </p>
                    <p class="typing-sentence-cn">${escapeHtml(ex.cn)}</p>`;
            } else {
                const enShow = split.en != null ? split.en : ex.en;
                contentBlock = `
                    <div class="typing-word-header">
                        <h2 class="typing-word-headword">${escapeHtml(word.word)}</h2>
                        <button type="button" class="typing-phonetic-pill" onclick="playPronunciation(${InlineJs.toLiteral(word.word)})" title="播放单词">
                            英 🔊 ${phonetic ? escapeHtml('/' + phonetic.replace(/^\/*|\/*$/g, '') + '/') : ''}
                        </button>
                        <div class="typing-def-list">${defRows}</div>
                    </div>
                    <p class="typing-sentence-line typing-sentence-line--full">${escapeHtml(enShow)}</p>
                    <p class="typing-type-hint">请输入本词英文：</p>
                    <input type="text" id="typingWordInput" class="typing-blank-input" data-expected="${expectedEnc}"
                        autocomplete="off" spellcheck="false" maxlength="64" style="width:${inpW}ch;display:block;margin:0 auto"
                        onkeydown="typingInputKeydown(event)" aria-label="输入单词" />
                    <p class="typing-sentence-cn">${escapeHtml(ex.cn)}</p>`;
            }
            break;
        case 2: // 第二阶段：单词选择
            const {
                correctDefinition,
                options
            } = PracticeOptions.buildDefinitionOptions(word, practiceWords);
            
            // 生成选项HTML
            const optionsHTML = options.map((option, index) => `
                <div class="definition-option" onclick="checkDefinition(event, ${index}, '${encodeURIComponent(correctDefinition)}')">
                    <span class="option-number">${String.fromCharCode(65 + index)}.</span>
                    <span class="option-text">${escapeHtml(option)}</span>
                </div>
            `).join('');
            
            contentBlock = `
                <div class="typing-word-header" style="text-align: center;">
                    <h2 class="typing-word-headword" style="text-align: center;">${escapeHtml(word.word)}</h2>
                    <button type="button" class="typing-phonetic-pill" style="margin: 0 auto; display: block;" onclick="playPronunciation(${InlineJs.toLiteral(word.word)})" title="播放单词">
                        英 🔊 ${phonetic ? escapeHtml('/' + phonetic.replace(/^\/*|\/*$/g, '') + '/') : ''}
                    </button>
                </div>
                <p class="typing-type-hint">请选择正确的释义：</p>
                <div class="definition-options">
                    ${optionsHTML}
                </div>`;
            break;
        case 3: // 第三阶段：听写英文单词
            contentBlock = `
                <p class="typing-type-hint">请根据释义和发音，输入英文单词：</p>
                <input type="text" id="typingWordInput" class="typing-blank-input" data-expected="${expectedEnc}"
                    autocomplete="off" spellcheck="false" maxlength="64" style="width:${inpW}ch;display:block;margin:20px auto"
                    onkeydown="typingInputKeydown(event)" aria-label="输入单词" />
                <div class="typing-definition" style="text-align: center;">
                    ${defRows}
                </div>
                <button type="button" class="btn btn-secondary" style="display: block; margin: 0 auto;" onclick="playPronunciation(${InlineJs.toLiteral(word.word)})">🔊 播放发音</button>
            `;
            break;
    }

    // 计算进度，基于当前阶段和当前单词索引
    const totalStages = 3;
    const totalSteps = practiceWords.length * totalStages;
    const currentStep = (currentMemoryStage - 1) * practiceWords.length + currentWordIndex + 1;
    const pct = Math.round((currentStep / totalSteps) * 100);
    const barW = (100 * currentStep) / totalSteps;

    // 只有在第一阶段才显示词组搭配卡片
    const showExtraCard = currentMemoryStage === 1;

    const wordHTML = `
        <div class="typing-practice-layout" data-typing-locked="1">
            <div class="typing-practice-top-actions">
                <button type="button" class="btn btn-secondary btn-sm typing-book-btn" onclick="addWordToFamiliarBook(${InlineJs.toLiteral(
                    word.word
                )})">熟词本</button>
                <button type="button" class="btn btn-info btn-sm typing-book-btn" onclick="addWordToDifficultBook(${InlineJs.toLiteral(
                    word.word
                )})">生词本</button>
            </div>
            
            <div class="typing-card typing-card--sentence">
                <div class="typing-card-inner">
                    ${contentBlock}
                    <div class="typing-card-tools">${currentMemoryStage !== 2 ? '<span class="typing-kb-hint" title="键盘输入">⌨</span>' : ''}</div>
                </div>
                <p id="typingFeedback" class="typing-feedback typing-feedback--error" hidden></p>
            </div>

            ${showExtraCard ? `
            <div class="typing-card typing-card--extra">
                <div class="typing-tab-bar">
                    <div class="typing-tab-group">
                        <button type="button" class="typing-tab-btn typing-tab-btn--active" onclick="switchTypingTab(this,'phrases')">词组搭配</button>
                        <button type="button" class="typing-tab-btn" onclick="switchTypingTab(this,'derive')">派生</button>
                        <button type="button" class="typing-tab-btn" onclick="switchTypingTab(this,'root')">词根</button>
                        <button type="button" class="typing-tab-btn" onclick="switchTypingTab(this,'syno')">近义</button>
                    </div>
                    <span class="typing-tab-icons" aria-hidden="true">＋ ☰</span>
                </div>
                <div class="typing-tab-panel" data-typing-panel="phrases">
                    ${
                        phrasesList
                            ? `<ul>${phrasesList}</ul>`
                            : '<p class="typing-tab-empty">暂无词组搭配</p>'
                    }
                </div>
                <div class="typing-tab-panel" data-typing-panel="derive" hidden>
                    ${
                        relsList
                            ? `<ul>${relsList}</ul>`
                            : '<p class="typing-tab-empty">暂无派生信息</p>'
                    }
                </div>
                <div class="typing-tab-panel" data-typing-panel="root" hidden>
                    ${rootBlock || '<p class="typing-tab-empty">暂无词根信息</p>'}
                </div>
                <div class="typing-tab-panel" data-typing-panel="syno" hidden>
                    ${
                        synosList
                            ? `<ul>${synosList}</ul>`
                            : '<p class="typing-tab-empty">暂无近义词</p>'
                    }
                </div>
            </div>
            ` : ''}

            <div class="typing-practice-footer">
                <div class="typing-progress-mini">${currentWordIndex + 1} / ${practiceWords.length} · ${pct}%</div>
                <button type="button" class="typing-next-main" disabled onclick="nextWord()">下一词</button>
                <div class="typing-next-bar"><div class="typing-next-bar-fill" style="width:${barW}%"></div></div>
            </div>
            <div style="text-align:center;margin-top:0.5rem">
                <button type="button" class="btn btn-info btn-sm" style="font-size:0.8rem;padding:0.25rem 0.6rem" onclick="addWordToReview(${InlineJs.toLiteral(
                    word.word
                )})">添加到复习</button>
            </div>
        </div>
    `;

    root.innerHTML = wordHTML;
    const input = document.getElementById('typingWordInput');
    if (input) input.focus();
}


function onCompleteCurrentPracticeWord() {
    if (!dict || !dict.id) return;
    const w = practiceWords[currentWordIndex];
    if (!w || !w.word) return;
    if (currentPracticeMode === WordPracticeMode.System) {
        scheduleWordForReview(dict.id, w.word);
    }
    if (currentPracticeMode === WordPracticeMode.System && systemPracticeMeta.newWordSet && systemPracticeMeta.newWordSet.has(w.word)) {
        const rs = systemPracticeMeta.reviewSessionSet;
        if (!rs || !rs.has(w.word)) {
            if (currentDict) {
                // 只增加 1，而不是设置为单词的索引
                currentDict.lastLearnIndex = (currentDict.lastLearnIndex || 0) + 1;
                dict.lastLearnIndex = currentDict.lastLearnIndex;
            }
        }
    }
}

function computeDictWordCursorForStorage() {
    const prev = studyProgress[dict.id];
    let dCursor = prev && typeof prev.dictWordCursor === 'number' ? prev.dictWordCursor : 0;
    if (currentPracticeMode === WordPracticeMode.Free) {
        dCursor = currentWordIndex;
    } else if (currentPracticeMode === WordPracticeMode.System && currentDict) {
        dCursor = currentDict.lastLearnIndex != null ? currentDict.lastLearnIndex : dCursor;
    }
    return Math.min(dict.words.length, Math.max(0, dCursor));
}

// 播放发音
function playPronunciation(word) {
    // 这里可以实现发音功能，例如使用Web Speech API或第三方API
    const t = (word || '').trim();
    // #region agent log
    sendDebugLog('script_new.js:2429', 'word pronunciation requested', {
        hasSpeechSynthesis: typeof speechSynthesis !== 'undefined',
        textLength: t.length,
        voicesCount: typeof speechSynthesis !== 'undefined' && speechSynthesis.getVoices ? speechSynthesis.getVoices().length : null
    }, t ? 'H1' : 'H2');
    // #endregion
    if (!t) {
        console.log('No word to pronounce');
        return;
    }
    try {
        // 确保语音服务已初始化
        if (typeof speechSynthesis === 'undefined') {
            console.error('SpeechSynthesis is not supported in this browser');
            return;
        }
        
        // 取消之前的发音
        speechSynthesis.cancel();
        
        // 创建发音对象
        const utterance = new SpeechSynthesisUtterance(word);
        utterance.lang = 'en-US';
        utterance.rate = 0.8; // 稍微放慢语速，便于学习
        
        // 播放发音
        speechSynthesis.speak(utterance);
        
        // #region agent log
        sendDebugLog('script_new.js:2434', 'word pronunciation speak called', {
            lang: utterance.lang,
            textPreview: t.slice(0, 80),
            speaking: speechSynthesis.speaking,
            pending: speechSynthesis.pending
        }, 'H1');
        // #endregion
    } catch (error) {
        // #region agent log
        sendDebugLog('script_new.js:2435', 'word pronunciation failed', {
            error: error && error.message ? error.message : String(error)
        }, 'H1');
        // #endregion
        console.error('播放发音失败:', error);
    }
}

// 下一个单词
function switchToNextStage() {
    applyPracticeState(PracticeFlow.switchToNextStage(getCurrentPracticeState()));
    setPracticeTitle(currentMemoryStage);
    showCurrentWord();
    updateStudyProgress();
}

function showPracticeComplete() {
    const completedIndex = practiceWords.length > 0 ? practiceWords.length - 1 : 0;
    
    // 统计完成所有三个阶段的新学单词数量
    let completedWordsCount = 0;
    const newWordSet = systemPracticeMeta.newWordSet || new Set();
    
    practiceWords.forEach((word, index) => {
        currentWordIndex = index;
        onCompleteCurrentPracticeWord();
        
        // 只统计新学单词中完成所有三个阶段的单词
        if (newWordSet.has(word.word) && word.stage1Complete && word.stage2Complete && word.stage3Complete) {
            completedWordsCount++;
        }
    });
    
    // 更新学习记录
    if (completedWordsCount > 0) {
        updateStudyRecord(completedWordsCount);
    }
    
    // 计算学习时间
    if (studyStartTime > 0) {
        const studyEndTime = Date.now();
        const studyDuration = Math.floor((studyEndTime - studyStartTime) / 1000); // 转换为秒
        updateStudyTime(studyDuration);
        studyStartTime = 0;
    }
    
    currentWordIndex = completedIndex;
    alert('练习完成！');
    saveStudyProgress();
    switchSection('learning');
}

function advancePracticeAfterCorrectAnswer() {
    const transition = PracticeFlow.applyPracticeAttempt(getCurrentPracticeState(), { isCorrect: true });
    applyPracticeState(transition.state);

    if (transition.action === 'next_stage') {
        switchToNextStage();
        return;
    }

    if (transition.action === 'complete') {
        showPracticeComplete();
        return;
    }

    showCurrentWord();
    updateStudyProgress();
}

function nextWord() {
    const layout = document.querySelector('.typing-practice-layout');
    if (layout && layout.dataset.typingLocked === '1') {
        if (currentMemoryStage === 2) return;
        if (tryCompleteTyping(layout) === 'wrong') return;
    }

    advancePracticeAfterCorrectAnswer();
}

// 上一个单词
function previousWord() {
    if (currentWordIndex > 0) {
        currentWordIndex--;
        showCurrentWord();
        // 更新学习进度
        updateStudyProgress();
    } else {
        alert('已经是第一个单词了');
    }
}

// 退出学习
function exitPractice() {
    // 计算学习时间
    if (studyStartTime > 0) {
        const studyEndTime = Date.now();
        const studyDuration = Math.floor((studyEndTime - studyStartTime) / 1000); // 转换为秒
        updateStudyTime(studyDuration);
        studyStartTime = 0;
    }
    
    // 保存学习进度
    saveStudyProgress();
    switchSection('learning');
}

// 保存学习进度
function saveStudyProgress() {
    if (!dict || !dict.id) return;
    
    // 更新学习进度
    studyProgress[dict.id] = {
        lastIndex: currentWordIndex,
        lastMode: currentPracticeMode,
        lastStudyTime: new Date().toISOString(),
        totalLearned: currentWordIndex + 1,
        totalWords: practiceWords.length,
        dictWordCursor: computeDictWordCursorForStorage()
    };
    
    // 保存到localStorage
    localStorage.setItem('studyProgress', JSON.stringify(studyProgress));
    if (currentDict && dict && currentDict.id === dict.id) {
        if (currentPracticeMode === WordPracticeMode.Free) {
            currentDict.lastLearnIndex = currentWordIndex;
            dict.lastLearnIndex = currentWordIndex;
        } else if (currentPracticeMode === WordPracticeMode.System) {
            dict.lastLearnIndex = currentDict.lastLearnIndex;
        }
    }
    trySyncProgressToServer();
    console.log('学习进度保存成功');
}

// 加载学习进度
function loadStudyProgress() {
    try {
        const savedProgress = localStorage.getItem('studyProgress');
        if (savedProgress) {
            studyProgress = JSON.parse(savedProgress);
            console.log('学习进度加载成功');
        }
    } catch (error) {
        console.error('加载学习进度失败:', error);
    }
}

// 加载每日学习目标
function loadDailyGoal() {
    try {
        const savedGoal = localStorage.getItem('dailyGoal');
        if (savedGoal) {
            dailyGoal = parseInt(savedGoal);
            console.log('每日学习目标加载成功:', dailyGoal);
        }
    } catch (error) {
        console.error('加载每日学习目标失败:', error);
    }
}

// 保存每日学习目标
function saveDailyGoal() {
    localStorage.setItem('dailyGoal', dailyGoal.toString());
    console.log('每日学习目标保存成功:', dailyGoal);
}

// 加载学习记录数据
function loadStudyRecords() {
    try {
        const savedRecords = localStorage.getItem('studyRecords');
        if (savedRecords) {
            studyRecords = JSON.parse(savedRecords);
            // 验证学习记录数据的合理性
            const totalDays = Object.keys(studyRecords).length;
            let totalSeconds = 0;
            for (const date in studyRecords) {
                totalSeconds += studyRecords[date].studyTime || 0;
            }
            
            // 如果数据不合理（例如学习天数过多或学习时长过长），重置数据
            if (totalDays > 365 || totalSeconds > 365 * 24 * 3600) {
                console.log('学习记录数据不合理，重置为默认值');
                studyRecords = {};
                saveStudyRecords();
            } else {
                console.log('学习记录数据加载成功');
                for (const date of Object.keys(studyRecords)) {
                    ensureDayRecordShape(date);
                }
                saveStudyRecords();
            }
        }
    } catch (error) {
        console.error('加载学习记录数据失败:', error);
        // 加载失败时重置数据
        studyRecords = {};
        saveStudyRecords();
    }
}

// 保存学习记录数据
function saveStudyRecords() {
    localStorage.setItem('studyRecords', JSON.stringify(studyRecords));
    console.log('学习记录数据保存成功');
}

// 重置学习记录
function resetStudyRecords() {
    if (confirm('确定要重置所有学习记录吗？此操作不可恢复。')) {
        // 重置学习记录
        studyRecords = {};
        saveStudyRecords();
        
        // 重置学习进度
        if (dict && dict.id) {
            studyProgress[dict.id] = {
                lastIndex: 0,
                lastMode: WordPracticeMode.System,
                lastStudyTime: new Date().toISOString(),
                totalLearned: 0,
                totalWords: 0,
                dictWordCursor: 0
            };
            localStorage.setItem('studyProgress', JSON.stringify(studyProgress));
            
            // 重置当前词库的学习进度
            if (currentDict && currentDict.id === dict.id) {
                currentDict.lastLearnIndex = 0;
                dict.lastLearnIndex = 0;
            }
        }
        
        // 重新显示学习统计数据
        displayStudyStatistics();
        // 重新生成学习日历
        generateStudyCalendar();
        // 更新词库信息和进度显示
        updateDictInfo();
        alert('学习记录已重置');
    }
}

/** 本地日历日 YYYY-MM-DD（与日历格子、学习记录键一致） */
function formatDateKeyLocal(date) {
    const d = date instanceof Date ? date : new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// 获取今日日期字符串
function getTodayString() {
    return formatDateKeyLocal(new Date());
}

function ensureDayRecordShape(dayKey) {
    if (!studyRecords[dayKey]) {
        studyRecords[dayKey] = {
            wordsLearned: 0,
            studyTime: 0,
            date: dayKey,
            quizCorrect: 0,
            quizWrong: 0
        };
        return;
    }
    const r = studyRecords[dayKey];
    if (typeof r.wordsLearned !== 'number') r.wordsLearned = 0;
    if (typeof r.studyTime !== 'number') r.studyTime = 0;
    if (typeof r.quizCorrect !== 'number') r.quizCorrect = 0;
    if (typeof r.quizWrong !== 'number') r.quizWrong = 0;
    if (!r.date) r.date = dayKey;
}

/** 记录一次答题正误（释义选择、拼写等），用于正确率统计 */
function recordQuizAttempt(isCorrect) {
    const today = getTodayString();
    ensureDayRecordShape(today);
    if (isCorrect) studyRecords[today].quizCorrect += 1;
    else studyRecords[today].quizWrong += 1;
    saveStudyRecords();
    displayStudyStatistics();
}

// 更新学习记录
function updateStudyRecord(wordsCount) {
    const today = getTodayString();
    ensureDayRecordShape(today);
    studyRecords[today].wordsLearned += wordsCount;
    saveStudyRecords();
}

// 更新学习时间
function updateStudyTime(seconds) {
    const today = getTodayString();
    ensureDayRecordShape(today);
    studyRecords[today].studyTime += seconds;
    totalStudyTimeToday = studyRecords[today].studyTime;
    saveStudyRecords();
    // 更新学习时间显示
    displayStudyStatistics();
}

function dayHasStudyActivity(r) {
    if (!r) return false;
    const w = r.wordsLearned || 0;
    const t = r.studyTime || 0;
    const q = (r.quizCorrect || 0) + (r.quizWrong || 0);
    return w > 0 || t > 0 || q > 0;
}

// 计算总学习天数（有学习词次、时长或答题记录的日期）
function calculateTotalStudyDays() {
    let n = 0;
    for (const date in studyRecords) {
        if (dayHasStudyActivity(studyRecords[date])) n++;
    }
    return n;
}

// 计算总学习时长（秒）
function calculateTotalStudyTime() {
    let totalSeconds = 0;
    for (const date in studyRecords) {
        totalSeconds += studyRecords[date].studyTime || 0;
    }
    return totalSeconds;
}

// 格式化时间（秒转换为时分秒）
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
        return `${hours}小时${minutes}分钟`;
    } else if (minutes > 0) {
        return `${minutes}分钟${remainingSeconds}秒`;
    } else {
        return `${remainingSeconds}秒`;
    }
}

/** 从 start 到 end（含）的本地日历日键列表 */
function dateKeysFromRange(start, end) {
    const keys = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endD = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    while (cur <= endD) {
        keys.push(formatDateKeyLocal(cur));
        cur.setDate(cur.getDate() + 1);
    }
    return keys;
}

function getWeekMondaySunday(ref) {
    const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    const dow = d.getDay();
    const offsetToMonday = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetToMonday);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    return { monday, sunday };
}

function aggregateStudyForKeys(keys) {
    let studyTime = 0;
    let wordsLearned = 0;
    let quizCorrect = 0;
    let quizWrong = 0;
    let activeDays = 0;
    const byDay = keys.map(dateKey => {
        const r = studyRecords[dateKey];
        const st = (r && r.studyTime) || 0;
        const w = (r && r.wordsLearned) || 0;
        const c = (r && r.quizCorrect) || 0;
        const wr = (r && r.quizWrong) || 0;
        if (st > 0 || w > 0 || c + wr > 0) activeDays++;
        studyTime += st;
        wordsLearned += w;
        quizCorrect += c;
        quizWrong += wr;
        return { dateKey, studyTime: st, wordsLearned: w, quizCorrect: c, quizWrong: wr };
    });
    return { studyTime, wordsLearned, quizCorrect, quizWrong, activeDays, byDay };
}

function formatQuizRateForPeriod(correct, wrong) {
    const t = (correct || 0) + (wrong || 0);
    if (t === 0) return '—';
    return `${Math.round(((correct || 0) / t) * 100)}%`;
}

function renderStudyBarsIn(container, byDay, options) {
    if (!container) return;
    const { weekdayLabels, monthStyle } = options || {};
    const maxWords = Math.max(1, ...byDay.map(d => d.wordsLearned || 0));
    container.innerHTML = byDay
        .map((d, i) => {
            const w = d.wordsLearned || 0;
            const pct = Math.round((w / maxWords) * 100);
            let label = '';
            if (monthStyle) {
                label = String(parseInt(d.dateKey.slice(8), 10) || '');
            } else if (weekdayLabels && weekdayLabels[i] != null) {
                label = weekdayLabels[i];
            }
            return `<div class="study-bar-col" title="${d.dateKey} 词次 ${w}">
                <div class="study-bar-track"><div class="study-bar-fill" style="height:${pct}%"></div></div>
                <span class="study-bar-label">${label}</span>
                <span class="study-bar-count">${w}</span>
            </div>`;
        })
        .join('');
}

function bindMyStudyPeriodTabs() {
    const card = document.getElementById('myStudyStatsCard');
    if (!card || card.dataset.tabsBound === '1') return;
    card.dataset.tabsBound = '1';
    const panels = {
        day: document.getElementById('studyPeriodPanelDay'),
        week: document.getElementById('studyPeriodPanelWeek'),
        month: document.getElementById('studyPeriodPanelMonth')
    };
    card.addEventListener('click', e => {
        const tab = e.target.closest('.study-period-tab');
        if (!tab || !card.contains(tab)) return;
        const period = tab.dataset.period;
        if (!period || !panels[period]) return;
        card.querySelectorAll('.study-period-tab').forEach(t => {
            const on = t === tab;
            t.classList.toggle('active', on);
            t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        Object.keys(panels).forEach(p => {
            const el = panels[p];
            if (!el) return;
            const show = p === period;
            el.classList.toggle('study-period-panel--hidden', !show);
            if (show) el.removeAttribute('hidden');
            else el.setAttribute('hidden', '');
        });
    });
}

function renderMyStudyPeriodStats() {
    const card = document.getElementById('myStudyStatsCard');
    if (!card) return;

    const now = new Date();
    const todayKey = formatDateKeyLocal(now);

    const dayRec = studyRecords[todayKey] || {};
    const dTime = dayRec.studyTime || 0;
    const dWords = dayRec.wordsLearned || 0;
    const dQC = dayRec.quizCorrect || 0;
    const dQW = dayRec.quizWrong || 0;
    const dayDescEl = document.getElementById('myStatDayDesc');
    if (dayDescEl) {
        dayDescEl.textContent = now.toLocaleDateString('zh-CN', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    const setN = (id, v) => {
        const el = document.getElementById(id);
        if (el) el.textContent = v;
    };
    setN('myStatDayTime', dTime > 0 ? formatTime(dTime) : '0分钟');
    setN('myStatDayWords', String(dWords));
    setN('myStatDayQuiz', `${dQC} / ${dQW}`);
    setN('myStatDayRate', formatQuizRateForPeriod(dQC, dQW));

    const { monday, sunday } = getWeekMondaySunday(now);
    const weekKeys = dateKeysFromRange(monday, sunday);
    const weekAgg = aggregateStudyForKeys(weekKeys);
    const weekDesc = `${monday.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} — ${sunday.toLocaleDateString('zh-CN', {
        month: 'long',
        day: 'numeric'
    })}（本周）`;
    setN('myStatWeekDesc', weekDesc);
    setN('myStatWeekTime', weekAgg.studyTime > 0 ? formatTime(weekAgg.studyTime) : '0分钟');
    setN('myStatWeekWords', String(weekAgg.wordsLearned));
    setN('myStatWeekQuiz', `${weekAgg.quizCorrect} / ${weekAgg.quizWrong}`);
    setN('myStatWeekRate', formatQuizRateForPeriod(weekAgg.quizCorrect, weekAgg.quizWrong));
    setN('myStatWeekActive', `${weekAgg.activeDays} 天`);
    const weekLabels = ['一', '二', '三', '四', '五', '六', '日'];
    renderStudyBarsIn(document.getElementById('myStatWeekBars'), weekAgg.byDay, { weekdayLabels: weekLabels });

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const monthKeys = dateKeysFromRange(monthStart, monthEnd);
    const monthAgg = aggregateStudyForKeys(monthKeys);
    setN(
        'myStatMonthDesc',
        `${now.getFullYear()}年${now.getMonth() + 1}月（共 ${monthKeys.length} 天）`
    );
    setN('myStatMonthTime', monthAgg.studyTime > 0 ? formatTime(monthAgg.studyTime) : '0分钟');
    setN('myStatMonthWords', String(monthAgg.wordsLearned));
    setN('myStatMonthQuiz', `${monthAgg.quizCorrect} / ${monthAgg.quizWrong}`);
    setN('myStatMonthRate', formatQuizRateForPeriod(monthAgg.quizCorrect, monthAgg.quizWrong));
    setN('myStatMonthActive', `${monthAgg.activeDays} 天`);
    renderStudyBarsIn(document.getElementById('myStatMonthBars'), monthAgg.byDay, { monthStyle: true });
}

/** 连续打卡：从最近一次有活动的日历日向前数 */
function calculateStudyStreak() {
    const has = d => {
        const key = formatDateKeyLocal(d);
        return dayHasStudyActivity(studyRecords[key]);
    };
    let cursor = new Date();
    if (!has(cursor)) {
        cursor.setDate(cursor.getDate() - 1);
        if (!has(cursor)) return 0;
    }
    let streak = 0;
    while (has(cursor)) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
}

/** 本周（周一至周日）有学习活动的天数 */
function calculateWeekStudyDays() {
    const now = new Date();
    const dow = now.getDay();
    const offsetToMonday = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetToMonday);
    let days = 0;
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
        const key = formatDateKeyLocal(d);
        if (dayHasStudyActivity(studyRecords[key])) days++;
    }
    return days;
}

// 显示学习统计数据
function displayStudyStatistics() {
    const today = getTodayString();
    const todayRecord = studyRecords[today] || { studyTime: 0, wordsLearned: 0, quizCorrect: 0, quizWrong: 0 };
    const todayStudyTime = todayRecord.studyTime || 0;
    const todayWordsLearned = todayRecord.wordsLearned || 0;
    const totalStudyDays = calculateTotalStudyDays();
    const totalStudyTime = calculateTotalStudyTime();
    const totalWordsLearned = calculateTotalWordsLearned();
    const correctRate = calculateCorrectRate();
    const streak = calculateStudyStreak();
    const weekDays = calculateWeekStudyDays();

    const setEl = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setEl('totalWords', String(totalWordsLearned));
    setEl('learningTime', String(Math.max(0, Math.floor(totalStudyTime / 60))));
    setEl('correctRate', `${correctRate}%`);

    setEl('todayStudyTime', todayStudyTime > 0 ? formatTime(todayStudyTime) : '0分钟');
    setEl('todayWordsCount', String(todayWordsLearned));
    setEl('totalStudyDays', String(totalStudyDays));
    setEl('totalStudyTime', totalStudyTime > 0 ? formatTime(totalStudyTime) : '0分钟');
    setEl('studyStreakDays', String(streak));
    setEl('weekStudyDays', String(weekDays));

    renderMyStudyPeriodStats();
}

// 计算总学习单词数
function calculateTotalWordsLearned() {
    let totalWords = 0;
    for (const date in studyRecords) {
        totalWords += studyRecords[date].wordsLearned || 0;
    }
    return totalWords;
}

// 计算正确率（基于练习中记录的答题次数）
function calculateCorrectRate() {
    let correct = 0;
    let wrong = 0;
    for (const date in studyRecords) {
        const r = studyRecords[date];
        correct += r.quizCorrect || 0;
        wrong += r.quizWrong || 0;
    }
    const total = correct + wrong;
    if (total === 0) {
        const learned = calculateTotalWordsLearned();
        return learned > 0 ? 100 : 0;
    }
    return Math.round((correct / total) * 100);
}

// 计算今日学习任务
function calculateDailyTask() {
    const today = getTodayString();
    const todayRecord = studyRecords[today] || { wordsLearned: 0 };
    const wordsLearnedToday = todayRecord.wordsLearned;
    const remainingTask = Math.max(0, dailyGoal - wordsLearnedToday);
    
    return {
        total: dailyGoal,
        completed: wordsLearnedToday,
        remaining: remainingTask
    };
}

// 显示每日学习任务
function displayDailyTask() {
    const task = calculateDailyTask();
    const dg = document.getElementById('dailyGoal');
    if (dg) dg.textContent = task.total;
    updateTaskInfo();
}

// 修改每日学习目标
function changeDailyGoal() {
    console.log('========================================');
    console.log('changeDailyGoal 被调用！');
    console.log('当前每日目标:', dailyGoal);
    console.log('========================================');
    
    // 创建自定义弹窗
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.5); display: flex; justify-content: center;
        align-items: center; z-index: 10000;
    `;
    
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: white; padding: 30px; border-radius: 10px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3); max-width: 400px; width: 90%;
    `;
    
    dialog.innerHTML = `
        <h3 style="margin-bottom: 20px; color: #333;">每日任务设置</h3>
        <p style="margin-bottom: 8px; color: #666;">每日学习总词数（新学+复习）</p>
        <input type="number" id="newGoalInput" value="${dailyGoal}" min="1" max="500" 
               style="width: 100%; padding: 10px; font-size: 16px; border: 2px solid #ddd; border-radius: 5px; margin-bottom: 16px;">
        <p style="margin-bottom: 8px; color: #666;">复习占比（%），余下为新学</p>
        <input type="number" id="reviewRatioInput" value="${reviewRatioPercent}" min="0" max="100" 
               style="width: 100%; padding: 10px; font-size: 16px; border: 2px solid #ddd; border-radius: 5px; margin-bottom: 20px;">
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button id="cancelGoalBtn" class="btn btn-secondary" style="padding: 10px 20px;">取消</button>
            <button id="confirmGoalBtn" class="btn btn-primary" style="padding: 10px 20px;">确定</button>
        </div>
    `;
    
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    // 聚焦输入框
    const input = document.getElementById('newGoalInput');
    input.focus();
    input.select();
    
    // 取消按钮
    document.getElementById('cancelGoalBtn').onclick = () => {
        overlay.remove();
        console.log('用户取消了修改');
    };
    
    // 确定按钮
    document.getElementById('confirmGoalBtn').onclick = () => {
        const newGoal = parseInt(input.value, 10);
        const ratioInput = document.getElementById('reviewRatioInput');
        const newRatio = parseInt((ratioInput && ratioInput.value) || '30', 10);
        console.log('用户输入:', newGoal, newRatio);
        
        if (!isNaN(newGoal) && newGoal > 0 && newGoal <= 500 && !Number.isNaN(newRatio) && newRatio >= 0 && newRatio <= 100) {
            dailyGoal = newGoal;
            reviewRatioPercent = newRatio;
            
            // 更新currentDict的每日学习数量
            if (currentDict) {
                currentDict.perDayStudyNumber = dailyGoal;
            }
            
            saveDailyGoal();
            saveReviewRatioSetting();
            
            // 更新界面显示
            const dailyGoalEl = document.getElementById('dailyGoal');
            if (dailyGoalEl) {
                dailyGoalEl.textContent = dailyGoal;
            }
            
            // 重新计算并更新进度信息
            updateDictInfo();
            updateTaskInfo();
            displayDailyTask();
            displayDictWordsList(0);
            
            console.log('✓ 每日目标已更新为:', dailyGoal);
            alert(
                `✓ 已保存：每日 ${dailyGoal} 词，复习占比 ${reviewRatioPercent}%（约 ${Math.min(dailyGoal, Math.round(dailyGoal * (reviewRatioPercent / 100)))} 词复习，其余新学）`
            );
        } else {
            alert('✗ 请填写：每日 1–500 词，复习占比 0–100');
            return; // 不关闭弹窗
        }
        
        overlay.remove();
    };
    
    // 按Enter键确认
    input.onkeypress = (e) => {
        if (e.key === 'Enter') {
            document.getElementById('confirmGoalBtn').click();
        }
    };
    
    // 点击背景关闭
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    };
}

// 在初始化时绑定按钮事件
function bindChangeGoalButton() {
    const changeGoalBtn = document.getElementById('changeGoalBtn');
    if (changeGoalBtn) {
        console.log('找到修改目标按钮，绑定事件...');
        changeGoalBtn.onclick = function() {
            console.log('按钮被点击！');
            changeDailyGoal();
        };
    } else {
        console.log('未找到修改目标按钮');
    }
}

// 更新学习进度
function updateStudyProgress() {
    if (!dict || !dict.id) return;
    
    // 更新学习进度
    studyProgress[dict.id] = {
        lastIndex: currentWordIndex,
        lastMode: currentPracticeMode,
        lastStudyTime: new Date().toISOString(),
        totalLearned: currentWordIndex + 1,
        totalWords: practiceWords.length,
        dictWordCursor: computeDictWordCursorForStorage()
    };
    
    // 保存到localStorage
    localStorage.setItem('studyProgress', JSON.stringify(studyProgress));
    if (currentDict && dict && currentDict.id === dict.id) {
        if (currentPracticeMode === WordPracticeMode.Free) {
            currentDict.lastLearnIndex = currentWordIndex;
            dict.lastLearnIndex = currentWordIndex;
        } else if (currentPracticeMode === WordPracticeMode.System) {
            dict.lastLearnIndex = currentDict.lastLearnIndex;
        }
    }
    trySyncProgressToServer();
    
    // 重新显示每日学习任务
    displayDailyTask();
}

// 随机打乱数组
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// 开始自由练习
function startFreePractice() {
    startPractice(WordPracticeMode.Free);
}

// 开始智能学习
function startSystemPractice() {
    startPractice(WordPracticeMode.System);
}

// 开始复习
function startReview() {
    startPractice(WordPracticeMode.Review);
}

function startReviewPractice() {
    startReview();
}

// 开始随机复习
function startShuffle() {
    startPractice(WordPracticeMode.Shuffle);
}

// 开始单词测试
function startWordsTest() {
    startPractice(WordPracticeMode.ReviewWordsTest);
}

// 开始随机单词测试
function startRandomWordsTest() {
    startPractice(WordPracticeMode.ShuffleWordsTest);
}

// 切换学习模式菜单
function togglePracticeModeMenu() {
    const menu = document.getElementById('practiceModeMenu');
    if (menu) {
        menu.classList.toggle('hidden');
    }
}

// 点击页面其他地方关闭学习模式菜单
document.addEventListener('click', function (event) {
    const menu = document.getElementById('practiceModeMenu');
    const trigger = document.getElementById('practiceModeTrigger');
    if (
        menu &&
        !menu.classList.contains('hidden') &&
        !menu.contains(event.target) &&
        trigger &&
        !trigger.contains(event.target)
    ) {
        menu.classList.add('hidden');
    }
});

// 修改进度
function changeProgress() {
    if (!currentDict || !dict || !dict.words || dict.words.length === 0) {
        alert('请先选择词库');
        return;
    }
    const max = dict.words.length - 1;
    const cur = Math.min(currentDict.lastLearnIndex || 0, max);
    const input = prompt(`已学到第几个词（0～${max}），当前为 ${cur}：`, String(cur));
    if (input === null) return;
    const n = parseInt(input, 10);
    if (Number.isNaN(n) || n < 0 || n > max) {
        alert('请输入有效数字');
        return;
    }
    currentDict.lastLearnIndex = n;
    dict.lastLearnIndex = n;
    currentWordIndex = n;
    const entry = {
        lastIndex: n,
        lastMode: WordPracticeMode.System,
        lastStudyTime: new Date().toISOString(),
        totalLearned: n + 1,
        totalWords: dict.words.length,
        dictWordCursor: n
    };
    studyProgress[dict.id] = entry;
    localStorage.setItem('studyProgress', JSON.stringify(studyProgress));
    updateDictInfo();
    trySyncProgressToServer();
    alert('进度已更新');
}

// 创建个人词库（打开导入）
function createPersonalDict() {
    switchSection('dict');
    const dialog = document.getElementById('importDictDialog');
    if (dialog) dialog.style.display = 'flex';
}

// 包装 selectDict：原逻辑已在 processDictData 中切换学习区并 initStudyModule
const originalSelectDict = selectDict;
selectDict = async function (dictId, options) {
    await originalSelectDict(dictId, options);
};

// 生成学习日历
function generateStudyCalendar() {
    const calendarGrid = document.querySelector('.calendar-grid');
    if (!calendarGrid) return;

    calendarGrid.innerHTML = '';

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayWeek = firstDayOfMonth.getDay();

    const totalDays = Math.ceil((firstDayWeek + daysInMonth) / 7) * 7;
    const todayStr = formatDateKeyLocal(today);

    for (let i = 0; i < totalDays; i++) {
        const currentDate = new Date(firstDayOfMonth);
        currentDate.setDate(currentDate.getDate() + i - firstDayWeek);

        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        dayElement.textContent = currentDate.getDate();

        const inMonth = currentDate.getMonth() === month;
        if (!inMonth) dayElement.classList.add('other-month');

        const dateKey = formatDateKeyLocal(currentDate);
        const hasStudy = dayHasStudyActivity(studyRecords[dateKey]);
        const isToday = dateKey === todayStr;

        if (isToday) dayElement.classList.add('is-today');
        if (hasStudy) dayElement.classList.add('has-study');
        if (isToday && hasStudy) dayElement.classList.add('highlighted');

        dayElement.addEventListener('click', () => {
            showStudyDayDialog(currentDate);
        });

        calendarGrid.appendChild(dayElement);
    }
}

// 显示学习记录对话框
function showStudyDayDialog(date) {
    const dialog = document.getElementById('studyDayDialog');
    const dialogTitle = document.getElementById('studyDayDialogTitle');
    const noStudyRecord = document.getElementById('noStudyRecord');
    const studyDayRecords = document.getElementById('studyDayRecords');
    
    if (!dialog || !dialogTitle || !noStudyRecord || !studyDayRecords) return;
    
    // 设置对话框标题
    const dateStr = date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    dialogTitle.textContent = `${dateStr} 学习记录`;
    
    const dateKey = formatDateKeyLocal(date);
    const records = [];

    const raw = studyRecords[dateKey];
    if (dayHasStudyActivity(raw)) {
        const qc = raw.quizCorrect || 0;
        const qw = raw.quizWrong || 0;
        records.push({
            dictName: dict ? dict.name : '当前词库',
            spend: (raw.studyTime || 0) * 1000,
            words: raw.wordsLearned || 0,
            qc,
            qw
        });
    }

    if (records.length === 0) {
        noStudyRecord.style.display = 'block';
        studyDayRecords.innerHTML = '';
    } else {
        noStudyRecord.style.display = 'none';
        studyDayRecords.innerHTML = records
            .map(record => {
                const name = escapeHtml(record.dictName);
                const quizLine = record.qc + record.qw > 0 ? `答题 ${record.qc} 对 / ${record.qw} 错` : '暂无答题记录';
                return `
            <li>
                <div class="dict-name">${name}</div>
                <div class="study-details">
                    时长 ${msToHourMinute(record.spend)} · 学习词次 ${record.words} · ${quizLine}
                </div>
            </li>`;
            })
            .join('');
    }
    
    // 显示对话框
    dialog.classList.remove('hidden');
}

// 关闭学习记录对话框
function closeStudyDayDialog() {
    const dialog = document.getElementById('studyDayDialog');
    if (dialog) {
        dialog.classList.add('hidden');
    }
}

// 毫秒转时分
function msToHourMinute(ms) {
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    if (hours > 0) {
        return `${hours}小时${minutes}分钟`;
    } else {
        return `${minutes}分钟`;
    }
}

// 更新学习模块时生成日历
const originalInitStudyModule = initStudyModule;
initStudyModule = function() {
    originalInitStudyModule();
    // 生成学习日历
    generateStudyCalendar();
};

// 娱乐板块 - 单词消消乐游戏

// 游戏状态变量
let targetWord = '';
let selectedPositions = [];
let gameActive = false;
let gameBoard = [];

// 单词库
const gameWordList = [
    'APPLE', 'BANANA', 'CHERRY', 'DATE', 'ELDERBERRY',
    'FIG', 'GRAPE', 'HONEYDEW', 'KIWI', 'LEMON',
    'MANGO', 'NECTARINE', 'ORANGE', 'PEACH', 'QUINCE',
    'RASPBERRY', 'STRAWBERRY', 'TANGERINE', 'WATERMELON'
];

// 初始化娱乐模块
function initEntertainmentModule() {
    // 绑定游戏模式选择事件
    const modeBtns = document.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            modeBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            gameMode = this.dataset.mode;
            resetGame();
        });
    });
    
    // 绑定游戏控制按钮事件
    const startGameBtn = document.getElementById('startGameBtn');
    const resetGameBtn = document.getElementById('resetGameBtn');
    const endGameBtn = document.getElementById('endGameBtn');
    const pronunciationBtn = document.getElementById('pronunciationBtn');
    
    if (startGameBtn) startGameBtn.addEventListener('click', startGame);
    if (resetGameBtn) resetGameBtn.addEventListener('click', resetGame);
    if (endGameBtn) endGameBtn.addEventListener('click', endGame);
    if (pronunciationBtn) pronunciationBtn.addEventListener('click', playTargetWordPronunciation);
    
    // 初始化游戏板
    initGameBoard();
}

// 初始化游戏板
function initGameBoard() {
    const gameBoardElement = document.getElementById('gameBoard');
    if (!gameBoardElement) return;
    
    gameBoardElement.innerHTML = '';
    gameBoard = [];
    
    // 生成4x4网格
    for (let i = 0; i < 4; i++) {
        gameBoard[i] = [];
        for (let j = 0; j < 4; j++) {
            const tile = document.createElement('div');
            tile.className = 'letter-tile';
            tile.dataset.row = i;
            tile.dataset.col = j;
            
            // 绑定鼠标事件
            tile.addEventListener('mousedown', startLetterSelection);
            tile.addEventListener('mouseenter', onLetterHover);
            
            // 绑定触摸事件
            tile.addEventListener('touchstart', startLetterSelection);
            tile.addEventListener('touchmove', onLetterTouch);
            
            gameBoardElement.appendChild(tile);
            gameBoard[i][j] = { letter: '', element: tile };
        }
    }
    
    // 绑定鼠标释放事件
    document.addEventListener('mouseup', endLetterSelection);
    document.addEventListener('touchend', endLetterSelection);
}

// 开始选择字母
function startLetterSelection(e) {
    if (!gameActive) return;
    
    e.preventDefault();
    
    const tile = e.target;
    const row = parseInt(tile.dataset.row);
    const col = parseInt(tile.dataset.col);
    
    selectedLetters = [gameBoard[row][col].letter];
    selectedPositions = [[row, col]];
    
    // 高亮选中的字母
    tile.classList.add('selected');
}

// 鼠标悬停选择字母
function onLetterHover(e) {
    if (!gameActive || selectedLetters.length === 0) return;
    
    const tile = e.target;
    const row = parseInt(tile.dataset.row);
    const col = parseInt(tile.dataset.col);
    
    // 检查是否是相邻的字母
    const lastPos = selectedPositions[selectedPositions.length - 1];
    const isAdjacent = (Math.abs(row - lastPos[0]) <= 1 && Math.abs(col - lastPos[1]) <= 1);
    
    if (isAdjacent && !selectedPositions.some(pos => pos[0] === row && pos[1] === col)) {
        selectedLetters.push(gameBoard[row][col].letter);
        selectedPositions.push([row, col]);
        tile.classList.add('selected');
    }
}

// 触摸选择字母
function onLetterTouch(e) {
    if (!gameActive || selectedLetters.length === 0) return;
    
    e.preventDefault();
    
    const touch = e.touches[0];
    const tile = document.elementFromPoint(touch.clientX, touch.clientY);
    
    if (tile && tile.classList.contains('letter-tile')) {
        const row = parseInt(tile.dataset.row);
        const col = parseInt(tile.dataset.col);
        
        // 检查是否是相邻的字母
        const lastPos = selectedPositions[selectedPositions.length - 1];
        const isAdjacent = (Math.abs(row - lastPos[0]) <= 1 && Math.abs(col - lastPos[1]) <= 1);
        
        if (isAdjacent && !selectedPositions.some(pos => pos[0] === row && pos[1] === col)) {
            selectedLetters.push(gameBoard[row][col].letter);
            selectedPositions.push([row, col]);
            tile.classList.add('selected');
        }
    }
}

// 结束选择字母
function endLetterSelection() {
    if (!gameActive || selectedLetters.length === 0) return;
    
    const word = selectedLetters.join('');
    
    // 验证单词
    if (validateWord(word)) {
        // 单词正确，消除字母
        eliminateLetters();
        // 更新积分
        updateScore(word.length * 10);
        // 添加到已消除单词列表
        addToEliminatedWords(word);
        // 刷新字母网格
        refreshGameBoard();
        // 显示反馈信息
        showFeedback(`🎉 正确！+${word.length * 10}分`);
    } else {
        // 单词错误，取消选择
        cancelSelection();
        // 显示反馈信息
        showFeedback('❌ 单词不正确，请重试');
    }
    
    // 清空选择
    selectedLetters = [];
    selectedPositions = [];
}

// 验证单词
function validateWord(word) {
    // 检查是否是目标单词
    if (word === targetWord) {
        return true;
    }
    // 检查是否在单词库中
    return gameWordList.includes(word);
}

// 消除字母
function eliminateLetters() {
    selectedPositions.forEach(pos => {
        const [row, col] = pos;
        gameBoard[row][col].letter = '';
        gameBoard[row][col].element.textContent = '';
        gameBoard[row][col].element.classList.remove('selected');
    });
}

// 取消选择
function cancelSelection() {
    selectedPositions.forEach(pos => {
        const [row, col] = pos;
        gameBoard[row][col].element.classList.remove('selected');
    });
}

// 刷新字母网格
function refreshGameBoard() {
    // 填充空白位置
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            if (gameBoard[i][j].letter === '') {
                gameBoard[i][j].letter = getRandomLetter();
                gameBoard[i][j].element.textContent = gameBoard[i][j].letter;
            }
        }
    }
    
    // 确保网格中包含目标单词的所有字母
    ensureTargetWordLetters();
}

// 确保网格中包含目标单词的所有字母
function ensureTargetWordLetters() {
    const targetLetters = targetWord.split('');
    const boardLetters = [];
    
    // 收集当前网格中的字母
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            boardLetters.push(gameBoard[i][j].letter);
        }
    }
    
    // 检查是否缺少目标单词的字母
    for (const letter of targetLetters) {
        if (!boardLetters.includes(letter)) {
            // 随机选择一个位置替换为缺少的字母
            const row = Math.floor(Math.random() * 4);
            const col = Math.floor(Math.random() * 4);
            gameBoard[row][col].letter = letter;
            gameBoard[row][col].element.textContent = letter;
        }
    }
}

// 获取随机字母
function getRandomLetter() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return letters[Math.floor(Math.random() * letters.length)];
}

// 更新积分
function updateScore(points) {
    gameScore += points;
    const scoreDisplay = document.getElementById('gameScoreDisplay');
    if (scoreDisplay) {
        scoreDisplay.textContent = gameScore;
    }
}

// 添加到已消除单词列表
function addToEliminatedWords(word) {
    if (!eliminatedWords.includes(word)) {
        eliminatedWords.push(word);
        updateWordHistory();
    }
}

// 更新单词历史
function updateWordHistory() {
    const wordHistory = document.getElementById('wordHistory');
    if (!wordHistory) return;
    
    wordHistory.innerHTML = eliminatedWords.map(word => `
        <div class="word-badge">${word}</div>
    `).join('');
}

// 显示反馈信息
function showFeedback(message) {
    const gameFeedback = document.getElementById('gameFeedback');
    if (!gameFeedback) return;
    
    gameFeedback.textContent = message;
    
    // 3秒后清除反馈信息
    setTimeout(() => {
        gameFeedback.textContent = '';
    }, 3000);
}

// 生成目标单词
function generateTargetWord() {
    let word;
    
    switch (gameMode) {
        case 'standard':
            // 标准模式：随机抽取单词
            word = gameWordList[Math.floor(Math.random() * gameWordList.length)];
            break;
        case 'theme':
            // 主题模式：选择水果类单词（这里使用所有单词，实际应用中可以按主题分类）
            word = gameWordList[Math.floor(Math.random() * gameWordList.length)];
            break;
        case 'challenge':
            // 闯关模式：按顺序选择单词
            const index = eliminatedWords.length % gameWordList.length;
            word = gameWordList[index];
            break;
        default:
            word = gameWordList[0];
    }
    
    targetWord = word;
    const targetWordText = document.getElementById('targetWordText');
    if (targetWordText) {
        targetWordText.textContent = targetWord;
    }
}

// 播放目标单词发音
function playTargetWordPronunciation() {
    if (!targetWord) return;
    
    try {
        const utterance = new SpeechSynthesisUtterance(targetWord.toLowerCase());
        utterance.lang = 'en-US';
        speechSynthesis.speak(utterance);
    } catch (error) {
        console.error('播放发音失败:', error);
    }
}

// 开始游戏
function startGame() {
    // 重置游戏状态
    gameScore = 0;
    eliminatedWords = [];
    gameActive = true;
    
    // 生成目标单词
    generateTargetWord();
    
    // 初始化字母网格
    initializeGameBoard();
    
    // 更新积分显示
    const scoreDisplay = document.getElementById('gameScoreDisplay');
    if (scoreDisplay) {
        scoreDisplay.textContent = gameScore;
    }
    
    // 清空单词历史
    const wordHistory = document.getElementById('wordHistory');
    if (wordHistory) {
        wordHistory.innerHTML = '';
    }
    
    // 显示反馈信息
    showFeedback('🎮 游戏开始！滑动字母组成单词');
}

// 初始化字母网格
function initializeGameBoard() {
    // 填充字母
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            gameBoard[i][j].letter = getRandomLetter();
            gameBoard[i][j].element.textContent = gameBoard[i][j].letter;
        }
    }
    
    // 确保网格中包含目标单词的所有字母
    ensureTargetWordLetters();
}

// 重置游戏
function resetGame() {
    // 重置游戏状态
    gameScore = 0;
    eliminatedWords = [];
    gameActive = false;
    selectedLetters = [];
    selectedPositions = [];
    
    // 生成新的目标单词
    generateTargetWord();
    
    // 初始化字母网格
    initializeGameBoard();
    
    // 更新积分显示
    const scoreDisplay = document.getElementById('gameScoreDisplay');
    if (scoreDisplay) {
        scoreDisplay.textContent = gameScore;
    }
    
    // 清空单词历史
    const wordHistory = document.getElementById('wordHistory');
    if (wordHistory) {
        wordHistory.innerHTML = '';
    }
    
    // 清空反馈信息
    const gameFeedback = document.getElementById('gameFeedback');
    if (gameFeedback) {
        gameFeedback.textContent = '';
    }
    
    // 显示反馈信息
    showFeedback('🔄 游戏已重置');
}

// 结束游戏
function endGame() {
    gameActive = false;
    
    // 显示游戏结束信息
    showFeedback(`🎉 游戏结束！最终积分: ${gameScore}`);
}



// 清空学习进度
function clearStudyProgress() {
    if (confirm('确定要清空所有学习进度吗？此操作不可恢复。')) {
        // 清空本地存储中的学习进度
        localStorage.removeItem('studyProgress');
        // 重置学习进度变量
        studyProgress = {};
        // 重新加载学习进度
        loadStudyProgress();
        alert('学习进度已清空');
    }
}


