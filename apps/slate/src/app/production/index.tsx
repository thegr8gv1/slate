import { useCallback, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  SECTOR_CATALOG,
  SECTORS,
  SUPER_PITCH_TIERS,
  UNION_STATUSES,
  formatMoney,
  type DeckCard,
  type Project,
  type Sector,
  type SuperPitchTierId,
  type SwipeDirection,
  type SwipeResponse,
  type TalentProfile,
  type UnionStatus,
  type FeedTelemetry,
} from '../../contracts';
import { ChipGroup } from '../../design/Segmented';
import { Sheet } from '../../design/Sheet';
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
} from '../../design/primitives';
import { color, radius, space } from '../../design/tokens';
import { ActionBar, Screen } from '../../features/shell/Shell';
import { useResponsive } from '../../features/shell/useResponsive';
import { DeckControls, SwipeDeck, type SwipeDeckHandle } from '../../features/deck/SwipeDeck';
import { CARD_HEIGHT, TalentDeckCard } from '../../features/deck/cards';
import { TelemetryCard } from '../../features/deck/TelemetryCard';
import { api } from '../../lib/api';
import { rateLabel, titleCase, unionLabel } from '../../lib/format';
import { useMutation, useQuery } from '../../lib/query';
import { useSession } from '../../lib/session';

interface DeckResponse {
  cards: DeckCard<TalentProfile>[];
  telemetry: FeedTelemetry;
  nextCursor: string | null;
}

interface Filters {
  sectors: Sector[];
  unionStatuses: UnionStatus[];
  maxRateCents: number | null;
  radiusMiles: number;
  ageMin: number | null;
  ageMax: number | null;
  minFollowers: number | null;
  auditedOnly: boolean;
}

const DEFAULT_FILTERS: Filters = {
  sectors: ['screen_stage'],
  unionStatuses: [],
  maxRateCents: null,
  radiusMiles: 50,
  ageMin: null,
  ageMax: null,
  minFollowers: null,
  auditedOnly: false,
};

