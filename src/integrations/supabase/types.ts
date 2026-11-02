export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17";
  };
  public: {
    Tables: {
      account_snapshots: {
        Row: {
          account_id: string;
          bio_verbatim: string | null;
          captured_at: string;
          created: string | null;
          display_name: string | null;
          followers: number | null;
          following: number | null;
          id: string;
          verified: boolean | null;
        };
        Insert: {
          account_id: string;
          bio_verbatim?: string | null;
          captured_at?: string;
          created?: string | null;
          display_name?: string | null;
          followers?: number | null;
          following?: number | null;
          id?: string;
          verified?: boolean | null;
        };
        Update: {
          account_id?: string;
          bio_verbatim?: string | null;
          captured_at?: string;
          created?: string | null;
          display_name?: string | null;
          followers?: number | null;
          following?: number | null;
          id?: string;
          verified?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "account_snapshots_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      accounts: {
        Row: {
          created_at: string;
          display_name: string | null;
          handle: string;
          id: string;
          incident_uuid: string;
          platform: string;
          platform_id: string | null;
          profile_url: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          handle: string;
          id?: string;
          incident_uuid: string;
          platform?: string;
          platform_id?: string | null;
          profile_url?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          handle?: string;
          id?: string;
          incident_uuid?: string;
          platform?: string;
          platform_id?: string | null;
          profile_url?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "accounts_incident_uuid_fkey";
            columns: ["incident_uuid"];
            isOneToOne: false;
            referencedRelation: "incidents";
            referencedColumns: ["id"];
          },
        ];
      };
      analyst_assessments: {
        Row: {
          analyst: string | null;
          assessed_on: string;
          assessment: string;
          basis: string | null;
          created_at: string;
          id: string;
          item_id: string | null;
          subject_profile_id: string | null;
        };
        Insert: {
          analyst?: string | null;
          assessed_on?: string;
          assessment: string;
          basis?: string | null;
          created_at?: string;
          id?: string;
          item_id?: string | null;
          subject_profile_id?: string | null;
        };
        Update: {
          analyst?: string | null;
          assessed_on?: string;
          assessment?: string;
          basis?: string | null;
          created_at?: string;
          id?: string;
          item_id?: string | null;
          subject_profile_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "analyst_assessments_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "analyst_assessments_subject_profile_id_fkey";
            columns: ["subject_profile_id"];
            isOneToOne: false;
            referencedRelation: "subject_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      artefacts: {
        Row: {
          captured_at: string;
          created_at: string;
          filename: string;
          id: string;
          item_id: string;
          kind: string;
          mime_type: string | null;
          sha256: string | null;
          size_bytes: number | null;
          storage_path: string;
        };
        Insert: {
          captured_at?: string;
          created_at?: string;
          filename: string;
          id?: string;
          item_id: string;
          kind: string;
          mime_type?: string | null;
          sha256?: string | null;
          size_bytes?: number | null;
          storage_path: string;
        };
        Update: {
          captured_at?: string;
          created_at?: string;
          filename?: string;
          id?: string;
          item_id?: string;
          kind?: string;
          mime_type?: string | null;
          sha256?: string | null;
          size_bytes?: number | null;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "artefacts_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
        ];
      };
      capture_jobs: {
        Row: {
          case_id: string | null;
          case_meta: Json;
          claimed_at: string | null;
          created_at: string;
          created_by: string | null;
          finished_at: string | null;
          handler: string | null;
          id: string;
          incident_date: string | null;
          incident_id: string | null;
          incident_meta: Json;
          log: string[];
          options: Json;
          result: Json | null;
          status: string;
          updated_at: string;
          url: string;
          warnings: string[];
        };
        Insert: {
          case_id?: string | null;
          case_meta?: Json;
          claimed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          finished_at?: string | null;
          handler?: string | null;
          id?: string;
          incident_date?: string | null;
          incident_id?: string | null;
          incident_meta?: Json;
          log?: string[];
          options?: Json;
          result?: Json | null;
          status?: string;
          updated_at?: string;
          url: string;
          warnings?: string[];
        };
        Update: {
          case_id?: string | null;
          case_meta?: Json;
          claimed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          finished_at?: string | null;
          handler?: string | null;
          id?: string;
          incident_date?: string | null;
          incident_id?: string | null;
          incident_meta?: Json;
          log?: string[];
          options?: Json;
          result?: Json | null;
          status?: string;
          updated_at?: string;
          url?: string;
          warnings?: string[];
        };
        Relationships: [];
      };
      capture_settings: {
        Row: {
          expand_comments: boolean;
          fb_account_label: string | null;
          id: string;
          notes: string | null;
          profile_fields: Json;
          proxy_url: string | null;
          save_pdf: boolean;
          timeout_seconds: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          expand_comments?: boolean;
          fb_account_label?: string | null;
          id?: string;
          notes?: string | null;
          profile_fields?: Json;
          proxy_url?: string | null;
          save_pdf?: boolean;
          timeout_seconds?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          expand_comments?: boolean;
          fb_account_label?: string | null;
          id?: string;
          notes?: string | null;
          profile_fields?: Json;
          proxy_url?: string | null;
          save_pdf?: boolean;
          timeout_seconds?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      case_assignments: {
        Row: {
          assigned_by: string | null;
          case_id: string;
          created_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          assigned_by?: string | null;
          case_id: string;
          created_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          assigned_by?: string | null;
          case_id?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "case_assignments_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "cases";
            referencedColumns: ["id"];
          },
        ];
      };
      case_templates: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          fields: Json;
          id: string;
          is_default: boolean;
          jurisdiction_agency: string | null;
          name: string;
          offence_alleged: string | null;
          required_artefacts: string[];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          fields?: Json;
          id?: string;
          is_default?: boolean;
          jurisdiction_agency?: string | null;
          name: string;
          offence_alleged?: string | null;
          required_artefacts?: string[];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          fields?: Json;
          id?: string;
          is_default?: boolean;
          jurisdiction_agency?: string | null;
          name?: string;
          offence_alleged?: string | null;
          required_artefacts?: string[];
          updated_at?: string;
        };
        Relationships: [];
      };
      cases: {
        Row: {
          created_at: string;
          id: string;
          jurisdiction_agency: string | null;
          lead_handler: string | null;
          notes: string | null;
          offence_alleged: string | null;
          opened_on: string;
          related_cases: string[];
          status: string;
          target_of_complaint: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          jurisdiction_agency?: string | null;
          lead_handler?: string | null;
          notes?: string | null;
          offence_alleged?: string | null;
          opened_on?: string;
          related_cases?: string[];
          status?: string;
          target_of_complaint?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          jurisdiction_agency?: string | null;
          lead_handler?: string | null;
          notes?: string | null;
          offence_alleged?: string | null;
          opened_on?: string;
          related_cases?: string[];
          status?: string;
          target_of_complaint?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      custody_events: {
        Row: {
          action: string;
          artefact_id: string | null;
          created_at: string;
          filename: string | null;
          handler: string | null;
          id: string;
          item_id: string | null;
          notes: string | null;
          sha256: string | null;
          source_id: string;
          evidence_ref_id: string | null;
          tool_version: string | null;
        };
        Insert: {
          action: string;
          artefact_id?: string | null;
          created_at?: string;
          filename?: string | null;
          handler?: string | null;
          id?: string;
          item_id?: string | null;
          notes?: string | null;
          sha256?: string | null;
          source_id?: string;
          evidence_ref_id?: string | null;
          tool_version?: string | null;
        };
        Update: {
          action?: string;
          artefact_id?: string | null;
          created_at?: string;
          filename?: string | null;
          handler?: string | null;
          id?: string;
          item_id?: string | null;
          notes?: string | null;
          sha256?: string | null;
          source_id?: string;
          evidence_ref_id?: string | null;
          tool_version?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "custody_events_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "custody_events_evidence_ref_id_fkey";
            columns: ["evidence_ref_id"];
            isOneToOne: false;
            referencedRelation: "evidence_refs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "custody_events_artefact_id_fkey";
            columns: ["artefact_id"];
            isOneToOne: false;
            referencedRelation: "artefacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "custody_events_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
        ];
      };
      evidence_refs: {
        Row: {
          case_id: string;
          files: Json;
          id: string;
          incident_id: string | null;
          item_type: string | null;
          linked_at: string;
          linked_by: string | null;
          linked_by_name: string | null;
          note: string | null;
          platform: string | null;
          published_at: string | null;
          record_code: string;
          record_id: string;
          source_id: string;
        };
        Insert: {
          case_id: string;
          files?: Json;
          id?: string;
          incident_id?: string | null;
          item_type?: string | null;
          linked_at?: string;
          linked_by?: string | null;
          linked_by_name?: string | null;
          note?: string | null;
          platform?: string | null;
          published_at?: string | null;
          record_code: string;
          record_id: string;
          source_id: string;
        };
        Update: {
          case_id?: string;
          files?: Json;
          id?: string;
          incident_id?: string | null;
          item_type?: string | null;
          linked_at?: string;
          linked_by?: string | null;
          linked_by_name?: string | null;
          note?: string | null;
          platform?: string | null;
          published_at?: string | null;
          record_code?: string;
          record_id?: string;
          source_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "evidence_refs_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "cases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "evidence_refs_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "incidents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "evidence_refs_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
        ];
      };
      incidents: {
        Row: {
          case_id: string;
          created_at: string;
          end_date: string | null;
          escalation_stage: string | null;
          id: string;
          incident_id: string;
          narrative_themes: string[];
          start_date: string | null;
          summary: string | null;
          updated_at: string;
        };
        Insert: {
          case_id: string;
          created_at?: string;
          end_date?: string | null;
          escalation_stage?: string | null;
          id?: string;
          incident_id: string;
          narrative_themes?: string[];
          start_date?: string | null;
          summary?: string | null;
          updated_at?: string;
        };
        Update: {
          case_id?: string;
          created_at?: string;
          end_date?: string | null;
          escalation_stage?: string | null;
          id?: string;
          incident_id?: string;
          narrative_themes?: string[];
          start_date?: string | null;
          summary?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "incidents_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "cases";
            referencedColumns: ["id"];
          },
        ];
      };
      items: {
        Row: {
          account_id: string;
          author_handle: string | null;
          author_name: string | null;
          author_url: string | null;
          captured_at: string;
          created_at: string;
          engagement: Json;
          folder_path: string | null;
          id: string;
          item_code: string;
          item_type: string;
          parent_item_id: string | null;
          platform_item_id: string | null;
          published_at: string | null;
          text_en: string | null;
          text_original: string | null;
          translator_statement: string | null;
          url: string | null;
        };
        Insert: {
          account_id: string;
          author_handle?: string | null;
          author_name?: string | null;
          author_url?: string | null;
          captured_at?: string;
          created_at?: string;
          engagement?: Json;
          folder_path?: string | null;
          id?: string;
          item_code: string;
          item_type: string;
          parent_item_id?: string | null;
          platform_item_id?: string | null;
          published_at?: string | null;
          text_en?: string | null;
          text_original?: string | null;
          translator_statement?: string | null;
          url?: string | null;
        };
        Update: {
          account_id?: string;
          author_handle?: string | null;
          author_name?: string | null;
          author_url?: string | null;
          captured_at?: string;
          created_at?: string;
          engagement?: Json;
          folder_path?: string | null;
          id?: string;
          item_code?: string;
          item_type?: string;
          parent_item_id?: string | null;
          platform_item_id?: string | null;
          published_at?: string | null;
          text_en?: string | null;
          text_original?: string | null;
          translator_statement?: string | null;
          url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "items_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "items_parent_item_id_fkey";
            columns: ["parent_item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          default_handler: string | null;
          display_name: string | null;
          email: string | null;
          id: string;
          is_owner: boolean;
        };
        Insert: {
          created_at?: string;
          default_handler?: string | null;
          display_name?: string | null;
          email?: string | null;
          id: string;
          is_owner?: boolean;
        };
        Update: {
          created_at?: string;
          default_handler?: string | null;
          display_name?: string | null;
          email?: string | null;
          id?: string;
          is_owner?: boolean;
        };
        Relationships: [];
      };
      sources: {
        Row: {
          created_at: string;
          description: string | null;
          enabled: boolean;
          gateway_url: string | null;
          id: string;
          kind: string;
          name: string;
          settings: Json;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          enabled?: boolean;
          gateway_url?: string | null;
          id: string;
          kind: string;
          name: string;
          settings?: Json;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          enabled?: boolean;
          gateway_url?: string | null;
          id?: string;
          kind?: string;
          name?: string;
          settings?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      subject_profiles: {
        Row: {
          account_id: string | null;
          created_at: string;
          id: string;
          insufficient_data: boolean;
          item_id: string | null;
          observed: Json;
          stated: Json;
          subject_type: string;
        };
        Insert: {
          account_id?: string | null;
          created_at?: string;
          id?: string;
          insufficient_data?: boolean;
          item_id?: string | null;
          observed?: Json;
          stated?: Json;
          subject_type: string;
        };
        Update: {
          account_id?: string | null;
          created_at?: string;
          id?: string;
          insufficient_data?: boolean;
          item_id?: string | null;
          observed?: Json;
          stated?: Json;
          subject_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subject_profiles_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subject_profiles_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      watch_seen: {
        Row: {
          baseline: boolean;
          first_seen_at: string;
          id: string;
          job_id: string | null;
          post_url: string;
          target_id: string;
        };
        Insert: {
          baseline?: boolean;
          first_seen_at?: string;
          id?: string;
          job_id?: string | null;
          post_url: string;
          target_id: string;
        };
        Update: {
          baseline?: boolean;
          first_seen_at?: string;
          id?: string;
          job_id?: string | null;
          post_url?: string;
          target_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "watch_seen_target_id_fkey";
            columns: ["target_id"];
            isOneToOne: false;
            referencedRelation: "watch_targets";
            referencedColumns: ["id"];
          },
        ];
      };
      watch_targets: {
        Row: {
          active: boolean;
          case_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          interval_minutes: number;
          label: string | null;
          last_checked_at: string | null;
          last_error: string | null;
          last_found: number | null;
          platform: string;
          url: string;
        };
        Insert: {
          active?: boolean;
          case_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          interval_minutes?: number;
          label?: string | null;
          last_checked_at?: string | null;
          last_error?: string | null;
          last_found?: number | null;
          platform?: string;
          url: string;
        };
        Update: {
          active?: boolean;
          case_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          interval_minutes?: number;
          label?: string | null;
          last_checked_at?: string | null;
          last_error?: string | null;
          last_found?: number | null;
          platform?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "watch_targets_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "cases";
            referencedColumns: ["id"];
          },
        ];
      };
      worker_status: {
        Row: {
          hostname: string | null;
          id: string;
          info: Json;
          last_seen: string | null;
          public_ip: string | null;
          restart_requested_at: string | null;
          version: string | null;
        };
        Insert: {
          hostname?: string | null;
          id?: string;
          info?: Json;
          last_seen?: string | null;
          public_ip?: string | null;
          restart_requested_at?: string | null;
          version?: string | null;
        };
        Update: {
          hostname?: string | null;
          id?: string;
          info?: Json;
          last_seen?: string | null;
          public_ip?: string | null;
          restart_requested_at?: string | null;
          version?: string | null;
        };
        Relationships: [];
      };
      clients: {
        Row: {
          code: string;
          contact_email: string | null;
          contact_name: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          legal_name: string | null;
          name: string;
          notes: string | null;
          portal_enabled: boolean;
          sector: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          contact_email?: string | null;
          contact_name?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          legal_name?: string | null;
          name: string;
          notes?: string | null;
          portal_enabled?: boolean;
          sector?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          contact_email?: string | null;
          contact_name?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          legal_name?: string | null;
          name?: string;
          notes?: string | null;
          portal_enabled?: boolean;
          sector?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          client_id: string;
          code: string;
          created_at: string;
          created_by: string | null;
          design_stale: boolean;
          due_on: string | null;
          id: string;
          name: string;
          opened_on: string;
          sponsor_name: string | null;
          status: string;
          summary: string | null;
          updated_at: string;
        };
        Insert: {
          client_id: string;
          code: string;
          created_at?: string;
          created_by?: string | null;
          design_stale?: boolean;
          due_on?: string | null;
          id?: string;
          name: string;
          opened_on?: string;
          sponsor_name?: string | null;
          status?: string;
          summary?: string | null;
          updated_at?: string;
        };
        Update: {
          client_id?: string;
          code?: string;
          created_at?: string;
          created_by?: string | null;
          design_stale?: boolean;
          due_on?: string | null;
          id?: string;
          name?: string;
          opened_on?: string;
          sponsor_name?: string | null;
          status?: string;
          summary?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      project_members: {
        Row: {
          added_at: string;
          added_by: string | null;
          project_id: string;
          role: string;
          user_id: string;
        };
        Insert: {
          added_at?: string;
          added_by?: string | null;
          project_id: string;
          role: string;
          user_id: string;
        };
        Update: {
          added_at?: string;
          added_by?: string | null;
          project_id?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_briefs: {
        Row: {
          amendment_no: number | null;
          audiences: Json;
          authored_at: string;
          authored_by: string | null;
          authored_by_name: string | null;
          caps: string | null;
          change_reason: string | null;
          change_summary: string | null;
          constraints_risks: Json;
          facts: Json;
          governance: Json;
          held_groups: string | null;
          id: string;
          in_scope: string | null;
          kind: string;
          languages: string[];
          objectives: string[];
          out_of_scope: string | null;
          platforms: string[];
          project_id: string;
          purpose_decisions: string | null;
          ranked_asks: Json;
          requested_by: string | null;
          research_content_note: string | null;
          response_parameters: Json;
          sample_rule: string | null;
          scope_changed: boolean;
          situation: string | null;
          unknowns: string[];
          version: number;
          window_from: string | null;
          window_to: string | null;
        };
        Insert: {
          amendment_no?: number | null;
          audiences?: Json;
          authored_at?: string;
          authored_by?: string | null;
          authored_by_name?: string | null;
          caps?: string | null;
          change_reason?: string | null;
          change_summary?: string | null;
          constraints_risks?: Json;
          facts?: Json;
          governance?: Json;
          held_groups?: string | null;
          id?: string;
          in_scope?: string | null;
          kind?: string;
          languages?: string[];
          objectives?: string[];
          out_of_scope?: string | null;
          platforms?: string[];
          project_id: string;
          purpose_decisions?: string | null;
          ranked_asks?: Json;
          requested_by?: string | null;
          research_content_note?: string | null;
          response_parameters?: Json;
          sample_rule?: string | null;
          scope_changed?: boolean;
          situation?: string | null;
          unknowns?: string[];
          version: number;
          window_from?: string | null;
          window_to?: string | null;
        };
        Update: {
          amendment_no?: number | null;
          audiences?: Json;
          authored_at?: string;
          authored_by?: string | null;
          authored_by_name?: string | null;
          caps?: string | null;
          change_reason?: string | null;
          change_summary?: string | null;
          constraints_risks?: Json;
          facts?: Json;
          governance?: Json;
          held_groups?: string | null;
          id?: string;
          in_scope?: string | null;
          kind?: string;
          languages?: string[];
          objectives?: string[];
          out_of_scope?: string | null;
          platforms?: string[];
          project_id?: string;
          purpose_decisions?: string | null;
          ranked_asks?: Json;
          requested_by?: string | null;
          research_content_note?: string | null;
          response_parameters?: Json;
          sample_rule?: string | null;
          scope_changed?: boolean;
          situation?: string | null;
          unknowns?: string[];
          version?: number;
          window_from?: string | null;
          window_to?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "project_briefs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_amendment_approvals: {
        Row: {
          brief_id: string;
          decided_at: string;
          decided_by: string | null;
          decided_by_name: string | null;
          decision: string;
          id: string;
          note: string | null;
          project_id: string;
        };
        Insert: {
          brief_id: string;
          decided_at?: string;
          decided_by?: string | null;
          decided_by_name?: string | null;
          decision: string;
          id?: string;
          note?: string | null;
          project_id: string;
        };
        Update: {
          brief_id?: string;
          decided_at?: string;
          decided_by?: string | null;
          decided_by_name?: string | null;
          decision?: string;
          id?: string;
          note?: string | null;
          project_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_amendment_approvals_brief_id_fkey";
            columns: ["brief_id"];
            isOneToOne: false;
            referencedRelation: "project_briefs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_amendment_approvals_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_gates: {
        Row: {
          brief_id: string | null;
          cycle_no: number;
          design_version: number | null;
          gate: string;
          id: string;
          note: string | null;
          output_id: string | null;
          project_id: string;
          read_back_on: string | null;
          recipient: string | null;
          signed_at: string;
          signed_by: string | null;
          signed_by_name: string | null;
          signed_document_sha256: string | null;
          sponsor_name: string | null;
          sponsor_role: string | null;
          written_approval_ref: string | null;
        };
        Insert: {
          brief_id?: string | null;
          cycle_no?: number;
          design_version?: number | null;
          gate: string;
          id?: string;
          note?: string | null;
          output_id?: string | null;
          project_id: string;
          read_back_on?: string | null;
          recipient?: string | null;
          signed_at?: string;
          signed_by?: string | null;
          signed_by_name?: string | null;
          signed_document_sha256?: string | null;
          sponsor_name?: string | null;
          sponsor_role?: string | null;
          written_approval_ref?: string | null;
        };
        Update: {
          brief_id?: string | null;
          cycle_no?: number;
          design_version?: number | null;
          gate?: string;
          id?: string;
          note?: string | null;
          output_id?: string | null;
          project_id?: string;
          read_back_on?: string | null;
          recipient?: string | null;
          signed_at?: string;
          signed_by?: string | null;
          signed_by_name?: string | null;
          signed_document_sha256?: string | null;
          sponsor_name?: string | null;
          sponsor_role?: string | null;
          written_approval_ref?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "project_gates_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_interviews: {
        Row: {
          actions: string | null;
          created_at: string;
          created_by: string | null;
          disagreements: string | null;
          duration_min: number | null;
          held_at: string;
          id: string;
          interviewee: string;
          interviewee_role: string;
          interviewer: string;
          interviewer_name: string | null;
          key_statements: Json;
          note_taker: string;
          note_taker_name: string | null;
          priorities: string[];
          project_id: string;
          readback_confirmed: boolean;
        };
        Insert: {
          actions?: string | null;
          created_at?: string;
          created_by?: string | null;
          disagreements?: string | null;
          duration_min?: number | null;
          held_at: string;
          id?: string;
          interviewee: string;
          interviewee_role: string;
          interviewer: string;
          interviewer_name?: string | null;
          key_statements?: Json;
          note_taker: string;
          note_taker_name?: string | null;
          priorities?: string[];
          project_id: string;
          readback_confirmed?: boolean;
        };
        Update: {
          actions?: string | null;
          created_at?: string;
          created_by?: string | null;
          disagreements?: string | null;
          duration_min?: number | null;
          held_at?: string;
          id?: string;
          interviewee?: string;
          interviewee_role?: string;
          interviewer?: string;
          interviewer_name?: string | null;
          key_statements?: Json;
          note_taker?: string;
          note_taker_name?: string | null;
          priorities?: string[];
          project_id?: string;
          readback_confirmed?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "project_interviews_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_intake_items: {
        Row: {
          claim_status: string;
          decline_reason: string | null;
          declined: boolean;
          description: string;
          id: string;
          item_ref: string;
          logged_at: string;
          logged_by: string | null;
          logged_by_name: string | null;
          personal_data: boolean;
          produced_by: string | null;
          produced_for: string | null;
          produced_on: string | null;
          project_id: string;
          received_on: string;
          rev: number;
          sensitivity: string;
          sha256: string;
          use_class: string;
          verification_note: string | null;
        };
        Insert: {
          claim_status: string;
          decline_reason?: string | null;
          declined?: boolean;
          description: string;
          id?: string;
          item_ref?: string;
          logged_at?: string;
          logged_by?: string | null;
          logged_by_name?: string | null;
          personal_data: boolean;
          produced_by?: string | null;
          produced_for?: string | null;
          produced_on?: string | null;
          project_id: string;
          received_on: string;
          rev?: number;
          sensitivity: string;
          sha256: string;
          use_class: string;
          verification_note?: string | null;
        };
        Update: {
          claim_status?: string;
          decline_reason?: string | null;
          declined?: boolean;
          description?: string;
          id?: string;
          item_ref?: string;
          logged_at?: string;
          logged_by?: string | null;
          logged_by_name?: string | null;
          personal_data?: boolean;
          produced_by?: string | null;
          produced_for?: string | null;
          produced_on?: string | null;
          project_id?: string;
          received_on?: string;
          rev?: number;
          sensitivity?: string;
          sha256?: string;
          use_class?: string;
          verification_note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "project_intake_items_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_research_questions: {
        Row: {
          brief_section: number;
          created_at: string;
          created_by: string | null;
          created_by_name: string | null;
          hypothesis: string | null;
          id: string;
          project_id: string;
          question: string;
          rev: number;
          rq_no: string;
          withdrawn: boolean;
        };
        Insert: {
          brief_section: number;
          created_at?: string;
          created_by?: string | null;
          created_by_name?: string | null;
          hypothesis?: string | null;
          id?: string;
          project_id: string;
          question: string;
          rev?: number;
          rq_no: string;
          withdrawn?: boolean;
        };
        Update: {
          brief_section?: number;
          created_at?: string;
          created_by?: string | null;
          created_by_name?: string | null;
          hypothesis?: string | null;
          id?: string;
          project_id?: string;
          question?: string;
          rev?: number;
          rq_no?: string;
          withdrawn?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "project_research_questions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_scenarios: {
        Row: {
          amendment_id: string | null;
          approver: string;
          created_at: string;
          created_by: string | null;
          created_by_name: string | null;
          decision_owner: string;
          fa_will_not_say: string;
          fa_will_say: string;
          id: string;
          informed: string | null;
          min_evidence_tier: string | null;
          name: string;
          probability: string | null;
          probability_source: string | null;
          project_id: string;
          readers_required: number;
          response_options: Json;
          rev: number;
          review_date: string | null;
          scenario_no: string;
          scenario_type: string;
          situation: string;
          threshold: string;
          time_frame: string;
          trigger_indicators: string;
          withdrawn: boolean;
        };
        Insert: {
          amendment_id?: string | null;
          approver: string;
          created_at?: string;
          created_by?: string | null;
          created_by_name?: string | null;
          decision_owner: string;
          fa_will_not_say: string;
          fa_will_say: string;
          id?: string;
          informed?: string | null;
          min_evidence_tier?: string | null;
          name: string;
          probability?: string | null;
          probability_source?: string | null;
          project_id: string;
          readers_required?: number;
          response_options: Json;
          rev?: number;
          review_date?: string | null;
          scenario_no: string;
          scenario_type: string;
          situation: string;
          threshold: string;
          time_frame: string;
          trigger_indicators: string;
          withdrawn?: boolean;
        };
        Update: {
          amendment_id?: string | null;
          approver?: string;
          created_at?: string;
          created_by?: string | null;
          created_by_name?: string | null;
          decision_owner?: string;
          fa_will_not_say?: string;
          fa_will_say?: string;
          id?: string;
          informed?: string | null;
          min_evidence_tier?: string | null;
          name?: string;
          probability?: string | null;
          probability_source?: string | null;
          project_id?: string;
          readers_required?: number;
          response_options?: Json;
          rev?: number;
          review_date?: string | null;
          scenario_no?: string;
          scenario_type?: string;
          situation?: string;
          threshold?: string;
          time_frame?: string;
          trigger_indicators?: string;
          withdrawn?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "project_scenarios_amendment_id_fkey";
            columns: ["amendment_id"];
            isOneToOne: false;
            referencedRelation: "project_briefs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_scenarios_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_scenario_events: {
        Row: {
          confirmed_by: string[];
          counts: Json;
          created_at: string;
          created_by: string | null;
          created_by_name: string | null;
          cycle_no: number;
          event: string;
          evidence_tier: string | null;
          id: string;
          note: string | null;
          project_id: string;
          scenario_no: string;
        };
        Insert: {
          confirmed_by?: string[];
          counts?: Json;
          created_at?: string;
          created_by?: string | null;
          created_by_name?: string | null;
          cycle_no?: number;
          event: string;
          evidence_tier?: string | null;
          id?: string;
          note?: string | null;
          project_id: string;
          scenario_no: string;
        };
        Update: {
          confirmed_by?: string[];
          counts?: Json;
          created_at?: string;
          created_by?: string | null;
          created_by_name?: string | null;
          cycle_no?: number;
          event?: string;
          evidence_tier?: string | null;
          id?: string;
          note?: string | null;
          project_id?: string;
          scenario_no?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_scenario_events_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_success_measures: {
        Row: {
          amendment_id: string | null;
          baseline: string | null;
          baseline_source: string | null;
          client_figure: boolean;
          created_at: string;
          created_by: string | null;
          created_by_name: string | null;
          data_source: string | null;
          id: string;
          level: string;
          measure: string;
          measure_no: string;
          observable: boolean;
          project_id: string;
          rev: number;
          target: string | null;
          withdrawn: boolean;
        };
        Insert: {
          amendment_id?: string | null;
          baseline?: string | null;
          baseline_source?: string | null;
          client_figure?: boolean;
          created_at?: string;
          created_by?: string | null;
          created_by_name?: string | null;
          data_source?: string | null;
          id?: string;
          level: string;
          measure: string;
          measure_no: string;
          observable?: boolean;
          project_id: string;
          rev?: number;
          target?: string | null;
          withdrawn?: boolean;
        };
        Update: {
          amendment_id?: string | null;
          baseline?: string | null;
          baseline_source?: string | null;
          client_figure?: boolean;
          created_at?: string;
          created_by?: string | null;
          created_by_name?: string | null;
          data_source?: string | null;
          id?: string;
          level?: string;
          measure?: string;
          measure_no?: string;
          observable?: boolean;
          project_id?: string;
          rev?: number;
          target?: string | null;
          withdrawn?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "project_success_measures_amendment_id_fkey";
            columns: ["amendment_id"];
            isOneToOne: false;
            referencedRelation: "project_briefs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_success_measures_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_scope_sheets: {
        Row: {
          completed_at: string;
          completed_by: string | null;
          completed_by_name: string | null;
          id: string;
          legal_note: string | null;
          mandate: string;
          project_id: string;
          risk_screen: Json;
          risk_screen_done: boolean;
          scope_summary: string;
        };
        Insert: {
          completed_at?: string;
          completed_by?: string | null;
          completed_by_name?: string | null;
          id?: string;
          legal_note?: string | null;
          mandate?: string;
          project_id: string;
          risk_screen?: Json;
          risk_screen_done?: boolean;
          scope_summary: string;
        };
        Update: {
          completed_at?: string;
          completed_by?: string | null;
          completed_by_name?: string | null;
          id?: string;
          legal_note?: string | null;
          mandate?: string;
          project_id?: string;
          risk_screen?: Json;
          risk_screen_done?: boolean;
          scope_summary?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_scope_sheets_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_design_sheets: {
        Row: {
          authored_at: string;
          authored_by: string | null;
          authored_by_name: string | null;
          comment_cap: number;
          comment_order: string;
          exclusion_codes: string[];
          id: string;
          lexicon: Json;
          lexicon_sample_tested: boolean;
          lexicon_version: string;
          obfuscated_spellings_tested: boolean;
          project_id: string;
          sample_rule: string;
          traces: Json;
          version: number;
        };
        Insert: {
          authored_at?: string;
          authored_by?: string | null;
          authored_by_name?: string | null;
          comment_cap: number;
          comment_order: string;
          exclusion_codes: string[];
          id?: string;
          lexicon: Json;
          lexicon_sample_tested?: boolean;
          lexicon_version: string;
          obfuscated_spellings_tested?: boolean;
          project_id: string;
          sample_rule: string;
          traces: Json;
          version: number;
        };
        Update: {
          authored_at?: string;
          authored_by?: string | null;
          authored_by_name?: string | null;
          comment_cap?: number;
          comment_order?: string;
          exclusion_codes?: string[];
          id?: string;
          lexicon?: Json;
          lexicon_sample_tested?: boolean;
          lexicon_version?: string;
          obfuscated_spellings_tested?: boolean;
          project_id?: string;
          sample_rule?: string;
          traces?: Json;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "project_design_sheets_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_targets: {
        Row: {
          created_at: string;
          created_by: string | null;
          curator_confirmed: boolean;
          curator_confirmed_by: string | null;
          handle: string;
          id: string;
          identity_resolved: boolean;
          note: string | null;
          platform: string;
          project_id: string;
          rev: number;
          target_group: string | null;
          target_key: string;
          withdrawn: boolean;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          curator_confirmed?: boolean;
          curator_confirmed_by?: string | null;
          handle: string;
          id?: string;
          identity_resolved?: boolean;
          note?: string | null;
          platform: string;
          project_id: string;
          rev?: number;
          target_group?: string | null;
          target_key: string;
          withdrawn?: boolean;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          curator_confirmed?: boolean;
          curator_confirmed_by?: string | null;
          handle?: string;
          id?: string;
          identity_resolved?: boolean;
          note?: string | null;
          platform?: string;
          project_id?: string;
          rev?: number;
          target_group?: string | null;
          target_key?: string;
          withdrawn?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "project_targets_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_cycles: {
        Row: {
          cycle_no: number;
          id: string;
          kind: string;
          note: string | null;
          opened_at: string;
          opened_by: string | null;
          project_id: string;
          tag: string | null;
        };
        Insert: {
          cycle_no: number;
          id?: string;
          kind: string;
          note?: string | null;
          opened_at?: string;
          opened_by?: string | null;
          project_id: string;
          tag?: string | null;
        };
        Update: {
          cycle_no?: number;
          id?: string;
          kind?: string;
          note?: string | null;
          opened_at?: string;
          opened_by?: string | null;
          project_id?: string;
          tag?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "project_cycles_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_cases: {
        Row: {
          case_id: string;
          linked_at: string;
          linked_by: string | null;
          note: string | null;
          project_id: string;
          void_note: string | null;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          case_id: string;
          linked_at?: string;
          linked_by?: string | null;
          note?: string | null;
          project_id: string;
          void_note?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          case_id?: string;
          linked_at?: string;
          linked_by?: string | null;
          note?: string | null;
          project_id?: string;
          void_note?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "project_cases_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "cases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_cases_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_items: {
        Row: {
          chunk_no: number | null;
          cycle_no: number;
          evidence_ref_id: string | null;
          id: string;
          item_id: string | null;
          item_kind: string;
          linked_at: string;
          linked_by: string | null;
          matched_terms: string[];
          note: string | null;
          project_id: string;
          screen_score: number | null;
          source_line: string | null;
          void_note: string | null;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          chunk_no?: number | null;
          cycle_no?: number;
          evidence_ref_id?: string | null;
          id?: string;
          item_id?: string | null;
          item_kind: string;
          linked_at?: string;
          linked_by?: string | null;
          matched_terms?: string[];
          note?: string | null;
          project_id: string;
          screen_score?: number | null;
          source_line?: string | null;
          void_note?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          chunk_no?: number | null;
          cycle_no?: number;
          evidence_ref_id?: string | null;
          id?: string;
          item_id?: string | null;
          item_kind?: string;
          linked_at?: string;
          linked_by?: string | null;
          matched_terms?: string[];
          note?: string | null;
          project_id?: string;
          screen_score?: number | null;
          source_line?: string | null;
          void_note?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "project_items_evidence_ref_id_fkey";
            columns: ["evidence_ref_id"];
            isOneToOne: false;
            referencedRelation: "evidence_refs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_items_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_items_project_id_cycle_no_fkey";
            columns: ["cycle_no"];
            isOneToOne: false;
            referencedRelation: "project_cycles";
            referencedColumns: ["project_id"];
          },
          {
            foreignKeyName: "project_items_project_id_cycle_no_fkey";
            columns: ["cycle_no"];
            isOneToOne: false;
            referencedRelation: "project_cycles";
            referencedColumns: ["cycle_no"];
          },
          {
            foreignKeyName: "project_items_project_id_cycle_no_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "project_cycles";
            referencedColumns: ["cycle_no"];
          },
          {
            foreignKeyName: "project_items_project_id_cycle_no_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "project_cycles";
            referencedColumns: ["project_id"];
          },
          {
            foreignKeyName: "project_items_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_decisions: {
        Row: {
          category: string | null;
          decision: string;
          exclusion_code: string | null;
          id: string;
          judgement_call: boolean;
          judgement_note: string | null;
          note: string | null;
          project_id: string;
          project_item_id: string;
          read_at: string;
          read_by: string;
          read_by_name: string | null;
          reason: string | null;
          ruling: boolean;
          severity: string | null;
          target_group: string | null;
        };
        Insert: {
          category?: string | null;
          decision: string;
          exclusion_code?: string | null;
          id?: string;
          judgement_call?: boolean;
          judgement_note?: string | null;
          note?: string | null;
          project_id: string;
          project_item_id: string;
          read_at?: string;
          read_by?: string;
          read_by_name?: string | null;
          reason?: string | null;
          ruling?: boolean;
          severity?: string | null;
          target_group?: string | null;
        };
        Update: {
          category?: string | null;
          decision?: string;
          exclusion_code?: string | null;
          id?: string;
          judgement_call?: boolean;
          judgement_note?: string | null;
          note?: string | null;
          project_id?: string;
          project_item_id?: string;
          read_at?: string;
          read_by?: string;
          read_by_name?: string | null;
          reason?: string | null;
          ruling?: boolean;
          severity?: string | null;
          target_group?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "project_decisions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_decisions_project_item_id_fkey";
            columns: ["project_item_id"];
            isOneToOne: false;
            referencedRelation: "project_items";
            referencedColumns: ["id"];
          },
        ];
      };
      project_confirmations: {
        Row: {
          confirmed_at: string;
          confirmed_by: string;
          confirmed_by_name: string | null;
          decision_id: string;
          id: string;
          note: string | null;
          project_id: string;
          result: string;
        };
        Insert: {
          confirmed_at?: string;
          confirmed_by?: string;
          confirmed_by_name?: string | null;
          decision_id: string;
          id?: string;
          note?: string | null;
          project_id: string;
          result: string;
        };
        Update: {
          confirmed_at?: string;
          confirmed_by?: string;
          confirmed_by_name?: string | null;
          decision_id?: string;
          id?: string;
          note?: string | null;
          project_id?: string;
          result?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_confirmations_decision_id_fkey";
            columns: ["decision_id"];
            isOneToOne: false;
            referencedRelation: "project_decisions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_confirmations_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_captures: {
        Row: {
          archive_link: string;
          captured_at_utc: string;
          captured_by: string;
          captured_by_name: string | null;
          created_at: string;
          custody_logged: boolean;
          id: string;
          project_id: string;
          project_item_id: string;
          screenshot_sha256: string;
          second_person_check_by: string | null;
          url_bar_clock_visible: boolean;
        };
        Insert: {
          archive_link: string;
          captured_at_utc: string;
          captured_by?: string;
          captured_by_name?: string | null;
          created_at?: string;
          custody_logged: boolean;
          id?: string;
          project_id: string;
          project_item_id: string;
          screenshot_sha256: string;
          second_person_check_by?: string | null;
          url_bar_clock_visible: boolean;
        };
        Update: {
          archive_link?: string;
          captured_at_utc?: string;
          captured_by?: string;
          captured_by_name?: string | null;
          created_at?: string;
          custody_logged?: boolean;
          id?: string;
          project_id?: string;
          project_item_id?: string;
          screenshot_sha256?: string;
          second_person_check_by?: string | null;
          url_bar_clock_visible?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "project_captures_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_captures_project_item_id_fkey";
            columns: ["project_item_id"];
            isOneToOne: false;
            referencedRelation: "project_items";
            referencedColumns: ["id"];
          },
        ];
      };
      project_item_tiers: {
        Row: {
          id: string;
          note: string | null;
          project_id: string;
          project_item_id: string;
          set_at: string;
          set_by: string | null;
          set_by_name: string | null;
          tier: string;
        };
        Insert: {
          id?: string;
          note?: string | null;
          project_id: string;
          project_item_id: string;
          set_at?: string;
          set_by?: string | null;
          set_by_name?: string | null;
          tier: string;
        };
        Update: {
          id?: string;
          note?: string | null;
          project_id?: string;
          project_item_id?: string;
          set_at?: string;
          set_by?: string | null;
          set_by_name?: string | null;
          tier?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_item_tiers_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_item_tiers_project_item_id_fkey";
            columns: ["project_item_id"];
            isOneToOne: false;
            referencedRelation: "project_items";
            referencedColumns: ["id"];
          },
        ];
      };
      project_load_reports: {
        Row: {
          case_folder_ref: string;
          counts_after: Json;
          counts_before: Json;
          cycle_no: number;
          expected_new: Json;
          id: string;
          manifest_sha256: string;
          project_id: string;
          reconciled: boolean;
          recorded_at: string;
          recorded_by: string | null;
          recorded_by_name: string | null;
          register_entry_ref: string;
          single_transaction: boolean;
          sync_log: string | null;
        };
        Insert: {
          case_folder_ref: string;
          counts_after: Json;
          counts_before: Json;
          cycle_no: number;
          expected_new: Json;
          id?: string;
          manifest_sha256: string;
          project_id: string;
          reconciled?: boolean;
          recorded_at?: string;
          recorded_by?: string | null;
          recorded_by_name?: string | null;
          register_entry_ref: string;
          single_transaction: boolean;
          sync_log?: string | null;
        };
        Update: {
          case_folder_ref?: string;
          counts_after?: Json;
          counts_before?: Json;
          cycle_no?: number;
          expected_new?: Json;
          id?: string;
          manifest_sha256?: string;
          project_id?: string;
          reconciled?: boolean;
          recorded_at?: string;
          recorded_by?: string | null;
          recorded_by_name?: string | null;
          register_entry_ref?: string;
          single_transaction?: boolean;
          sync_log?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "project_load_reports_project_id_cycle_no_fkey";
            columns: ["cycle_no"];
            isOneToOne: false;
            referencedRelation: "project_cycles";
            referencedColumns: ["cycle_no"];
          },
          {
            foreignKeyName: "project_load_reports_project_id_cycle_no_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "project_cycles";
            referencedColumns: ["project_id"];
          },
          {
            foreignKeyName: "project_load_reports_project_id_cycle_no_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "project_cycles";
            referencedColumns: ["cycle_no"];
          },
          {
            foreignKeyName: "project_load_reports_project_id_cycle_no_fkey";
            columns: ["cycle_no"];
            isOneToOne: false;
            referencedRelation: "project_cycles";
            referencedColumns: ["project_id"];
          },
          {
            foreignKeyName: "project_load_reports_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_outputs: {
        Row: {
          attribution_checked: boolean;
          brief_id: string;
          created_at: string;
          created_by: string | null;
          created_by_name: string | null;
          cycle_nos: number[];
          file_name: string | null;
          id: string;
          item_count: number | null;
          kind: string;
          location: string | null;
          params: Json;
          project_id: string;
          qa_at: string | null;
          qa_by: string | null;
          released_at: string | null;
          sha256: string | null;
          shared_with_client: boolean;
          size_bytes: number | null;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          attribution_checked?: boolean;
          brief_id: string;
          created_at?: string;
          created_by?: string | null;
          created_by_name?: string | null;
          cycle_nos?: number[];
          file_name?: string | null;
          id?: string;
          item_count?: number | null;
          kind: string;
          location?: string | null;
          params?: Json;
          project_id: string;
          qa_at?: string | null;
          qa_by?: string | null;
          released_at?: string | null;
          sha256?: string | null;
          shared_with_client?: boolean;
          size_bytes?: number | null;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          attribution_checked?: boolean;
          brief_id?: string;
          created_at?: string;
          created_by?: string | null;
          created_by_name?: string | null;
          cycle_nos?: number[];
          file_name?: string | null;
          id?: string;
          item_count?: number | null;
          kind?: string;
          location?: string | null;
          params?: Json;
          project_id?: string;
          qa_at?: string | null;
          qa_by?: string | null;
          released_at?: string | null;
          sha256?: string | null;
          shared_with_client?: boolean;
          size_bytes?: number | null;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_outputs_brief_id_fkey";
            columns: ["brief_id"];
            isOneToOne: false;
            referencedRelation: "project_briefs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_outputs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_report_entries: {
        Row: {
          client_figure: boolean;
          counts: Json;
          created_at: string;
          created_by: string | null;
          created_by_name: string | null;
          entry_kind: string;
          evidence_tier: string | null;
          finding: string | null;
          id: string;
          met: boolean | null;
          out_of_reach: boolean;
          output_id: string;
          project_id: string;
          ref_key: string;
        };
        Insert: {
          client_figure?: boolean;
          counts?: Json;
          created_at?: string;
          created_by?: string | null;
          created_by_name?: string | null;
          entry_kind: string;
          evidence_tier?: string | null;
          finding?: string | null;
          id?: string;
          met?: boolean | null;
          out_of_reach?: boolean;
          output_id: string;
          project_id: string;
          ref_key: string;
        };
        Update: {
          client_figure?: boolean;
          counts?: Json;
          created_at?: string;
          created_by?: string | null;
          created_by_name?: string | null;
          entry_kind?: string;
          evidence_tier?: string | null;
          finding?: string | null;
          id?: string;
          met?: boolean | null;
          out_of_reach?: boolean;
          output_id?: string;
          project_id?: string;
          ref_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_report_entries_output_id_fkey";
            columns: ["output_id"];
            isOneToOne: false;
            referencedRelation: "project_outputs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_report_entries_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_closeouts: {
        Row: {
          archive_manifest_sha256: string;
          archive_ref: string;
          closed_at: string;
          closed_by: string | null;
          closed_by_name: string | null;
          design_frozen_version: number;
          id: string;
          lessons_learned: string;
          project_id: string;
          retention_note: string | null;
          retention_years: number;
        };
        Insert: {
          archive_manifest_sha256: string;
          archive_ref: string;
          closed_at?: string;
          closed_by?: string | null;
          closed_by_name?: string | null;
          design_frozen_version: number;
          id?: string;
          lessons_learned: string;
          project_id: string;
          retention_note?: string | null;
          retention_years?: number;
        };
        Update: {
          archive_manifest_sha256?: string;
          archive_ref?: string;
          closed_at?: string;
          closed_by?: string | null;
          closed_by_name?: string | null;
          design_frozen_version?: number;
          id?: string;
          lessons_learned?: string;
          project_id?: string;
          retention_note?: string | null;
          retention_years?: number;
        };
        Relationships: [
          {
            foreignKeyName: "project_closeouts_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_events: {
        Row: {
          action: string;
          actor: string | null;
          actor_name: string | null;
          at: string;
          detail: Json;
          id: string;
          output_id: string | null;
          project_id: string;
        };
        Insert: {
          action: string;
          actor?: string | null;
          actor_name?: string | null;
          at?: string;
          detail?: Json;
          id?: string;
          output_id?: string | null;
          project_id: string;
        };
        Update: {
          action?: string;
          actor?: string | null;
          actor_name?: string | null;
          at?: string;
          detail?: Json;
          id?: string;
          output_id?: string | null;
          project_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_events_output_id_fkey";
            columns: ["output_id"];
            isOneToOne: false;
            referencedRelation: "project_outputs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_events_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      project_current_briefs: {
        Row: {
          amendment_no: number | null;
          audiences: Json | null;
          authored_at: string | null;
          authored_by: string | null;
          authored_by_name: string | null;
          caps: string | null;
          change_reason: string | null;
          change_summary: string | null;
          constraints_risks: Json | null;
          facts: Json | null;
          governance: Json | null;
          held_groups: string | null;
          id: string | null;
          in_scope: string | null;
          kind: string | null;
          languages: string[] | null;
          objectives: string[] | null;
          out_of_scope: string | null;
          platforms: string[] | null;
          project_id: string | null;
          purpose_decisions: string | null;
          ranked_asks: Json | null;
          requested_by: string | null;
          research_content_note: string | null;
          response_parameters: Json | null;
          sample_rule: string | null;
          scope_changed: boolean | null;
          situation: string | null;
          unknowns: string[] | null;
          version: number | null;
          window_from: string | null;
          window_to: string | null;
        };
        Relationships: [];
      };
      project_latest_rqs: {
        Row: {
          brief_section: number | null;
          created_at: string | null;
          created_by: string | null;
          created_by_name: string | null;
          hypothesis: string | null;
          id: string | null;
          project_id: string | null;
          question: string | null;
          rev: number | null;
          rq_no: string | null;
          withdrawn: boolean | null;
        };
        Relationships: [];
      };
      project_latest_scenarios: {
        Row: {
          amendment_id: string | null;
          approver: string | null;
          created_at: string | null;
          created_by: string | null;
          created_by_name: string | null;
          decision_owner: string | null;
          fa_will_not_say: string | null;
          fa_will_say: string | null;
          id: string | null;
          informed: string | null;
          min_evidence_tier: string | null;
          name: string | null;
          probability: string | null;
          probability_source: string | null;
          project_id: string | null;
          readers_required: number | null;
          response_options: Json | null;
          rev: number | null;
          review_date: string | null;
          scenario_no: string | null;
          scenario_type: string | null;
          situation: string | null;
          threshold: string | null;
          time_frame: string | null;
          trigger_indicators: string | null;
          withdrawn: boolean | null;
        };
        Relationships: [];
      };
      project_latest_measures: {
        Row: {
          amendment_id: string | null;
          baseline: string | null;
          baseline_source: string | null;
          client_figure: boolean | null;
          created_at: string | null;
          created_by: string | null;
          created_by_name: string | null;
          data_source: string | null;
          id: string | null;
          level: string | null;
          measure: string | null;
          measure_no: string | null;
          observable: boolean | null;
          project_id: string | null;
          rev: number | null;
          target: string | null;
          withdrawn: boolean | null;
        };
        Relationships: [];
      };
      project_latest_targets: {
        Row: {
          created_at: string | null;
          created_by: string | null;
          curator_confirmed: boolean | null;
          curator_confirmed_by: string | null;
          handle: string | null;
          id: string | null;
          identity_resolved: boolean | null;
          note: string | null;
          platform: string | null;
          project_id: string | null;
          rev: number | null;
          target_group: string | null;
          target_key: string | null;
          withdrawn: boolean | null;
        };
        Relationships: [];
      };
      project_latest_intake: {
        Row: {
          claim_status: string | null;
          decline_reason: string | null;
          declined: boolean | null;
          description: string | null;
          id: string | null;
          item_ref: string | null;
          logged_at: string | null;
          logged_by: string | null;
          logged_by_name: string | null;
          personal_data: boolean | null;
          produced_by: string | null;
          produced_for: string | null;
          produced_on: string | null;
          project_id: string | null;
          received_on: string | null;
          rev: number | null;
          sensitivity: string | null;
          sha256: string | null;
          use_class: string | null;
          verification_note: string | null;
        };
        Relationships: [];
      };
      project_latest_decisions: {
        Row: {
          category: string | null;
          decision: string | null;
          disputed: boolean | null;
          exclusion_code: string | null;
          id: string | null;
          judgement_call: boolean | null;
          judgement_note: string | null;
          needs_second_reader: boolean | null;
          note: string | null;
          project_id: string | null;
          project_item_id: string | null;
          read_at: string | null;
          read_by: string | null;
          read_by_name: string | null;
          reason: string | null;
          ruling: boolean | null;
          second_reader_confirmed: boolean | null;
          severity: string | null;
          target_group: string | null;
        };
        Relationships: [];
      };
      project_latest_tiers: {
        Row: {
          id: string | null;
          note: string | null;
          project_id: string | null;
          project_item_id: string | null;
          set_at: string | null;
          set_by: string | null;
          set_by_name: string | null;
          tier: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      append_job_log: {
        Args: { p_job_id: string; p_lines: string[]; p_warnings: string[] };
        Returns: undefined;
      };
      can_access_case: {
        Args: { _case_id: string; _user_id: string };
        Returns: boolean;
      };
      brief_missing: { Args: { _brief: string }; Returns: string[] };
      can_access_project: { Args: { _project_id: string; _user_id: string }; Returns: boolean };
      can_manage_project: { Args: { _project_id: string; _user_id: string }; Returns: boolean };
      can_view_project_as_client: {
        Args: { _project_id: string; _user_id: string };
        Returns: boolean;
      };
      can_work_project: { Args: { _project_id: string; _user_id: string }; Returns: boolean };
      design_ready: { Args: { _project: string }; Returns: boolean };
      gate_signed: {
        Args: { _cycle?: number; _gate: string; _output?: string; _project: string };
        Returns: boolean;
      };
      has_project_role: {
        Args: { _project_id: string; _roles: string[]; _user_id: string };
        Returns: boolean;
      };
      claim_next_job: {
        Args: never;
        Returns: {
          case_id: string | null;
          case_meta: Json;
          claimed_at: string | null;
          created_at: string;
          created_by: string | null;
          finished_at: string | null;
          handler: string | null;
          id: string;
          incident_date: string | null;
          incident_id: string | null;
          incident_meta: Json;
          log: string[];
          options: Json;
          result: Json | null;
          status: string;
          updated_at: string;
          url: string;
          warnings: string[];
        }[];
        SetofOptions: {
          from: "*";
          to: "capture_jobs";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_investigator: { Args: { _user_id: string }; Returns: boolean };
      project_current_brief_id: { Args: { _project: string }; Returns: string };
      project_mandate: { Args: { _project: string }; Returns: string };
      project_role: { Args: { _project_id: string; _user_id: string }; Returns: string };
      report_incomplete: { Args: { _output: string }; Returns: string[] };
      signup_open: { Args: never; Returns: boolean };
    };
    Enums: {
      app_role: "owner" | "analyst" | "curator";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "analyst", "curator"],
    },
  },
} as const;
