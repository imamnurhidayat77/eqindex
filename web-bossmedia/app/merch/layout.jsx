import MerchCatalog from '../../components/MerchCatalog';
import { loadMerchCatalog } from '../../lib/merch-catalog';

export const metadata = {
  title: 'Merchandise',
  description: 'Club jackets, polos, caps and horse gear with your club and sponsor logos, placed in 3D.',
};

export default async function MerchLayout({ children }) {
  return <MerchCatalog data={await loadMerchCatalog()}>{children}</MerchCatalog>;
}
