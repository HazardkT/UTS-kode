-- 1. Trigger Function untuk Mencegah Modifikasi/Penghapusan Transaksi POSTED
CREATE OR REPLACE FUNCTION trg_enforce_posted_immutability() 
RETURNS TRIGGER AS $$
BEGIN
    -- Cek jika status data lama adalah 'POSTED'
    IF OLD.posting_status = 'POSTED' THEN
        RAISE EXCEPTION 'Pelanggaran Integritas Audit: Transaksi dengan status POSTED (ID: %) terkunci secara permanen dan tidak boleh dimodifikasi (UPDATE/DELETE)!', OLD.id;
    END IF;

    -- Mengembalikan nilai yang sesuai berdasarkan jenis operasi
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 2. Pasang Trigger pada journal_headers
CREATE TRIGGER check_header_immutability
    BEFORE UPDATE OR DELETE 
    ON journal_headers
    FOR EACH ROW
    EXECUTE FUNCTION trg_enforce_posted_immutability();


-- 3. Proteksi pada journal_lines agar baris rincian tidak bisa diubah jika headernya POSTED
CREATE OR REPLACE FUNCTION trg_enforce_lines_immutability() 
RETURNS TRIGGER AS $$
DECLARE 
    v_status VARCHAR(20);
BEGIN
    -- Ambil status dari header terkait
    SELECT posting_status INTO v_status 
    FROM journal_headers 
    WHERE id = OLD.header_id;

    -- Cegah perubahan jika header sudah POSTED
    IF v_status = 'POSTED' THEN
        RAISE EXCEPTION 'Pelanggaran Audit Trail: Baris rincian jurnal pada transaksi POSTED (Header ID: %) tidak dapat dimodifikasi atau dihapus!', OLD.header_id;
    END IF;

    -- Mengembalikan nilai yang sesuai berdasarkan jenis operasi
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 4. Pasang Trigger pada journal_lines
CREATE TRIGGER check_lines_immutability
    BEFORE UPDATE OR DELETE 
    ON journal_lines
    FOR EACH ROW
    EXECUTE FUNCTION trg_enforce_lines_immutability();