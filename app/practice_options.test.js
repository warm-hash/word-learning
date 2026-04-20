const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDefinitionOptions } = require('./practice_options.js');

test('buildDefinitionOptions returns four options even when every word has the same definition', () => {
    const practiceWords = [
        { word: 'alpha', trans: [{ pos: 'n.', cn: '预设单词' }] },
        { word: 'beta', trans: [{ pos: 'n.', cn: '预设单词' }] },
        { word: 'gamma', trans: [{ pos: 'n.', cn: '预设单词' }] }
    ];

    const result = buildDefinitionOptions(practiceWords[0], practiceWords);

    assert.equal(result.correctDefinition, '预设单词');
    assert.equal(result.options.length, 4);
    assert.equal(new Set(result.options).size, 4);
    assert.equal(result.options.includes('预设单词'), true);
});

test('buildDefinitionOptions handles tiny batches without hanging', () => {
    const practiceWords = [{ word: 'solo', trans: [{ pos: 'n.', cn: '单人释义' }] }];

    const result = buildDefinitionOptions(practiceWords[0], practiceWords);

    assert.equal(result.options.length, 4);
    assert.equal(result.options.includes('单人释义'), true);
});
