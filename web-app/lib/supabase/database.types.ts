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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_decision_traces: {
        Row: {
          ai_call_type: string
          ai_output_json: Json | null
          created_at: string
          final_output_json: Json | null
          id: string
          input_text: string
          matched_rule_ids: string[] | null
          model_name: string | null
          model_provider: string | null
          organization_id: string | null
          overridden_by_rule: boolean
          override_reason: string | null
          prompt_context_summary: string | null
          selected_memory_ids: string[] | null
          selected_playbook_id: string | null
          source_id: string | null
          source_type: string
          user_id: string
        }
        Insert: {
          ai_call_type: string
          ai_output_json?: Json | null
          created_at?: string
          final_output_json?: Json | null
          id?: string
          input_text: string
          matched_rule_ids?: string[] | null
          model_name?: string | null
          model_provider?: string | null
          organization_id?: string | null
          overridden_by_rule?: boolean
          override_reason?: string | null
          prompt_context_summary?: string | null
          selected_memory_ids?: string[] | null
          selected_playbook_id?: string | null
          source_id?: string | null
          source_type: string
          user_id: string
        }
        Update: {
          ai_call_type?: string
          ai_output_json?: Json | null
          created_at?: string
          final_output_json?: Json | null
          id?: string
          input_text?: string
          matched_rule_ids?: string[] | null
          model_name?: string | null
          model_provider?: string | null
          organization_id?: string | null
          overridden_by_rule?: boolean
          override_reason?: string | null
          prompt_context_summary?: string | null
          selected_memory_ids?: string[] | null
          selected_playbook_id?: string | null
          source_id?: string | null
          source_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_decision_traces_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_decision_traces_selected_playbook_id_fkey"
            columns: ["selected_playbook_id"]
            isOneToOne: false
            referencedRelation: "ai_playbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_decision_traces_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_memories: {
        Row: {
          confidence: number
          created_at: string
          embedding: string | null
          id: string
          input_text: string
          last_used_at: string | null
          memory_type: string
          normalized_summary: string
          organization_id: string | null
          outcome_json: Json
          source_count: number
          source_event_id: string | null
          source_type: string
          status: string
          updated_at: string
          user_id: string
          weight: number
        }
        Insert: {
          confidence?: number
          created_at?: string
          embedding?: string | null
          id?: string
          input_text: string
          last_used_at?: string | null
          memory_type: string
          normalized_summary: string
          organization_id?: string | null
          outcome_json: Json
          source_count?: number
          source_event_id?: string | null
          source_type: string
          status?: string
          updated_at?: string
          user_id: string
          weight?: number
        }
        Update: {
          confidence?: number
          created_at?: string
          embedding?: string | null
          id?: string
          input_text?: string
          last_used_at?: string | null
          memory_type?: string
          normalized_summary?: string
          organization_id?: string | null
          outcome_json?: Json
          source_count?: number
          source_event_id?: string | null
          source_type?: string
          status?: string
          updated_at?: string
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_memories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_memories_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "ai_memory_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_memories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_memory_events: {
        Row: {
          after_json: Json | null
          before_json: Json | null
          created_at: string
          event_type: string
          id: string
          organization_id: string | null
          reason: string | null
          source_id: string | null
          source_type: string
          user_id: string
        }
        Insert: {
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          event_type: string
          id?: string
          organization_id?: string | null
          reason?: string | null
          source_id?: string | null
          source_type: string
          user_id: string
        }
        Update: {
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          event_type?: string
          id?: string
          organization_id?: string | null
          reason?: string | null
          source_id?: string | null
          source_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_memory_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_memory_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_planner_artifacts: {
        Row: {
          approved_at: string | null
          created_at: string
          id: string
          payload_json: Json
          session_id: string
          type: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          id?: string
          payload_json: Json
          session_id: string
          type: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          id?: string
          payload_json?: Json
          session_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_planner_artifacts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_planner_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_planner_messages: {
        Row: {
          content_json: Json | null
          content_text: string | null
          created_at: string
          id: string
          role: string
          session_id: string
          token_meta: Json | null
        }
        Insert: {
          content_json?: Json | null
          content_text?: string | null
          created_at?: string
          id?: string
          role: string
          session_id: string
          token_meta?: Json | null
        }
        Update: {
          content_json?: Json | null
          content_text?: string | null
          created_at?: string
          id?: string
          role?: string
          session_id?: string
          token_meta?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_planner_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_planner_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_planner_sessions: {
        Row: {
          created_at: string
          id: string
          model: string
          project_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          model?: string
          project_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          model?: string
          project_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_planner_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_planner_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_playbooks: {
        Row: {
          content_markdown: string
          created_at: string
          created_by: string
          id: string
          organization_id: string | null
          playbook_type: string
          source_memory_ids: string[] | null
          status: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          content_markdown: string
          created_at?: string
          created_by: string
          id?: string
          organization_id?: string | null
          playbook_type: string
          source_memory_ids?: string[] | null
          status?: string
          updated_at?: string
          user_id: string
          version: number
        }
        Update: {
          content_markdown?: string
          created_at?: string
          created_by?: string
          id?: string
          organization_id?: string | null
          playbook_type?: string
          source_memory_ids?: string[] | null
          status?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_playbooks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_playbooks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          created_at: string | null
          id: string
          mime_type: string | null
          name: string
          size_bytes: number | null
          storage_provider: string | null
          task_id: string | null
          thumbnail_url: string | null
          todoist_id: string | null
          todoist_upload_state: string | null
          type: string
          updated_at: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          mime_type?: string | null
          name: string
          size_bytes?: number | null
          storage_provider?: string | null
          task_id?: string | null
          thumbnail_url?: string | null
          todoist_id?: string | null
          todoist_upload_state?: string | null
          type: string
          updated_at?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          id?: string
          mime_type?: string | null
          name?: string
          size_bytes?: number | null
          storage_provider?: string | null
          task_id?: string | null
          thumbnail_url?: string | null
          todoist_id?: string | null
          todoist_upload_state?: string | null
          type?: string
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "upcoming_recurring_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          organization_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          organization_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_deleted: boolean | null
          project_id: string | null
          task_id: string | null
          todoist_attachment: Json | null
          todoist_id: string | null
          todoist_posted_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_deleted?: boolean | null
          project_id?: string | null
          task_id?: string | null
          todoist_attachment?: Json | null
          todoist_id?: string | null
          todoist_posted_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_deleted?: boolean | null
          project_id?: string | null
          task_id?: string | null
          todoist_attachment?: Json | null
          todoist_id?: string | null
          todoist_posted_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "upcoming_recurring_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_google_accounts: {
        Row: {
          access_token_encrypted: string | null
          created_at: string
          google_email: string
          id: string
          last_synced_at: string | null
          refresh_token_encrypted: string | null
          scope: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          created_at?: string
          google_email: string
          id?: string
          last_synced_at?: string | null
          refresh_token_encrypted?: string | null
          scope?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          created_at?: string
          google_email?: string
          id?: string
          last_synced_at?: string | null
          refresh_token_encrypted?: string | null
          scope?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_google_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          organization_id: string | null
          phone: string | null
          profile_id: string | null
          source: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          organization_id?: string | null
          phone?: string | null
          profile_id?: string | null
          source?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          organization_id?: string | null
          phone?: string | null
          profile_id?: string | null
          source?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_plan_cache: {
        Row: {
          created_at: string
          plan: Json
          plan_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          plan: Json
          plan_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          plan?: Json
          plan_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_action_log: {
        Row: {
          action: string
          created_at: string
          detail: Json | null
          id: string
          mailbox_id: string | null
          phase: string
          thread_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          detail?: Json | null
          id?: string
          mailbox_id?: string | null
          phase: string
          thread_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          detail?: Json | null
          id?: string
          mailbox_id?: string | null
          phase?: string
          thread_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_action_log_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "mailboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_action_log_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_action_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_ai_profiles: {
        Row: {
          created_at: string
          id: string
          instruction_text: string
          is_default: boolean
          mailbox_id: string | null
          name: string
          organization_id: string | null
          settings_json: Json
          summary_style: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          instruction_text?: string
          is_default?: boolean
          mailbox_id?: string | null
          name: string
          organization_id?: string | null
          settings_json?: Json
          summary_style?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          instruction_text?: string
          is_default?: boolean
          mailbox_id?: string | null
          name?: string
          organization_id?: string | null
          settings_json?: Json
          summary_style?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_ai_profiles_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "mailboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_ai_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_ai_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          body_html: string | null
          body_text: string | null
          contact_id: string | null
          created_at: string
          direction: string
          id: string
          in_reply_to_message_id: string | null
          internet_message_id: string | null
          mailbox_id: string
          metadata_json: Json
          profile_id: string | null
          provider_message_id: string | null
          raw_headers: Json
          received_at: string | null
          sent_at: string | null
          subject: string | null
          thread_id: string
          updated_at: string
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          contact_id?: string | null
          created_at?: string
          direction: string
          id?: string
          in_reply_to_message_id?: string | null
          internet_message_id?: string | null
          mailbox_id: string
          metadata_json?: Json
          profile_id?: string | null
          provider_message_id?: string | null
          raw_headers?: Json
          received_at?: string | null
          sent_at?: string | null
          subject?: string | null
          thread_id: string
          updated_at?: string
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          contact_id?: string | null
          created_at?: string
          direction?: string
          id?: string
          in_reply_to_message_id?: string | null
          internet_message_id?: string | null
          mailbox_id?: string
          metadata_json?: Json
          profile_id?: string | null
          provider_message_id?: string | null
          raw_headers?: Json
          received_at?: string | null
          sent_at?: string | null
          subject?: string | null
          thread_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "mailboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_outbound_drafts: {
        Row: {
          attachments_json: Json
          bcc_json: Json
          cc_json: Json
          content_html: string | null
          content_text: string | null
          created_at: string
          created_by_user_id: string | null
          id: string
          last_error: string | null
          mailbox_id: string
          project_id: string | null
          scheduled_for: string | null
          sent_at: string | null
          signature_text: string | null
          status: string
          subject: string
          to_json: Json
          updated_at: string
        }
        Insert: {
          attachments_json?: Json
          bcc_json?: Json
          cc_json?: Json
          content_html?: string | null
          content_text?: string | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          last_error?: string | null
          mailbox_id: string
          project_id?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          signature_text?: string | null
          status?: string
          subject?: string
          to_json?: Json
          updated_at?: string
        }
        Update: {
          attachments_json?: Json
          bcc_json?: Json
          cc_json?: Json
          content_html?: string | null
          content_text?: string | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          last_error?: string | null
          mailbox_id?: string
          project_id?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          signature_text?: string | null
          status?: string
          subject?: string
          to_json?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_outbound_drafts_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_outbound_drafts_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "mailboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_outbound_drafts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      email_participants: {
        Row: {
          contact_id: string | null
          created_at: string
          display_name: string | null
          email_address: string
          id: string
          message_id: string | null
          participant_role: string
          profile_id: string | null
          thread_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          display_name?: string | null
          email_address: string
          id?: string
          message_id?: string | null
          participant_role: string
          profile_id?: string | null
          thread_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          display_name?: string | null
          email_address?: string
          id?: string
          message_id?: string | null
          participant_role?: string
          profile_id?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_participants_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_participants_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_participants_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_reply_drafts: {
        Row: {
          ai_metadata_json: Json
          attachments_json: Json
          cc_json: Json
          content_html: string | null
          content_text: string | null
          context_snapshot_json: Json
          created_at: string
          created_by_user_id: string | null
          id: string
          last_error: string | null
          mailbox_id: string
          project_id: string | null
          reply_mode: string
          scheduled_for: string | null
          sent_at: string | null
          signature_text: string | null
          source: string
          status: string
          subject: string
          thread_id: string
          to_json: Json
          updated_at: string
        }
        Insert: {
          ai_metadata_json?: Json
          attachments_json?: Json
          cc_json?: Json
          content_html?: string | null
          content_text?: string | null
          context_snapshot_json?: Json
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          last_error?: string | null
          mailbox_id: string
          project_id?: string | null
          reply_mode?: string
          scheduled_for?: string | null
          sent_at?: string | null
          signature_text?: string | null
          source?: string
          status?: string
          subject: string
          thread_id: string
          to_json?: Json
          updated_at?: string
        }
        Update: {
          ai_metadata_json?: Json
          attachments_json?: Json
          cc_json?: Json
          content_html?: string | null
          content_text?: string | null
          context_snapshot_json?: Json
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          last_error?: string | null
          mailbox_id?: string
          project_id?: string | null
          reply_mode?: string
          scheduled_for?: string | null
          sent_at?: string | null
          signature_text?: string | null
          source?: string
          status?: string
          subject?: string
          thread_id?: string
          to_json?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_reply_drafts_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_reply_drafts_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "mailboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_reply_drafts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_reply_drafts_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_rule_runs: {
        Row: {
          action_summary: string | null
          confidence: number | null
          created_at: string
          explanation: string | null
          id: string
          matched: boolean
          message_id: string | null
          rule_id: string
          thread_id: string
        }
        Insert: {
          action_summary?: string | null
          confidence?: number | null
          created_at?: string
          explanation?: string | null
          id?: string
          matched?: boolean
          message_id?: string | null
          rule_id: string
          thread_id: string
        }
        Update: {
          action_summary?: string | null
          confidence?: number | null
          created_at?: string
          explanation?: string | null
          id?: string
          matched?: boolean
          message_id?: string | null
          rule_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_rule_runs_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_rule_runs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "email_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_rule_runs_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_rules: {
        Row: {
          actions_json: Json
          conditions_json: Json
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          mailbox_id: string | null
          match_mode: string
          name: string
          organization_id: string | null
          priority: number
          source: string
          stop_processing: boolean
          updated_at: string
          user_id: string | null
        }
        Insert: {
          actions_json?: Json
          conditions_json?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          mailbox_id?: string | null
          match_mode?: string
          name: string
          organization_id?: string | null
          priority?: number
          source?: string
          stop_processing?: boolean
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          actions_json?: Json
          conditions_json?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          mailbox_id?: string | null
          match_mode?: string
          name?: string
          organization_id?: string | null
          priority?: number
          source?: string
          stop_processing?: boolean
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_rules_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "mailboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_rules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sync_state: {
        Row: {
          consecutive_failures: number
          error_message: string | null
          last_seen_message_at: string | null
          last_synced_at: string | null
          mailbox_id: string
          sync_cursor_json: Json
          sync_status: string
          updated_at: string
        }
        Insert: {
          consecutive_failures?: number
          error_message?: string | null
          last_seen_message_at?: string | null
          last_synced_at?: string | null
          mailbox_id: string
          sync_cursor_json?: Json
          sync_status?: string
          updated_at?: string
        }
        Update: {
          consecutive_failures?: number
          error_message?: string | null
          last_seen_message_at?: string | null
          last_synced_at?: string | null
          mailbox_id?: string
          sync_cursor_json?: Json
          sync_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sync_state_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: true
            referencedRelation: "mailboxes"
            referencedColumns: ["id"]
          },
        ]
      }
      email_thread_projects: {
        Row: {
          created_at: string
          project_id: string
          thread_id: string
        }
        Insert: {
          created_at?: string
          project_id: string
          thread_id: string
        }
        Update: {
          created_at?: string
          project_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_thread_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_thread_projects_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_thread_tasks: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          generated_by: string
          id: string
          public: boolean
          rationale: string | null
          task_id: string
          thread_id: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          generated_by?: string
          id?: string
          public?: boolean
          rationale?: string | null
          task_id: string
          thread_id: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          generated_by?: string
          id?: string
          public?: boolean
          rationale?: string | null
          task_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_thread_tasks_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_thread_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_thread_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "upcoming_recurring_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_thread_tasks_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_threads: {
        Row: {
          action_confidence: number
          action_reason: string | null
          action_title: string
          always_delete: boolean
          analysis_json: Json
          classification: string
          created_at: string
          id: string
          is_starred: boolean
          is_unread: boolean
          latest_inbound_at: string | null
          latest_message_at: string | null
          latest_outbound_at: string | null
          mailbox_id: string
          needs_project: boolean
          normalized_subject: string | null
          origin: string | null
          owner_user_id: string | null
          preview_text: string | null
          project_id: string | null
          provider_thread_id: string | null
          resolution_state: string
          resolved_at: string | null
          status: string
          subject: string
          summary_profile_id: string | null
          summary_text: string | null
          task_suggestions_json: Json
          thread_key: string
          updated_at: string
          work_due_date: string | null
          work_due_time: string | null
        }
        Insert: {
          action_confidence?: number
          action_reason?: string | null
          action_title: string
          always_delete?: boolean
          analysis_json?: Json
          classification?: string
          created_at?: string
          id?: string
          is_starred?: boolean
          is_unread?: boolean
          latest_inbound_at?: string | null
          latest_message_at?: string | null
          latest_outbound_at?: string | null
          mailbox_id: string
          needs_project?: boolean
          normalized_subject?: string | null
          origin?: string | null
          owner_user_id?: string | null
          preview_text?: string | null
          project_id?: string | null
          provider_thread_id?: string | null
          resolution_state?: string
          resolved_at?: string | null
          status?: string
          subject: string
          summary_profile_id?: string | null
          summary_text?: string | null
          task_suggestions_json?: Json
          thread_key: string
          updated_at?: string
          work_due_date?: string | null
          work_due_time?: string | null
        }
        Update: {
          action_confidence?: number
          action_reason?: string | null
          action_title?: string
          always_delete?: boolean
          analysis_json?: Json
          classification?: string
          created_at?: string
          id?: string
          is_starred?: boolean
          is_unread?: boolean
          latest_inbound_at?: string | null
          latest_message_at?: string | null
          latest_outbound_at?: string | null
          mailbox_id?: string
          needs_project?: boolean
          normalized_subject?: string | null
          origin?: string | null
          owner_user_id?: string | null
          preview_text?: string | null
          project_id?: string | null
          provider_thread_id?: string | null
          resolution_state?: string
          resolved_at?: string | null
          status?: string
          subject?: string
          summary_profile_id?: string | null
          summary_text?: string | null
          task_suggestions_json?: Json
          thread_key?: string
          updated_at?: string
          work_due_date?: string | null
          work_due_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_threads_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "mailboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_threads_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_threads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_threads_summary_profile_id_fkey"
            columns: ["summary_profile_id"]
            isOneToOne: false
            referencedRelation: "email_ai_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_training_examples: {
        Row: {
          correction_note: string | null
          created_at: string
          example_type: string
          id: string
          input_text: string
          mailbox_id: string | null
          organization_id: string | null
          output_json: Json
          thread_id: string | null
          user_id: string
        }
        Insert: {
          correction_note?: string | null
          created_at?: string
          example_type: string
          id?: string
          input_text: string
          mailbox_id?: string | null
          organization_id?: string | null
          output_json?: Json
          thread_id?: string | null
          user_id: string
        }
        Update: {
          correction_note?: string | null
          created_at?: string
          example_type?: string
          id?: string
          input_text?: string
          mailbox_id?: string | null
          organization_id?: string | null
          output_json?: Json
          thread_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_training_examples_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "mailboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_training_examples_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_training_examples_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_training_examples_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_events: {
        Row: {
          actor_id: string | null
          delete_batch_id: string | null
          entity_id: string
          entity_type: string
          id: string
          occurred_at: string
          operation: string
          organization_id: string | null
          project_id: string | null
          snapshot: Json | null
        }
        Insert: {
          actor_id?: string | null
          delete_batch_id?: string | null
          entity_id: string
          entity_type: string
          id?: string
          occurred_at?: string
          operation: string
          organization_id?: string | null
          project_id?: string | null
          snapshot?: Json | null
        }
        Update: {
          actor_id?: string | null
          delete_batch_id?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          occurred_at?: string
          operation?: string
          organization_id?: string | null
          project_id?: string | null
          snapshot?: Json | null
        }
        Relationships: []
      }
      filters: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          is_deleted: boolean | null
          is_favorite: boolean | null
          name: string
          query: string
          todoist_id: string | null
          todoist_order: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_favorite?: boolean | null
          name: string
          query: string
          todoist_id?: string | null
          todoist_order?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_favorite?: boolean | null
          name?: string
          query?: string
          todoist_id?: string | null
          todoist_order?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "filters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fine_tune_jobs: {
        Row: {
          adapter_ref: string | null
          base_model: string
          created_at: string
          created_by: string | null
          dataset_ref: string | null
          error: string | null
          example_count: number | null
          id: string
          metrics: Json | null
          scope: string
          status: string
          updated_at: string
        }
        Insert: {
          adapter_ref?: string | null
          base_model?: string
          created_at?: string
          created_by?: string | null
          dataset_ref?: string | null
          error?: string | null
          example_count?: number | null
          id?: string
          metrics?: Json | null
          scope?: string
          status?: string
          updated_at?: string
        }
        Update: {
          adapter_ref?: string | null
          base_model?: string
          created_at?: string
          created_by?: string | null
          dataset_ref?: string | null
          error?: string | null
          example_count?: number | null
          id?: string
          metrics?: Json | null
          scope?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string | null
          delete_batch_id: string | null
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          order_index: number | null
          project_id: string
          section_id: string | null
          updated_at: string | null
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string | null
          delete_batch_id?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          order_index?: number | null
          project_id: string
          section_id?: string | null
          updated_at?: string | null
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string | null
          delete_batch_id?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          order_index?: number | null
          project_id?: string
          section_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          content_markdown: string
          created_at: string | null
          delete_batch_id: string | null
          deleted_at: string | null
          goal_id: string | null
          id: string
          name: string
          order_index: number | null
          organization_id: string | null
          project_id: string | null
          section_id: string | null
          updated_at: string | null
        }
        Insert: {
          content_markdown?: string
          created_at?: string | null
          delete_batch_id?: string | null
          deleted_at?: string | null
          goal_id?: string | null
          id?: string
          name: string
          order_index?: number | null
          organization_id?: string | null
          project_id?: string | null
          section_id?: string | null
          updated_at?: string | null
        }
        Update: {
          content_markdown?: string
          created_at?: string | null
          delete_batch_id?: string | null
          deleted_at?: string | null
          goal_id?: string | null
          id?: string
          name?: string
          order_index?: number | null
          organization_id?: string | null
          project_id?: string | null
          section_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      mailbox_members: {
        Row: {
          created_at: string
          mailbox_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          mailbox_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          mailbox_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailbox_members_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "mailboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailbox_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mailboxes: {
        Row: {
          auto_sync_enabled: boolean
          created_at: string
          credentials_encrypted: string
          display_name: string | null
          email_address: string
          id: string
          imap_host: string
          imap_port: number
          imap_secure: boolean
          is_shared: boolean
          last_sync_error: string | null
          last_synced_at: string | null
          login_username: string
          name: string
          organization_id: string | null
          owner_user_id: string
          provider: string
          quarantine_folder: string | null
          smtp_host: string
          smtp_port: number
          smtp_secure: boolean
          summary_profile_id: string | null
          sync_folder: string
          sync_frequency_minutes: number
          updated_at: string
        }
        Insert: {
          auto_sync_enabled?: boolean
          created_at?: string
          credentials_encrypted: string
          display_name?: string | null
          email_address: string
          id?: string
          imap_host: string
          imap_port?: number
          imap_secure?: boolean
          is_shared?: boolean
          last_sync_error?: string | null
          last_synced_at?: string | null
          login_username: string
          name: string
          organization_id?: string | null
          owner_user_id: string
          provider?: string
          quarantine_folder?: string | null
          smtp_host: string
          smtp_port?: number
          smtp_secure?: boolean
          summary_profile_id?: string | null
          sync_folder?: string
          sync_frequency_minutes?: number
          updated_at?: string
        }
        Update: {
          auto_sync_enabled?: boolean
          created_at?: string
          credentials_encrypted?: string
          display_name?: string | null
          email_address?: string
          id?: string
          imap_host?: string
          imap_port?: number
          imap_secure?: boolean
          is_shared?: boolean
          last_sync_error?: string | null
          last_synced_at?: string | null
          login_username?: string
          name?: string
          organization_id?: string | null
          owner_user_id?: string
          provider?: string
          quarantine_folder?: string | null
          smtp_host?: string
          smtp_port?: number
          smtp_secure?: boolean
          summary_profile_id?: string | null
          sync_folder?: string
          sync_frequency_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailboxes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailboxes_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailboxes_summary_profile_id_fkey"
            columns: ["summary_profile_id"]
            isOneToOne: false
            referencedRelation: "email_ai_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      merge_events: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          payload: Json
          source_organization_id: string | null
          status: string
          target_organization_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          payload: Json
          source_organization_id?: string | null
          status?: string
          target_organization_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          payload?: Json
          source_organization_id?: string | null
          status?: string
          target_organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merge_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merge_events_source_organization_id_fkey"
            columns: ["source_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merge_events_target_organization_id_fkey"
            columns: ["target_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_push_devices: {
        Row: {
          app_version: string | null
          build_number: string | null
          bundle_id: string
          created_at: string
          device_id: string
          device_name: string | null
          environment: string
          id: string
          is_active: boolean
          last_error_at: string | null
          last_error_message: string | null
          last_notified_at: string | null
          last_registered_at: string
          last_seen_at: string
          locale: string | null
          platform: string
          push_token: string
          time_zone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          build_number?: string | null
          bundle_id: string
          created_at?: string
          device_id: string
          device_name?: string | null
          environment: string
          id?: string
          is_active?: boolean
          last_error_at?: string | null
          last_error_message?: string | null
          last_notified_at?: string | null
          last_registered_at?: string
          last_seen_at?: string
          locale?: string | null
          platform: string
          push_token: string
          time_zone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          build_number?: string | null
          bundle_id?: string
          created_at?: string
          device_id?: string
          device_name?: string | null
          environment?: string
          id?: string
          is_active?: boolean
          last_error_at?: string | null
          last_error_message?: string | null
          last_notified_at?: string | null
          last_registered_at?: string
          last_seen_at?: string
          locale?: string | null
          platform?: string
          push_token?: string
          time_zone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mobile_push_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_api_keys: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          hashed_key: string
          id: string
          is_active: boolean
          last_used_at: string | null
          name: string
          organization_id: string
          prefix: string
          scopes: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at: string
          hashed_key: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          name: string
          organization_id: string
          prefix: string
          scopes?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          hashed_key?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          name?: string
          organization_id?: string
          prefix?: string
          scopes?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          archived: boolean | null
          color: string
          created_at: string | null
          delete_batch_id: string | null
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          order_index: number | null
          updated_at: string | null
        }
        Insert: {
          archived?: boolean | null
          color?: string
          created_at?: string | null
          delete_batch_id?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          order_index?: number | null
          updated_at?: string | null
        }
        Update: {
          archived?: boolean | null
          color?: string
          created_at?: string | null
          delete_batch_id?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          order_index?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      personal_access_tokens: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          hashed_key: string
          id: string
          is_active: boolean
          last_used_at: string | null
          name: string
          prefix: string
          scopes: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at: string
          hashed_key: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          name: string
          prefix: string
          scopes?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          hashed_key?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          name?: string
          prefix?: string
          scopes?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_access_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          agent_intro_seen_at: string | null
          ai_model_chains: Json
          animations_enabled: boolean | null
          calendar_feed_token: string | null
          contributes_training_data: boolean
          created_at: string | null
          date_format: string | null
          display_name: string | null
          dock_badge_enabled: boolean
          email: string
          email_conversation_order: string
          email_delete_undo_seconds: number
          email_inbox_intro_dismissed: boolean
          email_panel_default_width_pct: number
          email_panel_width_px: number | null
          first_name: string | null
          id: string
          invite_expires_at: string | null
          invite_token: string | null
          invited_at: string | null
          last_name: string | null
          last_todoist_sync: string | null
          priority_color: string | null
          profile_color: string | null
          profile_memoji: string | null
          role: Database["public"]["Enums"]["user_role"]
          status: string | null
          theme_preset: string | null
          todoist_api_token: string | null
          todoist_auto_sync: boolean | null
          todoist_email: string | null
          todoist_full_name: string | null
          todoist_karma: number | null
          todoist_karma_trend: string | null
          todoist_premium: boolean | null
          todoist_start_day: number | null
          todoist_start_page: string | null
          todoist_sync_enabled: boolean | null
          todoist_sync_frequency: number | null
          todoist_timezone: string | null
          todoist_user_id: string | null
          updated_at: string | null
        }
        Insert: {
          agent_intro_seen_at?: string | null
          ai_model_chains?: Json
          animations_enabled?: boolean | null
          calendar_feed_token?: string | null
          contributes_training_data?: boolean
          created_at?: string | null
          date_format?: string | null
          display_name?: string | null
          dock_badge_enabled?: boolean
          email: string
          email_conversation_order?: string
          email_delete_undo_seconds?: number
          email_inbox_intro_dismissed?: boolean
          email_panel_default_width_pct?: number
          email_panel_width_px?: number | null
          first_name?: string | null
          id: string
          invite_expires_at?: string | null
          invite_token?: string | null
          invited_at?: string | null
          last_name?: string | null
          last_todoist_sync?: string | null
          priority_color?: string | null
          profile_color?: string | null
          profile_memoji?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: string | null
          theme_preset?: string | null
          todoist_api_token?: string | null
          todoist_auto_sync?: boolean | null
          todoist_email?: string | null
          todoist_full_name?: string | null
          todoist_karma?: number | null
          todoist_karma_trend?: string | null
          todoist_premium?: boolean | null
          todoist_start_day?: number | null
          todoist_start_page?: string | null
          todoist_sync_enabled?: boolean | null
          todoist_sync_frequency?: number | null
          todoist_timezone?: string | null
          todoist_user_id?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_intro_seen_at?: string | null
          ai_model_chains?: Json
          animations_enabled?: boolean | null
          calendar_feed_token?: string | null
          contributes_training_data?: boolean
          created_at?: string | null
          date_format?: string | null
          display_name?: string | null
          dock_badge_enabled?: boolean
          email?: string
          email_conversation_order?: string
          email_delete_undo_seconds?: number
          email_inbox_intro_dismissed?: boolean
          email_panel_default_width_pct?: number
          email_panel_width_px?: number | null
          first_name?: string | null
          id?: string
          invite_expires_at?: string | null
          invite_token?: string | null
          invited_at?: string | null
          last_name?: string | null
          last_todoist_sync?: string | null
          priority_color?: string | null
          profile_color?: string | null
          profile_memoji?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: string | null
          theme_preset?: string | null
          todoist_api_token?: string | null
          todoist_auto_sync?: boolean | null
          todoist_email?: string | null
          todoist_full_name?: string | null
          todoist_karma?: number | null
          todoist_karma_trend?: string | null
          todoist_premium?: boolean | null
          todoist_start_day?: number | null
          todoist_start_page?: string | null
          todoist_sync_enabled?: boolean | null
          todoist_sync_frequency?: number | null
          todoist_timezone?: string | null
          todoist_user_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          archived: boolean | null
          budget: number | null
          color: string
          created_at: string | null
          deadline: string | null
          delete_batch_id: string | null
          deleted_at: string | null
          description: string | null
          devnotes_meta: string | null
          end_date: string | null
          goal: string | null
          id: string
          is_favorite: boolean | null
          last_todoist_sync: string | null
          name: string
          order_index: number | null
          organization_id: string | null
          parent_id: string | null
          start_date: string | null
          todoist_child_order: number | null
          todoist_collapsed: boolean | null
          todoist_id: string | null
          todoist_is_archived: boolean | null
          todoist_is_deleted: boolean | null
          todoist_is_favorite: boolean | null
          todoist_parent_id: string | null
          todoist_shared: boolean | null
          todoist_sync_id: string | null
          todoist_sync_token: string | null
          todoist_view_style: string | null
          updated_at: string | null
        }
        Insert: {
          archived?: boolean | null
          budget?: number | null
          color?: string
          created_at?: string | null
          deadline?: string | null
          delete_batch_id?: string | null
          deleted_at?: string | null
          description?: string | null
          devnotes_meta?: string | null
          end_date?: string | null
          goal?: string | null
          id?: string
          is_favorite?: boolean | null
          last_todoist_sync?: string | null
          name: string
          order_index?: number | null
          organization_id?: string | null
          parent_id?: string | null
          start_date?: string | null
          todoist_child_order?: number | null
          todoist_collapsed?: boolean | null
          todoist_id?: string | null
          todoist_is_archived?: boolean | null
          todoist_is_deleted?: boolean | null
          todoist_is_favorite?: boolean | null
          todoist_parent_id?: string | null
          todoist_shared?: boolean | null
          todoist_sync_id?: string | null
          todoist_sync_token?: string | null
          todoist_view_style?: string | null
          updated_at?: string | null
        }
        Update: {
          archived?: boolean | null
          budget?: number | null
          color?: string
          created_at?: string | null
          deadline?: string | null
          delete_batch_id?: string | null
          deleted_at?: string | null
          description?: string | null
          devnotes_meta?: string | null
          end_date?: string | null
          goal?: string | null
          id?: string
          is_favorite?: boolean | null
          last_todoist_sync?: string | null
          name?: string
          order_index?: number | null
          organization_id?: string | null
          parent_id?: string | null
          start_date?: string | null
          todoist_child_order?: number | null
          todoist_collapsed?: boolean | null
          todoist_id?: string | null
          todoist_is_archived?: boolean | null
          todoist_is_deleted?: boolean | null
          todoist_is_favorite?: boolean | null
          todoist_parent_id?: string | null
          todoist_shared?: boolean | null
          todoist_sync_id?: string | null
          todoist_sync_token?: string | null
          todoist_view_style?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_shares: {
        Row: {
          allow_public: boolean
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          passcode_hash: string | null
          project_id: string
          revoked_at: string | null
          token: string
        }
        Insert: {
          allow_public?: boolean
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          passcode_hash?: string | null
          project_id: string
          revoked_at?: string | null
          token: string
        }
        Update: {
          allow_public?: boolean
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          passcode_hash?: string | null
          project_id?: string
          revoked_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_shares_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          amount: number | null
          created_at: string | null
          id: string
          task_id: string | null
          type: Database["public"]["Enums"]["reminder_type"]
          unit: Database["public"]["Enums"]["reminder_unit"] | null
          value: string
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          id?: string
          task_id?: string | null
          type: Database["public"]["Enums"]["reminder_type"]
          unit?: Database["public"]["Enums"]["reminder_unit"] | null
          value: string
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          id?: string
          task_id?: string | null
          type?: Database["public"]["Enums"]["reminder_type"]
          unit?: Database["public"]["Enums"]["reminder_unit"] | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "upcoming_recurring_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          created_at: string | null
          delete_batch_id: string | null
          deleted_at: string | null
          id: string
          is_archived: boolean | null
          is_deleted: boolean | null
          name: string
          project_id: string | null
          todoist_collapsed: boolean | null
          todoist_id: string | null
          todoist_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          delete_batch_id?: string | null
          deleted_at?: string | null
          id?: string
          is_archived?: boolean | null
          is_deleted?: boolean | null
          name: string
          project_id?: string | null
          todoist_collapsed?: boolean | null
          todoist_id?: string | null
          todoist_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          delete_batch_id?: string | null
          deleted_at?: string | null
          id?: string
          is_archived?: boolean | null
          is_deleted?: boolean | null
          name?: string
          project_id?: string | null
          todoist_collapsed?: boolean | null
          todoist_id?: string | null
          todoist_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      spam_signatures: {
        Row: {
          created_at: string
          embedding: string | null
          id: string
          input_text: string
          label: string
          last_used_at: string | null
          mailbox_id: string | null
          note: string | null
          organization_id: string | null
          source: string
          source_count: number
          status: string
          thread_id: string | null
          updated_at: string
          user_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          embedding?: string | null
          id?: string
          input_text: string
          label: string
          last_used_at?: string | null
          mailbox_id?: string | null
          note?: string | null
          organization_id?: string | null
          source?: string
          source_count?: number
          status?: string
          thread_id?: string | null
          updated_at?: string
          user_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          embedding?: string | null
          id?: string
          input_text?: string
          label?: string
          last_used_at?: string | null
          mailbox_id?: string | null
          note?: string | null
          organization_id?: string | null
          source?: string
          source_count?: number
          status?: string
          thread_id?: string | null
          updated_at?: string
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "spam_signatures_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "mailboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spam_signatures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spam_signatures_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spam_signatures_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stake_edges: {
        Row: {
          child_stake_id: string
          created_at: string
          delete_batch_id: string | null
          deleted_at: string | null
          id: string
          parent_stake_id: string
          weight_multiplier: number
        }
        Insert: {
          child_stake_id: string
          created_at?: string
          delete_batch_id?: string | null
          deleted_at?: string | null
          id?: string
          parent_stake_id: string
          weight_multiplier?: number
        }
        Update: {
          child_stake_id?: string
          created_at?: string
          delete_batch_id?: string | null
          deleted_at?: string | null
          id?: string
          parent_stake_id?: string
          weight_multiplier?: number
        }
        Relationships: [
          {
            foreignKeyName: "stake_edges_child_stake_id_fkey"
            columns: ["child_stake_id"]
            isOneToOne: false
            referencedRelation: "stakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stake_edges_parent_stake_id_fkey"
            columns: ["parent_stake_id"]
            isOneToOne: false
            referencedRelation: "stakes"
            referencedColumns: ["id"]
          },
        ]
      }
      stake_extraction_examples: {
        Row: {
          accepted_payload: Json
          created_at: string
          id: string
          raw_input: string
          user_id: string
        }
        Insert: {
          accepted_payload: Json
          created_at?: string
          id?: string
          raw_input: string
          user_id: string
        }
        Update: {
          accepted_payload?: Json
          created_at?: string
          id?: string
          raw_input?: string
          user_id?: string
        }
        Relationships: []
      }
      stakes: {
        Row: {
          created_at: string
          delete_batch_id: string | null
          deleted_at: string | null
          description: string | null
          id: string
          kind: string
          monetary_value: number | null
          name: string
          organization_id: string
          project_id: string | null
          recurrence: string | null
          recurrence_interval_days: number | null
          severity: string | null
          status: string
          trigger_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          delete_batch_id?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          kind: string
          monetary_value?: number | null
          name: string
          organization_id: string
          project_id?: string | null
          recurrence?: string | null
          recurrence_interval_days?: number | null
          severity?: string | null
          status?: string
          trigger_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          delete_batch_id?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          kind?: string
          monetary_value?: number | null
          name?: string
          organization_id?: string
          project_id?: string | null
          recurrence?: string | null
          recurrence_interval_days?: number | null
          severity?: string | null
          status?: string
          trigger_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stakes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stakes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string
          created_at: string | null
          id: string
          name: string
          todoist_id: string | null
          todoist_is_deleted: boolean | null
          todoist_is_favorite: boolean | null
          todoist_order: number | null
        }
        Insert: {
          color?: string
          created_at?: string | null
          id?: string
          name: string
          todoist_id?: string | null
          todoist_is_deleted?: boolean | null
          todoist_is_favorite?: boolean | null
          todoist_order?: number | null
        }
        Update: {
          color?: string
          created_at?: string | null
          id?: string
          name?: string
          todoist_id?: string | null
          todoist_is_deleted?: boolean | null
          todoist_is_favorite?: boolean | null
          todoist_order?: number | null
        }
        Relationships: []
      }
      task_estimate_examples: {
        Row: {
          accepted_minutes: number
          ai_confidence: string | null
          ai_suggested_minutes: number | null
          created_at: string
          id: string
          priority: number | null
          project_name: string | null
          source: string
          tags: string[] | null
          task_description: string | null
          task_id: string | null
          task_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_minutes: number
          ai_confidence?: string | null
          ai_suggested_minutes?: number | null
          created_at?: string
          id?: string
          priority?: number | null
          project_name?: string | null
          source?: string
          tags?: string[] | null
          task_description?: string | null
          task_id?: string | null
          task_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_minutes?: number
          ai_confidence?: string | null
          ai_suggested_minutes?: number | null
          created_at?: string
          id?: string
          priority?: number | null
          project_name?: string | null
          source?: string
          tags?: string[] | null
          task_description?: string | null
          task_id?: string | null
          task_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_estimate_examples_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_estimate_examples_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "upcoming_recurring_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_sections: {
        Row: {
          created_at: string | null
          id: string
          section_id: string | null
          task_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          section_id?: string | null
          task_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          section_id?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_sections_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_sections_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_sections_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "upcoming_recurring_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_stakes: {
        Row: {
          created_at: string
          delete_batch_id: string | null
          deleted_at: string | null
          resolution_type: string
          stake_id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          delete_batch_id?: string | null
          deleted_at?: string | null
          resolution_type: string
          stake_id: string
          task_id: string
        }
        Update: {
          created_at?: string
          delete_batch_id?: string | null
          deleted_at?: string | null
          resolution_type?: string
          stake_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_stakes_stake_id_fkey"
            columns: ["stake_id"]
            isOneToOne: false
            referencedRelation: "stakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_stakes_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_stakes_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "upcoming_recurring_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_tags: {
        Row: {
          tag_id: string
          task_id: string
        }
        Insert: {
          tag_id: string
          task_id: string
        }
        Update: {
          tag_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_tags_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_tags_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "upcoming_recurring_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          agent_model: string | null
          agent_name: string | null
          assigned_to: string | null
          completed: boolean | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          deadline: string | null
          delete_batch_id: string | null
          deleted_at: string | null
          description: string | null
          devnotes_meta: string | null
          due_date: string | null
          due_time: string | null
          end_date: string | null
          end_time: string | null
          goal_id: string | null
          id: string
          indent: number | null
          is_recurring: boolean | null
          last_todoist_sync: string | null
          name: string
          parent_id: string | null
          priority: number | null
          project_id: string | null
          recurring_pattern: string | null
          requires_hitl: boolean
          section_id: string | null
          snoozed_until: string | null
          start_date: string | null
          start_time: string | null
          time_estimate: number | null
          todoist_assignee_id: string | null
          todoist_assigner_id: string | null
          todoist_child_order: number | null
          todoist_collapsed: boolean | null
          todoist_comment_count: number | null
          todoist_duration_amount: number | null
          todoist_duration_unit: string | null
          todoist_id: string | null
          todoist_labels: string[] | null
          todoist_order: number | null
          todoist_sync_token: string | null
          todoist_url: string | null
          updated_at: string | null
        }
        Insert: {
          agent_model?: string | null
          agent_name?: string | null
          assigned_to?: string | null
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          deadline?: string | null
          delete_batch_id?: string | null
          deleted_at?: string | null
          description?: string | null
          devnotes_meta?: string | null
          due_date?: string | null
          due_time?: string | null
          end_date?: string | null
          end_time?: string | null
          goal_id?: string | null
          id?: string
          indent?: number | null
          is_recurring?: boolean | null
          last_todoist_sync?: string | null
          name: string
          parent_id?: string | null
          priority?: number | null
          project_id?: string | null
          recurring_pattern?: string | null
          requires_hitl?: boolean
          section_id?: string | null
          snoozed_until?: string | null
          start_date?: string | null
          start_time?: string | null
          time_estimate?: number | null
          todoist_assignee_id?: string | null
          todoist_assigner_id?: string | null
          todoist_child_order?: number | null
          todoist_collapsed?: boolean | null
          todoist_comment_count?: number | null
          todoist_duration_amount?: number | null
          todoist_duration_unit?: string | null
          todoist_id?: string | null
          todoist_labels?: string[] | null
          todoist_order?: number | null
          todoist_sync_token?: string | null
          todoist_url?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_model?: string | null
          agent_name?: string | null
          assigned_to?: string | null
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          deadline?: string | null
          delete_batch_id?: string | null
          deleted_at?: string | null
          description?: string | null
          devnotes_meta?: string | null
          due_date?: string | null
          due_time?: string | null
          end_date?: string | null
          end_time?: string | null
          goal_id?: string | null
          id?: string
          indent?: number | null
          is_recurring?: boolean | null
          last_todoist_sync?: string | null
          name?: string
          parent_id?: string | null
          priority?: number | null
          project_id?: string | null
          recurring_pattern?: string | null
          requires_hitl?: boolean
          section_id?: string | null
          snoozed_until?: string | null
          start_date?: string | null
          start_time?: string | null
          time_estimate?: number | null
          todoist_assignee_id?: string | null
          todoist_assigner_id?: string | null
          todoist_child_order?: number | null
          todoist_collapsed?: boolean | null
          todoist_comment_count?: number | null
          todoist_duration_amount?: number | null
          todoist_duration_unit?: string | null
          todoist_id?: string | null
          todoist_labels?: string[] | null
          todoist_order?: number | null
          todoist_sync_token?: string | null
          todoist_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "upcoming_recurring_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      time_block_tasks: {
        Row: {
          created_at: string | null
          id: string
          task_id: string
          time_block_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          task_id: string
          time_block_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          task_id?: string
          time_block_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_block_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_block_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "upcoming_recurring_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_block_tasks_time_block_id_fkey"
            columns: ["time_block_id"]
            isOneToOne: false
            referencedRelation: "time_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      time_blocks: {
        Row: {
          created_at: string | null
          description: string | null
          end_time: string
          id: string
          organization_id: string | null
          start_time: string
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          end_time: string
          id?: string
          organization_id?: string | null
          start_time: string
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          end_time?: string
          id?: string
          organization_id?: string | null
          start_time?: string
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_blocks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      todoist_activity_log: {
        Row: {
          created_at: string | null
          event_name: string
          event_type: string
          extra_data: Json | null
          id: string
          object_id: string | null
          object_type: string | null
          todoist_event_date: string | null
          todoist_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_name: string
          event_type: string
          extra_data?: Json | null
          id?: string
          object_id?: string | null
          object_type?: string | null
          todoist_event_date?: string | null
          todoist_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_name?: string
          event_type?: string
          extra_data?: Json | null
          id?: string
          object_id?: string | null
          object_type?: string | null
          todoist_event_date?: string | null
          todoist_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "todoist_activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      todoist_api_calls: {
        Row: {
          created_at: string | null
          endpoint: string
          error_message: string | null
          id: string
          method: string
          response_time_ms: number | null
          status_code: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          endpoint: string
          error_message?: string | null
          id?: string
          method: string
          response_time_ms?: number | null
          status_code?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          endpoint?: string
          error_message?: string | null
          id?: string
          method?: string
          response_time_ms?: number | null
          status_code?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "todoist_api_calls_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      todoist_import_backup: {
        Row: {
          backup_type: string | null
          created_at: string | null
          data: Json
          id: string
          item_count: number | null
          project_count: number | null
          tag_count: number | null
          user_id: string | null
        }
        Insert: {
          backup_type?: string | null
          created_at?: string | null
          data: Json
          id?: string
          item_count?: number | null
          project_count?: number | null
          tag_count?: number | null
          user_id?: string | null
        }
        Update: {
          backup_type?: string | null
          created_at?: string | null
          data?: Json
          id?: string
          item_count?: number | null
          project_count?: number | null
          tag_count?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "todoist_import_backup_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      todoist_sync_conflicts: {
        Row: {
          created_at: string | null
          id: string
          local_data: Json | null
          local_updated_at: string | null
          resolution_data: Json | null
          resolution_strategy: string | null
          resolved_at: string | null
          resolved_by: string | null
          resource_id: string | null
          resource_type: string | null
          todoist_data: Json | null
          todoist_id: string | null
          todoist_updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          local_data?: Json | null
          local_updated_at?: string | null
          resolution_data?: Json | null
          resolution_strategy?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resource_id?: string | null
          resource_type?: string | null
          todoist_data?: Json | null
          todoist_id?: string | null
          todoist_updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          local_data?: Json | null
          local_updated_at?: string | null
          resolution_data?: Json | null
          resolution_strategy?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resource_id?: string | null
          resource_type?: string | null
          todoist_data?: Json | null
          todoist_id?: string | null
          todoist_updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "todoist_sync_conflicts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todoist_sync_conflicts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      todoist_sync_history: {
        Row: {
          completed_at: string | null
          conflicts_resolved: number | null
          created_at: string | null
          duration_ms: number | null
          error_details: Json | null
          id: string
          items_created: number | null
          items_deleted: number | null
          items_updated: number | null
          projects_created: number | null
          projects_deleted: number | null
          projects_updated: number | null
          started_at: string
          sync_direction: string | null
          sync_token_after: string | null
          sync_token_before: string | null
          sync_type: string | null
          tags_synced: number | null
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          conflicts_resolved?: number | null
          created_at?: string | null
          duration_ms?: number | null
          error_details?: Json | null
          id?: string
          items_created?: number | null
          items_deleted?: number | null
          items_updated?: number | null
          projects_created?: number | null
          projects_deleted?: number | null
          projects_updated?: number | null
          started_at: string
          sync_direction?: string | null
          sync_token_after?: string | null
          sync_token_before?: string | null
          sync_type?: string | null
          tags_synced?: number | null
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          conflicts_resolved?: number | null
          created_at?: string | null
          duration_ms?: number | null
          error_details?: Json | null
          id?: string
          items_created?: number | null
          items_deleted?: number | null
          items_updated?: number | null
          projects_created?: number | null
          projects_deleted?: number | null
          projects_updated?: number | null
          started_at?: string
          sync_direction?: string | null
          sync_token_after?: string | null
          sync_token_before?: string | null
          sync_type?: string | null
          tags_synced?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "todoist_sync_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      todoist_sync_state: {
        Row: {
          consecutive_failures: number | null
          created_at: string | null
          error_count: number | null
          error_message: string | null
          id: string
          last_sync_at: string | null
          next_sync_at: string | null
          sync_status: string | null
          sync_token: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          consecutive_failures?: number | null
          created_at?: string | null
          error_count?: number | null
          error_message?: string | null
          id?: string
          last_sync_at?: string | null
          next_sync_at?: string | null
          sync_status?: string | null
          sync_token?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          consecutive_failures?: number | null
          created_at?: string | null
          error_count?: number | null
          error_message?: string | null
          id?: string
          last_sync_at?: string | null
          next_sync_at?: string | null
          sync_status?: string | null
          sync_token?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "todoist_sync_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_organizations: {
        Row: {
          created_at: string | null
          is_owner: boolean | null
          organization_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          is_owner?: boolean | null
          organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          is_owner?: boolean | null
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_organizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_organizations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string | null
          default_email_html_render_mode: string
          email_reply_settings: Json
          expanded_organizations: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          default_email_html_render_mode?: string
          email_reply_settings?: Json
          expanded_organizations?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          default_email_html_render_mode?: string
          email_reply_settings?: Json
          expanded_organizations?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_projects: {
        Row: {
          created_at: string
          is_owner: boolean
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          is_owner?: boolean
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          is_owner?: boolean
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      upcoming_recurring_tasks: {
        Row: {
          assigned_to: string | null
          completed: boolean | null
          completed_at: string | null
          created_at: string | null
          deadline: string | null
          description: string | null
          due_date: string | null
          due_time: string | null
          end_date: string | null
          end_time: string | null
          id: string | null
          indent: number | null
          is_recurring: boolean | null
          last_todoist_sync: string | null
          name: string | null
          next_due_date: string | null
          parent_id: string | null
          priority: number | null
          project_id: string | null
          recurring_pattern: string | null
          section_id: string | null
          start_date: string | null
          start_time: string | null
          time_estimate: number | null
          todoist_assignee_id: string | null
          todoist_assigner_id: string | null
          todoist_child_order: number | null
          todoist_collapsed: boolean | null
          todoist_comment_count: number | null
          todoist_duration_amount: number | null
          todoist_duration_unit: string | null
          todoist_id: string | null
          todoist_labels: string[] | null
          todoist_order: number | null
          todoist_sync_token: string | null
          todoist_url: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          deadline?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          end_date?: string | null
          end_time?: string | null
          id?: string | null
          indent?: number | null
          is_recurring?: boolean | null
          last_todoist_sync?: string | null
          name?: string | null
          next_due_date?: never
          parent_id?: string | null
          priority?: number | null
          project_id?: string | null
          recurring_pattern?: string | null
          section_id?: string | null
          start_date?: string | null
          start_time?: string | null
          time_estimate?: number | null
          todoist_assignee_id?: string | null
          todoist_assigner_id?: string | null
          todoist_child_order?: number | null
          todoist_collapsed?: boolean | null
          todoist_comment_count?: number | null
          todoist_duration_amount?: number | null
          todoist_duration_unit?: string | null
          todoist_id?: string | null
          todoist_labels?: string[] | null
          todoist_order?: number | null
          todoist_sync_token?: string | null
          todoist_url?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          deadline?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          end_date?: string | null
          end_time?: string | null
          id?: string | null
          indent?: number | null
          is_recurring?: boolean | null
          last_todoist_sync?: string | null
          name?: string | null
          next_due_date?: never
          parent_id?: string | null
          priority?: number | null
          project_id?: string | null
          recurring_pattern?: string | null
          section_id?: string | null
          start_date?: string | null
          start_time?: string | null
          time_estimate?: number | null
          todoist_assignee_id?: string | null
          todoist_assigner_id?: string | null
          todoist_child_order?: number | null
          todoist_collapsed?: boolean | null
          todoist_comment_count?: number | null
          todoist_duration_amount?: number | null
          todoist_duration_unit?: string | null
          todoist_id?: string | null
          todoist_labels?: string[] | null
          todoist_order?: number | null
          todoist_sync_token?: string | null
          todoist_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "upcoming_recurring_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      backup_before_todoist_import: {
        Args: { p_user_id: string }
        Returns: string
      }
      can_manage_org_api_key: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: boolean
      }
      can_manage_personal_access_token: {
        Args: { p_token_id: string; p_user_id: string }
        Returns: boolean
      }
      check_sync_conflict: {
        Args: {
          p_local_updated_at: string
          p_resource_id: string
          p_resource_type: string
          p_todoist_updated_at: string
        }
        Returns: boolean
      }
      check_todoist_rate_limit: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      get_next_sync_time: { Args: { p_user_id: string }; Returns: string }
      is_org_admin: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      log_todoist_api_call: {
        Args: {
          p_endpoint: string
          p_error_message?: string
          p_method: string
          p_response_time_ms?: number
          p_status_code?: number
          p_user_id: string
        }
        Returns: string
      }
      match_ai_memories: {
        Args: {
          p_limit?: number
          p_memory_types?: string[]
          p_organization_id?: string
          p_query_embedding: string
          p_user_id: string
        }
        Returns: {
          confidence: number
          id: string
          input_text: string
          memory_type: string
          normalized_summary: string
          outcome_json: Json
          score: number
          similarity: number
          source_count: number
          source_type: string
          weight: number
        }[]
      }
      match_spam_signatures: {
        Args: {
          p_limit?: number
          p_mailbox_id?: string
          p_organization_id?: string
          p_query_embedding: string
          p_user_id: string
        }
        Returns: {
          id: string
          input_text: string
          label: string
          score: number
          similarity: number
          source: string
          weight: number
        }[]
      }
      purge_email_action_log: { Args: never; Returns: undefined }
      restore_entity: { Args: { p_batch_id: string }; Returns: number }
      soft_delete_entity: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: string
      }
      time_create_entry: {
        Args: {
          p_description?: string
          p_ended_at?: string
          p_organization_id: string
          p_project_id?: string
          p_section_id?: string
          p_source?: string
          p_source_metadata?: Json
          p_started_at?: string
          p_task_ids?: string[]
          p_timezone?: string
          p_title?: string
          p_user_id: string
        }
        Returns: Json
      }
      time_delete_entry: { Args: { p_entry_id: string }; Returns: undefined }
      time_get_current_entry: {
        Args: { p_org_id?: string; p_user_id?: string }
        Returns: Json
      }
      time_get_entry: { Args: { p_entry_id: string }; Returns: Json }
      time_get_org_token: { Args: { p_hashed_key: string }; Returns: Json }
      time_list_api_tokens: { Args: { p_org_ids: string[] }; Returns: Json }
      time_list_entries: {
        Args: {
          p_ended_before?: string
          p_organization_id?: string
          p_project_id?: string
          p_section_id?: string
          p_started_after?: string
          p_user_ids?: string[]
        }
        Returns: Json
      }
      time_list_groups: { Args: { p_org_ids: string[] }; Returns: Json }
      time_touch_org_token: { Args: { p_token_id: string }; Returns: undefined }
      time_update_entry: {
        Args: {
          p_description?: string
          p_ended_at?: string
          p_entry_id: string
          p_organization_id: string
          p_project_id?: string
          p_section_id?: string
          p_source_metadata?: Json
          p_started_at?: string
          p_task_ids?: string[]
          p_timezone?: string
          p_title?: string
          p_user_id: string
        }
        Returns: Json
      }
      user_belongs_to_org: { Args: { org_id: string }; Returns: boolean }
      user_can_access_email_thread: {
        Args: { p_thread_id: string; p_user_id?: string }
        Returns: boolean
      }
      user_can_access_mailbox: {
        Args: { p_mailbox_id: string; p_user_id?: string }
        Returns: boolean
      }
      user_can_manage_mailbox: {
        Args: { p_mailbox_id: string; p_user_id?: string }
        Returns: boolean
      }
      user_has_organization_access: {
        Args: { org_id: string }
        Returns: boolean
      }
      user_has_project_membership: {
        Args: { p_project_id: string }
        Returns: boolean
      }
    }
    Enums: {
      reminder_type: "preset" | "custom"
      reminder_unit: "minutes" | "hours" | "days" | "weeks" | "months" | "years"
      user_role: "super_admin" | "admin" | "team_member"
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
      reminder_type: ["preset", "custom"],
      reminder_unit: ["minutes", "hours", "days", "weeks", "months", "years"],
      user_role: ["super_admin", "admin", "team_member"],
    },
  },
} as const
