const assert = require('assert').strict;
const axios = require('axios');
const expect = require('chai').expect;

const globalDataLol = {};

const createPmSandbox = (reportsSpec) => {
    const result = {
        // https://learning.postman.com/docs/postman/scripts/postman-sandbox-api-reference/#pmenvironment
        environment: {
            // pm.environment.get(variableName:String):function → *
            get: (keyStr) => globalDataLol[keyStr],
            // pm.environment.set(variableName:String, variableValue:String):function
            set: (keyStr, val) => {
                globalDataLol[keyStr] = val;
            },
        },

        // pm.expect(assertion:*):Function → Assertion
        // pm.expect is a generic assertion function. Underlying this is the ChaiJS expect BDD library.
        expect,

        // pm.iterationData.get(variableName:String):function → *. Returns a variable from the iteration
        // data with the specified name.
        // In our case, we only ever call this as follows:
        //   pm.iterationData.get(\"reportsSpec\")
        // Therefore, we can implement this as: pm.iterationData.get -> require('./reportsSpec.json');
        // In general, iteration data seems to come from the environment, either on the
        // command-line (newman) or created with
        // `pm.iterationData.set(key: string, value: any, type: string): function → void`
        iterationData: {
            get: () => reportsSpec
        },

        // https://learning.postman.com/docs/postman/scripts/postman-sandbox-api-reference/#pmresponse
        // Usage:
        //  pm.expect(pm.response.code).to.be.oneOf([200,201,202,204])
        //  pm.expect(pm.response.code).to.be.oneOf([204, 500])
        //  pm.response.json()
        //  pm.response.to.have.status(200)
        //  pm.response.to.have.status(202)
        //  pm.response.to.have.status(400)
        // response: {
        //     code
        //     json
        //     to.have.status
        // }

        // https://learning.postman.com/docs/postman/scripts/postman-sandbox-api-reference/#pmsendrequest
        // The method accepts a collection SDK compliant request and a callback. The callback receives
        // two arguments, an error (if any) and an SDK-compliant response.
        sendRequest: async (request) => {
            assert(
                typeof request === 'object' && request.constructor === Object.prototype.constructor,
                'This function was written to handle POJO requests. It may make some assumptions that the argument supplied violates'
            );
            assert(
                request.method.match(/get/i),
                'This function was only written to handle HTTP GET requests'
            );

            const config = {
                method: request.method,
                url: request.url,
                headers: request.header,
            };

            console.log(config);

            const result = await axios(config);

            return { json: () => result.data };
        },

        // https://learning.postman.com/docs/postman/scripts/postman-sandbox-api-reference/#pmtest
        // pm.test(testName:String, specFunction:Function):Function
        // Actually, there's a good chance we can use codemods to detect when there's a pm.test
        // call that has only a single pm.expect inside it. Then we can rewrite that from:
        //   pm.test($description, function innerTest() => { pm.expect($whatever) })
        // to:
        //   pm.expect($whatever, $description);
        test: (testName, specFunction) => {},
        testSkip: (testName, specFunction) => {},
        // We do use this a few times, we'll assign it below :(
        // pm.test.skip: (testName, specFunction) => {},

        // https://learning.postman.com/docs/postman/scripts/postman-sandbox-api-reference/#pmvariables
        // In Postman, all variables conform to a specific hierarchy. All variables defined in the
        // current iteration take precedence over the variables defined in the current environment,
        // which overrides ones defined in the global scope. The order of precedence is Iteration Data
        // < Environment < Collection < Global.
        variables: {
            // pm.variables.get(variableName:String):function → *: Get the value of the local variable with the specified name.
            get: () => {},
            // pm.variables.set(variableName:String, variableValue:String"):function → void: Set a local variable with the given value.
            set: () => {},
        },
    };
    result.test.skip = () => {};
    return result;
};


module.exports = {
    createPmSandbox,
    globalDataLol
};
