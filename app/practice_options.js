(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
        return;
    }
    root.PracticeOptions = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function getDefinitionText(word) {
        if (!word || !Array.isArray(word.trans) || word.trans.length === 0) {
            return '暂无释义';
        }

        const text = String(word.trans[0].cn || '').trim();
        return text || '暂无释义';
    }

    function pushUniqueOption(options, seen, value) {
        const text = String(value || '').trim();
        if (!text || seen.has(text)) return false;
        seen.add(text);
        options.push(text);
        return true;
    }

    function buildDefinitionOptions(currentWord, practiceWords, desiredCount = 4) {
        const correctDefinition = getDefinitionText(currentWord);
        const options = [];
        const seen = new Set();

        pushUniqueOption(options, seen, correctDefinition);

        for (const word of Array.isArray(practiceWords) ? practiceWords : []) {
            if (options.length >= desiredCount) break;
            if (!word || word === currentWord) continue;
            pushUniqueOption(options, seen, getDefinitionText(word));
        }

        let fillerIndex = 1;
        while (options.length < desiredCount) {
            pushUniqueOption(options, seen, `备选释义 ${fillerIndex}`);
            fillerIndex += 1;
        }

        for (let i = options.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [options[i], options[j]] = [options[j], options[i]];
        }

        return {
            correctDefinition,
            options
        };
    }

    return {
        buildDefinitionOptions,
        getDefinitionText
    };
});
