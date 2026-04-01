module.exports = function (api) {
  api.cache(true);
  const plugins = [];
  try {
    require.resolve('react-native-worklets/plugin');
    plugins.push('react-native-reanimated/plugin');
  } catch {
    // Local env without worklets: keep bundler running.
  }
  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};
