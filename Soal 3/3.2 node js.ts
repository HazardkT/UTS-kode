import { Request, Response } from 'express';
import { Pool } from 'pg';
import crypto from 'crypto';

const db = new Pool({ /* konfigurasi database */ });

// (Fungsi dummy asusmsi untuk generate checksum)
const generateChecksum = (id: string, ref: string, lines: any[], user: string) => {
    return crypto.randomBytes(16).toString('hex');
};

// 1. Endpoint Membuat Jurnal Pembalik (Storno / Reversal)
export async function reversePostedJournal(req: Request, res: Response): Promise<void> {
    const { headerId } = req.params;
    const userId = req.user?.id || 'USR-SYSTEM'; // Didapat dari JWT session

    const client = await db.connect();

    try {
        await client.query('BEGIN');

        // 1. Ambil header transaksi yang akan dibalik
        const headerRes = await client.query(
            `SELECT * FROM journal_headers WHERE id = $1 FOR UPDATE`,
            [headerId]
        );

        if (headerRes.rowCount === 0) {
            throw new Error('Transaksi tidak ditemukan.');
        }

        // PERBAIKAN: Ambil baris pertama dari array rows
        const originalHeader = headerRes.rows[0];

        if (originalHeader.posting_status !== 'POSTED') {
            throw new Error('Hanya transaksi berstatus POSTED yang dapat diproses jurnal pembalik.');
        }

        // TAMBAHAN: Validasi agar tidak terjadi double-storno pada jurnal yang sama
        const checkReversal = await client.query(
            `SELECT id FROM journal_headers WHERE reversal_of_id = $1`,
            [originalHeader.id]
        );
        if (checkReversal.rowCount > 0) {
            throw new Error('Transaksi ini sudah pernah dibalik (storno) sebelumnya.');
        }

        // 2. Ambil baris jurnal asli
        const linesRes = await client.query(
            `SELECT * FROM journal_lines WHERE header_id = $1`,
            [headerId]
        );

        const reversalRefNo = `REV-${originalHeader.reference_number}`;

        // 3. Buat Header Jurnal Pembalik Baru (Status langsung POSTED, tanpa hash sementara)
        const newHeaderRes = await client.query(
            `INSERT INTO journal_headers 
            (transaction_date, reference_number, description, posting_status, created_by, reversal_of_id) 
            VALUES (CURRENT_DATE, $1, $2, 'POSTED', $3, $4) 
            RETURNING id, transaction_date`,
            [
                reversalRefNo,
                `Jurnal Pembalik (Storno) atas transaksi ${originalHeader.reference_number}`,
                userId,
                originalHeader.id
            ]
        );

        // PERBAIKAN: Ambil id dari baris pertama
        const newHeaderId = newHeaderRes.rows[0].id;
        const reversedLines = [];

        // 4. Masukkan baris baru dengan membalik posisi DEBIT dan KREDIT
        for (const line of linesRes.rows) {
            await client.query(
                `INSERT INTO journal_lines (header_id, account_id, debit, credit) 
                VALUES ($1, $2, $3, $4)`,
                [newHeaderId, line.account_id, line.credit, line.debit] // Debit dan Kredit dibalik posisinya
            );

            // Simpan baris yang posisinya sudah dibalik untuk di-hash
            reversedLines.push({
                account_id: line.account_id,
                debit: line.credit,
                credit: line.debit
            });
        }

        // 5. Hitung dan simpan hash_checksum untuk voucher baru
        // PERBAIKAN: Gunakan reversedLines agar hash dihitung berdasarkan posisi nilai yang baru
        const checksum = generateChecksum(newHeaderId, reversalRefNo, reversedLines, userId);
        
        await client.query(
            `UPDATE journal_headers SET hash_checksum = $1 WHERE id = $2`,
            [checksum, newHeaderId]
        );

        /* 
         * PENGHAPUSAN KODE: 
         * await client.query(`UPDATE journal_headers SET posting_status = 'VOID' WHERE id = $1`, [originalHeader.id]);
         * 
         * ALASAN: Kode di atas telah dihapus karena akan MEMICU ERROR dari Trigger `trg_enforce_posted_immutability`.
         * Dalam prinsip Akuntansi dengan Audit Trail yang ketat, dokumen asli tetap ter-record apa adanya.
         * Netralisir angka dilakukan murni oleh dokumen Storno yang merujuk via `reversal_of_id`.
         */

        await client.query('COMMIT');

        res.status(201).json({
            success: true,
            message: 'Jurnal pembalik (storno) berhasil dibuat.',
            reversal_header_id: newHeaderId,
            reversal_reference: reversalRefNo,
        });

    } catch (error: any) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
}