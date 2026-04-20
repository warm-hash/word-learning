(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
        return;
    }
    root.PracticeFlow = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const STAGE_TITLES = {
        1: '第一阶段（例句填空）',
        2: '第二阶段（4选1释义）',
        3: '第三阶段（纯拼写）'
    };

    function resetWordStageFlags(word) {
        return {
            ...word,
            stage1Complete: false,
            stage2Complete: false,
            stage3Complete: false
        };
    }

    function normalizeWords(words) {
        return Array.isArray(words) ? words.map(resetWordStageFlags) : [];
    }

    function initializePracticeState(words) {
        return {
            words: normalizeWords(words),
            currentMemoryStage: 1,
            currentWordIndex: 0
        };
    }

    function markCurrentStageComplete(word, stage) {
        if (!word) return word;

        const nextWord = { ...word };
        if (stage === 1) nextWord.stage1Complete = true;
        if (stage === 2) nextWord.stage2Complete = true;
        if (stage === 3) nextWord.stage3Complete = true;
        return nextWord;
    }

    function applyPracticeAttempt(state, attempt) {
        if (!state || !Array.isArray(state.words) || state.words.length === 0) {
            return {
                action: 'empty',
                state: {
                    words: [],
                    currentMemoryStage: 1,
                    currentWordIndex: 0
                }
            };
        }

        if (!attempt || attempt.isCorrect !== true) {
            return {
                action: 'retry',
                state: {
                    words: state.words.slice(),
                    currentMemoryStage: state.currentMemoryStage,
                    currentWordIndex: state.currentWordIndex
                }
            };
        }

        const words = state.words.slice();
        const index = state.currentWordIndex;
        words[index] = markCurrentStageComplete(words[index], state.currentMemoryStage);

        const nextIndex = index + 1;
        if (nextIndex >= words.length) {
            return {
                action: state.currentMemoryStage >= 3 ? 'complete' : 'next_stage',
                state: {
                    words,
                    currentMemoryStage: state.currentMemoryStage,
                    currentWordIndex: nextIndex
                }
            };
        }

        return {
            action: 'next_word',
            state: {
                words,
                currentMemoryStage: state.currentMemoryStage,
                currentWordIndex: nextIndex
            }
        };
    }

    function switchToNextStage(state) {
        return {
            words: Array.isArray(state && state.words) ? state.words.slice() : [],
            currentMemoryStage: Math.min(3, ((state && state.currentMemoryStage) || 1) + 1),
            currentWordIndex: 0
        };
    }

    function getStageTitle(stage) {
        return STAGE_TITLES[stage] || STAGE_TITLES[1];
    }

    return {
        STAGE_TITLES,
        applyPracticeAttempt,
        getStageTitle,
        initializePracticeState,
        switchToNextStage
    };
});
