export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          first_name: string | null
          last_name: string | null
          role: 'super_admin' | 'admin' | 'team_member'
          profile_color: string
          animations_enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          first_name?: string | null
          last_name?: string | null
          role?: 'super_admin' | 'admin' | 'team_member'
          profile_color?: string
          animations_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          first_name?: string | null
          last_name?: string | null
          role?: 'super_admin' | 'admin' | 'team_member'
          profile_color?: string
          animations_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      organizations: {
        Row: {
          id: string
          name: string
          description: string | null
          color: string
          archived: boolean
          order_index: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          color?: string
          archived?: boolean
          order_index?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          color?: string
          archived?: boolean
          order_index?: number
          created_at?: string
          updated_at?: string
        }
      }
      user_organizations: {
        Row: {
          user_id: string
          organization_id: string
          created_at: string
        }
        Insert: {
          user_id: string
          organization_id: string
          created_at?: string
        }
        Update: {
          user_id?: string
          organization_id?: string
          created_at?: string
        }
      }
      projects: {
        Row: {
          id: string
          name: string
          description: string | null
          color: string
          organization_id: string
          is_favorite: boolean
          archived: boolean
          budget: number | null
          deadline: string | null
          order_index: number
          todoist_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          color?: string
          organization_id: string
          is_favorite?: boolean
          archived?: boolean
          budget?: number | null
          deadline?: string | null
          order_index?: number
          todoist_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          color?: string
          organization_id?: string
          is_favorite?: boolean
          archived?: boolean
          budget?: number | null
          deadline?: string | null
          order_index?: number
          todoist_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      tasks: {
        Row: {
          id: string
          name: string
          description: string | null
          due_date: string | null
          due_time: string | null
          priority: number
          deadline: string | null
          project_id: string
          assigned_to: string | null
          completed: boolean
          completed_at: string | null
          todoist_id: string | null
          recurring_pattern: string | null
          parent_id: string | null
          indent: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          priority?: number
          deadline?: string | null
          project_id: string
          assigned_to?: string | null
          completed?: boolean
          completed_at?: string | null
          todoist_id?: string | null
          recurring_pattern?: string | null
          parent_id?: string | null
          indent?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          priority?: number
          deadline?: string | null
          project_id?: string
          assigned_to?: string | null
          completed?: boolean
          completed_at?: string | null
          todoist_id?: string | null
          recurring_pattern?: string | null
          parent_id?: string | null
          indent?: number
          created_at?: string
          updated_at?: string
        }
      }
      tags: {
        Row: {
          id: string
          name: string
          color: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          color?: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          color?: string
          created_at?: string
        }
      }
      task_tags: {
        Row: {
          task_id: string
          tag_id: string
        }
        Insert: {
          task_id: string
          tag_id: string
        }
        Update: {
          task_id?: string
          tag_id?: string
        }
      }
      reminders: {
        Row: {
          id: string
          task_id: string
          type: 'preset' | 'custom'
          value: string
          unit: 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years' | null
          amount: number | null
          created_at: string
        }
        Insert: {
          id?: string
          task_id: string
          type: 'preset' | 'custom'
          value: string
          unit?: 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years' | null
          amount?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          task_id?: string
          type?: 'preset' | 'custom'
          value?: string
          unit?: 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years' | null
          amount?: number | null
          created_at?: string
        }
      }
      attachments: {
        Row: {
          id: string
          task_id: string
          name: string
          url: string
          type: string
          created_at: string
        }
        Insert: {
          id?: string
          task_id: string
          name: string
          url: string
          type: string
          created_at?: string
        }
        Update: {
          id?: string
          task_id?: string
          name?: string
          url?: string
          type?: string
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}