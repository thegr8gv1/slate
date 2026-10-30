import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StatusBar, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { Icon, SlateMark } from '../design/Icon';
import { Text } from '../design/Text';
import { Button, Card, Divider, ErrorNote, Pill, Row, Stack } from '../design/primitives';
import { color, radius, space } from '../design/tokens';
import { api, API_BASE } from '../lib/api';
import { useMutation, useQuery } from '../lib/query';
import { homeRouteFor, useSession } from '../lib/session';
import { useResponsive } from '../features/shell/useResponsive';

interface DemoAccounts {
  production?: string;
  talent?: string;
  brand?: string;
  agency?: string;
  crew?: string;
  password?: string;
}

const ROLE_COPY: { key: keyof DemoAccounts; label: string; blurb: string; icon: 'film' | 'user' | 'sparkle' | 'briefcase' | 'camera' }[] = [
  { key: 'production', label: 'Local Artist & Beginner', blurb: 'Explore movie sets, acoustic jams, and backyard theater', icon: 'user' },
  { key: 'talent', label: 'Indie Filmmaker', blurb: 'Invite neighbors to shadow cameras, hold boom mics, and act as extras', icon: 'film' },
  { key: 'brand', label: 'Art & Gallery Host', blurb: 'Invite local enthusiasts to mingle, take reels, and pack events', icon: 'sparkle' },
  { key: 'agency', label: 'Community Theater', blurb: 'Cast local plays and organize backstage volunteers', icon: 'briefcase' },
  { key: 'crew', label: 'Music & Jam Circle', blurb: 'Host group jams, beat collaborations, and lyric circles', icon: 'camera' },
];

export default function SignIn() {
  const router = useRouter();
  const { signIn, account, workspace, ready } = useSession();
  const { compact } = useResponsive();

  const [email, setEmail] = useState('vempatigowtham@live.com');
  const [password, setPassword] = useState('slate');

  const demo = useQuery<DemoAccounts>(() => api.get<DemoAccounts>('/auth/demo-accounts'), []);

  const login = useMutation(async (nextEmail: string, nextPassword: string) => {
    await signIn(nextEmail, nextPassword);
    return true;
  });

  useEffect(() => {
    if (ready && account) router.replace(homeRouteFor(workspace) as never);
  }, [ready, account, workspace, router]);

  const submit = () => void login.mutate(email.trim(), password);

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, overflow: 'hidden' }}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <LinearGradient
        colors={['#2E1038', '#16081E', '#0E0612']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 460 }}
      />
      {/* Frosted ambient glow orbs */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -60,
          right: -60,
          width: 360,
          height: 360,
          borderRadius: 180,
          backgroundColor: 'rgba(244, 63, 94, 0.15)',
          ...(Platform.OS === 'web' ? ({ filter: 'blur(80px)' } as object) : {}),
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: 40,
          left: -80,
          width: 400,
          height: 400,
          borderRadius: 200,
          backgroundColor: 'rgba(192, 132, 252, 0.10)',
          ...(Platform.OS === 'web' ? ({ filter: 'blur(90px)' } as object) : {}),
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: space.xl,
            gap: space.xl,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ width: '100%', maxWidth: 460, gap: space.xl }}>
            <Stack gap={space.sm} style={{ alignItems: 'center' }}>
              <Row gap={space.sm}>
                <SlateMark size={30} />
                <Text variant="display" style={{ letterSpacing: 6 }} upper>
                  Slate
                </Text>
              </Row>
              <Text variant="body" tone="muted" align="center">
                Make art together: movie sets, acoustic jams, theater, and creative community — peer-to-peer and beginner friendly.
              </Text>
            </Stack>

            <Card padding={space.xl} style={{ gap: space.lg }}>
              <Stack gap={space.sm}>
                <Text variant="micro" tone="faint" upper>
                  Email
                </Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  inputMode="email"
                  placeholder="you@studio.com"
                  placeholderTextColor={color.textFaint}
                  onSubmitEditing={submit}
                  style={inputStyle}
                />
              </Stack>

              <Stack gap={space.sm}>
                <Text variant="micro" tone="faint" upper>
                  Password
                </Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholder="••••••••"
                  placeholderTextColor={color.textFaint}
                  onSubmitEditing={submit}
                  style={inputStyle}
                />
              </Stack>

              {login.error ? <ErrorNote message={login.error.message} /> : null}

              <Button
                label="Sign in"
                size="lg"
                full
                loading={login.pending}
                onPress={submit}
                trailing={<Icon name="arrowRight" size={17} color="#FFF" />}
              />

              <Row gap={space.md}>
                <Divider style={{ flex: 1 }} />
                <Text variant="micro" tone="faint" upper>
                  or tap a test account below
                </Text>
                <Divider style={{ flex: 1 }} />
              </Row>

              <Text variant="micro" tone="muted" align="center">
                One-tap login · Password for all accounts is <Text variant="micro" tone="accent" mono>slate</Text>
              </Text>

              <View style={{ gap: space.sm }}>
                {ROLE_COPY.map((role) => {
                  const roleEmail = demo.data?.[role.key];
                  if (!roleEmail) return null;
                  return (
                    <Pressable
                      key={role.key}
                      accessibilityRole="button"
                      accessibilityLabel={`Sign in as ${role.label}`}
                      disabled={login.pending}
                      onPress={() => {
                        setEmail(roleEmail);
                        setPassword(demo.data?.password ?? 'slate');
                        void login.mutate(roleEmail, demo.data?.password ?? 'slate');
                      }}
                      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space.md,
                        padding: space.md,
                        borderRadius: radius.md,
                        borderWidth: 1,
                        borderColor: color.border,
                        backgroundColor: pressed || hovered ? color.surfaceHot : color.surfaceAlt,
                      })}
                    >
                      <View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: radius.sm,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: color.accentSoft,
                        }}
                      >
                        <Icon name={role.icon} size={17} color={color.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text variant="subheading">{role.label}</Text>
                        <Text variant="micro" tone="faint" numberOfLines={1}>
                          {role.blurb}
                        </Text>
                      </View>
                      <Icon name="chevronRight" size={16} color={color.textFaint} />
                    </Pressable>
                  );
                })}
              </View>

              {demo.error ? (
                <ErrorNote message={demo.error.message} onRetry={demo.refetch} />
              ) : (
                <Stack gap={4} style={{ alignItems: 'center' }}>
                  <Text variant="micro" tone="faint" align="center">
                    API · {API_BASE}
                  </Text>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel="Privacy Policy"
                    onPress={() => void Linking.openURL(`${API_BASE}/privacy`)}
                    style={{ paddingVertical: 4 }}
                  >
                    <Text variant="micro" tone="accent" style={{ textDecorationLine: 'underline', fontSize: 11 }}>
                      Privacy Policy & User Data Transparency
                    </Text>
                  </Pressable>
                </Stack>
              )}
            </Card>

            {!compact ? (
              <Row gap={space.sm} justify="center" wrap>
                <Pill label="Verified & Secure" tone="outline" size="sm" />
                <Pill label="Safe Escrow Payments" tone="outline" size="sm" />
                <Pill label="Privacy Protected" tone="outline" size="sm" />
                <Pill label="Union Friendly" tone="outline" size="sm" />
              </Row>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const inputStyle = {
  backgroundColor: color.surfaceAlt,
  borderWidth: 1,
  borderColor: color.border,
  borderRadius: radius.md,
  paddingHorizontal: space.md,
  paddingVertical: Platform.OS === 'ios' ? 13 : 10,
  color: color.text,
  fontSize: 15,
} as const;
