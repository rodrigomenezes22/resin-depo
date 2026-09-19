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
      bank_accounts: {
        Row: {
          aba_routing: string | null
          account_number: string | null
          bank_address: string | null
          bank_name: string
          beneficiary_name: string
          created_at: string
          currency: string
          iban: string | null
          id: string
          is_default: boolean
          label: string | null
          org_id: string
          swift_code: string | null
        }
        Insert: {
          aba_routing?: string | null
          account_number?: string | null
          bank_address?: string | null
          bank_name: string
          beneficiary_name: string
          created_at?: string
          currency?: string
          iban?: string | null
          id?: string
          is_default?: boolean
          label?: string | null
          org_id: string
          swift_code?: string | null
        }
        Update: {
          aba_routing?: string | null
          account_number?: string | null
          bank_address?: string | null
          bank_name?: string
          beneficiary_name?: string
          created_at?: string
          currency?: string
          iban?: string | null
          id?: string
          is_default?: boolean
          label?: string | null
          org_id?: string
          swift_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          contact_name: string | null
          country: string | null
          created_at: string
          deactivated_at: string | null
          email: string | null
          id: string
          instructions: string | null
          kind: Database["public"]["Enums"]["location_kind"]
          name: string
          operated_by_org_id: string | null
          phone: string | null
          rail_number: string | null
          state: string | null
          surcharge_amount: number | null
          surcharge_basis: string | null
          surcharge_free_days: number | null
          surcharge_period: string
          unlocode: string | null
          updated_at: string | null
          updated_by: string | null
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          deactivated_at?: string | null
          email?: string | null
          id?: string
          instructions?: string | null
          kind?: Database["public"]["Enums"]["location_kind"]
          name: string
          operated_by_org_id?: string | null
          phone?: string | null
          rail_number?: string | null
          state?: string | null
          surcharge_amount?: number | null
          surcharge_basis?: string | null
          surcharge_free_days?: number | null
          surcharge_period?: string
          unlocode?: string | null
          updated_at?: string | null
          updated_by?: string | null
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          deactivated_at?: string | null
          email?: string | null
          id?: string
          instructions?: string | null
          kind?: Database["public"]["Enums"]["location_kind"]
          name?: string
          operated_by_org_id?: string | null
          phone?: string | null
          rail_number?: string | null
          state?: string | null
          surcharge_amount?: number | null
          surcharge_basis?: string | null
          surcharge_free_days?: number | null
          surcharge_period?: string
          unlocode?: string | null
          updated_at?: string | null
          updated_by?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_operated_by_org_id_fkey"
            columns: ["operated_by_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lots: {
        Row: {
          created_at: string
          id: string
        }
        Insert: {
          created_at?: string
          id?: string
        }
        Update: {
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      matched_orders: {
        Row: {
          broker_id: string
          buyer_company_id: string | null
          buyer_company_text: string | null
          buyer_po: string | null
          buyer_terms: string | null
          commission_pct: number
          created_at: string
          display_number: number
          freight: number
          id: string
          insurance_terms: string | null
          leg_index: number | null
          legacy_number: string | null
          market: Database["public"]["Enums"]["order_market"]
          notes: string | null
          parent_matched_order_id: string | null
          product_id: string | null
          product_text: string | null
          qty: number
          quality: Database["public"]["Enums"]["order_quality"]
          quantity_lbs: number
          seller_company_id: string | null
          seller_company_text: string | null
          seller_terms: string | null
          ship_status: Database["public"]["Enums"]["ship_status"]
          shipment_window: string | null
          shipping_terms: string | null
          status: string
          tolerance_pct: number
          tpe_buy_price: number
          tpe_sell_price: number
          unit: Database["public"]["Enums"]["order_unit"]
        }
        Insert: {
          broker_id: string
          buyer_company_id?: string | null
          buyer_company_text?: string | null
          buyer_po?: string | null
          buyer_terms?: string | null
          commission_pct?: number
          created_at?: string
          display_number?: number
          freight?: number
          id?: string
          insurance_terms?: string | null
          leg_index?: number | null
          legacy_number?: string | null
          market?: Database["public"]["Enums"]["order_market"]
          notes?: string | null
          parent_matched_order_id?: string | null
          product_id?: string | null
          product_text?: string | null
          qty: number
          quality?: Database["public"]["Enums"]["order_quality"]
          quantity_lbs?: number
          seller_company_id?: string | null
          seller_company_text?: string | null
          seller_terms?: string | null
          ship_status?: Database["public"]["Enums"]["ship_status"]
          shipment_window?: string | null
          shipping_terms?: string | null
          status?: string
          tolerance_pct?: number
          tpe_buy_price?: number
          tpe_sell_price: number
          unit: Database["public"]["Enums"]["order_unit"]
        }
        Update: {
          broker_id?: string
          buyer_company_id?: string | null
          buyer_company_text?: string | null
          buyer_po?: string | null
          buyer_terms?: string | null
          commission_pct?: number
          created_at?: string
          display_number?: number
          freight?: number
          id?: string
          insurance_terms?: string | null
          leg_index?: number | null
          legacy_number?: string | null
          market?: Database["public"]["Enums"]["order_market"]
          notes?: string | null
          parent_matched_order_id?: string | null
          product_id?: string | null
          product_text?: string | null
          qty?: number
          quality?: Database["public"]["Enums"]["order_quality"]
          quantity_lbs?: number
          seller_company_id?: string | null
          seller_company_text?: string | null
          seller_terms?: string | null
          ship_status?: Database["public"]["Enums"]["ship_status"]
          shipment_window?: string | null
          shipping_terms?: string | null
          status?: string
          tolerance_pct?: number
          tpe_buy_price?: number
          tpe_sell_price?: number
          unit?: Database["public"]["Enums"]["order_unit"]
        }
        Relationships: [
          {
            foreignKeyName: "matched_orders_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matched_orders_buyer_company_id_fkey"
            columns: ["buyer_company_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matched_orders_parent_matched_order_id_fkey"
            columns: ["parent_matched_order_id"]
            isOneToOne: false
            referencedRelation: "matched_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matched_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matched_orders_seller_company_id_fkey"
            columns: ["seller_company_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_locations: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          location_id: string
          organization_id: string
          role: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          location_id: string
          organization_id: string
          role: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          location_id?: string
          organization_id?: string
          role?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_locations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          contact_name: string | null
          created_at: string
          credit_available: number
          credit_limit: number
          deactivated_at: string | null
          email: string | null
          eori: string | null
          id: string
          name: string
          payment_terms_days: number
          phone: string | null
          role: string
          service_kind: string | null
          tax_id: string | null
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          credit_available?: number
          credit_limit?: number
          deactivated_at?: string | null
          email?: string | null
          eori?: string | null
          id?: string
          name: string
          payment_terms_days?: number
          phone?: string | null
          role: string
          service_kind?: string | null
          tax_id?: string | null
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          credit_available?: number
          credit_limit?: number
          deactivated_at?: string | null
          email?: string | null
          eori?: string | null
          id?: string
          name?: string
          payment_terms_days?: number
          phone?: string | null
          role?: string
          service_kind?: string | null
          tax_id?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          base_unit: string
          country_of_origin: string | null
          created_at: string
          hs_code: string | null
          id: string
          name: string
        }
        Insert: {
          base_unit?: string
          country_of_origin?: string | null
          created_at?: string
          hs_code?: string | null
          id?: string
          name: string
        }
        Update: {
          base_unit?: string
          country_of_origin?: string | null
          created_at?: string
          hs_code?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      shipment_container_lots: {
        Row: {
          container_id: string
          created_at: string
          id: string
          lot_id: string | null
          lot_number_text: string | null
          position: number
          qty_lbs: number | null
        }
        Insert: {
          container_id: string
          created_at?: string
          id?: string
          lot_id?: string | null
          lot_number_text?: string | null
          position?: number
          qty_lbs?: number | null
        }
        Update: {
          container_id?: string
          created_at?: string
          id?: string
          lot_id?: string | null
          lot_number_text?: string | null
          position?: number
          qty_lbs?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_container_lots_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "shipment_containers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_container_lots_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_containers: {
        Row: {
          container_number: string | null
          container_type: string | null
          created_at: string
          gross_weight_lbs: number | null
          id: string
          marks_and_numbers: string | null
          matched_order_id: string
          net_weight_lbs: number | null
          package_count: number | null
          package_kind: string | null
          package_weight_lbs: number | null
          pallet_count: number | null
          position: number
          rolled_from_group_id: string | null
          seal_number: string | null
          shipment_group_id: string | null
          tare_weight_lbs: number | null
        }
        Insert: {
          container_number?: string | null
          container_type?: string | null
          created_at?: string
          gross_weight_lbs?: number | null
          id?: string
          marks_and_numbers?: string | null
          matched_order_id: string
          net_weight_lbs?: number | null
          package_count?: number | null
          package_kind?: string | null
          package_weight_lbs?: number | null
          pallet_count?: number | null
          position?: number
          rolled_from_group_id?: string | null
          seal_number?: string | null
          shipment_group_id?: string | null
          tare_weight_lbs?: number | null
        }
        Update: {
          container_number?: string | null
          container_type?: string | null
          created_at?: string
          gross_weight_lbs?: number | null
          id?: string
          marks_and_numbers?: string | null
          matched_order_id?: string
          net_weight_lbs?: number | null
          package_count?: number | null
          package_kind?: string | null
          package_weight_lbs?: number | null
          pallet_count?: number | null
          position?: number
          rolled_from_group_id?: string | null
          seal_number?: string | null
          shipment_group_id?: string | null
          tare_weight_lbs?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_containers_matched_order_id_fkey"
            columns: ["matched_order_id"]
            isOneToOne: true
            referencedRelation: "matched_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_containers_rolled_from_group_id_fkey"
            columns: ["rolled_from_group_id"]
            isOneToOne: false
            referencedRelation: "shipment_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_containers_shipment_group_id_fkey"
            columns: ["shipment_group_id"]
            isOneToOne: false
            referencedRelation: "shipment_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_document_containers: {
        Row: {
          container_id: string
          document_id: string
        }
        Insert: {
          container_id: string
          document_id: string
        }
        Update: {
          container_id?: string
          document_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_document_containers_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "shipment_containers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_document_containers_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "shipment_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_documents: {
        Row: {
          created_at: string
          created_by: string | null
          display_number: number
          doc_type: Database["public"]["Enums"]["shipment_doc_type"]
          document_number: string
          generated_path: string | null
          id: string
          issued_at: string | null
          payload: Json
          revision: number
          shipment_group_id: string
          status: Database["public"]["Enums"]["shipment_doc_status"]
          supersedes_id: string | null
          uploaded_path: string | null
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_number?: number
          doc_type: Database["public"]["Enums"]["shipment_doc_type"]
          document_number: string
          generated_path?: string | null
          id?: string
          issued_at?: string | null
          payload?: Json
          revision?: number
          shipment_group_id: string
          status?: Database["public"]["Enums"]["shipment_doc_status"]
          supersedes_id?: string | null
          uploaded_path?: string | null
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_number?: number
          doc_type?: Database["public"]["Enums"]["shipment_doc_type"]
          document_number?: string
          generated_path?: string | null
          id?: string
          issued_at?: string | null
          payload?: Json
          revision?: number
          shipment_group_id?: string
          status?: Database["public"]["Enums"]["shipment_doc_status"]
          supersedes_id?: string | null
          uploaded_path?: string | null
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_documents_shipment_group_id_fkey"
            columns: ["shipment_group_id"]
            isOneToOne: false
            referencedRelation: "shipment_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_documents_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "shipment_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_files: {
        Row: {
          buyer_access: boolean
          content_type: string
          created_at: string
          created_by: string | null
          description: string | null
          file_name: string
          id: string
          matched_order_id: string | null
          seller_access: boolean
          shipment_group_id: string | null
          size_bytes: number
          storage_path: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          buyer_access?: boolean
          content_type: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_name: string
          id?: string
          matched_order_id?: string | null
          seller_access?: boolean
          shipment_group_id?: string | null
          size_bytes: number
          storage_path: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          buyer_access?: boolean
          content_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_name?: string
          id?: string
          matched_order_id?: string | null
          seller_access?: boolean
          shipment_group_id?: string | null
          size_bytes?: number
          storage_path?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_files_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_files_matched_order_id_fkey"
            columns: ["matched_order_id"]
            isOneToOne: false
            referencedRelation: "matched_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_files_shipment_group_id_fkey"
            columns: ["shipment_group_id"]
            isOneToOne: false
            referencedRelation: "shipment_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_files_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_group_costs: {
        Row: {
          amount: number
          cost_type: Database["public"]["Enums"]["export_cost_type"]
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          invoice_document_path: string | null
          invoice_number: string | null
          shipment_group_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          amount: number
          cost_type: Database["public"]["Enums"]["export_cost_type"]
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          invoice_document_path?: string | null
          invoice_number?: string | null
          shipment_group_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          amount?: number
          cost_type?: Database["public"]["Enums"]["export_cost_type"]
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          invoice_document_path?: string | null
          invoice_number?: string | null
          shipment_group_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_group_costs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_group_costs_shipment_group_id_fkey"
            columns: ["shipment_group_id"]
            isOneToOne: false
            referencedRelation: "shipment_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_group_costs_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_group_events: {
        Row: {
          event_type: string
          id: string
          occurred_at: string
          payload: Json
          performed_by: string | null
          shipment_group_id: string
        }
        Insert: {
          event_type: string
          id?: string
          occurred_at?: string
          payload?: Json
          performed_by?: string | null
          shipment_group_id: string
        }
        Update: {
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json
          performed_by?: string | null
          shipment_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_group_events_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_group_events_shipment_group_id_fkey"
            columns: ["shipment_group_id"]
            isOneToOne: false
            referencedRelation: "shipment_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_groups: {
        Row: {
          aes_itn: string | null
          booking_number: string | null
          carrier_org_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          display_number: number
          dthc_terms: string | null
          eta: string | null
          etd: string | null
          final_destination: string | null
          fmc_number: string | null
          forwarding_agent: string | null
          freight_terms: string | null
          hbl_number: string | null
          id: string
          incoterm: Database["public"]["Enums"]["incoterm"]
          loading_terminal: string | null
          master_bl_number: string | null
          notes: string | null
          place_of_delivery: string | null
          place_of_receipt: string | null
          pod_location_id: string | null
          pol_location_id: string | null
          rolled_from_group_id: string | null
          status: Database["public"]["Enums"]["shipment_group_status"]
          type_of_move: string | null
          vessel_name: string | null
          voyage_number: string | null
        }
        Insert: {
          aes_itn?: string | null
          booking_number?: string | null
          carrier_org_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          display_number?: number
          dthc_terms?: string | null
          eta?: string | null
          etd?: string | null
          final_destination?: string | null
          fmc_number?: string | null
          forwarding_agent?: string | null
          freight_terms?: string | null
          hbl_number?: string | null
          id?: string
          incoterm?: Database["public"]["Enums"]["incoterm"]
          loading_terminal?: string | null
          master_bl_number?: string | null
          notes?: string | null
          place_of_delivery?: string | null
          place_of_receipt?: string | null
          pod_location_id?: string | null
          pol_location_id?: string | null
          rolled_from_group_id?: string | null
          status?: Database["public"]["Enums"]["shipment_group_status"]
          type_of_move?: string | null
          vessel_name?: string | null
          voyage_number?: string | null
        }
        Update: {
          aes_itn?: string | null
          booking_number?: string | null
          carrier_org_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          display_number?: number
          dthc_terms?: string | null
          eta?: string | null
          etd?: string | null
          final_destination?: string | null
          fmc_number?: string | null
          forwarding_agent?: string | null
          freight_terms?: string | null
          hbl_number?: string | null
          id?: string
          incoterm?: Database["public"]["Enums"]["incoterm"]
          loading_terminal?: string | null
          master_bl_number?: string | null
          notes?: string | null
          place_of_delivery?: string | null
          place_of_receipt?: string | null
          pod_location_id?: string | null
          pol_location_id?: string | null
          rolled_from_group_id?: string | null
          status?: Database["public"]["Enums"]["shipment_group_status"]
          type_of_move?: string | null
          vessel_name?: string | null
          voyage_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_groups_carrier_org_id_fkey"
            columns: ["carrier_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_groups_pod_location_id_fkey"
            columns: ["pod_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_groups_pol_location_id_fkey"
            columns: ["pol_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_groups_rolled_from_group_id_fkey"
            columns: ["rolled_from_group_id"]
            isOneToOne: false
            referencedRelation: "shipment_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          organization_id: string | null
          organization_name: string | null
          platform_role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_name?: string | null
          id: string
          last_name?: string | null
          organization_id?: string | null
          organization_name?: string | null
          platform_role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          organization_id?: string | null
          organization_name?: string | null
          platform_role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allocate_shipment_costs: {
        Args: { p_group_id: string }
        Returns: undefined
      }
      get_platform_role: { Args: never; Returns: string }
      shipment_document_editable_keys: {
        Args: { p_doc_type: Database["public"]["Enums"]["shipment_doc_type"] }
        Returns: string[]
      }
    }
    Enums: {
      export_cost_type:
        | "ocean_freight"
        | "thc"
        | "documentation"
        | "insurance"
        | "customs"
        | "other"
      incoterm: "EXW" | "FCA" | "FAS" | "FOB" | "CFR" | "CIF" | "DAP" | "DDP"
      location_kind: "warehouse" | "port" | "customer_dock" | "office"
      order_market: "domestic" | "international"
      order_quality: "prime" | "offgrade" | "regrind"
      order_unit:
        | "railcar"
        | "bulk_truck"
        | "truckload_boxes"
        | "truckload_bags"
        | "barrel"
        | "supersacks"
        | "pounds"
        | "metric_tonnes"
        | "container_20"
        | "container_40"
        | "container_40hc"
        | "bags_25kg"
        | "container"
        | "heavy_container"
        | "truckload_supersacks"
      ship_status: "inventory" | "enroute" | "delivered" | "client_reserved"
      shipment_doc_status: "draft" | "issued" | "superseded" | "void"
      shipment_doc_type:
        | "commercial_invoice"
        | "packing_list"
        | "sales_contract"
        | "proforma_invoice"
        | "certificate_of_origin"
      shipment_group_status:
        | "draft"
        | "booked"
        | "sailed"
        | "arrived"
        | "closed"
        | "cancelled"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      export_cost_type: [
        "ocean_freight",
        "thc",
        "documentation",
        "insurance",
        "customs",
        "other",
      ],
      incoterm: ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "DAP", "DDP"],
      location_kind: ["warehouse", "port", "customer_dock", "office"],
      order_market: ["domestic", "international"],
      order_quality: ["prime", "offgrade", "regrind"],
      order_unit: [
        "railcar",
        "bulk_truck",
        "truckload_boxes",
        "truckload_bags",
        "barrel",
        "supersacks",
        "pounds",
        "metric_tonnes",
        "container_20",
        "container_40",
        "container_40hc",
        "bags_25kg",
        "container",
        "heavy_container",
        "truckload_supersacks",
      ],
      ship_status: ["inventory", "enroute", "delivered", "client_reserved"],
      shipment_doc_status: ["draft", "issued", "superseded", "void"],
      shipment_doc_type: [
        "commercial_invoice",
        "packing_list",
        "sales_contract",
        "proforma_invoice",
        "certificate_of_origin",
      ],
      shipment_group_status: [
        "draft",
        "booked",
        "sailed",
        "arrived",
        "closed",
        "cancelled",
      ],
    },
  },
} as const
