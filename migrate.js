
// TODO:
// - How to verify the transformation is correct?
//   - Count assertions?
//   - Count tests (i.e. `it` blocks)?
//   - Run tests
// - _Create files_. The current file is way too big to run practically. Note that ast-types has a
//    fileBuilder. This might be useful. (At the time of writing, I know nothing about it beyond
//    its existence).
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
// - Document that the produced output must be run with "jest": { "testEnvironment": "node" } set
//   in package.json.
//   This is because: https://stackoverflow.com/a/42678578
//   Solution: https://stackoverflow.com/a/44366115
// - Note the way that pm.test produces structure in the test output. Does/can jest do this in its
//   structured or html output?
// - is the environment persisted to the environment json file after a test run? Do we care?
// - comments: https://gitter.im/benjamn/recast?at=56b3e93625142e764dfd0615
// - set a request timeout (axios parameter)
// - set a per-test timeout (jest parameter)
// - better handle axios request errors?
// - Only print a whole load of shit when the test fails? Not when it succeeds? Or can Jest handle
//   output more cleverly, structuring it per-test or something?
// - Tidy up environment file. Consider rewriting it as part of this transform code.
//    - get rid of jsrsassign [sic]
// - Add messages to every assert in this file
// - Automatic eslint pass afterward. Let user supply eslint config? (At least don't have it set
//   globally by this module?)

// Notes:
// - Jest execution order:
//   https://jestjs.io/docs/en/setup-teardown#order-of-execution-of-describe-and-test-blocks

const collection = require('../Golden_Path_Mowali.postman_collection.json');
const util = require('util');
const fs = require('fs').promises;
const jsc = require('jscodeshift');
const { transformCollection, convertRequest } = require('./transformCollection');
const assert = require('assert').strict;
// Whitelist these environment variables. Add to this array are variables that are set dynamically,
// for example:
//     pm.environment.set(someVariableContainingAValue, someData);
// more specifically:
//     const result = pm.sendRequest('blah');
//     pm.environment.set(result.json().key, result.json().value);
// You might identify these variables as being printed by the "transformation"
// `notifyUnreplacedVariables`. I.e. when you run this script, a message may be printed indicating
// there are unreplaced environment or local variables. You may search your source code and find
// that those are set dynamically, then add them to this array.
//
// If you have a lot of these variables, you might have to replace the implementation of
// pm.environment.get in the sandbox here with one that behaves more similarly to the postman
// implementation, which does this:
// 1. Is the variable present in the "variables"? If yes, return, if not, go to (2).
// 2. Is the variable present in "iteration data" variables? If yes, return, if not, go to (3).
// 3. Is the variable present in "environment" variables? If yes, return, if not, go to (4).
// 4. Is the variable present in "collection" variables? If yes, return, if not, go to (5).
// 5. Is the variable present in "global" variables? If yes, return, if not, go to (6).
// 6. Was the variable embedded in a string, for example 'This is a "postman variable":
//    {{variableName}}'? If so, return the string, i.e. '{{variableName}}'. If not, go to (7).
// 7. I think Postman fails silently here and returns an empty string. But as an implementer of
//    this function, you should throw an error.
//
// See here for more on postman variables:
// https://learning.postman.com/docs/sending-requests/variables/#variable-scopes
const envWhitelist = [
    'EURGHSChannelId',
    'RWFUGXChannelId',
    'RWFZMWChannelId',
    'UGXRWFChannelId',
    'UGXZMWChannelId',
    'ZMWRWFChannelId',
    'ZMWUGXChannelId',
];
const environment = new Map([
    ...require('../environments/Casa-DEV.postman_environment.json').values.map(({ key, value }) => [key, value]),
    ...envWhitelist.map((v) => ([v, undefined])) // map to the [key,value] format expected by the constructor
]);
const set = require('./set');

const nodeTypes = [
    "Printable",
    "Node",
    "SourceLocation",
    "Position",
    "File",
    "Program",
    "Function",
    "Statement",
    "EmptyStatement",
    "BlockStatement",
    "ExpressionStatement",
    "IfStatement",
    "LabeledStatement",
    "BreakStatement",
    "ContinueStatement",
    "WithStatement",
    "SwitchStatement",
    "ReturnStatement",
    "ThrowStatement",
    "TryStatement",
    "CatchClause",
    "WhileStatement",
    "DoWhileStatement",
    "ForStatement",
    "ForInStatement",
    "DebuggerStatement",
    "Declaration",
    "FunctionDeclaration",
    "FunctionExpression",
    "VariableDeclaration",
    "VariableDeclarator",
    "Expression",
    "ThisExpression",
    "ArrayExpression",
    "ObjectExpression",
    "Property",
    "SequenceExpression",
    "UnaryExpression",
    "BinaryExpression",
    "AssignmentExpression",
    "UpdateExpression",
    "LogicalExpression",
    "ConditionalExpression",
    "NewExpression",
    "CallExpression",
    "MemberExpression",
    "Pattern",
    "SwitchCase",
    "Identifier",
    "Literal",
    "Comment",
    "Property",
    "ObjectMethod",
    "ObjectProperty",
    "SpreadProperty",
    "SpreadElement",
    "MethodDefinition",
    "VariableDeclarator",
    "ClassPropertyDefinition",
    "ClassProperty",
    "ClassPrivateProperty",
    "ClassMethod",
    "ClassPrivateMethod",
    "Property",
    "PropertyPattern",
    "SpreadPropertyPattern",
    "SpreadProperty",
    "ObjectProperty",
    "RestProperty",
    "MethodDefinition",
    "VariableDeclarator",
    "ClassPropertyDefinition",
    "ClassProperty",
    "MethodDefinition",
    "VariableDeclarator",
    "ClassPropertyDefinition",
    "ClassProperty",
];

// So we can do this:
//   jsc(src).find(jsc.Identifier).filter(chk.VariableDeclaration)
// Instead of:
//   jsc(src).find(jsc.Identifier).filter((path) => jsc.VariableDeclaration.check(path))
const chk = Object.assign({}, ...nodeTypes.map(key => ({ [key]: jsc[key].check.bind(jsc[key]) })));
const asrt = Object.assign({}, ...nodeTypes.map(key => ({ [key]: jsc[key].assert.bind(jsc[key]) })));
const not = (f) => (...args) => !f(...args);

const axiosResponseVarName = 'resp';
// TODO: convert this to ast-types? That way we can, for example, refer to setTimeoutPromiseName as
// a node, rather than a string.
// TODO: notice that certain transformations require things added to the preamble. We _could_ have
// the transformations add them as they are required. (Alternatively, we could let the final eslint
// pass identify when we've been naughty and added stuff we don't need to).
const setTimeoutPromiseName = 'setTimeoutPromise';
const preamble = [
    'const tv4 = require(\'tv4\');',
    'const moment = require(\'moment\');',
    'const KJUR = require(\'jsrsasign\');',
    'const assert = require(\'assert\').strict;',
    '// don\'t throw an error on any response code',
    '// https://github.com/axios/axios#request-config',
    '// TODO: throw on 500s?',
    'const axios = require(\'axios\').create({ validateStatus: () => true });',
    'const uuid = require(\'uuid\');',
    'const { createPmSandbox } = require(\'./pm\');',
    'const { reportsSpec } = require(\'../iteration_data.json\')[0];',
    'const pm = createPmSandbox(reportsSpec);',
    'const { promisify } = require(\'util\');',
    'const pmEnv = require(\'../environments/Casa-DEV.postman_environment.json\').values;',
    'pmEnv.forEach(({ key, value }) => pm.environment.set(key, value));',
    'const atob = (str) => Buffer.from(str, \'base64\').toString(\'binary\')',
    'const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));',
    'const WebSocket = require(\'ws\');',
].join('\n');

