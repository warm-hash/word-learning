// 全局变量
let currentSection = 'home';
let isLoggedIn = false;
let currentUser = null;
let gameScore = 0;
let selectedLetters = [];
let gameMode = 'standard';
let isNightMode = false;
let eliminatedWords = [];

// API 密钥（实际使用时需要替换为真实密钥）
const MERRIAM_WEBSTER_API_KEY = 'YOUR_API_KEY';
const OXFORD_API_ID = 'YOUR_APP_ID';
const OXFORD_API_KEY = 'YOUR_APP_KEY';

// 单词数据
const words = [
    {
        word: 'Hello',
        phonetic: '/həˈləʊ/',
        meaning: '你好',
        example: 'Hello, how are you?',
        synonyms: [
            { word: 'Hi', phonetic: '/haɪ/', meaning: '嗨' },
            { word: 'Hey', phonetic: '/heɪ/', meaning: '嘿' },
            { word: 'Greetings', phonetic: '/ˈɡriːtɪŋz/', meaning: '问候' }
        ],
        derivatives: ['Helloing', 'Helloed', 'Helloes'],
        examples: [
            { text: 'Hello, nice to meet you!', meaning: '你好，很高兴认识你！' },
            { text: 'She said hello to everyone in the room.', meaning: '她向房间里的每个人问好。' },
            { text: 'Hello there, how can I help you?', meaning: '你好，我能帮你什么？' }
        ],
        collocations: [
            { phrase: 'say hello', meaning: '问好' },
            { phrase: 'hello world', meaning: '你好世界' },
            { phrase: 'hello again', meaning: '再次问好' }
        ]
    },
    {
        word: 'World',
        phonetic: '/wɜːld/',
        meaning: '世界',
        example: 'The world is big.',
        synonyms: [
            { word: 'Globe', phonetic: '/ɡləʊb/', meaning: '地球' },
            { word: 'Earth', phonetic: '/ɜːθ/', meaning: '地球' },
            { word: 'Planet', phonetic: '/ˈplænɪt/', meaning: '行星' }
        ],
        derivatives: ['Worldly', 'Worldwide', 'Worldliness'],
        examples: [
            { text: 'The world is a beautiful place.', meaning: '世界是一个美丽的地方。' },
            { text: 'She wants to travel around the world.', meaning: '她想环游世界。' },
            { text: 'He is known all over the world.', meaning: '他闻名于世。' }
        ],
        collocations: [
            { phrase: 'around the world', meaning: '环游世界' },
            { phrase: 'worldwide', meaning: '全世界的' },
            { phrase: 'world record', meaning: '世界纪录' }
        ]
    },
    {
        word: 'Apple',
        phonetic: '/ˈæpl/',
        meaning: '苹果',
        example: 'I like eating apples.',
        synonyms: [
            { word: 'Fruit', phonetic: '/fruːt/', meaning: '水果' },
            { word: 'Pome', phonetic: '/pəʊm/', meaning: '梨果' }
        ],
        derivatives: ['Apples', 'Apple\'s', 'Appled'],
        examples: [
            { text: 'An apple a day keeps the doctor away.', meaning: '一天一个苹果，医生远离我。' },
            { text: 'She made an apple pie for dessert.', meaning: '她做了一个苹果派当甜点。' },
            { text: 'The apple orchard is full of ripe fruit.', meaning: '苹果园里满是成熟的果实。' }
        ],
        collocations: [
            { phrase: 'apple pie', meaning: '苹果派' },
            { phrase: 'apple juice', meaning: '苹果汁' },
            { phrase: 'apple orchard', meaning: '苹果园' }
        ]
    },
    {
        word: 'Banana',
        phonetic: '/bəˈnɑːnə/',
        meaning: '香蕉',
        example: 'Bananas are yellow.',
        synonyms: [
            { word: 'Fruit', phonetic: '/fruːt/', meaning: '水果' },
            { word: 'Plantain', phonetic: '/ˈplæntɪn/', meaning: '大蕉' }
        ],
        derivatives: ['Bananas', 'Banana\'s', 'Bananaed'],
        examples: [
            { text: 'Bananas are rich in potassium.', meaning: '香蕉富含钾。' },
            { text: 'He peeled the banana and ate it.', meaning: '他剥了香蕉并吃了它。' },
            { text: 'She added banana to her smoothie.', meaning: '她在她的冰沙里加了香蕉。' }
        ],
        collocations: [
            { phrase: 'banana bread', meaning: '香蕉面包' },
            { phrase: 'banana split', meaning: '香蕉船' },
            { phrase: 'peel a banana', meaning: '剥香蕉' }
        ]
    },
    {
        word: 'Cat',
        phonetic: '/kæt/',
        meaning: '猫',
        example: 'The cat is cute.',
        synonyms: [
            { word: 'Feline', phonetic: '/ˈfiːlaɪn/', meaning: '猫科动物' },
            { word: 'Kitty', phonetic: '/ˈkɪti/', meaning: '小猫' },
            { word: 'Pussycat', phonetic: '/ˈpʊsikæt/', meaning: '小猫' }
        ],
        derivatives: ['Cats', 'Cat\'s', 'Catlike', 'Catty', 'Kitten'],
        examples: [
            { text: 'The cat is sleeping on the couch.', meaning: '猫正在沙发上睡觉。' },
            { text: 'She has a pet cat named Whiskers.', meaning: '她有一只名叫Whiskers的宠物猫。' },
            { text: 'The cat chased the mouse.', meaning: '猫追赶老鼠。' }
        ],
        collocations: [
            { phrase: 'pet cat', meaning: '宠物猫' },
            { phrase: 'cat and mouse', meaning: '猫和老鼠' },
            { phrase: 'cat nap', meaning: '小睡' }
        ]
    },
    {
        word: 'Dog',
        phonetic: '/dɒɡ/',
        meaning: '狗',
        example: 'Dogs are loyal.',
        synonyms: [
            { word: 'Canine', phonetic: '/ˈkeɪnaɪn/', meaning: '犬科动物' },
            { word: 'Puppy', phonetic: '/ˈpʌpi/', meaning: '小狗' },
            { word: 'Hound', phonetic: '/haʊnd/', meaning: '猎犬' }
        ],
        derivatives: ['Dogs', 'Dog\'s', 'Doggy', 'Doglike', 'Doghouse'],
        examples: [
            { text: 'The dog is barking at the mailman.', meaning: '狗在对邮递员吠叫。' },
            { text: 'He takes his dog for a walk every morning.', meaning: '他每天早上带狗去散步。' },
            { text: 'Dogs are known for their loyalty.', meaning: '狗以忠诚著称。' }
        ],
        collocations: [
            { phrase: 'pet dog', meaning: '宠物狗' },
            { phrase: 'walk the dog', meaning: '遛狗' },
            { phrase: 'dog barks', meaning: '狗叫' }
        ]
    },
    {
        word: 'Book',
        phonetic: '/bʊk/',
        meaning: '书',
        example: 'I like reading books.',
        synonyms: [
            { word: 'Novel', phonetic: '/ˈnɒvl/', meaning: '小说' },
            { word: 'Volume', phonetic: '/ˈvɒljuːm/', meaning: '卷' },
            { word: 'Tome', phonetic: '/təʊm/', meaning: '巨著' }
        ],
        derivatives: ['Books', 'Book\'s', 'Bookstore', 'Bookmark', 'Booklet'],
        examples: [
            { text: 'She is reading a book about history.', meaning: '她正在读一本关于历史的书。' },
            { text: 'He bought a new book at the bookstore.', meaning: '他在书店买了一本新书。' },
            { text: 'The book has a beautiful cover.', meaning: '这本书有一个漂亮的封面。' }
        ],
        collocations: [
            { phrase: 'read a book', meaning: '读书' },
            { phrase: 'write a book', meaning: '写书' },
            { phrase: 'bookstore', meaning: '书店' }
        ]
    },
    {
        word: 'Pen',
        phonetic: '/pen/',
        meaning: '笔',
        example: 'I need a pen to write.',
        synonyms: [
            { word: 'Writing instrument', phonetic: '/ˈraɪtɪŋ ˈɪnstrʊmənt/', meaning: '书写工具' },
            { word: 'Ballpoint', phonetic: '/ˈbɔːlpɔɪnt/', meaning: '圆珠笔' },
            { word: 'Fountain pen', phonetic: '/ˈfaʊntən pen/', meaning: '自来水笔' }
        ],
        derivatives: ['Pens', 'Pen\'s', 'Penholder', 'Penmanship', 'Penknife'],
        examples: [
            { text: 'She writes with a pen.', meaning: '她用钢笔写字。' },
            { text: 'He lost his pen at school.', meaning: '他在学校丢了钢笔。' },
            { text: 'The pen is mightier than the sword.', meaning: '笔比剑更有力量。' }
        ],
        collocations: [
            { phrase: 'write with a pen', meaning: '用钢笔写' },
            { phrase: 'pen and paper', meaning: '纸和笔' },
            { phrase: 'pen holder', meaning: '笔架' }
        ]
    },
    {
        word: 'Computer',
        phonetic: '/kəmˈpjuːtə/',
        meaning: '电脑',
        example: 'I use a computer for work.',
        synonyms: [
            { word: 'PC', phonetic: '/piː siː/', meaning: '个人电脑' },
            { word: 'Laptop', phonetic: '/ˈlæptɒp/', meaning: '笔记本电脑' },
            { word: 'Device', phonetic: '/dɪˈvaɪs/', meaning: '设备' }
        ],
        derivatives: ['Computers', 'Computer\'s', 'Computerize', 'Computerized', 'Computation'],
        examples: [
            { text: 'I use my computer for work and study.', meaning: '我用电脑工作和学习。' },
            { text: 'The computer is a powerful tool.', meaning: '电脑是一种强大的工具。' },
            { text: 'She bought a new computer last week.', meaning: '她上周买了一台新电脑。' }
        ],
        collocations: [
            { phrase: 'use a computer', meaning: '使用电脑' },
            { phrase: 'computer screen', meaning: '电脑屏幕' },
            { phrase: 'computer keyboard', meaning: '电脑键盘' }
        ]
    },
    {
        word: 'Phone',
        phonetic: '/fəʊn/',
        meaning: '电话',
        example: 'I have a phone.',
        synonyms: [
            { word: 'Cellphone', phonetic: '/ˈselfəʊn/', meaning: '手机' },
            { word: 'Mobile', phonetic: '/ˈməʊbaɪl/', meaning: '移动电话' },
            { word: 'Telephone', phonetic: '/ˈtelɪfəʊn/', meaning: '电话' }
        ],
        derivatives: ['Phones', 'Phone\'s', 'Phone call', 'Phone booth', 'Phoneline'],
        examples: [
            { text: 'I called him on the phone.', meaning: '我给他打电话了。' },
            { text: 'She checked her phone for messages.', meaning: '她检查手机上的消息。' },
            { text: 'The phone rang while I was cooking.', meaning: '我做饭时电话响了。' }
        ],
        collocations: [
            { phrase: 'answer the phone', meaning: '接电话' },
            { phrase: 'phone call', meaning: '电话' },
            { phrase: 'phone battery', meaning: '手机电池' }
        ]
    }
];

