import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import type { ArtOpportunity } from '../../contracts';
import { ART_CATEGORY_META } from '../../contracts/art';
import { Icon } from '../../design/Icon';
import { Text } from '../../design/Text';
import { Avatar, Button, Card, Pill, Row, Spacer, Stack } from '../../design/primitives';
import { color, radius, space } from '../../design/tokens';
import { Screen } from '../../features/shell/Shell';
import { api } from '../../lib/api';
import { useMutation, useQuery } from '../../lib/query';

export default function CollaborationDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: opp, loading, refetch } = useQuery<ArtOpportunity>(
    () => api.get<ArtOpportunity>(`/art/opportunities/${id}`),
    [id]
  );

  const [hasJoinedLocal, setHasJoinedLocal] = useState(false);

  const joinCollab = useMutation(async () => {
    await api.post<{ ok: boolean; message: string; opportunity: ArtOpportunity }>(
      `/art/opportunities/${id}/join`,
      {}
    );
    setHasJoinedLocal(true);
    Alert.alert(
      'You are in! 🎉',
      `You joined "${opp?.title}". The creative crew has been notified and a chat thread is open for you!`,
      [
        { text: 'Go to My Circles', onPress: () => router.push('/my-circles' as never) },
        { text: 'OK' },
      ]
    );
    refetch();
  });

  if (loading || !opp) {
    return (
      <Screen title="Art Collaboration" accent="Creative Details">
        <Card>
          <Text variant="body" tone="muted" align="center">
            Fetching opportunity details...
          </Text>
        </Card>
      </Screen>
    );
  }

  const meta = ART_CATEGORY_META[opp.category];
  const isJoined = opp.hasJoined || hasJoinedLocal;
  const spotsAvailable = opp.spotsTotal - opp.spotsJoined;

  return (
    <Screen
      title="Open Art Invitation"
      accent={opp.neighborhood}
      headerRight={
        <Button label="Back to Map" variant="ghost" size="sm" onPress={() => router.back()} />
      }
    >
      <Stack gap={space.lg}>
        {/* Top Highlight Banner */}
        <Card variant="alt" style={[styles.heroCard, { borderColor: meta?.pinColor ?? color.accent }]}>
          <Stack gap={space.sm}>
            <Row justify="space-between" align="center" wrap gap={space.xs}>
              <View style={[styles.categoryBadge, { backgroundColor: `${meta?.pinColor ?? color.accent}25` }]}>
                <Text variant="caption" weight="800" style={{ color: meta?.pinColor ?? color.accent }} upper>
                  {opp.categoryLabel}
                </Text>
              </View>

              <Pill label="No Experience Needed" tone="success" size="sm" />
            </Row>

            <Text variant="display" weight="800">
              {opp.title}
            </Text>

            <Row align="center" gap={space.sm} wrap>
              <Pill label={opp.activityBadge} tone="brand" size="md" />

              <Row align="center" gap={space.xxs}>
                <Icon name="pin" size={16} color={color.success} />
                <Text variant="bodyStrong" tone="success">
                  {opp.distanceMiles} miles • {opp.walkMinutes} min walk from you
                </Text>
              </Row>
            </Row>
          </Stack>
        </Card>

        {/* Quick Details Bar */}
        <Card>
          <Row justify="space-around" align="center" wrap gap={space.md}>
            <Stack gap={space.xxs} style={{ alignItems: 'center' }}>
              <Text variant="micro" tone="faint" upper>
                When
              </Text>
              <Text variant="subheading" weight="700">
                {opp.dateLabel}
              </Text>
              <Text variant="caption" tone="muted">
                {opp.timeRange}
              </Text>
            </Stack>

            <View style={styles.verticalDivider} />

            <Stack gap={space.xxs} style={{ alignItems: 'center' }}>
              <Text variant="micro" tone="faint" upper>
                Where
              </Text>
              <Text variant="subheading" weight="700">
                {opp.neighborhood}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {opp.address}
              </Text>
            </Stack>

            <View style={styles.verticalDivider} />

            <Stack gap={space.xxs} style={{ alignItems: 'center' }}>
              <Text variant="micro" tone="faint" upper>
                Spots Open
              </Text>
              <Text variant="subheading" weight="700" style={{ color: color.accent }}>
                {spotsAvailable > 0 ? `${spotsAvailable} spots` : 'Full'}
              </Text>
              <Text variant="caption" tone="muted">
                {opp.spotsJoined} joined
              </Text>
            </Stack>
          </Row>
        </Card>

        {/* The Project Story */}
        <Card>
          <Stack gap={space.sm}>
            <Row align="center" gap={space.xs}>
              <Icon name="film" size={18} color={color.brand} />
              <Text variant="subheading" weight="800">
                What We Are Making Together
              </Text>
            </Row>
            <Text variant="body" style={{ lineHeight: 22 }}>
              {opp.projectStory}
            </Text>
          </Stack>
        </Card>

        {/* What You'll Do & What You'll Learn */}
        <Row wrap gap={space.md}>
          <Card style={{ flex: 1, minWidth: 280 }}>
            <Stack gap={space.sm}>
              <Row align="center" gap={space.xs}>
                <Icon name="check" size={18} color={color.success} />
                <Text variant="subheading" weight="800">
                  What You'll Do (Zero Stress)
                </Text>
              </Row>
              <Stack gap={space.xs}>
                {opp.whatYouWillDo.map((task, idx) => (
                  <Row key={idx} align="flex-start" gap={space.xs}>
                    <Text variant="body" tone="accent" weight="700">
                      •
                    </Text>
                    <Text variant="body" style={{ flex: 1 }}>
                      {task}
                    </Text>
                  </Row>
                ))}
              </Stack>
            </Stack>
          </Card>

          <Card style={{ flex: 1, minWidth: 280 }} variant="alt">
            <Stack gap={space.sm}>
              <Row align="center" gap={space.xs}>
                <Icon name="sparkle" size={18} color={color.accent} />
                <Text variant="subheading" weight="800">
                  What You'll Learn
                </Text>
              </Row>
              <Stack gap={space.xs}>
                {opp.whatYouWillLearn.map((item, idx) => (
                  <Row key={idx} align="flex-start" gap={space.xs}>
                    <Text variant="body" tone="success" weight="700">
                      ✓
                    </Text>
                    <Text variant="body" tone="muted" style={{ flex: 1 }}>
                      {item}
                    </Text>
                  </Row>
                ))}
              </Stack>
            </Stack>
          </Card>
        </Row>

        {/* Creative Perks */}
        <Card>
          <Stack gap={space.sm}>
            <Text variant="subheading" weight="800">
              Community Appreciation & Perks
            </Text>
            <Row wrap gap={space.xs}>
              {opp.perks.map((perk, idx) => (
                <Pill key={idx} label={`✨ ${perk}`} tone="brand" size="md" />
              ))}
            </Row>
          </Stack>
        </Card>

        {/* What to Bring */}
        <Card variant="flat">
          <Stack gap={space.xs}>
            <Text variant="label" weight="700">
              What to Wear / Bring:
            </Text>
            <Text variant="body" tone="muted">
              {opp.whatToBring}
            </Text>
          </Stack>
        </Card>

        {/* Creator Info */}
        <Card variant="alt">
          <Row align="center" gap={space.md}>
            <Avatar uri={opp.creatorAvatar} name={opp.creatorName} size={54} />
            <Stack gap={space.xxs} style={{ flex: 1 }}>
              <Text variant="subheading" weight="800">
                Created by {opp.creatorName}
              </Text>
              <Text variant="caption" tone="muted">
                {opp.creatorRole} • {opp.neighborhood}
              </Text>
              <Text variant="micro" tone="success">
                Local Peer Artist • Always welcomes beginners
              </Text>
            </Stack>
          </Row>
        </Card>

        {/* Big Action Button */}
        {isJoined ? (
          <Card style={{ backgroundColor: `${color.success}20`, borderColor: color.success }}>
            <Stack gap={space.xs} style={{ alignItems: 'center' }}>
              <Row align="center" gap={space.xs}>
                <Icon name="checkCircle" size={22} color={color.success} />
                <Text variant="heading" tone="success" weight="800">
                  You Have Joined This Project!
                </Text>
              </Row>
              <Text variant="body" align="center">
                See you on {opp.dateLabel} at {opp.timeRange}. The creator has been notified!
              </Text>
              <Button
                label="Chat with Creator"
                variant="secondary"
                size="md"
                onPress={() => router.push('/skill-share' as never)}
              />
            </Stack>
          </Card>
        ) : (
          <Button
            label="I'D LOVE TO HELP / JOIN IN ✨"
            variant="primary"
            size="lg"
            full
            loading={joinCollab.pending}
            onPress={() => void joinCollab.mutate()}
            style={styles.joinButton}
          />
        )}
      </Stack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    borderWidth: 2,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.xs,
  },
  verticalDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  joinButton: {
    marginVertical: space.md,
  },
});
