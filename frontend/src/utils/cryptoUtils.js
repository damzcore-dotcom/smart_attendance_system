/**
 * Utility for client-side encryption and decryption using native Web Crypto API (AES-GCM).
 */

const getCryptoKey = async (secret) => {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("salt-smart-attendance-pro"),
      iterations: 1000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

export const encryptData = async (text, secret) => {
  try {
    const enc = new TextEncoder();
    const key = await getCryptoKey(secret);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      enc.encode(text)
    );
    
    // Convert to hex for safe string storage
    const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
    const ciphertextBytes = new Uint8Array(encrypted);
    const ciphertextHex = Array.from(ciphertextBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${ivHex}:${ciphertextHex}`;
  } catch (err) {
    console.error('[Crypto] Encryption failed:', err);
    throw err;
  }
};

export const decryptData = async (encryptedStr, secret) => {
  try {
    const parts = encryptedStr.split(":");
    if (parts.length !== 2) throw new Error("Invalid encrypted format");
    
    const iv = new Uint8Array(parts[0].match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const ciphertext = new Uint8Array(parts[1].match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    
    const key = await getCryptoKey(secret);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
    
    const dec = new TextDecoder();
    return dec.decode(decrypted);
  } catch (err) {
    console.error('[Crypto] Decryption failed:', err);
    throw err;
  }
};
