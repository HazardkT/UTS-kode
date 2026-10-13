// ================= INISIALISASI SUPABASE =================
const SUPABASE_URL = 'https://ubhbknxgxdgmbrvuiyzm.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViaGJrbnhneGRnbWJydnVpeXptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4MjgwMDEsImV4cCI6MjEwNzQwNDAwMX0.VtJQKxFf8fuMu5GhRWqsLtSOQ42jw1lJ23E2TTU48_A';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ================= KONFIGURASI AKUNTANSI =================
const cashAccounts = ["Kas Kecil", "Kas Bank", "Deposito Berjangka", "Surat Berharga Lancar"];
const accountOptions = [
    ...cashAccounts,
    "Beban Operasional",
    "Hutang Usaha",
    "Persediaan",
    "Aset Tetap"
];

// ================= MANAJEMEN STATE =================
let currentUser = null;
let entries = [];
let auditLogs = [];

// ================= SISTEM AUTENTIKASI =================
async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        currentUser = session.user;
        showAppView();
    } else {
        showAuthView();
    }
    
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        if (session) {
            currentUser = session.user;
            showAppView();
        } else {
            currentUser = null;
            showAuthView();
        }
    });
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('login-error');
    const btn = document.getElementById('btn-login');

    btn.disabled = true;
    btn.innerHTML = 'Memproses...';
    errorDiv.classList.add('hidden');

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        errorDiv.innerText = error.message;
        errorDiv.classList.remove('hidden');
    }
    
    btn.disabled = false;
    btn.innerHTML = 'Masuk';
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
}

// ================= PENGENDALI ANTARMUKA (VIEWS) =================
function showAppView() {
    document.getElementById('auth-view').classList.add('hidden');
    document.getElementById('app-view').classList.remove('hidden');
    document.getElementById('user-email-display').innerText = currentUser.email;
    
    if(entries.length === 0) addEntry(); 
    
    // Tarik riwayat audit dari Supabase saat berhasil login
    fetchAuditLogs(); 
    
    renderAll();
}

function showAuthView() {
    document.getElementById('auth-view').classList.remove('hidden');
    document.getElementById('app-view').classList.add('hidden');
}

// ================= LOGIKA FORMULIR JURNAL =================
function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

function addEntry() {
    entries.push({ id: generateId(), account: "", debit: 0, credit: 0 });
    renderAll();
}

function removeEntry(id) {
    if(entries.length > 1) {
        entries = entries.filter(e => e.id !== id);
        renderAll();
    }
}

function updateEntry(id, field, value) {
    const entry = entries.find(e => e.id === id);
    if (entry) {
        if (field === 'debit' || field === 'credit') {
            const numVal = parseFloat(value) || 0;
            entry[field] = numVal;
            
            // Logika membersihkan sisi berlawanan
            if (numVal > 0) {
                const oppositeField = field === 'debit' ? 'credit' : 'debit';
                entry[oppositeField] = 0;
                
                const oppositeInput = document.getElementById(`${oppositeField}-${id}`);
                if (oppositeInput) {
                    oppositeInput.value = '';
                    oppositeInput.classList.remove('bg-blue-50', 'bg-red-50', 'font-semibold');
                }
                
                const currentInput = document.getElementById(`${field}-${id}`);
                if (currentInput) {
                    currentInput.classList.add(field === 'debit' ? 'bg-blue-50' : 'bg-red-50', 'font-semibold');
                }
            } else {
                const currentInput = document.getElementById(`${field}-${id}`);
                if (currentInput) {
                    currentInput.classList.remove('bg-blue-50', 'bg-red-50', 'font-semibold');
                }
            }
        } else {
            entry[field] = value;
        }
        
        // HANYA update sebagian layar, jangan refresh seluruh tabel
        updateFooterTotals();
        renderValidations();
    }
}

// ================= EVALUASI ATURAN PSAK =================
function getValidationState() {
    const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
    const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);
    
    const cashDebit = entries.filter(e => cashAccounts.includes(e.account)).reduce((sum, e) => sum + e.debit, 0);
    const cashCredit = entries.filter(e => cashAccounts.includes(e.account)).reduce((sum, e) => sum + e.credit, 0);

    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
    const hasValues = totalDebit > 0;
    const isNetCashOutflow = cashCredit > cashDebit;
    const allAccountsFilled = entries.every(e => e.account !== "");
    const noZeroRows = entries.every(e => e.debit > 0 || e.credit > 0);

    return {
        totals: { totalDebit, totalCredit },
        rules: {
            balanced: isBalanced && hasValues,
            netOutflow: isNetCashOutflow,
            accountsFilled: allAccountsFilled,
            noZeroRows: noZeroRows && entries.length > 0
        }
    };
}

