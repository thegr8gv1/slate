import { useRouter } from 'expo-router';

import type { ArtOpportunity } from '../contracts';
import { Icon } from '../design/Icon';
import { Text } from '../design/Text';
import { Button, Card, Pill, Row, Spacer, Stack } from '../design/primitives';
import { color, space } from '../design/tokens';
import { Screen } from '../features/shell/Shell';
import { api } from '../lib/api';
import { useQuery } from '../lib/query';

export default function MyCircles() {
  const router = useRouter();

  const { data, loading, refetch } = useQuery<{ opportunities: ArtOpportunity[]; total: number }>(
    () => api.get<{ opportunities: ArtOpportunity[]; total: number }>('/art/my-collaborations'),
    []
  );

  const opps = data?.opportunities ?? [];

  return (
    <Screen
      title="My Creative Circles"
      accent="Collaborations Joined"
      onRefresh={refetch}
    >
      <Stack gap={space.lg}>
        {/* Intro Banner */}
        <Card variant="alt">
          <Row align="center" gap={space.sm}>
            <Icon name="heart" size={20} color={color.accent} />
            <Stack gap={space.xxs} style={{ flex: 1 }}>
              <Text variant="subheading" weight="800">
                You are part of {opps.length} neighborhood projects
              </Text>
              <Text variant="caption" tone="muted">
                Zero gatekeeping, zero agency pressure. Thank you for making local art happen!
              </Text>
            </Stack>
          </Row>
        </Card>

        {loading && opps.length === 0 ? (
          <Card>
            <Text variant="body" tone="muted" align="center">
              Loading your creative circles...
            </Text>
          </Card>
        ) : null}

        {opps.length === 0 && !loading ? (
          <Card style={{ padding: space.xl }}>
            <Stack gap={space.md} style={{ alignItems: 'center' }}>
              <Icon name="compass" size={48} color={color.brand} />
              <Text variant="heading" weight="800" align="center">
                No Projects Joined Yet
              </Text>
              <Text variant="body" tone="muted" align="center">
                Explore the Neighborhood Art Map to find open calls for movie shadowing, jam sessions, backyard theater, and gallery nights!
              </Text>
              <Button label="Explore Art Map 🗺️" variant="primary" size="md" onPress={() => router.push('/map' as never)} />
            </Stack>
          </Card>
        ) : null}

        {opps.map((opp) => (
          <Card key={opp.id} style={{ borderWidth: 1.5, borderColor: `${color.accent}40` }}>
            <Stack gap={space.sm}>
              <Row justify="space-between" align="center" wrap>
                <Pill label={opp.activityBadge} tone="brand" size="sm" />
                <Pill label="Confirmed Collaborator" tone="success" size="sm" />
              </Row>

              <Text variant="heading" weight="800">
                {opp.title}
              </Text>

              <Row align="center" gap={space.xs}>
                <Icon name="pin" size={14} color={color.accent} />
                <Text variant="caption" tone="muted">
                  {opp.address} ({opp.neighborhood}) • {opp.walkMinutes} min walk
                </Text>
              </Row>

              <Row align="center" gap={space.xs}>
                <Icon name="clock" size={14} color={color.brand} />
                <Text variant="caption" tone="brand" weight="700">
                  {opp.dateLabel} • {opp.timeRange}
                </Text>
              </Row>

              <Spacer size={space.xs} />

              <Row justify="space-between" align="center">
                <Text variant="caption" tone="faint">
                  With {opp.creatorName} ({opp.creatorRole})
                </Text>

                <Row gap={space.xs}>
                  <Button
                    label="Details"
                    variant="ghost"
                    size="sm"
                    onPress={() => router.push(`/collaboration/${opp.id}` as never)}
                  />
                  <Button
                    label="Open Chat"
                    variant="primary"
                    size="sm"
                    onPress={() => router.push('/skill-share' as never)}
                  />
                </Row>
              </Row>
            </Stack>
          </Card>
        ))}

        <Row justify="center">
          <Button
            label="+ Discover More Local Opportunities"
            variant="ghost"
            size="md"
            onPress={() => router.push('/map' as never)}
          />
        </Row>
      </Stack>
    </Screen>
  );
}