const createOrReplaceOutputDir = async (name) => {
    await fs.rmdir(name, { recursive: true }).catch(() => {}); // ignore error
    await fs.mkdir(name);
};

(async () => {

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
    const j = jsc(src);
    const testCmd = require('./package.json').scripts.test.split(' ');
    const testFileName = testCmd[testCmd.length - 1];
    fs.writeFile(`${testFileName.replace(/\.js$/, '-precodemod.js')}`, `${preamble}${src}`);

    // Check node equivalence. Useful for determining whether two variables have the same definition.
    // Next: write something to determine the lowest shared scope. Seems `path` types have a `.scope`
    // property.
    // Usage: astNodesAreEquivalent(path1.value, path2.value)
    const astNodesAreEquivalent = (...args) => {
        const equiv = jsc.types.astNodesAreEquivalent;
        const resolveNode = (nodeOrPath) => nodeOrPath instanceof jsc.types.NodePath ? nodeOrPath.value : nodeOrPath;
        if (args.length === 0) {
            return equiv(...args);
        }
        if (args.length === 1) {
            // Return a partially evaluated expression
            return (...argsPartial) => astNodesAreEquivalent(
                ...args,
                ...argsPartial
            );
        }
        return equiv(resolveNode(args[0]), resolveNode(args[1]));
    };

    // TODO: performance: this function is fairly slow
    // TODO: this should probably either incorporate the .find method, so the user does not have to
    //       say j.find(jsc.CallExpression).filter(callExpressionMatching) _or_ it should be
    //       registered on Collection (see the jscodeshift docs, or src/collections/ in the
    //       jscodeshift source code).
    const callExpressionMatching = (regex) => (astPath) => {
        const call = jsc(astPath.get('callee')).toSource();
        return call.match(regex);
    };

    // Given an array of strings, construct a nested MemberExpression AST left-to-right. e.g.
    // jscodeshift(buildNestedMemberExpression(['assert', 'equal'])).toSource() -> 'assert.equal'
    const buildNestedMemberExpression = (members) =>
        members.reduce((acc, val) => jsc.memberExpression(
            typeof acc === 'string' ? jsc.identifier(acc) : acc,
            jsc.identifier(val))
        );

    // Print the source code of a given expression
    const summarise = (nodeOrPath) => jsc(nodeOrPath).toSource();
    const prettyPrint = (nodeOrPath) => console.log(summarise(nodeOrPath));

    const astTypesInScope = (path, astType) => jsc(path.scope.path)
        .find(astType)
        .filter((p) => p.scope === path.scope);

    // Given a path, find all identifiers in the same scope that are not object properties. I.e.
    // any identifier in the same scope that would result in a name clash or shadow if a variable
    // was declared with the same name in that scope. For this code:
    //   () => {
    //     let x;
    //     const f = () => {}
    //     setTimeout(f, 2000, x);
    //   }
    // we would return
    //   new Set('x', 'f', 'setTimeout')
    // because if we were to declare any of these names in the scope displayed, the name would
    // clash with (x, f) or shadow (setTimeout) another.
    const identifiersInSameScope = (path) => {
        const isMemberExpressionProperty = (path) =>
               jsc.MemberExpression.check(path.parentPath.value)
            && path.parentPath.value.property === path.value;
        return new Set(
            astTypesInScope(path, jsc.Identifier)
                .filter(not(isMemberExpressionProperty))
                .nodes()
                .map(n => n.name)
        );
    };

    const appendComment = (node, comment) => {
        if (!Array.isArray(node.comments)) {
            node.comments = [ comment ]
        } else {
            node.comments.push(comment);
        }
    }

    // Ensure all pm.sendRequest calls are HTTP GET requests made with a POJO as the first
    // argument.
    // This guides our implementation of pm.sendRequest in our sandbox implementation.
    const assertPmHttpRequestsAreAllPojos = (j) => {
        const pmRequests = j.find(jsc.CallExpression)
            .filter(callExpressionMatching(/^pm.sendRequest$/));

        // All calls to pm.sendRequest have two arguments
        assert(pmRequests.every((path) => path.value.arguments.length === 2));

        const firstArgs = pmRequests.map((path) => path.get('arguments').get('0'));

        // The first argument is always type `Identifier`
        // I.e. the first argument is a variable name, not a string
        //   pm.sendRequest(requestToSimulator, ...)
        // NOT:
        //   pm.sendRequest('simulator', ...)
        assert(firstArgs.every((path) => jsc.Identifier.check(path.value)));

        // Some analysis of the first argument to pm.sendRequest:
        firstArgs.forEach((path) => {
            const declarations = j
                .find(jsc.Identifier)
                .filter(p => p.value.name.match(new RegExp(`^${path.value.name}$`)))
                .getVariableDeclarators(path => path.value.name);

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
            assert(
                declarations.every((path) => jsc.ObjectExpression.check(path.value.init)),
                'Every declaration of every first argument to pm.sendRequest is a POJO assignment'
            );

            // Assert that for every assignment there is a first-level `method` property with the
            // value `'get'` (case-insensitive). I.e. every declaration looks like:
            // const requestArg = {
            //   method: 'get', // or 'GET' or 'Get'
            //   ... // other stuff we don't care about
            // };
            declarations.forEach((path) => {
                const methods = path.get('init').get('properties').filter((path) => path.value.key.name === 'method');
                assert(
                    methods.length > 0,
                    'Every declaration assignment contains a `method` property'
                );
                // We don't actually care if there is more than one method- the last one will
                // define the value.
                const assignedValue = methods[methods.length - 1].get('value');
                assert(
                    jsc.Literal.check(assignedValue.value) && assignedValue.value.value.match(/get/i),
                    'Every `method` value is a string literal `\'get\'`.'
                );
            });
        });
    };


    // Transform all pm.sendRequest calls to async. This is because "pre-request", "request", and
    // "test" stages are no longer controlled to be run separately. Because we won't _check_ that
    // each stage has completed before the next stage begins, we will instead control this through
    // the language model. I.e. by making calls async and awaiting them. This will mean that some
    // functionality that previously occurred concurrently will now be serialised. For example,
    // some pre-request scripts were previously of this form:
    //   pm.sendRequest(req, f)
    //   pm.sendRequest(req, f)
    // meaning both requests ran concurrently. However, after the transformation, they will execute
    // serially:
    //   await pm.sendRequest(req).then(f)
    //   await pm.sendRequest(req).then(f)
    // Identifying those requests that can be run concurrently (e.g. with Promise.all) is out of
    // the scope of this exercise, for now.
    const transformPmSendRequestToAsync = (j) => {
        // The signature is:
        //   pm.sendRequest(req, f)
        // We previously demonstrate in assertPmHttpRequestsAreAllPojos that all instances of `req`
        // are POJOs.
        // The signature of f is:
        //   f(err, response)
        // We intend to transform
        //   pm.sendRequest(req, f)
        // to:
        // {
        //   const resp = await pm.sendRequest(req);
        //   ... contents of f ...
        // }
        // - The code is enclosed in a block statement to avoid any variable naming collisions. For
        //   example, if we transform
        //     pm.sendRequest(...)
        //     pm.sendRequest(...)
        //   to
        //     const resp = await pm.sendRequest(req);
        //     const resp = await pm.sendRequest(req);
        //   we need the two results to have a different name (we can't say `const resp` twice in the
        //   same scope). So we change scope with a block statement (curly braces).
        // - We let the error bubble and cause the test to fail. No problem.
        //
        // Our implementation of the postman sandbox will contain an implementation of
        // pm.sendRequest with this function signature.
        const pmRequests = j.find(jsc.CallExpression)
            .filter(callExpressionMatching(/^pm.sendRequest$/));

        pmRequests.forEach((path) => {
            // Extract the pm.sendRequest parameters
            // TODO: path.get('arguments').value can probably be path.value.arguments
            const [req, f] = path.get('arguments').value;
            assert(
                jsc.Identifier.check(f.params[0]),
                'Expected first pm.sendRequest callback argument to be an identifier'
            );
            // There's no rule about the error parameter not being used in the body, but if we're
            // sure it isn't in our tests, this makes the transformation easier (we don't need to
            // transform to
            //   try { await pm.sendRequest } catch (err) { /* handle */ }
            // In fact, this could be quite tricky to do automatically if usage of the response and
            // error were interleaved- everything might have to go in the finally block or some
            // other horror.
            assert(
                0 === jsc(f.body).find(jsc.Identifier).filter((p) => astNodesAreEquivalent(p.value, f.params[0])).length,
                'Expected the `error` (first) parameter to pm.sendRequest callback not to exist in the body.'
            );
            // Replace them both with the first one
            path.get('arguments').replace([req]);
            // Replace pm.sendRequest with await pm.sendRequest
            path.replace(
                jsc.blockStatement([
                    // Roughly: const response = pm.sendRequest(request);
                    jsc.variableDeclaration(
                        'const',
                        [
                            jsc.variableDeclarator(
                                f.params[1],
                                jsc.awaitExpression(
                                    path.value
                                )
                            ),
                        ]
                    ),
                    // TODO: normally the first thing that happens here is `var jsonData =
                    // response.json()`. This isn't necessary with axios. We should elide this
                    // call, and modify our sandbox implementation to return the raw axios response
                    // (which is a POJO).
                    ...f.body.body
                ]),
            );
        });
    };


    const assertSetTimeoutCalledWithTwoArgs = (j) => assert(
        j.find(jsc.CallExpression)
        .filter(callExpressionMatching(/^setTimeout$/))
        .every((path) => path.value.arguments.length === 2)
    );


    // 1. Find all block statements containing setTimeouts
    // 2. Extract the setTimeout callbacks and timeouts
    // 3. Remove the setTimeout calls
    // 4. In the order of their timeouts, transform their timeouts and add sleeps as appropriate. For
    //    example, if there was the following code:
    //      setTimeout(function executedSecond() { console.log('executed after ~1000ms') }, 1000);
    //      setTimeout(function executedFirst() { console.log('executed after ~500ms') }, 500);
    //    We need to replace it with something like:
    //      await sleep(500);
    //      {
    //        // NOTE: to avoid name clashes with the parent scope, we insert the content of the
    //        // function we previously called `executedFirst` in a new block statement here
    //        console.log('executed after ~500ms');
    //      }
    //      await sleep(500); // NOTE the 500 here, not 1000!
    //      {
    //        console.log('executed after ~1000ms');
    //      }
    const isSetTimeoutExpressionStatement = (nodeOrPath) => {
        const node = (nodeOrPath instanceof jsc.types.NodePath) ? nodeOrPath.value : nodeOrPath;
        return jsc.ExpressionStatement.check(node)
            && jsc.CallExpression.check(node.expression)
            && jsc.Identifier.check(node.expression.callee)
            && node.expression.callee.name === 'setTimeout'
    }

    const replaceSetTimeout = (j) => j
        .find(jsc.BlockStatement)
        .filter((path) => path.value.body.some(isSetTimeoutExpressionStatement))
        .forEach((blockStatement) => {
            // Each path now represents a BlockStatement that contains at least one setTimeout call
            // at its top level.

            const blockStatementBody = blockStatement.get('body');
            const setTimeouts = blockStatementBody.filter(isSetTimeoutExpressionStatement);

            // Assert setTimeout calls each have only two arguments supplied. This makes our job a
            // little easier.
            assert(setTimeouts.every((path) => path.value.expression.arguments.length === 2));

            // Find the earliest timeout. We'll normalise all others relative to that one.
            const earliest = Math.min(...setTimeouts.map((path) => path.value.expression.arguments[1].value));

            // Turn each setTimeout into an object that looks like:
            //   { timeout: x, body }
            // where timeout is the second argument to setTimeout and body is the function body of
            // the first argument.
            // We're relying on stable array sort here, which became available in node 12. Stable
            // sort means timeout callbacks with the same timeout will still occur in the same
            // order after this transformation. E.g.
            //   setTimeout(callback1, 5000)
            //   setTimeout(callback2, 5000)
            // will still result in callback1 occurring before callback2. Without stable array
            // sort, callback2 could occur before callback1.
            assert(Number(process.versions.node.split('.')[0]) > 11)
            const timeouts = setTimeouts
                .map((path) => ({
                    timeout: path.value.expression.arguments[1].value - earliest,
                    body: path.get('expression').get('arguments').get('0').get('body')
                }))
                .sort((a, b) => a.timeout - b.timeout);

            // Replace the original block statement
            blockStatement.replace(
                jsc.blockStatement([
                    // original block statement body, no setTimeouts
                    ...blockStatementBody.value.filter((n) => !isSetTimeoutExpressionStatement(n)),
                    // our new code that consists of sleeps + the old setTimeout callback bodies
                    ...timeouts
                        .map(({ timeout, body }) => [
                            jsc.expressionStatement(
                                jsc.awaitExpression(
                                    jsc.callExpression(
                                        jsc.identifier('sleep'),
                                        [ jsc.literal(timeout + earliest) ]
                                    )
                                )
                            ),
                            body.value
                        ])
                        .reduce((acc, nodes) => [...acc, ...nodes])
                ])
            );
        });


    // In replaceSetTimeout we only replace setTimeout calls that are at the top level of a
    // block statement. This is because the code that was intended to be transformed by this code
    // did not use setTimeout in other contexts. Therefore, no effort was expended considering
    // those other contexts. This assert ensures that we know if our assumptions about the code
    // were invalid.
    const assertNoSetTimeout = (j) => assert(0 === j
        .find(jsc.Identifier)
        .filter((path) => path.value.name === 'setTimeout')
        .length
    );


    // Variables:
    //   https://learning.postman.com/docs/postman/variables-and-environments/variables/#variable-scopes
    // Especially:
    //   https://learning.postman.com/docs/postman/variables-and-environments/variables/#choosing-variables
    //
    //   > Local variables are temporary, and only accessible in your request scripts. Local variable
    //   > values are scoped to a single request or collection run, and are no longer available when
    //   > the run is complete.
    //
    // i.e. pm.variables corresponds to one `it` block for us
    //
    // Replace all instances of `pm.variables.set` and `pm.variables.get`. Do this by starting at
    // `it` blocks, looking inside them for instances of `pm.variables.set`. Replace all postman
    // variables, e.g. '{{var_name}}' and `pm.variables.get` instances with variable references,
    // e.g. `locals.var_name` and all `pm.variables.set` instances with variable assignments.
    //
    // Also, replace all remaining usage of `{{var_name}}` with pm.environment.get('var_name').
    const localsVarName = 'locals';
    const pmVariableRegex = /{{[^}]+}}/; // Anything that looks a bit like {{var_name}}
    const replaceVariableUsage = (j) => {
        // TODO: note that we don't consider scope _at all_ here. This is a bit of a disaster. This
        // is one place we could analyse the scope of pm.environment.set calls and allow or
        // disallow the use of pm.environment.get calls for the same variables. Note however that
        // due to our implementation of the postman sandbox, attempted access of a non-existent
        // variable is now a runtime error rather than a silent failure.
        const environmentNotInEnvironmentFile = j
            .find(jsc.CallExpression)
            .filter((path) => astNodesAreEquivalent(
                path.value.callee,
                buildNestedMemberExpression(['pm', 'environment', 'set'])
            ))
            // assert they're called with two arguments
            .forEach((p) => assert(
                p.value.arguments.length === 2,
                'Expected all pm.environment.set calls to have two arguments'
            ))
            // filter out template literals and identifiers- they _should_ just work
            .filter((p) => jsc.Literal.check(p.value.arguments[0]))
            .filter((p) => !environment.has(p.value.arguments[0]))
            // map the results to a an array for consumption by the Set constructor
            .map((p) => p.get('arguments').get('0').get('value'))
            .nodes();

        // TODO: printing this will show all the pm.environment.set calls that are used to set
        // mutable global state.
        // console.log(new Set(environmentNotInEnvironmentFile));

        // Create a set containing keys from both the environment file map and the
        // pm.environment.set map.
        const allEnvVarNames = new Set([...environmentNotInEnvironmentFile, ...environment.keys()]);

        return j
            .find(jsc.CallExpression)
            .filter((p) => jsc.Identifier.check(p.value.callee))
            .filter((p) => /^it$/.test(p.value.callee.name))
            .forEach((itCallExpression) => {
                // For each `pm.variables.set` in the `it` call, get all postman variable literals and
                // `pm.variables.get` and replace them with `locals.VAR_NAME`
                let varNames = new Set();
                jsc(itCallExpression)
                    .find(jsc.CallExpression)
                    .filter((p) => astNodesAreEquivalent(
                        p.value.callee,
                        buildNestedMemberExpression(['pm', 'variables', 'set'])
                    ))
                    .forEach((pmVarSetCallExpression) => {
                        assert(
                            jsc.Literal.check(pmVarSetCallExpression.value.arguments[0]),
                            'Expected first argument to pm.variables.set to be a string literal'
                        );
                        assert(
                            pmVarSetCallExpression.value.arguments.length === 2,
                            'Expected pm.variables.set to have exactly two arguments'
                        );
                        const varName = pmVarSetCallExpression.value.arguments[0].value;
                        // Replace the `pm.variables.set` call with a variable assignment
                        const varAssignment = jsc.assignmentExpression(
                            "=",
                            jsc.memberExpression(
                                jsc.identifier(localsVarName),
                                jsc.identifier(varName)
                            ),
                            pmVarSetCallExpression.value.arguments[1]
                        );
                        varNames.add(pmVarSetCallExpression.value.arguments[0].value);
                        pmVarSetCallExpression.replace(varAssignment);
                    });

                // insert the `locals` object at the beginning of the `it` callback function statement
                // block.
                // E.g.
                //   it('blah', () => {
                //     // stuff
                //   })
                // to
                //   it('blah', () => {
                //     let locals = {};
                //     // stuff
                //   })
                itCallExpression.get('arguments').get('1').get('body').get('body').get('0').insertBefore(
                    jsc.variableDeclaration(
                        'let',
                        [
                            jsc.variableDeclarator(
                                jsc.identifier(localsVarName),
                                jsc.objectExpression([])
                            )
                        ]
                    )
                );

                // For each `pm.variables.get` in the `it` call, replace it appropriately.
                // From:
                //   pm.variables.get('var_name')
                // to:
                //   locals.var_name
                // or, when there is no local var, but there is an environment var, we'll use
                // pm.environment.get:
                // From:
                //   pm.variables.get('var_name')
                // to:
                //   pm.environment.get('var_name')
                jsc(itCallExpression)
                    .find(jsc.CallExpression)
                    .filter((p) => astNodesAreEquivalent(
                        p.value.callee,
                        buildNestedMemberExpression(['pm', 'variables', 'get'])
                    ))
                    .forEach((pmVarGetCallExpression) => {
                        assert(
                            jsc.Literal.check(pmVarGetCallExpression.value.arguments[0]),
                            'Expected first argument to  pm.variables.get to be a string literal'
                        );
                        assert(
                            pmVarGetCallExpression.value.arguments.length === 1,
                            'Expected pm.variables.get to have exactly two arguments'
                        );
                        const varName = pmVarGetCallExpression.value.arguments[0].value;
                        assert(
                            varNames.has(varName) || allEnvVarNames.has(varName),
                            `Expected argument ${varName} supplied to pm.variables.get call to be present in environment or local variables`
                        );
                        if (varNames.has(varName)) {
                            // pm.variables.get('var_name') -> locals.var_name
                            pmVarGetCallExpression.replace(
                                jsc.memberExpression(
                                    jsc.identifier(localsVarName),
                                    jsc.identifier(varName)
                                )
                            );
                        } else {
                            // pm.variables.get -> pm.environment.get
                            pmVarGetCallExpression.get('callee').get('object').get('property').replace(
                                jsc.identifier('environment')
                            );
                        }
                    });

                // Get all string literals in the `it` CallExpression and
                // 1. replace instances of {{var_name}} that we've identified as being local postman
                //    variables
                // 2. replace other instances of {{var_name}} with pm.environment.get calls
                // 3. replace the string literals with template strings where we make the above
                //    replacements
                const allVarsRegex = new RegExp(`{{(${[...allEnvVarNames.keys(), ...varNames.values()].join('|')})}}`);
                jsc(itCallExpression)
                    .find(jsc.Literal)
                    .filter((path) =>
                           typeof path.value.value === 'string'
                        && pmVariableRegex.test(path.value.value)
                        && allVarsRegex.test(path.value.value)
                    )
                    .forEach((path) => {
                        // If there is a variable that is set by pm.variables.set('var_name'), we'll
                        // replace it with locals.var_name
                        const localVarsReplaced = [...varNames.values()]
                            .reduce((pv, varName) => pv.replace(
                                new RegExp(`{{${varName}}}`), `\${${localsVarName}.${varName}}`
                            ), path.value.value)
                        // Variables that are present in the environment file, _or have been set in the
                        // environment with pm.environment.set, we'll replace with instances of
                        // pm.environment.get
                        const allVarsReplaced = [...allEnvVarNames.keys()]
                            .reduce((pv, varName) => pv.replace(
                                new RegExp(`{{${varName}}}`), `\${pm.environment.get('${varName}')}`
                            ), localVarsReplaced);
                        const newCode = `\`${allVarsReplaced}\``;
                        const newNode = jsc(newCode).getAST()[0].value;
                        path.replace(newNode);
                    })
            })
    };

    // Notify the user of anything that looks like variables that haven't been replaced
    // TODO: this needs to look in template literals also
    const notifyUnreplacedVariables = (j) => {
        console.log('Found the following variable-like strings that have not been replaced with pm.environment.get or local variables:');
        const matchesInLiterals = j.find(jsc.Literal)
            .filter((path) =>
                typeof path.value.value === 'string' && pmVariableRegex.test(path.value.value)
            )
            .map((path) => path.get('value'))
            .nodes()
            .map(n => [...n.matchAll(pmVariableRegex)]); // get all matches

        const matchesInTemplateLiterals = j.find(jsc.TemplateElement)
            .filter((path) => pmVariableRegex.test(path.value.value.raw)) //.some((q) => pmVariableRegex.test(q)))
            .map((path) => path.get('value'))
            .nodes()
            .map(n => [...n.raw.matchAll(pmVariableRegex)]);

        [...matchesInLiterals, ...matchesInTemplateLiterals]
            .reduce((acc, cv) => [...acc, ...cv]) // flatten our _array of arrays of matches_ into an _array of matches_
            .map(m => m[0]) // take the first element of each match, the matched string
            .sort()
            .reduce((acc, cv) => acc.includes(cv) ? acc : [...acc, cv], []) // remove duplicates
            .forEach(mStr => console.log(mStr));
    };


    // Assert the removal of all instances of `pm.variables`
    const assertPmVariablesCallsGone = (j) => assert(
        0 === j
            .find(jsc.MemberExpression)
            .filter((path) => astNodesAreEquivalent(
                path.value,
                jsc.memberExpression(
                    jsc.identifier('pm'),
                    jsc.identifier('variables')
                )
            ))
            .length,
        'Expected all pm.variables usage to be removed'
    );


    // Replace this pattern:
    //   pm.test("Status code is blah", function () {
    //     pm.response.to.have.status(200);
    //   });
    // With jest's
    //   expect(pm.response.status).toBe(200);
    const replaceTestResponse = (j) => {
        // Utilities
        const testResponsePattern = (desc, code) =>
            jsc.callExpression(
                jsc.memberExpression(
                    jsc.identifier('pm'),
                    jsc.identifier('test'),
                ),
                [
                    jsc.literal(desc),
                    jsc.functionExpression(
                        null,
                        [],
                        jsc.blockStatement([
                            jsc.expressionStatement(
                                jsc.callExpression(
                                    buildNestedMemberExpression(['pm', 'response', 'to', 'have', 'status']),
                                    [jsc.literal(code)]
                                )
                            )
                        ])
                    )
                ]
            );

        const signatureMatches = (path) =>
            path.value.arguments.length === 2
                && jsc.Literal.check(path.value.arguments[0])
                && path.value.arguments[1].body.body
                && path.value.arguments[1].body.body.length === 1
                && jsc(path.value.arguments[1].body.body).toSource().match(/^pm.response.to.have.status\(\d+\);?$/);

        j.find(jsc.CallExpression)
            .filter(callExpressionMatching(/^pm.test$/))
            .filter(signatureMatches)
            .forEach((path) => {
                const desc = path.value.arguments[0].value;
                const code = path.value.arguments[1].body.body[0].expression.arguments[0].value;
                // Do this check here rather than in a filter because it's probably expensive.
                if (astNodesAreEquivalent(path.value, testResponsePattern(desc, code))) {
                    path.replace(
                        jsc.callExpression(
                            jsc.memberExpression(
                                jsc.callExpression(
                                    jsc.identifier('expect'),
                                    [
                                        buildNestedMemberExpression([axiosResponseVarName, 'status'])
                                    ]
                                ),
                                jsc.identifier('toBe')
                            ),
                            [ jsc.literal(code) ]
                        )
                    )
                }
            });
    };

    // Replace all pm.response.code with resp.status
    const replacePmResponseCode = (j) => j
        .find(jsc.MemberExpression)
        .filter((path) => jsc(path).toSource().match(/^pm.response.code$/))
        .forEach((path) =>
            path.replace(
                jsc.memberExpression(
                    jsc.identifier(axiosResponseVarName),
                    jsc.identifier('status')
                )
            )
        );

    // Replace all pm.response.json() with resp.data
    const replacePmResponseJson = (j) => j
        .find(jsc.CallExpression)
        .filter((path) => jsc(path).toSource().match(/^pm.response.json\(\)$/))
        .forEach((path) =>
            path.replace(
                jsc.memberExpression(
                    jsc.identifier(axiosResponseVarName),
                    jsc.identifier('data')
                )
            )
        );

    // Remove response.responseSize, because there's going to be an error if the response fails and
    // we'll just leave it at that.
    // Note that every time this is used it's a guard for tests, thus:
    //   if (response.responseSize !== 0) {
    //     // tests
    //   }
    // Further note that it is undocumented:
    //   https://www.postmanlabs.com/postman-collection/Response.html
    // Here is the implementation:
    //   https://github.com/postmanlabs/postman-collection/blob/8895878ad81422b95124974bc5b76fbfdf29b800/lib/collection/response.js#L284
    // It looks like responseSize is the response data length. Exactly what this includes is
    // unclear. This StackOverflow answer discusses it, but the answers contradict each other:
    //   https://stackoverflow.com/questions/45742705/access-response-size-in-postman-test
    // Anyway, who cares.
    const removeResponseResponseSize = (j) => j
        .find(jsc.BinaryExpression)
        .filter((path) => astNodesAreEquivalent(
            jsc.binaryExpression(
                '!==',
                jsc.memberExpression(
                    jsc.identifier('response'),
                    jsc.identifier('responseSize')
                ),
                jsc.literal(0)
            ),
            path.value
        ))
        .filter((path) => jsc.IfStatement.check(path.parentPath.value))
        .map((path) => path.parentPath, jsc.IfStatement)
        // check that the else clause is the seemingly-standard
        //   pm.test("something failed", function () {
        //     throw new Error('whatever');
        //   })
        .forEach((path) => {
            // If there's no else clause, we don't need to check it
            if (path.value.alternate == null) {
                return;
            }
            // assert there's exactly one statement in the body
            assert(path.value.alternate.body.length === 1);
            // assert that's an ExpressionStatement
            const elseExpressionStmt = path.value.alternate.body[0];
            assert(jsc.ExpressionStatement.check(elseExpressionStmt));
            // assert that expression statement is a callexpression `pm.test`
            assert(
                astNodesAreEquivalent(
                    elseExpressionStmt.expression.callee,
                    buildNestedMemberExpression(['pm', 'test'])
                )
            );
            // assert that the callback to pm.test is just a single throw
            const pmTestCall = elseExpressionStmt.expression;
            assert(pmTestCall.arguments.length === 2);
            const pmTestCallback = pmTestCall.arguments[1];
            assert(jsc.Function.check(pmTestCallback));
            assert(pmTestCallback.body.body.length === 1);
            assert(jsc.ThrowStatement.check(pmTestCallback.body.body[0]));
        })
        .forEach((path) => {
            path.replace(
                path.value.consequent
            );
        });


    const assertPmResponseIsReplaced = (j) => assert(0 === j
        .find(jsc.MemberExpression)
        .filter((path) =>
               jsc.Identifier.check(path.value.object)
            && jsc.Identifier.check(path.value.property)
            && path.value.object.name === 'pm'
            && path.value.property.name === 'response')
        .map((path) => {
            // work upward until the parent is not a memberexpression or a callexpression
            let curr = path;
            while (jsc.MemberExpression.check(curr.parentPath.value) || jsc.CallExpression.check(curr.parentPath.value)) {
                curr = curr.parentPath;
            }
            return curr;
        })
        .size()
    );


    // After transformation, some places in the code do this:
    //   const resp = await axios(config);
    //   resp.data.forEach(d => await pm.sendRequest(f(d)));
    // Specifically, they call an async function inside a sync function. Because we actually want
    // to control execution, we need to transform them to this:
    //   const resp = await axios(config);
    //   await Promise.all(resp.data.map(async d => await pm.sendRequest(f(d))));
    const functionBodyContainsAwaitExpression = (fAstPath) =>
        jsc(fAstPath.get('body').get('body')).find(jsc.AwaitExpression).length > 0
    const transformForEachToAwaitPromiseAll = (j) => j
        .find(jsc.CallExpression)
        .filter((path) => jsc.MemberExpression.check(path.value.callee))
        .filter((path) => jsc.Identifier.check(path.value.callee.property))
        .filter((path) => path.value.callee.property.name === 'forEach')
        .filter((path) => functionBodyContainsAwaitExpression(path.get('arguments').get('0')))
        .forEach((path) => {
            // assert that there is only one argument supplied to the `forEach` call
            assert(path.value.arguments.length === 1);
            // assert that there is only one parameter to the callback function
            const callback = path.get('arguments').get('0');
            const callbackArgs = callback.value.arguments || callback.value.params;
            assert(callbackArgs.length === 1);
            // make our forEach argument async
            callback.get('async').replace(true);
            // make our forEach into a `map`
            path.get('callee').get('property').replace(
                jsc.identifier('map')
            );
            // wrap our CallExpression in Promise.all and await the result
            path.replace(
                jsc.awaitExpression(
                    jsc.callExpression(
                        jsc.memberExpression(
                            jsc.identifier('Promise'),
                            jsc.identifier('all')
                        ),
                        [ path.value ]
                    )
                )
            );
        })


    // This exists about a million times in the code:
    //   var navigator = {}; //fake a navigator object for the lib
    //   var window = {}; //fake a window object for the lib
    //   eval(pm.environment.get('jrsassign'))
    // The variable declarations mean there isn't an error when the library is eval'ed.
    // Get rid of the horrible lot.
    const removeJsRsaSignEvalAndRelatedRubbish = (j) => {
        j.find(jsc.CallExpression)
            .filter((path) => astNodesAreEquivalent(
                path.value,
                jsc.callExpression(
                    jsc.identifier('eval'),
                    [
                        jsc.callExpression(
                            buildNestedMemberExpression(['pm', 'environment', 'get']),
                            [ jsc.literal('jrsassign') ]
                        )
                    ]
                )
            ))
            .remove();
        // get rid of any 'var navigator' or 'var window' variabledeclarations
        const varEqualsEmptyObjDeclaration = (varName) =>
            jsc.variableDeclaration(
                'var',
                [
                    jsc.variableDeclarator(
                        jsc.identifier(varName),
                        jsc.objectExpression([])
                    )
                ]
            )
        j.find(jsc.VariableDeclaration)
            .filter((path) =>
                   astNodesAreEquivalent(path.value, varEqualsEmptyObjDeclaration('window'))
                || astNodesAreEquivalent(path.value, varEqualsEmptyObjDeclaration('navigator'))
            )
            .remove();
    };


    // Removes console.log('--') for any length of dash
    const removeAnnoyingLogging = (j) => j
        .find(jsc.CallExpression)
        .filter((path) => path.value.arguments.length === 1)
        .filter((path) => /^-*$/.test(path.value.arguments[0].value))
        .filter((path) => astNodesAreEquivalent(
            path.value.callee,
            buildNestedMemberExpression(['console', 'log'])
        ))
        .remove();


    // Is it `eval` or `evil`?
    const assertNoEval = (j) => assert(0 === j
        .find(jsc.Identifier)
        .filter((path) => path.value.name === 'eval')
        .length
    );


    // We naively replace var with let to allow identifier shadowing in child scopes. We expect
    // that any problems with this will be identified at run-time.
    const replaceVarWithLet = (j) => j
        .find(jsc.VariableDeclaration)
        .filter((path) => path.value.kind === 'var')
        .forEach((path) => path.get('kind').replace('let'));


    // Our sandbox implementation of pm.test doesn't do anything with the first argument, but
    // sometimes when tests fail it functions as a useful comment, so we'll turn it into a comment.
    const replacePmTest = (j) => {
        return j
            .find(jsc.CallExpression)
            .filter((path) => astNodesAreEquivalent(
                buildNestedMemberExpression(['pm', 'test']),
                path.value.callee
            ))
            .forEach((path) => {
                assert(
                    path.value.arguments.length === 2,
                    'Expected all calls to pm.test to have exactly two arguments'
                );
                const pmTestArgs = path.get('arguments');
                // toSource- we'll turn the entire arg to a comment string
                const comment = jsc.commentLine(
                    ` ${jsc(pmTestArgs.get('0')).toSource().replace(/(^"|"$)/g, '')}`
                );
                const callback = pmTestArgs.get('1');
                assert(
                    jsc.Function.check(callback.value),
                    'Expected second argument to pm.test to be a callback'
                );
                assert(
                    callback.value.params.length === 0,
                    'Expected the callback to pm.test to have zero arguments'
                );

                // Check whether there are any name clashes between the callback body and the scope
                // that encloses the `pm.test` call.
                const pmTestCallbackBody = path.get('arguments').get('1').get('body');
                const bodyVariablesDeclared = new Set(
                    astTypesInScope(pmTestCallbackBody, jsc.VariableDeclarator)
                        .map((p) => p.get('id'))
                        .nodes()
                        .map(n => n.name)
                );
                const identifiersInPmTestScope = identifiersInSameScope(path);
                const nameClashes = set.intersection(bodyVariablesDeclared,
                    identifiersInPmTestScope);
                // If there are name clashes between the callback body and the scope that encloses
                // the `pm.test` call, we'll put the callback body into a block statement.
                // Otherwise, we'll replace the `pm.test` call with its contents.
                if (nameClashes.size !== 0) {
                    path.replace(
                        callback.get('body').value
                    );
                    appendComment(path.value, comment);
                } else {
                    // An ArrowFunctionExpression can have an expression as a body. Here we handle
                    // the case of a BlockStatement as a body
                    if (jsc.BlockStatement.check(callback.value.body)) {
                        const callbackBody = callback.get('body').get('body');
                        appendComment(callbackBody.value[0], comment);
                        // Insert the current block before the pm.test call
                        path.parentPath.insertBefore(...callbackBody.value);
                    } else {
                        const callbackBody = callback.get('body');
                        appendComment(callbackBody.value, comment);
                        // Insert the current block before the pm.test call
                        path.parentPath.insertBefore(
                            jsc.expressionStatement(
                                callbackBody.value
                            )
                        )
                    }
                }
            })
            .remove(); // remove all the pm.test nodes
    };


    // Where the following rough pattern exists:
    //   setTimeout(() => {
    //     const response = await pm.sendRequest(`http://${simulatorTestEndpoint}`);
    //     pm.expect(response).to('blah blah blah');
    //     // assertions
    //   }, timeout)
    // We replace it with this:
    //   const ws = new WebSocket(`ws://${simulatorTestEndpoint}`);
    //   const response = await new Promise((resolve) => ws.on('message', resolve));
    //   pm.expect(response).to('blah blah blah');
    //
    // At the time of writing, only where there is only a single request to a simulator test
    // endpoint.
    const replaceTimeoutsWithWebSockets = (j) => {
        const getPmSendRequestExpressions = (nodeOrPath) => jsc(nodeOrPath)
            .find(jsc.MemberExpression)
            .filter(astNodesAreEquivalent(buildNestedMemberExpression(['pm', 'sendRequest'])))
        // The blockStatementBody parameter will come from e.g.
        //   jsc(src).find(jsc.BlockStatement).map((path) => path.get('body'))
        // or, as the ArrowFunctionExpression.body _is_ a BlockStatement, which itself _has_ a body
        // property, which contains the array of things this function looks for:
        //   jsc(src).find(jsc.ArrowFunctionExpression).map((path) => path.get('body').get('body'))
        const getBlockStatementBodyChildPaths = (blockStatementBody) =>
            Array(blockStatementBody.value.length)
                .fill()
                .map((_, i) => blockStatementBody.get(`${i}`));
        return j
            .find(jsc.BlockStatement)
            // Get the setTimeout calls from within the block statements
            .map((path) =>
                    [...Array(path.value.body.length).keys()]
                        .map((i) => path.get('body').get(`${i}`))
                        .filter(isSetTimeoutExpressionStatement)
            )
            // Filter out any setTimeout calls where the callback function body contains more than one
            // pm.sendRequest call
            .filter((setTimeoutExprStmt) =>
                getPmSendRequestExpressions(setTimeoutExprStmt).length === 1
            )
            // Filter out any setTimeout calls where the pm.sendRequest argument looks like an
            // object. Most of the ones we're interested in look like:
            //   pm.sendRequest(pm.environment.get("TESTFSP3_SDK_INBOUND_URL")+"/callbacks/"+pm.variables.get("quoteId"))
            .filter((setTimeoutExprStmt) =>
                getPmSendRequestExpressions(setTimeoutExprStmt)
                    .some((p) => not(chk.Identifier)(p.parentPath.value.arguments[0]))
            )
            // Filter out any setTimeout calls where the argument isn't obviously to a simulator
            // test endpoint. We ascertain this by looking for a string literal that contains the
            // text 'callbacks' or 'requests'.
            .filter((setTimeoutExprStmt) =>
                getPmSendRequestExpressions(setTimeoutExprStmt)
                    .map((p) => p.parentPath.get('arguments').get('0'))
                    .some((p) => jsc(p)
                        .find(jsc.Literal)
                        .some((p) => /(callbacks|requests)/.test(p.value.value))
                    )
            )
            // .at(0)
            .forEach((setTimeoutExprStmt) => {
                const unmodified = jsc(setTimeoutExprStmt.scope.path).toSource();
                // 1. get the argument (url) to the pm.sendRequest call, we'll use it later
                const pmSendRequest = getPmSendRequestExpressions(setTimeoutExprStmt).paths()[0];
                const requestUrl = pmSendRequest.parentPath.value.arguments[0];
                // 2. move to the scope of the setTimeout call
                const setTimeoutScopeBlockStatementBody =
                    setTimeoutExprStmt.scope.path.get('body').get('body');
                const setTimeoutScopeBlockStatementBodyPaths =
                    getBlockStatementBodyChildPaths(setTimeoutScopeBlockStatementBody);
                // 3. get the `await axios` call position in the body
                const requestStatements = setTimeoutScopeBlockStatementBodyPaths
                    .filter(
                        astNodesAreEquivalent(
                            // Find something that looks like:
                            //   const resp = await axios(config)
                            jsc.variableDeclaration(
                                'const',
                                [
                                    jsc.variableDeclarator(
                                        jsc.identifier('resp'),
                                        jsc.awaitExpression(
                                            jsc.callExpression(
                                                jsc.identifier('axios'),
                                                [jsc.identifier('config')]
                                            )
                                        )
                                    )
                                ]
                            )
                        )
                    );
                // 4. assert that there's exactly one `const resp = await axios(config)` call- this
                //    is the "request" of the test (i.e. not the pre-request script or the "test")
                assert(
                    requestStatements.length === 1,
                    'Expect exactly one instance of `await axios` in the scope of the setTimeout call'
                );
                const requestStatement = requestStatements[0];
                // 5. create a piece of AST that
                //      a. creates a websocket client for the scheme adapter test endpoint
                //      b. creates a promise that resolves when a message is received to that client
                //    e.g., where requestUrl is the URL argument to pm.sendRequest we found
                //    previously, in step (1):
                //      const wsUrl = requestUrl.replace(/^(http)?s?(:\/\/)?/, 'ws://');
                //      const ws = new WebSocket(wsUrl);
                //      const wsMessage = new Promise((resolve) => ws.on('message', resolve));
                const newCode = jsc([
                    'const wsUrl = (' + jsc(requestUrl).toSource() + ').replace(/^(http)?s?(:\\\/\\\/)?/, \'ws://\');',
                    'const ws = new WebSocket(wsUrl);',
                    'const wsMessage = new Promise((resolve) => ws.on(\'message\', resolve));',
                ].join('\n')).getAST()[0].value.program.body;
                try {
                // 6. insert the AST from (5) before the `await axios` call
                requestStatement.insertBefore(...newCode);
                // 7. replace
                //      const response = await pm.sendRequest(blah);
                //    with the promise from (5b)
                //      const response = await wsMessage;
                pmSendRequest.parentPath.replace(jsc.identifier('wsMessage'));
                // 8. wait for the websocket to close:
                //      await new Promise((resolve) => ws.close(resolve));
                // We build the await outside the parser, because the await will fail to parse.
                const waitWsClose =
                    jsc.expressionStatement(
                        jsc.awaitExpression(
                            jsc('new Promise((resolve) => ws.close(resolve));')
                                .getAST()[0].value.program.body[0].expression
                        )
                    );
                setTimeoutScopeBlockStatementBody.push(waitWsClose);
                // 9. Replace the setTimeout call with the function body of its callback.
                setTimeoutExprStmt.replace(
                    setTimeoutExprStmt.value.expression.arguments[0].body
                );
                console.log("WIP");

                } catch (err) {
                    // TODO: notice that "`unmodified`" appears modified. That's because it is.
                    // This particular piece of code has two setTimeout calls.
                    console.log(unmodified);
                    // console.log(jsc(setTimeoutExprStmt.scope.path).toSource());
                    throw (err);
                }
            });
    };


    // WARNING: Order _matters_. These are _mutations_ and the order they are performed in can
    // affect the result.
    //
    // Not currently running the pm request pojo assertion because pm.sendRequest is frequently
    // called with a string argument. Our implementation of pm.sendRequest currently handles
    // strings and POJOs and throws for everything else. This should suffice until we identify any
    // other need. However, it's likely possible to use axios-requestgen to generate the request.
    // For example (untested):
    //   const { promisify } = require('util');
    //   const requestCodeGen = require('./axios-requestgen');
    //   const sdk = require('postman-collection');
    //   const request = jsc(src)
    //       .find(jsc.CallExpression)
    //       .filter(/* return calls to pm.sendRequest */)
    //       .map(/* return the first argument to pm.sendRequest */)
    //       .at(0).paths()[0];
    //   const pmRequest = new sdk.Request((eval(request)));
    //   const opts = { ... }; // see transformCollection.js for an example
    //   return promisify(requestCodeGen.convert)(pmRequest, opts);
    // assertPmHttpRequestsAreAllPojos(j);
    //
    removeAnnoyingLogging(j);
    transformPmSendRequestToAsync(j);
    assertSetTimeoutCalledWithTwoArgs(j);
    replaceTimeoutsWithWebSockets(j);
    // replaceSetTimeout(j);
    // assertNoSetTimeout(j);
    // replaceTestResponse(j);
    // replacePmResponseJson(j);
    // replacePmResponseCode(j);
    // assertPmResponseIsReplaced(j);
    // replaceVariableUsage(j);
    // notifyUnreplacedVariables(j);
    // assertPmVariablesCallsGone(j);
    // transformForEachToAwaitPromiseAll(j);
    // removeResponseResponseSize(j);
    // removeJsRsaSignEvalAndRelatedRubbish(j);
    // assertNoEval(j);
    // replaceVarWithLet(j);
    // replacePmTest(j);

    await fs.writeFile(testFileName, `${preamble}${j.toSource({ tabWidth: 4 })}`);


    // TODO: transformations:
    //  -1. Notice how `.has` is called on `jsonData.scenario1.result.message` instead of on
    //     `pm.expect`?:
    //       pm.expect((jsonData.scenario1.result.message).has(`Got an error response resolving party: {  errorInformation: { errorCode: '3200', errorDescription: 'Generic ID not found' }`));
    //     Fix this.
    //
    //  0. Replace all strings that are secretly template literal to be actual template literals.
    //     Postman allows this:
    //       pm.test("Currency is (${pm.environment.get('currency')")
    //     That's secretly a template literal.
    //     Note also that this is _intended_ to be a template literal, but the closing brace is not
    //     present.
    //     Further note this example of an invalid template literal:
    //       pm.test("Transfer amount is ({pm.environment.get('amount')", function () {
    //
    //  3. Identify pm.environment.get and pm.environment.set calls, and their scope, then declare
    //     variables at an appropriate level (or don't and manually evaluate this stuff)
    //     One possibility might be to
    //     1. evaluate whether these variables pre-exist in the environment config
    //     2. if they do, analyse whether they are ever _set_
    //        - are these persisted?
    //     3. evaluate whether they are set strictly _before_ they are used (IOW, they probably
    //        only exist to share data between tests)
    //     3. if they do not pre-exist, hoist the appropriate get/set calls to the lowest shared
    //        scope (probably a `declare` block in most cases.)
    //
    //  5. Replace (some?) duplicated string values with variables. Might require analysis on a
    //     case-by-case basis.
    //
    //  6. Wherever a request is made, set pm.response with the expected form.
    //
    //     Else, if this proves to be difficult, wherever a request is made, consider modifying the
    //     transform to wrap it in a function that returns the expected form. I.e. modifying
    //     axios-requestgen/lib/axios.js to return an IIFE like
    //     pm.response = (() => { axios stuff returning the correct pm.response interface });
    //
    //     Or possibly modify axios-requestgen to return a recast AST instead of a snippet. (This
    //     might actually be pretty easy to generate _from_ the snippet). Then mutate that.
    //
    //     Also, see the note above about using axios-requestgen and eval to generate a request.
    //
    //  7. Wherever pm.sendRequest is called, transform this to a call to axios
    //
    //  8. Check for variables that look like they should be in a test data file/variable. For
    //     example, variables that are duplicated in multiple places (e.g. every argument to
    //     pm.sendRequest), declared const, never rewritten or modified.
    //
    // 10. Remove trailing whitespace
    //
    // 11. Hoist (remove?) all `require` statements (might be a job for `eslint --fix`)
    //
    // 14. Evaluate all (Mojaloop DFSP) transfers and make sure sufficient funds are supplied before
    //     every transfer
    //
    // 15. Evaluate all raw values by identifying how often they're repeated and what they are.
    //     This might be a case-by-case analysis and replacement. Some basic tools could be built
    //     for this. E.g. "statistics: all raw values and the number of times they're repeated".
    //     This would make identification of the low-hanging fruit easy.
    //
    // 16. Identify all similar variables, function calls, etc. by computing some sort of
    //     similarity score. This might help identify factoring that can occur. However, it might
    //     be super-obvious just by looking at the code.
    //
    // 18. convert things like
    //       let data = `{ "some": "${templateLiteral}", "templated": "json" }`
    //     to data
    //       let data = { some: templateLiteral, templated: "json" }
    //
    // 19. replace _all_ calls to pm.environment.get and pm.environment.set with global data
    //     get/set.
    //
    // 20. Consider replacing all console.log calls to structured log calls. This shouldn't be too
    //     difficult:
    //       const testLogTag = []
    //       describe('blah', () => {
    //          testLogTag.push('blah');
    //          it('some test name', () => {
    //              testLogTag.push('some test name');
    //              logger(testLogTag, 'message here');
    //          })
    //       })
    //     Output _could_ go to a file, if jest doesn't already send it there
    //
    // 21. Wherever possible, replace usage of pm.expect with chai expect, or jest expect
    //
    // 22. Replace usage of pm.expect or chai expect with jest expect
    //
    // 23. Print all `it()`, `describe()` descriptions to help identify duplication. Note that just
    //     running the tests with jest does this.
    //
    // 24. Do some analysis of whether certain (especially environment) variables are actually
    //     used.
    //
    // 25. Check for any promise assignments that are not awaited. For example, some of our new
    //     functionality is async, replacing functionality that was previously synchronous.
    //
    // 26. Assert that the same number of `it` calls exist before and after the transformation.
    //     (Except where we're getting rid of them deliberately...? So don't bother?)
    //
    // 27. Print all request contents to help identify duplication.
    //
    // 28. Wherever setTimeoutPromise is used we can probably replace it now with sleep, followed
    //     by the setTimeoutPromise callback function. We could also analyse the _purpose_ of
    //     setTimeout and replace it with something more sensible. Likely the wait is occurring
    //     because we expect the switch to be completing a transfer, or similar. The solution might
    //     be something like websockets on the simulator test endpoints so we _receive_ an event
    //     when it happens rather than having to poll for it.
    //
    // 29. Go through every ObjectExpression and
    //     1. compare it to every other ObjectExpression with `astNodesAreEquivalent`
    //     2. where there's a certain amount of duplication, hoist it to a global data variable
    //
    // 30. Replace all pm.expect (and any other expect) with jest expect
    //
    // 31. Identify repeated "tests" or setup (probably by inspection rather than automatically)
    //     and turn them into functions. Probably write said functions manually but consider
    //     automatically replacing the code they'll replace.
    //
    // 32. Why does this happen?
    //       pm.environment.set('transfer_ID', pm.environment.get('transactionId'));
    //
    // 33. Just eliminate the postman sandbox (fake or otherwise) altogether.
    //
    // 34. Search the code for:
    //       const response = await pm.sendRequest("google.com");
    //
    // 35. Replace tv4 with ajv (which is faster- might speed tests up)
    //
    // 36. Analyse usage of `pm.test.skip`
    //
    // 37. Wrap axios for the "request" part of the test? This way we can add behaviour (i.e.
    //     logging) more easily.
    //
    // 38. Replace the crazy {{{{VAR}}{{NAME}}str}} thing postman does?! Or perhaps just try to
    //     detect and update manually. Even add comments in the output? Might need to write/use a
    //     basic parser to actually replace this... Or maybe not- maybe just recursively replace
    //     the outer-most curly braces. E.g. {{{{VAR}}{{NAME}}NAME}} becomes
    //     1. `{{VAR}}{{NAME}}str`
    //     2. `${VAR}${NAME}str`
    //     Is this actually what it does? Will have to investigate further.
    //
    // 39. Replace all BlockStatements with a single BlockStatement child with just a top-level
    //     BlockStatement. E.g. replace this:
    //       {
    //         {
    //           stuff
    //         }
    //       }
    //     with:
    //       {
    //         stuff
    //       }
    //     Note: they may be nested. Why wouldn't they be..?


    // Examples:
    //
    // Demonstrate that both declarations of `testfsp3GetStatusRequest` are equivalent (i.e.
    // copy-pasted)
    // const decs = j
    //     .find(jsc.Identifier)
    //     .filter(p => p.value.name.match(/^testfsp3GetStatusRequest$/))
    //     .getVariableDeclarators(path => path.value.name);
    // const nodes = decs.nodes();
    // assert(nodes.length > 1);
    // console.log(astNodesAreEquivalent(nodes[0], nodes[1]));
    //
    // Remove some nodes
    //   const src = 'var x = 5'
    //   jsc(src).find(jsc.VariableDeclaration).remove();
    // Or
    //   jsc(src).find(jsc.VariableDeclaration).forEach(p => p.prune());
    //
    // Insert a node before another using insertBefore
    // Need to ensure the path that insertBefore is called on is a member of an array. From a
    // CallExpression, for example, this means it's necessary to traverse upward to a child of a
    // BlockStatement. This is normally an ExpressionStatement with a `.name` that corresponds to
    // its position in the BlockStatement (an array index, of type string).
    //   path.parentPath.insertBefore(...callbackBody.value);
    //
    // Create some new code without having to build the structure, i.e. have jsc do it for us:
    //   jsc('const a = 5').getAST()[0].value
    // Now we can insert that in our existing AST. Sometimes it might be necessary to inspect what
    // comes out of .getAST() and traverse the tree to get what you want. Check this file for
    // examples.
})();