// ================= MENARIK DATA DARI CLOUD =================
async function fetchAuditLogs() {
    try {
        // Tampilkan teks loading di panel audit
        const container = document.getElementById('audit-logs-container');
        container.innerHTML = `<p class="text-gray-400 italic text-sm text-center animate-pulse">Memuat riwayat dari cloud...</p>`;

        // Ambil 10 aktivitas terakhir dari database Supabase
        const { data, error } = await supabaseClient
            .from('audit_logs')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(10);

        if (error) throw error;

        if (data) {
            // Petakan data dari database ke dalam array lokal aplikasi
            auditLogs = data.map(log => ({
                id: log.id,
                userId: log.user_email,
                action: log.action === 'INSERT_VOUCHER_KAS_KELUAR' 
                            ? `POSTED: ${log.details.voucher_number || 'Voucher'}` 
                            : log.action,
                timestamp: log.timestamp,
                details: { 
                    total: log.details.total_kredit || log.details.total || 0 
                }
            }));
            
            // Tampilkan ke layar
            renderAuditLogs();
        }
    } catch (error) {
        console.error("Gagal menarik data audit:", error);
        document.getElementById('audit-logs-container').innerHTML = 
            `<p class="text-red-400 italic text-sm text-center">Gagal memuat riwayat.</p>`;
    }
}

// ================= RENDERING DOM =================
function renderAll() {
    renderTable();
    renderValidations();
    renderAuditLogs();
}

function renderTable() {
    const tbody = document.getElementById('entries-tbody');
    
    tbody.innerHTML = entries.map(entry => `
        <tr class="hover:bg-gray-50 transition">
            <td class="p-2 border">
                <select onchange="updateEntry('${entry.id}', 'account', this.value)" class="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">-- Pilih Akun --</option>
                    ${accountOptions.map(opt => `<option value="${opt}" ${entry.account === opt ? 'selected' : ''}>${opt}</option>`).join('')}
                </select>
            </td>
            <td class="p-2 border">
                <input type="number" min="0" value="${entry.debit || ''}" placeholder="0" 
                    id="debit-${entry.id}"
                    oninput="updateEntry('${entry.id}', 'debit', this.value)"
                    class="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none ${entry.debit > 0 ? 'bg-blue-50 font-semibold' : ''}">
            </td>
            <td class="p-2 border">
                <input type="number" min="0" value="${entry.credit || ''}" placeholder="0" 
                    id="credit-${entry.id}"
                    oninput="updateEntry('${entry.id}', 'credit', this.value)"
                    class="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none ${entry.credit > 0 ? 'bg-red-50 font-semibold' : ''}">
            </td>
            <td class="p-2 border text-center">
                <button onclick="removeEntry('${entry.id}')" ${entries.length === 1 ? 'disabled' : ''} 
                    class="text-red-500 hover:text-red-700 disabled:text-gray-300 transition p-1">
                    <i data-lucide="trash-2" class="w-5 h-5 mx-auto"></i>
                </button>
            </td>
        </tr>
    `).join('');

    updateFooterTotals();
}

function updateFooterTotals() {
    const state = getValidationState();
    document.getElementById('total-debit-display').innerText = state.totals.totalDebit.toLocaleString('id-ID');
    document.getElementById('total-credit-display').innerText = state.totals.totalCredit.toLocaleString('id-ID');
}

