import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { EAI, type AnalyticsResponse, type SocialAuditResponse } from '../../contracts';
import { Gauge, LineChart, ShareBar } from '../../design/charts';
import { Icon } from '../../design/Icon';
import { Text } from '../../design/Text';
import {
  Avatar,
  Button,
  Card,
  Divider,
  EmptyState,
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
import { formatCount, relativeTime } from '../../lib/format';
import { useQuery } from '../../lib/query';

const VERDICT_TONE = {
  clean: 'success',
  watch: 'warning',
  suppressed: 'danger',
} as const;

export default function EngagementAudit() {
  const { compact, contentWidth } = useResponsive();
  const [profileId, setProfileId] = useState<string | null>(null);

  const analytics = useQuery<AnalyticsResponse>(
    (signal) => api.get<AnalyticsResponse>('/analytics', { limit: 10 }, signal),
    [],
  );

  useEffect(() => {
    if (!profileId && analytics.data?.leaderboard[0]) {
      setProfileId(analytics.data.leaderboard[0].profileId);
    }
  }, [analytics.data, profileId]);

  const audit = useQuery<SocialAuditResponse>(
    (signal) => api.get<SocialAuditResponse>(`/analytics/audit/${profileId}`, undefined, signal),
    [profileId],
    { enabled: Boolean(profileId) },
  );

  if (analytics.loading && !analytics.data) {
    return (
      <Screen title="Dashboard" accent="Engagement audit">
        <Loading label="Running audits" />
      </Screen>
    );
  }

  if (analytics.error) {
    return (
      <Screen title="Dashboard" accent="Engagement audit">
        <ErrorNote message={analytics.error.message} onRetry={analytics.refetch} />
      </Screen>
    );
  }

  const roster = analytics.data?.leaderboard ?? [];
  const active = roster.find((r) => r.profileId === profileId) ?? roster[0];

  const detail = audit.data ? (
    <Stack gap={space.lg}>
      <Card style={{ gap: space.lg }}>
        <Row gap={space.md}>
          <Avatar name={audit.data.displayName} uri={audit.data.avatarUrl} size={52} />
          <View style={{ flex: 1 }}>
            <Text variant="title" numberOfLines={1}>
              {audit.data.displayName}
            </Text>
            <Text variant="label" tone="muted" upper>
              {audit.data.role}
            </Text>
          </View>
          <Pill
            label={audit.data.verdict}
            tone={VERDICT_TONE[audit.data.verdict]}
            icon={
              <Icon
                name={audit.data.verdict === 'clean' ? 'checkCircle' : 'alert'}
                size={11}
                color={
                  audit.data.verdict === 'clean'
                    ? color.success
                    : audit.data.verdict === 'watch'
                      ? color.warning
                      : color.danger
                }
              />
            }
          />
        </Row>

        <Divider />

        <Row justify="space-between" align="center">
          <Stack gap={2}>
            <Text variant="micro" tone="faint" upper>
              Audit score
            </Text>
            <Row gap={space.sm} align="baseline">
              <Text variant="display" tone={audit.data.auditScore >= 70 ? 'success' : 'warning'}>
                {audit.data.auditScore}
              </Text>
              <Text variant="label" tone="faint">
                / 100
              </Text>
            </Row>
            <Text variant="micro" tone="faint">
              Synced {relativeTime(audit.data.lastSyncedAt)}
            </Text>
          </Stack>
          <Gauge value={audit.data.auditScore} size={96} label="Authenticity" />
        </Row>
      </Card>

      <Card style={{ gap: space.lg }}>
        <SectionTitle title="Real audience vs. total views" accent="12 weeks" />
        <LineChart
          height={170}
          width={compact ? 340 : 600}
          labels={audit.data.series.map((p) => p.t.slice(5))}
          series={[
            {
              label: 'Real people reached',
              color: color.series[0],
              values: audit.data.series.map((p) => p.verifiedReach),
              fill: true,
            },
            {
              label: 'Total views (including potential bots)',
              color: color.accent,
              values: audit.data.series.map((p) => p.totalReach),
            },
          ]}
        />
        <Text variant="micro" tone="faint">
          If total views keep going up but real people don't, fake accounts or automated bots might be inflating the views.
        </Text>
      </Card>

      <Card style={{ gap: space.lg }}>
        <SectionTitle title="How people interact" />
        <ShareBar
          segments={[
            { label: 'Likes', value: audit.data.likesShare, color: color.series[0] },
            { label: 'Comments', value: audit.data.commentsShare, color: color.success },
            { label: 'Paid Ads', value: audit.data.boostedShare, color: color.warning },
          ]}
        />
        <Divider />
        <Row justify="space-between">
          <Stat label="Likes" value={`${audit.data.likesShare}%`} />
          <Stat label="Comments" value={`${audit.data.commentsShare}%`} align="center" tone="success" />
          <Stat
            label="Paid Ads"
            value={`${audit.data.boostedShare}%`}
            align="flex-end"
            tone={audit.data.boostedShare > 15 ? 'danger' : 'default'}
          />
        </Row>
      </Card>

      <Card style={{ gap: space.md }}>
        <SectionTitle title="Findings" accent={String(audit.data.flags.length)} />
        {audit.data.flags.length === 0 ? (
          <Row gap={space.sm}>
            <Icon name="checkCircle" size={16} color={color.success} />
            <Text variant="caption" tone="success" style={{ flex: 1 }}>
              Looks healthy! Follower growth, locations, and comments are completely natural and real.
            </Text>
          </Row>
        ) : (
          <Stack gap={space.sm}>
            {audit.data.flags.map((flag) => (
              <Row key={flag} gap={space.sm} align="flex-start">
                <View style={{ paddingTop: 3 }}>
                  <Icon name="alert" size={13} color={color.warning} />
                </View>
                <Text variant="caption" tone="muted" style={{ flex: 1 }}>
                  {flag}
                </Text>
              </Row>
            ))}
          </Stack>
        )}

        <Divider />

        <Text variant="micro" tone="faint">
          Profiles scoring above {Math.round(EAI.suppressAbove * 100)}% fraud probability are removed from
          discovery and cannot be added to a campaign until a human clears them. Audits re-run every{' '}
          {EAI.auditIntervalHours} hours.
        </Text>
      </Card>

      <Button
        label={audit.data.verdict === 'suppressed' ? 'Blocked from campaigns' : 'Add to campaign'}
        full
        size="lg"
        disabled={audit.data.verdict === 'suppressed'}
        onPress={() => {}}
      />
    </Stack>
  ) : (
    <Loading label="Auditing" />
  );

  const rosterPanel = (
    <Stack gap={space.md}>
      <SectionTitle title="Creator pool" accent={String(roster.length)} />
      {roster.map((entry) => {
        const isActive = entry.profileId === active?.profileId;
        return (
          <Pressable
            key={entry.profileId}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            onPress={() => setProfileId(entry.profileId)}
          >
            <Card
              variant={isActive ? 'default' : 'alt'}
              padding={space.md}
              style={{ borderColor: isActive ? color.accentBorder : color.border }}
            >
              <Row gap={space.md}>
                <Avatar name={entry.displayName} uri={entry.avatarUrl} size={38} />
                <View style={{ flex: 1 }}>
                  <Text variant="caption" numberOfLines={1}>
                    {entry.displayName}
                  </Text>
                  <Text variant="micro" tone="faint" upper numberOfLines={1}>
                    {entry.role}
                  </Text>
                </View>
                <Stack gap={1} style={{ alignItems: 'flex-end' }}>
                  <Text
                    variant="subheading"
                    tone={entry.predictiveRoiScore >= 70 ? 'success' : 'warning'}
                  >
                    {entry.predictiveRoiScore}
                  </Text>
                  <Text variant="micro" tone="faint">
                    ROI score
                  </Text>
                </Stack>
              </Row>
            </Card>
          </Pressable>
        );
      })}
    </Stack>
  );

  return (
    <Screen
      title="Dashboard"
      accent="Engagement audit"
      onRefresh={() => {
        analytics.refetch();
        audit.refetch();
      }}
      refreshing={analytics.refreshing || audit.refreshing}
    >
      {roster.length === 0 ? (
        <EmptyState title="No creators to audit" />
      ) : compact ? (
        <Stack gap={space.xl}>
          {detail}
          {rosterPanel}
        </Stack>
      ) : (
        <Row gap={space.xl} align="flex-start">
          <View style={{ flex: 1 }}>{detail}</View>
          <View style={{ width: Math.min(330, contentWidth * 0.34) }}>{rosterPanel}</View>
        </Row>
      )}
    </Screen>
  );
}
