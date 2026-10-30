import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import type {
  Beacon,
  EscrowAgreement,
  MatchRecord,
  Opportunity,
  Project,
  SideScript,
  TalentProfile,
} from '../../contracts';
import { MilestoneTrack, type TrackStep } from '../../design/charts';
import { Icon } from '../../design/Icon';
import { Segmented } from '../../design/Segmented';
import { Sheet } from '../../design/Sheet';
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
  SectionTitle,
  Stack,
  Stat,
} from '../../design/primitives';
import { color, radius, space } from '../../design/tokens';
import { Screen } from '../../features/shell/Shell';
import { useResponsive } from '../../features/shell/useResponsive';
import { api } from '../../lib/api';
import { formatMoney, rateLabel, relativeTime, shortDate, titleCase } from '../../lib/format';
import { useMutation, useQuery } from '../../lib/query';

interface BoardResponse {
  project: Project;
  shortlist: { match: MatchRecord; profile: TalentProfile }[];
  opportunities: Opportunity[];
  escrows: EscrowAgreement[];
  beacons: Beacon[];
  sides: SideScript[];
}

type Tab = 'shortlist' | 'roles' | 'escrow';

const STATE_TONE: Record<MatchRecord['state'], 'neutral' | 'brand' | 'success' | 'accent' | 'danger'> = {
  shortlisted: 'neutral',
  mutual: 'brand',
  pitched: 'accent',
  offer_sent: 'accent',
  booked: 'success',
  declined: 'danger',
};