function renderValidations() {
    const state = getValidationState();
    const { balanced, netOutflow, accountsFilled, noZeroRows } = state.rules;
    const isReadyToSubmit = balanced && netOutflow && accountsFilled && noZeroRows;

    const rulesDef = [
        { id: 1, met: balanced, text: "Total Debit & Kredit seimbang (> Rp0)" },
        { id: 2, met: accountsFilled, text: "Semua baris memiliki akun (tidak kosong)" },
        { id: 3, met: noZeroRows, text: "Tidak ada baris bernilai Rp0" },
        { id: 4, met: netOutflow, text: "Arus Kas Neto keluar (Kas Kredit > Kas Debit)" },
    ];

    const ul = document.getElementById('validation-list');
    ul.innerHTML = rulesDef.map(r => `
        <li class="flex items-start space-x-2 text-sm ${r.met ? 'text-green-700' : 'text-gray-500'}">
            ${r.met 
                ? `<i data-lucide="check-circle-2" class="w-5 h-5 text-green-600 shrink-0"></i>` 
                : `<i data-lucide="x-circle" class="w-5 h-5 text-red-400 shrink-0"></i>`}
            <span class="leading-tight pt-0.5">${r.text}</span>
        </li>
    `).join('');

    document.getElementById('btn-submit').disabled = !isReadyToSubmit;
    
    // Wajib panggil ulang render ikon setiap kali panel divalidasi
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderAuditLogs() {
    const container = document.getElementById('audit-logs-container');
    if(auditLogs.length === 0) {
        container.innerHTML = `<p class="text-gray-400 italic text-sm text-center">Belum ada riwayat transaksi.</p>`;
        return;
    }

    container.innerHTML = auditLogs.map(log => `
        <div class="border-l-4 border-blue-500 bg-gray-50 p-3 rounded-r text-sm relative mb-2">
            <div class="font-bold text-gray-700">${log.action}</div>
            <div class="text-xs text-gray-500 mb-1">
                ${new Date(log.timestamp).toLocaleString('id-ID')} | User: ${log.userId}
            </div>
            <div class="text-gray-600 font-mono text-xs p-1 bg-white border rounded">
                Total Keluar: Rp ${log.details.total.toLocaleString('id-ID')}
            </div>
        </div>
    `).join('');
}

// ================= HANDLER SUBMIT KE SUPABASE =================
async function submitVoucher() {
    const state = getValidationState();
    
    if(!currentUser) {
        alert("Sesi habis, silakan login kembali.");
        showAuthView();
        return;
    }

    const btnSubmit = document.getElementById('btn-submit');
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i><span>Menyimpan ke Cloud...</span>';
    if (typeof lucide !== 'undefined') lucide.createIcons();

    try {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const randomCode = Math.floor(1000 + Math.random() * 9000);
        const voucherNumber = `VKK-${dateStr}-${randomCode}`;

        // 1. Simpan Header
        const { data: voucherData, error: voucherError } = await supabaseClient
            .from('vouchers')
            .insert([
                {
                    voucher_number: voucherNumber,
                    total_amount: state.totals.totalCredit,
                    created_by: currentUser.id,
                    status: 'POSTED'
                }
            ])
            .select() 
            .single();

        if (voucherError) throw voucherError;

        const newVoucherId = voucherData.id;

        // 2. Simpan Detail Baris
        const linesData = entries.map(entry => ({
            voucher_id: newVoucherId,
            account_name: entry.account,
            debit: entry.debit,
            credit: entry.credit
        }));

        const { error: linesError } = await supabaseClient
            .from('voucher_lines')
            .insert(linesData);

        if (linesError) throw linesError;

        // 3. Simpan Log Audit Eksternal
        const { error: auditError } = await supabaseClient
            .from('audit_logs')
            .insert([
                {
                    user_email: currentUser.email,
                    action: 'INSERT_VOUCHER_KAS_KELUAR',
                    details: {
                        voucher_id: newVoucherId,
                        voucher_number: voucherNumber,
                        total_kredit: state.totals.totalCredit,
                        jumlah_baris: entries.length,
                        raw_data: [...entries]
                    }
                }
            ]);

        if (auditError) throw auditError;

        alert(`Sukses! Voucher Kas Keluar (${voucherNumber}) berhasil dipublikasi.`);
        
        // Memuat ulang data log audit terbaru dari cloud
        fetchAuditLogs();
        
        entries = [];
        addEntry(); 

    } catch (error) {
        console.error("Gagal menyimpan voucher:", error);
        alert(`Terjadi kesalahan sistem: ${error.message}`);
    } finally {
        btnSubmit.innerHTML = '<i data-lucide="save" class="w-5 h-5"></i><span>Simpan Voucher</span>';
        renderValidations();
    }
}

// ================= PEMUATAN AWAL (BOOTSTRAP) =================
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
});