import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { color } from '../design/tokens';
import { SessionGate } from '../features/shell/SessionGate';
import { SessionProvider } from '../lib/session';
import '../global.css';

/**
 * Root layout.
 *
 * Deliberately thin: one Stack with headers off, because the app draws its own
 * chrome in `<Screen>`. Letting the navigator render platform headers would
 * produce a different bar on iOS, Android and the web — the exact thing the
 * design system exists to prevent.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.bg }}>
      <SafeAreaProvider>
        <SessionProvider>
          <View style={{ flex: 1, backgroundColor: color.bg }}>
            <StatusBar style="light" />
            <SessionGate>
              <Stack
                screenOptions={{
                  headerShown: false,
                  animation: 'fade',
                  contentStyle: { backgroundColor: color.bg },
                }}
              />
            </SessionGate>
          </View>
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
