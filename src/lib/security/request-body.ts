export class RequestBodyError extends Error {
  constructor(public readonly status: number, message: string) {

    super(message);
  }
}

export async function readBoundedJson(request: Request, maxBytes = 32 * 1024): Promise<unknown> {

  const declaredLength = request.headers.get('content-length');
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBytes)) {
    throw new RequestBodyError(413, 'PAYLOAD_TOO_LARGE');
  }

  const reader = request.body?.getReader();
  if (!reader) {
    throw new RequestBodyError(400, 'INVALID_JSON');
  }

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;

      byteLength += result.value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel();
        throw new RequestBodyError(413, 'PAYLOAD_TOO_LARGE');
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RequestBodyError(400, 'INVALID_JSON');
  }
}
