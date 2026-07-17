import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { decryptFile } from '@/lib/files';

/**
 * Descarga de documentos (desencriptados al vuelo).
 * Acceso: usuario interno con sesión, o proveedor con su token único (?token=...).
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const doc = await db.document.findUnique({
    where: { id: params.id },
    include: { supplier: { select: { accessToken: true } } },
  });
  if (!doc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const session = getSession();
  const token = req.nextUrl.searchParams.get('token');
  const authorized = !!session || (!!token && token === doc.supplier.accessToken);
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  try {
    const data = decryptFile(Buffer.from(doc.data));
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': doc.mimeType,
        'Content-Disposition': `attachment; filename="${doc.filename.replace(/[^\w.\- ]/g, '_')}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Error al leer el archivo' }, { status: 500 });
  }
}
