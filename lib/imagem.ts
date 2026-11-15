/** MIME obtido dos bytes reais do arquivo — o nome e o MIME do browser não são confiáveis. */
export type TipoImagemPremio = "image/jpeg" | "image/png" | "image/webp";

const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export function detectarTipoImagemPremio(bytes: Uint8Array): TipoImagemPremio | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (ASSINATURA_PNG.every((byte, indice) => bytes[indice] === byte)) {
    return "image/png";
  }

  const eWebp =
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";

  return eWebp ? "image/webp" : null;
}

/**
 * Redimensiona e comprime no browser antes do envio (SPEC §4.12).
 * WebP costuma reduzir a foto para perto de 300 KB; a action mantém o limite
 * obrigatório de 5 MB como última barreira, sem depender do cliente.
 */
export async function comprimirImagemPremio(arquivo: File): Promise<File> {
  const bitmap = await createImageBitmap(arquivo);

  try {
    const maiorLado = Math.max(bitmap.width, bitmap.height);
    if (maiorLado <= 0) throw new Error("Não foi possível ler as dimensões da foto.");

    const escala = Math.min(1, 1600 / maiorLado);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * escala));
    canvas.height = Math.max(1, Math.round(bitmap.height * escala));

    const contexto = canvas.getContext("2d");
    if (!contexto) throw new Error("Não foi possível preparar a foto para envio.");
    contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    let comprimida: Blob | null = null;
    for (const qualidade of [0.82, 0.68, 0.54]) {
      comprimida = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", qualidade),
      );
      if (!comprimida) throw new Error("Este navegador não conseguiu comprimir a foto.");
      if (comprimida.size <= 300 * 1024) break;
    }

    const blobFinal = comprimida;
    if (!blobFinal) throw new Error("Este navegador não conseguiu comprimir a foto.");

    const nome = arquivo.name.replace(/\.[^.]+$/u, "") || "premio";
    return new File([blobFinal], `${nome}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}
