import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import type { ChatMessage, PeerChat, SkillShareMentor } from '../contracts';
import { Icon } from '../design/Icon';
import { Text } from '../design/Text';
import { Avatar, Button, Card, Pill, Row, Spacer, Stack } from '../design/primitives';
import { color, radius, space } from '../design/tokens';
import { Screen } from '../features/shell/Shell';
import { api } from '../lib/api';
import { useMutation, useQuery } from '../lib/query';

export default function SkillShareAndChats() {
  const [activeChat, setActiveChat] = useState<PeerChat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Mentors query
  const { data: mentorsData } = useQuery<{ mentors: SkillShareMentor[] }>(
    () => api.get<{ mentors: SkillShareMentor[] }>('/art/mentors'),
    []
  );
  const mentors = mentorsData?.mentors ?? [];

  // Chats query
  const { data: chatsData, refetch: refetchChats } = useQuery<{ chats: PeerChat[] }>(
    () => api.get<{ chats: PeerChat[] }>('/chats'),
    []
  );
  const chats = chatsData?.chats ?? [];

  const openConversation = async (chat: PeerChat) => {
    setActiveChat(chat);
    setLoadingMessages(true);
    try {
      const res = await api.get<{ messages: ChatMessage[] }>(`/chats/${chat.id}/messages`);
      setMessages(res.messages ?? []);
    } catch {
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  const sendMessage = useMutation(async () => {
    if (!activeChat || !inputText.trim()) return;
    const sent = await api.post<ChatMessage>(`/chats/${activeChat.id}/messages`, {
      text: inputText.trim(),
    });
    setMessages((prev) => [...prev, sent]);
    setInputText('');
    refetchChats();
  });

  const startMentorChat = (mentor: SkillShareMentor) => {
    Alert.alert(
      `Ask ${mentor.name}`,
      `Suggested Question: "${mentor.suggestedPrompt}"\n\n${mentor.tagline}`,
      [
        {
          text: 'Send Prompt',
          onPress: async () => {
            await api.post('/advice/book', {
              creatorId: mentor.id,
              question: mentor.suggestedPrompt,
            });
            Alert.alert('Message Sent!', `${mentor.name} has been notified and will reply in your chats.`);
            refetchChats();
          },
        },
        { text: 'Close', style: 'cancel' },
      ]
    );
  };

  return (
    <Screen
      title="Skill-Share & Chats"
      accent="Peer Mentorship"
      onRefresh={refetchChats}
    >
      <Stack gap={space.lg}>
        {/* Skill-Share Mentorship Banner */}
        <Card variant="alt" style={styles.mentorBanner}>
          <Stack gap={space.xs}>
            <Row align="center" gap={space.xs}>
              <Icon name="sparkle" size={20} color={color.brand} />
              <Text variant="subheading" weight="800">
                Ask a Local Creator (Free Skill-Share)
              </Text>
            </Row>
            <Text variant="body" tone="muted">
              Never be afraid to ask how to start. These experienced neighborhood creators love showing beginners how real sets, jams, and theater work.
            </Text>
          </Stack>
        </Card>

        {/* Featured Mentors Carousel / List */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mentorsScroll}>
          {mentors.map((mentor) => (
            <Card key={mentor.id} style={styles.mentorCard}>
              <Stack gap={space.xs} style={{ alignItems: 'center' }}>
                <Avatar uri={mentor.avatar} name={mentor.name} size={58} />
                <Text variant="subheading" weight="700" align="center" numberOfLines={1}>
                  {mentor.name}
                </Text>
                <Pill label={mentor.role} tone="brand" size="sm" />
                <Text variant="caption" tone="muted" align="center" numberOfLines={2}>
                  {mentor.tagline}
                </Text>
                <Spacer size={space.xxs} />
                <Button
                  label="Say Hi 👋"
                  variant="secondary"
                  size="sm"
                  onPress={() => startMentorChat(mentor)}
                />
              </Stack>
            </Card>
          ))}
        </ScrollView>

        {/* Active Conversations Section */}
        <Stack gap={space.md}>
          <Text variant="heading" weight="800">
            Project & Skill-Share Chats
          </Text>

          {chats.length === 0 ? (
            <Card>
              <Text variant="body" tone="muted" align="center">
                No active conversations yet. Join a project on the Art Map or say hi to a mentor above!
              </Text>
            </Card>
          ) : null}

          {chats.map((chat) => (
            <Pressable key={chat.id} onPress={() => openConversation(chat)}>
              <Card variant="alt" style={styles.chatCard}>
                <Row align="center" justify="space-between" gap={space.md}>
                  <Row align="center" gap={space.md} style={{ flex: 1 }}>
                    <Avatar uri={chat.peerAvatar} name={chat.peerName} size={48} />
                    <Stack gap={space.xxs} style={{ flex: 1 }}>
                      <Row align="center" gap={space.xs}>
                        <Text variant="subheading" weight="700">
                          {chat.peerName}
                        </Text>
                        {chat.isAdviceCall ? (
                          <Pill label="Skill-Share" tone="brand" size="sm" />
                        ) : (
                          <Pill label="Project Crew" tone="success" size="sm" />
                        )}
                      </Row>
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {chat.lastMessage}
                      </Text>
                    </Stack>
                  </Row>

                  <Stack gap={space.xxs} style={{ alignItems: 'flex-end' }}>
                    <Text variant="micro" tone="faint">
                      {chat.lastMessageTime}
                    </Text>
                    {chat.unreadCount > 0 ? (
                      <View style={styles.unreadBadge}>
                        <Text variant="micro" weight="800" style={{ color: '#FFF' }}>
                          {chat.unreadCount}
                        </Text>
                      </View>
                    ) : null}
                  </Stack>
                </Row>
              </Card>
            </Pressable>
          ))}
        </Stack>
      </Stack>

      {/* Conversation Dialog Modal */}
      <Modal visible={!!activeChat} animationType="slide" transparent>
        <View style={styles.chatModalBackdrop}>
          <View style={styles.chatModalContent}>
            {/* Chat Header */}
            <Row justify="space-between" align="center" style={styles.chatModalHeader}>
              <Row align="center" gap={space.sm}>
                <Avatar
                  uri={activeChat?.peerAvatar}
                  name={activeChat?.peerName ?? 'Creator'}
                  size={40}
                />
                <Stack gap={space.xxs}>
                  <Text variant="subheading" weight="700">
                    {activeChat?.peerName}
                  </Text>
                  <Text variant="micro" tone="muted">
                    {activeChat?.peerRole}
                  </Text>
                </Stack>
              </Row>
              <Button label="Close" variant="ghost" size="sm" onPress={() => setActiveChat(null)} />
            </Row>

            {/* Chat Messages */}
            <ScrollView style={styles.messageList} contentContainerStyle={{ gap: space.sm, padding: space.md }}>
              {loadingMessages ? (
                <Text variant="caption" tone="muted" align="center">
                  Loading conversation...
                </Text>
              ) : null}

              {messages.map((m) => (
                <View
                  key={m.id}
                  style={[
                    styles.messageBubble,
                    m.isMine ? styles.myMessageBubble : styles.theirMessageBubble,
                  ]}
                >
                  <Text variant="micro" weight="700" tone={m.isMine ? 'accent' : 'brand'}>
                    {m.isMine ? 'You' : m.senderName} • {m.timestamp}
                  </Text>
                  <Spacer size={space.xxs} />
                  <Text variant="body" style={{ color: '#FFF' }}>
                    {m.text}
                  </Text>
                </View>
              ))}
            </ScrollView>

            {/* Message Input Box */}
            <View style={styles.inputBar}>
              <TextInput
                style={styles.chatInput}
                value={inputText}
                onChangeText={setInputText}
                placeholder="Type your message..."
                placeholderTextColor={color.textFaint}
              />
              <Button
                label="Send"
                variant="primary"
                size="sm"
                loading={sendMessage.pending}
                onPress={() => void sendMessage.mutate()}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  mentorBanner: {
    borderLeftWidth: 3,
    borderLeftColor: color.brand,
  },
  mentorsScroll: {
    gap: space.md,
    paddingVertical: space.xxs,
  },
  mentorCard: {
    width: 200,
    padding: space.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chatCard: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  unreadBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
  },
  chatModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  chatModalContent: {
    backgroundColor: color.bgElev,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    height: '80%',
    display: 'flex',
  },
  chatModalHeader: {
    padding: space.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  messageList: {
    flex: 1,
  },
  messageBubble: {
    maxWidth: '82%',
    padding: space.sm,
    borderRadius: radius.md,
  },
  myMessageBubble: {
    alignSelf: 'flex-end',
    backgroundColor: `${color.accent}30`,
    borderWidth: 1,
    borderColor: `${color.accent}60`,
  },
  theirMessageBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  inputBar: {
    flexDirection: 'row',
    padding: space.md,
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    backgroundColor: color.bgElev,
  },
  chatInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    color: color.text,
    borderWidth: 1,
    borderColor: color.border,
  },
});
