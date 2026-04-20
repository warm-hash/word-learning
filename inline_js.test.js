const test = require('node:test');
const assert = require('node:assert/strict');

const { toLiteral } = require('./inline_js.js');

test('toLiteral returns a JavaScript string literal safe for inline handlers', () => {
    const literal = toLiteral('he said "hi" and it\'s ok');
    const roundTrip = Function(`return ${literal};`)();

    assert.equal(roundTrip, 'he said "hi" and it\'s ok');
    assert.equal(literal.startsWith('\''), true);
    assert.equal(literal.endsWith('\''), true);
});

test('toLiteral escapes backslashes and line separators', () => {
    const value = 'alpha\\\\beta\\nline';
    const literal = toLiteral(value);
    const roundTrip = Function(`return ${literal};`)();

    assert.equal(roundTrip, value);
});
