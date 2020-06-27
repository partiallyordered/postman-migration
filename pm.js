const reportsSpec = require('./reportsSpec.json');
const expect = require('chai').expect;

const pm = {
    // https://learning.postman.com/docs/postman/scripts/postman-sandbox-api-reference/#pmenvironment
    environment: {
        // pm.environment.get(variableName:String):function → *
        get: (keyStr) => {},
        // pm.environment.set(variableName:String, variableValue:String):function
        set: (keyStr, val) => {},
    },

    // pm.expect(assertion:*):Function → Assertion
    // pm.expect is a generic assertion function. Underlying this is the ChaiJS expect BDD library.
    expect,

    // pm.iterationData.get(variableName:String):function → *. Returns a variable from the iteration
    // data with the specified name.
    // In our case, we only ever call this as follows:
    //   pm.iterationData.get(\"reportsSpec\")
    // Therefore, we can implement this as: pm.iterationData.get -> require('./reportsSpec.json');
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
    sendRequest: () => {},

    // https://learning.postman.com/docs/postman/scripts/postman-sandbox-api-reference/#pmtest
    // pm.test(testName:String, specFunction:Function):Function
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

pm.test.skip = pm.testSkip;
