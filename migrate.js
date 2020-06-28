
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
// - figure out how it's easiest to run a single test in jest. Is there a UI that lets you run a
//   single spec/describe block? `jest -t` could enable this.
// - What is this?
//   "protocolProfileBehavior": {
//     "disableBodyPruning": true
//   }
//   Docs say:
//   Protocol Profile Behavior
//   Set of configurations used to alter the usual behavior of sending the request
//   https://schema.getpostman.com/collection/json/v2.1.0/draft-07/docs/index.html

const collection = require('../Golden_Path_Mowali.postman_collection.json');
const util = require('util');
const pp = (...args) => console.log(util.inspect(...args, { depth: 2, colors: true }));
const fs = require('fs').promises;
const jscodeshift = require('jscodeshift');
const { transformCollection, convertRequest } = require('./transformCollection');
const assert = require('assert').strict;

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

const createOrReplaceOutputDir = async (name) => {
    await fs.rmdir(name, { recursive: true }).catch(() => {}); // ignore error
    await fs.mkdir(name);
};

(async () => {
    // TODO:
    // - replace variables i.e. '{{HOST_CENTRAL_LEDGER}}' in requests with references to
    //   `pm.environment` or `pm.variables` or whatever's appropriate.
    // - remove trailing whitespace
    // - hoist (remove?) all `require` statements (might be a job for `eslint --fix`)
    // - convert all pm.sendRequest to axios using convertRequest

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
    // await fs.writeFile('./res.js', src);
    // console.log(src);
    const summarise = (astValue) => {
        const getPos = (astValue) => `L${astValue.loc.start.line} C${astValue.loc.start.column}`;
        const { start, end } = astValue;
        return `[${getPos(astValue)}]: ${src.slice(start, end)}`;
    };
    const callExpressionMatching = (expression) => (astPath) => {
        const { start, end } = astPath.value.callee;
        const call = src.slice(start, end);
        return call.match(expression); //new RegExp(`^${expression}$`))
    };
    const getAllPmSendRequest = () => {
        const result = jscodeshift(src)
            .find(jscodeshift.CallExpression)
            .filter(callExpressionMatching(/^pm.sendRequest$/))
            .at(0)
            .forEach((path) => {
                // Produces the function name when it's a single function, i.e. `Number(args)`.
                // Doesn't work when it's a MemberExpression, i.e. `uuid.v4(args)`.
                // pp(path.value.callee.loc.identifierName);

                // Produces the MemberExpression when it's a object.property, i.e. `uuid.v4(args)`
                // Doesn't work when it's a more nested MemberExpression, i.e. `pm.environment.set`.
                // pp(`${path.value.callee.object.name}.${path.value.callee.property.name}`);

                // Produces the correct value in all scenarios
                // const { start, end } = path.value.callee;
                // pp(`[${start}, ${end}]: ${src.slice(start, end)}`);

                // const getPos = (path) => path.value.loc.start
                // Produces the correct value in all scenarios
                pp(summarise(path.value));
                assert(path.value.arguments.length === 2);
                const identifiers = path.value.arguments.filter((arg) => arg.type === 'Identifier');
                // Is there always an identifier? Is it sometimes a string?
                assert(identifiers.length === 1);
                pp(identifiers[0]);
                pp(summarise(identifiers[0]));
                // pp(path.value.arguments);
                // pp(summarise(path.parent));
                // pp(path.parent);
                // pp(path.value);
            })
            .toSource();
    };
    const getNodeDefinition = (astPath) => {

    };
    getAllPmSendRequest();
    await fs.writeFile('./res.js', src);
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
