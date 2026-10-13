import crypto from 'crypto';

export function generateChecksum(
    headerId: string | number, // Diubah menjadi string | number agar kompatibel dengan UUID atau BigInt dari PostgreSQL
    refNo: string,
    lines: Array<{ account_id: number; debit: number | string; credit: number | string }>,
    createdBy: string,
    previousHash: string = '0000000000000000'
): string {
    // 1. Kloning array sebelum di-sort agar tidak memutasi array asli (Mencegah Side-Effect)
    const sortedLinesData = [...lines]
        .sort((a, b) => a.account_id - b.account_id)
        .map((l) => {
            // Pastikan parsing aman, terutama karena node-postgres (pg) 
            // sering mengembalikan tipe kolom DECIMAL/NUMERIC sebagai 'string'.
            const safeDebit = Number(l.debit || 0).toFixed(2);
            const safeCredit = Number(l.credit || 0).toFixed(2);
            return `${l.account_id}:${safeDebit}:${safeCredit}`;
        })
        .join('|');

    // 2. Susun representasi kanonikal (raw payload)
    const rawPayload = `${headerId}|${refNo}|${createdBy}|${sortedLinesData}|${previousHash}`;

    // 3. Hasilkan hash SHA-256
    return crypto.createHash('sha256').update(rawPayload).digest('hex');
}