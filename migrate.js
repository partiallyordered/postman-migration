
// TODO:
// - _When the non-leaf nodes do not contain code_ the test structure can be reproduced as
//    directories, or as `describe` blocks. This could probably be quite usefully configurable.
// - Automatic rewriting:
//   - https://medium.com/airbnb-engineering/turbocharged-javascript-refactoring-with-codemods-b0cae8b326b9
//   - https://github.com/facebook/jscodeshift
//   - https://github.com/benjamn/recast
//   - https://www.reaktor.com/blog/an-introduction-to-codemods/
//   - https://github.com/cmstead/js-refactor
//   - https://www.toptal.com/javascript/write-code-to-rewrite-your-code
//   - https://slacker.ro/2019/04/04/automating-the-migration-of-lodash-to-lodash-es-in-a-large-codebase-with-jscodeshift/
//   - https://skovy.dev/jscodeshift-custom-transform/
// - our tests use setTimeout variously- can we move most of that usage to the third parameter in
//   the `it` test block? E.g. https://github.com/facebook/jest/issues/5055
// - lint-fix?
// - jest serial mode
// - postman bundled libraries and "sandbox" API:
//   https://learning.postman.com/docs/postman/scripts/postman-sandbox-api-reference/
//   https://github.com/postmanlabs/postman-sandbox
//   https://github.com/postmanlabs/postman-runtime
// - replace the _hilarious_ presence of jrsassign in (1) the environment and (2) the code
// - replace all usage of eval..

const collection = require('../Golden_Path_Mowali.postman_collection.json');
const util = require('util');
const pp = (...args) => console.log(util.inspect(...args, { depth: Infinity, colors: true }));
const fs = require('fs').promises;
const sdk = require('postman-collection');
const generateTestFile = require('./generateTestFile');

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
    return util.promisify(requestCodeGen.convert)(pmRequest, opts);
};

const items = {
    leafWithoutRequests: [],
    nonLeafWithRequest: [],
    leafWithRequest: [],
    nonLeafWithoutRequest: [],

    all: [],
};

const events = {
    listen: new Set(),
    types: new Set(),
};

const types = {
    folder: 'folder',
    request: 'request,'
};

const recurse = (item, path) => {
    // TODO: is this still used?
    if (item.event) {
        item.event.forEach(ev => {
            events.listen.add(ev.listen);
            events.types.add(ev.script.type)
        });
    }
    items.all.push({ item, path });
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
        items.leafWithRequest.push({ type: types.request, data: item, path });
    }
    else if (!item.request && item.item) {
        items.nonLeafWithoutRequest.push({ type: types.folder, data: item, path });
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
    }
    if (item.item) {
        item.item.forEach(i => recurse(i, `${path}.${item.name}`));
    }
};

const createOrReplaceOutputDir = async (name) => {
    await fs.rmdir(name, { recursive: true }).catch(() => {}); // ignore error
    await fs.mkdir(name);
};

// Take the pre-request code, the request, and the post-request scripts (generally tests and
// assertions, but sometimes environment setting etc.)
const transformToTest = async ({ data: d }) => {
    // TODO:
    // - replace variables i.e. '{{HOST_CENTRAL_LEDGER}}' in requests with references to
    //   `pm.environment` or `pm.variables` or whatever's appropriate.
    // - remove trailing whitespace
    // - hoist (remove?) all `require` statements (might be a job for `eslint --fix`)

    // Utilities
    const getEventScriptByType = (evType) => d.event.find(ev => ev.listen === evType).script.exec.join('\n');

    // "pre-request scripts"
    const preRequest = getEventScriptByType('prerequest');

    // request
    const req = await convertRequest(d.request);

    // "tests"
    const test = getEventScriptByType('test');

    return `${preRequest}\n${req}\n${test}`;
};

recurse({ ...collection, name: 'root' }, '');

// Print counts of the various categories of node
// console.log(Object.keys(items).map(k => `${k}: ${items[k].length}`));

// console.log(items.nonLeafWithoutRequest.map(i => `${i.path}.${i.item.name}`));
const itemWithEventsThat = f => i => i.data.event && i.data.event.some(f);
const eventThatExecs = ev => ev.script.exec.find(code => code !== '');
const itemWithEventsThatExec = itemWithEventsThat(eventThatExecs);

// non-leaf items with executing events (i.e. pre-request scripts, or post-request tests)
// none of these, phew
// pp(items.nonLeafWithoutRequest.filter(itemWithEventsThatExec).length);

// leaf items with executing events (i.e. pre-request scripts, or post-request tests)
// "leaf items" are generally tests. They have some pre-request scripts that occur, and some
// post-request tests. Many assertions occur in these "executing events".
// pp(items.leafWithRequest.filter(itemWithEventsThatExec).length);

// all of the items with executing events (i.e. pre-request scripts, or post-request tests)
// Luckily, this also turns out to be the same number as "leaf items" with "executing events".
// pp(items.all.filter(itemWithEventsThatExec).length);

// All event types are in events.listen, all script tuypes are in events.types
// pp(events);

// pp(items.nonLeafWithoutRequest.find(i => i.data.name === 'feature-tests').data.name);
// pp(items.leafWithRequest[0].data.request);
// pp(requestCodeGen.getLanguageList());

(async () => {
    console.log(generateTestFile());
    // await createOrReplaceOutputDir('result');
    // console.log(items.leafWithRequest[0]);
    // console.log(await transformToTest(items.leafWithRequest[0]));
})();

// Current thinking:
// - _all_ requests can be categorised as follows (thank goodness):
//   - non-leaf items that do not have any scripts associated with them
//   - leaf items that have requests and executable scripts associated with them

// TODO
// - What is this?
//   "protocolProfileBehavior": {
//     "disableBodyPruning": true
//   }
//   Docs say:
//   Protocol Profile Behavior
//   Set of configurations used to alter the usual behavior of sending the request
//   https://schema.getpostman.com/collection/json/v2.1.0/draft-07/docs/index.html
