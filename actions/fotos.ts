"use server";

/** PB-5 · Upload autenticado da foto do prêmio (SPEC §2.2/§4.12 · RF-17). */
import { randomUUID } from "node:crypto";

import { EnviarFotoInputSchema } from "@/lib/schemas";
import { detectarTipoImagemPremio } from "@/lib/imagem";
import { criarClienteAdministrador, criarClienteServidor } from "@/lib/supabase/server";

export type EstadoFoto =
  | { ok: true; mensagem: string; imagemUrl: string }
  | { ok: false; mensagem: string };

const RECUSA_FOTO_INVALIDA = "O arquivo não parece ser uma foto JPG, PNG ou WEBP válida.";
const FALHA_UPLOAD = "Não foi possível enviar a foto agora. Tente novamente em instantes.";

export async function enviarFoto(formData: FormData): Promise<EstadoFoto> {
  const entrada = EnviarFotoInputSchema.safeParse({ arquivo: formData.get("arquivo") });
  if (!entrada.success) {
    return {
      ok: false,
      mensagem: entrada.error.issues[0]?.message ?? "Selecione uma foto do prêmio.",
    };
  }

  const sessao = await criarClienteServidor();
  const { data: usuario, error: erroSessao } = await sessao.auth.getUser();
  if (erroSessao || !usuario.user) {
    return { ok: false, mensagem: "Sua sessão expirou. Entre novamente para enviar a foto." };
  }

  const arquivo = entrada.data.arquivo;
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await arquivo.arrayBuffer());
  } catch {
    return { ok: false, mensagem: FALHA_UPLOAD };
  }

  const tipo = detectarTipoImagemPremio(bytes);
  if (!tipo) return { ok: false, mensagem: RECUSA_FOTO_INVALIDA };

  const extensao = tipo === "image/jpeg" ? "jpg" : tipo === "image/png" ? "png" : "webp";
  const caminho = `${usuario.user.id}/${randomUUID()}.${extensao}`;

  try {
    const storage = criarClienteAdministrador().storage.from("premios");
    const { error } = await storage.upload(caminho, arquivo, {
      contentType: tipo,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) return { ok: false, mensagem: FALHA_UPLOAD };

    const { data } = storage.getPublicUrl(caminho);
    return { ok: true, mensagem: "Foto enviada com sucesso.", imagemUrl: data.publicUrl };
  } catch {
    return { ok: false, mensagem: FALHA_UPLOAD };
  }
}
