
const collection = require('./Golden_Path_Mowali.postman_collection.json');

// console.log(Object.keys(collection.item[0]));
// console.log(collection.item[0]);
// console.log()

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
    withRequests: [],
    withoutRequestsWithEvents: [],
};

const recurse = (item, path) => {
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

recurse({ ...collection, name: 'root' }, '');

console.log(Object.keys(items).map(k => `${k}: ${items[k].length}`));

// console.log(items.nonLeafWithoutRequest.map(i => `${i.path}.${i.item.name}`));
console.log(items.nonLeafWithoutRequest.filter(i => i.item.event).length)

// TODO
// - What is this?
//   "protocolProfileBehavior": {
//     "disableBodyPruning": true
//   }
//   Docs say:
//   Protocol Profile Behavior
//   Set of configurations used to alter the usual behavior of sending the request
//   https://schema.getpostman.com/collection/json/v2.1.0/draft-07/docs/index.html