export default function ProductionDeck() {
  const router = useRouter();
  const { account, refreshAccount } = useSession();
  const { compact, contentWidth } = useResponsive();

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [pitchTarget, setPitchTarget] = useState<TalentProfile | null>(null);
  const [shortlisted, setShortlisted] = useState<string[]>([]);
  const deckRef = useRef<SwipeDeckHandle>(null);

  const projects = useQuery<{ projects: Project[] }>(
    (signal) => api.get<{ projects: Project[] }>('/projects', undefined, signal),
    [account?.id],
  );
  const [projectId, setProjectId] = useState<string | null>(null);
  const activeProject = useMemo(
    () => projects.data?.projects.find((p) => p.id === projectId) ?? projects.data?.projects[0] ?? null,
    [projects.data, projectId],
  );

  // Hoisted out of the fetcher: React Compiler memoises the request object
  // at render time, so anything dereferenced inside it must already be safe.
  const activeProjectId = activeProject?.id ?? null;

  const deck = useQuery<DeckResponse>(
    (signal) =>
      api.get<DeckResponse>(
        '/discovery/talent',
        {
          projectId: activeProjectId ?? '',
          sectors: filters.sectors,
          unionStatuses: filters.unionStatuses,
          maxRateCents: filters.maxRateCents ?? undefined,
          radiusMiles: filters.radiusMiles,
          ageMin: filters.ageMin ?? undefined,
          ageMax: filters.ageMax ?? undefined,
          minFollowers: filters.minFollowers ?? undefined,
          maxFraudScore: filters.auditedOnly ? 0.15 : undefined,
          limit: 24,
        },
        signal,
      ),
    [activeProjectId, JSON.stringify(filters)],
    { enabled: Boolean(activeProjectId) },
  );

  const swipe = useMutation(async (profileId: string, direction: SwipeDirection, superTier?: SuperPitchTierId | null, message?: string, offerCents?: number | null) =>
    api.post<SwipeResponse>('/discovery/swipe', {
      subjectKind: 'talent',
      subjectId: profileId,
      direction,
      projectId: activeProject?.id ?? null,
      pitch:
        direction === 'up'
          ? { message: message ?? 'We would like to see you on tape for this role.', superTier: superTier ?? null, offerCents: offerCents ?? null }
          : undefined,
    }),
  );

  const handleSwipe = useCallback(
    (card: DeckCard<TalentProfile>, direction: SwipeDirection) => {
      if (direction === 'up') {
        setPitchTarget(card.subject);
        return;
      }
      if (direction === 'right') setShortlisted((ids) => [...ids, card.subject.id]);
      void swipe.mutate(card.subject.id, direction).then(() => void refreshAccount());
    },
    [swipe, refreshAccount],
  );

  if (projects.loading && !projects.data) {
    return (
      <Screen title="Discover" accent="Swipe to cast">
        <Loading label="Loading projects" />
      </Screen>
    );
  }

  if (!activeProject) {
    return (
      <Screen title="Discover" accent="Swipe to cast">
        <EmptyState
          title="No projects yet"
          body="A production needs at least one project before the deck can rank talent against it."
        />
      </Screen>
    );
  }

  const cards = deck.data?.cards ?? [];
  const telemetry = deck.data?.telemetry;

  const deckColumn = (
    <Stack gap={space.lg}>
      {/* Project selector */}
      {projects.data && projects.data.projects.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Row gap={space.sm}>
            {projects.data.projects.map((project) => (
              <Pressable
                key={project.id}
                accessibilityRole="button"
                accessibilityState={{ selected: project.id === activeProject.id }}
                onPress={() => setProjectId(project.id)}
                style={{
                  paddingHorizontal: space.md,
                  paddingVertical: 7,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: project.id === activeProject.id ? color.accentBorder : color.border,
                  backgroundColor: project.id === activeProject.id ? color.accentSoft : color.surfaceAlt,
                }}
              >
                <Text variant="caption" tone={project.id === activeProject.id ? 'accent' : 'muted'}>
                  {project.title}
                </Text>
              </Pressable>
            ))}
          </Row>
        </ScrollView>
      ) : null}

      <Row justify="space-between">
        <View style={{ flex: 1 }}>
          <Text variant="subheading" numberOfLines={1}>
            {activeProject.title}
          </Text>
          <Text variant="micro" tone="faint" upper numberOfLines={1}>
            {SECTOR_CATALOG[filters.sectors[0] ?? 'screen_stage'].shortLabel} · {filters.radiusMiles} mi ·{' '}
            {formatMoney(activeProject.budgetCents, { compact: true })} budget
          </Text>
        </View>
        <Button
          label="Filters"
          variant="secondary"
          size="sm"
          icon={<Icon name="sliders" size={14} color={color.textMuted} />}
          onPress={() => setFilterOpen(true)}
        />
      </Row>

      {deck.error ? (
        <ErrorNote message={deck.error.message} onRetry={deck.refetch} />
      ) : deck.loading && cards.length === 0 ? (
        <Loading label="Finding best matches" />
      ) : (
        <View style={{ height: CARD_HEIGHT + 8 }}>
          <SwipeDeck<DeckCard<TalentProfile>>
            handleRef={deckRef}
            items={cards}
            height={CARD_HEIGHT + 8}
            keyOf={(card) => card.subject.id}
            renderCard={(card) => <TalentDeckCard card={card} />}
            onSwipe={handleSwipe}
            empty={
              <EmptyState
                title="All caught up!"
                body={`You have reviewed all ${SECTOR_CATALOG[filters.sectors[0] ?? 'screen_stage'].shortLabel.toLowerCase()} talent inside ${filters.radiusMiles} miles. Try searching further away or check your shortlist.`}
                action={
                  <Row gap={space.sm}>
                    <Button label="Search further" variant="secondary" onPress={() => setFilters((f) => ({ ...f, radiusMiles: Math.min(120, f.radiusMiles + 40) }))} />
                    <Button label="View shortlist" onPress={() => router.push('/production/board')} />
                  </Row>
                }
              />
            }
          />
        </View>
      )}
    </Stack>
  );

  const sidebar = (
    <Stack gap={space.lg}>
      {telemetry ? <TelemetryCard telemetry={telemetry} /> : null}
      <Card style={{ gap: space.md }}>
        <SectionTitle title="Saved this session" accent={String(shortlisted.length)} />
        {shortlisted.length === 0 ? (
          <Text variant="caption" tone="faint">
            Swipe right to save someone to your shortlist. Swipe up to send a direct job offer with your audition script.
          </Text>
        ) : (
          <Text variant="caption" tone="muted">
            {shortlisted.length} saved for {activeProject.title}. Open the board to send offers and fund payments.
          </Text>
        )}
        <Button
          label="View shortlist & hiring board"
          variant="secondary"
          full
          onPress={() => router.push('/production/board')}
        />
      </Card>
      <Card style={{ gap: space.sm }}>
        <SectionTitle title="How to Swipe" />
        <GestureHint icon="close" tone={color.danger} label="Swipe left" body="Pass" />
        <GestureHint icon="heart" tone={color.success} label="Swipe right" body="Save to shortlist" />
        <GestureHint icon="arrowUp" tone={color.brand} label="Swipe up" body="Send direct offer" />
      </Card>
    </Stack>
  );

  return (
    <Screen
      title="Discover"
      accent="Swipe to cast"
      scroll={compact}
      footer={
        <ActionBar>
          <DeckControls
            disabled={cards.length === 0}
            onPass={() => deckRef.current?.swipe('left')}
            onLike={() => deckRef.current?.swipe('right')}
            onPitch={() => deckRef.current?.swipe('up')}
            pitchLabel="Direct Offer"
          />
        </ActionBar>
      }
    >
      {compact ? (
        deckColumn
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: space.lg, paddingBottom: space.xl }}>
          <Row gap={space.xl} align="flex-start">
            <View style={{ width: Math.min(420, contentWidth * 0.5) }}>{deckColumn}</View>
            <View style={{ flex: 1 }}>{sidebar}</View>
          </Row>
        </ScrollView>
      )}

      <FilterSheet
        visible={filterOpen}
        filters={filters}
        onClose={() => setFilterOpen(false)}
        onApply={(next) => {
          setFilters(next);
          setFilterOpen(false);
        }}
      />

      <PitchSheet
        profile={pitchTarget}
        project={activeProject}
        allowance={account?.pitchAllowance ?? null}
        onClose={() => setPitchTarget(null)}
        onSend={async (message, offerCents, tier) => {
          if (!pitchTarget) return;
          const result = await swipe.mutate(pitchTarget.id, 'up', tier, message, offerCents);
          setPitchTarget(null);
          void refreshAccount();
          return result;
        }}
        error={swipe.error?.message ?? null}
        pending={swipe.pending}
      />
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

