const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getStageTitle,
    initializePracticeState,
    applyPracticeAttempt,
    switchToNextStage
} = require('./practice_flow.js');

function makeWords() {
    return [{ word: 'alpha' }, { word: 'beta' }];
}

test('initializePracticeState starts at stage 1 and clears all per-stage flags', () => {
    const input = [
        { word: 'alpha', stage1Complete: true, stage2Complete: true, stage3Complete: true },
        { word: 'beta', stage1Complete: true }
    ];

    const state = initializePracticeState(input);

    assert.equal(state.currentMemoryStage, 1);
    assert.equal(state.currentWordIndex, 0);
    assert.deepEqual(
        state.words.map(word => ({
            word: word.word,
            stage1Complete: word.stage1Complete,
            stage2Complete: word.stage2Complete,
            stage3Complete: word.stage3Complete
        })),
        [
            { word: 'alpha', stage1Complete: false, stage2Complete: false, stage3Complete: false },
            { word: 'beta', stage1Complete: false, stage2Complete: false, stage3Complete: false }
        ]
    );
});

test('applyPracticeAttempt keeps the current word and stage when the answer is wrong', () => {
    const state = initializePracticeState(makeWords());

    const result = applyPracticeAttempt(state, { isCorrect: false });

    assert.equal(result.action, 'retry');
    assert.equal(result.state.currentMemoryStage, 1);
    assert.equal(result.state.currentWordIndex, 0);
    assert.equal(result.state.words[0].stage1Complete, false);
});

test('stage 1 overflow triggers switchToNextStage and resets to the first word of stage 2', () => {
    let state = initializePracticeState(makeWords());

    let result = applyPracticeAttempt(state, { isCorrect: true });
    assert.equal(result.action, 'next_word');
    assert.equal(result.state.currentWordIndex, 1);
    assert.equal(result.state.words[0].stage1Complete, true);

    state = result.state;
    result = applyPracticeAttempt(state, { isCorrect: true });

    assert.equal(result.action, 'next_stage');
    assert.equal(result.state.currentMemoryStage, 1);
    assert.equal(result.state.currentWordIndex, 2);
    assert.equal(result.state.words[1].stage1Complete, true);

    state = switchToNextStage(result.state);
    assert.equal(state.currentMemoryStage, 2);
    assert.equal(state.currentWordIndex, 0);
    assert.equal(getStageTitle(state.currentMemoryStage), '第二阶段（4选1释义）');
});

test('stage 2 overflow advances to stage 3 and stage 3 overflow completes practice', () => {
    let state = initializePracticeState(makeWords());

    for (let i = 0; i < 2; i += 1) {
        state = applyPracticeAttempt(state, { isCorrect: true }).state;
    }
    state = switchToNextStage(state);

    for (let i = 0; i < 2; i += 1) {
        state = applyPracticeAttempt(state, { isCorrect: true }).state;
    }
    assert.equal(state.currentWordIndex, 2);
    state = switchToNextStage(state);

    let result = applyPracticeAttempt(state, { isCorrect: true });
    assert.equal(result.action, 'next_word');
    state = result.state;

    result = applyPracticeAttempt(state, { isCorrect: true });
    assert.equal(result.action, 'complete');
    assert.equal(result.state.currentMemoryStage, 3);
    assert.equal(result.state.currentWordIndex, 2);
    assert.equal(result.state.words.every(word => word.stage3Complete), true);
});
