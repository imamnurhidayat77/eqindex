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
  changes_requested: 'We need a change to your artwork',
  proof_sent: 'Proof sent, check your email',
  approved: 'Proof approved, payment opens soon',
  paid: 'Paid',
  in_production: 'In production',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

export const orderStatusLabel = (status) => LABELS[status] || 'Unknown status';

// Index of the current step, or -1 for cancelled/refunded/unknown.
export function orderStepIndex(status) {
  return ORDER_STEPS.findIndex((st) => st.statuses.includes(status));
}
