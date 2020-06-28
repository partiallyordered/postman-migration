
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
1. impossible to diff, version control, peer review
2. global state shared between tests
3. code reuse is difficult and painful
    * it's difficult to factor repeated code into a function for reuse elsewhere in the tests
    * it's _more_ difficult to factor repeated code into a function for reuse outside the tests
    * it's practically impossible to have two people develop the tests simultaneously then
        reconcile their changes in version control
4. no watch mode
5. not portable (as evidenced by this effort)- test runners from npm often provide automatic
   conversion scripts
Good features of Postman:
1. pleasant UI for running subsets of tests etc
2. some good aspects of test report output
3. easier to run a subset of tests
