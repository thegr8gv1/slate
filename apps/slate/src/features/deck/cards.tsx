import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import type { DeckCard, Opportunity, TalentProfile } from '../../contracts';
import { Sparkline } from '../../design/charts';
import { Icon } from '../../design/Icon';
import { Text } from '../../design/Text';
import { Card, Photo, Pill, Row, Stack } from '../../design/primitives';
import { color, radius, space } from '../../design/tokens';
import { distanceLabel, formatCount, rateLabel, titleCase, unionLabel } from '../../lib/format';

/**
 * Deck cards.
 *
 * Designed with modern dating app aesthetics (Tinder, Bumble, Hinge):
 * edge-to-edge photography, smooth gradients, story photo progress indicators,
 * verified trust badges, tag pills, and clean match reasons.
 */

export const CARD_HEIGHT = 520;

/* ------------------------------------------------------------------ */
/* Talent card (production swipes talent)                              */
/* ------------------------------------------------------------------ */

export function TalentDeckCard({ card }: { card: DeckCard<TalentProfile> }) {
  const profile = card.subject;
  const social = profile.socials[0];
  const photos = [profile.avatarUrl, ...(profile.portfolio ?? [])].filter(Boolean);
  const [photoIndex, setPhotoIndex] = useState(0);
  const currentPhoto = photos[photoIndex] ?? profile.avatarUrl;

  return (
    <Card
      padding={0}
      level={2}
      style={{
        overflow: 'hidden',
        height: CARD_HEIGHT,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(244, 114, 182, 0.22)',
        backgroundColor: color.surface,
      }}
    >
      <Photo uri={currentPhoto} seed={profile.id} height={CARD_HEIGHT} rounded={24}>
        {/* Story photo progress indicator at top (Tinder style) */}
        {photos.length > 1 ? (
          <Row gap={5} style={{ position: 'absolute', top: 10, left: 14, right: 14, zIndex: 20 }}>
            {photos.map((_, i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: 3.5,
                  borderRadius: 2,
                  backgroundColor: i === photoIndex ? '#FB7185' : 'rgba(255, 255, 255, 0.35)',
                  shadowColor: i === photoIndex ? '#F43F5E' : 'transparent',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: i === photoIndex ? 0.9 : 0,
                  shadowRadius: 4,
                  elevation: i === photoIndex ? 3 : 0,
                }}
              />
            ))}
          </Row>
        ) : null}

        {/* Tap zones for left/right photo cycling */}
        {photos.length > 1 ? (
          <View
            style={{
              position: 'absolute',
              top: 0,
              bottom: 180,
              left: 0,
              right: 0,
              flexDirection: 'row',
              zIndex: 10,
            }}
          >
            <Pressable
              accessibilityLabel="Previous photo"
              style={{ flex: 1 }}
              onPress={(e) => {
                e.stopPropagation?.();
                setPhotoIndex((prev) => (prev > 0 ? prev - 1 : prev));
              }}
            />
            <Pressable
              accessibilityLabel="Next photo"
              style={{ flex: 1 }}
              onPress={(e) => {
                e.stopPropagation?.();
                setPhotoIndex((prev) => (prev < photos.length - 1 ? prev + 1 : prev));
              }}
            />
          </View>
        ) : null}

        {/* Smooth cinematic gradient scrim */}
        <LinearGradient
          colors={['transparent', 'rgba(18, 7, 24, 0.25)', 'rgba(14, 6, 18, 0.88)', 'rgba(10, 4, 14, 0.98)']}
          locations={[0, 0.36, 0.68, 1]}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: CARD_HEIGHT * 0.72 }}
          pointerEvents="none"
        />

        {/* Top Badges (Floating Glass) */}
        <View
          style={{ position: 'absolute', top: photos.length > 1 ? 22 : space.md, left: space.md, right: space.md, zIndex: 15 }}
          pointerEvents="box-none"
        >
          <Row justify="space-between" align="center">
          <Row gap={space.xs}>
            {profile.masked ? (
              <Pill
                label="Private Profile"
                tone="brand"
                size="sm"
                icon={<Icon name="eyeOff" size={10} color={color.brand} />}
              />
            ) : null}
            {profile.badges.includes('identity') && !profile.masked ? (
              <LinearGradient
                colors={['#F43F5E', '#BE185D']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 8,
                  paddingVertical: 3.5,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.4)',
                }}
              >
                <Icon name="check" size={10} color="#FFF" strokeWidth={3} />
                <Text variant="micro" style={{ color: '#FFF', fontWeight: '700', fontSize: 10.5 }}>
                  Verified Pro
                </Text>
              </LinearGradient>
            ) : null}
            {profile.badges.includes('union') ? (
              <Pill label={unionLabel(profile.unionStatus)} tone="outline" size="sm" />
            ) : null}
          </Row>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: 'rgba(28, 12, 36, 0.78)',
              paddingHorizontal: 9,
              paddingVertical: 4,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: 'rgba(244, 114, 182, 0.22)',
            }}
          >
            <Icon name="pin" size={11} color={color.accent} />
            <Text variant="micro" style={{ color: color.text, fontWeight: '600' }}>
              {profile.location.label} · {distanceLabel(card.distanceMiles)}
            </Text>
          </View>
        </Row>
      </View>

        {/* Identity + Stats block */}
        <Stack gap={space.sm} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, zIndex: 15 }}>
          {/* Name, Age, Verified badge, Rating */}
          <Row justify="space-between" align="center">
            <Row gap={space.xs} align="center" style={{ flex: 1 }}>
              <Text variant="display" numberOfLines={1} style={{ fontSize: 24, fontWeight: '700' }} upper>
                {profile.displayName}
                {profile.age ? `, ${profile.age}` : ''}
              </Text>
              {profile.badges.includes('identity') ? (
                <View
                  style={{
                    backgroundColor: color.brand,
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="check" size={10} color="#FFF" strokeWidth={3} />
                </View>
              ) : null}
            </Row>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor: 'rgba(242, 179, 61, 0.18)',
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: 'rgba(242, 179, 61, 0.35)',
              }}
            >
              <Icon name="star" size={11} color={color.warning} />
              <Text variant="micro" style={{ color: color.warning, fontWeight: '700' }}>
                {profile.rating.toFixed(1)}
              </Text>
            </View>
          </Row>

          {/* Role + Rate Row */}
          <Row justify="space-between" align="center">
            <Text variant="caption" tone="accent" style={{ fontWeight: '600' }}>
              {profile.primaryRole}
            </Text>
            <View
              style={{
                backgroundColor: 'rgba(53, 199, 126, 0.15)',
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: 'rgba(53, 199, 126, 0.3)',
              }}
            >
              <Text variant="caption" tone="success" style={{ fontWeight: '700' }}>
                {profile.dayRateCents ? rateLabel(profile.dayRateCents, 'day') : profile.dayRateBand}
              </Text>
            </View>
          </Row>

          {/* Headline / Vibe prompt box (Hinge style) */}
          <View
            style={{
              backgroundColor: 'rgba(28, 12, 36, 0.72)',
              borderRadius: 12,
              borderWidth: 1,
              borderColor: 'rgba(244, 114, 182, 0.22)',
              paddingHorizontal: 10,
              paddingVertical: 6,
              gap: 2,
            }}
          >
            <Text variant="micro" tone="accent" style={{ fontWeight: '700', fontSize: 10, letterSpacing: 0.5 }} upper>
              About Me
            </Text>
            <Text variant="caption" style={{ color: '#F1F5F9', lineHeight: 17, fontSize: 12 }} numberOfLines={2}>
              "{profile.headline}"
            </Text>
          </View>

          {/* Specialty tag pills (Hinge style tags) */}
          {profile.specialties && profile.specialties.length > 0 ? (
            <Row gap={space.xs} wrap>
              {profile.specialties.slice(0, 3).map((spec) => (
                <View
                  key={spec}
                  style={{
                    backgroundColor: 'rgba(244, 63, 94, 0.12)',
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: 'rgba(244, 114, 182, 0.25)',
                  }}
                >
                  <Text variant="micro" style={{ color: '#FCE7F3', fontSize: 11, fontWeight: '500' }}>
                    {spec}
                  </Text>
                </View>
              ))}
            </Row>
          ) : null}

          {/* Social follower info */}
          {social ? (
            <Row justify="space-between" align="center" style={{ marginTop: 2 }}>
              <Row gap={space.xs}>
                <Icon name="trending" size={13} color={color.brand} />
                <Text variant="label" style={{ fontSize: 13 }}>{formatCount(social.followers)}</Text>
                <Text variant="micro" tone="faint">
                  followers · {social.engagementRate.toFixed(1)}% active
                </Text>
              </Row>
              <Sparkline
                values={[12, 18, 16, 26, 24, 34, 31, 42, 46, 52]}
                stroke={social.fraudScore > 0.35 ? color.danger : color.success}
                width={56}
                height={18}
              />
            </Row>
          ) : null}

          {/* Match attribution glass box */}
          <View
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              borderRadius: radius.sm,
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.08)',
              paddingHorizontal: space.sm,
              paddingVertical: 6,
              gap: 3,
              marginTop: 2,
            }}
          >
            {card.reasons.slice(0, 2).map((reason) => (
              <Row key={reason} gap={space.xs} align="center">
                <Icon name="check" size={11} color={color.success} strokeWidth={2.8} />
                <Text variant="micro" tone="muted" numberOfLines={1} style={{ flex: 1, fontSize: 11.5 }}>
                  {reason}
                </Text>
              </Row>
            ))}
          </View>
        </Stack>
      </Photo>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Opportunity card (talent swipes gigs)                               */
