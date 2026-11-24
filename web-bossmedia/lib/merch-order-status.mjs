// Buyer-facing names for merch order statuses (db CHECK in migration 108).
export const ORDER_STEPS = [
  { id: 'received', label: 'Received', statuses: ['submitted', 'artwork_review', 'changes_requested'] },
  { id: 'proof', label: 'Proof sent', statuses: ['proof_sent'] },
  { id: 'approved', label: 'Approved', statuses: ['approved'] },
  { id: 'paid', label: 'Paid', statuses: ['paid'] },
  { id: 'production', label: 'In production', statuses: ['in_production'] },
  { id: 'shipped', label: 'On its way', statuses: ['shipped', 'delivered'] },
];

const LABELS = {
  submitted: 'Received, waiting for artwork check',
  artwork_review: 'Artwork being checked',
  changes_requested: 'Changes requested, a new proof is on its way',
  proof_sent: 'Your proof is ready, please check it',
  approved: 'Proof approved, ready to pay',
  paid: 'Paid, going into production',
  in_production: 'In production',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

// Club pickup orders are never shipped: they become ready to collect.
const PICKUP_LABELS = { shipped: 'Ready to collect at your club', delivered: 'Collected' };

export const orderStatusLabel = (status, delivery) =>
  (delivery === 'pickup' && PICKUP_LABELS[status]) || LABELS[status] || 'Unknown status';

// Index of the current step, or -1 for cancelled/refunded/unknown.
export function orderStepIndex(status) {
  return ORDER_STEPS.findIndex((st) => st.statuses.includes(status));
}
