module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts|tsx)$': '<rootDir>/test-utils/esbuild-jest-transform.js',
  },
  moduleNameMapper: {
    '^react$': '<rootDir>/test-utils/reactStub.js',
    '^react/jsx-runtime$': '<rootDir>/test-utils/reactJsxRuntimeStub.js',
  },
  testMatch: [
    '**/__tests__/**/*.{spec,test}.[tj]s?(x)',
    '**/?(*.)+(spec|test).[tj]s?(x)',
  ],
};