const { transformSync } = require('esbuild');

module.exports = {
  process(src, filename) {
    const loader = filename.endsWith('.tsx')
      ? 'tsx'
      : filename.endsWith('.ts')
      ? 'ts'
      : 'js';
    const result = transformSync(src, {
      loader,
      format: 'cjs',
      target: 'es2019',
      sourcemap: 'inline',
    });
    return { code: result.code, map: result.map || '' };
  },
};
