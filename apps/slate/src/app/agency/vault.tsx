import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import type { Agreement, SignAgreementResponse } from '../../contracts';
import { Icon } from '../../design/Icon';
import { Segmented } from '../../design/Segmented';
import { Sheet } from '../../design/Sheet';
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
  Toggle,
} from '../../design/primitives';
import { color, radius, space } from '../../design/tokens';
import { Screen } from '../../features/shell/Shell';
import { useResponsive } from '../../features/shell/useResponsive';
import { api } from '../../lib/api';
import { relativeTime, shortDate, titleCase } from '../../lib/format';
import { useMutation, useQuery } from '../../lib/query';
import { useSession } from '../../lib/session';

type Tab = 'pending' | 'executed' | 'all';

const KIND_LABEL: Record<Agreement['kind'], string> = {
  nda: 'NDA',
  sag_aftra: 'SAG-AFTRA',
  equity: 'Equity',
  work_for_hire: 'Work-for-hire',
  brand_campaign: 'Brand campaign',
  audition_release: 'Audition release',
};

export default function NdaVault() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { account } = useSession();
  const { compact, contentWidth } = useResponsive();

  const [tab, setTab] = useState<Tab>('pending');
  const [openId, setOpenId] = useState<string | null>(params.id ?? null);
  const [verifiedSignature, setVerifiedSignature] = useState(true);
  const [unlocked, setUnlocked] = useState<string[]>([]);

  const vault = useQuery<{ agreements: Agreement[]; pending: Agreement[]; roster: Agreement[] }>(
    (signal) =>
      api.get<{ agreements: Agreement[]; pending: Agreement[]; roster: Agreement[] }>(
        '/agreements',
        undefined,
        signal,
      ),
    [],
  );

  const detail = useQuery<{ agreement: Agreement; integrity: { valid: boolean; invalidSigners: string[] } }>(
    (signal) =>
      api.get<{ agreement: Agreement; integrity: { valid: boolean; invalidSigners: string[] } }>(
        `/agreements/${openId}`,
        undefined,
        signal,
      ),
    [openId],
    { enabled: Boolean(openId) },
  );

  const sign = useMutation(async (agreementId: string) =>
    api.post<SignAgreementResponse>(`/agreements/${agreementId}/sign`),
  );

  const agreements = vault.data?.agreements ?? [];
  const pending = vault.data?.pending ?? [];
  const rosterIds = new Set((vault.data?.roster ?? []).map((a) => a.id));

  // An agency has no signature of its own to give on a client's engagement, so
  // "pending" for them means anything on the roster still awaiting a party.
  const awaiting = [
    ...pending,
    ...agreements.filter(
      (a) =>
        rosterIds.has(a.id) &&
        !pending.some((p) => p.id === a.id) &&
        (a.state === 'awaiting_signature' || a.state === 'countersigned'),
    ),
  ];

  const visible =
    tab === 'pending'
      ? awaiting
      : tab === 'executed'
        ? agreements.filter((a) => a.state === 'executed')
        : agreements;

  const list = (
    <Stack gap={space.md}>
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'pending', label: 'Pending', badge: awaiting.length },
          { value: 'executed', label: 'Executed', badge: agreements.filter((a) => a.state === 'executed').length },
          { value: 'all', label: 'All', badge: agreements.length },
        ]}
      />

      {vault.loading && !vault.data ? (
        <Loading label="Loading agreements" />
      ) : vault.error ? (
        <ErrorNote message={vault.error.message} onRetry={vault.refetch} />
      ) : visible.length === 0 ? (
        <EmptyState
          title={tab === 'pending' ? 'Nothing awaiting signature' : 'No agreements here'}
          body="Confidentiality agreements (NDAs) and hiring contracts are created when an offer is sent."
        />
      ) : (
        visible.map((agreement) => (
          <Pressable
            key={agreement.id}
            accessibilityRole="button"
            onPress={() => setOpenId(agreement.id)}
          >
            <Card
              style={{
                gap: space.md,
                borderColor: openId === agreement.id ? color.accentBorder : color.border,
              }}
            >
              <Row gap={space.md}>
                <Avatar
                  name={agreement.counterpartyName}
                  uri={agreement.counterpartyAvatarUrl}
                  size={42}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="subheading" numberOfLines={1}>
                    {agreement.counterpartyName}
                  </Text>
                  <Text variant="micro" tone="faint" numberOfLines={1}>
                    {agreement.title}
                  </Text>
                  <Row gap={space.xs} style={{ marginTop: 3 }} wrap>
                    <Pill label={KIND_LABEL[agreement.kind]} tone="brand" size="sm" />
                    {rosterIds.has(agreement.id) &&
                    agreement.counterpartyAccountId !== account?.id &&
                    agreement.issuerAccountId !== account?.id ? (
                      <Pill label="Roster" tone="outline" size="sm" />
                    ) : null}
                    <Pill
                      label={titleCase(agreement.state)}
                      tone={
                        agreement.state === 'executed'
                          ? 'success'
                          : agreement.state === 'void'
                            ? 'danger'
                            : 'warning'
                      }
                      size="sm"
                    />
                  </Row>
                </View>
              </Row>

              <Divider />

              {/* The whole card is the tap target, so this row is presentational —
                  a nested <button> inside a pressable card is invalid on web. */}
              <Row justify="space-between">
                <Row gap={space.xxs}>
                  <Text variant="micro" tone="accent" upper>
                    View document
                  </Text>
                  <Icon name="chevronRight" size={12} color={color.accent} />
                </Row>
                {agreement.counterpartyAccountId !== account?.id &&
                agreement.issuerAccountId !== account?.id ? (
                  <Row gap={space.xs}>
                    <Icon name="eyeOff" size={14} color={color.textFaint} />
                    <Text variant="micro" tone="faint" upper>
                      {agreement.signatures.length}/2 signed · client copy
                    </Text>
                  </Row>
                ) : agreement.signatures.some((s) => s.accountId === account?.id) ? (
                  <Row gap={space.xs}>
                    <Icon name="checkCircle" size={14} color={color.success} />
                    <Text variant="micro" tone="success" upper>
                      Signed {relativeTime(agreement.signatures.find((s) => s.accountId === account?.id)?.signedAt)}
                    </Text>
                  </Row>
                ) : (
                  <Row gap={space.xxs}>
                    <Icon name="edit" size={12} color={color.warning} />
                    <Text variant="micro" tone="warning" upper>
                      Signature required
                    </Text>
                  </Row>
                )}
              </Row>
            </Card>
          </Pressable>
        ))
      )}
    </Stack>
  );

  const loaded = detail.data;
  const document = loaded ? (
    <Card style={{ gap: space.lg }}>
      <Row justify="space-between" align="flex-start">
        <View style={{ flex: 1 }}>
          <Text variant="heading" numberOfLines={2}>
            {loaded.agreement.title}
          </Text>
          <Text variant="micro" tone="faint" upper>
            {KIND_LABEL[loaded.agreement.kind]} · issued {shortDate(loaded.agreement.createdAt)}
          </Text>
        </View>
        <Pill
          label={titleCase(loaded.agreement.state)}
          tone={loaded.agreement.state === 'executed' ? 'success' : 'warning'}
          size="sm"
        />
      </Row>

      <Divider />

      {/* Document body, rendered on a frosted glass surface. */}
      <View
        style={{
          backgroundColor: 'rgba(255, 241, 242, 0.05)',
          borderWidth: 1,
          borderColor: 'rgba(244, 114, 182, 0.22)',
          borderRadius: radius.md,
          padding: space.lg,
          maxHeight: compact ? 320 : 420,
        }}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text
            variant="caption"
            style={{ color: color.text, lineHeight: 22, fontSize: 13 }}
            selectable
          >
            {loaded.agreement.body}
          </Text>
        </ScrollView>
      </View>

      {/* Integrity */}
      <Row
        justify="space-between"
        style={{
          backgroundColor: loaded.integrity.valid ? color.successSoft : color.dangerSoft,
          borderRadius: radius.md,
          padding: space.md,
        }}
      >
        <Row gap={space.sm}>
          <Icon
            name={loaded.integrity.valid ? 'shield' : 'alert'}
            size={15}
            color={loaded.integrity.valid ? color.success : color.danger}
          />
          <Text
            variant="caption"
            tone={loaded.integrity.valid ? 'success' : 'danger'}
          >
            {loaded.integrity.valid
              ? 'Document integrity verified'
              : `Signature mismatch: ${loaded.integrity.invalidSigners.join(', ')}`}
          </Text>
        </Row>
        <Toggle value={verifiedSignature} onChange={setVerifiedSignature} label="Verified digital signature" />
      </Row>

      {/* Signatures */}
      <Stack gap={space.md}>
        <SectionTitle title="Signatures" accent={`${loaded.agreement.signatures.length}/2`} />
        {loaded.agreement.signatures.length === 0 ? (
          <Text variant="caption" tone="faint">
            No signatures recorded yet.
          </Text>
        ) : (
          loaded.agreement.signatures.map((signature) => (
            <Card key={signature.accountId} variant="alt" padding={space.md} style={{ gap: space.sm }}>
              <Row justify="space-between">
                <Text variant="subheading">{signature.displayName}</Text>
                <Text variant="micro" tone="faint">
                  {relativeTime(signature.signedAt)}
                </Text>
              </Row>
              <Row justify="space-between">
                <Text variant="micro" tone="faint" upper>
                  Digest
                </Text>
                <Text variant="micro" tone="muted" mono numberOfLines={1} style={{ flex: 1, textAlign: 'right' }}>
                  {signature.digest}
                </Text>
              </Row>
              <Row justify="space-between">
                <Text variant="micro" tone="faint" upper>
                  Signed from
                </Text>
                <Text variant="micro" tone="muted" mono>
                  {signature.ip}
                </Text>
              </Row>
            </Card>
          ))
        )}
      </Stack>

      {unlocked.length > 0 ? (
        <Card style={{ borderColor: color.brand, gap: space.sm }}>
          <Row gap={space.sm}>
            <Icon name="eyeOff" size={15} color={color.brand} />
            <Text variant="subheading" tone="brand">
              Discreet profile unlocked
            </Text>
          </Row>
          <Text variant="caption" tone="muted">
            This NDA cleared the identity gate on {unlocked.length} Discreet Mode profile
            {unlocked.length > 1 ? 's' : ''}. Their real name, rate and credits now resolve in your deck.
          </Text>
        </Card>
      ) : null}

      {sign.error ? <ErrorNote message={sign.error.message} /> : null}

      {(loaded.agreement.counterpartyAccountId === account?.id ||
        loaded.agreement.issuerAccountId === account?.id) &&
      !loaded.agreement.signatures.some((s) => s.accountId === account?.id) ? (
        <Button
          label="Approve signature"
          full
          size="lg"
          loading={sign.pending}
          onPress={async () => {
            const result = await sign.mutate(loaded.agreement.id);
            if (result) {
              setUnlocked(result.unlockedProfileIds);
              vault.refetch();
              detail.refetch();
            }
          }}
        />
      ) : null}
    </Card>
  ) : openId ? (
    <Loading label="Opening document" />
  ) : (
    <EmptyState
      title="Select an agreement"
      body="Documents open here with their signature chain and an integrity check over the stored body."
    />
  );

  return (
    <Screen title="NDA Vault" accent="Contracts" onRefresh={vault.refetch} refreshing={vault.refreshing}>
      {compact ? (
        <Stack gap={space.xl}>
          {list}
          {openId ? document : null}
        </Stack>
      ) : (
        <Row gap={space.xl} align="flex-start">
          <View style={{ width: Math.min(380, contentWidth * 0.4) }}>{list}</View>
          <View style={{ flex: 1 }}>{document}</View>
        </Row>
      )}
    </Screen>
  );
}
