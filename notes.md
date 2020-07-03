
Method
1. Recurse the collection
2. Categorise all "item" instances as either leaf or non-leaf nodes.
3. Categorise all leaf nodes as those that had requests and those that did not have requests. All
   have requests, presumably this is a property that is enforced by test creation in Postman.
   NB: the Postman collection schema has two types for _Item_: _Item_ and _Folder_.
4. Categorise all non-leaf nodes as those that had requests and those that did not have requests.
   No non-leaf nodes had requests, presumably this is a property that is enforced by folder
   creation in Postman. Therefore, leaf nodes will henceforth be referred to as _requests_ and
   non-leaf nodes will be referred to as _folders_. (This may be the Postman parlance).
   NB: the Postman collection schema has two types for _Item_: _Item_ and _Folder_.
5. Categorise all folders (remembering that none have requests) into those that have event scripts
   and those that do not. It is possible for folders to have event scripts that will run before or
   after all the tests stored within them, but none of the Mowali/ML tests do this.
6. Identified all postman sandbox functionality used:
    ```sh
    grep 'pm\.[^\(]*' Golden_Path_Mowali.postman_collection.json -o | sort | uniq > pm.js
    ```
7. Identified the function signatures for the sandbox functionality we used with the help of
    https://learning.postman.com/docs/postman/scripts/postman-sandbox-api-reference/
    and, e.g.
    ```sh
    grep 'pm\.iterationData\.get([^)]*)' Golden_Path_Mowali.postman_collection.json -o | sort | uniq > pm.iterationData.get
    ```
8. Confirmed that all instances of `.event.script.type === 'text/javascript'`. I.e. all prerequest
   and test scripts are javascript.

Examine all instances of the `pm` global to see what we use
- Can we just _implement_ the `pm` global in the output?
- Could we part-implement it?
    All calls, extracted as follows:
    ```sh
    grep 'pm\.[^\(]*' Golden_Path_Mowali.postman_collection.json -o | sort | uniq
    ```
    ```
    pm.environment.get
    pm.environment.set
    pm.expect
    pm.iterationData.get
    pm.response.code
    pm.response.json
    pm.response.to.have.status
    pm.sendRequest
    pm.test
    pm.test.skip
    pm.variables.get
    pm.variables.set
    ```
- `pm.environment` is global, I guess- this means we'd have to actually figure out the scope of the
  variables it references if we want to get rid of it. Or set them all as global variables.
- What is the difference between `pm.variables` and `pm.environment`? `pm.variables` content will
  never be sent to Postman cloud.
- `pm.sendRequest` implementation appears to look like this:
    ```javascript
    var http = require('follow-redirects').http;
    var fs = require('fs');

    var options = {
      'method': 'GET',
      'hostname': 'kjur.github.io',
      'path': '/jsrsasign/jsrsasign-latest-all-min.js',
      'headers': {
      },
      'maxRedirects': 20
    };

    var req = http.request(options, function (res) {
      var chunks = [];

      res.on("data", function (chunk) {
        chunks.push(chunk);
      });

      res.on("end", function (chunk) {
        var body = Buffer.concat(chunks);
        console.log(body.toString());
      });

      res.on("error", function (error) {
        console.error(error);
      });
    });

    req.end();
    ```

Examine all instances of `{{.*}}` (i.e. postman environment variables)
How are they used? I.e., can they be used in any string?
Where those are used, what is their type?
Are they always used from `pm.environment.get`?
Is it possible to replace every use of `{{VAR_NAME}}` with `` `${pm.environment.get(VAR_NAME)}` ``?
The list:
```
{{BACKEND_REPORTING_API}}
{{BASE_CENTRAL_LEDGER_ADMIN}}
{{BASE_CENTRAL_SETTLEMENT}}
{{BASE_PATH_SWITCH}}
{{BEARER_TOKEN}}
{{closedWindowID}}
{{dateHeader}}
{{DFSPEURSettlementAccountId}}
{{DFSPGHSSettlementAccountId}}
{{DFSPMADNDC}}
{{DFSPMADSettlementAccountId}}
{{DFSPRWFSettlementAccountId}}
{{DFSPUGXSettlementAccountId}}
{{DFSPZMWSettlementAccountId}}
{{dob}}
{{endTime}}
{{endTime311}}
{{endTime312}}
{{EURGHSChannelId}}
{{EURMADChannelId}}
{{firstName}}
{{forexQuoteReceiveAmount}}
{{fspiopSignature}}
{{fullName}}
{{fundsInPrepareAmount}}
{{fundsInPrepareTransferId}}
{{FXP_ENDPOINT}}
{{fxpSettlementProcessId}}
{{HOST_CENTRAL_LEDGER}}
{{HOST_CENTRAL_SETTLEMENT}}
{{HOST_SWITCH}}
{{hub_operator}}
{{HUB_OPERATOR_BEARER_TOKEN}}
{{hubSettlementId}}
{{lastName}}
{{middleName}}
{{openWindowID}}
{{partyNotFoundMSISDN}}
{{payeefspMSISDN}}
{{payerfsp}}
{{PAYERFSP_BEARER_TOKEN}}
{{paymentFileName}}
{{quoteDate}}
{{quoteRequest}}
{{receiverFSPNoResponseMSISDN}}
{{REPORTING_API}}
{{RWFUGXChannelId}}
{{RWFZMWChannelId}}
{{scenario1.result.transferId}}
{{startTime}}
{{startTime311}}
{{startTime312}}
{{TESTFSP3_BACKEND_TESTAPI_URL}}
{{TESTFSP3_BEARER_TOKEN}}
{{testfsp3BlockTransferAmount}}
{{testfsp3ForexCurrency}}
{{testfsp3MSISDN}}
{{testfsp3ParticipantId}}
{{testfsp3SettlementAccountId}}
{{TESTFSP4_BACKEND_TESTAPI_URL}}
{{TESTFSP4_BEARER_TOKEN}}
{{testfsp4ForexCurrency}}
{{testfsp4MSISDN}}
{{testfsp4ParticipantId}}
{{testfsp4SettlementAccountId}}
{{TESTFSP5_BACKEND_TESTAPI_URL}}
{{TESTFSP5_BEARER_TOKEN}}
{{testfsp5MSISDN}}
{{TESTFSP6_BACKEND_TESTAPI_URL}}
{{TESTFSP6_BEARER_TOKEN}}
{{testfsp6MSISDN}}
{{TESTFSP7_BACKEND_TESTAPI_URL}}
{{TESTFSP7_BEARER_TOKEN}}
{{testfsp7MSISDN}}
{{TESTFSP8_BACKEND_TESTAPI_URL}}
{{testfsp8MSISDN}}
{{TMF_ENDPOINT}}
{{transferDate}}
{{transferRequest}}
{{UGXRWFChannelId}}
{{UGXZMWChannelId}}
{{unregisteredFSPMSISDN}}
{{unregisteredMoroccoMSISDN}}
{{validUntilTime}}
{{valueDate}}
{{ZMWRWFChannelId}}
{{ZMWUGXChannelId}}
```

