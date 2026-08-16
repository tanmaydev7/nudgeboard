module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: [
    require.resolve('@react-native/jest-preset/jest/setup.js'),
    '<rootDir>/node_modules/react-native-gesture-handler/jestSetup.js',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@gorhom|react-native-gesture-handler|react-native-reanimated|react-native-worklets|react-native-safe-area-context)/)',
  ],
};
