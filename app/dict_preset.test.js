const test = require('node:test');
const assert = require('node:assert/strict');

const { getPresetWordsForDict, buildPresetWordsData } = require('./dict_preset.js');

test('maps built-in dictionaries by url instead of falling back blindly', () => {
    const kaoyanWords = getPresetWordsForDict({
        id: '考研词汇',
        name: '考研词汇',
        url: 'KAOYAN_MERGED.json'
    });

    assert.equal(Array.isArray(kaoyanWords), true);
    assert.equal(kaoyanWords.includes('act'), true);
    assert.equal(kaoyanWords.includes('abandon'), true);
});

test('returns no preset words for unknown dictionaries', () => {
    const unknownWords = getPresetWordsForDict({
        id: 'custom-dict',
        name: 'Custom Dict',
        url: 'custom.json'
    });

    assert.deepEqual(unknownWords, []);
});

test('buildPresetWordsData returns normalized words usable by the practice flow', () => {
    const [word] = buildPresetWordsData(['abandon']);

    assert.equal(word.word, 'abandon');
    assert.deepEqual(word.trans, [{ pos: 'n.', cn: '预设单词' }]);
    assert.deepEqual(word.sentences, []);
    assert.deepEqual(word.phrases, []);
    assert.deepEqual(word.synos, []);
    assert.deepEqual(word.relWords, { root: 'aba', rels: [] });
    assert.deepEqual(word.etymology, []);
});
