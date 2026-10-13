// Contoh logic retry di layer Backend Service
async function processSaleWithRetry(itemId: string, qty: number, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
     
      await client.query(
        'INSERT INTO inventory_transactions (item_id, trx_type, qty) VALUES (\$1, \$2, \$3)',
        [itemId, 'SALE', qty]
      );
     
      await client.query('COMMIT');
      return { success: true, message: 'Transaksi berhasil dibukukan.' };
    } catch (error: any) {
      await client.query('ROLLBACK');
     
      // Jika terjadi serialization failure (error code 40001), lakukan percobaan ulang
      if (error.code === '40001' && attempt < maxRetries) {
        console.warn(`Race condition terdeteksi. Mencoba kembali (percobaan ke-${attempt + 1})...`);
        continue;
      }
      throw error; // Lempar galat jika stok habis atau batas retry terlampaui
    } finally {
      client.release();
    }
  }
}
