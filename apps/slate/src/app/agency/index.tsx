import { View } from 'react-native';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';

import type { AgencyDashboard } from '../../contracts';
import { BarChart, LineChart, MilestoneTrack } from '../../design/charts';
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
import { formatMoney, titleCase } from '../../lib/format';
import { useQuery } from '../../lib/query';

export default function AgencyHome() {
  const router = useRouter();
  const { columns, compact } = useResponsive();

  const dashboard = useQuery<AgencyDashboard>(
    (signal) => api.get<AgencyDashboard>('/agency/dashboard', undefined, signal),
    [],
  );

  if (dashboard.loading && !dashboard.data) {
    return (
      <Screen title="Agency" accent="Dashboard">
        <Loading label="Loading roster" />
      </Screen>
    );
  }
  if (dashboard.error) {
    return (
      <Screen title="Agency" accent="Dashboard">
        <ErrorNote message={dashboard.error.message} onRetry={dashboard.refetch} />
      </Screen>
    );
  }

  const data = dashboard.data!;
  const cardWidth = columns === 1 ? '100%' : `${100 / Math.min(3, columns) - 1.4}%`;

  return (
    <Screen
      title="Agency"
      accent="Dashboard"
      onRefresh={dashboard.refetch}
      refreshing={dashboard.refreshing}
    >
      <Stack gap={space.xl}>
        {/* ---------- Roster revenue tiles ---------- */}
        {data.roster.length === 0 ? (
          <EmptyState
            title="No clients on this roster yet"
            body="Your signed clients will appear here with their earnings, open offers, and held payments."
          />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            {data.roster.map((member) => (
              <Pressable
                key={member.profileId}
                accessibilityRole="link"
                onPress={() => router.push('/agency/roster')}
                style={{ width: cardWidth as never }}
              >
                <Card style={{ gap: space.md }}>
                  <Row gap={space.sm}>
                    <Avatar name={member.displayName} uri={member.avatarUrl} size={38} />
                    <View style={{ flex: 1 }}>
                      <Text variant="subheading" numberOfLines={1}>
                        {member.displayName}
                      </Text>
                      <Text variant="micro" tone="faint" upper numberOfLines={1}>
                        {member.role}
                      </Text>
                    </View>
                  </Row>
                  <Divider />
                  <Stack gap={space.sm}>
                    <Row justify="space-between">
                      <Text variant="micro" tone="faint" upper>
                        Total revenue
                      </Text>
                      <Text variant="subheading" tone="success">
                        {formatMoney(member.totalRevenueCents)}
                      </Text>
                    </Row>
                    <Row justify="space-between">
                      <Text variant="micro" tone="faint" upper>
                        Open offers
                      </Text>
                      <Text variant="caption">{member.openOffers}</Text>
                    </Row>
                    <Row justify="space-between">
                      <Text variant="micro" tone="faint" upper>
                        Escrow balance
                      </Text>
                      <Text variant="caption" tone={member.escrowBalanceCents > 0 ? 'brand' : 'muted'}>
                        {formatMoney(member.escrowBalanceCents)}
                      </Text>
                    </Row>
                  </Stack>
                </Card>
              </Pressable>
            ))}
          </View>
        )}

        {/* ---------- Totals ---------- */}
        <Card variant="alt" style={{ gap: space.md }}>
          <Row justify="space-between">
            <Stat label="Gross booked" value={formatMoney(data.totalGrossCents)} />
            <Stat
              label="Agency commission"
              value={formatMoney(data.totalCommissionCents)}
              align="center"
              tone="success"
            />
            <Stat label="Roster" value={String(data.roster.length)} align="flex-end" />
          </Row>
        </Card>

        {/* ---------- Pending agreements ---------- */}
        <Stack gap={space.md}>
          <SectionTitle
            title="Pending agreements"
            accent={String(data.pendingAgreements.length)}
            action={
              <Pressable accessibilityRole="link" onPress={() => router.push('/agency/vault')}>
                <Row gap={space.xxs}>
                  <Text variant="micro" tone="faint" upper>
                    See all
                  </Text>
                  <Icon name="chevronRight" size={13} color={color.textFaint} />
                </Row>
              </Pressable>
            }
          />

          {data.pendingAgreements.length === 0 ? (
            <Card variant="alt">
              <Text variant="caption" tone="faint">
                Nothing awaiting signature or settlement.
              </Text>
            </Card>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
              {data.pendingAgreements.map((row) => (
                <Pressable
                  key={row.id}
                  accessibilityRole="link"
                  onPress={() =>
                    router.push(
                      (row.escrowId ? `/agency/escrow?id=${row.escrowId}` : `/agency/vault?id=${row.id}`) as never,
                    )
                  }
                  style={{ width: (columns === 1 ? '100%' : `${100 / Math.min(2, columns) - 1}%`) as never }}
                >
                  <Card style={{ gap: space.md }}>
                    <Row gap={space.md}>
                      <Avatar name={row.talentDisplayName} uri={row.talentAvatarUrl} size={34} />
                      <View style={{ flex: 1 }}>
                        <Text variant="subheading" numberOfLines={1}>
                          {row.talentDisplayName}
                        </Text>
                        <Text variant="micro" tone="faint" numberOfLines={1}>
                          {row.label}
                        </Text>
                      </View>
                      <Pill label={titleCase(row.state)} tone="brand" size="sm" />
                    </Row>

                    {row.escrowId ? (
                      <MilestoneTrack
                        steps={[
                          { label: 'Deposit', state: row.progressPct > 0 ? 'done' : 'current' },
                          {
                            label: 'Milestone',
                            state: row.progressPct >= 30 ? 'done' : row.progressPct > 0 ? 'current' : 'todo',
                          },
                          {
                            label: 'Final payout',
                            state: row.progressPct >= 100 ? 'done' : row.progressPct >= 30 ? 'current' : 'todo',
                          },
                        ]}
                      />
                    ) : (
                      <Row gap={space.sm}>
                        <Icon name="file" size={14} color={color.warning} />
                        <Text variant="micro" tone="warning" upper>
                          Awaiting signature
                        </Text>
                      </Row>
                    )}
                  </Card>
                </Pressable>
              ))}
            </View>
          )}
        </Stack>

        {/* ---------- Revenue trend ---------- */}
        <Card style={{ gap: space.lg }}>
          <SectionTitle title="Agency revenue trend" accent="6 months" />
          <LineChart
            height={170}
            width={compact ? 340 : 620}
            labels={data.revenueTrend.map((p) => p.month)}
            series={[
              {
                label: 'Gross booked',
                color: color.series[0],
                values: data.revenueTrend.map((p) => p.grossCents / 100),
                fill: true,
              },
              {
                label: 'Agency net',
                color: color.accent,
                values: data.revenueTrend.map((p) => p.netCents / 100),
              },
            ]}
          />
        </Card>

        <Row gap={space.md} wrap>
          <Button
            label="Open NDA vault"
            variant="secondary"
            icon={<Icon name="file" size={15} color={color.textMuted} />}
            onPress={() => router.push('/agency/vault')}
          />
          <Button
            label="Settlement"
            variant="secondary"
            icon={<Icon name="dollar" size={15} color={color.textMuted} />}
            onPress={() => router.push('/agency/escrow')}
          />
          <Button
            label="Ledger"
            variant="secondary"
            icon={<Icon name="list" size={15} color={color.textMuted} />}
            onPress={() => router.push('/agency/ledger')}
          />
        </Row>
      </Stack>
    </Screen>
  );
}
