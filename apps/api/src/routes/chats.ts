import type { FastifyInstance } from 'fastify';
import type { AdviceCreator, ChatMessage, PeerChat } from '../contracts/index.js';
import { all, get, run } from '../db/index.js';
import { badRequest, notFound, requireAccount } from '../lib/http.js';
import { newId } from '../lib/ids.js';

interface ChatRow {
  id: string;
  account_id: string;
  peer_id: string;
  peer_name: string;
  peer_avatar: string;
  peer_role: string;
  last_message: string;
  last_message_time: string;
  unread_count: number;
  is_advice_call: number;
  advice_topic: string | null;
  advice_price_cents: number | null;
  created_at: string;
}

interface MessageRow {
  id: string;
  chat_id: string;
  sender_id: string;
  sender_name: string;
  text: string;
  timestamp: string;
  created_at: string;
}

const ADVICE_CREATORS: AdviceCreator[] = [
  {
    id: 'creator_marcus',
    name: 'Marcus Diallo',
    role: 'Lighting Tech / DP',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    neighborhood: 'Silver Lake',
    topic: 'First day on set etiquette & basic cable/lighting help',
    priceCents: 500, // $5
    responseMinutes: 15,
    rating: 4.9,
    reviewsCount: 38,
  },
  {
    id: 'creator_chloe',
    name: 'Chloe Vance',
    role: 'UGC & Reel Creator',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
    neighborhood: 'Echo Park',
    topic: 'How to film aesthetic shop opening stories & local brand posts',
    priceCents: 500, // $5
    responseMinutes: 20,
    rating: 5.0,
    reviewsCount: 62,
  },
  {
    id: 'creator_sarah',
    name: 'Sarah Jenkins',
    role: 'Working Extra & Actor',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    neighborhood: 'Hollywood',
    topic: 'How to stand out, get booked repeatedly, and look natural on camera',
    priceCents: 500, // $5
    responseMinutes: 10,
    rating: 4.9,
    reviewsCount: 84,
  },
  {
    id: 'creator_leo',
    name: 'Leo Alvarez',
    role: 'Indie Film Director',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
    neighborhood: 'Arts District',
    topic: 'What directors actually look for in background extras & crowd scenes',
    priceCents: 500, // $5
    responseMinutes: 30,
    rating: 4.8,
    reviewsCount: 29,
  },
];

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Get all chats (both gig coordination chats and $5 advice threads).
   */
  app.get('/chats', async (request) => {
    const account = requireAccount(request);

    const rows = all<ChatRow>(
      'SELECT * FROM peer_chats WHERE account_id = ? ORDER BY created_at DESC',
      account.id
    );

    const chats: PeerChat[] = rows.map((r) => ({
      id: r.id,
      peerId: r.peer_id,
      peerName: r.peer_name,
      peerAvatar: r.peer_avatar,
      peerRole: r.peer_role,
      lastMessage: r.last_message,
      lastMessageTime: r.last_message_time,
      unreadCount: r.unread_count,
      isAdviceCall: r.is_advice_call === 1,
      adviceTopic: r.advice_topic ?? undefined,
      advicePriceCents: r.advice_price_cents ?? undefined,
    }));

    return { chats };
  });

  /**
   * Get messages inside a chat conversation.
   */
  app.get('/chats/:id/messages', async (request) => {
    const account = requireAccount(request);
    const { id } = request.params as { id: string };

    const rows = all<MessageRow>(
      'SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY created_at ASC',
      id
    );

    const messages: ChatMessage[] = rows.map((r) => ({
      id: r.id,
      chatId: r.chat_id,
      senderId: r.sender_id,
      senderName: r.sender_name,
      text: r.text,
      timestamp: r.timestamp,
      isMine: r.sender_id === account.id || r.sender_name === 'You',
    }));

    // Mark chat unread as 0
    run('UPDATE peer_chats SET unread_count = 0 WHERE id = ?', id);

    return { messages };
  });

  /**
   * Send a message.
   */
  app.post('/chats/:id/messages', async (request) => {
    const account = requireAccount(request);
    const { id } = request.params as { id: string };
    const body = request.body as { text?: string };

    if (!body?.text?.trim()) {
      throw badRequest('Message text is required');
    }

    const msgId = newId('m');
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    run(
      'INSERT INTO chat_messages (id, chat_id, sender_id, sender_name, text, timestamp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      msgId,
      id,
      account.id,
      account.displayName,
      body.text.trim(),
      timeStr,
      now.toISOString()
    );

    run(
      'UPDATE peer_chats SET last_message = ?, last_message_time = ? WHERE id = ?',
      body.text.trim(),
      'Just now',
      id
    );

    return {
      id: msgId,
      chatId: id,
      senderId: account.id,
      senderName: account.displayName,
      text: body.text.trim(),
      timestamp: timeStr,
      isMine: true,
    } satisfies ChatMessage;
  });

  /**
   * List available experienced creators offering $5 Advice Calls.
   */
  app.get('/advice/creators', async () => {
    return { creators: ADVICE_CREATORS };
  });

  /**
   * Book a $5 advice text session with an experienced local creator.
   */
  app.post('/advice/book', async (request) => {
    const account = requireAccount(request);
    const body = request.body as { creatorId?: string; question?: string };

    const creator = ADVICE_CREATORS.find((c) => c.id === body.creatorId);
    if (!creator) throw notFound('Creator not found');

    const chatId = `chat_advice_${creator.id}_${account.id}`;

    // Create or find peer chat
    const existing = get('SELECT id FROM peer_chats WHERE id = ?', chatId);
    if (!existing) {
      run(
        `INSERT INTO peer_chats (
          id, account_id, peer_id, peer_name, peer_avatar, peer_role,
          last_message, last_message_time, unread_count, is_advice_call, advice_topic, advice_price_cents, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?)`,
        chatId,
        account.id,
        creator.id,
        creator.name,
        creator.avatar,
        creator.role,
        body.question ?? 'Asked for advice',
        'Just now',
        `$5 Quick Tip: ${creator.topic}`,
        creator.priceCents,
        new Date().toISOString()
      );
    }

    if (body.question) {
      const msgId = newId('m');
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      run(
        'INSERT INTO chat_messages (id, chat_id, sender_id, sender_name, text, timestamp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        msgId,
        chatId,
        account.id,
        account.displayName,
        body.question,
        timeStr,
        now.toISOString()
      );
    }

    return {
      ok: true,
      chatId,
      message: `Booked $5 advice with ${creator.name}! They will reply within ${creator.responseMinutes} minutes.`,
    };
  });
}