// 学习统计数据
const learningStats = {
    totalWords: 100,
    learnedWords: 30,
    dailyGoal: 10,
    todayLearned: 5,
    accuracy: 85,
    streak: 7
};

// 初始化函数
function init() {
    bindEvents();
    showSection('home');
    updateStats();
    // 初始化主题切换按钮事件监听器
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
}

// 绑定事件
function bindEvents() {
    // 导航链接点击事件
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function() {
            const section = this.getAttribute('data-section');
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
    document.getElementById('continueLearningBtn').addEventListener('click', function() {
        switchSection('learning');
    });
    
    document.getElementById('todayChallengeBtn').addEventListener('click', function() {
        switchSection('entertainment');
    });
    
    // 开始学习按钮点击事件
    document.getElementById('startLearningBtn').addEventListener('click', function() {
        switchSection('learning');
    });
    
    // 学习模块事件
    bindLearningEvents();
    
    // 娱乐模块事件
    bindEntertainmentEvents();
    
    // 登录注册事件
    bindAuthEvents();
}

// 绑定学习模块事件
function bindLearningEvents() {
    // 播放发音按钮点击事件
    const playPronunciationBtn = document.getElementById('playPronunciation');
    if (playPronunciationBtn) {
        playPronunciationBtn.addEventListener('click', function() {
            const word = document.getElementById('currentWord').textContent;
            playPronunciation(word);
        });
    }
    
    // 查看例句按钮点击事件
    const showExampleBtn = document.getElementById('showExample');
    if (showExampleBtn) {
        showExampleBtn.addEventListener('click', function() {
            const word = document.getElementById('currentWord').textContent;
            fetchWordData(word).then(data => {
                if (data && data.examples && data.examples.length > 0) {
                    const example = data.examples[0];
                    document.getElementById('wordExample').innerHTML = `
                        <p>${example.example}</p>
                        <p style="color: var(--text-secondary);">${example.meaning}</p>
                        <button class="btn btn-secondary" onclick="playPronunciation('${example.example}')">播放例句发音</button>
                    `;
                } else {
                    document.getElementById('wordExample').innerHTML = '<p>暂无例句</p>';
                }
            });
        });
    }
    
    // 初始化显示随机单词
    showRandomWord();
}

// 绑定娱乐模块事件
function bindEntertainmentEvents() {
    // 游戏模式选择事件
    document.querySelectorAll('.game-mode-card').forEach(card => {
        card.addEventListener('click', function() {
            const mode = this.getAttribute('data-mode');
            startGame(mode);
        });
    });
    
    // 游戏操作按钮事件
    document.getElementById('submitWordBtn').addEventListener('click', function() {
        checkWord();
    });
    
    document.getElementById('shuffleBtn').addEventListener('click', function() {
        shuffleLetters();
    });
    
    document.getElementById('hintBtn').addEventListener('click', function() {
        showHint();
    });
    
    document.getElementById('restartBtn').addEventListener('click', function() {
        restartGame();
    });
}

// 绑定登录注册事件
function bindAuthEvents() {
    // 切换登录/注册表单
    document.getElementById('showRegister').addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
    });
    
    document.getElementById('showLogin').addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('registerForm').style.display = 'none';
        document.getElementById('loginForm').style.display = 'block';
    });
    
    // 登录表单提交
    document.getElementById('loginForm').addEventListener('submit', function(e) {
        e.preventDefault();
        login();
    });
    
    // 注册表单提交
    document.getElementById('registerForm').addEventListener('submit', function(e) {
        e.preventDefault();
        register();
    });
    
    // 密码显示/隐藏
    document.querySelectorAll('.password-toggle').forEach(toggle => {
        toggle.addEventListener('click', function() {
            const input = this.previousElementSibling;
            const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
            input.setAttribute('type', type);
            this.textContent = type === 'password' ? '👁️' : '👁️‍🗨️';
        });
    });
}

