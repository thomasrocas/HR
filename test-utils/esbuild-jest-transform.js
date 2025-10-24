const crypto = require('crypto');
const { transformSync } = require('esbuild');

function getLoader(filename) {
  if (filename.endsWith('.tsx')) return 'tsx';
  if (filename.endsWith('.ts')) return 'ts';
  if (filename.endsWith('.jsx')) return 'jsx';
  return 'js';
}

module.exports = {
  process(src, filename) {
    const loader = getLoader(filename);
    const result = transformSync(src, {
      loader,
      format: 'cjs',
      target: 'es2019',
      sourcemap: 'inline',
      sourcefile: filename,
    });

    return { code: result.code, map: result.map || null };
  },
  getCacheKey(fileData, filename, configString, options) {
    return crypto
      .createHash('md5')
      .update(fileData)
      .update('\0', 'utf8')
      .update(filename)
      .update('\0', 'utf8')
      .update(configString)
      .update('\0', 'utf8')
      .update(JSON.stringify(options || {}))
      .digest('hex');
  },
};
