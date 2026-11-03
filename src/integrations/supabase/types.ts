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
      account_snapshots: {
        Row: {
          account_id: string
          bio_verbatim: string | null
          captured_at: string
          created: string | null
          display_name: string | null
          followers: number | null
          following: number | null
          id: string
          verified: boolean | null
        }
        Insert: {
          account_id: string
          bio_verbatim?: string | null
          captured_at?: string
          created?: string | null
          display_name?: string | null
          followers?: number | null
          following?: number | null
          id?: string
          verified?: boolean | null
        }
        Update: {
          account_id?: string
          bio_verbatim?: string | null
          captured_at?: string
          created?: string | null
          display_name?: string | null
          followers?: number | null
          following?: number | null
          id?: string
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "account_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          created_at: string
          display_name: string | null
          handle: string
          id: string
          incident_uuid: string
          platform: string
          platform_id: string | null
          profile_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          handle: string
          id?: string
          incident_uuid: string
          platform?: string
          platform_id?: string | null
          profile_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          handle?: string
          id?: string
          incident_uuid?: string
          platform?: string
          platform_id?: string | null
          profile_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_incident_uuid_fkey"
            columns: ["incident_uuid"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      analyst_assessments: {
        Row: {
          analyst: string | null
          assessed_on: string
          assessment: string
          basis: string | null
          created_at: string
          id: string
          item_id: string | null
          subject_profile_id: string | null
        }
        Insert: {
          analyst?: string | null
          assessed_on?: string
          assessment: string
          basis?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          subject_profile_id?: string | null
        }
        Update: {
          analyst?: string | null
          assessed_on?: string
          assessment?: string
          basis?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          subject_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analyst_assessments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analyst_assessments_subject_profile_id_fkey"
            columns: ["subject_profile_id"]
            isOneToOne: false
            referencedRelation: "subject_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      artefacts: {
        Row: {
          captured_at: string
          created_at: string
          filename: string
          id: string
          item_id: string
          kind: string
          mime_type: string | null
          sha256: string | null
          size_bytes: number | null
          storage_path: string
        }
        Insert: {
          captured_at?: string
          created_at?: string
          filename: string
          id?: string
          item_id: string
          kind: string
          mime_type?: string | null
          sha256?: string | null
          size_bytes?: number | null
          storage_path: string
        }
        Update: {
          captured_at?: string
          created_at?: string
          filename?: string
          id?: string
          item_id?: string
          kind?: string
          mime_type?: string | null
          sha256?: string | null
          size_bytes?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "artefacts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      capture_jobs: {
        Row: {
          case_id: string | null
          case_meta: Json
          claimed_at: string | null
          created_at: string
          created_by: string | null
          finished_at: string | null
          handler: string | null
          id: string
          incident_date: string | null
          incident_id: string | null
          incident_meta: Json
          log: string[]
          options: Json
          result: Json | null
          status: string
          updated_at: string
          url: string
          warnings: string[]
        }
        Insert: {
          case_id?: string | null
          case_meta?: Json
          claimed_at?: string | null
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          handler?: string | null
          id?: string
          incident_date?: string | null
          incident_id?: string | null
          incident_meta?: Json
          log?: string[]
          options?: Json
          result?: Json | null
          status?: string
          updated_at?: string
          url: string
          warnings?: string[]
        }
        Update: {
          case_id?: string | null
          case_meta?: Json
          claimed_at?: string | null
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          handler?: string | null
          id?: string
          incident_date?: string | null
          incident_id?: string | null
          incident_meta?: Json
          log?: string[]
          options?: Json
          result?: Json | null
          status?: string
          updated_at?: string
          url?: string
          warnings?: string[]
        }
        Relationships: []
      }
      capture_settings: {
        Row: {
          expand_comments: boolean
          fb_account_label: string | null
          id: string
          notes: string | null
          profile_fields: Json
          proxy_url: string | null
          save_pdf: boolean
          timeout_seconds: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          expand_comments?: boolean
          fb_account_label?: string | null
          id?: string
          notes?: string | null
          profile_fields?: Json
          proxy_url?: string | null
          save_pdf?: boolean
          timeout_seconds?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          expand_comments?: boolean
          fb_account_label?: string | null
          id?: string
          notes?: string | null
          profile_fields?: Json
          proxy_url?: string | null
          save_pdf?: boolean
          timeout_seconds?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      case_assignments: {
        Row: {
          assigned_by: string | null
          case_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          case_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          case_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_assignments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          fields: Json
          id: string
          is_default: boolean
          jurisdiction_agency: string | null
          name: string
          offence_alleged: string | null
          required_artefacts: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          fields?: Json
          id?: string
          is_default?: boolean
          jurisdiction_agency?: string | null
          name: string
          offence_alleged?: string | null
          required_artefacts?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          fields?: Json
          id?: string
          is_default?: boolean
          jurisdiction_agency?: string | null
          name?: string
          offence_alleged?: string | null
          required_artefacts?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      cases: {
        Row: {
          created_at: string
          id: string
          jurisdiction_agency: string | null
          lead_handler: string | null
          notes: string | null
          offence_alleged: string | null
          opened_on: string
          related_cases: string[]
          status: string
          target_of_complaint: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          jurisdiction_agency?: string | null
          lead_handler?: string | null
          notes?: string | null
          offence_alleged?: string | null
          opened_on?: string
          related_cases?: string[]
          status?: string
          target_of_complaint?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          jurisdiction_agency?: string | null
          lead_handler?: string | null
          notes?: string | null
          offence_alleged?: string | null
          opened_on?: string
          related_cases?: string[]
          status?: string
          target_of_complaint?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      client_access_events: {
        Row: {
          action: string
          actor: string | null
          client_id: string
          client_user_id: string | null
          created_at: string
          detail: Json
          id: string
        }
        Insert: {
          action: string
          actor?: string | null
          client_id: string
          client_user_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
        }
        Update: {
          action?: string
          actor?: string | null
          client_id?: string
          client_user_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_access_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_access_events_client_user_id_fkey"
            columns: ["client_user_id"]
            isOneToOne: false
            referencedRelation: "client_users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_users: {
        Row: {
          client_id: string
          created_at: string
          email: string
          id: string
          invite_expires_at: string | null
          invite_token_hash: string | null
          invite_used_at: string | null
          invited_by: string | null
          last_sign_in: string | null
          name: string
          notify: Json
          role: string
          status: string
          user_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          email: string
          id?: string
          invite_expires_at?: string | null
          invite_token_hash?: string | null
          invite_used_at?: string | null
          invited_by?: string | null
          last_sign_in?: string | null
          name: string
          notify?: Json
          role?: string
          status?: string
          user_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string
          id?: string
          invite_expires_at?: string | null
          invite_token_hash?: string | null
          invite_used_at?: string | null
          invited_by?: string | null
          last_sign_in?: string | null
          name?: string
          notify?: Json
          role?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          code: string
          contact_email: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          display_name: string | null
          id: string
          kind: string
          legal_name: string | null
          name: string
          notes: string | null
          phone: string | null
          portal_enabled: boolean
          sector: string | null
          status: string
          time_zone: string
          updated_at: string
        }
        Insert: {
          code: string
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          id?: string
          kind?: string
          legal_name?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          portal_enabled?: boolean
          sector?: string | null
          status?: string
          time_zone?: string
          updated_at?: string
        }
        Update: {
          code?: string
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          id?: string
          kind?: string
          legal_name?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          portal_enabled?: boolean
          sector?: string | null
          status?: string
          time_zone?: string
          updated_at?: string
        }
        Relationships: []
      }
      clock_pauses: {
        Row: {
          clock_id: string
          id: string
          note: string | null
          paused_at: string
          paused_by: string
          reason: string
          resumed_at: string | null
          resumed_by: string | null
        }
        Insert: {
          clock_id: string
          id?: string
          note?: string | null
          paused_at?: string
          paused_by: string
          reason: string
          resumed_at?: string | null
          resumed_by?: string | null
        }
        Update: {
          clock_id?: string
          id?: string
          note?: string | null
          paused_at?: string
          paused_by?: string
          reason?: string
          resumed_at?: string | null
          resumed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clock_pauses_clock_id_fkey"
            columns: ["clock_id"]
            isOneToOne: false
            referencedRelation: "phase_clocks"
            referencedColumns: ["id"]
          },
        ]
      }
      custody_events: {
        Row: {
          action: string
          artefact_id: string | null
          created_at: string
          evidence_ref_id: string | null
          filename: string | null
          handler: string | null
          id: string
          item_id: string | null
          notes: string | null
          sha256: string | null
          source_id: string
          tool_version: string | null
        }
        Insert: {
          action: string
          artefact_id?: string | null
          created_at?: string
          evidence_ref_id?: string | null
          filename?: string | null
          handler?: string | null
          id?: string
          item_id?: string | null
          notes?: string | null
          sha256?: string | null
          source_id?: string
          tool_version?: string | null
        }
        Update: {
          action?: string
          artefact_id?: string | null
          created_at?: string
          evidence_ref_id?: string | null
          filename?: string | null
          handler?: string | null
          id?: string
          item_id?: string | null
          notes?: string | null
          sha256?: string | null
          source_id?: string
          tool_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custody_events_artefact_id_fkey"
            columns: ["artefact_id"]
            isOneToOne: false
            referencedRelation: "artefacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custody_events_evidence_ref_id_fkey"
            columns: ["evidence_ref_id"]
            isOneToOne: false
            referencedRelation: "evidence_refs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custody_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custody_events_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      document_events: {
        Row: {
          action: string
          actor: string | null
          actor_kind: string
          at: string
          client_id: string
          detail: Json
          document_id: string
          id: string
          reason: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          actor_kind?: string
          at?: string
          client_id: string
          detail?: Json
          document_id: string
          id?: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          actor_kind?: string
          at?: string
          client_id?: string
          detail?: Json
          document_id?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_events_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          brief_id: string | null
          client_id: string
          code: string
          created_at: string
          created_by: string | null
          created_by_name: string | null
          engagement_id: string | null
          file_name: string | null
          id: string
          kind: string
          manifest_only: boolean
          output_id: string | null
          output_status: string | null
          sha256: string | null
          size_bytes: number | null
          source: string
          storage_bucket: string | null
          storage_path: string | null
          title: string
          updated_at: string
          version: number
          visibility: string
          voided: boolean
          voided_note: string | null
        }
        Insert: {
          brief_id?: string | null
          client_id: string
          code?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          engagement_id?: string | null
          file_name?: string | null
          id?: string
          kind: string
          manifest_only?: boolean
          output_id?: string | null
          output_status?: string | null
          sha256?: string | null
          size_bytes?: number | null
          source: string
          storage_bucket?: string | null
          storage_path?: string | null
          title: string
          updated_at?: string
          version?: number
          visibility?: string
          voided?: boolean
          voided_note?: string | null
        }
        Update: {
          brief_id?: string | null
          client_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          engagement_id?: string | null
          file_name?: string | null
          id?: string
          kind?: string
          manifest_only?: boolean
          output_id?: string | null
          output_status?: string | null
          sha256?: string | null
          size_bytes?: number | null
          source?: string
          storage_bucket?: string | null
          storage_path?: string | null
          title?: string
          updated_at?: string
          version?: number
          visibility?: string
          voided?: boolean
          voided_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: true
            referencedRelation: "project_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: true
            referencedRelation: "project_current_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_output_id_fkey"
            columns: ["output_id"]
            isOneToOne: true
            referencedRelation: "project_outputs"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_refs: {
        Row: {
          case_id: string
          files: Json
          id: string
          incident_id: string | null
          item_type: string | null
          linked_at: string
          linked_by: string | null
          linked_by_name: string | null
          note: string | null
          platform: string | null
          published_at: string | null
          record_code: string | null
          record_id: string
          source_id: string
        }
        Insert: {
          case_id: string
          files?: Json
          id?: string
          incident_id?: string | null
          item_type?: string | null
          linked_at?: string
          linked_by?: string | null
          linked_by_name?: string | null
          note?: string | null
          platform?: string | null
          published_at?: string | null
          record_code?: string | null
          record_id: string
          source_id: string
        }
        Update: {
          case_id?: string
          files?: Json
          id?: string
          incident_id?: string | null
          item_type?: string | null
          linked_at?: string
          linked_by?: string | null
          linked_by_name?: string | null
          note?: string | null
          platform?: string | null
          published_at?: string | null
          record_code?: string | null
          record_id?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_refs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_refs_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_refs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          case_id: string
          created_at: string
          end_date: string | null
          escalation_stage: string | null
          id: string
          incident_id: string
          narrative_themes: string[]
          start_date: string | null
          summary: string | null
          updated_at: string
        }
        Insert: {
          case_id: string
          created_at?: string
          end_date?: string | null
          escalation_stage?: string | null
          id?: string
          incident_id: string
          narrative_themes?: string[]
          start_date?: string | null
          summary?: string | null
          updated_at?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          end_date?: string | null
          escalation_stage?: string | null
          id?: string
          incident_id?: string
          narrative_themes?: string[]
          start_date?: string | null
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          account_id: string
          author_handle: string | null
          author_name: string | null
          author_url: string | null
          captured_at: string
          created_at: string
          engagement: Json
          folder_path: string | null
          id: string
          item_code: string
          item_type: string
          parent_item_id: string | null
          platform_item_id: string | null
          published_at: string | null
          text_en: string | null
          text_original: string | null
          translator_statement: string | null
          url: string | null
        }
        Insert: {
          account_id: string
          author_handle?: string | null
          author_name?: string | null
          author_url?: string | null
          captured_at?: string
          created_at?: string
          engagement?: Json
          folder_path?: string | null
          id?: string
          item_code: string
          item_type: string
          parent_item_id?: string | null
          platform_item_id?: string | null
          published_at?: string | null
          text_en?: string | null
          text_original?: string | null
          translator_statement?: string | null
          url?: string | null
        }
        Update: {
          account_id?: string
          author_handle?: string | null
          author_name?: string | null
          author_url?: string | null
          captured_at?: string
          created_at?: string
          engagement?: Json
          folder_path?: string | null
          id?: string
          item_code?: string
          item_type?: string
          parent_item_id?: string | null
          platform_item_id?: string | null
          published_at?: string | null
          text_en?: string | null
          text_original?: string | null
          translator_statement?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      phase_clocks: {
        Row: {
          at_risk_alerted: boolean
          breach_alerted: boolean
          completed_at: string | null
          cycle_no: number | null
          id: string
          phase: number
          project_id: string
          sop_id: string
          started_at: string
        }
        Insert: {
          at_risk_alerted?: boolean
          breach_alerted?: boolean
          completed_at?: string | null
          cycle_no?: number | null
          id?: string
          phase: number
          project_id: string
          sop_id: string
          started_at?: string
        }
        Update: {
          at_risk_alerted?: boolean
          breach_alerted?: boolean
          completed_at?: string | null
          cycle_no?: number | null
          id?: string
          phase?: number
          project_id?: string
          sop_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phase_clocks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_clocks_sop_id_fkey"
            columns: ["sop_id"]
            isOneToOne: false
            referencedRelation: "sop_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          default_handler: string | null
          display_name: string | null
          email: string | null
          id: string
          is_owner: boolean
        }
        Insert: {
          created_at?: string
          default_handler?: string | null
          display_name?: string | null
          email?: string | null
          id: string
          is_owner?: boolean
        }
        Update: {
          created_at?: string
          default_handler?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          is_owner?: boolean
        }
        Relationships: []
      }
      project_amendment_approvals: {
        Row: {
          brief_id: string
          decided_at: string
          decided_by: string | null
          decided_by_name: string | null
          decision: string
          id: string
          note: string | null
          project_id: string
        }
        Insert: {
          brief_id: string
          decided_at?: string
          decided_by?: string | null
          decided_by_name?: string | null
          decision: string
          id?: string
          note?: string | null
          project_id: string
        }
        Update: {
          brief_id?: string
          decided_at?: string
          decided_by?: string | null
          decided_by_name?: string | null
          decision?: string
          id?: string
          note?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_amendment_approvals_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: true
            referencedRelation: "project_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_amendment_approvals_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: true
            referencedRelation: "project_current_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_amendment_approvals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_briefs: {
        Row: {
          amendment_no: number | null
          audiences: Json
          authored_at: string
          authored_by: string | null
          authored_by_name: string | null
          caps: string | null
          change_reason: string | null
          change_summary: string | null
          constraints_risks: Json
          facts: Json
          governance: Json
          held_groups: string | null
          id: string
          in_scope: string | null
          kind: string
          languages: string[]
          objectives: string[]
          out_of_scope: string | null
          platforms: string[]
          project_id: string
          purpose_decisions: string | null
          ranked_asks: Json
          requested_by: string | null
          research_content_note: string | null
          response_parameters: Json
          sample_rule: string | null
          scope_changed: boolean
          situation: string | null
          unknowns: string[]
          version: number
          window_from: string | null
          window_to: string | null
        }
        Insert: {
          amendment_no?: number | null
          audiences?: Json
          authored_at?: string
          authored_by?: string | null
          authored_by_name?: string | null
          caps?: string | null
          change_reason?: string | null
          change_summary?: string | null
          constraints_risks?: Json
          facts?: Json
          governance?: Json
          held_groups?: string | null
          id?: string
          in_scope?: string | null
          kind?: string
          languages?: string[]
          objectives?: string[]
          out_of_scope?: string | null
          platforms?: string[]
          project_id: string
          purpose_decisions?: string | null
          ranked_asks?: Json
          requested_by?: string | null
          research_content_note?: string | null
          response_parameters?: Json
          sample_rule?: string | null
          scope_changed?: boolean
          situation?: string | null
          unknowns?: string[]
          version: number
          window_from?: string | null
          window_to?: string | null
        }
        Update: {
          amendment_no?: number | null
          audiences?: Json
          authored_at?: string
          authored_by?: string | null
          authored_by_name?: string | null
          caps?: string | null
          change_reason?: string | null
          change_summary?: string | null
          constraints_risks?: Json
          facts?: Json
          governance?: Json
          held_groups?: string | null
          id?: string
          in_scope?: string | null
          kind?: string
          languages?: string[]
          objectives?: string[]
          out_of_scope?: string | null
          platforms?: string[]
          project_id?: string
          purpose_decisions?: string | null
          ranked_asks?: Json
          requested_by?: string | null
          research_content_note?: string | null
          response_parameters?: Json
          sample_rule?: string | null
          scope_changed?: boolean
          situation?: string | null
          unknowns?: string[]
          version?: number
          window_from?: string | null
          window_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_briefs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_captures: {
        Row: {
          archive_link: string
          captured_at_utc: string
          captured_by: string
          captured_by_name: string | null
          created_at: string
          custody_logged: boolean
          id: string
          project_id: string
          project_item_id: string
          screenshot_sha256: string
          second_person_check_by: string | null
          url_bar_clock_visible: boolean
        }
        Insert: {
          archive_link: string
          captured_at_utc: string
          captured_by?: string
          captured_by_name?: string | null
          created_at?: string
          custody_logged: boolean
          id?: string
          project_id: string
          project_item_id: string
          screenshot_sha256: string
          second_person_check_by?: string | null
          url_bar_clock_visible: boolean
        }
        Update: {
          archive_link?: string
          captured_at_utc?: string
          captured_by?: string
          captured_by_name?: string | null
          created_at?: string
          custody_logged?: boolean
          id?: string
          project_id?: string
          project_item_id?: string
          screenshot_sha256?: string
          second_person_check_by?: string | null
          url_bar_clock_visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "project_captures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_captures_project_item_id_fkey"
            columns: ["project_item_id"]
            isOneToOne: false
            referencedRelation: "project_items"
            referencedColumns: ["id"]
          },
        ]
      }
      project_cases: {
        Row: {
          case_id: string
          linked_at: string
          linked_by: string | null
          note: string | null
          project_id: string
          void_note: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          case_id: string
          linked_at?: string
          linked_by?: string | null
          note?: string | null
          project_id: string
          void_note?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          case_id?: string
          linked_at?: string
          linked_by?: string | null
          note?: string | null
          project_id?: string
          void_note?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_cases_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_cases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_closeouts: {
        Row: {
          archive_manifest_sha256: string
          archive_ref: string
          closed_at: string
          closed_by: string | null
          closed_by_name: string | null
          design_frozen_version: number
          id: string
          lessons_learned: string
          project_id: string
          retention_note: string | null
          retention_years: number
        }
        Insert: {
          archive_manifest_sha256: string
          archive_ref: string
          closed_at?: string
          closed_by?: string | null
          closed_by_name?: string | null
          design_frozen_version: number
          id?: string
          lessons_learned: string
          project_id: string
          retention_note?: string | null
          retention_years?: number
        }
        Update: {
          archive_manifest_sha256?: string
          archive_ref?: string
          closed_at?: string
          closed_by?: string | null
          closed_by_name?: string | null
          design_frozen_version?: number
          id?: string
          lessons_learned?: string
          project_id?: string
          retention_note?: string | null
          retention_years?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_closeouts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_confirmations: {
        Row: {
          confirmed_at: string
          confirmed_by: string
          confirmed_by_name: string | null
          decision_id: string
          id: string
          note: string | null
          project_id: string
          result: string
        }
        Insert: {
          confirmed_at?: string
          confirmed_by?: string
          confirmed_by_name?: string | null
          decision_id: string
          id?: string
          note?: string | null
          project_id: string
          result: string
        }
        Update: {
          confirmed_at?: string
          confirmed_by?: string
          confirmed_by_name?: string | null
          decision_id?: string
          id?: string
          note?: string | null
          project_id?: string
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_confirmations_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "project_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_confirmations_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "project_latest_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_confirmations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_cycles: {
        Row: {
          cycle_no: number
          id: string
          kind: string
          note: string | null
          opened_at: string
          opened_by: string | null
          project_id: string
          tag: string | null
        }
        Insert: {
          cycle_no: number
          id?: string
          kind: string
          note?: string | null
          opened_at?: string
          opened_by?: string | null
          project_id: string
          tag?: string | null
        }
        Update: {
          cycle_no?: number
          id?: string
          kind?: string
          note?: string | null
          opened_at?: string
          opened_by?: string | null
          project_id?: string
          tag?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_cycles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_decisions: {
        Row: {
          category: string | null
          decision: string
          exclusion_code: string | null
          id: string
          judgement_call: boolean
          judgement_note: string | null
          note: string | null
          project_id: string
          project_item_id: string
          read_at: string
          read_by: string
          read_by_name: string | null
          reason: string | null
          ruling: boolean
          severity: string | null
          target_group: string | null
        }
        Insert: {
          category?: string | null
          decision: string
          exclusion_code?: string | null
          id?: string
          judgement_call?: boolean
          judgement_note?: string | null
          note?: string | null
          project_id: string
          project_item_id: string
          read_at?: string
          read_by?: string
          read_by_name?: string | null
          reason?: string | null
          ruling?: boolean
          severity?: string | null
          target_group?: string | null
        }
        Update: {
          category?: string | null
          decision?: string
          exclusion_code?: string | null
          id?: string
          judgement_call?: boolean
          judgement_note?: string | null
          note?: string | null
          project_id?: string
          project_item_id?: string
          read_at?: string
          read_by?: string
          read_by_name?: string | null
          reason?: string | null
          ruling?: boolean
          severity?: string | null
          target_group?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_decisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_decisions_project_item_id_fkey"
            columns: ["project_item_id"]
            isOneToOne: false
            referencedRelation: "project_items"
            referencedColumns: ["id"]
          },
        ]
      }
      project_design_sheets: {
        Row: {
          authored_at: string
          authored_by: string | null
          authored_by_name: string | null
          comment_cap: number
          comment_order: string
          exclusion_codes: string[]
          id: string
          lexicon: Json
          lexicon_sample_tested: boolean
          lexicon_version: string
          obfuscated_spellings_tested: boolean
          project_id: string
          sample_rule: string
          traces: Json
          version: number
        }
        Insert: {
          authored_at?: string
          authored_by?: string | null
          authored_by_name?: string | null
          comment_cap: number
          comment_order: string
          exclusion_codes: string[]
          id?: string
          lexicon: Json
          lexicon_sample_tested?: boolean
          lexicon_version: string
          obfuscated_spellings_tested?: boolean
          project_id: string
          sample_rule: string
          traces: Json
          version: number
        }
        Update: {
          authored_at?: string
          authored_by?: string | null
          authored_by_name?: string | null
          comment_cap?: number
          comment_order?: string
          exclusion_codes?: string[]
          id?: string
          lexicon?: Json
          lexicon_sample_tested?: boolean
          lexicon_version?: string
          obfuscated_spellings_tested?: boolean
          project_id?: string
          sample_rule?: string
          traces?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_design_sheets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_events: {
        Row: {
          action: string
          actor: string | null
          actor_name: string | null
          at: string
          detail: Json
          id: string
          output_id: string | null
          project_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          actor_name?: string | null
          at?: string
          detail?: Json
          id?: string
          output_id?: string | null
          project_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          actor_name?: string | null
          at?: string
          detail?: Json
          id?: string
          output_id?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_events_output_id_fkey"
            columns: ["output_id"]
            isOneToOne: false
            referencedRelation: "project_outputs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_gates: {
        Row: {
          brief_id: string | null
          cycle_no: number
          design_version: number | null
          gate: string
          id: string
          note: string | null
          output_id: string | null
          project_id: string
          read_back_on: string | null
          recipient: string | null
          signed_at: string
          signed_by: string | null
          signed_by_name: string | null
          signed_document_sha256: string | null
          sponsor_name: string | null
          sponsor_role: string | null
          written_approval_ref: string | null
        }
        Insert: {
          brief_id?: string | null
          cycle_no?: number
          design_version?: number | null
          gate: string
          id?: string
          note?: string | null
          output_id?: string | null
          project_id: string
          read_back_on?: string | null
          recipient?: string | null
          signed_at?: string
          signed_by?: string | null
          signed_by_name?: string | null
          signed_document_sha256?: string | null
          sponsor_name?: string | null
          sponsor_role?: string | null
          written_approval_ref?: string | null
        }
        Update: {
          brief_id?: string | null
          cycle_no?: number
          design_version?: number | null
          gate?: string
          id?: string
          note?: string | null
          output_id?: string | null
          project_id?: string
          read_back_on?: string | null
          recipient?: string | null
          signed_at?: string
          signed_by?: string | null
          signed_by_name?: string | null
          signed_document_sha256?: string | null
          sponsor_name?: string | null
          sponsor_role?: string | null
          written_approval_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_gates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_intake_items: {
        Row: {
          claim_status: string
          decline_reason: string | null
          declined: boolean
          description: string
          id: string
          item_ref: string
          logged_at: string
          logged_by: string | null
          logged_by_name: string | null
          personal_data: boolean
          produced_by: string | null
          produced_for: string | null
          produced_on: string | null
          project_id: string
          received_on: string
          rev: number
          sensitivity: string
          sha256: string
          use_class: string
          verification_note: string | null
        }
        Insert: {
          claim_status: string
          decline_reason?: string | null
          declined?: boolean
          description: string
          id?: string
          item_ref?: string
          logged_at?: string
          logged_by?: string | null
          logged_by_name?: string | null
          personal_data: boolean
          produced_by?: string | null
          produced_for?: string | null
          produced_on?: string | null
          project_id: string
          received_on: string
          rev?: number
          sensitivity: string
          sha256: string
          use_class: string
          verification_note?: string | null
        }
        Update: {
          claim_status?: string
          decline_reason?: string | null
          declined?: boolean
          description?: string
          id?: string
          item_ref?: string
          logged_at?: string
          logged_by?: string | null
          logged_by_name?: string | null
          personal_data?: boolean
          produced_by?: string | null
          produced_for?: string | null
          produced_on?: string | null
          project_id?: string
          received_on?: string
          rev?: number
          sensitivity?: string
          sha256?: string
          use_class?: string
          verification_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_intake_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_interviews: {
        Row: {
          actions: string | null
          created_at: string
          created_by: string | null
          disagreements: string | null
          duration_min: number | null
          held_at: string
          id: string
          interviewee: string
          interviewee_role: string
          interviewer: string
          interviewer_name: string | null
          key_statements: Json
          note_taker: string
          note_taker_name: string | null
          priorities: string[]
          project_id: string
          readback_confirmed: boolean
        }
        Insert: {
          actions?: string | null
          created_at?: string
          created_by?: string | null
          disagreements?: string | null
          duration_min?: number | null
          held_at: string
          id?: string
          interviewee: string
          interviewee_role: string
          interviewer: string
          interviewer_name?: string | null
          key_statements?: Json
          note_taker: string
          note_taker_name?: string | null
          priorities?: string[]
          project_id: string
          readback_confirmed?: boolean
        }
        Update: {
          actions?: string | null
          created_at?: string
          created_by?: string | null
          disagreements?: string | null
          duration_min?: number | null
          held_at?: string
          id?: string
          interviewee?: string
          interviewee_role?: string
          interviewer?: string
          interviewer_name?: string | null
          key_statements?: Json
          note_taker?: string
          note_taker_name?: string | null
          priorities?: string[]
          project_id?: string
          readback_confirmed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "project_interviews_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_item_tiers: {
        Row: {
          id: string
          note: string | null
          project_id: string
          project_item_id: string
          set_at: string
          set_by: string | null
          set_by_name: string | null
          tier: string
        }
        Insert: {
          id?: string
          note?: string | null
          project_id: string
          project_item_id: string
          set_at?: string
          set_by?: string | null
          set_by_name?: string | null
          tier: string
        }
        Update: {
          id?: string
          note?: string | null
          project_id?: string
          project_item_id?: string
          set_at?: string
          set_by?: string | null
          set_by_name?: string | null
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_item_tiers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_item_tiers_project_item_id_fkey"
            columns: ["project_item_id"]
            isOneToOne: false
            referencedRelation: "project_items"
            referencedColumns: ["id"]
          },
        ]
      }
      project_items: {
        Row: {
          chunk_no: number | null
          cycle_no: number
          evidence_ref_id: string | null
          id: string
          item_id: string | null
          item_kind: string
          linked_at: string
          linked_by: string | null
          matched_terms: string[]
          note: string | null
          project_id: string
          screen_score: number | null
          source_line: string | null
          void_note: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          chunk_no?: number | null
          cycle_no?: number
          evidence_ref_id?: string | null
          id?: string
          item_id?: string | null
          item_kind: string
          linked_at?: string
          linked_by?: string | null
          matched_terms?: string[]
          note?: string | null
          project_id: string
          screen_score?: number | null
          source_line?: string | null
          void_note?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          chunk_no?: number | null
          cycle_no?: number
          evidence_ref_id?: string | null
          id?: string
          item_id?: string | null
          item_kind?: string
          linked_at?: string
          linked_by?: string | null
          matched_terms?: string[]
          note?: string | null
          project_id?: string
          screen_score?: number | null
          source_line?: string | null
          void_note?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_items_evidence_ref_id_fkey"
            columns: ["evidence_ref_id"]
            isOneToOne: false
            referencedRelation: "evidence_refs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_project_id_cycle_no_fkey"
            columns: ["project_id", "cycle_no"]
            isOneToOne: false
            referencedRelation: "project_cycles"
            referencedColumns: ["project_id", "cycle_no"]
          },
          {
            foreignKeyName: "project_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_load_reports: {
        Row: {
          case_folder_ref: string
          counts_after: Json
          counts_before: Json
          cycle_no: number
          expected_new: Json
          id: string
          manifest_sha256: string
          project_id: string
          reconciled: boolean
          recorded_at: string
          recorded_by: string | null
          recorded_by_name: string | null
          register_entry_ref: string
          single_transaction: boolean
          sync_log: string | null
        }
        Insert: {
          case_folder_ref: string
          counts_after: Json
          counts_before: Json
          cycle_no: number
          expected_new: Json
          id?: string
          manifest_sha256: string
          project_id: string
          reconciled?: boolean
          recorded_at?: string
          recorded_by?: string | null
          recorded_by_name?: string | null
          register_entry_ref: string
          single_transaction: boolean
          sync_log?: string | null
        }
        Update: {
          case_folder_ref?: string
          counts_after?: Json
          counts_before?: Json
          cycle_no?: number
          expected_new?: Json
          id?: string
          manifest_sha256?: string
          project_id?: string
          reconciled?: boolean
          recorded_at?: string
          recorded_by?: string | null
          recorded_by_name?: string | null
          register_entry_ref?: string
          single_transaction?: boolean
          sync_log?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_load_reports_project_id_cycle_no_fkey"
            columns: ["project_id", "cycle_no"]
            isOneToOne: false
            referencedRelation: "project_cycles"
            referencedColumns: ["project_id", "cycle_no"]
          },
          {
            foreignKeyName: "project_load_reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          added_at: string
          added_by: string | null
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          project_id: string
          role: string
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_outputs: {
        Row: {
          attribution_checked: boolean
          brief_id: string
          created_at: string
          created_by: string | null
          created_by_name: string | null
          cycle_nos: number[]
          file_name: string | null
          id: string
          item_count: number | null
          kind: string
          location: string | null
          params: Json
          project_id: string
          qa_at: string | null
          qa_by: string | null
          released_at: string | null
          sha256: string | null
          shared_with_client: boolean
          size_bytes: number | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          attribution_checked?: boolean
          brief_id: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          cycle_nos?: number[]
          file_name?: string | null
          id?: string
          item_count?: number | null
          kind: string
          location?: string | null
          params?: Json
          project_id: string
          qa_at?: string | null
          qa_by?: string | null
          released_at?: string | null
          sha256?: string | null
          shared_with_client?: boolean
          size_bytes?: number | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          attribution_checked?: boolean
          brief_id?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          cycle_nos?: number[]
          file_name?: string | null
          id?: string
          item_count?: number | null
          kind?: string
          location?: string | null
          params?: Json
          project_id?: string
          qa_at?: string | null
          qa_by?: string | null
          released_at?: string | null
          sha256?: string | null
          shared_with_client?: boolean
          size_bytes?: number | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_outputs_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "project_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_outputs_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "project_current_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_outputs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_report_entries: {
        Row: {
          client_figure: boolean
          counts: Json
          created_at: string
          created_by: string | null
          created_by_name: string | null
          entry_kind: string
          evidence_tier: string | null
          finding: string | null
          id: string
          met: boolean | null
          out_of_reach: boolean
          output_id: string
          project_id: string
          ref_key: string
        }
        Insert: {
          client_figure?: boolean
          counts?: Json
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          entry_kind: string
          evidence_tier?: string | null
          finding?: string | null
          id?: string
          met?: boolean | null
          out_of_reach?: boolean
          output_id: string
          project_id: string
          ref_key: string
        }
        Update: {
          client_figure?: boolean
          counts?: Json
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          entry_kind?: string
          evidence_tier?: string | null
          finding?: string | null
          id?: string
          met?: boolean | null
          out_of_reach?: boolean
          output_id?: string
          project_id?: string
          ref_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_report_entries_output_id_fkey"
            columns: ["output_id"]
            isOneToOne: false
            referencedRelation: "project_outputs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_report_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_research_questions: {
        Row: {
          brief_section: number
          created_at: string
          created_by: string | null
          created_by_name: string | null
          hypothesis: string | null
          id: string
          project_id: string
          question: string
          rev: number
          rq_no: string
          withdrawn: boolean
        }
        Insert: {
          brief_section: number
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          hypothesis?: string | null
          id?: string
          project_id: string
          question: string
          rev?: number
          rq_no: string
          withdrawn?: boolean
        }
        Update: {
          brief_section?: number
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          hypothesis?: string | null
          id?: string
          project_id?: string
          question?: string
          rev?: number
          rq_no?: string
          withdrawn?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "project_research_questions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_scenario_events: {
        Row: {
          confirmed_by: string[]
          counts: Json
          created_at: string
          created_by: string | null
          created_by_name: string | null
          cycle_no: number
          event: string
          evidence_tier: string | null
          id: string
          note: string | null
          project_id: string
          scenario_no: string
        }
        Insert: {
          confirmed_by?: string[]
          counts?: Json
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          cycle_no?: number
          event: string
          evidence_tier?: string | null
          id?: string
          note?: string | null
          project_id: string
          scenario_no: string
        }
        Update: {
          confirmed_by?: string[]
          counts?: Json
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          cycle_no?: number
          event?: string
          evidence_tier?: string | null
          id?: string
          note?: string | null
          project_id?: string
          scenario_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_scenario_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_scenarios: {
        Row: {
          amendment_id: string | null
          approver: string
          created_at: string
          created_by: string | null
          created_by_name: string | null
          decision_owner: string
          fa_will_not_say: string
          fa_will_say: string
          id: string
          informed: string | null
          min_evidence_tier: string | null
          name: string
          probability: string | null
          probability_source: string | null
          project_id: string
          readers_required: number
          response_options: Json
          rev: number
          review_date: string | null
          scenario_no: string
          scenario_type: string
          situation: string
          threshold: string
          time_frame: string
          trigger_indicators: string
          withdrawn: boolean
        }
        Insert: {
          amendment_id?: string | null
          approver: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          decision_owner: string
          fa_will_not_say: string
          fa_will_say: string
          id?: string
          informed?: string | null
          min_evidence_tier?: string | null
          name: string
          probability?: string | null
          probability_source?: string | null
          project_id: string
          readers_required?: number
          response_options: Json
          rev?: number
          review_date?: string | null
          scenario_no: string
          scenario_type: string
          situation: string
          threshold: string
          time_frame: string
          trigger_indicators: string
          withdrawn?: boolean
        }
        Update: {
          amendment_id?: string | null
          approver?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          decision_owner?: string
          fa_will_not_say?: string
          fa_will_say?: string
          id?: string
          informed?: string | null
          min_evidence_tier?: string | null
          name?: string
          probability?: string | null
          probability_source?: string | null
          project_id?: string
          readers_required?: number
          response_options?: Json
          rev?: number
          review_date?: string | null
          scenario_no?: string
          scenario_type?: string
          situation?: string
          threshold?: string
          time_frame?: string
          trigger_indicators?: string
          withdrawn?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "project_scenarios_amendment_id_fkey"
            columns: ["amendment_id"]
            isOneToOne: false
            referencedRelation: "project_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_scenarios_amendment_id_fkey"
            columns: ["amendment_id"]
            isOneToOne: false
            referencedRelation: "project_current_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_scenarios_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_scope_sheets: {
        Row: {
          completed_at: string
          completed_by: string | null
          completed_by_name: string | null
          id: string
          legal_note: string | null
          mandate: string
          project_id: string
          risk_screen: Json
          risk_screen_done: boolean
          scope_summary: string
        }
        Insert: {
          completed_at?: string
          completed_by?: string | null
          completed_by_name?: string | null
          id?: string
          legal_note?: string | null
          mandate?: string
          project_id: string
          risk_screen?: Json
          risk_screen_done?: boolean
          scope_summary: string
        }
        Update: {
          completed_at?: string
          completed_by?: string | null
          completed_by_name?: string | null
          id?: string
          legal_note?: string | null
          mandate?: string
          project_id?: string
          risk_screen?: Json
          risk_screen_done?: boolean
          scope_summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_scope_sheets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_success_measures: {
        Row: {
          amendment_id: string | null
          baseline: string | null
          baseline_source: string | null
          client_figure: boolean
          created_at: string
          created_by: string | null
          created_by_name: string | null
          data_source: string | null
          id: string
          level: string
          measure: string
          measure_no: string
          observable: boolean
          project_id: string
          rev: number
          target: string | null
          withdrawn: boolean
        }
        Insert: {
          amendment_id?: string | null
          baseline?: string | null
          baseline_source?: string | null
          client_figure?: boolean
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          data_source?: string | null
          id?: string
          level: string
          measure: string
          measure_no: string
          observable?: boolean
          project_id: string
          rev?: number
          target?: string | null
          withdrawn?: boolean
        }
        Update: {
          amendment_id?: string | null
          baseline?: string | null
          baseline_source?: string | null
          client_figure?: boolean
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          data_source?: string | null
          id?: string
          level?: string
          measure?: string
          measure_no?: string
          observable?: boolean
          project_id?: string
          rev?: number
          target?: string | null
          withdrawn?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "project_success_measures_amendment_id_fkey"
            columns: ["amendment_id"]
            isOneToOne: false
            referencedRelation: "project_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_success_measures_amendment_id_fkey"
            columns: ["amendment_id"]
            isOneToOne: false
            referencedRelation: "project_current_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_success_measures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_targets: {
        Row: {
          created_at: string
          created_by: string | null
          curator_confirmed: boolean
          curator_confirmed_by: string | null
          handle: string
          id: string
          identity_resolved: boolean
          note: string | null
          platform: string
          project_id: string
          rev: number
          target_group: string | null
          target_key: string
          withdrawn: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          curator_confirmed?: boolean
          curator_confirmed_by?: string | null
          handle: string
          id?: string
          identity_resolved?: boolean
          note?: string | null
          platform: string
          project_id: string
          rev?: number
          target_group?: string | null
          target_key: string
          withdrawn?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          curator_confirmed?: boolean
          curator_confirmed_by?: string | null
          handle?: string
          id?: string
          identity_resolved?: boolean
          note?: string | null
          platform?: string
          project_id?: string
          rev?: number
          target_group?: string | null
          target_key?: string
          withdrawn?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "project_targets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_id: string
          code: string
          created_at: string
          created_by: string | null
          design_stale: boolean
          due_on: string | null
          id: string
          name: string
          opened_on: string
          sponsor_name: string | null
          status: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          code: string
          created_at?: string
          created_by?: string | null
          design_stale?: boolean
          due_on?: string | null
          id?: string
          name: string
          opened_on?: string
          sponsor_name?: string | null
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          design_stale?: boolean
          due_on?: string | null
          id?: string
          name?: string
          opened_on?: string
          sponsor_name?: string | null
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      research_captures: {
        Row: {
          captured_at: string
          captured_at_utc: string | null
          captured_by: string | null
          collector: string | null
          connector_key: string | null
          connector_version: string | null
          custody_event_id: string | null
          evidence_ref_id: string | null
          fstd001_version: string
          id: string
          item_ref: string
          item_type: string | null
          language: string | null
          matched_terms: string[]
          original_context: Json
          pipeline_state: string
          platform: string | null
          project_id: string
          requirement_ref: string | null
          run_id: string
          second_check_at: string | null
          second_check_by: string | null
          sha256_at_capture: string
          sha256_on_write: string | null
          source: string
          standard_fields: Json
          target_key: string | null
          tier: string | null
          vault_write_verified: boolean
        }
        Insert: {
          captured_at?: string
          captured_at_utc?: string | null
          captured_by?: string | null
          collector?: string | null
          connector_key?: string | null
          connector_version?: string | null
          custody_event_id?: string | null
          evidence_ref_id?: string | null
          fstd001_version: string
          id?: string
          item_ref: string
          item_type?: string | null
          language?: string | null
          matched_terms?: string[]
          original_context?: Json
          pipeline_state?: string
          platform?: string | null
          project_id: string
          requirement_ref?: string | null
          run_id: string
          second_check_at?: string | null
          second_check_by?: string | null
          sha256_at_capture: string
          sha256_on_write?: string | null
          source: string
          standard_fields?: Json
          target_key?: string | null
          tier?: string | null
          vault_write_verified?: boolean
        }
        Update: {
          captured_at?: string
          captured_at_utc?: string | null
          captured_by?: string | null
          collector?: string | null
          connector_key?: string | null
          connector_version?: string | null
          custody_event_id?: string | null
          evidence_ref_id?: string | null
          fstd001_version?: string
          id?: string
          item_ref?: string
          item_type?: string | null
          language?: string | null
          matched_terms?: string[]
          original_context?: Json
          pipeline_state?: string
          platform?: string | null
          project_id?: string
          requirement_ref?: string | null
          run_id?: string
          second_check_at?: string | null
          second_check_by?: string | null
          sha256_at_capture?: string
          sha256_on_write?: string | null
          source?: string
          standard_fields?: Json
          target_key?: string | null
          tier?: string | null
          vault_write_verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "research_captures_connector_key_fkey"
            columns: ["connector_key"]
            isOneToOne: false
            referencedRelation: "research_connectors"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "research_captures_custody_event_id_fkey"
            columns: ["custody_event_id"]
            isOneToOne: false
            referencedRelation: "custody_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_captures_evidence_ref_id_fkey"
            columns: ["evidence_ref_id"]
            isOneToOne: false
            referencedRelation: "evidence_refs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_captures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_captures_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      research_connectors: {
        Row: {
          key: string
          name: string
          platforms: string[]
          reject_limit: number
          reject_window_minutes: number
          status: string
          status_reason: string | null
          updated_at: string
          updated_by: string | null
          version: string
        }
        Insert: {
          key: string
          name: string
          platforms: string[]
          reject_limit?: number
          reject_window_minutes?: number
          status?: string
          status_reason?: string | null
          updated_at?: string
          updated_by?: string | null
          version: string
        }
        Update: {
          key?: string
          name?: string
          platforms?: string[]
          reject_limit?: number
          reject_window_minutes?: number
          status?: string
          status_reason?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: string
        }
        Relationships: []
      }
      research_events: {
        Row: {
          actor: string | null
          actor_kind: string
          at: string
          capture_id: string | null
          details: Json
          event: string
          id: string
          plan_id: string | null
          project_id: string
          reason: string | null
          run_id: string | null
        }
        Insert: {
          actor?: string | null
          actor_kind?: string
          at?: string
          capture_id?: string | null
          details?: Json
          event: string
          id?: string
          plan_id?: string | null
          project_id: string
          reason?: string | null
          run_id?: string | null
        }
        Update: {
          actor?: string | null
          actor_kind?: string
          at?: string
          capture_id?: string | null
          details?: Json
          event?: string
          id?: string
          plan_id?: string | null
          project_id?: string
          reason?: string | null
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "research_events_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "research_captures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_events_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "research_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      research_jobs: {
        Row: {
          claimed_at: string | null
          created_at: string
          id: string
          idempotency_key: string
          job_type: string
          plan_id: string
          project_id: string
          source: string
          status: string
          target_key: string | null
          terms: string[]
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          job_type: string
          plan_id: string
          project_id: string
          source: string
          status?: string
          target_key?: string | null
          terms?: string[]
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          job_type?: string
          plan_id?: string
          project_id?: string
          source?: string
          status?: string
          target_key?: string | null
          terms?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "research_jobs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "research_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      research_loads: {
        Row: {
          candidates_created: number
          captured: number
          cycle: number
          id: string
          in_vault: number
          loaded: number
          manifest_sha256: string
          plan_id: string
          project_id: string
          reconciled: boolean
          recorded_at: string
          recorded_by: string | null
        }
        Insert: {
          candidates_created?: number
          captured: number
          cycle: number
          id?: string
          in_vault: number
          loaded: number
          manifest_sha256: string
          plan_id: string
          project_id: string
          reconciled?: boolean
          recorded_at?: string
          recorded_by?: string | null
        }
        Update: {
          candidates_created?: number
          captured?: number
          cycle?: number
          id?: string
          in_vault?: number
          loaded?: number
          manifest_sha256?: string
          plan_id?: string
          project_id?: string
          reconciled?: boolean
          recorded_at?: string
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "research_loads_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: true
            referencedRelation: "research_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_loads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      research_plans: {
        Row: {
          approved_sources: string[]
          brief_version: number
          cadence: string
          cloud_mirror: boolean
          created_at: string
          created_by: string | null
          cycle: number
          design_version: number
          engagement_id: string
          id: string
          job_types: string[]
          lexicon_version: string
          locked_at: string | null
          locked_by: string | null
          plan_sha256: string | null
          project_id: string | null
          status: string
          status_reason: string | null
          updated_at: string
          vault_primary: string
          window_from: string
          window_to: string
        }
        Insert: {
          approved_sources: string[]
          brief_version: number
          cadence: string
          cloud_mirror?: boolean
          created_at?: string
          created_by?: string | null
          cycle: number
          design_version: number
          engagement_id: string
          id?: string
          job_types: string[]
          lexicon_version: string
          locked_at?: string | null
          locked_by?: string | null
          plan_sha256?: string | null
          project_id?: string | null
          status?: string
          status_reason?: string | null
          updated_at?: string
          vault_primary?: string
          window_from: string
          window_to: string
        }
        Update: {
          approved_sources?: string[]
          brief_version?: number
          cadence?: string
          cloud_mirror?: boolean
          created_at?: string
          created_by?: string | null
          cycle?: number
          design_version?: number
          engagement_id?: string
          id?: string
          job_types?: string[]
          lexicon_version?: string
          locked_at?: string | null
          locked_by?: string | null
          plan_sha256?: string | null
          project_id?: string | null
          status?: string
          status_reason?: string | null
          updated_at?: string
          vault_primary?: string
          window_from?: string
          window_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_plans_engagement_id_cycle_fkey"
            columns: ["engagement_id", "cycle"]
            isOneToOne: false
            referencedRelation: "project_cycles"
            referencedColumns: ["project_id", "cycle_no"]
          },
          {
            foreignKeyName: "research_plans_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      research_refusals: {
        Row: {
          connector_key: string | null
          id: string
          kind: string
          plan_id: string
          project_id: string
          reason: string
          refused_at: string
          request: Json
          run_id: string | null
        }
        Insert: {
          connector_key?: string | null
          id?: string
          kind: string
          plan_id: string
          project_id: string
          reason: string
          refused_at?: string
          request: Json
          run_id?: string | null
        }
        Update: {
          connector_key?: string | null
          id?: string
          kind?: string
          plan_id?: string
          project_id?: string
          reason?: string
          refused_at?: string
          request?: Json
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "research_refusals_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "research_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_refusals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_refusals_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      research_runs: {
        Row: {
          captured: number
          expected: number
          finished_at: string | null
          id: string
          in_vault: number
          job_id: string | null
          plan_id: string
          project_id: string
          started_at: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          captured?: number
          expected?: number
          finished_at?: string | null
          id?: string
          in_vault?: number
          job_id?: string | null
          plan_id: string
          project_id: string
          started_at?: string
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          captured?: number
          expected?: number
          finished_at?: string | null
          id?: string
          in_vault?: number
          job_id?: string | null
          plan_id?: string
          project_id?: string
          started_at?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "research_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_runs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "research_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      research_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: number
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: number
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: number
        }
        Relationships: []
      }
      research_vault_reports: {
        Row: {
          id: string
          note: string | null
          online: boolean
          reported_at: string
          source_id: string
        }
        Insert: {
          id?: string
          note?: string | null
          online: boolean
          reported_at?: string
          source_id: string
        }
        Update: {
          id?: string
          note?: string | null
          online?: boolean
          reported_at?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_vault_reports_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_events: {
        Row: {
          actor: string | null
          at: string
          clock_id: string | null
          detail: Json
          id: string
          kind: string
          project_id: string | null
          to_roles: string[]
        }
        Insert: {
          actor?: string | null
          at?: string
          clock_id?: string | null
          detail?: Json
          id?: string
          kind: string
          project_id?: string | null
          to_roles?: string[]
        }
        Update: {
          actor?: string | null
          at?: string
          clock_id?: string | null
          detail?: Json
          id?: string
          kind?: string
          project_id?: string | null
          to_roles?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "sla_events_clock_id_fkey"
            columns: ["clock_id"]
            isOneToOne: false
            referencedRelation: "phase_clocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_holidays: {
        Row: {
          added_at: string
          added_by: string | null
          day: string
          name: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          day: string
          name: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          day?: string
          name?: string
        }
        Relationships: []
      }
      sla_settings: {
        Row: {
          holidays_set: boolean
          id: boolean
          time_zone: string
          updated_at: string
          updated_by: string | null
          weekend_dows: number[]
        }
        Insert: {
          holidays_set?: boolean
          id?: boolean
          time_zone?: string
          updated_at?: string
          updated_by?: string | null
          weekend_dows?: number[]
        }
        Update: {
          holidays_set?: boolean
          id?: boolean
          time_zone?: string
          updated_at?: string
          updated_by?: string | null
          weekend_dows?: number[]
        }
        Relationships: []
      }
      sop_definitions: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          escalation_chain: string[]
          id: string
          is_sample: boolean
          owner_role: string
          phase: number
          steps: Json
          target_working_days: number
          version: number
          warn_pct: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          escalation_chain?: string[]
          id?: string
          is_sample?: boolean
          owner_role: string
          phase: number
          steps?: Json
          target_working_days: number
          version: number
          warn_pct?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          escalation_chain?: string[]
          id?: string
          is_sample?: boolean
          owner_role?: string
          phase?: number
          steps?: Json
          target_working_days?: number
          version?: number
          warn_pct?: number
        }
        Relationships: []
      }
      sources: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          gateway_url: string | null
          id: string
          kind: string
          name: string
          settings: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          gateway_url?: string | null
          id: string
          kind: string
          name: string
          settings?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          gateway_url?: string | null
          id?: string
          kind?: string
          name?: string
          settings?: Json
          updated_at?: string
        }
        Relationships: []
      }
      subject_profiles: {
        Row: {
          account_id: string | null
          created_at: string
          id: string
          insufficient_data: boolean
          item_id: string | null
          observed: Json
          stated: Json
          subject_type: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          id?: string
          insufficient_data?: boolean
          item_id?: string | null
          observed?: Json
          stated?: Json
          subject_type: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          id?: string
          insufficient_data?: boolean
          item_id?: string | null
          observed?: Json
          stated?: Json
          subject_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_profiles_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_profiles_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
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
          role: Database["public"]["Enums"]["app_role"]
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
      vault_config: {
        Row: {
          database_name: string | null
          database_roles: string[]
          engine: string
          holds: string
          location: string
          name: string
          note: string | null
          route: string
          schema_name: string | null
          updated_at: string
          updated_by: string | null
          vault: string
        }
        Insert: {
          database_name?: string | null
          database_roles?: string[]
          engine: string
          holds: string
          location: string
          name: string
          note?: string | null
          route: string
          schema_name?: string | null
          updated_at?: string
          updated_by?: string | null
          vault: string
        }
        Update: {
          database_name?: string | null
          database_roles?: string[]
          engine?: string
          holds?: string
          location?: string
          name?: string
          note?: string | null
          route?: string
          schema_name?: string | null
          updated_at?: string
          updated_by?: string | null
          vault?: string
        }
        Relationships: []
      }
      vault_events: {
        Row: {
          actor: string | null
          at: string
          detail: Json
          event: string
          id: string
          outcome: string
          vault: string
        }
        Insert: {
          actor?: string | null
          at?: string
          detail?: Json
          event: string
          id?: string
          outcome: string
          vault: string
        }
        Update: {
          actor?: string | null
          at?: string
          detail?: Json
          event?: string
          id?: string
          outcome?: string
          vault?: string
        }
        Relationships: []
      }
      vault_outbox: {
        Row: {
          created_at: string
          id: string
          kind: string
          project_id: string | null
          ref_id: string
          sha256: string
          target: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          project_id?: string | null
          ref_id: string
          sha256: string
          target: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          project_id?: string | null
          ref_id?: string
          sha256?: string
          target?: string
        }
        Relationships: []
      }
      vault_outbox_results: {
        Row: {
          at: string
          id: string
          outbox_id: string
          outcome: string
          reason: string | null
          sha256_on_write: string | null
        }
        Insert: {
          at?: string
          id?: string
          outbox_id: string
          outcome: string
          reason?: string | null
          sha256_on_write?: string | null
        }
        Update: {
          at?: string
          id?: string
          outbox_id?: string
          outcome?: string
          reason?: string | null
          sha256_on_write?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vault_outbox_results_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "vault_outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      watch_seen: {
        Row: {
          baseline: boolean
          first_seen_at: string
          id: string
          job_id: string | null
          post_url: string
          target_id: string
        }
        Insert: {
          baseline?: boolean
          first_seen_at?: string
          id?: string
          job_id?: string | null
          post_url: string
          target_id: string
        }
        Update: {
          baseline?: boolean
          first_seen_at?: string
          id?: string
          job_id?: string | null
          post_url?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_seen_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "watch_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      watch_targets: {
        Row: {
          active: boolean
          case_id: string
          created_at: string
          created_by: string | null
          id: string
          interval_minutes: number
          label: string | null
          last_checked_at: string | null
          last_error: string | null
          last_found: number | null
          platform: string
          url: string
        }
        Insert: {
          active?: boolean
          case_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          interval_minutes?: number
          label?: string | null
          last_checked_at?: string | null
          last_error?: string | null
          last_found?: number | null
          platform?: string
          url: string
        }
        Update: {
          active?: boolean
          case_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          interval_minutes?: number
          label?: string | null
          last_checked_at?: string | null
          last_error?: string | null
          last_found?: number | null
          platform?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_targets_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_status: {
        Row: {
          hostname: string | null
          id: string
          info: Json
          last_seen: string | null
          public_ip: string | null
          restart_requested_at: string | null
          version: string | null
        }
        Insert: {
          hostname?: string | null
          id?: string
          info?: Json
          last_seen?: string | null
          public_ip?: string | null
          restart_requested_at?: string | null
          version?: string | null
        }
        Update: {
          hostname?: string | null
          id?: string
          info?: Json
          last_seen?: string | null
          public_ip?: string | null
          restart_requested_at?: string | null
          version?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      project_current_briefs: {
        Row: {
          amendment_no: number | null
          audiences: Json | null
          authored_at: string | null
          authored_by: string | null
          authored_by_name: string | null
          caps: string | null
          change_reason: string | null
          change_summary: string | null
          constraints_risks: Json | null
          facts: Json | null
          governance: Json | null
          held_groups: string | null
          id: string | null
          in_scope: string | null
          kind: string | null
          languages: string[] | null
          objectives: string[] | null
          out_of_scope: string | null
          platforms: string[] | null
          project_id: string | null
          purpose_decisions: string | null
          ranked_asks: Json | null
          requested_by: string | null
          research_content_note: string | null
          response_parameters: Json | null
          sample_rule: string | null
          scope_changed: boolean | null
          situation: string | null
          unknowns: string[] | null
          version: number | null
          window_from: string | null
          window_to: string | null
        }
        Insert: {
          amendment_no?: number | null
          audiences?: Json | null
          authored_at?: string | null
          authored_by?: string | null
          authored_by_name?: string | null
          caps?: string | null
          change_reason?: string | null
          change_summary?: string | null
          constraints_risks?: Json | null
          facts?: Json | null
          governance?: Json | null
          held_groups?: string | null
          id?: string | null
          in_scope?: string | null
          kind?: string | null
          languages?: string[] | null
          objectives?: string[] | null
          out_of_scope?: string | null
          platforms?: string[] | null
          project_id?: string | null
          purpose_decisions?: string | null
          ranked_asks?: Json | null
          requested_by?: string | null
          research_content_note?: string | null
          response_parameters?: Json | null
          sample_rule?: string | null
          scope_changed?: boolean | null
          situation?: string | null
          unknowns?: string[] | null
          version?: number | null
          window_from?: string | null
          window_to?: string | null
        }
        Update: {
          amendment_no?: number | null
          audiences?: Json | null
          authored_at?: string | null
          authored_by?: string | null
          authored_by_name?: string | null
          caps?: string | null
          change_reason?: string | null
          change_summary?: string | null
          constraints_risks?: Json | null
          facts?: Json | null
          governance?: Json | null
          held_groups?: string | null
          id?: string | null
          in_scope?: string | null
          kind?: string | null
          languages?: string[] | null
          objectives?: string[] | null
          out_of_scope?: string | null
          platforms?: string[] | null
          project_id?: string | null
          purpose_decisions?: string | null
          ranked_asks?: Json | null
          requested_by?: string | null
          research_content_note?: string | null
          response_parameters?: Json | null
          sample_rule?: string | null
          scope_changed?: boolean | null
          situation?: string | null
          unknowns?: string[] | null
          version?: number | null
          window_from?: string | null
          window_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_briefs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_latest_decisions: {
        Row: {
          category: string | null
          decision: string | null
          disputed: boolean | null
          exclusion_code: string | null
          id: string | null
          judgement_call: boolean | null
          judgement_note: string | null
          needs_second_reader: boolean | null
          note: string | null
          project_id: string | null
          project_item_id: string | null
          read_at: string | null
          read_by: string | null
          read_by_name: string | null
          reason: string | null
          ruling: boolean | null
          second_reader_confirmed: boolean | null
          severity: string | null
          target_group: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_decisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_decisions_project_item_id_fkey"
            columns: ["project_item_id"]
            isOneToOne: false
            referencedRelation: "project_items"
            referencedColumns: ["id"]
          },
        ]
      }
      project_latest_intake: {
        Row: {
          claim_status: string | null
          decline_reason: string | null
          declined: boolean | null
          description: string | null
          id: string | null
          item_ref: string | null
          logged_at: string | null
          logged_by: string | null
          logged_by_name: string | null
          personal_data: boolean | null
          produced_by: string | null
          produced_for: string | null
          produced_on: string | null
          project_id: string | null
          received_on: string | null
          rev: number | null
          sensitivity: string | null
          sha256: string | null
          use_class: string | null
          verification_note: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_intake_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_latest_measures: {
        Row: {
          amendment_id: string | null
          baseline: string | null
          baseline_source: string | null
          client_figure: boolean | null
          created_at: string | null
          created_by: string | null
          created_by_name: string | null
          data_source: string | null
          id: string | null
          level: string | null
          measure: string | null
          measure_no: string | null
          observable: boolean | null
          project_id: string | null
          rev: number | null
          target: string | null
          withdrawn: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "project_success_measures_amendment_id_fkey"
            columns: ["amendment_id"]
            isOneToOne: false
            referencedRelation: "project_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_success_measures_amendment_id_fkey"
            columns: ["amendment_id"]
            isOneToOne: false
            referencedRelation: "project_current_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_success_measures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_latest_rqs: {
        Row: {
          brief_section: number | null
          created_at: string | null
          created_by: string | null
          created_by_name: string | null
          hypothesis: string | null
          id: string | null
          project_id: string | null
          question: string | null
          rev: number | null
          rq_no: string | null
          withdrawn: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "project_research_questions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_latest_scenarios: {
        Row: {
          amendment_id: string | null
          approver: string | null
          created_at: string | null
          created_by: string | null
          created_by_name: string | null
          decision_owner: string | null
          fa_will_not_say: string | null
          fa_will_say: string | null
          id: string | null
          informed: string | null
          min_evidence_tier: string | null
          name: string | null
          probability: string | null
          probability_source: string | null
          project_id: string | null
          readers_required: number | null
          response_options: Json | null
          rev: number | null
          review_date: string | null
          scenario_no: string | null
          scenario_type: string | null
          situation: string | null
          threshold: string | null
          time_frame: string | null
          trigger_indicators: string | null
          withdrawn: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "project_scenarios_amendment_id_fkey"
            columns: ["amendment_id"]
            isOneToOne: false
            referencedRelation: "project_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_scenarios_amendment_id_fkey"
            columns: ["amendment_id"]
            isOneToOne: false
            referencedRelation: "project_current_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_scenarios_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_latest_targets: {
        Row: {
          created_at: string | null
          created_by: string | null
          curator_confirmed: boolean | null
          curator_confirmed_by: string | null
          handle: string | null
          id: string | null
          identity_resolved: boolean | null
          note: string | null
          platform: string | null
          project_id: string | null
          rev: number | null
          target_group: string | null
          target_key: string | null
          withdrawn: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "project_targets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_latest_tiers: {
        Row: {
          id: string | null
          note: string | null
          project_id: string | null
          project_item_id: string | null
          set_at: string | null
          set_by: string | null
          set_by_name: string | null
          tier: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_item_tiers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_item_tiers_project_item_id_fkey"
            columns: ["project_item_id"]
            isOneToOne: false
            referencedRelation: "project_items"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      append_job_log: {
        Args: { p_job_id: string; p_lines: string[]; p_warnings: string[] }
        Returns: undefined
      }
      brief_facts_ok: { Args: { _facts: Json }; Returns: boolean }
      brief_missing: { Args: { _brief: string }; Returns: string[] }
      can_access_case: {
        Args: { _case_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_project_as_client: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      can_work_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      case_of_item: { Args: { _item_id: string }; Returns: string }
      claim_next_job: {
        Args: never
        Returns: {
          case_id: string | null
          case_meta: Json
          claimed_at: string | null
          created_at: string
          created_by: string | null
          finished_at: string | null
          handler: string | null
          id: string
          incident_date: string | null
          incident_id: string | null
          incident_meta: Json
          log: string[]
          options: Json
          result: Json | null
          status: string
          updated_at: string
          url: string
          warnings: string[]
        }[]
        SetofOptions: {
          from: "*"
          to: "capture_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      design_ready: { Args: { _project: string }; Returns: boolean }
      gate_signed: {
        Args: {
          _cycle?: number
          _gate: string
          _output?: string
          _project: string
        }
        Returns: boolean
      }
      has_project_role: {
        Args: { _project_id: string; _roles: string[]; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hub_storage_project: {
        Args: { path: string; write_access: boolean }
        Returns: boolean
      }
      is_investigator: { Args: { _user_id: string }; Returns: boolean }
      library_actor_kind: { Args: { u: string }; Returns: string }
      library_can_read: {
        Args: { d: Database["public"]["Tables"]["documents"]["Row"]; u: string }
        Returns: boolean
      }
      library_file_for: { Args: { doc: string }; Returns: Json }
      library_log: {
        Args: { a: string; d: string; det?: Json; r?: string }
        Returns: undefined
      }
      library_record_download: {
        Args: { doc: string; got_sha256: string }
        Returns: boolean
      }
      library_require_staff_writer: { Args: never; Returns: undefined }
      library_share: { Args: { doc: string }; Returns: undefined }
      library_void: { Args: { doc: string; note: string }; Returns: undefined }
      library_withdraw: {
        Args: { doc: string; reason: string }
        Returns: undefined
      }
      mgmt_can_open: { Args: { u: string }; Returns: boolean }
      mgmt_portfolio: { Args: never; Returns: Json }
      portal_access_list: { Args: { c: string }; Returns: Json }
      portal_activate_invitation: {
        Args: { rid: string; uid: string }
        Returns: undefined
      }
      portal_activity: { Args: { c?: string }; Returns: Json }
      portal_admin_action: {
        Args: { a: string; rid: string }
        Returns: undefined
      }
      portal_claim_invitation: { Args: { h: string }; Returns: Json }
      portal_dashboard: { Args: { c?: string }; Returns: Json }
      portal_engagement_briefs: { Args: { p: string }; Returns: Json }
      portal_engagement_stage: { Args: { p: string }; Returns: number }
      portal_engagements: { Args: { c?: string }; Returns: Json }
      portal_has_client_identity: { Args: { u: string }; Returns: boolean }
      portal_home: { Args: { c?: string }; Returns: Json }
      portal_identity: { Args: never; Returns: Json }
      portal_invitation_info: { Args: { h: string }; Returns: Json }
      portal_invite: {
        Args: {
          c: string
          e: string
          existing?: string
          expires: string
          h: string
          n: string
        }
        Returns: string
      }
      portal_is_admin: { Args: { c: string; u: string }; Returns: boolean }
      portal_is_staff: { Args: { u: string }; Returns: boolean }
      portal_record_sign_in: { Args: never; Returns: undefined }
      portal_resolve_client: { Args: { c: string }; Returns: string }
      portal_set_notifications: { Args: { prefs: Json }; Returns: undefined }
      portal_update_organisation: {
        Args: {
          c: string
          contact: string
          contact_mail: string
          display: string
          tel: string
          tz: string
        }
        Returns: undefined
      }
      project_current_brief_id: { Args: { _project: string }; Returns: string }
      project_item_case: {
        Args: { _evidence_ref_id: string; _item_id: string; _kind: string }
        Returns: string
      }
      project_mandate: { Args: { _project: string }; Returns: string }
      project_role: {
        Args: { _project_id: string; _user_id: string }
        Returns: string
      }
      report_incomplete: { Args: { _output: string }; Returns: string[] }
      research_block_reason: {
        Args: { _cycle: number; _plan?: string; _project: string }
        Returns: string
      }
      research_capture_pipeline: {
        Args: { c: Database["public"]["Tables"]["research_captures"]["Row"] }
        Returns: string
      }
      research_claim_job: {
        Args: { _cycle?: number; _plan_sha256?: string }
        Returns: Json
      }
      research_cycle_open_for_reading: {
        Args: { _cycle: number; _project: string }
        Returns: boolean
      }
      research_home_vault_online: { Args: never; Returns: boolean }
      research_pending_amendment: {
        Args: { _project: string }
        Returns: boolean
      }
      research_plan_facts: {
        Args: { p: Database["public"]["Tables"]["research_plans"]["Row"] }
        Returns: Json
      }
      research_quarantine: {
        Args: {
          _connector: string
          _plan: string
          _project: string
          _request: Json
          _run: string
          _why: string
        }
        Returns: Json
      }
      research_readiness: {
        Args: { _cycle: number; _project: string }
        Returns: Json
      }
      research_record_load: {
        Args: { _loaded: number; _manifest_sha256: string; _plan: string }
        Returns: Json
      }
      research_report_run: {
        Args: { _expected?: number; _run: string; _status: string }
        Returns: Json
      }
      research_report_vault: {
        Args: { _note?: string; _online: boolean; _source: string }
        Returns: Json
      }
      research_report_vault_write: {
        Args: {
          _capture: string
          _custody_event?: string
          _sha256_on_write: string
        }
        Returns: Json
      }
      research_scope_refusal: {
        Args: {
          _job_type: string
          _plan: string
          _source: string
          _target: string
          _terms: string[]
        }
        Returns: string
      }
      research_second_check: { Args: { _capture: string }; Returns: undefined }
      research_set_connector: {
        Args: { _key: string; _reason?: string; _status: string }
        Returns: undefined
      }
      research_set_status: {
        Args: { _plan: string; _reason?: string; _status: string }
        Returns: undefined
      }
      research_set_tier: {
        Args: { _capture: string; _tier: string }
        Returns: undefined
      }
      research_set_vault_window: {
        Args: { _minutes: number }
        Returns: undefined
      }
      research_start_plan: { Args: { _plan: string }; Returns: string }
      research_submit_capture: {
        Args: {
          _captured_by?: string
          _context?: Json
          _evidence_ref?: string
          _fstd001_version: string
          _item_ref: string
          _run: string
          _sha256: string
          _source: string
          _target: string
          _terms: string[]
        }
        Returns: Json
      }
      research_submit_capture_std: {
        Args: { _item: Json; _run: string }
        Returns: Json
      }
      research_submit_job: {
        Args: {
          _job_type: string
          _key: string
          _plan: string
          _source: string
          _target: string
          _terms: string[]
        }
        Returns: Json
      }
      research_vault_window_minutes: { Args: never; Returns: number }
      scenario_options_ok: { Args: { _o: Json }; Returns: boolean }
      signup_open: { Args: never; Returns: boolean }
      sla_check_alerts: { Args: { _clock: string }; Returns: undefined }
      sla_clock_status: { Args: { _clock: string }; Returns: Json }
      sla_kpis: { Args: { _phase?: number }; Returns: Json }
      sla_pause: {
        Args: { _clock: string; _note: string; _reason: string }
        Returns: undefined
      }
      sla_paused_days: { Args: { _clock: string }; Returns: number }
      sla_project_phase: {
        Args: { _project: string }
        Returns: Record<string, unknown>
      }
      sla_refresh: { Args: { _project: string }; Returns: undefined }
      sla_resume: { Args: { _clock: string }; Returns: undefined }
      sla_set_holiday: {
        Args: { _day: string; _name: string; _remove: boolean }
        Returns: undefined
      }
      sla_sync: { Args: { _project: string }; Returns: undefined }
      sla_working_days: { Args: { _a: string; _b: string }; Returns: number }
      sop_save: {
        Args: {
          _chain: string[]
          _owner: string
          _phase: number
          _steps: Json
          _target: number
          _warn: number
        }
        Returns: string
      }
      statements_ok: { Args: { _s: Json }; Returns: boolean }
      vault_apply_offline: { Args: never; Returns: number }
      vault_cloud_copy_for: { Args: { doc: string }; Returns: Json }
      vault_cloud_online: { Args: never; Returns: boolean }
      vault_enqueue: {
        Args: {
          _kind: string
          _project: string
          _ref: string
          _sha: string
          _target: string
        }
        Returns: undefined
      }
      vault_outbox_pending: { Args: { _id: string }; Returns: boolean }
      vault_outbox_record: {
        Args: { _id: string; _reason?: string; _sha256_on_write: string }
        Returns: Json
      }
      vault_record_check: {
        Args: {
          _actor: string
          _detail: Json
          _outcome: string
          _vault: string
        }
        Returns: undefined
      }
      vault_record_rotation: {
        Args: { _note: string; _vault: string }
        Returns: string
      }
      vault_row_sha: { Args: { j: Json }; Returns: string }
      vault_set_cloud_route: { Args: { _route: string }; Returns: undefined }
      vault_status: { Args: never; Returns: Json }
    }
    Enums: {
      app_role: "owner" | "analyst" | "curator" | "management"
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
      app_role: ["owner", "analyst", "curator", "management"],
    },
  },
} as const
