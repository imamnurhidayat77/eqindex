import { redirect } from 'next/navigation';

// Uploads happen in Boss Media studio now.
export default function AdminMediaUploadRedirect() {
  redirect('/admin');
}
