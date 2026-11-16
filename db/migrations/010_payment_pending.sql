-- Payments wait as pending while the family completes the gateway checkout.
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'pending';
