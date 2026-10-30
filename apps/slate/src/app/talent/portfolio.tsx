import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { SocialAuditResponse, TalentProfile } from '../../contracts';
import { Gauge, HeatMap, LineChart, ShareBar, Waveform } from '../../design/charts';
import { Icon } from '../../design/Icon';
import { Segmented } from '../../design/Segmented';
import { Text } from '../../design/Text';
import {
  Button,
  Card,
  Divider,
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
import { formatCount, formatMoney, relativeTime, titleCase } from '../../lib/format';
import { useQuery } from '../../lib/query';
import { useSession } from '../../lib/session';

type Tab = 'reel' | 'stills' | 'credits' | 'audience';

export default function Portfolio() {
  const { profile: sessionProfile } = useSession();
  const { columns, compact } = useResponsive();
  const [tab, setTab] = useState<Tab>('reel');
  const [playhead, setPlayhead] = useState(0.32);

  const me = useQuery<{ profile: TalentProfile | null }>(
    (signal) => api.get<{ profile: TalentProfile | null }>('/auth/me', undefined, signal),
    [sessionProfile?.id],
  );

  const profile = me.data?.profile;

  const profileId = profile?.id ?? null;
  const audit = useQuery<SocialAuditResponse>(
    (signal) => api.get<SocialAuditResponse>(`/talent/${profileId ?? ''}/audit`, undefined, signal),
    [profileId],
    { enabled: Boolean(profileId) },
  );

  if (me.loading && !me.data) {
    return (
      <Screen title="Portfolio" accent="Reel & credits">
        <Loading />
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen title="Portfolio" accent="Reel & credits">
        <ErrorNote message="This account does not have a talent profile." />
      </Screen>
    );
  }

  const social = profile.socials[0];
  const gridColumns = Math.max(2, columns + 1);

  return (
    <Screen title="Portfolio" accent="Reel & credits" onRefresh={me.refetch} refreshing={me.refreshing}>
      <Stack gap={space.xl}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'reel', label: 'Reel' },
            { value: 'stills', label: 'Stills', badge: profile.portfolio.length },
            { value: 'credits', label: 'Credits', badge: profile.credits.length },
            { value: 'audience', label: 'Audience' },
          ]}
        />

        {tab === 'reel' ? (
          <Stack gap={space.lg}>
            <Card padding={0} style={{ overflow: 'hidden' }}>
              <Photo uri={profile.reelPosterUrl} seed={`${profile.id}-reel`} height={compact ? 200 : 300} rounded={0}>
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(14, 6, 18, 0.45)',
                  }}
                >
                  <View
                    style={{
                      width: 58,
                      height: 58,
                      borderRadius: 29,
                      backgroundColor: 'rgba(244, 63, 94, 0.92)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name="play" size={24} color="#FFF" />
                  </View>
                </View>
                <View style={{ position: 'absolute', top: space.md, left: space.md }}>
                  <Pill label="15-second showreel" tone="accent" size="sm" />
                </View>
              </Photo>

              <Stack gap={space.md} style={{ padding: space.lg }}>
                <Row gap={space.md} align="center">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Play reel"
                    onPress={() => setPlayhead((p) => (p >= 0.95 ? 0 : p + 0.12))}
                  >
                    <Icon name="play" size={18} color={color.text} />
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Waveform seed={profile.id} progress={playhead} height={30} />
                  </View>
                  <Text variant="micro" tone="faint" mono>
                    {Math.round(playhead * 15)}s / 15s
                  </Text>
                </Row>

                {profile.audioSampleUrl ? (
                  <>
                    <Divider />
                    <Row gap={space.md} align="center">
                      <Icon name="volume" size={17} color={color.brand} />
                      <View style={{ flex: 1 }}>
                        <Text variant="caption">Audio sample</Text>
                        <Waveform seed={`${profile.id}-audio`} progress={0} height={22} tint={color.brand} />
                      </View>
                    </Row>
                  </>
                ) : null}
              </Stack>
            </Card>

            <Card style={{ gap: space.md }}>
              <SectionTitle title="Booking summary" />
              <Row justify="space-between">
                <Stat label="Day rate" value={formatMoney(profile.dayRateCents ?? 0)} tone="success" />
                <Stat label="Bookings" value={String(profile.bookingsCompleted)} align="center" />
                <Stat label="Rating" value={`★ ${profile.rating.toFixed(1)}`} align="center" />
                <Stat label="Response" value={`${profile.responseScore}%`} align="flex-end" />
              </Row>
              <Divider />
              <Text variant="body" tone="muted">
                {profile.headline}
              </Text>
              <Row gap={space.xs} wrap>
                {profile.specialties.map((s) => (
                  <Pill key={s} label={s} tone="outline" size="sm" />
                ))}
              </Row>
            </Card>

            <Card style={{ gap: space.md }}>
              <SectionTitle title="Verification" />
              <Row gap={space.sm} wrap>
                {profile.badges.map((badge) => (
                  <Pill
                    key={badge}
                    label={titleCase(badge)}
                    tone="success"
                    icon={<Icon name="shield" size={11} color={color.success} />}
                  />
                ))}
              </Row>
              <Text variant="micro" tone="faint">
                Identity, union standing and gear insurance are re-checked annually. A one-time
                verification fee covers document review and the badge.
              </Text>
            </Card>
          </Stack>
        ) : null}

        {tab === 'stills' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {profile.portfolio.map((uri, index) => (
              <Photo
                key={uri}
                uri={uri}
                seed={`${profile.id}-still-${index}`}
                width={`${100 / gridColumns - 2}%` as unknown as number}
                height={compact ? 160 : 200}
              />
            ))}
          </View>
        ) : null}

        {tab === 'credits' ? (
          <Card variant="alt" padding={0}>
            {profile.credits.map((credit, index) => (
              <View key={credit.id}>
                {index > 0 ? <Divider /> : null}
                <Row justify="space-between" style={{ padding: space.md }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="subheading" numberOfLines={1}>
                      {credit.title}
                    </Text>
                    <Text variant="caption" tone="faint">
                      {credit.role} · {titleCase(credit.kind)}
                      {credit.network ? ` · ${credit.network}` : ''}
                    </Text>
                  </View>
                  <Text variant="label" tone="muted">
                    {credit.year}
                  </Text>
                </Row>
              </View>
            ))}
          </Card>
        ) : null}

        {tab === 'audience' ? (
          social ? (
            <Stack gap={space.lg}>
              <Card style={{ gap: space.lg }}>
                <Row justify="space-between" align="center">
                  <View>
                    <Text variant="numeric">{formatCount(social.followers)}</Text>
                    <Text variant="micro" tone="faint" upper>
                      {social.platform} · {social.handle}
                    </Text>
                  </View>
                  <Gauge value={social.eai} label={`EAI ${social.eai}`} size={92} />
                </Row>
                <Divider />
                <Row justify="space-between">
                  <Stat label="Engagement" value={`${social.engagementRate.toFixed(1)}%`} />
                  <Stat label="Verified reach" value={formatCount(social.verifiedReach)} align="center" />
                  <Stat
                    label="Bot signal"
                    value={`${Math.round(social.fraudScore * 100)}%`}
                    align="flex-end"
                    tone={social.fraudScore > 0.35 ? 'danger' : 'success'}
                  />
                </Row>
                <Text variant="micro" tone="faint">
                  Last synced {relativeTime(social.lastSyncedAt)} from the platform API.
                </Text>
              </Card>

              {audit.data ? (
                <Card style={{ gap: space.lg }}>
                  <Row justify="space-between">
                    <SectionTitle title="Authenticity audit" />
                    <Pill
                      label={audit.data.verdict}
                      tone={
                        audit.data.verdict === 'clean'
                          ? 'success'
                          : audit.data.verdict === 'watch'
                            ? 'warning'
                            : 'danger'
                      }
                      size="sm"
                    />
                  </Row>
                  <LineChart
                    height={140}
                    width={560}
                    labels={audit.data.series.map((p) => p.t.slice(5))}
                    series={[
                      {
                        label: 'Verified reach',
                        color: color.series[0],
                        values: audit.data.series.map((p) => p.verifiedReach),
                        fill: true,
                      },
                      {
                        label: 'Total reach',
                        color: color.accent,
                        values: audit.data.series.map((p) => p.totalReach),
                      },
                    ]}
                  />
                  <ShareBar
                    segments={[
                      { label: 'Likes', value: audit.data.likesShare, color: color.series[0] },
                      { label: 'Comments', value: audit.data.commentsShare, color: color.success },
                      { label: 'Boosted', value: audit.data.boostedShare, color: color.warning },
                    ]}
                  />
                  {audit.data.flags.length > 0 ? (
                    <Stack gap={space.xs}>
                      {audit.data.flags.map((flag) => (
                        <Row key={flag} gap={space.sm} align="flex-start">
                          <View style={{ paddingTop: 3 }}>
                            <Icon name="alert" size={12} color={color.warning} />
                          </View>
                          <Text variant="micro" tone="muted" style={{ flex: 1 }}>
                            {flag}
                          </Text>
                        </Row>
                      ))}
                    </Stack>
                  ) : (
                    <Row gap={space.sm}>
                      <Icon name="checkCircle" size={14} color={color.success} />
                      <Text variant="caption" tone="success">
                        No anomalies detected in the last 12 weeks.
                      </Text>
                    </Row>
                  )}
                </Card>
              ) : null}

              <Card style={{ gap: space.md }}>
                <SectionTitle title="Audience geography" />
                <HeatMap points={social.audienceTopGeos.map((g) => ({ code: g.code, intensity: g.share }))} height={160} />
                <Row justify="space-between" wrap>
                  {social.audienceAgeBands.map((band) => (
                    <Stat key={band.band} label={band.band} value={`${band.share}%`} align="center" />
                  ))}
                </Row>
              </Card>
            </Stack>
          ) : (
            <Card>
              <Text variant="body" tone="muted">
                No social accounts connected. Link Instagram, TikTok or YouTube to unlock verified reach
                and the authenticity badge brands filter on.
              </Text>
            </Card>
          )
        ) : null}
      </Stack>
    </Screen>
  );
}
