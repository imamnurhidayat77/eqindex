-- 082: organizer → volunteer commission sharing.
-- Roster: which buyers count as an event's volunteers (grants with an
-- event require roster membership). Ledger provenance: event-scoped grants
-- are marked spend-only (cashable = FALSE) so a future payout feature can
-- refuse to cash out volunteer money. Legacy event-less grants keep
-- cashable = TRUE (their context is unknown).

CREATE TABLE IF NOT EXISTS public.event_volunteers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  note TEXT,
  added_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS event_volunteers_event ON public.event_volunteers (event_id);
CREATE INDEX IF NOT EXISTS event_volunteers_user ON public.event_volunteers (user_id);

ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE SET NULL;
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS cashable BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS wallet_transactions_event ON public.wallet_transactions (event_id);
