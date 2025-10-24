const jsx = (type, props, key) => ({ type, props: props || {}, key: key ?? null });
const jsxs = jsx;

module.exports = {
  __esModule: true,
  jsx,
  jsxs,
  Fragment: 'Fragment',
};
