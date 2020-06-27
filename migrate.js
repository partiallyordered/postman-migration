
// TODO:
// - _When the non-leaf nodes do not contain code_ the test structure can be reproduced as
//    directories, or as `describe` blocks. This could probably be quite usefully configurable.
// - https://medium.com/airbnb-engineering/turbocharged-javascript-refactoring-with-codemods-b0cae8b326b9
// - https://github.com/facebook/jscodeshift
// - https://github.com/benjamn/recast
// - https://www.reaktor.com/blog/an-introduction-to-codemods/
// - https://github.com/cmstead/js-refactor
// - our tests use setTimeout variously- can we move most of that usage to the third parameter in
//   the `it` test block?
// - lint-fix?
// - jest serial mode
// - postman bundled libraries and "sandbox" API:
//   https://learning.postman.com/docs/postman/scripts/postman-sandbox-api-reference/
//   https://github.com/postmanlabs/postman-sandbox
//   https://github.com/postmanlabs/postman-runtime

const collection = require('../Golden_Path_Mowali.postman_collection.json');
const util = require('util');
const pp = (...args) => console.log(util.inspect(...args, { depth: Infinity, colors: true }));
const fs = require('fs').promises;

const items = {
    // Recurse into the structure to find
    // 1. leaf items without requests
    // 2. non-leaf items with requests
    //
    // 1. items with requests
    // 2. items without requests but with events
    // 3. 
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

const recurse = (item, path) => {
    if (item.event) {
        item.event.forEach(ev => {
            events.listen.add(ev.listen);
            events.types.add(ev.script.type)
        })
    }
    items.all.push({ item, path });
    if (!item.request && !item.item) {
        items.leafWithoutRequests.push({ item, path });
    }
    else if (item.item && item.request) {
        items.nonLeafWithRequest.push({ item, path });
    }
    else if (item.request && !item.item) {
        items.leafWithRequest.push({ item, path });
    }
    else if (!item.request && item.item) {
        items.nonLeafWithoutRequest.push({ item, path });
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
const transformToTest = ({ leafItemWithRequest: i }) => {

};

recurse({ ...collection, name: 'root' }, '');

console.log(Object.keys(items).map(k => `${k}: ${items[k].length}`));

// console.log(items.nonLeafWithoutRequest.map(i => `${i.path}.${i.item.name}`));
const itemWithEventsThat = f => i => i.item.event && i.item.event.some(f);
const eventThatExecs = ev => ev.script.exec.find(code => code !== '');
const itemWithEventsThatExec = itemWithEventsThat(eventThatExecs);
// non-leaf items with executing events (i.e. pre-request scripts, or post-request tests)
// none of these, phew
pp(items.nonLeafWithoutRequest.filter(itemWithEventsThatExec).length);
// leaf items with executing events (i.e. pre-request scripts, or post-request tests)
// "leaf items" are generally tests. They have some pre-request scripts that occur, and some
// post-request tests. Many assertions occur in these "executing events".
pp(items.leafWithRequest.filter(itemWithEventsThatExec).length);
// all of the items with executing events (i.e. pre-request scripts, or post-request tests)
// Luckily, this also turns out to be the same number as "leaf items" with "executing events".
pp(items.all.filter(itemWithEventsThatExec).length);
// All event types are in events.listen, all script tuypes are in events.types
pp(events);

pp(items.nonLeafWithoutRequest.find(i => i.item.name === 'feature-tests').item.name);
pp(items.leafWithRequest[0]);

(async () => {
    await createOrReplaceOutputDir('result');
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
