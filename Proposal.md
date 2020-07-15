# Migrate Test Suites from Postman to Javascript

This proposal outlines a vision for a new role for Postman in Mojaloop and Mowali. This document
gives a background on Postman and its use in these projects. It discusses shortcomings with Postman
and its use. It proposes that the Mojaloop project and test suite have outgrown Postman. As a
solution, it proposes an automatic migration path from Postman to the open-source Javascript test
runner, _Jest_.

Intended readers are
* users of Postman within Mojaloop and associated projects
* Mojaloop and Postman test authors and QA personnel

It is assumed the reader is familiar with broader Mojaloop terminology. There is a small
[Glossary](#glossary) for definitions relevant to this document in particular.

## Table of Contents
[Background](#background)
[Motivation](#motivation)
  [Summary](#summary)
  [Detail](#detail)
[A Way Forward](#a-way-forward)
[Glossary](#glossary)

## Background

### What is Postman?
Postman calls itself _The Collaboration Platform for API Development_. Postman allows users to
generate a suite of API requests, tests and configuration for testing against various environments.
These can be shared between users of Postman cloud with ease, or via other mechanisms with a little
more difficulty.

### What is Postman _good_ for?
Postman provides a pleasant UI and a mechanism to encode and share an API client.

### What is Postman used for in Mojaloop and Mowali?
Postman is used as
1. A user interface to Mojaloop for developers, testers and operators to exercise FSPIOP and
   Mojaloop admin functionality.
2. A suite of tests for developers and testers to run against Mojaloop interactively.
3. A suite of tests to run in CI environments.

### Implementation
- TODO: why was Postman selected? better than Cucumber or something? flexible?

## Motivation
This section details the motivation for this proposal. It will discuss shortcomings of Postman.

### Summary
The shortcomings of Postman mean that
- Mojaloop has outgrown Postman
    - Collaboration on Postman tests will become impossible as the number of contributors grows.
        Test developers will need to make changes and race to merge them before that is rendered
        impossible by further development of the collection. This is because of the difficulty of
        code diffs of Postman collections.
    - The quality of tests will decrease as the test suite size increases due to the difficulty of
        code reuse within Postman collections.
    - Test maintenance will become a rapidly increasing burden as the test suite grows.
- Quality assurance is fundamentally impossible due to difficulty reviewing Postman collection
    diffs. This is the largest usage of Postman in Mojaloop.
- The test suite will grow increasingly flaky. This is fundamentally because of the asynchronous
    nature of the FSPIOP API. Postman requires timeouts and polling to work around this problem. It
    is not practical to use the wider Javascript ecosystem to improve the quality and consistency
    of the tests due to the limitations of the Postman sandbox.

### Detail

#### Peer review
Because version controlling Postman collections and environments results in very hard-to-read
diffs, it's very difficult to peer review changes to collections and environments.

Some examples:
1. https://github.com/mojaloop/postman/pull/143/files
2. https://github.com/mojaloop/postman/pull/117/files
3. https://github.com/mojaloop/postman/pull/135/files

As a consequence, we resort to a screenshot of passing tests, which is a poor substitute for peer
review. Example:  
https://github.com/mojaloop/postman/pull/143

In the author's opinion, this limitation renders Postman fundamentally inadequate for quality
assurance.

#### Collaboration
Postman collection changes produce very large, unwieldly diffs (see [Peer review](#peer-review) for
examples). This makes maintenance of code changes very difficult. If one makes some changes, but
other changes land in the main branch in the interim, it is exceedingly difficult to merge both
sets of changes. This precludes the possibility of maintaining a fork for longer-lived differences,
a frequent requirement during development.

#### Code reuse
Postman makes code reuse very difficult. To share code between tests, one must store and retrieve
these as Postman variables or environment. To use code from outside of Postman, one may set and
retrieve said code (stringified in a JSON file) in Postman environment files, or retrieve this code
using an HTTP request from Postman. In both cases, that code must then be executed in the Postman
environment using `eval` (a security risk in certain contexts).

Because code reuse is so difficult, users resort to one of the following options:
1. *Copying and pasting to achieve reuse*. This leads to a huge maintenance burden and a rapidly
    increasing error rate in the tests, as test authors must correctly and comprehensively
    duplicate changes in multiple places.
2. *Tests that depend on other tests to set the system state*. This makes failures _very_ difficult
    to diagnose: when a test fails, one must first identify which _other_ tests are required to
    establish the system state as expected. _"Is my test failing because I didn't run the correct
    tests before it? Which are the correct tests?"_. Postman does not make it easy to declare or
    discover this information: a manual hunt is the strategy of last resort in this scenario.
3. *Tests that make assumptions about the system state*. This results in flaky tests.

#### The Wider Development Ecosystem
Postman limits users to the functionality provided in [its sandbox](https://learning.postman.com/docs/writing-scripts/script-references/postman-sandbox-api-reference/).
It is difficult at best to leverage the wider ecosystem of tools and libraries available to a
normal development environment or programming language. Some examples:
- In Mowali it was necessary to use a branch of newman in order to use more than one TLS
    certificate.
- Postman does not support websockets and therefore cannot utilise, for example, [this PR](https://github.com/mojaloop/sdk-scheme-adapter/pull/185).
    This is very useful functionality for an asynchronous API such as FSPIOP-API. Postman has had
    [a PR open for this issue for more than 18 months](https://github.com/postmanlabs/postman-app-support/issues/4009).
- Automatic conversion of Postman tests to Jest used _jscodeshift_, a tool for large-scale
    automated analysis and transformation of javascript code. This sort of analysis and
    transformation is not accessible to tests written with Postman.
- Postman supports a much more limited range of output formats and integrations than
    the wider javascript ecosystem.

#### Javascript Skills
Javascript experience is required to work on Mojaloop effectively. It is an increasingly common
skill set and is highly available in the market. Much more so than Postman skills. Tests written
targeting a commonly used Javascript runner would be more accessible to prospective users of and
contributors to Mojaloop.

#### Postman Sandbox and Execution Model
Postman introduces a sandbox and "scripting" model with
- [a confusing hierarchy of variable scopes](https://learning.postman.com/docs/sending-requests/variables/#variable-scopes)
- [a confusing execution model with explicitly shared data](https://learning.postman.com/docs/writing-scripts/intro-to-scripts/#execution-order-of-scripts)
- TODO

- "Pre-request scripts", "request", "test"
- "pm.variables", "pm.environment", "pm.iterationData", "pm.globals", "pm.collections"

## A Way Forward

### Test Suites
This document proposes that all usage of Postman for automated testing should be replaced by Jest.
A tool exists to automatically convert Postman tests to Jest javascript tests. It has been
successfully used to convert the entire Mowali Postman test suite. It does not produce perfect
code, but it produces code that can be much more easily maintained, refactored and improved than
Postman collections.

### Postman's Role
This document proposes one use for Postman as a UI for the Mojaloop admin API, and the FSPIOP API.
The Mojaloop project should scale back its usage of Postman to provide an example set of requests
against these APIs to enable interactive testing and usage of Mojaloop and FSPIOP functionality.

One limitation of this proposal is the asynchronous nature of the FSPIOP API. Postman is not
well-suited to this type of interface and it may not be useful for this task. In this case, it
may still be deemed useful as an interface to the Mojaloop admin API, for system operators and QA.

## Glossary

| Postman         | See [What is Postman?](#what-is-postman). https://www.postman.com/ |
| Collection      | A suite of tests written in Postman |
| Environment     | A configuration file for Postman    |
| Jest            | A javascript test runner: https://jestjs.io/ |
| Postman sandbox | A Postman test execution environment |
