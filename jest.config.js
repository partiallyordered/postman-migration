module.exports = {
    reporters: [
        'default',
        [
            'jest-html-reporters',
            {
                filename: 'results_api.html',
            },
        ],
        [
            '../../lib/json-jest-reporter/index.js',
            {
                outputFile: 'results_api.json',
            },
        ],
    ],
    testEnvironment: "node",
    testTimeout: 15000,
};
