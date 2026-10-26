import { redirect } from 'next/navigation';

// The media library and uploads live in Boss Media studio now.
export default function AdminMediaRedirect() {
  redirect('/admin');
}
