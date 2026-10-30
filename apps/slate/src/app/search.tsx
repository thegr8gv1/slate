import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { SECTORS, SECTOR_CATALOG, type MarketplaceResponse, type TalentProfile } from '../contracts';
import { Icon } from '../design/Icon';
import { ChipGroup } from '../design/Segmented';
import { Text } from '../design/Text';
import {
  Avatar,
  Card,
  Divider,
  EmptyState,
  ErrorNote,
  Loading,
  Pill,
  Row,
  SectionTitle,
  Stack,
} from '../design/primitives';
import { color, radius, space } from '../design/tokens';
import { Screen } from '../features/shell/Shell';
import { NAV } from '../lib/nav';
import { api } from '../lib/api';
import { rateLabel, titleCase, unionLabel } from '../lib/format';
import { useQuery } from '../lib/query';
import { useSession } from '../lib/session';

/**
 * Search.
 *
 * Fetches the sector roster once and filters locally. At marketplace scale this
 * becomes a server-side query against the same vector index the deck uses, but
 * the client contract does not change — which is why the filtering lives behind
 * one `matches` function rather than being spread through the render.
 */
export default function Search() {
  const router = useRouter();
  const { workspace } = useSession();
  const [term, setTerm] = useState('');
  const [sectors, setSectors] = useState(SECTORS.slice(0, 8));

  const market = useQuery<MarketplaceResponse>(
    (signal) => api.get<MarketplaceResponse>('/marketplace', { sectors }, signal),
    [sectors.join(',')],
  );

  const query = term.trim().toLowerCase();

  const people = useMemo(() => {
    const all = market.data?.crew ?? [];
    if (!query) return all.slice(0, 12);
    return all.filter((profile) => matches(profile, query)).slice(0, 30);
  }, [market.data, query]);

  const gear = useMemo(() => {
    const all = market.data?.gear ?? [];
    if (!query) return [];
    return all.filter((listing) => listing.name.toLowerCase().includes(query)).slice(0, 8);
  }, [market.data, query]);

  const destinations = useMemo(() => {
    if (!query) return [];
    return NAV[workspace].filter(
      (item) =>
        item.label.toLowerCase().includes(query) ||
        (item.description ?? '').toLowerCase().includes(query),
    );
  }, [workspace, query]);

  return (
    <Screen title="Search" accent="Everything">
      <Stack gap={space.xl}>
        <Row
          gap={space.sm}
          style={{
            backgroundColor: color.surfaceAlt,
            borderWidth: 1,
            borderColor: color.border,
            borderRadius: radius.md,
            paddingHorizontal: space.md,
          }}
        >
          <Icon name="search" size={17} color={color.textFaint} />
          <TextInput
            value={term}
            onChangeText={setTerm}
            autoFocus
            placeholder="Search people, roles, equipment, or pages…"
            placeholderTextColor={color.textFaint}
            style={{ flex: 1, paddingVertical: 12, color: color.text, fontSize: 15 }}
          />
          {term ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear" onPress={() => setTerm('')}>
              <Icon name="close" size={16} color={color.textFaint} />
            </Pressable>
          ) : null}
        </Row>

        <ChipGroup
          options={SECTORS.map((s) => ({ value: s, label: SECTOR_CATALOG[s].shortLabel }))}
          selected={sectors}
          onToggle={(value) =>
            setSectors((current) =>
              current.includes(value) ? current.filter((s) => s !== value) : [...current, value],
            )
          }
        />

        {destinations.length > 0 ? (
          <Stack gap={space.md}>
            <SectionTitle title="Go to" accent={String(destinations.length)} />
            {destinations.map((item) => (
              <Pressable
                key={item.href}
                accessibilityRole="link"
                onPress={() => router.push(item.href as never)}
              >
                <Card variant="alt" padding={space.md}>
                  <Row gap={space.md}>
                    <Icon name={item.icon} size={17} color={color.accent} />
                    <View style={{ flex: 1 }}>
                      <Text variant="subheading">{item.label}</Text>
                      {item.description ? (
                        <Text variant="micro" tone="faint">
                          {item.description}
                        </Text>
                      ) : null}
                    </View>
                    <Icon name="chevronRight" size={15} color={color.textFaint} />
                  </Row>
                </Card>
              </Pressable>
            ))}
          </Stack>
        ) : null}

        {market.loading && !market.data ? (
          <Loading label="Searching..." />
        ) : market.error ? (
          <ErrorNote message={market.error.message} onRetry={market.refetch} />
        ) : (
          <>
            <Stack gap={space.md}>
              <SectionTitle title={query ? 'People' : 'Top talent'} accent={String(people.length)} />
              {people.length === 0 ? (
                <EmptyState title="No people match" body="Try a different name, role, or sector." />
              ) : (
                people.map((profile) => (
                  <Card key={profile.id} variant="alt" padding={space.md}>
                    <Row gap={space.md}>
                      <Avatar name={profile.displayName} uri={profile.avatarUrl} size={42} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="subheading" numberOfLines={1}>
                          {profile.displayName}
                        </Text>
                        <Text variant="micro" tone="faint" upper numberOfLines={1}>
                          {profile.primaryRole} · {profile.location.label}
                        </Text>
                        <Row gap={space.xs} style={{ marginTop: 2 }}>
                          <Pill label={unionLabel(profile.unionStatus)} tone="outline" size="sm" />
                          <Pill label={`★ ${profile.rating.toFixed(1)}`} tone="neutral" size="sm" />
                        </Row>
                      </View>
                      <Text variant="caption" tone="success">
                        {rateLabel(profile.dayRateCents ?? 0, 'day')}
                      </Text>
                    </Row>
                  </Card>
                ))
              )}
            </Stack>

            {gear.length > 0 ? (
              <Stack gap={space.md}>
                <SectionTitle title="Gear" accent={String(gear.length)} />
                {gear.map((listing) => (
                  <Card key={listing.id} variant="alt" padding={space.md}>
                    <Row justify="space-between">
                      <View style={{ flex: 1 }}>
                        <Text variant="subheading" numberOfLines={1}>
                          {listing.name}
                        </Text>
                        <Text variant="micro" tone="faint" upper>
                          {titleCase(listing.category)} · {listing.location.label}
                        </Text>
                      </View>
                      <Text variant="caption" tone="success">
                        {rateLabel(listing.dayRateCents, 'day')}
                      </Text>
                    </Row>
                  </Card>
                ))}
              </Stack>
            ) : null}
          </>
        )}
      </Stack>
    </Screen>
  );
}

function matches(profile: TalentProfile, query: string): boolean {
  return (
    profile.displayName.toLowerCase().includes(query) ||
    profile.primaryRole.toLowerCase().includes(query) ||
    profile.headline.toLowerCase().includes(query) ||
    profile.location.label.toLowerCase().includes(query) ||
    profile.specialties.some((s) => s.toLowerCase().includes(query))
  );
}
