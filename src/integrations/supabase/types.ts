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
      app_secrets: {
        Row: {
          name: string
          updated_at: string
          value: string
        }
        Insert: {
          name: string
          updated_at?: string
          value: string
        }
        Update: {
          name?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      cart_reservations: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          product_id: string
          quantity: number
          user_id: string
          variant_color: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          product_id: string
          quantity: number
          user_id: string
          variant_color?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          product_id?: string
          quantity?: number
          user_id?: string
          variant_color?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_reservations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      cashback_entries: {
        Row: {
          amount: number
          consumed: number
          created_at: string
          expired_at: string | null
          expires_at: string | null
          id: string
          kind: string
          order_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          consumed?: number
          created_at?: string
          expired_at?: string | null
          expires_at?: string | null
          id?: string
          kind: string
          order_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          consumed?: number
          created_at?: string
          expired_at?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          order_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashback_entries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          reserved: boolean
          unit_price: number
          variant_color: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          reserved?: boolean
          unit_price: number
          variant_color?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          reserved?: boolean
          unit_price?: number
          variant_color?: string | null
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
          cancellation_reason: string | null
          cashback_earned: number
          cashback_granted_at: string | null
          cashback_used: number
          created_at: string
          customer_cpf: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          delivery_fee: number
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
          maisentregas_created_at: string | null
          maisentregas_last_check_at: string | null
          maisentregas_last_error: string | null
          maisentregas_order_id: string | null
          maisentregas_status: string | null
          maisentregas_tracking_url: string | null
          manual_created_by: string | null
          manual_created_by_name: string | null
          manual_sale: boolean
          mp_init_point: string | null
          mp_last_attempt_at: string | null
          mp_payment_id: string | null
          mp_payment_method_id: string | null
          mp_payment_status: string | null
          mp_preference_id: string | null
          mp_refund_id: string | null
          mp_status_detail: string | null
          payment_method: string
          refund_reason: string | null
          refund_status: string | null
          refunded_amount: number | null
          refunded_at: string | null
          refunded_by: string | null
          refunded_by_name: string | null
          shipping_address: string | null
          shipping_city: string | null
          shipping_complement: string | null
          shipping_district: string | null
          shipping_number: string | null
          shipping_recipient_name: string | null
          shipping_recipient_phone: string | null
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
          cancellation_reason?: string | null
          cashback_earned?: number
          cashback_granted_at?: string | null
          cashback_used?: number
          created_at?: string
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          delivery_fee?: number
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
          maisentregas_created_at?: string | null
          maisentregas_last_check_at?: string | null
          maisentregas_last_error?: string | null
          maisentregas_order_id?: string | null
          maisentregas_status?: string | null
          maisentregas_tracking_url?: string | null
          manual_created_by?: string | null
          manual_created_by_name?: string | null
          manual_sale?: boolean
          mp_init_point?: string | null
          mp_last_attempt_at?: string | null
          mp_payment_id?: string | null
          mp_payment_method_id?: string | null
          mp_payment_status?: string | null
          mp_preference_id?: string | null
          mp_refund_id?: string | null
          mp_status_detail?: string | null
          payment_method?: string
          refund_reason?: string | null
          refund_status?: string | null
          refunded_amount?: number | null
          refunded_at?: string | null
          refunded_by?: string | null
          refunded_by_name?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_complement?: string | null
          shipping_district?: string | null
          shipping_number?: string | null
          shipping_recipient_name?: string | null
          shipping_recipient_phone?: string | null
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
          cancellation_reason?: string | null
          cashback_earned?: number
          cashback_granted_at?: string | null
          cashback_used?: number
          created_at?: string
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          delivery_fee?: number
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
          maisentregas_created_at?: string | null
          maisentregas_last_check_at?: string | null
          maisentregas_last_error?: string | null
          maisentregas_order_id?: string | null
          maisentregas_status?: string | null
          maisentregas_tracking_url?: string | null
          manual_created_by?: string | null
          manual_created_by_name?: string | null
          manual_sale?: boolean
          mp_init_point?: string | null
          mp_last_attempt_at?: string | null
          mp_payment_id?: string | null
          mp_payment_method_id?: string | null
          mp_payment_status?: string | null
          mp_preference_id?: string | null
          mp_refund_id?: string | null
          mp_status_detail?: string | null
          payment_method?: string
          refund_reason?: string | null
          refund_status?: string | null
          refunded_amount?: number | null
          refunded_at?: string | null
          refunded_by?: string | null
          refunded_by_name?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_complement?: string | null
          shipping_district?: string | null
          shipping_number?: string | null
          shipping_recipient_name?: string | null
          shipping_recipient_phone?: string | null
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
          color_variants: Json
          created_at: string
          created_by: string | null
          created_by_name: string | null
          description: string | null
          id: string
          image_url: string | null
          images: string[]
          name: string
          original_price: number | null
          price: number
          sku: string
          stock: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          color_variants?: Json
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          images?: string[]
          name: string
          original_price?: number | null
          price: number
          sku?: string
          stock?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          color_variants?: Json
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          images?: string[]
          name?: string
          original_price?: number | null
          price?: number
          sku?: string
          stock?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address_city: string | null
          address_complement: string | null
          address_district: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          birth_date: string | null
          cpf: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address_city?: string | null
          address_complement?: string | null
          address_district?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          birth_date?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address_city?: string | null
          address_complement?: string | null
          address_district?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          birth_date?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount: number
          created_at: string
          customer_cpf: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string
          is_full: boolean
          items: Json
          mp_payment_id: string | null
          mp_refund_id: string | null
          operator_id: string | null
          operator_name: string | null
          order_created_at: string | null
          order_id: string
          order_total: number | null
          payment_method: string | null
          reason: string
        }
        Insert: {
          amount: number
          created_at?: string
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          is_full?: boolean
          items?: Json
          mp_payment_id?: string | null
          mp_refund_id?: string | null
          operator_id?: string | null
          operator_name?: string | null
          order_created_at?: string | null
          order_id: string
          order_total?: number | null
          payment_method?: string | null
          reason: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          is_full?: boolean
          items?: Json
          mp_payment_id?: string | null
          mp_refund_id?: string | null
          operator_id?: string | null
          operator_name?: string | null
          order_created_at?: string | null
          order_id?: string
          order_total?: number | null
          payment_method?: string | null
          reason?: string
        }
        Relationships: []
      }
      site_visits: {
        Row: {
          created_at: string
          id: string
          session_id: string
          visited_on: string
        }
        Insert: {
          created_at?: string
          id?: string
          session_id: string
          visited_on?: string
        }
        Update: {
          created_at?: string
          id?: string
          session_id?: string
          visited_on?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
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
      apply_cashback_to_order: {
        Args: { p_amount: number; p_order_id: string }
        Returns: number
      }
      assign_team_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: string
      }
      cashback_balance: { Args: { p_user_id: string }; Returns: number }
      cashback_next_expiry: {
        Args: { p_user_id: string }
        Returns: {
          amount: number
          expires_at: string
        }[]
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
      create_manual_order: {
        Args: {
          p_customer_cpf?: string
          p_customer_email?: string
          p_customer_name: string
          p_customer_phone: string
          p_delivery_method: string
          p_items: Json
        }
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
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      expire_cart_reservations: { Args: never; Returns: number }
      expire_cashback: { Args: never; Returns: number }
      expire_stale_pending_orders: {
        Args: { p_minutes?: number }
        Returns: number
      }
      find_variant_index: {
        Args: { _color: string; _variants: Json }
        Returns: number
      }
      generate_product_sku: { Args: never; Returns: string }
      grant_order_cashback: { Args: { p_order_id: string }; Returns: number }
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
          p_max_price?: number
          p_offset?: number
          p_search?: string
          p_stock_status?: string
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
          sku: string
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
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
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
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      record_visit: { Args: { p_session_id: string }; Returns: number }
      refund_cashback_for_order: {
        Args: { p_order_id: string }
        Returns: number
      }
      release_cart_reservation: {
        Args: { p_product_id: string; p_variant_color: string }
        Returns: boolean
      }
      remove_team_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: boolean
      }
      reserve_cart_last_stock: {
        Args: {
          p_product_id: string
          p_quantity: number
          p_variant_color: string
        }
        Returns: string
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
      set_fulfillment_status: {
        Args: { p_order_id: string; p_status: string }
        Returns: string
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "user" | "catalog" | "fulfillment" | "manager"
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
      app_role: ["admin", "user", "catalog", "fulfillment", "manager"],
    },
  },
} as const
