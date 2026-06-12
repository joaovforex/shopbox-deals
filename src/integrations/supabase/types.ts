export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string
          product_name: string
          quantity: number
          reserved: boolean
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id: string
          product_name: string
          quantity: number
          reserved?: boolean
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string
          product_name?: string
          quantity?: number
          reserved?: boolean
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          customer_cpf: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          delivery_method: string
          fulfillment_status: string
          id: string
          label_generated_at: string | null
          label_generated_by: string | null
          label_generated_by_name: string | null
          label_printed_at: string | null
          label_printed_by: string | null
          label_printed_by_name: string | null
          label_status: string
          mp_payment_id: string | null
          mp_preference_id: string | null
          payment_method: string
          shipping_address: string | null
          shipping_city: string | null
          shipping_complement: string | null
          shipping_district: string | null
          shipping_number: string | null
          shipping_state: string | null
          shipping_street: string | null
          shipping_zip: string | null
          status: string
          stock_restored_at: string | null
          total: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          delivery_method?: string
          fulfillment_status?: string
          id?: string
          label_generated_at?: string | null
          label_generated_by?: string | null
          label_generated_by_name?: string | null
          label_printed_at?: string | null
          label_printed_by?: string | null
          label_printed_by_name?: string | null
          label_status?: string
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          payment_method?: string
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_complement?: string | null
          shipping_district?: string | null
          shipping_number?: string | null
          shipping_state?: string | null
          shipping_street?: string | null
          shipping_zip?: string | null
          status?: string
          stock_restored_at?: string | null
          total: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          delivery_method?: string
          fulfillment_status?: string
          id?: string
          label_generated_at?: string | null
          label_generated_by?: string | null
          label_generated_by_name?: string | null
          label_printed_at?: string | null
          label_printed_by?: string | null
          label_printed_by_name?: string | null
          label_status?: string
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          payment_method?: string
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_complement?: string | null
          shipping_district?: string | null
          shipping_number?: string | null
          shipping_state?: string | null
          shipping_street?: string | null
          shipping_zip?: string | null
          status?: string
          stock_restored_at?: string | null
          total?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          image_url: string | null
          images: string[]
          name: string
          original_price: number | null
          price: number
          stock: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          images?: string[]
          name: string
          original_price?: number | null
          price: number
          stock?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          images?: string[]
          name?: string
          original_price?: number | null
          price?: number
          stock?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_search_team_candidates: {
        Args: { p_term: string }
        Returns: {
          email: string
          full_name: string
          id: string
        }[]
      }
      assign_team_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: string
      }
      claim_first_admin_for_user: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      claim_first_admin_if_none: { Args: never; Returns: boolean }
      confirm_order_paid: {
        Args: { p_mp_payment_id?: string; p_order_id: string }
        Returns: string
      }
      create_pending_order: {
        Args: {
          p_customer_cpf: string
          p_customer_email: string
          p_customer_name: string
          p_customer_phone: string
          p_delivery_method: string
          p_items: Json
          p_payment_method: string
        }
        Returns: string
      }
      expire_stale_pending_orders: {
        Args: { p_minutes?: number }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_name: {
        Args: { _role: string; _user_id: string }
        Returns: boolean
      }
      list_products_paged: {
        Args: {
          p_category?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
        }
        Returns: {
          category: string
          created_at: string
          id: string
          image_url: string
          images: string[]
          name: string
          original_price: number
          price: number
          stock: number
          total_count: number
        }[]
      }
      list_used_categories: {
        Args: never
        Returns: {
          category: string
        }[]
      }
      mark_label_event: {
        Args: { p_event: string; p_order_id: string }
        Returns: undefined
      }
      place_order:
        | {
            Args: {
              p_city?: string
              p_complement?: string
              p_customer_email: string
              p_customer_name: string
              p_customer_phone: string
              p_delivery_method: string
              p_district?: string
              p_items: Json
              p_number?: string
              p_payment_method: string
              p_state?: string
              p_street?: string
              p_zip?: string
            }
            Returns: string
          }
        | {
            Args: {
              p_city?: string
              p_complement?: string
              p_customer_cpf?: string
              p_customer_email: string
              p_customer_name: string
              p_customer_phone: string
              p_delivery_method: string
              p_district?: string
              p_items: Json
              p_number?: string
              p_payment_method: string
              p_state?: string
              p_street?: string
              p_zip?: string
            }
            Returns: string
          }
      remove_team_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: boolean
      }
      search_products_quick: {
        Args: { p_term: string }
        Returns: {
          id: string
          image_url: string
          images: string[]
          name: string
          price: number
        }[]
      }
      search_team_candidates: {
        Args: { p_term: string }
        Returns: {
          email: string
          full_name: string
          id: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "user" | "catalog" | "fulfillment"
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
  public: {
    Enums: {
      app_role: ["admin", "user", "catalog", "fulfillment"],
    },
  },
} as const
