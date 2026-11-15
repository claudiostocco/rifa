/**
 * PB-5 · Imagens de prêmio — SPEC §4.12/RF-17.
 * Teste 1: redimensiona e comprime no browser para WEBP.
 * Teste 2: identifica formatos por assinatura e rejeita conteúdo falso.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { comprimirImagemPremio, detectarTipoImagemPremio } from "@/lib/imagem";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PB-5 · processamento client de foto", () => {
  it("deve redimensionar a foto e produzir um arquivo WEBP comprimido", async () => {
    const fecharBitmap = vi.fn();
    const desenharImagem = vi.fn();
    const bitmap = { width: 3200, height: 1600, close: fecharBitmap };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: desenharImagem,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      callback(new Blob(["imagem webp comprimida"], { type: "image/webp" }));
    });

    const arquivo = await comprimirImagemPremio(
      new File(["foto original"], "premio.jpg", { type: "image/jpeg" }),
    );

    expect(arquivo.name).toBe("premio.webp");
    expect(arquivo.type).toBe("image/webp");
    expect(arquivo.size).toBeLessThan(300 * 1024);
    expect(desenharImagem).toHaveBeenCalledWith(bitmap, 0, 0, 1600, 800);
    expect(fecharBitmap).toHaveBeenCalledOnce();
  });

  it("deve reconhecer JPG, PNG e WEBP pelos bytes e rejeitar extensão/MIME falsos", () => {
    expect(detectarTipoImagemPremio(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toBe(
      "image/jpeg",
    );
    expect(
      detectarTipoImagemPremio(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe("image/png");

    const webp = new Uint8Array(12);
    webp.set(new TextEncoder().encode("RIFF"), 0);
    webp.set(new TextEncoder().encode("WEBP"), 8);
    expect(detectarTipoImagemPremio(webp)).toBe("image/webp");
    expect(detectarTipoImagemPremio(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
  });
});
