// Buyer-facing names for merch order statuses (db CHECK in migration 108).
export const ORDER_STEPS = [
  { id: 'received', label: 'Received', statuses: ['submitted', 'artwork_review', 'changes_requested'] },
  { id: 'proof', label: 'Proof sent', statuses: ['proof_sent'] },
  { id: 'approved', label: 'Approved', statuses: ['approved'] },
  { id: 'paid', label: 'Paid', statuses: ['paid'] },
  { id: 'production', label: 'In production', statuses: ['in_production'] },
  { id: 'shipped', label: 'On its way', statuses: ['shipped'] },
  { id: 'delivered', label: 'Delivered', statuses: ['delivered'] },
];
// Club pickup orders are collected, not shipped.
const PICKUP_STEP_LABELS = { shipped: 'Ready to collect', delivered: 'Collected' };

// The tracker steps for an order, with pickup wording where it applies.
export const orderSteps = (delivery) => ORDER_STEPS.map((st) => (
  delivery === 'pickup' && PICKUP_STEP_LABELS[st.id] ? { ...st, label: PICKUP_STEP_LABELS[st.id] } : st));

// The order is finished: its last step reads as done, not as in progress.
export const orderComplete = (status) => status === 'delivered';

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

// Couriers an admin picks when a courier order ships. `track` is the
// courier's tracking page; {code} is replaced by the tracking number where
// the courier takes it in the link, otherwise the buyer pastes it there.
export const COURIERS = [
  { id: 'nzpost', label: 'NZ Post', track: 'https://www.nzpost.co.nz/tools/tracking?trackid={code}' },
  { id: 'courierpost', label: 'CourierPost', track: 'https://www.nzpost.co.nz/tools/tracking?trackid={code}' },
  { id: 'aramex', label: 'Aramex', track: 'https://www.aramex.co.nz/tools/track?l={code}' },
  { id: 'nzcouriers', label: 'NZ Couriers', track: 'https://www.nzcouriers.co.nz/tracking' },
  { id: 'mainfreight', label: 'Mainfreight', track: 'https://www.mainfreight.com/en-nz/tracking' },
  { id: 'dhl', label: 'DHL Express', track: 'https://www.dhl.com/nz-en/home/tracking.html?tracking-id={code}&submit=1' },
  { id: 'other', label: 'Other courier', track: null },
];
// Tracking numbers: letters, digits, spaces and dashes, 4 to 40 long.
export const TRACKING_RE = /^[A-Za-z0-9][A-Za-z0-9 -]{3,39}$/;

// What the buyer sees for a shipment: courier name, tracking number and a
// tracking link (null when the courier has no page). null without a carrier.
export function shipmentInfo({ carrier, carrierName, tracking } = {}) {
  const c = COURIERS.find((x) => x.id === carrier);
  if (!c) return null;
  const code = tracking ? String(tracking).trim() : '';
  const url = c.track ? c.track.replace('{code}', encodeURIComponent(code.replace(/\s+/g, ''))) : null;
  return {
    courier: c.id === 'other' ? String(carrierName || '').trim() || c.label : c.label,
    tracking: code || null,
    url: url && (code || !c.track.includes('{code}')) ? url : null,
    codeInLink: Boolean(c.track?.includes('{code}')),
  };
}
