import type { FamilyId, GroupId } from '../sim/types.ts'

export const FAMILIES: { id: FamilyId; name: string; color: string }[] = [
  { id: 'alkoholi', name: 'Alkoholi ja liuottimet', color: '#B8B4C8' },
  { id: 'sitrus', name: 'Sitrus', color: '#D9A93A' },
  { id: 'havu', name: 'Havu ja yrtti', color: '#5F8B6B' },
  { id: 'vihrea', name: 'Vihreä', color: '#8DB255' },
  { id: 'kukka', name: 'Kukkainen', color: '#A9769B' },
  { id: 'hedelma', name: 'Hedelmäinen', color: '#E08E6B' },
  { id: 'mauste', name: 'Mausteinen', color: '#A8432F' },
  { id: 'balsami', name: 'Balsami', color: '#C98A3E' },
  { id: 'puu', name: 'Puu ja maa', color: '#7A5A45' },
  { id: 'myski', name: 'Myski ja meripihka', color: '#7F86A6' },
  { id: 'haihtumaton', name: 'Haihtumaton', color: '#9A9A9A' },
]

export const FAMILY_BY_ID = Object.fromEntries(FAMILIES.map((f) => [f.id, f])) as Record<
  FamilyId,
  (typeof FAMILIES)[number]
>

export const GROUPS: { id: GroupId; name: string; color: string }[] = [
  { id: 'liuotin', name: 'Liuotin', color: '#B8B4C8' },
  { id: 'monoterpeeni', name: 'Monoterpeeni', color: '#D9A93A' },
  { id: 'seskviterpeeni', name: 'Seskviterpeeni', color: '#8C6A4F' },
  { id: 'hiilivety', name: 'Muu hiilivety', color: '#A3A3A3' },
  { id: 'aromaattinen', name: 'Aromaattinen hiilivety', color: '#C9A27E' },
  { id: 'terpeenialkoholi', name: 'Terpeenialkoholi', color: '#4F7CAC' },
  { id: 'seskviterpeenialkoholi', name: 'Seskviterpeenialkoholi', color: '#4A3628' },
  { id: 'alkoholi', name: 'Muu alkoholi', color: '#7FA7C9' },
  { id: 'aldehydi', name: 'Aldehydi', color: '#CF6F4E' },
  { id: 'ketoni', name: 'Ketoni', color: '#5F8B6B' },
  { id: 'esteri', name: 'Esteri', color: '#A9769B' },
  { id: 'laktoni', name: 'Laktoni', color: '#E2A6BD' },
  { id: 'fenoli', name: 'Fenoli', color: '#7E4F96' },
  { id: 'eetteri-oksidi', name: 'Eetteri / oksidi', color: '#5FA9A0' },
  { id: 'happo', name: 'Happo', color: '#B5B05A' },
  { id: 'typpi-rikki', name: 'Typpi- tai rikkiyhdiste', color: '#3E6E8E' },
  { id: 'muu', name: 'Muu', color: '#9A9A9A' },
  { id: 'haihtumaton', name: 'Haihtumaton', color: '#CFCFCF' },
]

export const GROUP_BY_ID = Object.fromEntries(GROUPS.map((g) => [g.id, g])) as Record<
  GroupId,
  (typeof GROUPS)[number]
>
