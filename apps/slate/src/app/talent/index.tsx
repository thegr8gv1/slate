import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import type { Opportunity, Pitch, TalentHomeResponse } from '../../contracts';
import { Gauge, Sparkline } from '../../design/charts';
import { Icon } from '../../design/Icon';
import { Segmented } from '../../design/Segmented';
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
import { formatCount, rateLabel, relativeTime, shortDate, titleCase } from '../../lib/format';
import { useQuery } from '../../lib/query';
import { useSession } from '../../lib/session';

type Tab = 'home' | 'portfolio' | 'calls';

export default function TalentHome() {
  const router = useRouter();
  const { account } = useSession();
  const { columns, compact } = useResponsive();
  const [tab, setTab] = useState<Tab>('home');

  const home = useQuery<TalentHomeResponse>(
    (signal) => api.get<TalentHomeResponse>('/talent/home', undefined, signal),
    [account?.id],
  );

  if (home.loading && !home.data) {
    return (
      <Screen title="Talent" accent="Dashboard">
        <Loading label="Loading your profile" />
      </Screen>
    );
  }

  if (home.error) {
    return (
      <Screen title="Talent" accent="Dashboard">
        <ErrorNote message={home.error.message} onRetry={home.refetch} />
      </Screen>
    );
  }

  const data = home.data!;
  const profile = data.profile;
  const social = profile.socials[0];
  const unread = data.inbox.filter((p) => !p.readAt).length;

  return (
    <Screen
      title="Talent"
      accent="Dashboard"
      onRefresh={home.refetch}
      refreshing={home.refreshing}
    >
      <Stack gap={space.xl}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'home', label: 'Home' },
            { value: 'portfolio', label: 'My Portfolio' },
            { value: 'calls', label: 'Casting Calls', badge: data.castingCalls.length },
          ]}
        />

        {/* ---------- Identity ---------- */}
        <Row gap={space.lg}>
          <Avatar
            name={profile.displayName}
            uri={profile.avatarUrl}
            size={64}
            ring={color.accent}
            badge={
              profile.badges.includes('identity') ? (
                <View
                  style={{
                    backgroundColor: color.brand,
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 2,
                    borderColor: color.bg,
                  }}
                >
                  <Icon name="check" size={11} color="#FFF" strokeWidth={3} />
                </View>
              ) : null
            }
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="title">{profile.displayName}</Text>
            <Text variant="label" tone="muted" upper>
              {profile.primaryRole}
              {profile.age ? `, ${profile.age}` : ''}
            </Text>
            <Row gap={space.xs} wrap style={{ marginTop: space.xs }}>
              <Pill label={profile.location.label} tone="outline" size="sm" />
              <Pill label={titleCase(profile.unionStatus)} tone="brand" size="sm" />
              <Pill label={`★ ${profile.rating.toFixed(1)}`} tone="neutral" size="sm" />
            </Row>
          </View>
          {!compact ? (
            <Button
              label="Edit"
              variant="secondary"
              size="sm"
              icon={<Icon name="edit" size={14} color={color.textMuted} />}
              onPress={() => router.push('/talent/privacy')}
            />
          ) : null}
        </Row>

        {tab === 'home' ? (
          <HomeTab data={data} columns={columns} unread={unread} />
        ) : tab === 'portfolio' ? (
          <PortfolioTab data={data} columns={columns} />
        ) : (
          <CallsTab calls={data.castingCalls} columns={columns} />
        )}
      </Stack>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Home tab                                                            */
/* ------------------------------------------------------------------ */

