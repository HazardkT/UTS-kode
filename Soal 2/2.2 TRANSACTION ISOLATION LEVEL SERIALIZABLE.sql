-- Mengatur isolasi transaksi pada tingkat serializable
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;




INSERT INTO inventory_transactions (item_id, trx_type, qty)
VALUES ('ITEM-001', 'SALE', 1);




COMMIT;
