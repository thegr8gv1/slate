import { useCallback, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  SECTORS,
  SECTOR_CATALOG,
  type DeckCard,
  type FeedTelemetry,
  type Opportunity,
  type Sector,
  type SwipeDirection,
  type SwipeResponse,
} from '../../contracts';
import { ChipGroup } from '../../design/Segmented';
import { Icon } from '../../design/Icon';
import { Text } from '../../design/Text';
import { Button, Card, EmptyState, ErrorNote, Loading, Pill, Row, SectionTitle, Stack } from '../../design/primitives';
import { color, space } from '../../design/tokens';
import { ActionBar, Screen } from '../../features/shell/Shell';
import { useResponsive } from '../../features/shell/useResponsive';
import { DeckControls, SwipeDeck, type SwipeDeckHandle } from '../../features/deck/SwipeDeck';
import { CARD_HEIGHT, OpportunityDeckCard } from '../../features/deck/cards';
import { TelemetryCard } from '../../features/deck/TelemetryCard';
import { api } from '../../lib/api';
import { rateLabel } from '../../lib/format';
import { useMutation, useQuery } from '../../lib/query';
import { useSession } from '../../lib/session';

interface DeckResponse {
  cards: DeckCard<Opportunity>[];
  telemetry: FeedTelemetry;
  nextCursor: string | null;
}

export default function TalentDeck() {
  const router = useRouter();
  const { profile, account, refreshAccount } = useSession();
  const { compact, contentWidth } = useResponsive();

  const [sectors, setSectors] = useState<Sector[]>([]);
  const [radiusMiles, setRadiusMiles] = useState(60);
  const [applied, setApplied] = useState<Opportunity[]>([]);
  const deckRef = useRef<SwipeDeckHandle>(null);

  const deck = useQuery<DeckResponse>(
    (signal) =>
      api.get<DeckResponse>(
        '/discovery/opportunities',
        { sectors, radiusMiles, limit: 24 },
        signal,
      ),
    [sectors.join(','), radiusMiles, account?.id],
  );

  const swipe = useMutation(async (opportunityId: string, direction: SwipeDirection, message?: string) =>
    api.post<SwipeResponse>('/discovery/swipe', {
      subjectKind: 'opportunity',
      subjectId: opportunityId,
      direction,
      pitch: direction === 'up' ? { message: message ?? 'Available and interested — tape ready on request.' } : undefined,
    }),
  );

  const handleSwipe = useCallback(
    (card: DeckCard<Opportunity>, direction: SwipeDirection) => {
      if (direction !== 'left') setApplied((list) => [...list, card.subject]);
      void swipe.mutate(card.subject.id, direction).then(() => void refreshAccount());
    },
    [swipe, refreshAccount],
  );

  const cards = deck.data?.cards ?? [];

  const deckColumn = (
    <Stack gap={space.lg}>
      <Row justify="space-between">
        <View style={{ flex: 1 }}>
          <Text variant="subheading">Verified open roles</Text>
          <Text variant="micro" tone="faint" upper numberOfLines={1}>
            {profile ? `${profile.primaryRole} · ${radiusMiles} mi of ${profile.location.label}` : 'Loading'}
          </Text>
        </View>
        {account?.pitchAllowance !== null && account?.pitchAllowance !== undefined ? (
          <Pill label={`${account.pitchAllowance} pitches left`} tone="outline" size="sm" />
        ) : (
          <Pill label="Unlimited" tone="success" size="sm" />
        )}
      </Row>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <ChipGroup
          options={SECTORS.map((s) => ({ value: s, label: SECTOR_CATALOG[s].shortLabel }))}
          selected={sectors}
          onToggle={(value) =>
            setSectors((current) =>
              current.includes(value) ? current.filter((s) => s !== value) : [...current, value],
            )
          }
        />
      </ScrollView>

      {deck.error ? (
        <ErrorNote message={deck.error.message} onRetry={deck.refetch} />
      ) : deck.loading && cards.length === 0 ? (
        <Loading label="Finding gigs near you" />
      ) : (
        <View style={{ height: CARD_HEIGHT + 8 }}>
          <SwipeDeck<DeckCard<Opportunity>>
            handleRef={deckRef}
            items={cards}
            height={CARD_HEIGHT + 8}
            keyOf={(card) => card.subject.id}
            renderCard={(card) => <OpportunityDeckCard card={card} />}
            onSwipe={handleSwipe}
            empty={
              <EmptyState
                title="No more calls in range"
                body="Widen your travel radius or add another sector. Sponsored briefs refresh through the day."
                action={
                  <Row gap={space.sm}>
                    <Button
                      label="Widen radius"
                      variant="secondary"
                      onPress={() => setRadiusMiles((r) => Math.min(150, r + 40))}
                    />
                    <Button label="Back to home" onPress={() => router.push('/talent')} />
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
      {deck.data?.telemetry ? <TelemetryCard telemetry={deck.data.telemetry} /> : null}

      <Card style={{ gap: space.md }}>
        <SectionTitle title="Roles you applied for" accent={String(applied.length)} />
        {applied.length === 0 ? (
          <Text variant="caption" tone="faint">
            Swipe right if you are interested. Swipe up to send a direct audition message to the casting director.
          </Text>
        ) : (
          <Stack gap={space.sm}>
            {applied.slice(-4).reverse().map((opportunity) => (
              <Row key={opportunity.id} justify="space-between">
                <View style={{ flex: 1 }}>
                  <Text variant="caption" numberOfLines={1}>
                    {opportunity.role}
                  </Text>
                  <Text variant="micro" tone="faint" numberOfLines={1}>
                    {opportunity.project.title}
                  </Text>
                </View>
                <Text variant="caption" tone="success">
                  {rateLabel(opportunity.rateCents, opportunity.rateUnit)}
                </Text>
              </Row>
            ))}
          </Stack>
        )}
        <Button label="Open inbox" variant="secondary" full onPress={() => router.push('/talent/inbox')} />
      </Card>

      <Card style={{ gap: space.sm }}>
        <SectionTitle title="Travel radius" accent={`${radiusMiles} mi`} />
        <ChipGroup
          single
          options={[25, 40, 60, 100, 150].map((r) => ({ value: String(r), label: `${r} mi` }))}
          selected={[String(radiusMiles)]}
          onToggle={(value) => setRadiusMiles(Number(value))}
        />
        <Row gap={space.sm} style={{ marginTop: space.sm }}>
          <Icon name="zap" size={14} color={color.accent} />
          <Text variant="micro" tone="faint" style={{ flex: 1 }}>
            Set-Beacon alerts use your radius too — keep it wide to catch same-day emergency calls.
          </Text>
        </Row>
      </Card>
    </Stack>
  );

  return (
    <Screen
      title="Gigs"
      accent="Swipe for work"
      scroll={compact}
      footer={
        <ActionBar>
          <DeckControls
            disabled={cards.length === 0}
            onPass={() => deckRef.current?.swipe('left')}
            onLike={() => deckRef.current?.swipe('right')}
            onPitch={() => deckRef.current?.swipe('up')}
            pitchLabel="Audition"
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
    </Screen>
  );
}
