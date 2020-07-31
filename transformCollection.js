
const { promisify } = require('util');
const sdk = require('postman-collection');

const requestCodeGen = require('./axios-requestgen');
const convertRequest = async (req) => {
    const pmRequest = new sdk.Request(req);
    const opts = {
        trimRequestBody: true,
        followRedirect: true,
        ES6_enabled: true,
        requireAxiosLib: false,
        // requestTimeout: 2000,
    };
    return promisify(requestCodeGen.convert)(pmRequest, opts);
};

// Utilities
const EV_TYPE = {
    prerequest: 'prerequest',
    test: 'test',
};
const getEventScriptByType = (item, evType) => {
    if (!item.event) {
        return '';
    }
    const ev = item.event.find(ev => ev.listen === evType);
    if (!ev) {
        return '';
    }
    return ev.script.exec.join('\n');
}

// Take the pre-request code, the request, and the post-request scripts (generally tests and
// assertions, but sometimes environment setting etc.)
const transformRequestToTest = async (item) => {
    // "pre-request scripts"
    const preRequest = getEventScriptByType(item, EV_TYPE.prerequest);

    // request
    const req = await convertRequest(item.request);

    // "tests"
    const test = getEventScriptByType(item, EV_TYPE.test);

    // filter empty items and join with line breaks
    const code = [preRequest, req, test].filter((el) => el !== '').join('\n');

    return `it('${item.name}', async () => {\n${code}\n});`;
};

const transformFolderToDescribe = async (item) => {
    const indent = '  ';
    const beforeAll = getEventScriptByType(item, EV_TYPE.prerequest);
    const tests = (await Promise.all(item.item.map(transformItem))).join(`\n${indent}`)
    const afterAll = getEventScriptByType(item, EV_TYPE.test);
    return [
        `describe('${item.name}', () => {`,
        beforeAll !== ''
            ? [
                `${indent}beforeAll(async () => {`,
                `${indent}${indent}${beforeAll}`,
                `${indent}})`,
            ].join('\n')
            : null,
        afterAll !== ''
            ? [
                `${indent}afterAll(async () => {`,
                `${indent}${indent}${afterAll}`,
                `${indent}})`,
            ].join('\n')
            : null,
        `${indent}${tests}`,
        `});`,
    ].filter(el => el !== null).join('\n');
};

const transformItem = async (item) => {
    if (!item.request && !item.item) {
        // https://schema.getpostman.com/collection/json/v2.1.0/draft-07/docs/index.html
        throw new Error('Impossible item type with no request and no child');
        // items.leafWithoutRequests.push({ data: item, path });
    }
    else if (item.item && item.request) {
        // https://schema.getpostman.com/collection/json/v2.1.0/draft-07/docs/index.html
        throw new Error('Impossible item type with a request and children');
        // items.nonLeafWithRequest.push({ data: item, path });
    }
    else if (item.request && !item.item) {
        return await transformRequestToTest(item);
    }
    else if (!item.request && item.item) {
        return await transformFolderToDescribe(item);
    }
};

module.exports = {
    transformCollection: transformItem,
};
