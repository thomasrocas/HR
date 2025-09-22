const ReactStub = require('./reactStub');

const jsxFactory = (type, props, key) => {
  const normalizedProps = props ? { ...props } : {};
  if (key !== undefined) {
    normalizedProps.key = key;
  }
  return ReactStub.createElement(type, normalizedProps);
};

module.exports = {
  jsx: jsxFactory,
  jsxs: jsxFactory,
  Fragment: ReactStub.Fragment,
};
