import { LOCALE_COOKIE, normalizeLocale } from "@/i18n/config";

export function getRequestLocale(request) {
  const explicitLocale = request.headers.get("x-locale");
  if (explicitLocale) return normalizeLocale(explicitLocale) === "en" ? "en" : "id";
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (cookieLocale) return normalizeLocale(cookieLocale) === "en" ? "en" : "id";

  const headerLocale = request.headers.get("accept-language") || "";
  return headerLocale.toLowerCase().startsWith("en") ? "en" : "id";
}

export function localizedAuthMessage(locale, key) {
  const messages = {
    id: {
      tunnelDisabled: "Akses dashboard lewat tunnel sedang dimatikan.",
      passwordDisabledSaml: "Login dengan password dimatikan. Gunakan SAML SSO untuk masuk.",
      passwordDisabledOidc: "Login dengan password dimatikan. Gunakan OIDC untuk masuk.",
      defaultPasswordRemote: "Password bawaan harus diganti sebelum akses dari luar jaringan.",
      invalidPassword: "Password yang kamu masukkan salah.",
      currentPasswordRequired: "Masukkan password saat ini terlebih dahulu.",
      invalidCurrentPassword: "Password saat ini tidak cocok.",
      invalidLocale: "Bahasa yang dipilih tidak tersedia.",
      localeFailed: "Bahasa belum bisa diubah. Coba lagi.",
      serverError: "Terjadi kendala di server. Coba lagi sebentar.",
    },
    en: {
      tunnelDisabled: "Dashboard access through the tunnel is turned off.",
      passwordDisabledSaml: "Password sign-in is disabled. Use SAML SSO instead.",
      passwordDisabledOidc: "Password sign-in is disabled. Use OIDC instead.",
      defaultPasswordRemote: "You need to change the default password before signing in remotely.",
      invalidPassword: "That password is not correct.",
      currentPasswordRequired: "Enter your current password first.",
      invalidCurrentPassword: "Your current password is not correct.",
      invalidLocale: "That language is not available.",
      localeFailed: "We could not change the language. Please try again.",
      serverError: "Something went wrong on the server. Please try again.",
    },
  };

  return messages[locale]?.[key] || messages.id[key];
}