// 切换区域
function switchSection(section) {
    // 隐藏所有区域
    document.querySelectorAll('.section').forEach(sec => {
        sec.classList.remove('active');
    });
    
    // 显示指定区域
    document.getElementById(section).classList.add('active');
    
    // 更新当前区域
    currentSection = section;
    
    // 更新导航链接状态
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.getAttribute('data-section') === section) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // 如果是学习区域，显示随机单词
    if (section === 'learning') {
        showRandomWord();
    }
}

// 显示指定区域（兼容旧代码）
function showSection(section) {
    switchSection(section);
}

// 通过 API 获取单词数据
async function fetchWordData(word) {
    try {
        // 模拟 API 响应（实际使用时替换为真实 API 调用）
        // 这里使用模拟数据，实际项目中需要调用真实的词典 API
        console.log(`Fetching data for word: ${word}`);
        
        // 模拟 API 响应延迟
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 模拟数据
        const mockData = {
            derivatives: getMockDerivatives(word),
            synonyms: getMockSynonyms(word),
            collocations: getMockCollocations(word)
        };
        
        return mockData;
    } catch (error) {
        console.error('Error fetching word data:', error);
        // 返回默认数据
        return {
            derivatives: [],
            synonyms: [],
            collocations: []
        };
    }
}

// 生成模拟派生词
function getMockDerivatives(word) {
    const derivativesMap = {
        'Hello': ['Helloing', 'Helloed', 'Helloes'],
        'World': ['Worldly', 'Worldwide', 'Worldliness'],
        'Apple': ['Apples', 'Apple\'s', 'Appled'],
        'Banana': ['Bananas', 'Banana\'s', 'Bananaed'],
        'Cat': ['Cats', 'Cat\'s', 'Catlike', 'Catty', 'Kitten'],
        'Dog': ['Dogs', 'Dog\'s', 'Doggy', 'Doglike', 'Doghouse'],
        'Book': ['Books', 'Book\'s', 'Bookstore', 'Bookmark', 'Booklet'],
        'Pen': ['Pens', 'Pen\'s', 'Penholder', 'Penmanship', 'Penknife'],
        'Computer': ['Computers', 'Computer\'s', 'Computerize', 'Computerized', 'Computation'],
        'Phone': ['Phones', 'Phone\'s', 'Phone call', 'Phone booth', 'Phoneline']
    };
    return derivativesMap[word] || [];
}

