module.exports = {
    reporters: [
        'default',
        [
            'jest-html-reporters',
            {
                filename: 'results_api.html',
            },
        ],
    ],
    testEnvironment: "node",
    testTimeout: 15000,
};
