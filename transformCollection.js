
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

// Take the pre-request code, the request, and the post-request scripts (generally tests and
// assertions, but sometimes environment setting etc.)
const transformRequestToTest = async (item) => {
    // Utilities
    const getEventScriptByType = (evType) => {
        if (!item.event) {
            return '';
        }
        const ev = item.event.find(ev => ev.listen === evType);
        if (!ev) {
            return '';
        }
        return ev.script.exec.join('\n');
    }

    // "pre-request scripts"
    const preRequest = getEventScriptByType('prerequest');

    // request
    const req = await convertRequest(item.request);

    // "tests"
    const test = getEventScriptByType('test');

    return `it('${item.name}', async () => {\n${preRequest}\n${req}\n${test}\n});`;
};

const transformFolderToDescribe = async (item) => {
    const indent = '  ';
    return `
describe('${item.name}', async () => {
${indent}${(await Promise.all(item.item.map(transformItem))).join(`\n${indent}`)}
})`;
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
        if (item.event && item.event.some(ev => ev.script.exec.find(line => line !== ''))) {
            // TODO: handle these scenarios
            // At the time of writing this comment, it's likely the collection tree will be
            // representated as a tree of _Folder_/_Request_. When transforming this tree to tests,
            // it's likely a _Folder_ will transform to a `describe` block, and a _Request_ will
            // transform to a `it` block.
            // Therefore, handling the situation where a _Folder_ contains before/after scripts
            // will amount to producing that code as `.beforeAll` and `.afterAll` functions.
            throw new Error('Unhandled folder type with pre-request or test script');
        }
        return await transformFolderToDescribe(item);
    }
};

// const transformCollection = (coll) => transformItem(coll.item);

module.exports = {
    transformCollection: transformItem,
};
