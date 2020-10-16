
const assert = require('assert').strict;
const sdk = require('postman-collection');

const requestCodeGen = require('./axios-requestgen');
const convertRequest = (req) => {
    const pmRequest = new sdk.Request(req);
    const opts = {
        trimRequestBody: true,
        followRedirect: true,
        ES6_enabled: true,
        requireAxiosLib: false,
        // requestTimeout: 2000,
    };
    return requestCodeGen.convert(pmRequest, opts);
};

const indentPrefix = (indentStr, count) => Array.from({ length: count }, () => indentStr).join('');
const indent = (str, indentStr, count) =>
    str.replace(/^/, indentPrefix(indentStr, count));

const getEventScriptByType = (item, evType) => {
    if (!item.event) {
        return '';
    }
    const ev = item.event.find(ev => ev.listen === evType);
    if (!ev) {
        return '';
    }
    return ev.script.exec.join('\n');
};

// Take the pre-request code, the request, and the post-request scripts (generally tests and
// assertions, but sometimes environment setting etc.)
const transformRequestToTest = (item) => {
    // "pre-request scripts"
    const preRequest = getEventScriptByType(item, 'prerequest');

    // request
    const req = convertRequest(item.request);

    // "tests"
    const test = getEventScriptByType(item, 'test');

    return `it('${item.name}', async () => {\n${preRequest}\n${req}\n${test}\n});`;
};

const transformFolderToDescribe = (item) => {
    // https://learning.postman.com/docs/writing-scripts/pre-request-scripts/#re-using-pre-request-scripts
    // > You can add pre-request scripts to entire collections as well as to folders within
    // > collections. In both cases, your pre-request script will run before every request in the
    // > collection or folder.
    const preRequestScripts = getEventScriptByType(item, 'prerequest');
    const beforeEach = preRequestScripts === '' ? '' : `beforeEach(async () => {\n${preRequestScripts}\n});`;
    const testScripts = getEventScriptByType(item, 'test');
    const afterEach = testScripts === '' ? '' : `afterEach(async () => {\n${preRequestScripts}\n});`;
    const tests = item.item.map(transformItem);
    return `
describe('${item.name}', () => {
${beforeEach}\n\n
${afterEach}\n\n
${tests.join(`\n`)}\n
});`;
};

const transformItem = (item) => {
    // https://schema.getpostman.com/collection/json/v2.1.0/draft-07/docs/index.html
    assert(!(!item.request && !item.item), 'Impossible item type with no request and no child');
    assert(!(item.item && item.request), 'Impossible item type with a request and children');
    if (item.request && !item.item) {
        return transformRequestToTest(item);
    }
    else if (!item.request && item.item) {
        // if (item.event && item.event.some(ev => ev.script.exec.find(line => line !== ''))) {
        //     // TODO: handle folders with pre-request or test scripts.
        //     // At the time of writing this comment, it's likely the collection tree will be
        //     // representated as a tree of _Folder_/_Request_. When transforming this tree to tests,
        //     // it's likely a _Folder_ will transform to a `describe` block, and a _Request_ will
        //     // transform to a `it` block.
        //     // Therefore, handling the situation where a _Folder_ contains before/after scripts
        //     // will amount to producing that code as `.beforeEach` and `.afterEach` functions.
        //     throw new Error('Unhandled folder type with pre-request or test script');
        // }
        return transformFolderToDescribe(item);
    }
    throw new Error('Unhandled item type');
};

module.exports = {
    transformCollection: transformItem,
    convertRequest,
};
