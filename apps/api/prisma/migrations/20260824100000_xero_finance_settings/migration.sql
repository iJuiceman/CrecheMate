-- Xero export configuration for the finance module: revenue account code and
-- AU tax type stamped on exported sales lines, plus the invoice-number prefix.
ALTER TABLE "facility_settings"
  ADD COLUMN "xero_account_code" TEXT NOT NULL DEFAULT '200',
  ADD COLUMN "xero_tax_type" TEXT NOT NULL DEFAULT 'GST Free Income',
  ADD COLUMN "xero_invoice_prefix" TEXT NOT NULL DEFAULT 'CM';
