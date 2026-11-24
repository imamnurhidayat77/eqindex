import { notFound } from 'next/navigation';
import { merchProduct } from '../../../lib/merch.mjs';
import MerchDetailClient from './MerchDetailClient';

export async function generateMetadata({ params }) {
  const product = merchProduct(String((await params).productId));
  return { title: product ? `Customise ${product.label}` : 'Product not found' };
}

export default async function MerchDetailPage({ params }) {
  if (!merchProduct(String((await params).productId))) notFound();
  return <MerchDetailClient />;
}
