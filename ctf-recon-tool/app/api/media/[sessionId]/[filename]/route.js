import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request, { params }) {
  const { sessionId, filename } = params;
  const filePath = path.join(process.cwd(), 'data', 'sessions', sessionId, 'screenshots', filename);

  if (!fs.existsSync(filePath)) {
    return new NextResponse('File not found', { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  const ext = path.extname(filename).toLowerCase();
  
  let contentType = 'application/octet-stream';
  if (ext === '.png') contentType = 'image/png';
  else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
  else if (ext === '.gif') contentType = 'image/gif';
  else if (ext === '.webp') contentType = 'image/webp';

  return new NextResponse(fileBuffer, {
    headers: { 'Content-Type': contentType }
  });
}