export default function ProjectBoard() {
  const router = useRouter();
  const { columns, compact } = useResponsive();
  const [tab, setTab] = useState<Tab>('shortlist');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [offerFor, setOfferFor] = useState<TalentProfile | null>(null);

  const projects = useQuery<{ projects: Project[] }>(
    (signal) => api.get<{ projects: Project[] }>('/projects', undefined, signal),
    [],
  );
  const activeId = projectId ?? projects.data?.projects[0]?.id ?? null;

  const board = useQuery<BoardResponse>(
    (signal) => api.get<BoardResponse>(`/projects/${activeId}/board`, undefined, signal),
    [activeId],
    { enabled: Boolean(activeId) },
  );

  const createEscrow = useMutation(async (profile: TalentProfile, role: string, rateCents: number, days: number) =>
    api.post<{ escrow: EscrowAgreement }>('/escrows', {
      projectId: activeId,
      talentProfileId: profile.id,
      role,
      rateCents,
      rateUnit: 'day',
      days,
    }),
  );

  if (board.loading && !board.data) {
    return (
      <Screen title="Project" accent="Board">
        <Loading label="Loading project board" />
      </Screen>
    );
  }
  if (board.error) {
    return (
      <Screen title="Project" accent="Board">
        <ErrorNote message={board.error.message} onRetry={board.refetch} />
      </Screen>
    );
  }
  if (!board.data) {
    return (
      <Screen title="Project" accent="Board">
        <EmptyState title="No project selected" />
      </Screen>
    );
  }

  const { project, shortlist, opportunities, escrows, beacons } = board.data;
  const booked = shortlist.filter((s) => s.match.state === 'booked').length;
  const committed = escrows.reduce((sum, e) => sum + e.grossCents, 0);

  return (
    <Screen
      title="Project"
      accent={project.title.toUpperCase()}
      onRefresh={board.refetch}
      refreshing={board.refreshing}
    >
      <Stack gap={space.xl}>
        {/* ---------- Project header ---------- */}
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <Photo uri={project.coverUrl} seed={project.id} height={compact ? 120 : 150} rounded={0}>
            <View
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(14, 6, 18, 0.55)' }}
            />
            <Stack gap={2} style={{ position: 'absolute', left: space.lg, bottom: space.lg, right: space.lg }}>
              <Text variant="micro" style={{ color: 'rgba(255,255,255,0.75)' }} upper>
                {project.productionCompany}
              </Text>
              <Text variant="title">{project.title}</Text>
              <Row gap={space.xs} wrap style={{ marginTop: space.xs }}>
                <Pill label={titleCase(project.status)} tone="accent" size="sm" />
                <Pill label={titleCase(project.kind)} tone="outline" size="sm" />
                <Pill label={project.location.label} tone="outline" size="sm" />
              </Row>
            </Stack>
          </Photo>
          <Row justify="space-between" style={{ padding: space.lg }}>
            <Stat label="Budget" value={formatMoney(project.budgetCents, { compact: true })} />
            <Stat label="In escrow" value={formatMoney(committed, { compact: true })} align="center" tone="success" />
            <Stat label="Booked" value={`${booked}/${shortlist.length}`} align="center" />
            <Stat label="Shoot" value={shortDate(project.shootStart)} align="flex-end" />
          </Row>
        </Card>

        {projects.data && projects.data.projects.length > 1 ? (
          <Row gap={space.sm} wrap>
            {projects.data.projects.map((p) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                onPress={() => setProjectId(p.id)}
                style={{
                  paddingHorizontal: space.md,
                  paddingVertical: 6,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: p.id === activeId ? color.accentBorder : color.border,
                  backgroundColor: p.id === activeId ? color.accentSoft : color.surfaceAlt,
                }}
              >
                <Text variant="caption" tone={p.id === activeId ? 'accent' : 'muted'}>
                  {p.title}
                </Text>
              </Pressable>
            ))}
          </Row>
        ) : null}

        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'shortlist', label: 'Shortlist', badge: shortlist.length },
            { value: 'roles', label: 'Roles', badge: opportunities.length },
            { value: 'escrow', label: 'Escrow', badge: escrows.length },
          ]}
        />

        {/* ---------- Shortlist ---------- */}
        {tab === 'shortlist' ? (
          shortlist.length === 0 ? (
            <EmptyState
              title="No one shortlisted yet"
              body="Swipe right while browsing talent to save candidates here."
              action={<Button label="Browse talent" onPress={() => router.push('/production')} />}
            />
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
              {shortlist.map(({ match, profile }) => (
                <View
                  key={match.id}
                  style={{ width: (columns === 1 ? '100%' : `${100 / Math.min(2, columns) - 1}%`) as never }}
                >
                  <Card style={{ gap: space.md }}>
                    <Row gap={space.md}>
                      <Photo uri={profile.avatarUrl} seed={profile.id} width={54} height={54} rounded={radius.sm} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="subheading" numberOfLines={1}>
                          {profile.displayName}
                        </Text>
                        <Text variant="micro" tone="faint" upper numberOfLines={1}>
                          {profile.primaryRole}
                          {profile.age ? ` · ${profile.age}` : ''} · ★ {profile.rating.toFixed(1)}
                        </Text>
                        <Row gap={space.xs} style={{ marginTop: 2 }}>
                          <Pill label={titleCase(match.state)} tone={STATE_TONE[match.state]} size="sm" />
                          {profile.masked ? <Pill label="Private" tone="brand" size="sm" /> : null}
                        </Row>
                      </View>
                      <Stack gap={2} style={{ alignItems: 'flex-end' }}>
                        <Text variant="subheading" tone="success">
                          {profile.dayRateCents ? rateLabel(profile.dayRateCents, 'day') : profile.dayRateBand}
                        </Text>
                        <Text variant="micro" tone="faint">
                          {relativeTime(match.lastActivityAt)}
                        </Text>
                      </Stack>
                    </Row>

                    <Divider />

                    <Row justify="space-between">
                      <BoardAction
                        icon="edit"
                        label="Request audition"
                        onPress={() => router.push(`/talent/casting` as never)}
                      />
                      <BoardAction
                        icon="send"
                        label="Direct pitch"
                        onPress={() => router.push('/production')}
                      />
                      <BoardAction
                        icon="dollar"
                        label="Open escrow"
                        onPress={() => setOfferFor(profile)}
                      />
                    </Row>
                  </Card>
                </View>
              ))}
            </View>
          )
        ) : null}

        {/* ---------- Roles ---------- */}
        {tab === 'roles' ? (
          <Stack gap={space.md}>
            {opportunities.map((opportunity) => (
              <Card key={opportunity.id} style={{ gap: space.md }}>
                <Row justify="space-between">
                  <View style={{ flex: 1 }}>
                    <Text variant="subheading">{opportunity.role}</Text>
                    <Text variant="caption" tone="muted" numberOfLines={2}>
                      {opportunity.roleDescription}
                    </Text>
                  </View>
                  <Stack gap={2} style={{ alignItems: 'flex-end' }}>
                    <Text variant="subheading" tone="success">
                      {rateLabel(opportunity.rateCents, opportunity.rateUnit)}
                    </Text>
                    <Text variant="micro" tone="faint">
                      {opportunity.slotsFilled}/{opportunity.slots} filled
                    </Text>
                  </Stack>
                </Row>
                <Row gap={space.xs} wrap>
                  <Pill label={opportunity.shootDates} tone="outline" size="sm" />
                  {opportunity.sponsored ? <Pill label="Sponsored" tone="accent" size="sm" /> : null}
                  {opportunity.sideScriptId ? <Pill label="Side attached" tone="brand" size="sm" /> : null}
                </Row>
              </Card>
            ))}
          </Stack>
        ) : null}

        {/* ---------- Escrow ---------- */}
        {tab === 'escrow' ? (
          escrows.length === 0 ? (
            <EmptyState
              title="No escrow agreements yet"
              body="Open an escrow from a shortlisted candidate. Funds are held before call time and released on signed milestones."
            />
          ) : (
            <Stack gap={space.md}>
              {escrows.map((escrow) => (
                <Pressable
                  key={escrow.id}
                  accessibilityRole="link"
                  onPress={() => router.push(`/agency/escrow?id=${escrow.id}` as never)}
                >
                  <Card style={{ gap: space.lg }}>
                    <Row justify="space-between">
                      <Row gap={space.md}>
                        <Photo
                          uri={escrow.talentAvatarUrl}
                          seed={escrow.talentProfileId}
                          width={40}
                          height={40}
                          rounded={radius.sm}
                        />
                        <View>
                          <Text variant="subheading">{escrow.talentDisplayName}</Text>
                          <Text variant="micro" tone="faint" upper>
                            {escrow.role}
                          </Text>
                        </View>
                      </Row>
                      <Stack gap={2} style={{ alignItems: 'flex-end' }}>
                        <Text variant="subheading" tone="success">
                          {formatMoney(escrow.grossCents)}
                        </Text>
                        <Pill label={titleCase(escrow.state)} tone="brand" size="sm" />
                      </Stack>
                    </Row>
                    <MilestoneTrack steps={trackFor(escrow)} />
                  </Card>
                </Pressable>
              ))}
            </Stack>
          )
        ) : null}

        {/* ---------- Live beacons on this project ---------- */}
        {beacons.length > 0 ? (
          <Stack gap={space.md}>
            <SectionTitle title="Set-Beacon history" accent={String(beacons.length)} />
            {beacons.slice(0, 4).map((beacon) => (
              <Card key={beacon.id} variant="alt" padding={space.md}>
                <Row justify="space-between">
                  <Row gap={space.sm}>
                    <Icon name="zap" size={15} color={color.accent} />
                    <View>
                      <Text variant="caption">{beacon.role}</Text>
                      <Text variant="micro" tone="faint">
                        {beacon.devicesTargeted} devices · {beacon.fanoutMs}ms fanout
                      </Text>
                    </View>
                  </Row>
                  <Pill
                    label={titleCase(beacon.state)}
                    tone={beacon.state === 'claimed' ? 'success' : beacon.state === 'broadcasting' ? 'accent' : 'neutral'}
                    size="sm"
                  />
                </Row>
              </Card>
            ))}
          </Stack>
        ) : null}
      </Stack>

      {/* ---------- Open escrow sheet ---------- */}
      <OfferSheet
        profile={offerFor}
        project={project}
        pending={createEscrow.pending}
        error={createEscrow.error?.message ?? null}
        onClose={() => setOfferFor(null)}
        onConfirm={async (role, rateCents, days) => {
          if (!offerFor) return;
          const result = await createEscrow.mutate(offerFor, role, rateCents, days);
          if (result) {
            setOfferFor(null);
            board.refetch();
            setTab('escrow');
          }
        }}
      />
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

