/**
 * VT-8 · Regras de busca e filtro da grade da T3 (SPEC §3.4.3 · §4.7 · RF-07):
 * função PURA — a busca nunca decide o que gravar, só o que EXIBIR (a
 * conferência de estado é sempre do servidor, §2.7).
 *
 * Uma única caixa atende os três mecanismos prescritos:
 *   - dígitos puros → número EXATO (destaca a pastilha) OU telefone parcial
 *     (revela os números daquela pessoa);
 *   - texto livre → nome do comprador (case/acentos ignorados);
 *   - filtro por estado → Todos/Disponíveis/Vendidos (combinado com a busca).
 */
import type { StatusNumero } from "@/lib/estados";

export type FiltroEstado = "todos" | "disponiveis" | "vendidos";

export type PastilhaBusca = { numero: number; status: StatusNumero };

/** Somente o necessário para casar nome/telefone (nunca id — não é exibição). */
export type VendaBusca = { nome: string; telefone: string };

export type ResultadoBusca = {
  /** Pastilhas que passam busca + filtro, na ordem recebida. */
  visiveis: PastilhaBusca[];
  /** Número exato a destacar em anel (null quando a busca não o encontra). */
  destaque: number | null;
};

/** Minúsculas sem acento: "João" casa com "joao", "Maria" com "maria". */
function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Aplica busca + filtro às pastilhas da grade.
 *
 * A consulta com QUALQUER dígito é tratada como número/telefone (ex.: "051"
 * encontra o número 51; "98111" encontra o telefone que o contém; a máscara
 * "(11) 98111-2222" colada inteira também casa); texto sem dígitos casa com
 * o NOME do comprador. Busca e filtro se combinam (E).
 */
export function filtrarGrade(
  pastilhas: readonly PastilhaBusca[],
  vendas: ReadonlyMap<number, VendaBusca>,
  busca: string,
  filtro: FiltroEstado,
): ResultadoBusca {
  const digitos = busca.replace(/\D/g, "");
  const texto = normalizarTexto(busca);
  const numeroExato = digitos ? Number(digitos) : null;

  const casaEstado = (status: StatusNumero): boolean =>
    filtro === "todos" ||
    (filtro === "disponiveis" && status === "disponivel") ||
    (filtro === "vendidos" && status === "vendido");

  const casaBusca = (numero: number): boolean => {
    if (!digitos && !texto) return true;
    if (numeroExato !== null && numeroExato === numero) return true;
    const venda = vendas.get(numero);
    if (!venda) return false;
    if (digitos) return venda.telefone.replace(/\D/g, "").includes(digitos);
    return normalizarTexto(venda.nome).includes(texto);
  };

  const visiveis = pastilhas.filter(
    (pastilha) => casaEstado(pastilha.status) && casaBusca(pastilha.numero),
  );

  // O destaque existe só quando o número exato digitado está na faixa —
  // dígitos de telefone nunca realçam pastilha nenhuma.
  const destaque =
    numeroExato !== null && visiveis.some((pastilha) => pastilha.numero === numeroExato)
      ? numeroExato
      : null;

  return { visiveis, destaque };
}
