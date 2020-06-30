
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
// - lint-fix?
// - jest serial mode
// - postman bundled libraries and "sandbox" API:
//   https://learning.postman.com/docs/postman/scripts/postman-sandbox-api-reference/
//   https://github.com/postmanlabs/postman-sandbox
//   https://github.com/postmanlabs/postman-runtime
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
const recast = require('recast');

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
    const j = jscodeshift(src);
    fs.writeFile('./res.js', src); // don't need to await this

    // Check node equivalence. Useful for determining whether two variables have the same definition.
    // Next: write something to determine the lowest shared scope. Seems `path` types have a `.scope`
    // property.
    // Usage: astNodesAreEquivalent(path1.value, path2.value)
    const astNodesAreEquivalent = recast.types.astNodesAreEquivalent;

    // Print the source code of a given expression
    const summarise = (astValue) => {
        const getPos = (astValue) => `L${astValue.loc.start.line} C${astValue.loc.start.column}`;
        const { start, end } = astValue;
        return `[${getPos(astValue)}]: ${src.slice(start, end)}`;
    };

    // As long as this is true, we can implement pm.sendRequest in the sandbox
    const assertPmHttpRequestsAreAllPojos = () => {
        const getDeclarationForIdentifierMatching = (j, regex) => j
            .find(jscodeshift.VariableDeclarator)
            .filter((path) => path.value.id.type === 'Identifier') // TODO performance: probably always true, could be elided
            .filter((path) => path.value.id.name.match(regex));

        const callExpressionMatching = (regex) => (astPath) => {
            const { start, end } = astPath.value.callee;
            const call = src.slice(start, end);
            return call.match(regex); //new RegExp(`^${expression}$`))
        };

        const pmRequests = j.find(jscodeshift.CallExpression)
            .filter(callExpressionMatching(/^pm.sendRequest$/)); //getAllPmSendRequestRequestArguments(j);

        // All calls to pm.sendRequest have two arguments
        assert(pmRequests.every((path) => path.value.arguments.length === 2));

        const firstArgs = pmRequests.map((path) => path.get('arguments').get('0'));

        // The first argument is always type `Identifier`
        // I.e. the first argument is a variable name, not a string
        //   pm.sendRequest(requestToSimulator, ...)
        // NOT:
        //   pm.sendRequest('simulator', ...)
        assert(firstArgs.every((path) => path.value.type === 'Identifier'));

        // The identifier supplied in the first argument is always declared as a POJO
        // Note that this just checks _every_ instance of a declaration matching a given identifier
        // name. It doesn't actually check for the _specific_ instance of a declaration.
        // This means that the following would pass:
        //   let requestToSimulator = { what: 'ever' }
        //   pm.sendRequest(requestToSimulator, ...)
        // But this would fail, even though the variable is overwritten _after_ the call to
        // sendRequest:
        //   let requestToSimulator = { what: 'ever' }
        //   pm.sendRequest(requestToSimulator, ...)
        //   requestToSimulator = 'overwritten';
        // Luckily for us, it turns out that our tests don't overwrite variables like this, because
        // that would make this exercise more difficult.
        assert(firstArgs.every((path) =>
            getDeclarationForIdentifierMatching(j, /^path.name$/).every((path) =>
                path.value.init.type === 'ObjectExpression'
            )));
    };
    assertPmHttpRequestsAreAllPojos();

    // TODO: transformations:
    // 1. Replace the _hilarious_ presence of jrsassign in (1) the environment and (2) the code
    // 2. Replace all usage of eval..
    // 3. Identify pm.environment.get and pm.environment.set calls, and their scope, then declare
    //    variables at an appropriate level (or don't and manually evaluate this stuff)
    // 4. Identify pm.variables.get/set and create those variables with an appropriate scope in the
    //    code.
    // 5. Transform usages of setTimeout where it's the last call made in a given test. We can move
    //    most of that usage to the third parameter in the `it` test block? E.g.
    //    https://github.com/facebook/jest/issues/5055
    // 6. Replace (some?) duplicated string values with variables. Might require analysis on a
    //    case-by-case basis.

    // Example:
    // Demonstrate that both declarations of `testfsp3GetStatusRequest` are equivalent (i.e.
    // copy-pasted)
    // const decs = getDeclarationForIdentifierMatching(j, /^testfsp3GetStatusRequest$/);
    // const nodes = decs.nodes();
    // pp(nodes.length);
    // pp(astNodesAreEquivalent(nodes[0], nodes[1]));

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
