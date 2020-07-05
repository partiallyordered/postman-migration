
// TODO:
// - How to verify the transformation is correct?
//   - Count assertions?
//   - Count tests (i.e. `it` blocks)?
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

// Notes:
// - Jest execution order:
//   https://jestjs.io/docs/en/setup-teardown#order-of-execution-of-describe-and-test-blocks

const collection = require('../Golden_Path_Mowali.postman_collection.json');
const util = require('util');
const fs = require('fs').promises;
const jsc = require('jscodeshift');
const { transformCollection, convertRequest } = require('./transformCollection');
const assert = require('assert').strict;
const recast = require('recast');
const environment = new Map(
    require('../environments/Casa-DEV.postman_environment.json').values.map(({ key, value }) => [key, value])
);

const axiosResponseVarName = 'resp';
// TODO: convert this to ast-types? That way we can, for example, refer to setTimeoutPromiseName as
// a node, rather than a string.
const setTimeoutPromiseName = 'setTimeoutPromise';
const preamble = [
    'const tv4 = require(\'tv4\');',
    'const KJUR = require(\'jsrsasign\')',
    'const assert = require(\'assert\').strict;',
    'const axios = require(\'axios\');',
    'const uuid = require(\'uuid\');',
    'const { createPmSandbox } = require(\'./pm\');',
    'const pm = createPmSandbox({});',
    'const { promisify } = require(\'util\');',
    `const ${setTimeoutPromiseName} = promisify(setTimeout);`,
    'const pmEnv = require(\'../environments/Casa-DEV.postman_environment.json\').values;',
    'pmEnv.forEach(({ key, value }) => pm.environment.set(key, value));',
    'const atob = (str) => Buffer.from(str, \'base64\').toString(\'binary\')',
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
    const src = `${preamble}${await transformCollection(collection)}`;
    const j = jsc(src);
    const testCmd = require('./package.json').scripts.test.split(' ');
    const testFileName = testCmd[testCmd.length - 1];
    fs.writeFile(`${testFileName.replace(/\.js$/, '-precodemod.js')}`, src);

    // Check node equivalence. Useful for determining whether two variables have the same definition.
    // Next: write something to determine the lowest shared scope. Seems `path` types have a `.scope`
    // property.
    // Usage: astNodesAreEquivalent(path1.value, path2.value)
    const astNodesAreEquivalent = recast.types.astNodesAreEquivalent;

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
    const summarise = (astValue) => {
        const getPos = (astValue) => `L${astValue.loc.start.line} C${astValue.loc.start.column}`;
        const { start, end } = astValue;
        return `[${getPos(astValue)}]: ${src.slice(start, end)}`;
    };


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
        //
        // TODO: check that the error is never handled. Here, we're just assuming that
        // the 'error' parameter that was passed to the pm.sendRequest callback
        // function wasn't used. We need to be sure of this by trying to find any
        // identifiers called `error` in the _body_ of these callback functions. (Note
        // that they _will_ be present in the function parameters).
        const pmRequests = j.find(jsc.CallExpression)
            .filter(callExpressionMatching(/^pm.sendRequest$/));

        pmRequests.forEach((path) => {
            // Extract the pm.sendRequest parameters
            // TODO: path.get('arguments').value can probably be path.value.arguments
            const [req, f] = path.get('arguments').value;
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


    // setTimeout is being called within an async function. Therefore, we promisify it according to
    // https://nodejs.org/api/timers.html#timers_settimeout_callback_delay_args
    const promisifySetTimeout = (j) => j
        .find(jsc.CallExpression)
        .filter(callExpressionMatching(/^setTimeout$/))
        // .filter((path) => jsc.Identifier.check(path.value.callee) && path.value.callee.name === 'setTimeout')
        .forEach((path) => {
            let [f, timeout] = path.value.arguments;
            f.async = true;
            path.replace(
                jsc.awaitExpression(
                    jsc.callExpression(
                        jsc.memberExpression(
                            jsc.callExpression(
                                jsc.identifier(setTimeoutPromiseName),
                                [ timeout ]
                            ),
                            jsc.identifier('then')
                        ),
                        [ f ]
                    )
                )
            )
        });


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
    const replaceVariableUsage = (j) => j
        .find(jsc.CallExpression)
        .filter((p) => jsc.Identifier.check(p.value.callee))
        .filter((p) => /^it$/.test(p.value.callee.name))
        // .at(39)
        // .forEach((p) => console.log(jsc(p).toSource()))
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
                        varNames.has(varName) || environment.has(varName),
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
            const allVarsRegex = new RegExp(`{{(${[...environment.keys(), ...varNames.values()].join('|')})}}`);
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
                    // All other variables we'll replace with instances of pm.environment.get
                    const allVarsReplaced = [...environment.keys()]
                        .reduce((pv, varName) => pv.replace(
                            new RegExp(`{{${varName}}}`), `\${pm.environment.get('${varName}')}`
                        ), localVarsReplaced);
                    const newCode = `\`${allVarsReplaced}\``;
                    const newNode = jsc(newCode).getAST()[0].value;
                    path.replace(newNode);
                })
        })


    // Notify the user of anything that looks like variables that haven't been replaced
    const notifyUnreplacedVariables = (j) => {
        console.log('Found the following variable-like strings that have not been replaced with pm.environment.get or local variables:');
        j.find(jsc.Literal)
            .filter((path) =>
                typeof path.value.value === 'string' && pmVariableRegex.test(path.value.value)
            )
            .map((path) => path.get('value'))
            .nodes()
            .map(n => [...n.matchAll(pmVariableRegex)]) // get all matches
            // .forEach(n => console.log(n))
            .reduce((acc, cv) => [...acc, ...cv]) // flatten our array of arrays of matches into an array of matches
            .map(m => m[0]) // take the first element of each match, the matched string
            .sort()
            .reduce((acc, cv) => acc.includes(cv) ? acc : [...acc, cv], []) // remove duplicates
            .forEach(mStr => console.log(mStr));
            // .forEach(pmVarName => console.log(pmVarName));
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
    // pm.test("Status code is blah", function () {
    //   pm.response.to.have.status(200);
    // });
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
                            jsc.identifier('assert'),
                            [
                                jsc.binaryExpression(
                                    "===",
                                    jsc.memberExpression(
                                        jsc.identifier(axiosResponseVarName), // TODO: gotta determine what this value ("resp") actually is, or use jscodeshift to generate or analyse the axios response identifier
                                        jsc.identifier('status')
                                    ),
                                    jsc.literal(code)
                                ),
                                jsc.literal(desc)
                            ]
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
            assert(jsc.FunctionExpression.check(pmTestCallback) || jsc.ArrowFunctionExpression.check(pmTestCallback))
            assert(pmTestCallback.body.body.length === 1);
            assert(jsc.ThrowStatement.check(pmTestCallback.body.body[0]));
        })
        .forEach((path) => {
            path.replace(
                path.value.consequent
            );
        });


    // Replace response.json().headers with response.headers
    const replaceResponseJsonHeaders = (j) => j
        .find(jsc.MemberExpression)
        .filter((path) => astNodesAreEquivalent(
            path.value,
            jsc.memberExpression(
                jsc.callExpression(
                    jsc.memberExpression(
                        jsc.identifier('response'),
                        jsc.identifier('json')
                    ),
                    []
                ),
                jsc.identifier('headers')
            )
        ))
        .forEach((path) => path.replace(
            jsc.memberExpression(
                jsc.identifier('response'),
                jsc.identifier('headers')
            )
        ))


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
    promisifySetTimeout(j);
    replaceTestResponse(j);
    replacePmResponseJson(j);
    replacePmResponseCode(j);
    assertPmResponseIsReplaced(j);
    replaceVariableUsage(j);
    notifyUnreplacedVariables(j);
    assertPmVariablesCallsGone(j);
    transformForEachToAwaitPromiseAll(j);
    // TODO: should we _ever_ do this?
    // Don't do this: sometimes we get a response back (from the simulators) that contains
    // _response data_. In other words, response looks like:
    // {
    //   headers: { ... }
    //   data: {
    //     headers: { ... }
    //     data: { ... }
    //   }
    // }
    // replaceResponseJsonHeaders(j);
    removeResponseResponseSize(j);
    removeJsRsaSignEvalAndRelatedRubbish(j);
    assertNoEval(j);

    await fs.writeFile(testFileName, j.toSource({ tabWidth: 4 }));

    // TODO: transformations:
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
    //  4. Identify pm.variables.get/set and create those variables with an appropriate scope in the
    //     code.
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
    // 12. Convert all pm.sendRequest to axios using convertRequest
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
    // 17. Convert all
    //       pm.test("Description", () => pm.expect(value).assertion);
    //     to the simpler:
    //       pm.expect(
    //          value,
    //          'Description'
    //       ).assertion;
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
    // 23. Print all `it()`, `describe()` descriptions to help identify duplication.
    //     Print all request contents to help identify duplication.
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
    // 27. Consider analysing usage of `var` and applying `const` or `let` where appropriate
    //     (although, eslint is likely to do this for us, I would think)
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
    // 35. Replace tv4 with ajv (which is faster- might speed tests)

    // Examples:
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
})();
