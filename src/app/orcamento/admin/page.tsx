import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { Quote } from '../types';
import AdminClient from './AdminClient';
import AdminLogin from './AdminLogin';
import { ADMIN_COOKIE, tokenValid } from '@/lib/admin-auth';
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
  const authed = tokenValid(store.get(ADMIN_COOKIE)?.value);

  if (!authed) {
    return <AdminLogin />;
  }

  const quotes = await getQuotes();
  const userName = process.env.ADMIN_NAME ?? 'Catarina';
  return <AdminClient initialQuotes={quotes} userName={userName} />;
}
