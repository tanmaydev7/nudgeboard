import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HomeScreen } from './screens/HomeScreen';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <HomeScreen />
    </SafeAreaProvider>
  );
}

export default App;
