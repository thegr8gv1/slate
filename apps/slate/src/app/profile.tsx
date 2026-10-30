import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { LearnAndHelpProfile } from '../contracts';
import { Icon } from '../design/Icon';
import { Text } from '../design/Text';
import { Avatar, Button, Card, Pill, Row, Spacer, Stack, Stat } from '../design/primitives';
import { color, radius, space } from '../design/tokens';
import { Screen } from '../features/shell/Shell';
import { api } from '../lib/api';
import { useMutation, useQuery } from '../lib/query';
import { useSession } from '../lib/session';

export default function ReadyToLearnProfile() {
  const { signOut } = useSession();
  const [isPlayingIntro, setIsPlayingIntro] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const { data: profile, refetch } = useQuery<LearnAndHelpProfile>(
    () => api.get<LearnAndHelpProfile>('/profile/me'),
    []
  );

  const [editBio, setEditBio] = useState('');
  const [editNeighborhood, setEditNeighborhood] = useState('');

  const updateProfile = useMutation(async () => {
    await api.patch('/profile/me', {
      bio: editBio,
      neighborhood: editNeighborhood,
    });
    setIsEditing(false);
    refetch();
  });

  const openEditModal = () => {
    if (profile) {
      setEditBio(profile.bio);
      setEditNeighborhood(profile.neighborhood);
      setIsEditing(true);
    }
  };

  return (
    <Screen
      title="Who I Am"
      accent="Ready to Learn & Help Out"
      onRefresh={refetch}
    >
      <Stack gap={space.lg}>
        {/* Header Profile Hero */}
        <Card variant="alt">
          <Row justify="space-between" align="flex-start" wrap gap={space.md}>
            <Row align="center" gap={space.md}>
              <Avatar
                uri={profile?.avatarUrl ?? undefined}
                name={profile?.displayName ?? 'Gowtham'}
                size={72}
              />
              <Stack gap={space.xxs}>
                <Row align="center" gap={space.xs}>
                  <Text variant="heading" weight="800">
                    {profile?.displayName ?? 'Gowtham V'}
                  </Text>
                  <Pill label="Active Artist" tone="success" size="sm" />
                </Row>
                <Row align="center" gap={space.xs}>
                  <Icon name="pin" size={13} color={color.accent} />
                  <Text variant="caption" tone="muted">
                    {profile?.neighborhood ?? 'Silver Lake / Echo Park, LA'}
                  </Text>
                </Row>
                <Text variant="micro" tone="faint">
                  Available for walk & bike collaborations
                </Text>
              </Stack>
            </Row>

            <Button label="Edit Profile" variant="secondary" size="sm" onPress={openEditModal} />
          </Row>

          <Spacer size={space.md} />

          {/* Friendly Bio */}
          <Text variant="body">
            {profile?.bio ??
              'Enthusiastic beginner curious about cinema, music, and stage art! Excited to hold a boom mic, shadow camera setups, play background extra, and help make neighborhood creative projects come to life.'}
          </Text>

          <Spacer size={space.md} />

          {/* Community Badges */}
          <Row wrap gap={space.xs}>
            {profile?.badges?.map((badge, idx) => (
              <Pill key={idx} label={badge} tone="brand" size="sm" />
            ))}
          </Row>
        </Card>

        {/* 15-Second Intro Video / Audio Card */}
        <Card style={styles.introCard}>
          <Stack gap={space.sm}>
            <Row justify="space-between" align="center">
              <Row align="center" gap={space.xs}>
                <Icon name="video" size={18} color={color.accent} />
                <Text variant="subheading" weight="700">
                  15-Second Video / Audio Intro
                </Text>
              </Row>
              <Pill label="0:15 Quick Take" tone="brand" size="sm" />
            </Row>

            <Text variant="caption" tone="muted">
              {profile?.introMediaPrompt ??
                '"Hi! I love visual storytelling, indie music, and want to learn how real sets run."'}
            </Text>

            {/* Video preview / play box */}
            <Pressable
              onPress={() => {
                setIsPlayingIntro(!isPlayingIntro);
                Alert.alert(
                  '15-Second Intro Playing',
                  'Gowtham: "Hey everyone! I live right in Silver Lake. Excited to hold boom mics, shadow gaffers, and cheer at local shows!"'
                );
              }}
              style={styles.videoPlayerBox}
            >
              <View style={styles.playButtonCircle}>
                <Icon name={isPlayingIntro ? 'pause' : 'play'} size={24} color="#FFFFFF" />
              </View>
              <Text variant="label" weight="700" style={{ marginTop: space.xs }}>
                {isPlayingIntro ? 'Playing 15-Sec Intro...' : 'Tap to Play Intro Video'}
              </Text>
              <Text variant="micro" tone="faint">
                Recorded on phone • No fancy editing needed
              </Text>
            </Pressable>

            <Row justify="flex-end">
              <Button
                label="Record New Video Intro 🎥"
                variant="ghost"
                size="sm"
                onPress={() =>
                  Alert.alert(
                    'Record New 15-Sec Intro',
                    'You can record a quick video on your phone answering: "What creative project do you want to try next?"'
                  )
                }
              />
            </Row>
          </Stack>
        </Card>

        {/* "What I Want to Try" (Curiosity & Learning tags) */}
        <Card>
          <Stack gap={space.sm}>
            <Row justify="space-between" align="center">
              <Row align="center" gap={space.xs}>
                <Icon name="sparkle" size={16} color={color.brand} />
                <Text variant="subheading" weight="800">
                  What I Want to Try (Curiosities)
                </Text>
              </Row>
              <Pill label="Beginner Friendly" tone="neutral" size="sm" />
            </Row>
            <Text variant="caption" tone="muted">
              Artistic activities I am excited to explore or shadow for the first time:
            </Text>

            <Row wrap gap={space.xs}>
              {profile?.wantToTry?.map((item, idx) => (
                <View key={idx} style={styles.skillChipPink}>
                  <Text variant="caption" weight="700" style={{ color: color.accent }}>
                    🌱 {item}
                  </Text>
                </View>
              ))}
            </Row>
          </Stack>
        </Card>

        {/* "Where I Can Help Out" (Volunteer & Assistant Willingness) */}
        <Card>
          <Stack gap={space.sm}>
            <Row justify="space-between" align="center">
              <Row align="center" gap={space.xs}>
                <Icon name="users" size={16} color={color.success} />
                <Text variant="subheading" weight="800">
                  Where I Can Help Out (Willing to Assist)
                </Text>
              </Row>
              <Pill label="Hands-On Help" tone="success" size="sm" />
            </Row>
            <Text variant="caption" tone="muted">
              Ways I am happy to help local artists, filmmakers, and musicians:
            </Text>

            <Row wrap gap={space.xs}>
              {profile?.whereICanHelp?.map((item, idx) => (
                <View key={idx} style={styles.skillChipGreen}>
                  <Text variant="caption" weight="700" style={{ color: color.success }}>
                    🤝 {item}
                  </Text>
                </View>
              ))}
            </Row>
          </Stack>
        </Card>

        {/* Artistic Inspirations */}
        <Card variant="alt">
          <Stack gap={space.sm}>
            <Text variant="subheading" weight="800">
              Creative Inspirations & Tastes
            </Text>
            <Text variant="caption" tone="muted">
              Films, music, or art styles that inspire me:
            </Text>
            <Row wrap gap={space.xs}>
              {profile?.favoriteInspirations?.map((item, idx) => (
                <Pill key={idx} label={`✨ ${item}`} tone="neutral" size="sm" />
              ))}
            </Row>
          </Stack>
        </Card>

        {/* Stats & Community Trust */}
        <Card>
          <Text variant="subheading" weight="800">
            Creative Journey
          </Text>
          <Spacer size={space.sm} />
          <Row justify="space-around">
            <Stat
              value={String(profile?.collaborationsCount ?? 3)}
              label="Projects Helped"
            />
            <Stat
              value="5.0 ★"
              label="Community Reliability"
            />
            <Stat
              value="100%"
              label="Show-Up Rate"
            />
          </Row>
        </Card>

        {/* Sign Out Action */}
        <Button
          label="Sign Out of Slate"
          variant="ghost"
          size="md"
          onPress={async () => {
            await signOut();
          }}
        />
      </Stack>

      {/* Edit Profile Modal */}
      <Modal visible={isEditing} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text variant="heading" weight="800">
              Edit My Profile
            </Text>
            <Spacer size={space.sm} />

            <Text variant="label">Neighborhood / Area</Text>
            <TextInput
              style={styles.textInput}
              value={editNeighborhood}
              onChangeText={setEditNeighborhood}
              placeholder="e.g. Silver Lake / Echo Park, LA"
              placeholderTextColor={color.textFaint}
            />

            <Spacer size={space.sm} />
            <Text variant="label">Short Bio (Friendly & Informal)</Text>
            <TextInput
              style={[styles.textInput, { height: 90, textAlignVertical: 'top' }]}
              value={editBio}
              onChangeText={setEditBio}
              multiline
              placeholder="Introduce yourself to fellow neighborhood artists!"
              placeholderTextColor={color.textFaint}
            />

            <Spacer size={space.lg} />
            <Row justify="flex-end" gap={space.sm}>
              <Button label="Cancel" variant="ghost" size="sm" onPress={() => setIsEditing(false)} />
              <Button
                label="Save Profile"
                variant="primary"
                size="sm"
                loading={updateProfile.pending}
                onPress={() => void updateProfile.mutate()}
              />
            </Row>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  introCard: {
    borderWidth: 1.5,
    borderColor: `${color.accent}44`,
  },
  videoPlayerBox: {
    height: 150,
    borderRadius: radius.md,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: space.xs,
  },
  playButtonCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skillChipPink: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: `${color.accent}18`,
    borderWidth: 1,
    borderColor: `${color.accent}44`,
  },
  skillChipGreen: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: `${color.success}18`,
    borderWidth: 1,
    borderColor: `${color.success}44`,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: space.lg,
  },
  modalContent: {
    backgroundColor: color.bgElev,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: 1,
    borderColor: color.border,
  },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.sm,
    padding: space.sm,
    color: color.text,
    borderWidth: 1,
    borderColor: color.border,
    marginTop: space.xxs,
  },
});
