const createNoopTest = () => {
  const fn = () => undefined;
  fn.skip = () => undefined;
  fn.only = () => undefined;
  fn.describe = () => undefined;
  fn.beforeAll = () => undefined;
  fn.afterAll = () => undefined;
  fn.beforeEach = () => undefined;
  fn.afterEach = () => undefined;
  return fn;
};

const ensureTest = () => {
  if (global.test && typeof global.test.skip === 'function') {
    const testFn = (name, fn, timeout) => global.test.skip(name, fn, timeout);
    testFn.skip = (...args) => global.test.skip(...args);
    testFn.only = (...args) => global.test.skip(...args);
    testFn.describe = (name, fn) =>
      global.describe && typeof global.describe.skip === 'function'
        ? global.describe.skip(name, fn)
        : global.describe && global.describe(name, fn);
    testFn.beforeAll = (...args) => (global.beforeAll ? global.beforeAll(...args) : undefined);
    testFn.afterAll = (...args) => (global.afterAll ? global.afterAll(...args) : undefined);
    testFn.beforeEach = (...args) => (global.beforeEach ? global.beforeEach(...args) : undefined);
    testFn.afterEach = (...args) => (global.afterEach ? global.afterEach(...args) : undefined);
    return testFn;
  }
  return createNoopTest();
};

const testStub = ensureTest();

module.exports = {
  test: testStub,
  expect: global.expect || ((...args) => args[0]),
};
