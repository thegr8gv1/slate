import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { AnalyticsResponse, TalentAnalytics } from '../../contracts';
import { Gauge, HeatMap, LineChart, Sparkline } from '../../design/charts';
import { Icon } from '../../design/Icon';
import { Text } from '../../design/Text';
import {
  Avatar,
  Card,
  Divider,
  ErrorNote,
  Loading,
  Pill,
  Row,
  SectionTitle,
  Stack,
  Stat,
} from '../../design/primitives';
import { color, radius, space } from '../../design/tokens';
import { Screen } from '../../features/shell/Shell';
import { useResponsive } from '../../features/shell/useResponsive';
import { api } from '../../lib/api';
import { formatCount } from '../../lib/format';
import { useQuery } from '../../lib/query';

export default function Analytics() {
  const { compact, contentWidth } = useResponsive();
  const [focus, setFocus] = useState<TalentAnalytics | null>(null);

  const analytics = useQuery<AnalyticsResponse>(
    (signal) => api.get<AnalyticsResponse>('/analytics', { limit: 12 }, signal),
    [],
  );

  if (analytics.loading && !analytics.data) {
    return (
      <Screen title="Talent" accent="Performance analytics">
        <Loading label="Analyzing creator data" />
      </Screen>
    );
  }
  if (analytics.error) {
    return (
      <Screen title="Talent" accent="Performance analytics">
        <ErrorNote message={analytics.error.message} onRetry={analytics.refetch} />
      </Screen>
    );
  }

  const leaderboard = analytics.data?.leaderboard ?? [];
  const active = focus ?? leaderboard[0];
  const cohort = analytics.data?.cohortSeries ?? [];

  const hero = active ? (
    <Card style={{ gap: space.lg }}>
      <Row justify="space-between" align="center">
        <Stack gap={2} style={{ flex: 1 }}>
          <Text variant="micro" tone="faint" upper>
            Estimated Results & Return Score
          </Text>
          <Row gap={space.sm} align="baseline">
            <Text
              variant="display"
              tone={active.predictiveRoiScore >= 80 ? 'success' : active.predictiveRoiScore >= 55 ? 'warning' : 'danger'}
              style={{ fontSize: 36 }}
            >
              {active.predictiveRoiScore}
            </Text>
            <Text variant="heading" tone="faint">
              /100
            </Text>
            <Pill
              label={
                active.predictiveRoiScore >= 80 ? 'HIGH RETURN' : active.predictiveRoiScore >= 55 ? 'MEDIUM RETURN' : 'LOW RETURN'
              }
              tone={
                active.predictiveRoiScore >= 80 ? 'success' : active.predictiveRoiScore >= 55 ? 'warning' : 'danger'
              }
              size="sm"
            />
          </Row>
          <Text variant="caption" tone="muted">
            {active.displayName} · {active.role}
          </Text>
        </Stack>
        <Gauge value={active.predictiveRoiScore} size={104} />
      </Row>
    </Card>
  ) : null;

  const trend = (
    <Card style={{ gap: space.lg }}>
      <Row justify="space-between">
        <SectionTitle title="Engagement vs project conversion" accent="12 months" />
        {active ? (
          <Pill
            label={`${active.roiDeltaPct >= 0 ? '+' : ''}${active.roiDeltaPct}%`}
            tone={active.roiDeltaPct >= 0 ? 'success' : 'danger'}
            size="sm"
          />
        ) : null}
      </Row>
      <LineChart
        height={190}
        width={compact ? 340 : 620}
        labels={(active?.series ?? cohort).map((p) => p.t.slice(5))}
        series={[
          {
            label: 'Engagement score',
            color: color.series[0],
            values: (active?.series ?? cohort).map((p) => p.engagement),
            fill: true,
          },
          {
            label: 'Project conversion',
            color: color.accent,
            values: (active?.series ?? cohort).map((p) => p.conversion),
          },
        ]}
      />
    </Card>
  );

  const heat = (
    <Card style={{ gap: space.md }}>
      <SectionTitle title="Global audience heat map" />
      <HeatMap points={active?.heatmap ?? analytics.data?.heatmap ?? []} height={compact ? 150 : 190} />
      <Row justify="space-between" wrap>
        {(active?.heatmap ?? []).slice(0, 5).map((point) => (
          <Stat key={point.code} label={point.code} value={`${point.intensity}%`} align="center" />
        ))}
      </Row>
    </Card>
  );

  const scenarios = (
    <Card style={{ gap: space.md }}>
      <SectionTitle title="Predictive ROI by scenario" accent="New campaign" />
      <Text variant="micro" tone="faint">
        Modelled against the current campaign brief. Score blends audited engagement, historical booking
        conversion and rate efficiency.
      </Text>
      <Divider />
      <Stack gap={space.md}>
        {leaderboard.slice(0, 6).map((entry) => {
          const isActive = entry.profileId === active?.profileId;
          return (
            <Pressable
              key={entry.profileId}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              onPress={() => setFocus(entry)}
            >
              <Row gap={space.md}>
                <Avatar
                  name={entry.displayName}
                  uri={entry.avatarUrl}
                  size={36}
                  ring={isActive ? color.accent : undefined}
                />
                <View style={{ flex: 1 }}>
                  <Text variant="caption" numberOfLines={1}>
                    {entry.displayName}
                  </Text>
                  <Text variant="micro" tone="faint" upper numberOfLines={1}>
                    {entry.role}
                  </Text>
                </View>
                <Sparkline
                  values={entry.series.map((p) => p.conversion)}
                  stroke={entry.roiDeltaPct >= 0 ? color.success : color.danger}
                  width={62}
                  height={24}
                />
                <Stack gap={1} style={{ alignItems: 'flex-end', minWidth: 56 }}>
                  <Text variant="subheading" tone={entry.roiDeltaPct >= 0 ? 'success' : 'danger'}>
                    {entry.roiDeltaPct >= 0 ? '+' : ''}
                    {entry.roiDeltaPct}%
                  </Text>
                  <Text variant="micro" tone="faint">
                    AOE
                  </Text>
                </Stack>
              </Row>
            </Pressable>
          );
        })}
      </Stack>
    </Card>
  );

  const detail = active ? (
    <Card style={{ gap: space.md }}>
      <SectionTitle title="Discovery performance" />
      <Row justify="space-between">
        <Stat label="Card views" value={formatCount(active.cardViews)} />
        <Stat label="Pitch accept" value={`${active.pitchAcceptRate}%`} align="center" tone="success" />
        <Stat
          label="Median reply"
          value={`${active.medianResponseMinutes}m`}
          align="flex-end"
        />
      </Row>
    </Card>
  ) : null;

  return (
    <Screen
      title="Talent"
      accent="Performance analytics"
      onRefresh={analytics.refetch}
      refreshing={analytics.refreshing}
    >
      {compact ? (
        <Stack gap={space.xl}>
          {hero}
          {trend}
          {detail}
          {heat}
          {scenarios}
        </Stack>
      ) : (
        <Stack gap={space.xl}>
          {hero}
          <Row gap={space.xl} align="flex-start">
            <View style={{ flex: 1.35, gap: space.xl }}>
              {trend}
              {heat}
            </View>
            <View style={{ width: Math.min(360, contentWidth * 0.36), gap: space.xl }}>
              {detail}
              {scenarios}
            </View>
          </Row>
        </Stack>
      )}
    </Screen>
  );
}
