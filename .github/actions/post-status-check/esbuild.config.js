module.exports = (options) => {
  const isProduction = process.env.NODE_ENV === 'production' || options.configuration === 'production';
  
  return {
    ...options,
    bundle: true,
    external: [], // Don't externalize any packages
    sourcemap: !isProduction,
    outExtension: {
      '.js': '.js',
      '.cjs': '.js',
    },
  };
};