// 生成模拟近义词
function getMockSynonyms(word) {
    const synonymsMap = {
        'Hello': [
            { word: 'Hi', phonetic: '/haɪ/', meaning: '嗨' },
            { word: 'Hey', phonetic: '/heɪ/', meaning: '嘿' },
            { word: 'Greetings', phonetic: '/ˈɡriːtɪŋz/', meaning: '问候' }
        ],
        'World': [
            { word: 'Globe', phonetic: '/ɡləʊb/', meaning: '地球' },
            { word: 'Earth', phonetic: '/ɜːθ/', meaning: '地球' },
            { word: 'Planet', phonetic: '/ˈplænɪt/', meaning: '行星' }
        ],
        'Apple': [
            { word: 'Fruit', phonetic: '/fruːt/', meaning: '水果' },
            { word: 'Pome', phonetic: '/pəʊm/', meaning: '梨果' }
        ],
        'Banana': [
            { word: 'Fruit', phonetic: '/fruːt/', meaning: '水果' },
            { word: 'Plantain', phonetic: '/ˈplæntɪn/', meaning: '大蕉' }
        ],
        'Cat': [
            { word: 'Feline', phonetic: '/ˈfiːlaɪn/', meaning: '猫科动物' },
            { word: 'Kitty', phonetic: '/ˈkɪti/', meaning: '小猫' },
            { word: 'Pussycat', phonetic: '/ˈpʊsikæt/', meaning: '小猫' }
        ],
        'Dog': [
            { word: 'Canine', phonetic: '/ˈkeɪnaɪn/', meaning: '犬科动物' },
            { word: 'Puppy', phonetic: '/ˈpʌpi/', meaning: '小狗' },
            { word: 'Hound', phonetic: '/haʊnd/', meaning: '猎犬' }
        ],
        'Book': [
            { word: 'Novel', phonetic: '/ˈnɒvl/', meaning: '小说' },
            { word: 'Volume', phonetic: '/ˈvɒljuːm/', meaning: '卷' },
            { word: 'Tome', phonetic: '/təʊm/', meaning: '巨著' }
        ],
        'Pen': [
            { word: 'Writing instrument', phonetic: '/ˈraɪtɪŋ ˈɪnstrʊmənt/', meaning: '书写工具' },
            { word: 'Ballpoint', phonetic: '/ˈbɔːlpɔɪnt/', meaning: '圆珠笔' },
            { word: 'Fountain pen', phonetic: '/ˈfaʊntən pen/', meaning: '自来水笔' }
        ],
        'Computer': [
            { word: 'PC', phonetic: '/piː siː/', meaning: '个人电脑' },
            { word: 'Laptop', phonetic: '/ˈlæptɒp/', meaning: '笔记本电脑' },
            { word: 'Device', phonetic: '/dɪˈvaɪs/', meaning: '设备' }
        ],
        'Phone': [
            { word: 'Cellphone', phonetic: '/ˈselfəʊn/', meaning: '手机' },
            { word: 'Mobile', phonetic: '/ˈməʊbaɪl/', meaning: '移动电话' },
            { word: 'Telephone', phonetic: '/ˈtelɪfəʊn/', meaning: '电话' }
        ]
    };
    return synonymsMap[word] || [];
}

