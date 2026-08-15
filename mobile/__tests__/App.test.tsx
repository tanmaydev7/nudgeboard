/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../src/App';

jest.mock('react-native-data-scanner', () => ({
  DataScanner: {
    scanBarcode: jest.fn(),
  },
}));

test('renders pairing screen', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
