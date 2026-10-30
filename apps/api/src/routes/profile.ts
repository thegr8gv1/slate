import type { FastifyInstance } from 'fastify';
import type { LearnAndHelpProfile } from '../contracts/index.js';
import { kvGet, kvSet } from '../db/index.js';
import { requireAccount } from '../lib/http.js';

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Get "Ready to Learn & Help Out" profile for current user.
   */
  app.get('/profile/me', async (request) => {
    const account = requireAccount(request);
    const key = `profile_learn_${account.id}`;
    const raw = kvGet(key);

    if (raw) {
      try {
        return JSON.parse(raw) as LearnAndHelpProfile;
      } catch {
        // Fall back to default
      }
    }

    const defaultProfile: LearnAndHelpProfile = {
      id: `prof_${account.id}`,
      accountId: account.id,
      displayName: account.displayName || 'Gowtham V',
      neighborhood: 'Silver Lake / Echo Park, LA',
      bio: 'Enthusiastic beginner curious about cinema, music, and stage art! Excited to hold a boom mic, shadow camera setups, play background extra, and help make neighborhood creative projects come to life.',
      avatarUrl: account.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=280&q=80',
      introMediaUrl: 'https://assets.mixkit.co/videos/preview/mixkit-young-woman-talking-on-a-video-call-42861-large.mp4',
      introMediaPrompt: 'Hi! I love visual storytelling and want to learn how real sets run.',
      wantToTry: [
        'Camera Shadowing',
        'Hold Boom Mic',
        'Background Extra',
        'Beat-Making',
        'Backstage Theater',
      ],
      whereICanHelp: [
        'Move Gear & Cables',
        'Pack the Audience',
        'Set Assistant',
        'Behind-The-Scenes Photos',
        'Keep Set Quiet & Focused',
      ],
      badges: [
        'Ready to Learn 🌱',
        'Community Supporter 🤝',
        'First-Time Artist ✨',
        'Reliable Neighbor ⭐',
      ],
      favoriteInspirations: [
        'Wong Kar-wai',
        'DIY Backyard Theater',
        'Lo-Fi Beats',
        'Film Noir Lighting',
      ],
      collaborationsCount: 3,
      communityRating: 5.0,
    };

    kvSet(key, JSON.stringify(defaultProfile));
    return defaultProfile;
  });

  /**
   * Update "Ready to Learn & Help Out" profile.
   */
  app.patch('/profile/me', async (request) => {
    const account = requireAccount(request);
    const key = `profile_learn_${account.id}`;
    const raw = kvGet(key);
    let profile: LearnAndHelpProfile;

    if (raw) {
      try {
        profile = JSON.parse(raw);
      } catch {
        profile = {
          id: `prof_${account.id}`,
          accountId: account.id,
          displayName: account.displayName,
          neighborhood: 'Silver Lake / Echo Park, LA',
          bio: '',
          avatarUrl: account.avatarUrl || '',
          wantToTry: ['Camera Shadowing', 'Ready to Learn'],
          whereICanHelp: ['Move Gear', 'Set Assistant'],
          badges: ['Ready to Learn 🌱'],
          favoriteInspirations: [],
          collaborationsCount: 0,
          communityRating: 5.0,
        };
      }
    } else {
      profile = {
        id: `prof_${account.id}`,
        accountId: account.id,
        displayName: account.displayName,
        neighborhood: 'Silver Lake / Echo Park, LA',
        bio: '',
        avatarUrl: account.avatarUrl || '',
        wantToTry: ['Camera Shadowing', 'Ready to Learn'],
        whereICanHelp: ['Move Gear', 'Set Assistant'],
        badges: ['Ready to Learn 🌱'],
        favoriteInspirations: [],
        collaborationsCount: 0,
        communityRating: 5.0,
      };
    }

    const body = request.body as Partial<LearnAndHelpProfile>;
    if (body.displayName) profile.displayName = body.displayName;
    if (body.neighborhood) profile.neighborhood = body.neighborhood;
    if (body.bio !== undefined) profile.bio = body.bio;
    if (body.wantToTry) profile.wantToTry = body.wantToTry;
    if (body.whereICanHelp) profile.whereICanHelp = body.whereICanHelp;
    if (body.badges) profile.badges = body.badges;
    if (body.favoriteInspirations) profile.favoriteInspirations = body.favoriteInspirations;
    if (body.introMediaUrl !== undefined) profile.introMediaUrl = body.introMediaUrl;
    if (body.introMediaPrompt !== undefined) profile.introMediaPrompt = body.introMediaPrompt;

    kvSet(key, JSON.stringify(profile));
    return { ok: true, profile };
  });
}
