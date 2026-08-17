// lib/upload/compress-image.ts
// Fase 8 (hardening), item 3: comprime foto no navegador antes do upload --
// Canvas API nativo, sem dependencia nova. Reduz tipicamente 80-95% do
// tamanho do arquivo (largura maxima + reencode JPEG) sem perda perceptivel
// numa tela. Nunca bloqueia o envio: qualquer falha (formato nao suportado
// pelo navegador, ex. HEIC em algumas configuracoes de iPhone) devolve o
// arquivo original em vez de lancar erro.

const DEFAULT_MAX_WIDTH = 1800;
const DEFAULT_QUALITY = 0.8;

export async function compressImage(
  file: File,
  { maxWidth = DEFAULT_MAX_WIDTH, quality = DEFAULT_QUALITY }: { maxWidth?: number; quality?: number } = {}
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxWidth / bitmap.width);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) return file;

    return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
  } catch {
    return file;
  }
}
