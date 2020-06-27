
// TODO:
// - _When the non-leaf nodes do not contain code_ the test structure can be reproduced as
//    directories, or as `describe` blocks. This could probably be quite usefully configurable.
// - Automatic rewriting:
//   - https://github.com/facebook/jscodeshift
//   - https://medium.com/airbnb-engineering/turbocharged-javascript-refactoring-with-codemods-b0cae8b326b9
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
const pp = (...args) => console.log(util.inspect(...args, { depth: 2, colors: true }));
const fs = require('fs').promises;
const jscodeshift = require('jscodeshift');
const { transformCollection } = require('./transformCollection');

const preamble = `
const axios = require('axios');
const uuid = require('uuid');
const { createPmSandbox } = require('./pm');
const pm = createPmSandbox({});
const pmEnv = require('../environments/Casa-DEV.postman_environment.json')
    .values
    .filter(v => v.enabled);
pmEnv.forEach(({ key, value }) => pm.environment.set(key, value));
`;

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

recurse({ ...collection, name: 'root' }, '');

const createOrReplaceOutputDir = async (name) => {
    await fs.rmdir(name, { recursive: true }).catch(() => {}); // ignore error
    await fs.mkdir(name);
};

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
    // TODO:
    // - replace variables i.e. '{{HOST_CENTRAL_LEDGER}}' in requests with references to
    //   `pm.environment` or `pm.variables` or whatever's appropriate.
    // - remove trailing whitespace
    // - hoist (remove?) all `require` statements (might be a job for `eslint --fix`)

    // console.log(generateTestFile());
    // await createOrReplaceOutputDir('result');
    // console.log(items.leafWithRequest[0]);
    // const src = await transformToTest(items.leafWithRequest[0]);

    // We should consider performing some transformations before code generation, because it might
    // be easier to identify duplicated functionality manually. Consider, for example, identifying
    // a collection item called 'Deposit Funds in Settlement Account - testfsp3'.
    // This should in fact be relatively easy with source code transformation, and in fact we want
    // to transform the resulting code. However, we could just clean-slate replace that code in the
    // original collection item.
    // Anyway... start with source code transformation, but keep in mind transformation of the
    // collection before code generation.
    const src = await transformCollection(collection);
    await fs.writeFile('./res.js', src);
    // console.log(src);
    const result = jscodeshift(src)
        .find(jscodeshift.CallExpression)
        // .at(0)
        .forEach((path) => {
            // Produces the function name when it's a single function, i.e. `Number(args)`.
            // Doesn't work when it's a MemberExpression, i.e. `uuid.v4(args)`.
            // pp(path.value.callee.loc.identifierName);

            // Produces the MemberExpression when it's a object.property, i.e. `uuid.v4(args)`
            // Doesn't work when it's a more nested MemberExpression, i.e. `pm.environment.set`.
            // pp(`${path.value.callee.object.name}.${path.value.callee.property.name}`);

            // Produces the correct value in all scenarios
            const { start, end } = path.value.callee;
            // pp(src.slice(start, end));
            // pp(path.value);
        })
        .toSource();
    // const result = jscodeshift(src)
    //     .find(jscodeshift.Identifier)
    //     // .filter((path) => (path.value.name === 'get'))
    //     .filter((path) => (path.value.name === 'get' && path.parent.value.type === 'MemberExpression'))
    //     .at(0)
    //     .map((path) => {
    //         pp(path.value.name);
    //         pp(path.parent);
    //         // pp(path.parent.value);
    //         // pp(path.parent.value.object.object.name);
    //         // pp(path.parent.value);
    //         // path.value.name = 'HAHAHAHAHA';
    //         // console.log(path.parentPath.value);
    //         // Identifier name:
    //         // console.log(path.value.name);
    //     })
    //     .toSource();
    // console.log(result);
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
