import type { FamilyId, GroupId } from '../sim/types.ts'

export const FAMILIES: { id: FamilyId; name: string; color: string }[] = [
  { id: 'alkoholi', name: 'Alcohol & solvents', color: '#B8B4C8' },
  { id: 'sitrus', name: 'Citrus', color: '#D9A93A' },
  { id: 'havu', name: 'Coniferous & herbal', color: '#5F8B6B' },
  { id: 'vihrea', name: 'Green', color: '#8DB255' },
  { id: 'kukka', name: 'Floral', color: '#A9769B' },
  { id: 'hedelma', name: 'Fruity', color: '#E08E6B' },
  { id: 'mauste', name: 'Spicy', color: '#A8432F' },
  { id: 'balsami', name: 'Balsamic & gourmand', color: '#C98A3E' },
  { id: 'puu', name: 'Woody & earthy', color: '#7A5A45' },
  { id: 'myski', name: 'Musk & amber', color: '#7F86A6' },
  { id: 'raikas', name: 'Aldehydic & marine', color: '#5E9FBF' },
  { id: 'haihtumaton', name: 'Non-volatile', color: '#9A9A9A' },
]

export const FAMILY_BY_ID = Object.fromEntries(FAMILIES.map((f) => [f.id, f])) as Record<
  FamilyId,
  (typeof FAMILIES)[number]
>

export const GROUPS: { id: GroupId; name: string; color: string }[] = [
  { id: 'liuotin', name: 'Solvent', color: '#B8B4C8' },
  { id: 'monoterpeeni', name: 'Monoterpene', color: '#D9A93A' },
  { id: 'seskviterpeeni', name: 'Sesquiterpene', color: '#8C6A4F' },
  { id: 'hiilivety', name: 'Other hydrocarbon', color: '#A3A3A3' },
  { id: 'aromaattinen', name: 'Aromatic hydrocarbon', color: '#C9A27E' },
  { id: 'terpeenialkoholi', name: 'Terpene alcohol', color: '#4F7CAC' },
  { id: 'seskviterpeenialkoholi', name: 'Sesquiterpene alcohol', color: '#4A3628' },
  { id: 'alkoholi', name: 'Other alcohol', color: '#7FA7C9' },
  { id: 'aldehydi', name: 'Aldehyde', color: '#CF6F4E' },
  { id: 'ketoni', name: 'Ketone', color: '#5F8B6B' },
  { id: 'esteri', name: 'Ester', color: '#A9769B' },
  { id: 'laktoni', name: 'Lactone', color: '#E2A6BD' },
  { id: 'fenoli', name: 'Phenol', color: '#7E4F96' },
  { id: 'eetteri-oksidi', name: 'Ether / oxide', color: '#5FA9A0' },
  { id: 'happo', name: 'Acid', color: '#B5B05A' },
  { id: 'typpi-rikki', name: 'Nitrogen or sulfur compound', color: '#3E6E8E' },
  { id: 'muu', name: 'Other', color: '#9A9A9A' },
  { id: 'haihtumaton', name: 'Non-volatile', color: '#CFCFCF' },
]

export const GROUP_BY_ID = Object.fromEntries(GROUPS.map((g) => [g.id, g])) as Record<
  GroupId,
  (typeof GROUPS)[number]
>
