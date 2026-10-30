import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { SlateMark } from '../../design/Icon';
import { Text } from '../../design/Text';
import { color, space } from '../../design/tokens';
import { useSession } from '../../lib/session';

/**
 * Auth gate.
 *
 * Restoring a session is asynchronous (a storage read plus a token check), and
 * screens mount the instant a route resolves. Without this gate a deep link
 * fires its data requests before the bearer token is installed and the API
 * correctly rejects them with a 401 — a race that only shows up on a cold load
 * of a nested URL, which is exactly how the web build is usually opened.
 *
 * Holding the tree until the session settles removes the race entirely rather
 * than papering over it with per-screen retries.
 */

const PUBLIC_ROUTES = ['/sign-in'];

export function SessionGate({ children }: { children: ReactNode }) {
  const { ready, account } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

  useEffect(() => {
    if (!ready) return;
    if (!account && !isPublic) router.replace('/sign-in');
  }, [ready, account, isPublic, router]);

  if (!ready) return <Splash label="Restoring your session" />;
  if (!account && !isPublic) return <Splash label="Redirecting to sign in" />;

  return <>{children}</>;
}

function Splash({ label }: { label: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: color.bg,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.lg,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <SlateMark size={32} />
        <Text variant="display" style={{ letterSpacing: 7 }} upper>
          Slate
        </Text>
      </View>
      <ActivityIndicator color={color.accent} />
      <Text variant="caption" tone="faint" upper>
        {label}
      </Text>
    </View>
  );
}
