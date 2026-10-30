/**
 * SLATE industry taxonomy.
 *
 * Eight sectors, each with the concrete roles a production actually line-items
 * on a call sheet. The matching engine treats `sector` as a hard filter and
 * `role` as a soft (embedding) signal, so this list doubles as the L1 filter
 * vocabulary.
 */

export const SECTORS = [
  'screen_stage',
  'digital_social',
  'music_sound',
  'directing_writing',
  'camera_lighting',
  'art_style_sfx',
  'modeling_print',
  'post_production',
] as const;

export type Sector = (typeof SECTORS)[number];

export interface SectorDefinition {
  id: Sector;
  label: string;
  shortLabel: string;
  /** Roles/specialties bookable inside this sector. */
  roles: readonly string[];
  /** Whether bookings in this sector are typically union-governed. */
  unionCommon: boolean;
}

export const SECTOR_CATALOG: Record<Sector, SectorDefinition> = {
  screen_stage: {
    id: 'screen_stage',
    label: 'Screen & Stage Talent',
    shortLabel: 'Screen & Stage',
    unionCommon: true,
    roles: [
      'Lead Actor',
      'Supporting Actor',
      'Voiceover Artist',
      'Stunt Double',
      'Commercial Actor',
      'Cameo / A-List Celebrity',
      'Stand-In',
      'Background / Extra',
      'Theatre Performer',
    ],
  },
  digital_social: {
    id: 'digital_social',
    label: 'Digital & Social Creators',
    shortLabel: 'Digital & Social',
    unionCommon: false,
    roles: [
      'UGC Creator',
      'Micro Influencer',
      'Macro Influencer',
      'Streamer',
      'Key Opinion Leader',
      'Podcaster',
      'Event Host / Emcee',
    ],
  },
  music_sound: {
    id: 'music_sound',
    label: 'Music & Sound',
    shortLabel: 'Music & Sound',
    unionCommon: true,
    roles: [
      'Film Composer',
      'Foley Artist',
      'Session Musician',
      'Music Producer',
      'Sound Designer',
      'Boom Operator',
      'Sound Mixer',
      'Mixing / Mastering Engineer',
    ],
  },
  directing_writing: {
    id: 'directing_writing',
    label: 'Directing & Writing',
    shortLabel: 'Directing & Writing',
    unionCommon: true,
    roles: [
      'Narrative Director',
      'Commercial Director',
      'Showrunner',
      'Screenwriter',
      'Script Supervisor',
      'Pitch Deck Designer',
    ],
  },
  camera_lighting: {
    id: 'camera_lighting',
    label: 'Camera & Lighting',
    shortLabel: 'Camera & Lighting',
    unionCommon: true,
    roles: [
      'Director of Photography',
      '1st AC',
      '2nd AC',
      'Steadicam / Gimbal Operator',
      'Drone Pilot (FAA Certified)',
      'Gaffer',
      'Key Grip',
      'Camera Operator',
    ],
  },
  art_style_sfx: {
    id: 'art_style_sfx',
    label: 'Art, Style & SFX',
    shortLabel: 'Art & SFX',
    unionCommon: true,
    roles: [
      'Production Designer',
      'Wardrobe Stylist',
      'SFX / Prosthetic Makeup Artist',
      'Hair Stylist',
      'Prop Master',
      'Set Decorator',
    ],
  },
  modeling_print: {
    id: 'modeling_print',
    label: 'Modeling & Print',
    shortLabel: 'Modeling & Print',
    unionCommon: false,
    roles: [
      'High-Fashion Model',
      'Commercial Model',
      'Fitness Model',
      'Editorial Model',
      'Hand / Body-Part Model',
      'Runway Model',
    ],
  },
  post_production: {
    id: 'post_production',
    label: 'Post-Production',
    shortLabel: 'Post',
    unionCommon: false,
    roles: [
      'Offline Editor',
      'Online Editor',
      'Colorist (DaVinci / Baselight)',
      'VFX Compositor',
      'VFX Supervisor',
      'Motion Graphic Designer',
      '3D Animator',
    ],
  },
};

export const ALL_ROLES: readonly string[] = SECTORS.flatMap((s) => SECTOR_CATALOG[s].roles);

export function sectorForRole(role: string): Sector | undefined {
  return SECTORS.find((s) => SECTOR_CATALOG[s].roles.includes(role));
}

export const UNION_STATUSES = ['sag_aftra', 'iatse', 'equity', 'non_union', 'fi_core'] as const;
export type UnionStatus = (typeof UNION_STATUSES)[number];

export const UNION_LABELS: Record<UnionStatus, string> = {
  sag_aftra: 'SAG-AFTRA',
  iatse: 'IATSE',
  equity: 'Equity',
  non_union: 'Non-Union',
  fi_core: 'Fi-Core',
};