// 生成模拟词组搭配
function getMockCollocations(word) {
    const collocationsMap = {
        'Hello': [
            { phrase: 'say hello', meaning: '问好' },
            { phrase: 'hello world', meaning: '你好世界' },
            { phrase: 'hello again', meaning: '再次问好' }
        ],
        'World': [
            { phrase: 'around the world', meaning: '环游世界' },
            { phrase: 'worldwide', meaning: '全世界的' },
            { phrase: 'world record', meaning: '世界纪录' }
        ],
        'Apple': [
            { phrase: 'apple pie', meaning: '苹果派' },
            { phrase: 'apple juice', meaning: '苹果汁' },
            { phrase: 'apple orchard', meaning: '苹果园' }
        ],
        'Banana': [
            { phrase: 'banana bread', meaning: '香蕉面包' },
            { phrase: 'banana split', meaning: '香蕉船' },
            { phrase: 'peel a banana', meaning: '剥香蕉' }
        ],
        'Cat': [
            { phrase: 'pet cat', meaning: '宠物猫' },
            { phrase: 'cat and mouse', meaning: '猫和老鼠' },
            { phrase: 'cat nap', meaning: '小睡' }
        ],
        'Dog': [
            { phrase: 'pet dog', meaning: '宠物狗' },
            { phrase: 'walk the dog', meaning: '遛狗' },
            { phrase: 'dog barks', meaning: '狗叫' }
        ],
        'Book': [
            { phrase: 'read a book', meaning: '读书' },
            { phrase: 'write a book', meaning: '写书' },
            { phrase: 'bookstore', meaning: '书店' }
        ],
        'Pen': [
            { phrase: 'write with a pen', meaning: '用钢笔写' },
            { phrase: 'pen and paper', meaning: '纸和笔' },
            { phrase: 'pen holder', meaning: '笔架' }
        ],
        'Computer': [
            { phrase: 'use a computer', meaning: '使用电脑' },
            { phrase: 'computer screen', meaning: '电脑屏幕' },
            { phrase: 'computer keyboard', meaning: '电脑键盘' }
        ],
        'Phone': [
            { phrase: 'answer the phone', meaning: '接电话' },
            { phrase: 'phone call', meaning: '电话' },
            { phrase: 'phone battery', meaning: '手机电池' }
        ]
    };
    return collocationsMap[word] || [];
}

