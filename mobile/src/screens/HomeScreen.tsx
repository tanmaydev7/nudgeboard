import { StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

export function HomeScreen() {
  const isDarkMode = useColorScheme() === 'dark';
  const palette = isDarkMode ? colors.dark : colors.light;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: palette.text }]}>Nudgeboard</Text>
        <Text style={[styles.subtitle, { color: palette.muted }]}>
          Ready when you are.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 16,
  },
});
