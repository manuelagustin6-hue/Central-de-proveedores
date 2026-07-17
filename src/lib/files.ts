import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

const STORAGE_DIR = path.join(process.cwd(), 'storage', 'uploads');

function getKey(): Buffer {
  const hex = process.env.FILE_ENCRYPTION_KEY || '00'.repeat(32);
  return Buffer.from(hex, 'hex');
}

/** Guarda un archivo encriptado en reposo con AES-256-GCM. Devuelve el nombre almacenado. */
export async function saveEncrypted(data: Buffer): Promise<string> {
  await mkdir(STORAGE_DIR, { recursive: true });
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  const storedName = randomBytes(16).toString('hex') + '.bin';
  await writeFile(path.join(STORAGE_DIR, storedName), Buffer.concat([iv, tag, encrypted]));
  return storedName;
}

export async function readEncrypted(storedName: string): Promise<Buffer> {
  if (!/^[a-f0-9]{32}\.bin$/.test(storedName)) throw new Error('Nombre de archivo inválido');
  const raw = await readFile(path.join(STORAGE_DIR, storedName));
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}
