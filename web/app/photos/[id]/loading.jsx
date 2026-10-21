import { PhotoDetailSk } from '../../../components/Skeletons';

// Photo detail is the common case for /photos/[id] (cards link here);
// event-slug walls reuse the same route but are legacy links.
export default function Loading() {
  return <PhotoDetailSk />;
}
