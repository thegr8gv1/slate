import { useEffect, useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import type { Campaign, CampaignEstimateResponse } from '../../contracts';
import { Icon } from '../../design/Icon';
import { ChipGroup } from '../../design/Segmented';
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
import { ActionBar, Screen } from '../../features/shell/Shell';
import { useResponsive } from '../../features/shell/useResponsive';
import { api } from '../../lib/api';
import { formatCount, formatMoney, titleCase } from '../../lib/format';
import { useMutation, useQuery } from '../../lib/query';

type Step = 1 | 2 | 3 | 4;

const STEPS: { step: Step; label: string }[] = [
  { step: 1, label: 'Goals' },
  { step: 2, label: 'Audience' },
  { step: 3, label: 'Budget' },
  { step: 4, label: 'Talents' },
];

const OBJECTIVES: { value: Campaign['objective']; label: string; blurb: string }[] = [
  { value: 'awareness', label: 'Brand Awareness', blurb: 'Reach the most real people for your budget' },
  { value: 'conversion', label: 'Direct Sales', blurb: 'Get clicks, web visits, and purchases' },
  { value: 'launch', label: 'Product Launch', blurb: 'Create maximum buzz during your launch week' },
  { value: 'ugc_library', label: 'Creator Videos', blurb: 'Get authentic video content to use in your ads' },
];

const GEOS = ['US', 'UK', 'CA', 'AU', 'DE', 'FR', 'JP', 'BR'];
const AGE_BANDS = ['18-24', '25-34', '35-44', '45+'];
const INTERESTS = ['Beauty', 'Fitness', 'Travel', 'Gaming', 'Food', 'Fashion', 'Tech', 'Wellness'];
/** Budget ladder chosen so the resulting CPM lands in the $10–60 band. */
const BUDGETS = [15_000_00, 30_000_00, 45_000_00, 90_000_00, 180_000_00];

export default function CampaignBuilder() {
  const { compact, columns, contentWidth } = useResponsive();
  const [step, setStep] = useState<Step>(1);
  const [campaignId, setCampaignId] = useState<string | null>(null);

  const list = useQuery<{ campaigns: Campaign[] }>(
    (signal) => api.get<{ campaigns: Campaign[] }>('/campaigns', undefined, signal),
    [],
  );
  const activeId = campaignId ?? list.data?.campaigns[0]?.id ?? null;

  const detail = useQuery<CampaignEstimateResponse>(
    (signal) => api.get<CampaignEstimateResponse>(`/campaigns/${activeId}`, undefined, signal),
    [activeId],
    { enabled: Boolean(activeId) },
  );

  const patch = useMutation(async (payload: Record<string, unknown>) =>
    api.patch<CampaignEstimateResponse>(`/campaigns/${activeId}`, payload),
  );
  const launch = useMutation(async () =>
    api.post<CampaignEstimateResponse>(`/campaigns/${activeId}/launch`),
  );

  useEffect(() => {
    if (detail.data?.campaign.step) setStep(detail.data.campaign.step);
  }, [detail.data?.campaign.id]);

  const campaign = detail.data?.campaign;
  const breakdown = detail.data?.breakdown ?? [];

  const apply = async (payload: Record<string, unknown>) => {
    const result = await patch.mutate(payload);
    if (result) detail.setData(result);
  };

  if (list.loading && !list.data) {
    return (
      <Screen title="Ads" accent="Campaigns">
        <Loading label="Loading campaigns" />
      </Screen>
    );
  }

  if (!campaign) {
    return (
      <Screen title="Ads" accent="Campaigns">
        <EmptyState
          title="No campaigns yet"
          body="A campaign bundles an objective, an audience, a budget and a vetted creator roster into one escrow-backed buy."
        />
      </Screen>
    );
  }

  const blocked = breakdown.filter((b) => !b.included);

  return (
    <Screen
      title="Ads"
      accent="Campaigns"
      onRefresh={detail.refetch}
      refreshing={detail.refreshing}
      footer={
        <ActionBar>
          <Row justify="space-between" align="center">
            <Row gap={space.xl}>
              <Stat label="Selected talents" value={String(campaign.selectedProfileIds.length)} />
              <Stat
                label="Estimated reach"
                value={formatCount(detail.data?.estimatedReach ?? 0)}
                align="center"
                tone="success"
              />
              {!compact ? (
                <Stat
                  label="CPM"
                  value={formatMoney(detail.data?.cpmCents ?? 0, { cents: true })}
                  align="center"
                />
              ) : null}
            </Row>
            {step < 4 ? (
              <Button
                label="Next"
                trailing={<Icon name="arrowRight" size={16} color="#FFF" />}
                onPress={() => {
                  const next = Math.min(4, step + 1) as Step;
                  setStep(next);
                  void apply({ step: next });
                }}
              />
            ) : (
              <Button
                label={campaign.state === 'live' ? 'Campaign live' : 'Launch campaign'}
                disabled={campaign.state === 'live' || campaign.selectedProfileIds.length === 0}
                loading={launch.pending}
                onPress={async () => {
                  const result = await launch.mutate();
                  if (result) detail.setData(result);
                }}
              />
            )}
          </Row>
        </ActionBar>
      }
    >
      <Stack gap={space.xl}>
        {/* ---------- Stepper ---------- */}
        <Row justify="space-between" align="flex-start">
          {STEPS.map((entry, index) => {
            const done = step > entry.step;
            const active = step === entry.step;
            return (
              <Pressable
                key={entry.step}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setStep(entry.step);
                  void apply({ step: entry.step });
                }}
                style={{ flex: 1, alignItems: 'center', gap: 6 }}
              >
                <Row align="center" style={{ width: '100%' }}>
                  <View
                    style={{
                      flex: 1,
                      height: 2,
                      backgroundColor: index === 0 ? 'transparent' : done || active ? color.accent : color.border,
                    }}
                  />
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: active ? color.accent : done ? color.accentSoft : color.surfaceAlt,
                      borderWidth: 1,
                      borderColor: active || done ? color.accentBorder : color.border,
                    }}
                  >
                    {done ? (
                      <Icon name="check" size={13} color={color.accent} strokeWidth={3} />
                    ) : (
                      <Text variant="caption" style={{ color: active ? '#FFF' : color.textFaint }}>
                        {entry.step}
                      </Text>
                    )}
                  </View>
                  <View
                    style={{
                      flex: 1,
                      height: 2,
                      backgroundColor:
                        index === STEPS.length - 1 ? 'transparent' : done ? color.accent : color.border,
                    }}
                  />
                </Row>
                <Text variant="micro" tone={active ? 'accent' : 'faint'} numberOfLines={1}>
                  {entry.step}. {entry.label}
                </Text>
              </Pressable>
            );
          })}
        </Row>

        {patch.error ? <ErrorNote message={patch.error.message} /> : null}
        {launch.error ? <ErrorNote message={launch.error.message} /> : null}

        {/* ---------- Step 1: Goals ---------- */}
        {step === 1 ? (
          <Stack gap={space.lg}>
            <Card style={{ gap: space.md }}>
              <SectionTitle title="Campaign name" />
              <TextInput
                value={campaign.name}
                onChangeText={(value) => detail.setData((c) => (c ? { ...c, campaign: { ...c.campaign, name: value } } : c))}
                onBlur={() => void apply({ name: campaign.name })}
                placeholder="Luminous Spring — Creator Wave 1"
                placeholderTextColor={color.textFaint}
                style={inputStyle}
              />
            </Card>

            <Card style={{ gap: space.md }}>
              <SectionTitle title="Objective" />
              {OBJECTIVES.map((objective) => {
                const active = campaign.objective === objective.value;
                return (
                  <Pressable
                    key={objective.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    onPress={() => void apply({ objective: objective.value })}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.md,
                      padding: space.md,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      borderColor: active ? color.accentBorder : color.border,
                      backgroundColor: active ? color.accentSoft : color.surfaceAlt,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text variant="subheading" tone={active ? 'accent' : 'default'}>
                        {objective.label}
                      </Text>
                      <Text variant="micro" tone="faint">
                        {objective.blurb}
                      </Text>
                    </View>
                    {active ? <Icon name="checkCircle" size={18} color={color.accent} /> : null}
                  </Pressable>
                );
              })}
            </Card>
          </Stack>
        ) : null}

        {/* ---------- Step 2: Audience ---------- */}
        {step === 2 ? (
          <Stack gap={space.lg}>
            <Card style={{ gap: space.md }}>
              <SectionTitle title="Markets" accent={String(campaign.audience.geos.length)} />
              <ChipGroup
                options={GEOS.map((g) => ({ value: g, label: g }))}
                selected={campaign.audience.geos}
                onToggle={(value) =>
                  void apply({
                    audience: {
                      ...campaign.audience,
                      geos: campaign.audience.geos.includes(value)
                        ? campaign.audience.geos.filter((g) => g !== value)
                        : [...campaign.audience.geos, value],
                    },
                  })
                }
              />
            </Card>

            <Card style={{ gap: space.md }}>
              <SectionTitle title="Age bands" />
              <ChipGroup
                options={AGE_BANDS.map((b) => ({ value: b, label: b }))}
                selected={campaign.audience.ageBands}
                onToggle={(value) =>
                  void apply({
                    audience: {
                      ...campaign.audience,
                      ageBands: campaign.audience.ageBands.includes(value)
                        ? campaign.audience.ageBands.filter((b) => b !== value)
                        : [...campaign.audience.ageBands, value],
                    },
                  })
                }
              />
            </Card>

            <Card style={{ gap: space.md }}>
              <SectionTitle title="Interests" />
              <ChipGroup
                options={INTERESTS.map((i) => ({ value: i, label: i }))}
                selected={campaign.audience.interests}
                onToggle={(value) =>
                  void apply({
                    audience: {
                      ...campaign.audience,
                      interests: campaign.audience.interests.includes(value)
                        ? campaign.audience.interests.filter((i) => i !== value)
                        : [...campaign.audience.interests, value],
                    },
                  })
                }
              />
            </Card>
          </Stack>
        ) : null}

        {/* ---------- Step 3: Budget ---------- */}
        {step === 3 ? (
          <Stack gap={space.lg}>
            <Card style={{ gap: space.lg }}>
              <SectionTitle title="Total budget" accent={formatMoney(campaign.budgetCents, { compact: true })} />
              <ChipGroup
                single
                options={BUDGETS.map((cents) => ({
                  value: String(cents),
                  label: formatMoney(cents, { compact: true }),
                }))}
                selected={[String(campaign.budgetCents)]}
                onToggle={(value) => void apply({ budgetCents: Number(value) })}
              />
              <Divider />
              <Row justify="space-between">
                <Stat label="Budget" value={formatMoney(campaign.budgetCents)} />
                <Stat
                  label="Est. reach"
                  value={formatCount(detail.data?.estimatedReach ?? 0)}
                  align="center"
                  tone="success"
                />
                <Stat
                  label="Effective CPM"
                  value={formatMoney(detail.data?.cpmCents ?? 0, { cents: true })}
                  align="flex-end"
                />
              </Row>
            </Card>

            <Card style={{ gap: space.md }}>
              <SectionTitle title="Projected return" />
              <Row justify="space-between" align="center">
                <Stack gap={2}>
                  <Text variant="display" tone={(detail.data?.predictedRoi ?? 0) >= 100 ? 'success' : 'warning'}>
                    {detail.data?.predictedRoi ?? 0}%
                  </Text>
                  <Text variant="micro" tone="faint" upper>
                    Predicted ROI, net of platform fee
                  </Text>
                </Stack>
                <Icon name="trending" size={30} color={color.success} />
              </Row>
              <Divider />
              <Row justify="space-between">
                <Text variant="caption" tone="muted">
                  Projected earned media value
                </Text>
                <Text variant="caption" tone="success">
                  {formatMoney(detail.data?.earnedValueCents ?? 0)}
                </Text>
              </Row>
              <Text variant="micro" tone="faint">
                Reach counts verified impressions only and is de-duplicated for audience overlap between
                selected creators. Return is earned media value across three deliverables per creator,
                measured against spend including the platform fee.
              </Text>
            </Card>
          </Stack>
        ) : null}

        {/* ---------- Step 4: Talents ---------- */}
        {step === 4 ? (
          <Stack gap={space.lg}>
            {blocked.length > 0 ? (
              <Card style={{ borderColor: color.danger, gap: space.sm }}>
                <Row gap={space.sm}>
                  <Icon name="alert" size={16} color={color.danger} />
                  <Text variant="subheading" tone="danger">
                    {blocked.length} creator{blocked.length > 1 ? 's' : ''} blocked by the audit
                  </Text>
                </Row>
                <Text variant="caption" tone="muted">
                  {blocked.map((b) => b.displayName).join(', ')} exceeded the fraud threshold. Remove them
                  before launch or request a manual review.
                </Text>
              </Card>
            ) : null}

            <Card style={{ gap: space.md }}>
              <Row justify="space-between">
                <SectionTitle title="Filtered roster" accent={String(breakdown.length)} />
                <Text variant="micro" tone="faint" upper>
                  Audited
                </Text>
              </Row>

              {breakdown.length === 0 ? (
                <Text variant="caption" tone="faint">
                  No creators selected yet.
                </Text>
              ) : (
                <Stack gap={space.sm}>
                  {breakdown.map((entry) => (
                    <Row key={entry.profileId} gap={space.md}>
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: true }}
                        onPress={() =>
                          void apply({
                            selectedProfileIds: campaign.selectedProfileIds.filter(
                              (id) => id !== entry.profileId,
                            ),
                          })
                        }
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 5,
                          borderWidth: 1.5,
                          borderColor: color.borderStrong,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: color.surfaceAlt,
                        }}
                      >
                        <Icon name="check" size={12} color={color.accent} strokeWidth={3} />
                      </Pressable>
                      <Avatar name={entry.displayName} uri={entry.avatarUrl} size={36} />
                      <View style={{ flex: 1 }}>
                        <Text variant="caption" numberOfLines={1}>
                          {entry.displayName}
                        </Text>
                        <Text variant="micro" tone="faint" upper numberOfLines={1}>
                          {entry.role} · {formatCount(entry.verifiedReach)} verified
                        </Text>
                      </View>
                      <Stack gap={1} style={{ alignItems: 'flex-end' }}>
                        <Text variant="caption" tone={entry.included ? 'success' : 'danger'}>
                          {entry.projectedRoiPct}%
                        </Text>
                        <Text variant="micro" tone="faint">
                          ROI
                        </Text>
                      </Stack>
                      <View
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: entry.included ? color.accent : color.dangerSoft,
                        }}
                      >
                        <Icon
                          name={entry.included ? 'check' : 'close'}
                          size={11}
                          color={entry.included ? '#FFF' : color.danger}
                          strokeWidth={3}
                        />
                      </View>
                    </Row>
                  ))}
                </Stack>
              )}
            </Card>

            <Card style={{ gap: space.md }}>
              <SectionTitle title="Summary" />
              <Row justify="space-between">
                <Stat label="Selected" value={String(campaign.selectedProfileIds.length)} />
                <Stat
                  label="Est. reach"
                  value={formatCount(detail.data?.estimatedReach ?? 0)}
                  align="center"
                  tone="success"
                />
                <Stat
                  label="Predicted ROI"
                  value={`${detail.data?.predictedRoi ?? 0}%`}
                  align="flex-end"
                />
              </Row>
              <Divider />
              <Row gap={space.xs} wrap>
                <Pill label={titleCase(campaign.objective)} tone="accent" size="sm" />
                <Pill label={campaign.audience.geos.join(', ')} tone="outline" size="sm" />
                <Pill label={formatMoney(campaign.budgetCents, { compact: true })} tone="brand" size="sm" />
                <Pill
                  label={titleCase(campaign.state)}
                  tone={campaign.state === 'live' ? 'success' : 'neutral'}
                  size="sm"
                />
              </Row>
            </Card>
          </Stack>
        ) : null}
      </Stack>
    </Screen>
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