Postman allegedly uses chai for assertions
How can we tie tests back to their origin in case of bugs etc.? Perhaps just using the `name`?
Documentation for the collection schema:
    https://schema.getpostman.com/collection/json/v2.1.0/draft-07/docs/index.html

Take a migration all the way through to Majestic

Shortcomings of Postman:
0. Is there any serious organisation that uses postman for automated testing? No, that's because of
   the following.
1. Impossible to diff, version control, peer review
2. Global state shared between tests
3. Code reuse is difficult and painful
    * it's difficult to factor repeated code into a function for reuse elsewhere in the tests
    * it's _more_ difficult to factor repeated code into a function for reuse outside the tests
    * it's practically impossible to have two people develop tests simultaneously then merge their
        changes in version control
    * it's difficult and painful to incorporate shared code from elsewhere
   This is a large part of the reason the tests we have are brittle, because it's tedious and
   difficult to specify a wide range of system state for each test, because doing so would require
   copying and pasting a lot of code. This rapidly introduces an unsustainable maintenance burden
   (for Sri especially, who already doesn't have any time).
4. No watch mode
5. Not portable (as evidenced by this effort)- in contrast, test runners from npm often provide
   automatic conversion scripts. For example, the conversion of quoting service from ava to jest
   was a mostly-automatic job, with about thirty minutes of semi-manual work.
6. Tooling and ecosystem is inferior. One implication of this is that, if we want to embark on an
   effort to improve our tests, we are limited to what Postman provides us. For example, it would
   be futile to engage in an effort such as automatic rewriting. Similarly, if the performance or
   execution time of our test suite needs work, we are limited to what Postman provides, which,
   compared with the broader ecosystem, is a severe limitation indeed.
7. This refactor effort indicates postman is not appropriate. Why is setTimeout always called with
   the literal argument `2000` instead of a variable? Because everyone feels that
   `pm.environment.get` (mutable global state) is bad and overkill. JS test runners have a
   _parameter_ for test timeout and "afterall", "aftereach". JS request libraries can be configured
   per-instance or globally.
8. Requires training. I.e.
     - UI training
     - What are variable scoping rules?
     - How do I run "after" or "before" functions?
     - How do I use Postman's assertion library?
     - How do I share my work?
   This isn't very valuable knowledge or experience, people are not interested as it is specific to
   postman, it is not transferable, as standard js test runner and assertion library experience is.
9. Enforces usage of a specific tool
10. Output control, and run control in general is more limited
11. Image- what other serious open source project uses postman for testing?
12. Fails silently when variables, configuration, data are missing. E.g.
    `pm.request({{MISSING_VARIABLE}})` does not produce an error indicating the variable is not
    present, it simply proceeds.
13. Postman is tedious to use. Want the latest tests?
    1. Remove your current environment and test suite
    2. Update them from their respective sources
    3. Re-import them
    4. Try to remember where you left off
14. Postman is tedious to use. Where is a variable set?
    1. Try the environment variables
    2. Try to see if it's reset somewhere else
    3. Just go hunting around because there's no modern search mechanism _like a plain-text search,
       for example_.
    4. Go on a mystical journey of discovery, to the depths of the postman mines.
    5. Find yourself lost after spelunking deep within the labyrinth, your breadcrumbs washed away
         by stray global data mutation.
    6. As you become more desparate for intellectual sustenance, modify usage of a "postman
         variable" in a request, making a typo and accidentally setting it to an invalid value, not
         realising that postman will silently ignore your error.
    7. Enter a trance, your mind flickering like star formation in a sparse gas nebula, your body a
         sunken log in a peat bog.
    8. Awake days later, unsure where you are or whether any of it really happened.
    9. See a PR to the `test-scripts` repo and realise it's all real.
    10. Despair. Ennui. Horror. Terror. Disgust.
    11. Fin.
Good features of Postman:
1. Pleasant UI for running subsets of tests etc
2. Some good aspects of test report output
3. Easier to run a subset of tests
