const noop = () => null;

const stub = new Proxy(noop, {
  apply: () => noop,
  get: (target, prop) => {
    if (prop === '__esModule') return true;
    if (prop === 'default') return stub;
    if (prop === 'Fragment') return 'Fragment';
    return noop;
  },
});

module.exports = stub;
