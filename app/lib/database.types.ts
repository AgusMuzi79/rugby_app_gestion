export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      asistencias: {
        Row: {
          created_at: string
          division_id: string
          estado: string
          evento_id: string
          id: string
          jugador_id: string
          registrado_por: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          division_id: string
          estado: string
          evento_id: string
          id?: string
          jugador_id: string
          registrado_por: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          division_id?: string
          estado?: string
          evento_id?: string
          id?: string
          jugador_id?: string
          registrado_por?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asistencias_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asistencias_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asistencias_jugador_id_fkey"
            columns: ["jugador_id"]
            isOneToOne: false
            referencedRelation: "jugadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asistencias_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cobranzas: {
        Row: {
          created_at: string
          estado: string
          evento_financiero_id: string
          fecha_pago: string | null
          forma_de_pago: string | null
          id: string
          jugador_id: string
          monto: number | null
          registrado_por: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          estado?: string
          evento_financiero_id: string
          fecha_pago?: string | null
          forma_de_pago?: string | null
          id?: string
          jugador_id: string
          monto?: number | null
          registrado_por: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          estado?: string
          evento_financiero_id?: string
          fecha_pago?: string | null
          forma_de_pago?: string | null
          id?: string
          jugador_id?: string
          monto?: number | null
          registrado_por?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobranzas_evento_financiero_id_fkey"
            columns: ["evento_financiero_id"]
            isOneToOne: false
            referencedRelation: "eventos_financieros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranzas_jugador_id_fkey"
            columns: ["jugador_id"]
            isOneToOne: false
            referencedRelation: "jugadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranzas_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      divisiones: {
        Row: {
          activa: boolean
          categoria: string
          created_at: string
          id: string
          nombre: string
        }
        Insert: {
          activa?: boolean
          categoria: string
          created_at?: string
          id?: string
          nombre: string
        }
        Update: {
          activa?: boolean
          categoria?: string
          created_at?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      documentos_fichaje: {
        Row: {
          created_at: string
          fichaje_id: string
          id: string
          nombre_archivo: string | null
          storage_path: string
          tipo: string
        }
        Insert: {
          created_at?: string
          fichaje_id: string
          id?: string
          nombre_archivo?: string | null
          storage_path: string
          tipo: string
        }
        Update: {
          created_at?: string
          fichaje_id?: string
          id?: string
          nombre_archivo?: string | null
          storage_path?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_fichaje_fichaje_id_fkey"
            columns: ["fichaje_id"]
            isOneToOne: false
            referencedRelation: "fichajes"
            referencedColumns: ["id"]
          },
        ]
      }
      equipos: {
        Row: {
          created_at: string
          created_by: string
          division_id: string
          id: string
          nombre: string
        }
        Insert: {
          created_at?: string
          created_by: string
          division_id: string
          id?: string
          nombre: string
        }
        Update: {
          created_at?: string
          created_by?: string
          division_id?: string
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipos_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisiones"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos: {
        Row: {
          cancelado: boolean
          creado_por: string
          created_at: string
          division_id: string
          fecha: string
          hora: string | null
          id: string
          lugar: string | null
          rival: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          cancelado?: boolean
          creado_por: string
          created_at?: string
          division_id: string
          fecha: string
          hora?: string | null
          id?: string
          lugar?: string | null
          rival?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          cancelado?: boolean
          creado_por?: string
          created_at?: string
          division_id?: string
          fecha?: string
          hora?: string | null
          id?: string
          lugar?: string | null
          rival?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisiones"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos_financieros: {
        Row: {
          creado_por: string
          created_at: string
          descripcion: string | null
          division_id: string | null
          estado: string
          evento_id: string | null
          fecha: string | null
          id: string
          nombre: string
          tipo: string
          updated_at: string
        }
        Insert: {
          creado_por: string
          created_at?: string
          descripcion?: string | null
          division_id?: string | null
          estado?: string
          evento_id?: string | null
          fecha?: string | null
          id?: string
          nombre: string
          tipo: string
          updated_at?: string
        }
        Update: {
          creado_por?: string
          created_at?: string
          descripcion?: string | null
          division_id?: string | null
          estado?: string
          evento_id?: string | null
          fecha?: string | null
          id?: string
          nombre?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_financieros_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_financieros_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_financieros_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
        ]
      }
      fichajes: {
        Row: {
          created_at: string
          fecha_fichaje: string
          id: string
          jugador_id: string
          registrado_por: string
        }
        Insert: {
          created_at?: string
          fecha_fichaje?: string
          id?: string
          jugador_id: string
          registrado_por: string
        }
        Update: {
          created_at?: string
          fecha_fichaje?: string
          id?: string
          jugador_id?: string
          registrado_por?: string
        }
        Relationships: [
          {
            foreignKeyName: "fichajes_jugador_id_fkey"
            columns: ["jugador_id"]
            isOneToOne: false
            referencedRelation: "jugadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fichajes_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      items_pedido: {
        Row: {
          cantidad: number
          concepto: string
          created_at: string
          id: string
          pedido_id: string
        }
        Insert: {
          cantidad: number
          concepto: string
          created_at?: string
          id?: string
          pedido_id: string
        }
        Update: {
          cantidad?: number
          concepto?: string
          created_at?: string
          id?: string
          pedido_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_pedido_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      jugadores: {
        Row: {
          activo: boolean
          created_at: string
          division_id: string
          dni: string
          fecha_nacimiento: string
          id: string
          nombre_completo: string
          posicion: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          division_id: string
          dni: string
          fecha_nacimiento: string
          id?: string
          nombre_completo: string
          posicion?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          division_id?: string
          dni?: string
          fecha_nacimiento?: string
          id?: string
          nombre_completo?: string
          posicion?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jugadores_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisiones"
            referencedColumns: ["id"]
          },
        ]
      }
      lesiones: {
        Row: {
          created_at: string
          descripcion: string
          division_id: string
          fecha: string
          grado: number
          id: string
          jugador_id: string
          registrado_por: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          descripcion: string
          division_id: string
          fecha: string
          grado: number
          id?: string
          jugador_id: string
          registrado_por: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          descripcion?: string
          division_id?: string
          fecha?: string
          grado?: number
          id?: string
          jugador_id?: string
          registrado_por?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesiones_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesiones_jugador_id_fkey"
            columns: ["jugador_id"]
            isOneToOne: false
            referencedRelation: "jugadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesiones_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mesa_jugadores: {
        Row: {
          id: string
          jugador_id: string
          mesa_id: string
          rol_en_mesa: string
        }
        Insert: {
          id?: string
          jugador_id: string
          mesa_id: string
          rol_en_mesa: string
        }
        Update: {
          id?: string
          jugador_id?: string
          mesa_id?: string
          rol_en_mesa?: string
        }
        Relationships: [
          {
            foreignKeyName: "mesa_jugadores_jugador_id_fkey"
            columns: ["jugador_id"]
            isOneToOne: false
            referencedRelation: "jugadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mesa_jugadores_mesa_id_fkey"
            columns: ["mesa_id"]
            isOneToOne: false
            referencedRelation: "mesas_de_partido"
            referencedColumns: ["id"]
          },
        ]
      }
      mesas_de_partido: {
        Row: {
          created_at: string
          equipo_id: string | null
          evento_id: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          equipo_id?: string | null
          evento_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          equipo_id?: string | null
          evento_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mesas_de_partido_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mesas_de_partido_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
        ]
      }
      notificaciones: {
        Row: {
          created_at: string
          evento_referencia_id: string | null
          evento_referencia_tipo: string | null
          id: string
          mensaje: string
          origen_usuario_id: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          created_at?: string
          evento_referencia_id?: string | null
          evento_referencia_tipo?: string | null
          id?: string
          mensaje: string
          origen_usuario_id?: string | null
          tipo: string
          titulo: string
        }
        Update: {
          created_at?: string
          evento_referencia_id?: string | null
          evento_referencia_tipo?: string | null
          id?: string
          mensaje?: string
          origen_usuario_id?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificaciones_origen_usuario_id_fkey"
            columns: ["origen_usuario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notificaciones_destinatarios: {
        Row: {
          created_at: string
          fecha_lectura: string | null
          id: string
          leida: boolean
          notificacion_id: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          fecha_lectura?: string | null
          id?: string
          leida?: boolean
          notificacion_id: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          fecha_lectura?: string | null
          id?: string
          leida?: boolean
          notificacion_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificaciones_destinatarios_notificacion_id_fkey"
            columns: ["notificacion_id"]
            isOneToOne: false
            referencedRelation: "notificaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificaciones_destinatarios_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          created_at: string
          estado: string
          evento_financiero_id: string
          fecha_confirmacion: string | null
          id: string
          manager_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          estado?: string
          evento_financiero_id: string
          fecha_confirmacion?: string | null
          id?: string
          manager_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          estado?: string
          evento_financiero_id?: string
          fecha_confirmacion?: string | null
          id?: string
          manager_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_evento_financiero_id_fkey"
            columns: ["evento_financiero_id"]
            isOneToOne: false
            referencedRelation: "eventos_financieros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          activo: boolean
          created_at: string
          divisiones: string[] | null
          id: string
          nombre: string
          rol: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          divisiones?: string[] | null
          id: string
          nombre: string
          rol: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          divisiones?: string[] | null
          id?: string
          nombre?: string
          rol?: string
          updated_at?: string
        }
        Relationships: []
      }
      protocolos: {
        Row: {
          created_at: string
          grado_asociado: number | null
          id: string
          nombre_archivo: string | null
          storage_path: string
          subido_por: string
          titulo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          grado_asociado?: number | null
          id?: string
          nombre_archivo?: string | null
          storage_path: string
          subido_por: string
          titulo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          grado_asociado?: number | null
          id?: string
          nombre_archivo?: string | null
          storage_path?: string
          subido_por?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "protocolos_subido_por_fkey"
            columns: ["subido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          plataforma: string | null
          token: string
          updated_at: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          plataforma?: string | null
          token: string
          updated_at?: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          id?: string
          plataforma?: string | null
          token?: string
          updated_at?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resultados: {
        Row: {
          created_at: string
          equipo_id: string | null
          evento_id: string
          id: string
          puntos_propios: number
          puntos_rival: number
          registrado_por: string
          rival: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          equipo_id?: string | null
          evento_id: string
          id?: string
          puntos_propios: number
          puntos_rival: number
          registrado_por: string
          rival?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          equipo_id?: string | null
          evento_id?: string
          id?: string
          puntos_propios?: number
          puntos_rival?: number
          registrado_por?: string
          rival?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resultados_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resultados_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resultados_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_rol: { Args: never; Returns: string }
      tiene_acceso_division: {
        Args: { p_division_id: string }
        Returns: boolean
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

