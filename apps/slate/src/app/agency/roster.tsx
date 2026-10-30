import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { AgencyDashboard, TalentProfile } from '../../contracts';
import { Sparkline } from '../../design/charts';
import { Icon } from '../../design/Icon';
import { Sheet } from '../../design/Sheet';
import { Text } from '../../design/Text';
import {
  Avatar,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorNote,
  Loading,
  Photo,
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
import { formatCount, formatMoney, rateLabel, titleCase, unionLabel } from '../../lib/format';
import { useQuery } from '../../lib/query';

export default function Roster() {
  const { columns } = useResponsive();
  const [openId, setOpenId] = useState<string | null>(null);

  const dashboard = useQuery<AgencyDashboard>(
    (signal) => api.get<AgencyDashboard>('/agency/dashboard', undefined, signal),
    [],
  );

  const profile = useQuery<{ profile: TalentProfile }>(
    (signal) => api.get<{ profile: TalentProfile }>(`/talent/${openId}`, undefined, signal),
    [openId],
    { enabled: Boolean(openId) },
  );

  const roster = dashboard.data?.roster ?? [];
  const cardWidth = columns === 1 ? '100%' : `${100 / Math.min(2, columns) - 1}%`;

  return (
    <Screen title="Roster" accent="Represented talent" onRefresh={dashboard.refetch} refreshing={dashboard.refreshing}>
      {dashboard.loading && !dashboard.data ? (
        <Loading label="Loading roster" />
      ) : dashboard.error ? (
        <ErrorNote message={dashboard.error.message} onRetry={dashboard.refetch} />
      ) : roster.length === 0 ? (
        <EmptyState
          title="No represented talent"
          body="Talent route their bookings to an agency from their privacy settings. Once routed, they appear here."
        />
      ) : (
        <Stack gap={space.xl}>
          <Card variant="alt">
            <Row justify="space-between">
              <Stat label="Roster" value={String(roster.length)} />
              <Stat label="Gross booked" value={formatMoney(dashboard.data?.totalGrossCents ?? 0)} align="center" />
              <Stat
                label="Commission"
                value={formatMoney(dashboard.data?.totalCommissionCents ?? 0)}
                align="flex-end"
                tone="success"
              />
            </Row>
          </Card>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            {roster.map((member) => (
              <Pressable
                key={member.profileId}
                accessibilityRole="button"
                onPress={() => setOpenId(member.profileId)}
                style={{ width: cardWidth as never }}
              >
                <Card style={{ gap: space.md }}>
                  <Row gap={space.md}>
                    <Avatar name={member.displayName} uri={member.avatarUrl} size={46} />
                    <View style={{ flex: 1 }}>
                      <Text variant="subheading" numberOfLines={1}>
                        {member.displayName}
                      </Text>
                      <Text variant="micro" tone="faint" upper numberOfLines={1}>
                        {member.role}
                      </Text>
                    </View>
                    <Icon name="chevronRight" size={16} color={color.textFaint} />
                  </Row>
                  <Divider />
                  <Row justify="space-between">
                    <Stat label="Revenue" value={formatMoney(member.totalRevenueCents)} tone="success" />
                    <Stat label="Open offers" value={String(member.openOffers)} align="center" />
                    <Stat
                      label="In escrow"
                      value={formatMoney(member.escrowBalanceCents)}
                      align="flex-end"
                    />
                  </Row>
                </Card>
              </Pressable>
            ))}
          </View>
        </Stack>
      )}

      <Sheet
        visible={Boolean(openId)}
        onClose={() => setOpenId(null)}
        title={profile.data?.profile.displayName ?? 'Talent'}
        subtitle={profile.data ? `${profile.data.profile.primaryRole} · ${profile.data.profile.location.label}` : undefined}
      >
        {profile.loading && !profile.data ? (
          <Loading />
        ) : profile.data ? (
          <Stack gap={space.lg}>
            <Photo uri={profile.data.profile.avatarUrl} seed={profile.data.profile.id} height={200} />
            <Row justify="space-between">
              <Stat label="Day rate" value={rateLabel(profile.data.profile.dayRateCents ?? 0, 'day')} tone="success" />
              <Stat label="Rating" value={`★ ${profile.data.profile.rating.toFixed(1)}`} align="center" />
              <Stat label="Bookings" value={String(profile.data.profile.bookingsCompleted)} align="flex-end" />
            </Row>
            <Divider />
            <Text variant="body" tone="muted">
              {profile.data.profile.headline}
            </Text>
            <Row gap={space.xs} wrap>
              <Pill label={unionLabel(profile.data.profile.unionStatus)} tone="brand" size="sm" />
              {profile.data.profile.badges.map((badge) => (
                <Pill key={badge} label={titleCase(badge)} tone="success" size="sm" />
              ))}
            </Row>

            {profile.data.profile.socials[0] ? (
              <Card variant="alt" style={{ gap: space.md }}>
                <SectionTitle title="Audience" />
                <Row justify="space-between">
                  <Stat
                    label="Followers"
                    value={formatCount(profile.data.profile.socials[0].followers)}
                  />
                  <Stat
                    label="Engagement"
                    value={`${profile.data.profile.socials[0].engagementRate.toFixed(1)}%`}
                    align="center"
                  />
                  <Stat
                    label="EAI"
                    value={String(profile.data.profile.socials[0].eai)}
                    align="flex-end"
                    tone="success"
                  />
                </Row>
              </Card>
            ) : null}

            <Card variant="alt" style={{ gap: space.md }}>
              <SectionTitle title="Booking routing" />
              {(['commercial', 'film', 'theatrical', 'musical'] as const).map((key) => (
                <Row key={key} justify="space-between">
                  <Text variant="caption" tone="muted">
                    {titleCase(key)}
                  </Text>
                  <Text variant="caption">
                    {profile.data?.profile.routing[key] ?? 'Direct'}
                  </Text>
                </Row>
              ))}
            </Card>
          </Stack>
        ) : null}
      </Sheet>
    </Screen>
  );
}
