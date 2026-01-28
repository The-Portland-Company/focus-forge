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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
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
      organizations: {
        Row: {
          archived: boolean | null
          color: string
          created_at: string | null
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
          description?: string | null
          id?: string
          name?: string
          order_index?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          animations_enabled: boolean | null
          created_at: string | null
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          priority_color: string | null
          profile_color: string | null
          profile_memoji: string | null
          role: Database["public"]["Enums"]["user_role"]
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
          animations_enabled?: boolean | null
          created_at?: string | null
          email: string
          first_name?: string | null
          id: string
          last_name?: string | null
          priority_color?: string | null
          profile_color?: string | null
          profile_memoji?: string | null
          role?: Database["public"]["Enums"]["user_role"]
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
          animations_enabled?: boolean | null
          created_at?: string | null
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          priority_color?: string | null
          profile_color?: string | null
          profile_memoji?: string | null
          role?: Database["public"]["Enums"]["user_role"]
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
          description: string | null
          id: string
          is_favorite: boolean | null
          last_todoist_sync: string | null
          name: string
          order_index: number | null
          organization_id: string | null
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
          description?: string | null
          id?: string
          is_favorite?: boolean | null
          last_todoist_sync?: string | null
          name: string
          order_index?: number | null
          organization_id?: string | null
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
          description?: string | null
          id?: string
          is_favorite?: boolean | null
          last_todoist_sync?: string | null
          name?: string
          order_index?: number | null
          organization_id?: string | null
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
          assigned_to: string | null
          completed: boolean | null
          completed_at: string | null
          created_at: string | null
          deadline: string | null
          description: string | null
          due_date: string | null
          due_time: string | null
          id: string
          indent: number | null
          is_recurring: boolean | null
          last_todoist_sync: string | null
          name: string
          parent_id: string | null
          priority: number | null
          project_id: string | null
          recurring_pattern: string | null
          section_id: string | null
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
          id?: string
          indent?: number | null
          is_recurring?: boolean | null
          last_todoist_sync?: string | null
          name: string
          parent_id?: string | null
          priority?: number | null
          project_id?: string | null
          recurring_pattern?: string | null
          section_id?: string | null
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
          id?: string
          indent?: number | null
          is_recurring?: boolean | null
          last_todoist_sync?: string | null
          name?: string
          parent_id?: string | null
          priority?: number | null
          project_id?: string | null
          recurring_pattern?: string | null
          section_id?: string | null
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
          expanded_organizations: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expanded_organizations?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
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
      get_next_sync_time: {
        Args: { p_user_id: string }
        Returns: string
      }
      is_super_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
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
      user_has_organization_access: {
        Args: { org_id: string }
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