// 获取单词的音标
function getPhonetic(word) {
    // 模拟音标数据
    const phoneticMap = {
        'Helloing': '/həˈləʊɪŋ/',
        'Helloed': '/həˈləʊd/',
        'Helloes': '/həˈləʊz/',
        'Worldly': '/ˈwɜːldli/',
        'Worldwide': '/ˈwɜːldwaɪd/',
        'Worldliness': '/ˈwɜːldlinəs/',
        'Apples': '/ˈæplz/',
        'Apple\'s': '/ˈæplz/',
        'Appled': '/ˈæpld/',
        'Bananas': '/bəˈnɑːnəz/',
        'Banana\'s': '/bəˈnɑːnəz/',
        'Bananaed': '/bəˈnɑːnəd/',
        'Cats': '/kæts/',
        'Cat\'s': '/kæts/',
        'Catlike': '/ˈkætlaɪk/',
        'Catty': '/ˈkæti/',
        'Kitten': '/ˈkɪtn/',
        'Dogs': '/dɒɡz/',
        'Dog\'s': '/dɒɡz/',
        'Doggy': '/ˈdɒɡi/',
        'Doglike': '/ˈdɒɡlaɪk/',
        'Doghouse': '/ˈdɒɡhaʊs/',
        'Books': '/bʊks/',
        'Book\'s': '/bʊks/',
        'Bookstore': '/ˈbʊkstɔː/',
        'Bookmark': '/ˈbʊkmɑːk/',
        'Booklet': '/ˈbʊklət/',
        'Pens': '/penz/',
        'Pen\'s': '/penz/',
        'Penholder': '/ˈpenhəʊldə/',
        'Penmanship': '/ˈpenmənʃɪp/',
        'Penknife': '/ˈpennaɪf/',
        'Computers': '/kəmˈpjuːtəz/',
        'Computer\'s': '/kəmˈpjuːtəz/',
        'Computerize': '/kəmˈpjuːtəraɪz/',
        'Computerized': '/kəmˈpjuːtəraɪzd/',
        'Computation': '/ˌkɒmpjuˈteɪʃn/',
        'Phones': '/fəʊnz/',
        'Phone\'s': '/fəʊnz/',
        'Phone call': '/fəʊn kɔːl/',
        'Phone booth': '/fəʊn buːð/',
        'Phoneline': '/ˈfəʊnlaɪn/',
        'say hello': '/seɪ həˈləʊ/',
        'hello world': '/həˈləʊ wɜːld/',
        'hello again': '/həˈləʊ əˈɡen/',
        'around the world': '/əˈraʊnd ðə wɜːld/',
        'worldwide': '/ˈwɜːldwaɪd/',
        'world record': '/wɜːld ˈrekɔːd/',
        'apple pie': '/ˈæpl paɪ/',
        'apple juice': '/ˈæpl dʒuːs/',
        'apple orchard': '/ˈæpl ˈɔːtʃəd/',
        'banana bread': '/bəˈnɑːnə bred/',
        'banana split': '/bəˈnɑːnə splɪt/',
        'peel a banana': '/piːl ə bəˈnɑːnə/',
        'pet cat': '/pet kæt/',
        'cat and mouse': '/kæt ənd maʊs/',
        'cat nap': '/kæt næp/',
        'pet dog': '/pet dɒɡ/',
        'walk the dog': '/wɔːk ðə dɒɡ/',
        'dog barks': '/dɒɡ bɑːks/',
        'read a book': '/riːd ə bʊk/',
        'write a book': '/raɪt ə bʊk/',
        'bookstore': '/ˈbʊkstɔː/',
        'write with a pen': '/raɪt wɪð ə pen/',
        'pen and paper': '/pen ənd ˈpeɪpə/',
        'pen holder': '/pen ˈhəʊldə/',
        'use a computer': '/juːz ə kəmˈpjuːtə/',
        'computer screen': '/kəmˈpjuːtə skriːn/',
        'computer keyboard': '/kəmˈpjuːtə ˈkiːbɔːd/',
        'answer the phone': '/ˈɑːnsə ðə fəʊn/',
        'phone call': '/fəʊn kɔːl/',
        'phone battery': '/fəʊn ˈbætri/'
    };
    return phoneticMap[word] || '';
}

// 获取派生词的释义
function getDerivativeMeaning(derivative, baseMeaning) {
    // 简单的派生词释义生成逻辑
    if (derivative.endsWith('ing')) {
        return `正在${baseMeaning}`;
    } else if (derivative.endsWith('ed')) {
        return `已${baseMeaning}`;
    } else if (derivative.endsWith('s')) {
        return `${baseMeaning}（复数）`;
    } else if (derivative.endsWith('\'s')) {
        return `${baseMeaning}的`;
    } else if (derivative.endsWith('ly')) {
        return `（副词）${baseMeaning}地`;
    } else if (derivative.endsWith('ness')) {
        return `${baseMeaning}的状态`;
    } else if (derivative.endsWith('er')) {
        return `做${baseMeaning}的人/物`;
    } else if (derivative.endsWith('ment')) {
        return `${baseMeaning}的行为/结果`;
    } else if (derivative.endsWith('tion')) {
        return `${baseMeaning}的行为/结果`;
    } else {
        return baseMeaning;
    }
}

