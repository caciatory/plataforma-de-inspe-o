import { describe, it, expect, vi, beforeEach } from "vitest";
import { compressImage } from "./compress-image";

function makeFile(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("compressImage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("devolve o arquivo original sem tentar comprimir se não for imagem", async () => {
    const file = makeFile("doc.pdf", "application/pdf", 100);
    const result = await compressImage(file);
    expect(result).toBe(file);
  });

  it("reduz a largura mantendo a proporção e reencoda como JPEG", async () => {
    const originalFile = makeFile("foto.png", "image/png", 5_000_000);
    const fakeBitmap = { width: 4000, height: 3000, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(fakeBitmap));

    let capturedWidth = 0;
    let capturedHeight = 0;
    const fakeCtx = {
      drawImage: vi.fn((_img: unknown, _x: number, _y: number, w: number, h: number) => {
        capturedWidth = w;
        capturedHeight = h;
      }),
    };
    const compressedBlob = new Blob(["fake-jpeg-bytes"], { type: "image/jpeg" });

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(fakeCtx as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (callback: BlobCallback) {
      callback(compressedBlob);
    });

    const result = await compressImage(originalFile, { maxWidth: 1800, quality: 0.8 });

    expect(capturedWidth).toBe(1800);
    expect(capturedHeight).toBe(1350); // mantém a proporção 4:3
    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("foto.jpg");
    expect(result).not.toBe(originalFile);
  });

  it("não amplia uma imagem já menor que o maxWidth", async () => {
    const originalFile = makeFile("foto.jpg", "image/jpeg", 100_000);
    const fakeBitmap = { width: 800, height: 600, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(fakeBitmap));

    let capturedWidth = 0;
    const fakeCtx = {
      drawImage: vi.fn((_img: unknown, _x: number, _y: number, w: number) => {
        capturedWidth = w;
      }),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(fakeCtx as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (callback: BlobCallback) {
      callback(new Blob(["x"], { type: "image/jpeg" }));
    });

    await compressImage(originalFile, { maxWidth: 1800, quality: 0.8 });
    expect(capturedWidth).toBe(800);
  });

  it("devolve o arquivo original se a compressão falhar (ex. formato não suportado pelo navegador)", async () => {
    const file = makeFile("foto.heic", "image/heic", 3_000_000);
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("unsupported")));

    const result = await compressImage(file);
    expect(result).toBe(file);
  });
});
