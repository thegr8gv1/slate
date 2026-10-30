import { useEffect, useState } from 'react';
import { Linking, Pressable, TextInput, View } from 'react-native';

import { DISCREET, type AgencyRouting, type DiscreetSettings, type TalentProfile } from '../../contracts';
import { ChipGroup } from '../../design/Segmented';
import { Icon } from '../../design/Icon';
import { Text } from '../../design/Text';
import {
  Avatar,
  Button,
  Card,
  Divider,
  ErrorNote,
  Loading,
  Pill,
  Row,
  SectionTitle,
  Stack,
  Toggle,
} from '../../design/primitives';
import { color, radius, space } from '../../design/tokens';
import { Screen } from '../../features/shell/Shell';
import { useResponsive } from '../../features/shell/useResponsive';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { useMutation, useQuery } from '../../lib/query';
import { useSession } from '../../lib/session';

const AGENCIES = ['WME', 'CAA', 'UTA', 'Gersh', 'Direct Manager', 'Unrepresented'];

const BOOKING_CATEGORIES: { key: keyof Pick<AgencyRouting, 'commercial' | 'film' | 'musical' | 'theatrical'>; label: string }[] = [
  { key: 'commercial', label: 'Commercials' },
  { key: 'film', label: 'Film' },
  { key: 'theatrical', label: 'Theatrical / TV' },
  { key: 'musical', label: 'Musical' },
];

const BUDGET_FLOORS = [25_000_00, 50_000_00, 150_000_00, 500_000_00];