// 显示随机单词
async function showRandomWord() {
    const randomIndex = Math.floor(Math.random() * words.length);
    const word = words[randomIndex];
    
    // 获取 API 数据
    const apiData = await fetchWordData(word.word);
    
    // 更新单词数据
    word.derivatives = apiData.derivatives;
    word.synonyms = apiData.synonyms;
    word.collocations = apiData.collocations;
    
    document.getElementById('currentWord').textContent = word.word;
    document.getElementById('phonetic').textContent = word.phonetic;
    document.getElementById('meaning').textContent = word.meaning;
    
    // 显示例句
    const exampleText = document.getElementById('exampleText');
    const exampleMeaning = document.getElementById('exampleMeaning');
    exampleText.textContent = word.examples[0].text;
    exampleMeaning.textContent = word.examples[0].meaning;
    
    // 显示词组搭配
    const collocationsElement = document.getElementById('collocations');
    collocationsElement.innerHTML = '';
    word.collocations.forEach(collocation => {
        const collocationItem = document.createElement('div');
        collocationItem.className = 'collocation-item';
        collocationItem.innerHTML = `
            <span class="collocation-phrase">${collocation.phrase}</span>
            <span class="collocation-meaning">${collocation.meaning}</span>
        `;
        collocationsElement.appendChild(collocationItem);
    });
    
    // 显示派生词
    const derivativesElement = document.getElementById('derivatives');
    derivativesElement.innerHTML = '';
    word.derivatives.forEach(derivative => {
        const derivativeItem = document.createElement('div');
        derivativeItem.className = 'synonym-item';
        derivativeItem.innerHTML = `
            <div class="synonym-left">
                <div class="synonym-word" onclick="playPronunciation('${derivative}')">${derivative}
                    <span class="pronunciation-icon" onclick="playPronunciation('${derivative}')">🔊</span>
                </div>
                <div class="synonym-phonetic">${getPhonetic(derivative)}</div>
                <div class="synonym-meaning">${getDerivativeMeaning(derivative, word.meaning)}</div>
            </div>
        `;
        derivativesElement.appendChild(derivativeItem);
    });
    
    // 显示近义词
    const synonymsElement = document.getElementById('synonyms');
    synonymsElement.innerHTML = '';
    word.synonyms.forEach(synonym => {
        const synonymItem = document.createElement('div');
        synonymItem.className = 'synonym-item';
        synonymItem.innerHTML = `
            <div class="synonym-left">
                <div class="synonym-word" onclick="playPronunciation('${synonym.word}')">${synonym.word}
                    <span class="pronunciation-icon" onclick="playPronunciation('${synonym.word}')">🔊</span>
                </div>
                <div class="synonym-phonetic">${synonym.phonetic}</div>
                <div class="synonym-meaning">${synonym.meaning}</div>
            </div>
        `;
        synonymsElement.appendChild(synonymItem);
    });
    
    // 显示标签页中的词组搭配
    const collocationsTabElement = document.getElementById('collocationsTab');
    collocationsTabElement.innerHTML = '';
    word.collocations.forEach(collocation => {
        const collocationItem = document.createElement('div');
        collocationItem.className = 'synonym-item';
        collocationItem.innerHTML = `
            <div class="synonym-left">
                <div class="synonym-word" onclick="playPronunciation('${collocation.phrase}')">${collocation.phrase}
                    <span class="pronunciation-icon" onclick="playPronunciation('${collocation.phrase}')">🔊</span>
                </div>
                <div class="synonym-phonetic">${getPhonetic(collocation.phrase)}</div>
                <div class="synonym-meaning">${collocation.meaning}</div>
            </div>
        `;
        collocationsTabElement.appendChild(collocationItem);
    });
}

// 发音功能
function playPronunciation(text) {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        speechSynthesis.speak(utterance);
    } else {
        alert('您的浏览器不支持语音合成功能');
    }
}

// 更新统计数据
function updateStats() {
    document.getElementById('totalWords').textContent = learningStats.totalWords;
    document.getElementById('learnedWords').textContent = learningStats.learnedWords;
    document.getElementById('todayLearned').textContent = learningStats.todayLearned;
    document.getElementById('accuracy').textContent = `${learningStats.accuracy}%`;
    document.getElementById('streak').textContent = `${learningStats.streak}天`;
    
    // 更新进度条
    const progressPercentage = (learningStats.learnedWords / learningStats.totalWords) * 100;
    document.getElementById('progressFill').style.width = `${progressPercentage}%`;
    document.getElementById('progressText').textContent = `已学习 ${learningStats.learnedWords}/${learningStats.totalWords} 个单词`;
}

// 开始游戏
function startGame(mode) {
    gameMode = mode;
    gameScore = 0;
    selectedLetters = [];
    eliminatedWords = [];
    
    showSection('game');
    document.getElementById('score').textContent = `得分: ${gameScore}`;
    
    // 初始化游戏
    initGame();
}

// 初始化游戏
function initGame() {
    // 随机选择一个单词
    const randomIndex = Math.floor(Math.random() * words.length);
    const word = words[randomIndex];
    
    // 确保单词不在已消除列表中
    if (eliminatedWords.includes(word.word)) {
        initGame();
        return;
    }
    
    // 添加到已消除列表
    eliminatedWords.push(word.word);
    
    // 显示目标单词
    document.getElementById('targetWord').textContent = word.word;
    
    // 生成字母
    generateLetters(word.word);
    
    // 清空输入
    document.getElementById('wordInput').value = '';
}

