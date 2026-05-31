import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { Quote } from '../types';
import AdminClient from './AdminClient';
import AdminLogin from './AdminLogin';
import { ADMIN_COOKIE, ADMIN_NAME_COOKIE, readSession } from '@/lib/admin-auth';
import { listQuotes } from '@/lib/quotes-store';

export const metadata: Metadata = { title: 'Admin — Líquen Events' };

async function getQuotes(): Promise<Quote[]> {
  try {
    return await listQuotes();
  } catch {
    return [];
  }
}

export default async function AdminPage() {
  const store = await cookies();
  const session = readSession(store.get(ADMIN_COOKIE)?.value);

  if (!session) {
    return <AdminLogin />;
  }

  const quotes = await getQuotes();
  // Trust the signed session name first; fall back to the display cookie.
  const userName = session.name || store.get(ADMIN_NAME_COOKIE)?.value || process.env.ADMIN_NAME || 'Equipa';
  return <AdminClient initialQuotes={quotes} userName={userName} />;
}
