import type { DiaryEntry } from '../services/diary'
export function normalize(input: DiaryEntry): Omit<DiaryEntry, 'id' | 'version' | 'createdAt' | 'updatedAt'>
