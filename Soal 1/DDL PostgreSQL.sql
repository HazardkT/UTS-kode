-- 1. Tabel Master: Bagan Akun (chart_of_accounts)
CREATE TABLE chart_of_accounts (
    id SERIAL PRIMARY KEY,
    account_code VARCHAR(20) NOT NULL UNIQUE,
    account_name VARCHAR(100) NOT NULL,
    normal_balance VARCHAR(10) NOT NULL,
    classification VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
   
    -- Constraint validasi saldo normal dan klasifikasi laporan
    CONSTRAINT chk_coa_normal_balance CHECK (normal_balance IN ('DEBIT', 'CREDIT')),
    CONSTRAINT chk_coa_classification CHECK (classification IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'))
);




-- 2. Tabel Transaksi: Header Jurnal (journal_headers)
CREATE TABLE journal_headers (
    id BIGSERIAL PRIMARY KEY,
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_number VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    posting_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
   
    -- Constraint siklus status jurnal
    CONSTRAINT chk_header_posting_status CHECK (posting_status IN ('DRAFT', 'POSTED', 'VOID'))
);




-- 3. Tabel Detail: Rincian Baris Jurnal (journal_lines)
CREATE TABLE journal_lines (
    id BIGSERIAL PRIMARY KEY,
    header_id BIGINT NOT NULL,
    account_id INT NOT NULL,
    debit NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    credit NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,




    -- Foreign Key Constraints dengan klausul ON DELETE RESTRICT
    CONSTRAINT fk_lines_header
        FOREIGN KEY (header_id)
        REFERENCES journal_headers(id)
        ON DELETE RESTRICT,




    CONSTRAINT fk_lines_account
        FOREIGN KEY (account_id)
        REFERENCES chart_of_accounts(id)
        ON DELETE RESTRICT,




    -- Constraint 1: Nilai nominal debit dan credit tidak boleh negatif (>= 0)
    CONSTRAINT chk_lines_non_negative_amounts
        CHECK (debit >= 0.00 AND credit >= 0.00),




    -- Constraint 2: Tidak memperbolehkan baris jurnal di mana debit dan kredit bernilai nol secara bersamaan
    CONSTRAINT chk_lines_not_both_zero
        CHECK (NOT (debit = 0.00 AND credit = 0.00))
);




-- Indeks performa untuk kueri pelaporan buku besar dan rekonsiliasi
CREATE INDEX idx_journal_lines_header ON journal_lines(header_id);
CREATE INDEX idx_journal_lines_account ON journal_lines(account_id);
