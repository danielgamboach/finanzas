-- Accounts as cards: a color from a limited palette and the card brand.
alter table public.accounts
  add column if not exists color text,
  add column if not exists brand text check (brand in ('amex','visa','mastercard'));

-- Data fixes applied once (2026-10-17):
-- * the imported AMEX statements belong to card 6039 ("Dorada personal"), not 2029 ("Amex Blue"),
--   which only receives email vouchers; their movements were moved to the 6039 account.
-- * both AMEX accounts marked as brand 'amex'; default colors given to the cards.