function HomeTab({
  data,
  columns,
  unread,
}: {
  data: TalentHomeResponse;
  columns: number;
  unread: number;
}) {
  const router = useRouter();
  const profile = data.profile;
  const social = profile.socials[0];

  return (
    <Stack gap={space.xl}>
      {/* ---------- Portfolio strip ---------- */}
      <Stack gap={space.md}>
        <SectionTitle
          title="Portfolio"
          action={
            <Pressable accessibilityRole="link" onPress={() => router.push('/talent/portfolio')}>
              <Row gap={space.xxs}>
                <Text variant="micro" tone="faint" upper>
                  See all
                </Text>
                <Icon name="chevronRight" size={13} color={color.textFaint} />
              </Row>
            </Pressable>
          }
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Row gap={space.sm}>
            {profile.portfolio.slice(0, 8).map((uri, index) => (
              <Photo
                key={uri}
                uri={uri}
                seed={`${profile.id}-${index}`}
                width={96}
                height={116}
                rounded={radius.md}
              />
            ))}
          </Row>
        </ScrollView>
      </Stack>

      {/* ---------- Dynamic social stats ---------- */}
      {social ? (
        <Card style={{ gap: space.lg }}>
          <Row justify="space-between">
            <Row gap={space.sm}>
              <Icon name="trending" size={17} color={color.brand} />
              <View>
                <Text variant="subheading">Social Media & Audience Quality</Text>
                <Text variant="micro" tone="faint" upper>
                  Audience check · updated {relativeTime(social.lastSyncedAt)}
                </Text>
              </View>
            </Row>
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: color.brand,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="check" size={12} color="#FFF" strokeWidth={3} />
            </View>
          </Row>

          <Row justify="space-between" align="center">
            <Stack gap={2}>
              <Row gap={space.sm}>
                <Text variant="numeric">{formatCount(social.followers)}</Text>
                <Text variant="label" tone="muted" upper>
                  followers
                </Text>
              </Row>
              <Text variant="caption" tone="faint">
                {social.handle} · {social.engagementRate.toFixed(1)}% engagement
              </Text>
            </Stack>
            <Gauge value={social.eai} label={`${social.eai}% Real`} size={92} />
          </Row>

          <Divider />

          <Row justify="space-between">
            <Stat label="Real audience" value={formatCount(social.verifiedReach)} align="flex-start" />
            <Stat label="Total views" value={formatCount(social.totalReach)} align="center" tone="muted" />
            <Stat
              label="Fake bot risk"
              value={`${Math.round(social.fraudScore * 100)}%`}
              align="flex-end"
              tone={social.fraudScore > 0.35 ? 'danger' : 'success'}
            />
          </Row>
        </Card>
      ) : null}

      {/* ---------- Active gigs ---------- */}
      <Stack gap={space.md}>
        <SectionTitle
          title="Current jobs"
          action={
            data.activeGigs.length > 0 ? (
              <Text variant="micro" tone="faint" upper>
                {data.activeGigs.length} active
              </Text>
            ) : null
          }
        />
        {data.activeGigs.length === 0 ? (
          <EmptyState
            title="No active jobs right now"
            body="Browse open gigs to audition. When you get booked, your pay is held safely in escrow until you wrap."
            action={<Button label="Browse open gigs" onPress={() => router.push('/talent/discover')} />}
          />
        ) : (
          <View style={{ gap: space.sm }}>
            {data.activeGigs.map((gig) => (
              <Pressable
                key={gig.escrowId}
                accessibilityRole="link"
                onPress={() => router.push(`/agency/escrow?id=${gig.escrowId}` as never)}
              >
                <Card variant="alt" padding={space.md}>
                  <Row justify="space-between">
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="subheading" numberOfLines={1}>
                        {gig.projectTitle}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {gig.role} · next: {gig.nextMilestone}
                      </Text>
                    </View>
                    <Stack gap={2} style={{ alignItems: 'flex-end' }}>
                      <Text variant="subheading" tone="success">
                        {rateLabel(gig.amountCents, 'flat').replace(' flat', '')}
                      </Text>
                      <Pill label={titleCase(gig.state)} tone="brand" size="sm" />
                    </Stack>
                  </Row>
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </Stack>

      {/* ---------- Inbox preview ---------- */}
      {data.inbox.length > 0 ? (
        <Stack gap={space.md}>
          <SectionTitle
            title="Inbox"
            accent={unread > 0 ? `${unread} unread` : undefined}
            action={
              <Pressable accessibilityRole="link" onPress={() => router.push('/talent/inbox')}>
                <Icon name="chevronRight" size={15} color={color.textFaint} />
              </Pressable>
            }
          />
          {data.inbox.slice(0, 3).map((pitch) => (
            <PitchRow key={pitch.id} pitch={pitch} onPress={() => router.push('/talent/inbox')} />
          ))}
        </Stack>
      ) : null}

      {/* ---------- New casting calls ---------- */}
      <Stack gap={space.md}>
        <SectionTitle
          title="New casting calls"
          action={
            <Pressable accessibilityRole="link" onPress={() => router.push('/talent/discover')}>
              <Row gap={space.xxs}>
                <Text variant="micro" tone="faint" upper>
                  See all
                </Text>
                <Icon name="chevronRight" size={13} color={color.textFaint} />
              </Row>
            </Pressable>
          }
        />
        <CallGrid calls={data.castingCalls.slice(0, columns * 2)} columns={columns} />
      </Stack>
    </Stack>
  );
}

/* ------------------------------------------------------------------ */

export function PitchRow({ pitch, onPress }: { pitch: Pitch; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card variant="alt" padding={space.md} style={{ gap: space.sm }}>
        <Row justify="space-between">
          <Row gap={space.xs}>
            {pitch.superTier ? (
              <Pill label={`Super · ${pitch.superTier}`} tone="brand" size="sm" icon={<Icon name="zap" size={10} color={color.brand} />} />
            ) : (
              <Pill label="Instant pitch" tone="outline" size="sm" />
            )}
            {!pitch.readAt ? <Pill label="New" tone="accent" size="sm" /> : null}
          </Row>
          <Text variant="micro" tone="faint">
            {relativeTime(pitch.createdAt)}
          </Text>
        </Row>
        <Text variant="body" tone="muted" numberOfLines={2}>
          {pitch.message}
        </Text>
        {pitch.offerCents ? (
          <Text variant="subheading" tone="success">
            {rateLabel(pitch.offerCents, 'flat').replace(' flat', '')} offered
          </Text>
        ) : null}
      </Card>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Portfolio tab                                                       */
/* ------------------------------------------------------------------ */

function PortfolioTab({ data, columns }: { data: TalentHomeResponse; columns: number }) {
  const profile = data.profile;
  const gridColumns = Math.max(2, columns + 1);

  return (
    <Stack gap={space.xl}>
      <Card style={{ gap: space.md }}>
        <Text variant="subheading">{profile.headline}</Text>
        <Row gap={space.xs} wrap>
          {profile.specialties.map((s) => (
            <Pill key={s} label={s} tone="outline" size="sm" />
          ))}
        </Row>
        <Divider />
        <Row justify="space-between">
          <Stat label="Day rate" value={profile.dayRateCents ? rateLabel(profile.dayRateCents, 'day') : profile.dayRateBand} />
          <Stat label="Bookings" value={String(profile.bookingsCompleted)} align="center" />
          <Stat label="Response" value={`${profile.responseScore}%`} align="flex-end" tone="success" />
        </Row>
      </Card>

      <Stack gap={space.md}>
        <SectionTitle title="Stills" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {profile.portfolio.map((uri, index) => (
            <Photo
              key={uri}
              uri={uri}
              seed={`${profile.id}-p-${index}`}
              width={`${100 / gridColumns - 2}%` as unknown as number}
              height={150}
            />
          ))}
        </View>
      </Stack>

      <Stack gap={space.md}>
        <SectionTitle title="Credits" accent={`${profile.credits.length}`} />
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
      </Stack>

      <Stack gap={space.md}>
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
      </Stack>
    </Stack>
  );
}

/* ------------------------------------------------------------------ */
/* Casting calls tab                                                   */
/* ------------------------------------------------------------------ */

function CallsTab({ calls, columns }: { calls: Opportunity[]; columns: number }) {
  const router = useRouter();
  if (calls.length === 0) {
    return (
      <EmptyState
        title="No open calls in your sector right now"
        body="Widen your travel radius or check the Gigs deck — sponsored briefs surface there first."
        action={<Button label="Open gigs deck" onPress={() => router.push('/talent/discover')} />}
      />
    );
  }
  return <CallGrid calls={calls} columns={columns} />;
}

export function CallGrid({ calls, columns }: { calls: Opportunity[]; columns: number }) {
  const router = useRouter();
  const width = columns === 1 ? '100%' : `${100 / columns - 1.5}%`;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
      {calls.map((call) => (
        <Pressable
          key={call.id}
          accessibilityRole="link"
          onPress={() => router.push('/talent/discover')}
          style={{ width: width as never }}
        >
          <Card padding={0} style={{ overflow: 'hidden' }}>
            <Photo uri={call.project.coverUrl} seed={call.id} height={104} rounded={0}>
              <View style={{ position: 'absolute', left: space.md, top: space.md, flexDirection: 'row', gap: space.xs }}>
                {call.sponsored ? <Pill label="Sponsored" tone="accent" size="sm" /> : null}
                {call.sideScriptId ? <Pill label="Side attached" tone="brand" size="sm" /> : null}
              </View>
              <View style={{ position: 'absolute', left: space.md, bottom: space.sm, right: space.md }}>
                <Text variant="micro" style={{ color: 'rgba(255,255,255,0.8)' }} upper numberOfLines={1}>
                  {call.project.productionCompany}
                </Text>
              </View>
            </Photo>
            <Stack gap={space.sm} style={{ padding: space.md }}>
              <Text variant="subheading" numberOfLines={1}>
                {call.role}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={2}>
                {call.roleDescription}
              </Text>
              <Row justify="space-between">
                <Text variant="label" tone="success">
                  {rateLabel(call.rateCents, call.rateUnit)}
                </Text>
                <Text variant="micro" tone="faint">
                  {shortDate(call.createdAt)}
                </Text>
              </Row>
            </Stack>
          </Card>
        </Pressable>
      ))}
    </View>
  );
}
