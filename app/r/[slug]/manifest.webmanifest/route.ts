import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import type { Database } from "@/lib/supabase/database.types";

type Props = { params: Promise<{ slug: string }> };

const ICONE_APP = [
  {
    src: "/icons/icon-192.png",
    sizes: "192x192",
    type: "image/png",
    purpose: "any",
  },
  {
    src: "/icons/icon-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "any",
  },
  {
    src: "/icons/maskable-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable",
  },
] as const;

export async function GET(_request: Request, { params }: { params: Props["params"] }) {
  const { slug } = await params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chaveAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !chaveAnon) {
    return NextResponse.json({ mensagem: "Manifesto indisponível." }, { status: 503 });
  }

  const supabase = createClient<Database>(url, chaveAnon);
  const { data: rifa, error } = await supabase
    .from("rifas")
    .select("slug, titulo")
    .eq("slug", slug)
    .eq("arquivada", false)
    .eq("excluida", false)
    .maybeSingle();

  if (error || !rifa) {
    return new NextResponse(null, { status: 404 });
  }

  const startUrl = `/r/${encodeURIComponent(rifa.slug)}`;
  const manifesto = {
    id: startUrl,
    name: rifa.titulo,
    short_name: rifa.titulo.slice(0, 12),
    description: `Acompanhe a rifa ${rifa.titulo}.`,
    lang: "pt-BR",
    start_url: startUrl,
    scope: "/",
    display: "standalone",
    background_color: "#faf6f0",
    theme_color: "#9a3412",
    icons: ICONE_APP,
  };

  return NextResponse.json(manifesto, {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=300",
      "Content-Type": "application/manifest+json",
    },
  });
}
