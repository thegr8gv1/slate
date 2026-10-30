import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';

import { SlateMark } from '../design/Icon';
import { Text } from '../design/Text';
import { color, space } from '../design/tokens';
import { homeRouteFor, useSession } from '../lib/session';

/**
 * Entry route. Holds the splash until the stored session resolves, then sends
 * the account to its workspace home so a returning user never sees sign-in.
 */
export default function Index() {
  const router = useRouter();
  const { ready, account, workspace } = useSession();

  useEffect(() => {
    if (!ready) return;
    router.replace((account ? homeRouteFor(workspace) : '/sign-in') as never);
  }, [ready, account, workspace, router]);

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', gap: space.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <SlateMark size={34} />
        <Text variant="display" style={{ letterSpacing: 7 }} upper>
          Slate
        </Text>
      </View>
      <ActivityIndicator color={color.accent} />
      <Text variant="caption" tone="faint" upper>
        Getting Slate ready for you
      </Text>
    </View>
  );
}
