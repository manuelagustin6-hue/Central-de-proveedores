import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// Encriptación de documentos en reposo (AES-256-GCM). El contenido cifrado se
// guarda en la base de datos, por lo que funciona en hosting serverless
// (Vercel) sin sistema de archivos persistente.

// Vercel limita el cuerpo de la petición a ~4.5 MB
export const MAX_FILE_SIZE = 4 * 1024 * 1024;
export const MAX_FILE_MSG = 'El archivo supera los 4 MB';

function getKey(): Buffer {
  const hex = process.env.FILE_ENCRYPTION_KEY || '00'.repeat(32);
  return Buffer.from(hex, 'hex');
}

/** Devuelve iv(12) + authTag(16) + ciphertext, listo para persistir. */
export function encryptFile(data: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}

export function decryptFile(stored: Buffer): Buffer {
  const iv = stored.subarray(0, 12);
  const tag = stored.subarray(12, 28);
  const encrypted = stored.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}
