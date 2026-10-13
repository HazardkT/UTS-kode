const crypto = require('crypto');

function generateAuditHash(voucherData) {
    // 1. Gabungkan data kritikal menjadi satu string murni
    const rawDataString = `${voucherData.id}|${voucherData.total_debit}|${voucherData.total_credit}|${voucherData.created_by}|${voucherData.created_at}`;
    
    // 2. Tambahkan "Salt" (Kunci rahasia server) agar hash tidak bisa ditebak dari luar
    const secretSalt = process.env.AUDIT_SECRET_KEY; 
    
    // 3. Lakukan proses hashing SHA-256
    const hash = crypto.createHmac('sha256', secretSalt)
                       .update(rawDataString)
                       .digest('hex');
                       
    return hash;
}
