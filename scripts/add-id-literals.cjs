// Indonesian literals for the provider detail page — plain, natural wording.
// Usage: node scripts/add-id-literals.cjs
const fs = require("node:fs");
const path = require("node:path");

const FILE = path.join(process.cwd(), "public", "i18n", "literals", "id.json");

const additions = {
  // Header
  "Back to Providers": "Kembali ke Provider",
  "Sign up / Learn more": "Daftar / Pelajari",
  "Get API Key": "Ambil API Key",

  // Connections panel
  Connections: "Koneksi",
  account: "akun",
  accounts: "akun",
  "Test all": "Uji Semua",
  "Apply Proxy": "Pasang Proxy",
  "Delete Selected": "Hapus yang Dipilih",
  "Remove invalid": "Hapus yang rusak",
  invalid: "rusak",
  Sticky: "Sticky",
  "Select all": "Pilih semua",
  "Pick how you want to connect": "Pilih cara konek:",
  or: "atau",
  "Add Connection": "Tambah Koneksi",
  "No connections yet": "Belum ada koneksi",

  // One-by-one test summary
  Total: "Total",
  Passed: "Lulus",
  Failed: "Gagal",
  Stopped: "Dihentikan",
  Testing: "Menguji",
};

const raw = fs.readFileSync(FILE, "utf8");
const map = JSON.parse(raw);

let added = 0;
let updated = 0;
for (const [key, value] of Object.entries(additions)) {
  if (!(key in map)) added++;
  else if (map[key] !== value) updated++;
  map[key] = value;
}

fs.writeFileSync(FILE, JSON.stringify(map, null, 2) + "\n", "utf8");
console.log(
  `id.json: ${added} key baru, ${updated} diperbarui, total ${Object.keys(map).length}`
);
