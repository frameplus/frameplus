ALTER TABLE tax_invoices ADD COLUMN type TEXT DEFAULT '매출';
ALTER TABLE tax_invoices ADD COLUMN memo TEXT DEFAULT '';
ALTER TABLE tax_invoices ADD COLUMN vendor_nm TEXT DEFAULT '';
ALTER TABLE tax_invoices ADD COLUMN vendor_biz TEXT DEFAULT '';