/* ------------------------------------------------------------------ */

export function OpportunityDeckCard({ card }: { card: DeckCard<Opportunity> }) {
  const opportunity = card.subject;

  return (
    <Card
      padding={0}
      level={2}
      style={{
        overflow: 'hidden',
        height: CARD_HEIGHT,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(244, 114, 182, 0.22)',
        backgroundColor: color.surface,
      }}
    >
      <Photo
        uri={opportunity.project.coverUrl}
        seed={opportunity.id}
        height={CARD_HEIGHT * 0.45}
        rounded={0}
      >
        <LinearGradient
          colors={['rgba(14, 6, 18, 0.15)', 'rgba(18, 7, 24, 0.75)', 'rgba(14, 6, 18, 0.95)']}
          locations={[0, 0.6, 1]}
          style={{ position: 'absolute', inset: 0 as never }}
        />
        <Row justify="space-between" style={{ position: 'absolute', top: space.md, left: space.md, right: space.md }}>
          <Row gap={space.xs}>
            {opportunity.sponsored ? (
              <LinearGradient
                colors={['#F43F5E', '#BE185D']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 8,
                  paddingVertical: 3.5,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.4)',
                }}
              >
                <Icon name="sparkle" size={10} color="#FFF" />
                <Text variant="micro" style={{ color: '#FFF', fontWeight: '700', fontSize: 10.5 }}>
                  Featured Role
                </Text>
              </LinearGradient>
            ) : null}
            {opportunity.sideScriptId ? (
              <Pill label="Script Attached" tone="brand" size="sm" icon={<Icon name="file" size={10} color={color.brand} />} />
            ) : null}
          </Row>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: 'rgba(28, 12, 36, 0.78)',
              paddingHorizontal: 9,
              paddingVertical: 4,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: 'rgba(244, 114, 182, 0.22)',
            }}
          >
            <Icon name="pin" size={11} color={color.accent} />
            <Text variant="micro" style={{ color: color.text, fontWeight: '600' }}>
              {distanceLabel(card.distanceMiles)}
            </Text>
          </View>
        </Row>
        <Stack gap={2} style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: space.md }}>
          <Text variant="micro" style={{ color: 'rgba(255,255,255,0.75)', fontWeight: '600' }} upper>
            {opportunity.project.productionCompany}
          </Text>
          <Text variant="title" numberOfLines={1} style={{ fontSize: 22, fontWeight: '700' }}>
            {opportunity.project.title}
          </Text>
        </Stack>
      </Photo>

      <Stack gap={space.md} style={{ padding: space.lg, flex: 1, justifyContent: 'space-between' }}>
        <View style={{ gap: 4 }}>
          <Text variant="heading" tone="accent" upper style={{ fontSize: 18, fontWeight: '700' }}>
            {opportunity.role}
          </Text>
          <Text variant="body" tone="muted" numberOfLines={3} style={{ lineHeight: 20 }}>
            {opportunity.roleDescription}
          </Text>
        </View>

        {/* Highlights Row */}
        <Row justify="space-between" align="center" style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', padding: space.md, borderRadius: radius.md }}>
          <Metric label="Pay Rate" value={rateLabel(opportunity.rateCents, opportunity.rateUnit)} tone="success" />
          <Metric label="Union" value={unionLabel(opportunity.project.unionStatus)} />
          <Metric
            label="Openings"
            value={`${opportunity.slots - opportunity.slotsFilled} left`}
          />
        </Row>

        <Row gap={space.sm} align="center">
          <Icon name="calendar" size={14} color={color.textFaint} />
          <Text variant="caption" tone="faint">
            {opportunity.shootDates} · {opportunity.project.location.label}
          </Text>
        </Row>

        {/* Why it matches */}
        <View
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.06)',
            borderRadius: radius.sm,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.08)',
            paddingHorizontal: space.sm,
            paddingVertical: 6,
            gap: 3,
          }}
        >
          {card.reasons.slice(0, 2).map((reason) => (
            <Row key={reason} gap={space.xs} align="center">
              <Icon name="check" size={11} color={color.success} strokeWidth={2.8} />
              <Text variant="micro" tone="muted" numberOfLines={1} style={{ flex: 1, fontSize: 11.5 }}>
                {reason}
              </Text>
            </Row>
          ))}
        </View>
      </Stack>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success';
}) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="micro" tone="faint" upper>
        {label}
      </Text>
      <Text variant="subheading" tone={tone} style={{ fontWeight: '700' }}>
        {value}
      </Text>
    </View>
  );
}

/** Compact roster row used by matches, board, marketplace and roster lists. */
export function TalentRow({
  profile,
  right,
  sub,
}: {
  profile: TalentProfile;
  right?: React.ReactNode;
  sub?: string;
}) {
  return (
    <Row gap={space.md}>
      <Photo uri={profile.avatarUrl} seed={profile.id} width={46} height={46} rounded={radius.sm} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="subheading" numberOfLines={1}>
          {profile.displayName}
        </Text>
        <Text variant="micro" tone="faint" numberOfLines={1} upper>
          {sub ?? `${profile.primaryRole}${profile.age ? ` · ${profile.age}` : ''} · ${titleCase(profile.unionStatus)}`}
        </Text>
      </View>
      {right}
    </Row>
  );
}
