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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json
          entity: string
          entity_id: string | null
          id: string
          search_norm: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json
          entity: string
          entity_id?: string | null
          id?: string
          search_norm?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json
          entity?: string
          entity_id?: string | null
          id?: string
          search_norm?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          metadata: Json
          order_id: string | null
          read_at: string | null
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          order_id?: string | null
          read_at?: string | null
          title: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          order_id?: string | null
          read_at?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
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
      cielo_refund_queue: {
        Row: {
          amount: number
          attempts: number
          cielo_payment_id: string
          completed_at: string | null
          created_at: string
          customer_cpf: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          expected_mp_payment_id: string | null
          id: string
          is_full: boolean
          items: Json | null
          last_attempt_at: string | null
          last_error: string | null
          last_error_code: string | null
          max_attempts: number
          next_attempt_at: string
          operator_id: string | null
          operator_name: string | null
          order_created_at: string | null
          order_id: string
          order_total: number | null
          payment_method: string | null
          reason: string
          refund_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          attempts?: number
          cielo_payment_id: string
          completed_at?: string | null
          created_at?: string
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          expected_mp_payment_id?: string | null
          id?: string
          is_full?: boolean
          items?: Json | null
          last_attempt_at?: string | null
          last_error?: string | null
          last_error_code?: string | null
          max_attempts?: number
          next_attempt_at?: string
          operator_id?: string | null
          operator_name?: string | null
          order_created_at?: string | null
          order_id: string
          order_total?: number | null
          payment_method?: string | null
          reason: string
          refund_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          attempts?: number
          cielo_payment_id?: string
          completed_at?: string | null
          created_at?: string
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          expected_mp_payment_id?: string | null
          id?: string
          is_full?: boolean
          items?: Json | null
          last_attempt_at?: string | null
          last_error?: string | null
          last_error_code?: string | null
          max_attempts?: number
          next_attempt_at?: string
          operator_id?: string | null
          operator_name?: string | null
          order_created_at?: string | null
          order_id?: string
          order_total?: number | null
          payment_method?: string | null
          reason?: string
          refund_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cielo_refund_queue_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cielo_refund_queue_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
        ]
      }
      cielo_webhook_events: {
        Row: {
          change_type: number
          cielo_status: number | null
          id: string
          order_id: string | null
          payment_id: string
          processed_at: string
          raw_payload: Json | null
        }
        Insert: {
          change_type: number
          cielo_status?: number | null
          id?: string
          order_id?: string | null
          payment_id: string
          processed_at?: string
          raw_payload?: Json | null
        }
        Update: {
          change_type?: number
          cielo_status?: number | null
          id?: string
          order_id?: string | null
          payment_id?: string
          processed_at?: string
          raw_payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "cielo_webhook_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_upgrades: {
        Row: {
          cancelled_at: string | null
          created_at: string
          fee: number
          id: string
          mp_init_point: string | null
          mp_payment_id: string | null
          mp_preference_id: string | null
          mp_status: string | null
          order_id: string
          paid_at: string | null
          shipping_city: string
          shipping_complement: string | null
          shipping_district: string | null
          shipping_number: string
          shipping_recipient_name: string | null
          shipping_recipient_phone: string | null
          shipping_state: string
          shipping_street: string
          shipping_zip: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          fee?: number
          id?: string
          mp_init_point?: string | null
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          mp_status?: string | null
          order_id: string
          paid_at?: string | null
          shipping_city: string
          shipping_complement?: string | null
          shipping_district?: string | null
          shipping_number: string
          shipping_recipient_name?: string | null
          shipping_recipient_phone?: string | null
          shipping_state: string
          shipping_street: string
          shipping_zip: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          fee?: number
          id?: string
          mp_init_point?: string | null
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          mp_status?: string | null
          order_id?: string
          paid_at?: string | null
          shipping_city?: string
          shipping_complement?: string | null
          shipping_district?: string | null
          shipping_number?: string
          shipping_recipient_name?: string | null
          shipping_recipient_phone?: string | null
          shipping_state?: string
          shipping_street?: string
          shipping_zip?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_upgrades_order_id_fkey"
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
      exchange_vouchers: {
        Row: {
          amount: number
          cashback_entry_id: string | null
          created_at: string
          customer_cpf: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          extra_amount: number
          id: string
          items: Json
          operator_id: string | null
          operator_name: string | null
          order_created_at: string | null
          order_id: string
          order_total: number | null
          reason: string
          user_id: string
        }
        Insert: {
          amount: number
          cashback_entry_id?: string | null
          created_at?: string
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          extra_amount?: number
          id?: string
          items?: Json
          operator_id?: string | null
          operator_name?: string | null
          order_created_at?: string | null
          order_id: string
          order_total?: number | null
          reason: string
          user_id: string
        }
        Update: {
          amount?: number
          cashback_entry_id?: string | null
          created_at?: string
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          extra_amount?: number
          id?: string
          items?: Json
          operator_id?: string | null
          operator_name?: string | null
          order_created_at?: string | null
          order_id?: string
          order_total?: number | null
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_vouchers_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_config: {
        Row: {
          ambiente: string
          ativo: boolean
          cfop_padrao_dentro_uf: string
          cfop_padrao_fora_uf: string
          cnpj: string | null
          created_at: string
          csc_id: string | null
          csc_token: string | null
          endereco_bairro: string | null
          endereco_cep: string | null
          endereco_codigo_municipio: string | null
          endereco_complemento: string | null
          endereco_logradouro: string | null
          endereco_municipio: string | null
          endereco_numero: string | null
          endereco_uf: string | null
          id: string
          inscricao_estadual: string | null
          inscricao_municipal: string | null
          nome_fantasia: string | null
          razao_social: string | null
          regime_tributario: string | null
          serie_nfce: number
          serie_nfe: number
          updated_at: string
        }
        Insert: {
          ambiente?: string
          ativo?: boolean
          cfop_padrao_dentro_uf?: string
          cfop_padrao_fora_uf?: string
          cnpj?: string | null
          created_at?: string
          csc_id?: string | null
          csc_token?: string | null
          endereco_bairro?: string | null
          endereco_cep?: string | null
          endereco_codigo_municipio?: string | null
          endereco_complemento?: string | null
          endereco_logradouro?: string | null
          endereco_municipio?: string | null
          endereco_numero?: string | null
          endereco_uf?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          nome_fantasia?: string | null
          razao_social?: string | null
          regime_tributario?: string | null
          serie_nfce?: number
          serie_nfe?: number
          updated_at?: string
        }
        Update: {
          ambiente?: string
          ativo?: boolean
          cfop_padrao_dentro_uf?: string
          cfop_padrao_fora_uf?: string
          cnpj?: string | null
          created_at?: string
          csc_id?: string | null
          csc_token?: string | null
          endereco_bairro?: string | null
          endereco_cep?: string | null
          endereco_codigo_municipio?: string | null
          endereco_complemento?: string | null
          endereco_logradouro?: string | null
          endereco_municipio?: string | null
          endereco_numero?: string | null
          endereco_uf?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          nome_fantasia?: string | null
          razao_social?: string | null
          regime_tributario?: string | null
          serie_nfce?: number
          serie_nfe?: number
          updated_at?: string
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          created_at: string
          email: string | null
          id: number
          ip: unknown
          success: boolean
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: number
          ip: unknown
          success?: boolean
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: number
          ip?: unknown
          success?: boolean
        }
        Relationships: []
      }
      order_items: {
        Row: {
          category: string | null
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
          category?: string | null
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
          category?: string | null
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
          asaas_checkout_id: string | null
          asaas_customer_id: string | null
          asaas_invoice_url: string | null
          asaas_payment_id: string | null
          asaas_status: string | null
          cancellation_reason: string | null
          cashback_earned: number
          cashback_granted_at: string | null
          cashback_used: number
          cielo_authorization_code: string | null
          cielo_card_brand: string | null
          cielo_checkout_url: string | null
          cielo_installments: number | null
          cielo_last_check_at: string | null
          cielo_payment_id: string | null
          cielo_payment_method: string | null
          cielo_return_code: string | null
          cielo_return_message: string | null
          cielo_status: string | null
          cielo_tid: string | null
          created_at: string
          customer_cpf: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          delivered_at: string | null
          delivered_by_name: string | null
          delivery_fee: number
          delivery_method: string
          destinatario_cpf_cnpj: string | null
          destinatario_nome: string | null
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
          nfe_authorized_at: string | null
          nfe_chave: string | null
          nfe_danfe_url: string | null
          nfe_last_check_at: string | null
          nfe_modelo: string | null
          nfe_numero: string | null
          nfe_protocolo: string | null
          nfe_ref: string | null
          nfe_rejection_message: string | null
          nfe_serie: string | null
          nfe_status: string | null
          nfe_xml_url: string | null
          payment_method: string
          payment_provider: string
          pickup_person_name: string | null
          pickup_photo_path: string | null
          pickup_photo_taken_at: string | null
          refund_reason: string | null
          refund_status: string | null
          refunded_amount: number | null
          refunded_at: string | null
          refunded_by: string | null
          refunded_by_name: string | null
          search_norm: string | null
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
          asaas_checkout_id?: string | null
          asaas_customer_id?: string | null
          asaas_invoice_url?: string | null
          asaas_payment_id?: string | null
          asaas_status?: string | null
          cancellation_reason?: string | null
          cashback_earned?: number
          cashback_granted_at?: string | null
          cashback_used?: number
          cielo_authorization_code?: string | null
          cielo_card_brand?: string | null
          cielo_checkout_url?: string | null
          cielo_installments?: number | null
          cielo_last_check_at?: string | null
          cielo_payment_id?: string | null
          cielo_payment_method?: string | null
          cielo_return_code?: string | null
          cielo_return_message?: string | null
          cielo_status?: string | null
          cielo_tid?: string | null
          created_at?: string
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          delivered_at?: string | null
          delivered_by_name?: string | null
          delivery_fee?: number
          delivery_method?: string
          destinatario_cpf_cnpj?: string | null
          destinatario_nome?: string | null
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
          nfe_authorized_at?: string | null
          nfe_chave?: string | null
          nfe_danfe_url?: string | null
          nfe_last_check_at?: string | null
          nfe_modelo?: string | null
          nfe_numero?: string | null
          nfe_protocolo?: string | null
          nfe_ref?: string | null
          nfe_rejection_message?: string | null
          nfe_serie?: string | null
          nfe_status?: string | null
          nfe_xml_url?: string | null
          payment_method?: string
          payment_provider?: string
          pickup_person_name?: string | null
          pickup_photo_path?: string | null
          pickup_photo_taken_at?: string | null
          refund_reason?: string | null
          refund_status?: string | null
          refunded_amount?: number | null
          refunded_at?: string | null
          refunded_by?: string | null
          refunded_by_name?: string | null
          search_norm?: string | null
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
          asaas_checkout_id?: string | null
          asaas_customer_id?: string | null
          asaas_invoice_url?: string | null
          asaas_payment_id?: string | null
          asaas_status?: string | null
          cancellation_reason?: string | null
          cashback_earned?: number
          cashback_granted_at?: string | null
          cashback_used?: number
          cielo_authorization_code?: string | null
          cielo_card_brand?: string | null
          cielo_checkout_url?: string | null
          cielo_installments?: number | null
          cielo_last_check_at?: string | null
          cielo_payment_id?: string | null
          cielo_payment_method?: string | null
          cielo_return_code?: string | null
          cielo_return_message?: string | null
          cielo_status?: string | null
          cielo_tid?: string | null
          created_at?: string
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          delivered_at?: string | null
          delivered_by_name?: string | null
          delivery_fee?: number
          delivery_method?: string
          destinatario_cpf_cnpj?: string | null
          destinatario_nome?: string | null
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
          nfe_authorized_at?: string | null
          nfe_chave?: string | null
          nfe_danfe_url?: string | null
          nfe_last_check_at?: string | null
          nfe_modelo?: string | null
          nfe_numero?: string | null
          nfe_protocolo?: string | null
          nfe_ref?: string | null
          nfe_rejection_message?: string | null
          nfe_serie?: string | null
          nfe_status?: string | null
          nfe_xml_url?: string | null
          payment_method?: string
          payment_provider?: string
          pickup_person_name?: string | null
          pickup_photo_path?: string | null
          pickup_photo_taken_at?: string | null
          refund_reason?: string | null
          refund_status?: string | null
          refunded_amount?: number | null
          refunded_at?: string | null
          refunded_by?: string | null
          refunded_by_name?: string | null
          search_norm?: string | null
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
      pos_charges: {
        Row: {
          created_at: string
          id: string
          items: Json
          last_event_at: string | null
          mp_payment_id: string | null
          mp_payment_method_id: string | null
          mp_preference_id: string | null
          mp_status: string | null
          mp_status_detail: string | null
          note: string | null
          operator_id: string | null
          operator_name: string | null
          paid_at: string | null
          status: string
          total: number
        }
        Insert: {
          created_at?: string
          id?: string
          items: Json
          last_event_at?: string | null
          mp_payment_id?: string | null
          mp_payment_method_id?: string | null
          mp_preference_id?: string | null
          mp_status?: string | null
          mp_status_detail?: string | null
          note?: string | null
          operator_id?: string | null
          operator_name?: string | null
          paid_at?: string | null
          status?: string
          total: number
        }
        Update: {
          created_at?: string
          id?: string
          items?: Json
          last_event_at?: string | null
          mp_payment_id?: string | null
          mp_payment_method_id?: string | null
          mp_preference_id?: string | null
          mp_status?: string | null
          mp_status_detail?: string | null
          note?: string | null
          operator_id?: string | null
          operator_name?: string | null
          paid_at?: string | null
          status?: string
          total?: number
        }
        Relationships: []
      }
      product_price_snapshots: {
        Row: {
          created_at: string
          id: string
          original_price: number | null
          price: number
          product_id: string
          snapshot_date: string
        }
        Insert: {
          created_at?: string
          id?: string
          original_price?: number | null
          price: number
          product_id: string
          snapshot_date?: string
        }
        Update: {
          created_at?: string
          id?: string
          original_price?: number | null
          price?: number
          product_id?: string
          snapshot_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_price_snapshots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          product_id: string
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          product_id: string
          rating: number
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          product_id?: string
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          brand: string | null
          category: string | null
          cest: string | null
          cfop: string | null
          color_variants: Json
          created_at: string
          created_by: string | null
          created_by_name: string | null
          cst_csosn: string | null
          description: string | null
          id: string
          image_url: string | null
          images: string[]
          mass_discount_snapshot_original: number | null
          mass_discount_snapshot_price: number | null
          name: string
          ncm: string | null
          origem: number | null
          original_price: number | null
          peso_liquido: number | null
          price: number
          search_norm: string | null
          size: string | null
          sku: string
          stock: number
          unidade_comercial: string
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          brand?: string | null
          category?: string | null
          cest?: string | null
          cfop?: string | null
          color_variants?: Json
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          cst_csosn?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          images?: string[]
          mass_discount_snapshot_original?: number | null
          mass_discount_snapshot_price?: number | null
          name: string
          ncm?: string | null
          origem?: number | null
          original_price?: number | null
          peso_liquido?: number | null
          price: number
          search_norm?: string | null
          size?: string | null
          sku?: string
          stock?: number
          unidade_comercial?: string
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          brand?: string | null
          category?: string | null
          cest?: string | null
          cfop?: string | null
          color_variants?: Json
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          cst_csosn?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          images?: string[]
          mass_discount_snapshot_original?: number | null
          mass_discount_snapshot_price?: number | null
          name?: string
          ncm?: string | null
          origem?: number | null
          original_price?: number | null
          peso_liquido?: number | null
          price?: number
          search_norm?: string | null
          size?: string | null
          sku?: string
          stock?: number
          unidade_comercial?: string
          unidade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
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
          cancelled_at: string | null
          confirmed_at: string | null
          created_at: string
          customer_cpf: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          failure_reason: string | null
          id: string
          is_full: boolean
          items: Json
          last_checked_at: string | null
          mp_payment_id: string | null
          mp_refund_id: string | null
          operator_id: string | null
          operator_name: string | null
          order_created_at: string | null
          order_id: string
          order_total: number | null
          payment_method: string | null
          provider: string
          provider_payment_id: string | null
          provider_status: string | null
          reason: string
          status: string
        }
        Insert: {
          amount: number
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          failure_reason?: string | null
          id?: string
          is_full?: boolean
          items?: Json
          last_checked_at?: string | null
          mp_payment_id?: string | null
          mp_refund_id?: string | null
          operator_id?: string | null
          operator_name?: string | null
          order_created_at?: string | null
          order_id: string
          order_total?: number | null
          payment_method?: string | null
          provider?: string
          provider_payment_id?: string | null
          provider_status?: string | null
          reason: string
          status?: string
        }
        Update: {
          amount?: number
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          failure_reason?: string | null
          id?: string
          is_full?: boolean
          items?: Json
          last_checked_at?: string | null
          mp_payment_id?: string | null
          mp_refund_id?: string | null
          operator_id?: string | null
          operator_name?: string | null
          order_created_at?: string | null
          order_id?: string
          order_total?: number | null
          payment_method?: string | null
          provider?: string
          provider_payment_id?: string | null
          provider_status?: string | null
          reason?: string
          status?: string
        }
        Relationships: []
      }
      short_links: {
        Row: {
          active: boolean
          click_count: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          slug: string
          target_url: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          click_count?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          slug: string
          target_url: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          click_count?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          slug?: string
          target_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          banner_desktop_url: string | null
          banner_mobile_url: string | null
          cashback_rate: number
          global_discount_percent: number
          id: number
          payment_provider: string
          store_address: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          banner_desktop_url?: string | null
          banner_mobile_url?: string | null
          cashback_rate?: number
          global_discount_percent?: number
          id?: number
          payment_provider?: string
          store_address?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          banner_desktop_url?: string | null
          banner_mobile_url?: string | null
          cashback_rate?: number
          global_discount_percent?: number
          id?: number
          payment_provider?: string
          store_address?: string
          updated_at?: string
          updated_by?: string | null
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
      unidades: {
        Row: {
          ativa: boolean
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          created_at: string
          estado: string | null
          horario_retirada: string | null
          id: string
          nome: string
          numero: string | null
          ordem: number
          rua: string | null
          slug: string | null
        }
        Insert: {
          ativa?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          created_at?: string
          estado?: string | null
          horario_retirada?: string | null
          id?: string
          nome: string
          numero?: string | null
          ordem?: number
          rua?: string | null
          slug?: string | null
        }
        Update: {
          ativa?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          created_at?: string
          estado?: string | null
          horario_retirada?: string | null
          id?: string
          nome?: string
          numero?: string | null
          ordem?: number
          rua?: string | null
          slug?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          unidade_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          unidade_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          unidade_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_apply_discount_to_products: {
        Args: { p_ids: string[]; p_pct: number }
        Returns: number
      }
      admin_can_manage_products: {
        Args: { _user_id: string }
        Returns: boolean
      }
      admin_can_view_reports: { Args: { _user_id: string }; Returns: boolean }
      admin_cashback_outstanding: { Args: never; Returns: Json }
      admin_catalog_value: { Args: never; Returns: Json }
      admin_delete_products: { Args: { p_ids: string[] }; Returns: number }
      admin_grant_cashback: {
        Args: {
          p_amount: number
          p_days?: number
          p_reason: string
          p_user_id: string
        }
        Returns: string
      }
      admin_order_metrics: {
        Args: {
          p_category?: string
          p_delivery?: string
          p_from?: string
          p_payment?: string
          p_to?: string
        }
        Returns: Json
      }
      admin_orders_page: {
        Args: {
          p_category?: string
          p_delivery?: string
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_payment?: string
          p_search?: string
          p_status?: string
          p_to?: string
        }
        Returns: {
          created_at: string
          customer_cpf: string
          customer_email: string
          customer_name: string
          customer_phone: string
          delivery_fee: number
          delivery_method: string
          fulfillment_status: string
          id: string
          mp_payment_id: string
          payment_method: string
          refund_status: string
          refunded_amount: number
          refunded_at: string
          shipping_address: string
          status: string
          total: number
          total_count: number
        }[]
      }
      admin_replace_in_product_names: {
        Args: { p_find: string; p_ids: string[]; p_replace: string }
        Returns: number
      }
      admin_search_team_candidates: {
        Args: { p_term: string }
        Returns: {
          email: string
          full_name: string
          id: string
        }[]
      }
      admin_set_products_active: {
        Args: { p_active: boolean; p_ids: string[] }
        Returns: number
      }
      admin_set_products_category: {
        Args: { p_category: string; p_ids: string[] }
        Returns: number
      }
      admin_set_products_stock: {
        Args: { p_ids: string[]; p_mode: string; p_value: number }
        Returns: number
      }
      admin_update_product_fields: {
        Args: { p_fields: Json; p_id: string }
        Returns: boolean
      }
      apply_cashback_to_order: {
        Args: { p_amount: number; p_order_id: string }
        Returns: number
      }
      apply_category_discount: {
        Args: { categories: string[]; pct: number }
        Returns: number
      }
      apply_delivery_upgrade: {
        Args: { p_mp_payment_id: string; p_upgrade_id: string }
        Returns: string
      }
      apply_global_discount: { Args: { pct: number }; Returns: number }
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
      clear_category_discount: {
        Args: { categories: string[] }
        Returns: number
      }
      clear_global_discount: { Args: never; Returns: number }
      confirm_order_delivery:
        | {
            Args: { p_delivered_by_name: string; p_order_id: string }
            Returns: string
          }
        | {
            Args: {
              p_delivered_by_name: string
              p_order_id: string
              p_pickup_person_name: string
              p_pickup_photo_path: string
            }
            Returns: string
          }
      confirm_order_paid: {
        Args: { p_mp_payment_id?: string; p_order_id: string }
        Returns: string
      }
      create_exchange_voucher:
        | {
            Args: {
              p_amount: number
              p_items: Json
              p_operator_id: string
              p_operator_name: string
              p_order_id: string
              p_reason: string
            }
            Returns: string
          }
        | {
            Args: {
              p_amount: number
              p_extra_amount?: number
              p_items: Json
              p_operator_id: string
              p_operator_name: string
              p_order_id: string
              p_reason: string
            }
            Returns: string
          }
      create_manual_order:
        | {
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
        | {
            Args: {
              p_customer_cpf?: string
              p_customer_email?: string
              p_customer_name: string
              p_customer_phone: string
              p_delivery_method: string
              p_items: Json
              p_payment_method?: string
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
      f_unaccent: { Args: { "": string }; Returns: string }
      find_variant_index: {
        Args: { _color: string; _variants: Json }
        Returns: number
      }
      fulfillment_scope_unidade: { Args: { _user_id: string }; Returns: string }
      generate_product_sku: { Args: never; Returns: string }
      get_latest_price_snapshot: {
        Args: { _product_id: string }
        Returns: {
          original_price: number
          price: number
          snapshot_date: string
        }[]
      }
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
          unidade_id: string
        }[]
      }
      list_used_categories: {
        Args: never
        Returns: {
          category: string
        }[]
      }
      log_admin_action: {
        Args: {
          p_action: string
          p_details?: Json
          p_entity: string
          p_entity_id?: string
        }
        Returns: undefined
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
      order_matches_unidade: {
        Args: { _order_id: string; _unidade: string }
        Returns: boolean
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
      resolve_short_link: { Args: { _slug: string }; Returns: string }
      revert_fulfillment_to_preparing: {
        Args: { p_order_id: string }
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
      snapshot_product_prices_daily: { Args: never; Returns: number }
      text_norm: { Args: { "": string }; Returns: string }
      unaccent: { Args: { "": string }; Returns: string }
      user_purchased_product: {
        Args: { _product_id: string; _user_id: string }
        Returns: boolean
      }
      user_role_unidade: {
        Args: { _role: string; _user_id: string }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "user"
        | "catalog"
        | "fulfillment"
        | "manager"
        | "cashier"
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
      app_role: [
        "admin",
        "user",
        "catalog",
        "fulfillment",
        "manager",
        "cashier",
      ],
    },
  },
} as const