export default function PrivacyRouting() {
  const { profile: sessionProfile, refreshAccount } = useSession();
  const { columns } = useResponsive();

  const me = useQuery<{ account: unknown; profile: TalentProfile | null }>(
    (signal) => api.get<{ account: unknown; profile: TalentProfile | null }>('/auth/me', undefined, signal),
    [sessionProfile?.id],
  );

  const [discreet, setDiscreet] = useState<DiscreetSettings | null>(null);
  const [routing, setRouting] = useState<AgencyRouting | null>(null);
  const [radius_, setRadius] = useState(25);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const profile = me.data?.profile;
    if (!profile) return;
    setDiscreet(profile.discreet);
    setRouting(profile.routing);
    setRadius(profile.travelRadiusMiles);
    setDirty(false);
  }, [me.data?.profile]);

  const save = useMutation(async (payload: {
    discreet: DiscreetSettings;
    routing: AgencyRouting;
    travelRadiusMiles: number;
  }) => {
    const result = await api.patch<{ profile: TalentProfile }>('/talent/privacy', payload);
    await refreshAccount();
    return result;
  });

  if (me.loading && !me.data) {
    return (
      <Screen title="Profile" accent="Privacy">
        <Loading label="Loading privacy settings" />
      </Screen>
    );
  }

  const profile = me.data?.profile;
  if (!profile || !discreet || !routing) {
    return (
      <Screen title="Profile" accent="Privacy">
        <ErrorNote message="This account does not have a talent profile." />
      </Screen>
    );
  }

  const update = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setDirty(true);
  };

  return (
    <Screen title="Profile" accent="Privacy" onRefresh={me.refetch} refreshing={me.refreshing}>
      <Stack gap={space.xl}>
        {/* ---------- Identity header ---------- */}
        <Row gap={space.lg}>
          <Avatar name={profile.displayName} uri={profile.avatarUrl} size={56} />
          <View style={{ flex: 1 }}>
            <Text variant="title">{profile.displayName}</Text>
            <Text variant="label" tone="muted" upper>
              {discreet.enabled ? 'Higher-profile talent' : profile.primaryRole}
            </Text>
          </View>
        </Row>

        {/* ---------- Discreet Mode ---------- */}
        <Card
          style={{
            gap: space.lg,
            borderColor: discreet.enabled ? color.success : color.border,
            borderWidth: discreet.enabled ? 1.5 : 1,
          }}
        >
          <Row justify="space-between">
            <View style={{ flex: 1 }}>
              <Text variant="heading">Private Mode</Text>
              <Text variant="label" tone={discreet.enabled ? 'success' : 'faint'} upper>
                {discreet.enabled ? 'Active (Identity Protected)' : 'Off (Public Profile)'}
              </Text>
            </View>
            <Toggle
              value={discreet.enabled}
              onChange={update((value: boolean) => setDiscreet({ ...discreet, enabled: value }))}
              label="Private Mode"
            />
          </Row>

          <Stack gap={space.sm}>
            <GateRow
              text="Your real name, photo, rate, and past credits stay hidden from general search."
            />
            <GateRow text="Studios must sign a non-disclosure agreement (NDA) and verify their budget before seeing your identity." />
            <GateRow text="Public discovery only shows an anonymous summary instead of your real profile." />
            <GateRow text="Follower counts are rounded to general ranges so no one can guess who you are." />
          </Stack>

          {discreet.enabled ? (
            <>
              <Divider />
              <Stack gap={space.sm}>
                <Text variant="micro" tone="faint" upper>
                  Anonymous description
                </Text>
                <TextInput
                  value={discreet.publicMask}
                  onChangeText={update((value: string) => setDiscreet({ ...discreet, publicMask: value }))}
                  placeholder="Emmy-Nominated Lead · F · 30-35"
                  placeholderTextColor={color.textFaint}
                  style={inputStyle}
                />
                <Text variant="micro" tone="faint">
                  This is the description casting directors see before unlocking your profile.
                </Text>
              </Stack>

              <Stack gap={space.sm}>
                <Row justify="space-between">
                  <Text variant="micro" tone="faint" upper>
                    Minimum budget required
                  </Text>
                  <Text variant="label" tone="accent">
                    {formatMoney(discreet.budgetFloorCents, { compact: true })}
                  </Text>
                </Row>
                <ChipGroup
                  single
                  options={BUDGET_FLOORS.map((cents) => ({
                    value: String(cents),
                    label: formatMoney(cents, { compact: true }),
                  }))}
                  selected={[String(discreet.budgetFloorCents)]}
                  onToggle={update((value: string) =>
                    setDiscreet({ ...discreet, budgetFloorCents: Number(value) }),
                  )}
                />
                <Text variant="micro" tone="faint">
                  A production must set aside at least this much budget before your real identity unlocks.
                </Text>
              </Stack>

              <Row justify="space-between">
                <View style={{ flex: 1 }}>
                  <Text variant="subheading">Major studios only</Text>
                  <Text variant="micro" tone="faint">
                    Only verified major studios can request to unlock your identity
                  </Text>
                </View>
                <Toggle
                  value={discreet.requireTier1Studio}
                  onChange={update((value: boolean) =>
                    setDiscreet({ ...discreet, requireTier1Studio: value }),
                  )}
                  label="Major studios only"
                />
              </Row>
            </>
          ) : null}
        </Card>

        {/* ---------- Agency routing ---------- */}
        <Card style={{ gap: space.lg }}>
          <Stack gap={space.xs}>
            <Text variant="heading">Agency Routing</Text>
            <Text variant="caption" tone="muted">
              Choose which agency or manager handles each type of job. New offers will go directly to
              them so they can negotiate on your behalf.
            </Text>
          </Stack>

          {BOOKING_CATEGORIES.map((category) => (
            <Stack key={category.key} gap={space.sm}>
              <Text variant="micro" tone="faint" upper>
                {category.label}
              </Text>
              <ChipGroup
                single
                options={AGENCIES.map((agency) => ({ value: agency, label: agency }))}
                selected={[routing[category.key] ?? 'Unrepresented']}
                onToggle={update((value: string) =>
                  setRouting({
                    ...routing,
                    [category.key]: value === 'Unrepresented' ? null : value,
                  }),
                )}
              />
            </Stack>
          ))}

          <Divider />

          <Row justify="space-between">
            <View style={{ flex: 1, paddingRight: space.md }}>
              <Text variant="subheading">Require an NDA before contact</Text>
              <Text variant="micro" tone="faint">
                Inbound pitches are held until the counterparty signs
              </Text>
            </View>
            <Toggle
              value={routing.requireNdaBeforeContact}
              onChange={update((value: boolean) =>
                setRouting({ ...routing, requireNdaBeforeContact: value }),
              )}
              label="Require NDA before contact"
            />
          </Row>

          <Row justify="space-between">
            <View style={{ flex: 1, paddingRight: space.md }}>
              <Text variant="subheading">Redact metrics until NDA</Text>
              <Text variant="micro" tone="faint">
                Hides audience and engagement data from unsigned parties
              </Text>
            </View>
            <Toggle
              value={routing.redactMetricsUntilNda}
              onChange={update((value: boolean) =>
                setRouting({ ...routing, redactMetricsUntilNda: value }),
              )}
              label="Redact metrics until NDA"
            />
          </Row>
        </Card>

        {/* ---------- Discovery reach ---------- */}
        <Card style={{ gap: space.md }}>
          <SectionTitle title="Discovery reach" accent={`${radius_} mi`} />
          <ChipGroup
            single
            options={[10, 25, 40, 60, 100].map((r) => ({ value: String(r), label: `${r} mi` }))}
            selected={[String(radius_)]}
            onToggle={update((value: string) => setRadius(Number(value)))}
          />
          <Text variant="micro" tone="faint">
            Sets how far a production or Set-Beacon can be and still reach you. Wider radius means more
            same-day emergency calls.
          </Text>
        </Card>

        {/* ---------- Live preview ---------- */}
        <Stack gap={space.md}>
          <SectionTitle title="How your card looks" accent={discreet.enabled ? 'Unverified viewer' : 'Everyone'} />
          <Card variant="alt" style={{ gap: space.md }}>
            <Row gap={space.md}>
              <Avatar
                name={discreet.enabled ? 'Discreet Talent' : profile.displayName}
                uri={profile.avatarUrl}
                size={46}
              />
              <View style={{ flex: 1 }}>
                <Text variant="subheading" numberOfLines={1}>
                  {discreet.enabled ? discreet.publicMask || 'Verified A-List Talent' : profile.displayName}
                </Text>
                <Text variant="micro" tone="faint" upper>
                  {discreet.enabled
                    ? `${profile.location.region} · rate band only`
                    : `${profile.primaryRole} · ${profile.location.label}`}
                </Text>
              </View>
              {discreet.enabled ? (
                <Pill label="Discreet" tone="brand" size="sm" icon={<Icon name="eyeOff" size={10} color={color.brand} />} />
              ) : null}
            </Row>
            <Row gap={space.xs} wrap>
              <Pill
                label={
                  discreet.enabled
                    ? profile.dayRateBand || 'Undisclosed'
                    : formatMoney(profile.dayRateCents ?? 0) + '/day'
                }
                tone="outline"
                size="sm"
              />
              <Pill
                label={discreet.enabled ? 'Credits withheld' : `${profile.credits.length} credits`}
                tone="outline"
                size="sm"
              />
              <Pill
                label={discreet.enabled ? 'Reel locked' : 'Reel available'}
                tone="outline"
                size="sm"
              />
            </Row>
          </Card>
        </Stack>

        <Card level={2} style={{ gap: space.sm }}>
          <SectionTitle title="Legal & Transparency" />
          <Text variant="caption" tone="muted">
            Slate is committed to safeguarding your personal data, location data, and self-tape recordings.
          </Text>
          <Row justify="space-between" align="center" style={{ paddingTop: space.xs }}>
            <Button
              label="Read Privacy Policy"
              variant="secondary"
              size="sm"
              onPress={() => void Linking.openURL('https://slate.dev/privacy')}
            />
            <Text variant="micro" tone="faint">
              Package: com.slate.myapp
            </Text>
          </Row>
        </Card>

        {save.error ? <ErrorNote message={save.error.message} /> : null}

        <Row gap={space.md}>
          <Button
            label="Discard"
            variant="ghost"
            disabled={!dirty}
            onPress={() => {
              setDiscreet(profile.discreet);
              setRouting(profile.routing);
              setRadius(profile.travelRadiusMiles);
              setDirty(false);
            }}
          />
          <View style={{ flex: 1 }} />
          <Button
            label={dirty ? 'Save changes' : 'Saved'}
            disabled={!dirty}
            loading={save.pending}
            onPress={async () => {
              const result = await save.mutate({
                discreet,
                routing,
                travelRadiusMiles: radius_,
              });
              if (result) {
                setDirty(false);
                me.refetch();
              }
            }}
          />
        </Row>
      </Stack>
    </Screen>
  );
}

function GateRow({ text }: { text: string }) {
  return (
    <Row gap={space.sm} align="flex-start">
      <View style={{ paddingTop: 4 }}>
        <Icon name="shield" size={13} color={color.success} />
      </View>
      <Text variant="caption" tone="muted" style={{ flex: 1 }}>
        {text}
      </Text>
    </Row>
  );
}

const inputStyle = {
  backgroundColor: color.surfaceAlt,
  borderWidth: 1,
  borderColor: color.border,
  borderRadius: radius.md,
  paddingHorizontal: space.md,
  paddingVertical: 11,
  color: color.text,
  fontSize: 14.5,
} as const;
