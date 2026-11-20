import type { FamilyId, GroupId } from '../sim/types.ts'

export const FAMILIES: { id: FamilyId; name: string; color: string }[] = [
  { id: 'alkoholi', name: 'Alkoholi', color: '#B8B4C8' },
  { id: 'sitrus', name: 'Sitrus', color: '#D9A93A' },
  { id: 'havu', name: 'Havu ja yrtti', color: '#5F8B6B' },
  { id: 'kukka', name: 'Kukkainen', color: '#A9769B' },
  { id: 'puu', name: 'Puu ja maa', color: '#7A5A45' },
  { id: 'balsami', name: 'Balsami', color: '#C27A3C' },
  { id: 'haihtumaton', name: 'Haihtumaton', color: '#9A9A9A' },
]

export const FAMILY_BY_ID = Object.fromEntries(FAMILIES.map((f) => [f.id, f])) as Record<
  FamilyId,
  (typeof FAMILIES)[number]
>

export const GROUPS: { id: GroupId; name: string; color: string }[] = [
  { id: 'liuotin', name: 'Liuotin', color: '#B8B4C8' },
  { id: 'monoterpeeni', name: 'Monoterpeeni', color: '#D9A93A' },
  { id: 'terpeenialkoholi', name: 'Terpeenialkoholi', color: '#4F7CAC' },
  { id: 'esteri', name: 'Esteri', color: '#A9769B' },
  { id: 'oksidi-ketoni', name: 'Oksidi / ketoni', color: '#5F8B6B' },
  { id: 'seskviterpeeni', name: 'Seskviterpeeni', color: '#8C6A4F' },
  { id: 'seskviterpeenialkoholi', name: 'Seskviterpeenialkoholi', color: '#4A3628' },
  { id: 'aromaattinen', name: 'Aromaattinen', color: '#C27A3C' },
  { id: 'haihtumaton', name: 'Haihtumaton', color: '#9A9A9A' },
]

export const GROUP_BY_ID = Object.fromEntries(GROUPS.map((g) => [g.id, g])) as Record<
  GroupId,
  (typeof GROUPS)[number]
>
