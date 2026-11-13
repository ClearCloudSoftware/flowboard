import { redirect } from 'next/navigation';

/** `/settings/connections`: its first page. */
export default function Page() {
  redirect('/settings/connections/repositories');
}
