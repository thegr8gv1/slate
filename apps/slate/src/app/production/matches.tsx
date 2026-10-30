import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import type { MatchRecord, Project, TalentProfile } from '../../contracts';
import { Icon } from '../../design/Icon';
import { Segmented } from '../../design/Segmented';
import { Text } from '../../design/Text';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorNote,
  Loading,
  Photo,
  Pill,
  Row,
  Stack,
} from '../../design/primitives';
import { color, radius, space } from '../../design/tokens';
import { Screen } from '../../features/shell/Shell';
import { useResponsive } from '../../features/shell/useResponsive';
import { api } from '../../lib/api';
import { formatMoney, rateLabel, relativeTime, titleCase } from '../../lib/format';
import { useQuery } from '../../lib/query';

interface MatchesResponse {
  matches: { match: MatchRecord; profile: TalentProfile | null; project: Project | null }[];
}

type Filter = 'all' | 'mutual' | 'pitched' | 'booked';

export default function Matches() {
  const router = useRouter();
  const { columns } = useResponsive();
  const [filter, setFilter] = useState<Filter>('all');

  const matches = useQuery<MatchesResponse>(
    (signal) => api.get<MatchesResponse>('/discovery/matches', undefined, signal),
    [],
  );

  const rows = matches.data?.matches ?? [];

  const counts = useMemo(
    () => ({
      all: rows.length,
      mutual: rows.filter((r) => r.match.state === 'mutual').length,
      pitched: rows.filter((r) => r.match.state === 'pitched' || r.match.state === 'offer_sent').length,
      booked: rows.filter((r) => r.match.state === 'booked').length,
    }),
    [rows],
  );

  const filtered = rows.filter((row) => {
    if (filter === 'all') return true;
    if (filter === 'pitched') return row.match.state === 'pitched' || row.match.state === 'offer_sent';
    return row.match.state === filter;
  });

  return (
    <Screen title="Matches" accent="Mutual interest" onRefresh={matches.refetch} refreshing={matches.refreshing}>
      <Stack gap={space.xl}>
        {/* Bumble-style Mutual Matches carousel */}
        {counts.mutual > 0 ? (
          <Stack gap={space.xs}>
            <Row justify="space-between" align="center">
              <Row gap={space.xs} align="center">
                <Text variant="subheading" style={{ fontWeight: '700' }}>
                  Mutual Matches
                </Text>
                <View
                  style={{
                    backgroundColor: color.brandSoft,
                    paddingHorizontal: 7,
                    paddingVertical: 1,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: 'rgba(251, 113, 133, 0.45)',
                  }}
                >
                  <Text variant="micro" tone="brand" style={{ fontWeight: '700' }}>
                    {counts.mutual}
                  </Text>
                </View>
              </Row>
              <Text variant="micro" tone="faint">
                You both liked each other!
              </Text>
            </Row>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Row gap={space.md} style={{ paddingVertical: space.xs }}>
                {rows
                  .filter((r) => r.match.state === 'mutual' && r.profile)
                  .map(({ match, profile, project }) => (
                    <Pressable
                      key={match.id}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${profile!.displayName}`}
                      onPress={() => router.push('/production/board')}
                      style={{ alignItems: 'center', width: 80, gap: 6 }}
                    >
                      <LinearGradient
                        colors={['#FB7185', '#F43F5E', '#C084FC']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{
                          width: 68,
                          height: 68,
                          borderRadius: 34,
                          padding: 2.5,
                          alignItems: 'center',
                          justifyContent: 'center',
                          shadowColor: '#F43F5E',
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.5,
                          shadowRadius: 6,
                          elevation: 4,
                        }}
                      >
                        <View
                          style={{
                            width: '100%',
                            height: '100%',
                            borderRadius: 32,
                            backgroundColor: color.bg,
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                          }}
                        >
                          <Photo uri={profile!.avatarUrl} seed={profile!.id} width={58} height={58} rounded={29} />
                          <View
                            style={{
                              position: 'absolute',
                              bottom: -2,
                              right: -2,
                              backgroundColor: '#F43F5E',
                              width: 22,
                              height: 22,
                              borderRadius: 11,
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderWidth: 2,
                              borderColor: color.bg,
                            }}
                          >
                            <Icon name="heart" size={11} color="#FFF" strokeWidth={3} />
                          </View>
                        </View>
                      </LinearGradient>
                      <Text variant="caption" numberOfLines={1} style={{ textAlign: 'center', fontWeight: '600' }}>
                        {profile!.displayName.split(' ')[0]}
                      </Text>
                      <Text variant="micro" tone="faint" numberOfLines={1} style={{ fontSize: 10 }}>
                        {profile!.primaryRole.split(' ')[0]}
                      </Text>
                    </Pressable>
                  ))}
              </Row>
            </ScrollView>
          </Stack>
        ) : null}

        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', badge: counts.all },
            { value: 'mutual', label: 'Mutual', badge: counts.mutual },
            { value: 'pitched', label: 'Pitched', badge: counts.pitched },
            { value: 'booked', label: 'Booked', badge: counts.booked },
          ]}
        />

        {matches.loading && !matches.data ? (
          <Loading label="Loading matches" />
        ) : matches.error ? (
          <ErrorNote message={matches.error.message} onRetry={matches.refetch} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={filter === 'all' ? 'No matches yet' : `No one in this list yet`}
            body="When you like a talent profile and they like your project back, a mutual match is created!"
            action={<Button label="Browse talent" onPress={() => router.push('/production')} />}
          />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            {filtered.map(({ match, profile, project }) =>
              profile ? (
                <View
                  key={match.id}
                  style={{ width: (columns === 1 ? '100%' : `${100 / Math.min(2, columns) - 1}%`) as never }}
                >
                  <Pressable accessibilityRole="link" onPress={() => router.push('/production/board')}>
                    <Card
                      padding={0}
                      level={2}
                      style={{
                        overflow: 'hidden',
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: 'rgba(244, 114, 182, 0.22)',
                        backgroundColor: color.surface,
                      }}
                    >
                      <Photo uri={profile.avatarUrl} seed={profile.id} height={180} rounded={0}>
                        <LinearGradient
                          colors={['transparent', 'rgba(18, 7, 24, 0.4)', 'rgba(14, 6, 18, 0.95)']}
                          locations={[0, 0.5, 1]}
                          style={{ position: 'absolute', inset: 0 as never }}
                        />
                        <Row
                          justify="space-between"
                          style={{ position: 'absolute', top: space.sm, left: space.sm, right: space.sm }}
                        >
                          <Pill
                            label={titleCase(match.state)}
                            tone={
                              match.state === 'booked'
                                ? 'success'
                                : match.state === 'mutual'
                                  ? 'brand'
                                  : match.state === 'declined'
                                    ? 'danger'
                                    : 'accent'
                            }
                            size="sm"
                          />
                          {match.state === 'mutual' ? (
                            <View
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: 13,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: color.brand,
                                borderWidth: 1.5,
                                borderColor: 'rgba(255,255,255,0.3)',
                              }}
                            >
                              <Icon name="heart" size={13} color="#FFF" strokeWidth={2.6} />
                            </View>
                          ) : null}
                        </Row>
                        <Stack gap={1} style={{ position: 'absolute', left: space.md, right: space.md, bottom: space.md }}>
                          <Text variant="subheading" numberOfLines={1} style={{ fontWeight: '700', fontSize: 17 }}>
                            {profile.displayName}
                          </Text>
                          <Text variant="micro" tone="muted" numberOfLines={1}>
                            {profile.primaryRole} · {project?.title ?? 'Project'}
                          </Text>
                        </Stack>
                      </Photo>

                      <Stack gap={space.sm} style={{ padding: space.md }}>
                        <Row justify="space-between" align="center">
                          <Text variant="caption" tone="success" style={{ fontWeight: '700' }}>
                            {profile.dayRateCents ? rateLabel(profile.dayRateCents, 'day') : profile.dayRateBand}
                          </Text>
                          <Text variant="micro" tone="faint">
                            {relativeTime(match.lastActivityAt)}
                          </Text>
                        </Row>
                        <Divider />
                        <Row justify="space-between" align="center">
                          <Text variant="micro" tone="faint">
                            ★ {profile.rating.toFixed(1)} · {profile.credits.length} past roles
                          </Text>
                          <Row gap={space.xxs} align="center">
                            <Text variant="micro" tone="accent" style={{ fontWeight: '600' }} upper>
                              View on Board
                            </Text>
                            <Icon name="chevronRight" size={12} color={color.accent} />
                          </Row>
                        </Row>
                      </Stack>
                    </Card>
                  </Pressable>
                </View>
              ) : null,
            )}
          </View>
        )}
      </Stack>
    </Screen>
  );
}
