-- 1. Membuat Fungsi Trigger (Trigger Function)
CREATE OR REPLACE FUNCTION trg_update_stock_and_journal()
RETURNS TRIGGER AS $$
DECLARE
    v_current_stock INT;
    v_unit_cost NUMERIC(15, 2);
    v_item_name VARCHAR(100);
BEGIN
    -- Mengambil data stok terkini dan harga pokok barang dari tabel inventory_items
    -- Klausul FOR UPDATE digunakan untuk mengunci baris item guna mencegah race condition
    SELECT stock_qty, unit_cost, item_name
    INTO v_current_stock, v_unit_cost, v_item_name
    FROM inventory_items
    WHERE item_id = NEW.item_id
    FOR UPDATE;




    -- Validasi: Pastikan item terdaftar di master persediaan
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item dengan ID % tidak ditemukan pada master persediaan.', NEW.item_id;
    END IF;




    -- Logika Percabangan Berdasarkan Jenis Transaksi (trx_type)
    IF NEW.trx_type = 'PURCHASE' THEN
        -- Pembelian menambah kuantitas stok barang
        UPDATE inventory_items
        SET stock_qty = stock_qty + NEW.qty
        WHERE item_id = NEW.item_id;




    ELSIF NEW.trx_type = 'SALE' THEN
        -- Validasi Anti-Negative Inventory:
        -- Jika stok tidak mencukupi, lempar eksepsi dan batalkan transaksi secara atomik
        IF (v_current_stock - NEW.qty) < 0 THEN
            RAISE EXCEPTION 'Transaksi SALE dibatalkan! Stok tidak mencukupi untuk item % (%). Stok tersedia: %, Jumlah diminta: %',
                NEW.item_id, v_item_name, v_current_stock, NEW.qty;
        END IF;




        -- Pengurangan kuantitas fisik persediaan
        UPDATE inventory_items
        SET stock_qty = stock_qty - NEW.qty
        WHERE item_id = NEW.item_id;




        /*
           Catatan Integrasi Finansial (HPP & Persediaan):
           Nilai beban pokok (HPP) = NEW.qty * v_unit_cost.
           Di arsitektur terintegrasi, baris jurnal otomatis dapat di-insert ke
           journal_headers dan journal_lines (Debit: HPP, Kredit: Persediaan Barang Dagang).
        */




    ELSIF NEW.trx_type = 'ADJUSTMENT' THEN
        -- Penyesuaian stok fisik (bisa bernilai positif atau negatif)
        IF (v_current_stock + NEW.qty) < 0 THEN
            RAISE EXCEPTION 'Transaksi ADJUSTMENT dibatalkan! Hasil penyesuaian menghasilkan stok negatif (%).',
                (v_current_stock + NEW.qty);
        END IF;




        UPDATE inventory_items
        SET stock_qty = stock_qty + NEW.qty
        WHERE item_id = NEW.item_id;




    ELSE
        RAISE EXCEPTION 'Tipe transaksi % tidak dikenali.', NEW.trx_type;
    END IF;




    RETURN NEW;
END;
$$ LANGUAGE plpgsql;




-- 2. Memasang Trigger pada Tabel inventory_transactions
DROP TRIGGER IF EXISTS trigger_inventory_mutation ON inventory_transactions;




CREATE TRIGGER trigger_inventory_mutation
BEFORE INSERT ON inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION trg_update_stock_and_journal();