export function localizedProviderMessage(locale, key) {
  const messages = {
    id: {
      connectionProxyRequired: "Isi URL proxy koneksi dulu kalau proxy diaktifkan.",
      proxyPoolNotFound: "Proxy pool yang dipilih tidak ditemukan.",
      invalidProvider: "Provider yang dipilih tidak valid.",
      apiKeyRequired: "API key wajib diisi.",
      cookieRequired: "Nilai cookie wajib diisi.",
      nameRequired: "Nama wajib diisi.",
      providerNodeNotFound: "Node provider tidak ditemukan.",
      failedFetchProviders: "Daftar provider belum bisa dimuat. Coba lagi.",
      failedCreateProvider: "Provider belum berhasil dibuat. Coba lagi.",
      failedFetchNodes: "Daftar node provider belum bisa dimuat. Coba lagi.",
      failedCreateNode: "Node provider belum berhasil dibuat. Coba lagi.",
      invalidNodeType: "Jenis node provider tidak valid.",
      valid: "Valid",
      invalid: "Tidak valid",
      baseUrlApiKeyRequired: "Base URL dan API key wajib diisi.",
      invalidUrl: "Format URL belum benar.",
      urlNotAllowed: "URL ini tidak bisa digunakan.",
      unauthorized: "API key tidak diterima provider.",
      networkError: "Koneksi jaringan bermasalah. Coba cek URL dan jaringan.",
      requestTimeout: "Provider terlalu lama merespons. Coba lagi.",
      connectionNotFound: "Koneksi tidak ditemukan.",
      failedFetchConnection: "Koneksi belum bisa dimuat. Coba lagi.",
      failedUpdateConnection: "Koneksi belum berhasil diperbarui. Coba lagi.",
      failedDeleteConnection: "Koneksi belum berhasil dihapus. Coba lagi.",
      connectionDeleted: "Koneksi berhasil dihapus.",
      failedUpdateNode: "Node provider belum berhasil diperbarui. Coba lagi.",
      failedDeleteNode: "Node provider belum berhasil dihapus. Coba lagi.",
      prefixRequired: "Prefix wajib diisi.",
      apiTypeInvalid: "Jenis API OpenAI compatible tidak valid.",
      baseUrlRequired: "Base URL wajib diisi.",
      failedFetchOverrides: "Header kustom belum bisa dimuat. Coba lagi.",
      failedSaveOverrides: "Header kustom belum berhasil disimpan. Coba lagi.",
      headersMustObject: "Header harus berbentuk objek.",
      tooManyHeaders: "Jumlah header terlalu banyak (maksimal {max}).",
      invalidHeaderName: "Nama header tidak valid: {name}",
      invalidHeaderValue: "Nilai header tidak valid: {name}",
      headerValueTooLong: "Nilai header {name} terlalu panjang (maksimal {max}).",
      headerCannotOverride: "Header {name} tidak dapat ditimpa.",
    },
    en: {
      connectionProxyRequired: "Add a proxy URL when connection proxy is enabled.",
      proxyPoolNotFound: "The selected proxy pool was not found.",
      invalidProvider: "That provider is not valid.",
      apiKeyRequired: "An API key is required.",
      cookieRequired: "A cookie value is required.",
      nameRequired: "A name is required.",
      providerNodeNotFound: "The provider node was not found.",
      failedFetchProviders: "We could not load the providers. Please try again.",
      failedCreateProvider: "We could not create the provider. Please try again.",
      failedFetchNodes: "We could not load provider nodes. Please try again.",
      failedCreateNode: "We could not create the provider node. Please try again.",
      invalidNodeType: "That provider node type is not valid.",
      valid: "Valid",
      invalid: "Invalid",
      baseUrlApiKeyRequired: "Base URL and API key are required.",
      invalidUrl: "That URL format is not valid.",
      urlNotAllowed: "This URL cannot be used.",
      unauthorized: "The provider did not accept the API key.",
      networkError: "There is a network problem. Check the URL and try again.",
      requestTimeout: "The provider took too long to respond. Please try again.",
      connectionNotFound: "The connection was not found.",
      failedFetchConnection: "We could not load the connection. Please try again.",
      failedUpdateConnection: "We could not update the connection. Please try again.",
      failedDeleteConnection: "We could not delete the connection. Please try again.",
      connectionDeleted: "The connection was deleted.",
      failedUpdateNode: "We could not update the provider node. Please try again.",
      failedDeleteNode: "We could not delete the provider node. Please try again.",
      prefixRequired: "A prefix is required.",
      apiTypeInvalid: "That OpenAI compatible API type is not valid.",
      baseUrlRequired: "A base URL is required.",
      failedFetchOverrides: "We could not load custom headers. Please try again.",
      failedSaveOverrides: "We could not save custom headers. Please try again.",
      headersMustObject: "Headers must be an object.",
      tooManyHeaders: "Too many headers (maximum {max}).",
      invalidHeaderName: "Invalid header name: {name}",
      invalidHeaderValue: "Invalid header value: {name}",
      headerValueTooLong: "Header {name} value is too long (maximum {max}).",
      headerCannotOverride: "Header {name} cannot be overridden.",
    },
  };

  return messages[locale]?.[key] || messages.id[key] || key;
}

export function formatProviderMessage(locale, key, values = {}) {
  let message = localizedProviderMessage(locale, key);
  for (const [name, value] of Object.entries(values)) message = message.replaceAll(`{${name}}`, String(value));
  return message;
}

export function localizedComboMessage(locale, key) {
  const messages = {
    id: {
      failedFetch: "Daftar combo belum bisa dimuat. Coba lagi.",
      failedCreate: "Combo belum berhasil dibuat. Coba lagi.",
      failedUpdate: "Combo belum berhasil diperbarui. Coba lagi.",
      failedDelete: "Combo belum berhasil dihapus. Coba lagi.",
      notFound: "Combo tidak ditemukan.",
      nameRequired: "Nama combo wajib diisi.",
      invalidName: "Nama hanya boleh berisi huruf, angka, -, _ dan .",
      nameExists: "Nama combo sudah digunakan.",
      invalidSource: "Sumber harus 'cursor' atau 'claude'.",
      failedPreview: "Preview combo preset belum bisa dibuat. Coba lagi.",
      failedPresets: "Combo preset belum berhasil dibuat. Coba lagi.",
    },
    en: {
      failedFetch: "We could not load combos. Please try again.",
      failedCreate: "We could not create the combo. Please try again.",
      failedUpdate: "We could not update the combo. Please try again.",
      failedDelete: "We could not delete the combo. Please try again.",
      notFound: "The combo was not found.",
      nameRequired: "A combo name is required.",
      invalidName: "Names may only contain letters, numbers, -, _ and .",
      nameExists: "That combo name is already in use.",
      invalidSource: "Source must be 'cursor' or 'claude'.",
      failedPreview: "We could not preview combo presets. Please try again.",
      failedPresets: "We could not create combo presets. Please try again.",
    },
  };
  return messages[locale]?.[key] || messages.en[key] || key;
}
