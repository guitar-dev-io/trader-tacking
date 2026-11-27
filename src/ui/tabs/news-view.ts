// Snapshot that news.ts pushes for NewsFeed.svelte (the headline list of the news page).
import { writable } from 'svelte/store';
export interface NewsItem { title: string; link: string; src: string; t: number; kind: string; feed: string }
export interface NewsView { list: (NewsItem & { ago: string })[]; chips: [string, string][]; filter: string; seenAt: number; loading: boolean; total: number;
  cal: { impact: string; when: string; ccy: string; title: string }[]; feeds: { id: string; name: string; err: boolean }[]; updated: string }
export const newsView = writable<NewsView>({ list: [], chips: [], filter: 'rel', seenAt: 0, loading: false, total: 0, cal: [], feeds: [], updated: '' });
