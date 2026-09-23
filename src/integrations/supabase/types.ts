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
      custody_events: {
        Row: {
          action: string
          artefact_id: string | null
          created_at: string
          filename: string | null
          handler: string | null
          id: string
          item_id: string | null
          notes: string | null
          sha256: string | null
          tool_version: string | null
        }
        Insert: {
          action: string
          artefact_id?: string | null
          created_at?: string
          filename?: string | null
          handler?: string | null
          id?: string
          item_id?: string | null
          notes?: string | null
          sha256?: string | null
          tool_version?: string | null
        }
        Update: {
          action?: string
          artefact_id?: string | null
          created_at?: string
          filename?: string | null
          handler?: string | null
          id?: string
          item_id?: string | null
          notes?: string | null
          sha256?: string | null
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
            foreignKeyName: "custody_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
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
      worker_status: {
        Row: {
          hostname: string | null
          id: string
          info: Json
          last_seen: string | null
          version: string | null
        }
        Insert: {
          hostname?: string | null
          id?: string
          info?: Json
          last_seen?: string | null
          version?: string | null
        }
        Update: {
          hostname?: string | null
          id?: string
          info?: Json
          last_seen?: string | null
          version?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      append_job_log: {
        Args: { p_job_id: string; p_lines: string[]; p_warnings: string[] }
        Returns: undefined
      }
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_investigator: { Args: { _user_id: string }; Returns: boolean }
      signup_open: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "owner" | "analyst"
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
      app_role: ["owner", "analyst"],
    },
  },
} as const
