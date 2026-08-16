jest.mock('@gorhom/bottom-sheet', () => require('@gorhom/bottom-sheet/mock'));
jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock'),
);
jest.mock('react-native-vision-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Camera: (props: object) => React.createElement(View, props),
    useCameraDevice: () => null,
    useCameraPermission: () => ({
      hasPermission: false,
      requestPermission: jest.fn(),
    }),
  };
});
jest.mock('react-native-vision-camera-barcode-scanner', () => ({
  useBarcodeScannerOutput: () => ({}),
}));
