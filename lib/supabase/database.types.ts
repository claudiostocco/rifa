
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "compradores": {
                  Row: {
                    "criado_em": string,"id": string,"nome": string,"rifa_id": string,"telefone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"id"?: string,"nome": string,"rifa_id": string,"telefone": string
                  }
                  Update: {
                    "criado_em"?: string,"id"?: string,"nome"?: string,"rifa_id"?: string,"telefone"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "compradores_rifa_id_fkey"
      columns: ["rifa_id"]
isOneToOne: false
      referencedRelation: "rifas"
      referencedColumns: ["id"]
    }
                  ]
                },"numeros": {
                  Row: {
                    "id": string,"numero": number,"rifa_id": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"numero": number,"rifa_id": string,"status"?: string
                  }
                  Update: {
                    "id"?: string,"numero"?: number,"rifa_id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "numeros_rifa_id_fkey"
      columns: ["rifa_id"]
isOneToOne: false
      referencedRelation: "rifas"
      referencedColumns: ["id"]
    }
                  ]
                },"perfis": {
                  Row: {
                    "atualizado_em": string,"criado_em": string,"id": string,"nome_exibicao": string,"whatsapp": string
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizado_em"?: string,"criado_em"?: string,"id": string,"nome_exibicao": string,"whatsapp": string
                  }
                  Update: {
                    "atualizado_em"?: string,"criado_em"?: string,"id"?: string,"nome_exibicao"?: string,"whatsapp"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rifas": {
                  Row: {
                    "arquivada": boolean,"atualizada_em": string,"criada_em": string,"data_prevista": string | null,"descricao": string | null,"excluida": boolean,"id": string,"imagem_url": string | null,"numero_valor": number,"perfil_id": string,"premio_descricao": string,"premio_rotulo": string,"premio_valor": number,"qtd_minima": number,"quantidade": number,"slug": string,"status": string,"titulo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "arquivada"?: boolean,"atualizada_em"?: string,"criada_em"?: string,"data_prevista"?: string | null,"descricao"?: string | null,"excluida"?: boolean,"id"?: string,"imagem_url"?: string | null,"numero_valor": number,"perfil_id": string,"premio_descricao": string,"premio_rotulo"?: string,"premio_valor": number,"qtd_minima": number,"quantidade": number,"slug": string,"status"?: string,"titulo": string
                  }
                  Update: {
                    "arquivada"?: boolean,"atualizada_em"?: string,"criada_em"?: string,"data_prevista"?: string | null,"descricao"?: string | null,"excluida"?: boolean,"id"?: string,"imagem_url"?: string | null,"numero_valor"?: number,"perfil_id"?: string,"premio_descricao"?: string,"premio_rotulo"?: string,"premio_valor"?: number,"qtd_minima"?: number,"quantidade"?: number,"slug"?: string,"status"?: string,"titulo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rifas_perfil_id_fkey"
      columns: ["perfil_id"]
isOneToOne: false
      referencedRelation: "perfis"
      referencedColumns: ["id"]
    }
                  ]
                },"sorteios": {
                  Row: {
                    "anulado_em": string | null,"comprador_id": string,"id": string,"numero_id": string,"rifa_id": string,"sorteado_em": string,"total_vendidos": number
                  }
                  ComputedFields: never
                  Insert: {
                    "anulado_em"?: string | null,"comprador_id": string,"id"?: string,"numero_id": string,"rifa_id": string,"sorteado_em"?: string,"total_vendidos": number
                  }
                  Update: {
                    "anulado_em"?: string | null,"comprador_id"?: string,"id"?: string,"numero_id"?: string,"rifa_id"?: string,"sorteado_em"?: string,"total_vendidos"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "sorteios_comprador_id_fkey"
      columns: ["comprador_id"]
isOneToOne: false
      referencedRelation: "compradores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sorteios_numero_id_fkey"
      columns: ["numero_id"]
isOneToOne: false
      referencedRelation: "numeros"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sorteios_rifa_id_fkey"
      columns: ["rifa_id"]
isOneToOne: false
      referencedRelation: "rifas"
      referencedColumns: ["id"]
    }
                  ]
                },"vendas": {
                  Row: {
                    "comprador_id": string,"criada_em": string,"id": string,"numero_id": string,"origem": string,"removida_em": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "comprador_id": string,"criada_em"?: string,"id"?: string,"numero_id": string,"origem"?: string,"removida_em"?: string | null
                  }
                  Update: {
                    "comprador_id"?: string,"criada_em"?: string,"id"?: string,"numero_id"?: string,"origem"?: string,"removida_em"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "vendas_comprador_id_fkey"
      columns: ["comprador_id"]
isOneToOne: false
      referencedRelation: "compradores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendas_numero_id_fkey"
      columns: ["numero_id"]
isOneToOne: false
      referencedRelation: "numeros"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "perfil_do_usuario":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"pertence_ao_propria_rifa":
{ Args: { "rifa": string }; Returns: boolean
                           },
"sortear_rifa":
{ Args: { "rifa": string }; Returns: string
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