function GestureHint({
  icon,
  tone,
  label,
  body,
}: {
  icon: 'close' | 'heart' | 'arrowUp';
  tone: string;
  label: string;
  body: string;
}) {
  return (
    <Row gap={space.sm}>
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: `${tone}22`,
        }}
      >
        <Icon name={icon} size={13} color={tone} strokeWidth={2.4} />
      </View>
      <Text variant="caption" tone="muted" style={{ flex: 1 }}>
        <Text variant="caption" tone="default">
          {label}
        </Text>
        {' — '}
        {body}
      </Text>
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/* Filter sheet                                                        */
/* ------------------------------------------------------------------ */

function FilterSheet({
  visible,
  filters,
  onClose,
  onApply,
}: {
  visible: boolean;
  filters: Filters;
  onClose: () => void;
  onApply: (next: Filters) => void;
}) {
  const [draft, setDraft] = useState(filters);

  return (
    <Sheet visible={visible} onClose={onClose} title="Deck filters">
      <Stack gap={space.xl}>
        <Stack gap={space.sm}>
          <Text variant="micro" tone="faint" upper>
            Sector
          </Text>
          <ChipGroup
            options={SECTORS.map((s) => ({ value: s, label: SECTOR_CATALOG[s].shortLabel }))}
            selected={draft.sectors}
            onToggle={(value) =>
              setDraft((d) => ({
                ...d,
                sectors: d.sectors.includes(value)
                  ? d.sectors.filter((s) => s !== value)
                  : [...d.sectors, value],
              }))
            }
          />
        </Stack>

        <Stack gap={space.sm}>
          <Text variant="micro" tone="faint" upper>
            Union status
          </Text>
          <ChipGroup
            options={UNION_STATUSES.map((u) => ({ value: u, label: unionLabel(u) }))}
            selected={draft.unionStatuses}
            onToggle={(value) =>
              setDraft((d) => ({
                ...d,
                unionStatuses: d.unionStatuses.includes(value)
                  ? d.unionStatuses.filter((u) => u !== value)
                  : [...d.unionStatuses, value],
              }))
            }
          />
        </Stack>

        <Stack gap={space.sm}>
          <Row justify="space-between">
            <Text variant="micro" tone="faint" upper>
              Search radius
            </Text>
            <Text variant="label" tone="accent">
              {draft.radiusMiles} mi
            </Text>
          </Row>
          <ChipGroup
            single
            options={[15, 25, 50, 80, 120].map((r) => ({ value: String(r), label: `${r} mi` }))}
            selected={[String(draft.radiusMiles)]}
            onToggle={(value) => setDraft((d) => ({ ...d, radiusMiles: Number(value) }))}
          />
        </Stack>

        <Stack gap={space.sm}>
          <Text variant="micro" tone="faint" upper>
            Maximum day rate
          </Text>
          <ChipGroup
            single
            options={[
              { value: 'any', label: 'Any' },
              { value: '75000', label: 'Up to $750' },
              { value: '150000', label: 'Up to $1.5K' },
              { value: '300000', label: 'Up to $3K' },
              { value: '1000000', label: 'Up to $10K' },
            ]}
            selected={[draft.maxRateCents ? String(draft.maxRateCents) : 'any']}
            onToggle={(value) =>
              setDraft((d) => ({ ...d, maxRateCents: value === 'any' ? null : Number(value) }))
            }
          />
        </Stack>

        <Stack gap={space.sm}>
          <Text variant="micro" tone="faint" upper>
            Age range
          </Text>
          <ChipGroup
            single
            options={[
              { value: 'any', label: 'Any age' },
              { value: '18-25', label: '18–25' },
              { value: '26-35', label: '26–35' },
              { value: '36-50', label: '36–50' },
              { value: '51-99', label: '51+' },
            ]}
            selected={[draft.ageMin ? `${draft.ageMin}-${draft.ageMax}` : 'any']}
            onToggle={(value) => {
              if (value === 'any') {
                setDraft((d) => ({ ...d, ageMin: null, ageMax: null }));
                return;
              }
              const [min, max] = value.split('-').map(Number);
              setDraft((d) => ({ ...d, ageMin: min, ageMax: max }));
            }}
          />
        </Stack>

        <Row justify="space-between">
          <View style={{ flex: 1 }}>
            <Text variant="subheading">Audited engagement only</Text>
            <Text variant="micro" tone="faint">
              Hides profiles the trust pipeline has flagged
            </Text>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: draft.auditedOnly }}
            onPress={() => setDraft((d) => ({ ...d, auditedOnly: !d.auditedOnly }))}
            style={{
              width: 50,
              height: 28,
              borderRadius: radius.pill,
              backgroundColor: draft.auditedOnly ? color.success : color.surfaceHot,
              padding: 3,
            }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: '#FFF',
                transform: [{ translateX: draft.auditedOnly ? 22 : 0 }],
              }}
            />
          </Pressable>
        </Row>

        <Row gap={space.md}>
          <Button label="Reset" variant="ghost" onPress={() => setDraft(DEFAULT_FILTERS)} />
          <View style={{ flex: 1 }} />
          <Button label="Apply filters" onPress={() => onApply(draft)} />
        </Row>
      </Stack>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Instant Pitch sheet                                                 */
