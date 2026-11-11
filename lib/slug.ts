/**
 * FD-10 · Slug público da rifa (SPEC §2.8) — chave das URLs `/r/{slug}`.
 *
 * Formato: base derivada do título + sufixo curto aleatório (ex.:
 * "rifa-do-forno-2026-x7k2"). O sufixo vem de fonte criptográfica (mesma
 * exigência do RNF-07: `Math.random` é proibido no servidor). Colisões com o
 * UNIQUE de `rifas.slug` são resolvidas pela Server Action `criarRifa` (FD-10),
 * que regenera o sufixo e grava um slug alternativo — aqui não há estado.
 */
const ALFABETO = "abcdefghijklmnopqrstuvwxyz0123456789";
const TAMANHO_SUFIXO = 4;

/** Base legível do título: minúscula, sem acentos, separada por hífens. */
export function slugBaseDeTitulo(titulo: string): string {
  const base = titulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base === "" ? "rifa" : base;
}

/** Sufixo curto criptográfico (Web Crypto do runtime do servidor). */
export function gerarSufixo(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TAMANHO_SUFIXO));
  let sufixo = "";
  for (const byte of bytes) {
    sufixo += ALFABETO[byte % ALFABETO.length];
  }
  return sufixo;
}

/**
 * Slug completo de tentativa de gravação — pode colidir; a action reconcilia.
 * O sufixo é parâmetro com padrão aleatório: permite composição determinística
 * nos testes de colisão (FD-10) sem duplicar a regra de formato.
 */
export function gerarSlug(titulo: string, sufixo: string = gerarSufixo()): string {
  return `${slugBaseDeTitulo(titulo)}-${sufixo}`;
}
