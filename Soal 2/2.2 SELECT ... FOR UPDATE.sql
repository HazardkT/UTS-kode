-- Dijalankan dalam satu blok transaksi terisolasi
BEGIN;




-- 1. Kunci baris item secara eksplisit agar transaksi lain menunggu
SELECT stock_qty, unit_cost
FROM inventory_items
WHERE item_id = 'ITEM-001'
FOR UPDATE;




-- 2. Masukkan transaksi penjualan (Trigger akan memvalidasi & memotong stok)
INSERT INTO inventory_transactions (item_id, trx_type, qty)
VALUES ('ITEM-001', 'SALE', 1);




-- 3. Simpan perubahan secara permanen dan lepaskan lock
COMMIT;
