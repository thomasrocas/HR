module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]sx?$': '<rootDir>/test-utils/esbuild-jest-transform.js',
  },
  moduleNameMapper: {
    '^react$': '<rootDir>/test-utils/reactStub.js',
    '^react/jsx-runtime$': '<rootDir>/test-utils/reactJsxRuntimeStub.js',
    '^@playwright/test$': '<rootDir>/test-utils/playwrightTestStub.js',
    '^\.\./src/(.*)$': '<rootDir>/public/src/$1',
    '^\.\./\.\./shared/(.*)$': '<rootDir>/shared/$1',
  },
  modulePathIgnorePatterns: [
    '<rootDir>/public/node_modules',
    '<rootDir>/public/package.json',
  ],
  testMatch: [
    '**/__tests__/**/*.{spec,test}.[tj]s?(x)',
    '**/?(*.)+(spec|test).[tj]s?(x)',
  ],
};
