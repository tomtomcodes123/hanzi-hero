import { redirect } from 'next/navigation';

export default function Home() {
  // Redirect to the first chapter by default
  redirect('/chapter/1');
}