export function trackFor(escrow: EscrowAgreement): TrackStep[] {
  const order: EscrowAgreement['milestones'][number]['kind'][] = [
    'deposit',
    'check_in',
    'wrap',
    'final_payout',
  ];
  const ordered = order
    .map((kind) => escrow.milestones.find((m) => m.kind === kind))
    .filter((m): m is EscrowAgreement['milestones'][number] => Boolean(m));

  const firstOpen = ordered.findIndex((m) => !m.signedOffAt);

  return ordered.map((milestone, index) => ({
    label: milestone.label,
    sub: milestone.releaseBps > 0 ? `${milestone.releaseBps / 100}%` : undefined,
    state: milestone.signedOffAt ? 'done' : index === firstOpen ? 'current' : 'todo',
  }));
}

function BoardAction({
  icon,
  label,
  onPress,
}: {
  icon: 'edit' | 'send' | 'dollar';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ alignItems: 'center', gap: 4, flex: 1 }}
    >
      <Icon name={icon} size={17} color={color.textMuted} />
      <Text variant="micro" tone="faint" align="center" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function OfferSheet({
  profile,
  project,
  onClose,
  onConfirm,
  pending,
  error,
}: {
  profile: TalentProfile | null;
  project: Project;
  onClose: () => void;
  onConfirm: (role: string, rateCents: number, days: number) => Promise<void>;
  pending: boolean;
  error: string | null;
}) {
  const [days, setDays] = useState(4);
  const rateCents = profile?.dayRateCents ?? 100_000;
  const gross = rateCents * days;

  const splits = useMemo(
    () => [
      { label: 'Talent net', bps: profile?.agencyId ? 8000 : 9000 },
      ...(profile?.agencyId ? [{ label: 'Agency commission', bps: 1000 }] : []),
      { label: 'Slate platform fee', bps: 500 },
      { label: 'Union P&H / withholding', bps: 500 },
    ],
    [profile?.agencyId],
  );

  return (
    <Sheet
      visible={Boolean(profile)}
      onClose={onClose}
      title="Open Smart Escrow"
      subtitle={profile ? `${profile.displayName} · ${project.title}` : undefined}
      footer={
        <Row gap={space.md}>
          <Button label="Cancel" variant="ghost" onPress={onClose} />
          <View style={{ flex: 1 }} />
          <Button
            label={`Open escrow · ${formatMoney(gross)}`}
            loading={pending}
            onPress={() => void onConfirm(profile?.primaryRole ?? 'Talent', rateCents, days)}
          />
        </Row>
      }
    >
      {profile ? (
        <Stack gap={space.lg}>
          <Card variant="alt" style={{ gap: space.md }}>
            <Row justify="space-between">
              <Stat label="Day rate" value={formatMoney(rateCents)} />
              <Stat label="Shoot days" value={String(days)} align="center" />
              <Stat label="Gross" value={formatMoney(gross)} align="flex-end" tone="success" />
            </Row>
          </Card>

          <Stack gap={space.sm}>
            <Text variant="micro" tone="faint" upper>
              Shoot days
            </Text>
            <Row gap={space.sm}>
              {[1, 2, 4, 6, 10].map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: days === option }}
                  onPress={() => setDays(option)}
                  style={{
                    flex: 1,
                    paddingVertical: 9,
                    alignItems: 'center',
                    borderRadius: radius.sm,
                    borderWidth: 1,
                    borderColor: days === option ? color.accentBorder : color.border,
                    backgroundColor: days === option ? color.accentSoft : color.surfaceAlt,
                  }}
                >
                  <Text variant="caption" tone={days === option ? 'accent' : 'muted'}>
                    {option}
                  </Text>
                </Pressable>
              ))}
            </Row>
          </Stack>

          <Stack gap={space.sm}>
            <Text variant="micro" tone="faint" upper>
              Payout split at wrap
            </Text>
            {splits.map((split) => (
              <Row key={split.label} justify="space-between">
                <Text variant="caption" tone="muted">
                  {split.label}
                </Text>
                <Row gap={space.md}>
                  <Text variant="caption" tone="faint">
                    {split.bps / 100}%
                  </Text>
                  <Text variant="caption" style={{ minWidth: 74, textAlign: 'right' }}>
                    {formatMoney(Math.floor((gross * split.bps) / 10000))}
                  </Text>
                </Row>
              </Row>
            ))}
          </Stack>

          {error ? <ErrorNote message={error} /> : null}

          <Text variant="micro" tone="faint">
            Opening an escrow does not move money. You fund it from the settlement screen before call
            time; releases are tied to on-set check-in, wrap sign-off and final payout.
          </Text>
        </Stack>
      ) : null}
    </Sheet>
  );
}
