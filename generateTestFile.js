
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

module.exports = () => preamble;
