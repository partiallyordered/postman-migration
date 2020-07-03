
// TODO:
// - How to verify the transformation is correct?
//   - Count assertions?
//   - Count tests (i.e. `it` blocks)?
// - _Make files_. The current file is way too big to run practically. Note that ast-types has a
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

const collection = require('../Golden_Path_Mowali.postman_collection.json');
const util = require('util');
const pp = (...args) => console.log(util.inspect(...args, { depth: 2, colors: true }));
const fs = require('fs').promises;
const jsc = require('jscodeshift');
const { transformCollection, convertRequest } = require('./transformCollection');
const assert = require('assert').strict;
const recast = require('recast');

const axiosResponseVarName = 'resp';
// TODO: convert this to ast-types? That way we can, for example, refer to setTimeoutPromiseName as
// a node, rather than a string.
const setTimeoutPromiseName = 'setTimeoutPromise';
const preamble = [
    'const axios = require(\'axios\');',
    'const uuid = require(\'uuid\');',
    'const { createPmSandbox } = require(\'./pm\');',
    'const pm = createPmSandbox({});',
    'const { promisify } = require(\'util\');',
    `const ${setTimeoutPromiseName} = promisify(setTimeout);`,
    'const pmEnv = require(\'../environments/Casa-DEV.postman_environment.json\').values;',
    'pmEnv.forEach(({ key, value }) => pm.environment.set(key, value));',
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

    // Check node equivalence. Useful for determining whether two variables have the same definition.
    // Next: write something to determine the lowest shared scope. Seems `path` types have a `.scope`
    // property.
    // Usage: astNodesAreEquivalent(path1.value, path2.value)
    const astNodesAreEquivalent = recast.types.astNodesAreEquivalent;

    // TODO: performance: this function is fairly slow
    const callExpressionMatching = (regex) => (astPath) => {
        const call = jsc(astPath.get('callee')).toSource();
        return call.match(regex);
    };

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
        assert(firstArgs.every((path) => path.value.type === 'Identifier'));

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
                declarations.every((path) => path.value.init.type === 'ObjectExpression'),
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
                    assignedValue.value.type === 'Literal' && assignedValue.value.value.match(/get/i),
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
                        "const",
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
        // .filter((path) => path.value.callee.type === 'Identifier' && path.value.callee.name === 'setTimeout')
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

    const replaceStringLiteralsWithPostmanEnvironment = (j) => j
        .find(jsc.Literal)
        .filter(
            (path) => typeof path.value.value === 'string' && path.value.value.match(/{{[^}]+}}/)
        )
        // .at(0)
        .forEach((path) => {
            const newStr = path.value.value.replace(/{{([^}]+)}}/g, '${pm.environment.get(\'$1\')}');
            const newCode = `\`${newStr}\``;
            const newNode = jsc(newCode).getAST()[0].value;
            path.replace(newNode);
        });

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
                                    jsc.memberExpression(
                                        jsc.memberExpression(
                                            jsc.memberExpression(
                                                jsc.memberExpression(
                                                    jsc.identifier('pm'),
                                                    jsc.identifier('response'),
                                                ),
                                                jsc.identifier('to'),
                                            ),
                                            jsc.identifier('have'),
                                        ),
                                        jsc.identifier('status')
                                    ),
                                    [jsc.literal(code)]
                                )
                            )
                        ])
                    )
                ]
            );

        const signatureMatches = (path) =>
            path.value.arguments.length === 2
                && path.value.arguments[0].type === 'Literal'
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
        // .forEach((path) => console.log(jsc(path).toSource()))

    const identifyAllPmResponseUsage = (j) => j
        .find(jsc.MemberExpression)
        .filter((path) =>
               path.value.object.type === 'Identifier'
            && path.value.property.type === 'Identifier'
            && path.value.object.name === 'pm'
            && path.value.property.name === 'response')
        // .at(30)
        .map((path) => {
            // work upward until the parent is not a memberexpression or a callexpression
            let curr = path;
            let parent = path.parentPath;
            while (parent.value.type === 'MemberExpression' || parent.value.type === 'CallExpression') {
                curr = parent;
                parent = curr.parentPath;
            }
            return curr;
        })
        .forEach((path) => {
            // console.log(path);
            // recast.print(path);
            // use
            // npm run transform | sort | uniq
            console.log(jsc(path).toSource().replace('\n', ' '))
        });
        // .forEach((path) => console.log(summarise(path.value)))
        // .forEach((path) => console.log(path.parentPath));
        // .filter((path) => summarise(path.value).match(/^pm.response/))
        // .forEach((path) => console.log(path));

    // assertPmHttpRequestsAreAllPojos(j);
    transformPmSendRequestToAsync(j);
    // assertSetTimeoutCalledWithTwoArgs(j);
    promisifySetTimeout(j);
    replaceTestResponse(j);
    replacePmResponseJson(j);
    identifyAllPmResponseUsage(j);
    replaceStringLiteralsWithPostmanEnvironment(j);

    // can postman users use {{}} to access a variable set with pm.variables.set()?
    // how do we know whether to use pm.variables.get or pm.environment.get for {{}}?
    // is the environment persisted to the environment json file after a test run?

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
    //  1. Replace the _hilarious_ presence of jrsassign in (1) the environment and (2) the code
    //
    //  2. Replace all usage of eval..
    //
    //  3. Identify pm.environment.get and pm.environment.set calls, and their scope, then declare
    //     variables at an appropriate level (or don't and manually evaluate this stuff)
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
    //  7. Wherever pm.sendRequest is called, transform this to a 
    //
    //  8. Check for variables that look like they should be in a test data file/variable. For
    //     example, variables that are duplicated in multiple places (e.g. every argument to
    //     pm.sendRequest), declared const, never rewritten or modified.
    //
    //  9. Replace variables i.e. '{{HOST_CENTRAL_LEDGER}}' in requests with references to
    //     `pm.environment` or `pm.variables` or whatever's appropriate.
    //
    // 10. Remove trailing whitespace
    //
    // 11. Hoist (remove?) all `require` statements (might be a job for `eslint --fix`)
    //
    // 12. Convert all pm.sendRequest to axios using convertRequest
    //
    // 13. Convert all `var` usages to `let` or `const`?
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

    // Example:
    // Demonstrate that both declarations of `testfsp3GetStatusRequest` are equivalent (i.e.
    // copy-pasted)
    // const decs = j
    //     .find(jsc.Identifier)
    //     .filter(p => p.value.name.match(/^testfsp3GetStatusRequest$/))
    //     .getVariableDeclarators(path => path.value.name);
    // const nodes = decs.nodes();
    // assert(nodes.length > 1);
    // pp(nodes.length);
    // pp(astNodesAreEquivalent(nodes[0], nodes[1]));
})();