/* ------------------------------------------------------------------ */

function PitchSheet({
  profile,
  project,
  allowance,
  onClose,
  onSend,
  error,
  pending,
}: {
  profile: TalentProfile | null;
  project: Project;
  allowance: number | null;
  onClose: () => void;
  onSend: (message: string, offerCents: number | null, tier: SuperPitchTierId | null) => Promise<unknown>;
  error: string | null;
  pending: boolean;
}) {
  const [message, setMessage] = useState('');
  const [offer, setOffer] = useState('');
  const [tier, setTier] = useState<SuperPitchTierId | null>(null);

  const suggested = profile?.dayRateCents ?? 0;

  return (
    <Sheet visible={Boolean(profile)} onClose={onClose} title="Instant Pitch">
      {profile ? (
        <Stack gap={space.lg}>
          <Row gap={space.md}>
            <Avatar name={profile.displayName} uri={profile.avatarUrl} size={48} />
            <View style={{ flex: 1 }}>
              <Text variant="subheading">{profile.displayName}</Text>
              <Text variant="micro" tone="faint" upper>
                {profile.primaryRole} · {project.title}
              </Text>
            </View>
          </Row>

          <Stack gap={space.sm}>
            <Text variant="micro" tone="faint" upper>
              Message
            </Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={4}
              placeholder={`Side attached for ${project.title}. We'd like you on tape by Thursday.`}
              placeholderTextColor={color.textFaint}
              style={{
                backgroundColor: color.surfaceAlt,
                borderWidth: 1,
                borderColor: color.border,
                borderRadius: radius.md,
                padding: space.md,
                color: color.text,
                minHeight: 92,
                textAlignVertical: 'top',
              }}
            />
          </Stack>

          <Stack gap={space.sm}>
            <Row justify="space-between">
              <Text variant="micro" tone="faint" upper>
                Rate offer
              </Text>
              {suggested > 0 ? (
                <Pressable onPress={() => setOffer(String(Math.round(suggested / 100)))}>
                  <Text variant="micro" tone="accent" upper>
                    Use their quote · {rateLabel(suggested, 'day')}
                  </Text>
                </Pressable>
              ) : null}
            </Row>
            <TextInput
              value={offer}
              onChangeText={setOffer}
              keyboardType="number-pad"
              inputMode="numeric"
              placeholder="1200"
              placeholderTextColor={color.textFaint}
              style={{
                backgroundColor: color.surfaceAlt,
                borderWidth: 1,
                borderColor: color.border,
                borderRadius: radius.md,
                paddingHorizontal: space.md,
                paddingVertical: 11,
                color: color.text,
              }}
            />
          </Stack>

          <Stack gap={space.sm}>
            <Row justify="space-between">
              <Text variant="micro" tone="faint" upper>
                Delivery
              </Text>
              <Text variant="micro" tone="faint">
                {allowance === null ? 'Unlimited pitches' : `${allowance} free pitches left`}
              </Text>
            </Row>
            <Pressable
              onPress={() => setTier(null)}
              style={optionStyle(tier === null)}
              accessibilityRole="radio"
              accessibilityState={{ checked: tier === null }}
            >
              <View style={{ flex: 1 }}>
                <Text variant="subheading">Standard queue</Text>
                <Text variant="micro" tone="faint">
                  Delivered with the rest of their inbox
                </Text>
              </View>
              <Text variant="label" tone="muted">
                Free
              </Text>
            </Pressable>
            {SUPER_PITCH_TIERS.map((option) => (
              <Pressable
                key={option.id}
                onPress={() => setTier(option.id)}
                style={optionStyle(tier === option.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: tier === option.id }}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: color.brandSoft,
                    marginRight: space.md,
                  }}
                >
                  <Icon name="zap" size={13} color={color.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="subheading">Super Pitch · {option.label}</Text>
                  <Text variant="micro" tone="faint">
                    {option.description}
                  </Text>
                </View>
                <Text variant="label" tone="brand">
                  {formatMoney(option.priceCents, { cents: true })}
                </Text>
              </Pressable>
            ))}
          </Stack>

          {error ? <ErrorNote message={error} /> : null}

          <Row gap={space.md}>
            <Button label="Cancel" variant="ghost" onPress={onClose} />
            <View style={{ flex: 1 }} />
            <Button
              label={tier ? 'Send Super Pitch' : 'Send pitch'}
              loading={pending}
              onPress={() => {
                const cents = offer ? Math.round(Number(offer) * 100) : null;
                void onSend(message, Number.isFinite(cents) ? cents : null, tier);
              }}
            />
          </Row>
        </Stack>
      ) : null}
    </Sheet>
  );
}

function optionStyle(active: boolean) {
  return {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: active ? color.accentBorder : color.border,
    backgroundColor: active ? color.accentSoft : color.surfaceAlt,
  };
}