// 生成字母
function generateLetters(word) {
    const lettersElement = document.getElementById('letters');
    lettersElement.innerHTML = '';
    
    // 打乱字母顺序
    const letters = word.split('').sort(() => Math.random() - 0.5);
    
    // 添加额外的干扰字母
    const extraLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(letter => !word.includes(letter));
    for (let i = 0; i < 6 - word.length; i++) {
        const randomIndex = Math.floor(Math.random() * extraLetters.length);
        letters.push(extraLetters[randomIndex]);
        extraLetters.splice(randomIndex, 1);
    }
    
    // 再次打乱
    letters.sort(() => Math.random() - 0.5);
    
    // 创建字母元素
    letters.forEach(letter => {
        const letterElement = document.createElement('div');
        letterElement.className = 'letter';
        letterElement.textContent = letter;
        letterElement.addEventListener('click', function() {
            selectLetter(this);
        });
        lettersElement.appendChild(letterElement);
    });
}

// 选择字母
function selectLetter(letterElement) {
    const letter = letterElement.textContent;
    
    // 如果字母已选中，取消选择
    if (letterElement.classList.contains('selected')) {
        letterElement.classList.remove('selected');
        const index = selectedLetters.indexOf(letter);
        if (index > -1) {
            selectedLetters.splice(index, 1);
        }
    } else {
        // 否则，选择字母
        letterElement.classList.add('selected');
        selectedLetters.push(letter);
    }
    
    // 更新输入框
    document.getElementById('wordInput').value = selectedLetters.join('');
}

// 检查单词
function checkWord() {
    const input = document.getElementById('wordInput').value;
    const targetWord = document.getElementById('targetWord').textContent;
    
    if (input === targetWord) {
        // 正确
        gameScore += 10;
        document.getElementById('score').textContent = `得分: ${gameScore}`;
        
        // 标记正确的字母
        document.querySelectorAll('.letter').forEach(letterElement => {
            if (targetWord.includes(letterElement.textContent)) {
                letterElement.classList.add('correct');
            } else {
                letterElement.classList.add('incorrect');
            }
        });
        
        // 延迟后开始新游戏
        setTimeout(() => {
            initGame();
        }, 1000);
    } else {
        // 错误
        alert('单词不正确，请再试一次！');
    }
}

// 打乱字母
function shuffleLetters() {
    const lettersElement = document.getElementById('letters');
    const letters = Array.from(lettersElement.children);
    
    // 打乱顺序
    letters.sort(() => Math.random() - 0.5);
    
    // 重新添加到容器
    lettersElement.innerHTML = '';
    letters.forEach(letterElement => {
        letterElement.classList.remove('selected', 'correct', 'incorrect');
        letterElement.addEventListener('click', function() {
            selectLetter(this);
        });
        lettersElement.appendChild(letterElement);
    });
    
    // 清空选择
    selectedLetters = [];
    document.getElementById('wordInput').value = '';
}

// 显示提示
function showHint() {
    const targetWord = document.getElementById('targetWord').textContent;
    const input = document.getElementById('wordInput').value;
    
    // 找到第一个缺失的字母
    for (let i = 0; i < targetWord.length; i++) {
        if (!input.includes(targetWord[i])) {
            // 高亮提示字母
            document.querySelectorAll('.letter').forEach(letterElement => {
                if (letterElement.textContent === targetWord[i] && !letterElement.classList.contains('selected')) {
                    letterElement.style.backgroundColor = 'var(--accent-color)';
                    letterElement.style.color = 'white';
                    
                    // 2秒后恢复
                    setTimeout(() => {
                        letterElement.style.backgroundColor = '';
                        letterElement.style.color = '';
                    }, 2000);
                    return;
                }
            });
            break;
        }
    }
}

// 重新开始游戏
function restartGame() {
    gameScore = 0;
    selectedLetters = [];
    eliminatedWords = [];
    
    document.getElementById('score').textContent = `得分: ${gameScore}`;
    initGame();
}

// 登录
function login() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    // 简单的登录验证
    if (username && password) {
        isLoggedIn = true;
        currentUser = username;
        alert('登录成功！');
        showSection('home');
    } else {
        document.getElementById('loginError').style.display = 'block';
    }
}

// 注册
function register() {
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    
    // 简单的注册验证
    if (username && password && password === confirmPassword) {
        isLoggedIn = true;
        currentUser = username;
        alert('注册成功！');
        showSection('home');
    } else {
        document.getElementById('registerError').style.display = 'block';
    }
}

// 主题切换
function toggleTheme() {
    isNightMode = !isNightMode;
    if (isNightMode) {
        document.body.classList.add('night-mode');
        document.getElementById('themeToggle').textContent = '☀️';
    } else {
        document.body.classList.remove('night-mode');
        document.getElementById('themeToggle').textContent = '🌙';
    }
}

// 页面加载完成后初始化
window.addEventListener('DOMContentLoaded', init);