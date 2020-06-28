
const collection = require('../Golden_Path_Mowali.postman_collection.json');
const util = require('util');
const jscodeshift = require('jscodeshift');
const { transformCollection } = require('./transformCollection');
const pp = (...args) => console.log(util.inspect(...args, { depth: 2, colors: true }));

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

