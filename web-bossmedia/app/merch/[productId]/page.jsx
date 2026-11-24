import { notFound } from 'next/navigation';
import { loadMerchCatalog } from '../../../lib/merch-catalog';
import { merchProduct } from '../../../lib/merch.mjs';
import MerchDetailClient from './MerchDetailClient';

async function activeProduct(params) {
  await loadMerchCatalog();
  const product = merchProduct(String((await params).productId));
  return product?.status === 'active' ? product : null;
}

export async function generateMetadata({ params }) {
  const product = await activeProduct(params);
  return { title: product ? `Customise ${product.label}` : 'Product not found' };
}

export default async function MerchDetailPage({ params }) {
  if (!(await activeProduct(params))) notFound();
  return <MerchDetailClient />;
}
