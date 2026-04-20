(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
        return;
    }
    root.DictPreset = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const WORD_LISTS = {
        cet4: [
            'abandon', 'ability', 'able', 'abnormal', 'aboard', 'abroad', 'absence', 'absent',
            'absolute', 'absolutely', 'absorb', 'abstract', 'abundant', 'abuse', 'academic',
            'academy', 'accelerate', 'accent', 'accept', 'access', 'accident', 'accommodate'
        ],
        cet6: [
            'abandon', 'ability', 'able', 'abnormal', 'aboard', 'abroad', 'absence', 'absent',
            'absolute', 'absolutely', 'absorb', 'abstract', 'abundant', 'abuse', 'academic',
            'academy', 'accelerate', 'accent', 'accept', 'access', 'accident', 'accommodate',
            'accompany', 'accomplish', 'accord', 'account', 'accumulate', 'accuracy', 'accurate'
        ],
        kaoyan: [
            'abandon', 'ability', 'able', 'abnormal', 'aboard', 'abroad', 'absence', 'absent',
            'absolute', 'absolutely', 'absorb', 'abstract', 'abundant', 'abuse', 'academic',
            'academy', 'accelerate', 'accent', 'accept', 'access', 'accident', 'accommodate',
            'accompany', 'accomplish', 'accord', 'account', 'accumulate', 'accuracy', 'accurate',
            'accuse', 'achieve', 'acknowledge', 'acquire', 'acquisition', 'across', 'act'
        ],
        toefl: [
            'abandon', 'ability', 'able', 'abnormal', 'aboard', 'abroad', 'absence', 'absent',
            'absolute', 'absolutely', 'absorb', 'abstract', 'abundant', 'abuse', 'academic',
            'academy', 'accelerate', 'accent', 'accept', 'access', 'accident', 'accommodate',
            'accompany', 'accomplish', 'accord', 'account', 'accumulate', 'accuracy', 'accurate',
            'accuse', 'achieve', 'acknowledge', 'acquire', 'acquisition', 'across', 'act'
        ],
        ielts: [
            'abandon', 'ability', 'able', 'abnormal', 'aboard', 'abroad', 'absence', 'absent',
            'absolute', 'absolutely', 'absorb', 'abstract', 'abundant', 'abuse', 'academic',
            'academy', 'accelerate', 'accent', 'accept', 'access', 'accident', 'accommodate',
            'accompany', 'accomplish', 'accord', 'account', 'accumulate', 'accuracy', 'accurate'
        ],
        gre: [
            'abandon', 'ability', 'able', 'abnormal', 'aboard', 'abroad', 'absence', 'absent',
            'absolute', 'absolutely', 'absorb', 'abstract', 'abundant', 'abuse', 'academic',
            'academy', 'accelerate', 'accent', 'accept', 'access', 'accident', 'accommodate',
            'accompany', 'accomplish', 'accord', 'account', 'accumulate', 'accuracy', 'accurate',
            'accuse', 'achieve', 'acknowledge', 'acquire', 'acquisition', 'across', 'act'
        ],
        business: [
            'abandon', 'ability', 'able', 'abnormal', 'aboard', 'abroad', 'absence', 'absent',
            'absolute', 'absolutely', 'absorb', 'abstract', 'abundant', 'abuse', 'academic',
            'academy', 'accelerate', 'accent', 'accept', 'access', 'accident', 'accommodate'
        ]
    };

    function normalizeDictKey(selectedDict) {
        const id = String((selectedDict && selectedDict.id) || '').toLowerCase();
        const name = String((selectedDict && selectedDict.name) || '').toLowerCase();
        const url = String((selectedDict && selectedDict.url) || '').toLowerCase();

        if (url.includes('cet4') || id.includes('cet4') || name.includes('cet4')) return 'cet4';
        if (url.includes('cet6') || id.includes('cet6') || name.includes('cet6')) return 'cet6';
        if (url.includes('kaoyan') || id.includes('考研') || name.includes('考研')) return 'kaoyan';
        if (url.includes('toefl') || id.includes('托福') || name.includes('托福')) return 'toefl';
        if (url.includes('ielts') || id.includes('雅思') || name.includes('雅思')) return 'ielts';
        if (url.includes('gre') || id.includes('gre') || name.includes('gre')) return 'gre';
        if (url.includes('bec') || id.includes('商务') || name.includes('商务')) return 'business';
        return '';
    }

    function getPresetWordsForDict(selectedDict) {
        const key = normalizeDictKey(selectedDict);
        return key && WORD_LISTS[key] ? WORD_LISTS[key].slice() : [];
    }

    function buildPresetWordsData(words) {
        return (Array.isArray(words) ? words : []).map((word, index) => ({
            word,
            phonetic0: '',
            phonetic1: '',
            trans: [{ pos: 'n.', cn: '预设单词' }],
            sentences: [],
            phrases: [],
            synos: [],
            relWords: { root: String(word || '').slice(0, 3).toLowerCase(), rels: [] },
            etymology: [],
            _wordRank: index + 1
        }));
    }

    return {
        buildPresetWordsData,
        getPresetWordsForDict,
        normalizeDictKey
    };
});
