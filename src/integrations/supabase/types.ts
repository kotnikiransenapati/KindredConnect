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
      a2a_agents: {
        Row: {
          capabilities: string[]
          created_at: string
          created_by: string
          description: string | null
          endpoint_url: string | null
          id: string
          metadata: Json
          name: string
          project_id: string
          public_key: string | null
          status: Database["public"]["Enums"]["a2a_agent_status"]
          updated_at: string
        }
        Insert: {
          capabilities?: string[]
          created_at?: string
          created_by: string
          description?: string | null
          endpoint_url?: string | null
          id?: string
          metadata?: Json
          name: string
          project_id: string
          public_key?: string | null
          status?: Database["public"]["Enums"]["a2a_agent_status"]
          updated_at?: string
        }
        Update: {
          capabilities?: string[]
          created_at?: string
          created_by?: string
          description?: string | null
          endpoint_url?: string | null
          id?: string
          metadata?: Json
          name?: string
          project_id?: string
          public_key?: string | null
          status?: Database["public"]["Enums"]["a2a_agent_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "a2a_agents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      a2a_messages: {
        Row: {
          correlation_id: string | null
          created_at: string
          error: string | null
          from_agent_id: string
          id: string
          intent: string
          payload: Json
          project_id: string
          response: Json | null
          sent_by: string
          signature: string | null
          status: Database["public"]["Enums"]["a2a_message_status"]
          to_agent_id: string
          updated_at: string
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          error?: string | null
          from_agent_id: string
          id?: string
          intent: string
          payload?: Json
          project_id: string
          response?: Json | null
          sent_by: string
          signature?: string | null
          status?: Database["public"]["Enums"]["a2a_message_status"]
          to_agent_id: string
          updated_at?: string
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          error?: string | null
          from_agent_id?: string
          id?: string
          intent?: string
          payload?: Json
          project_id?: string
          response?: Json | null
          sent_by?: string
          signature?: string | null
          status?: Database["public"]["Enums"]["a2a_message_status"]
          to_agent_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "a2a_messages_from_agent_id_fkey"
            columns: ["from_agent_id"]
            isOneToOne: false
            referencedRelation: "a2a_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "a2a_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "a2a_messages_to_agent_id_fkey"
            columns: ["to_agent_id"]
            isOneToOne: false
            referencedRelation: "a2a_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json
          project_id: string
          target: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          project_id: string
          target?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          project_id?: string
          target?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_messages: {
        Row: {
          created_at: string
          id: string
          parts: Json
          project_id: string
          role: string
          task_id: string
          tokens: number
        }
        Insert: {
          created_at?: string
          id?: string
          parts?: Json
          project_id: string
          role: string
          task_id: string
          tokens?: number
        }
        Update: {
          created_at?: string
          id?: string
          parts?: Json
          project_id?: string
          role?: string
          task_id?: string
          tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "agent_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_proposals: {
        Row: {
          created_at: string
          diff: Json
          id: string
          project_id: string
          run_id: string | null
          schedule_id: string | null
          status: string
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          diff?: Json
          id?: string
          project_id: string
          run_id?: string | null
          schedule_id?: string | null
          status?: string
          summary: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          diff?: Json
          id?: string
          project_id?: string
          run_id?: string | null
          schedule_id?: string | null
          status?: string
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_proposals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_proposals_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_proposals_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "agent_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          goal: string
          id: string
          model: string | null
          plan: Json
          project_id: string
          started_at: string | null
          status: string
          total_cost_cents: number
          total_tokens: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          goal: string
          id?: string
          model?: string | null
          plan?: Json
          project_id: string
          started_at?: string | null
          status?: string
          total_cost_cents?: number
          total_tokens?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          goal?: string
          id?: string
          model?: string | null
          plan?: Json
          project_id?: string
          started_at?: string | null
          status?: string
          total_cost_cents?: number
          total_tokens?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_schedules: {
        Row: {
          created_at: string
          cron: string
          enabled: boolean
          goal: string
          id: string
          last_run_at: string | null
          last_run_id: string | null
          name: string
          next_run_at: string
          project_id: string
          roles: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cron: string
          enabled?: boolean
          goal: string
          id?: string
          last_run_at?: string | null
          last_run_id?: string | null
          name: string
          next_run_at?: string
          project_id: string
          roles?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          cron?: string
          enabled?: boolean
          goal?: string
          id?: string
          last_run_at?: string | null
          last_run_id?: string | null
          name?: string
          next_run_at?: string
          project_id?: string
          roles?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_schedules_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_skills: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          description: string
          enabled: boolean
          id: string
          install_count: number
          kind: Database["public"]["Enums"]["skill_kind"]
          name: string
          project_id: string
          updated_at: string
          visibility: Database["public"]["Enums"]["skill_visibility"]
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string
          enabled?: boolean
          id?: string
          install_count?: number
          kind: Database["public"]["Enums"]["skill_kind"]
          name: string
          project_id: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["skill_visibility"]
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string
          enabled?: boolean
          id?: string
          install_count?: number
          kind?: Database["public"]["Enums"]["skill_kind"]
          name?: string
          project_id?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["skill_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "agent_skills_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tasks: {
        Row: {
          artifacts: Json
          attempt: number
          cost_cents: number
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          input: Json
          output: Json | null
          parent_task_id: string | null
          project_id: string
          role: string
          run_id: string
          started_at: string | null
          status: string
          title: string
          tokens: number
          updated_at: string
        }
        Insert: {
          artifacts?: Json
          attempt?: number
          cost_cents?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          output?: Json | null
          parent_task_id?: string | null
          project_id: string
          role: string
          run_id: string
          started_at?: string | null
          status?: string
          title: string
          tokens?: number
          updated_at?: string
        }
        Update: {
          artifacts?: Json
          attempt?: number
          cost_cents?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          output?: Json | null
          parent_task_id?: string | null
          project_id?: string
          role?: string
          run_id?: string
          started_at?: string | null
          status?: string
          title?: string
          tokens?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "agent_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tasks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_guardrail_violations: {
        Row: {
          action_taken: Database["public"]["Enums"]["guardrail_action"]
          actor_id: string | null
          content_hash: string
          guardrail_id: string | null
          guardrail_type: Database["public"]["Enums"]["guardrail_type"]
          id: string
          matched_patterns: string[] | null
          metadata: Json
          occurred_at: string
          project_id: string
          severity: Database["public"]["Enums"]["guardrail_severity"]
          snippet: string | null
        }
        Insert: {
          action_taken: Database["public"]["Enums"]["guardrail_action"]
          actor_id?: string | null
          content_hash: string
          guardrail_id?: string | null
          guardrail_type: Database["public"]["Enums"]["guardrail_type"]
          id?: string
          matched_patterns?: string[] | null
          metadata?: Json
          occurred_at?: string
          project_id: string
          severity?: Database["public"]["Enums"]["guardrail_severity"]
          snippet?: string | null
        }
        Update: {
          action_taken?: Database["public"]["Enums"]["guardrail_action"]
          actor_id?: string | null
          content_hash?: string
          guardrail_id?: string | null
          guardrail_type?: Database["public"]["Enums"]["guardrail_type"]
          id?: string
          matched_patterns?: string[] | null
          metadata?: Json
          occurred_at?: string
          project_id?: string
          severity?: Database["public"]["Enums"]["guardrail_severity"]
          snippet?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_guardrail_violations_guardrail_id_fkey"
            columns: ["guardrail_id"]
            isOneToOne: false
            referencedRelation: "ai_guardrails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_guardrail_violations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_guardrails: {
        Row: {
          action: Database["public"]["Enums"]["guardrail_action"]
          config: Json
          created_at: string
          created_by: string
          enabled: boolean
          id: string
          name: string
          project_id: string
          type: Database["public"]["Enums"]["guardrail_type"]
          updated_at: string
        }
        Insert: {
          action?: Database["public"]["Enums"]["guardrail_action"]
          config?: Json
          created_at?: string
          created_by?: string
          enabled?: boolean
          id?: string
          name: string
          project_id: string
          type: Database["public"]["Enums"]["guardrail_type"]
          updated_at?: string
        }
        Update: {
          action?: Database["public"]["Enums"]["guardrail_action"]
          config?: Json
          created_at?: string
          created_by?: string
          enabled?: boolean
          id?: string
          name?: string
          project_id?: string
          type?: Database["public"]["Enums"]["guardrail_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_guardrails_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          created_at: string
          id: string
          model: string
          project_id: string | null
          prompt_chars: number
          response_chars: number
          tool_calls: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          model: string
          project_id?: string | null
          prompt_chars?: number
          response_chars?: number
          tool_calls?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          model?: string
          project_id?: string | null
          prompt_chars?: number
          response_chars?: number
          tool_calls?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          country: string | null
          created_at: string
          event_name: string
          id: string
          occurred_at: string
          path: string | null
          project_id: string
          properties: Json
          referrer: string | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          event_name: string
          id?: string
          occurred_at?: string
          path?: string | null
          project_id: string
          properties?: Json
          referrer?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          event_name?: string
          id?: string
          occurred_at?: string
          path?: string | null
          project_id?: string
          properties?: Json
          referrer?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      anomaly_detectors: {
        Row: {
          baseline: Json
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          metric_key: string
          min_samples: number
          name: string
          notify_channels: Json
          project_id: string
          sensitivity: string
          source: string
          updated_at: string
          window_minutes: number
        }
        Insert: {
          baseline?: Json
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          metric_key: string
          min_samples?: number
          name: string
          notify_channels?: Json
          project_id: string
          sensitivity?: string
          source?: string
          updated_at?: string
          window_minutes?: number
        }
        Update: {
          baseline?: Json
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          metric_key?: string
          min_samples?: number
          name?: string
          notify_channels?: Json
          project_id?: string
          sensitivity?: string
          source?: string
          updated_at?: string
          window_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "anomaly_detectors_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      anomaly_incidents: {
        Row: {
          acknowledged_at: string | null
          actor_id: string | null
          actual_value: number
          detected_at: string
          detector_id: string
          expected_value: number | null
          id: string
          metadata: Json
          project_id: string
          recommendation: string | null
          resolved_at: string | null
          sample_id: string | null
          score: number
          severity: string
          state: string
          summary: string
          z_score: number | null
        }
        Insert: {
          acknowledged_at?: string | null
          actor_id?: string | null
          actual_value: number
          detected_at?: string
          detector_id: string
          expected_value?: number | null
          id?: string
          metadata?: Json
          project_id: string
          recommendation?: string | null
          resolved_at?: string | null
          sample_id?: string | null
          score?: number
          severity?: string
          state?: string
          summary: string
          z_score?: number | null
        }
        Update: {
          acknowledged_at?: string | null
          actor_id?: string | null
          actual_value?: number
          detected_at?: string
          detector_id?: string
          expected_value?: number | null
          id?: string
          metadata?: Json
          project_id?: string
          recommendation?: string | null
          resolved_at?: string | null
          sample_id?: string | null
          score?: number
          severity?: string
          state?: string
          summary?: string
          z_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "anomaly_incidents_detector_id_fkey"
            columns: ["detector_id"]
            isOneToOne: false
            referencedRelation: "anomaly_detectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anomaly_incidents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anomaly_incidents_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "anomaly_samples"
            referencedColumns: ["id"]
          },
        ]
      }
      anomaly_samples: {
        Row: {
          context: Json
          created_at: string
          detector_id: string
          dimension: string | null
          id: string
          measured_at: string
          metric_value: number
          project_id: string
        }
        Insert: {
          context?: Json
          created_at?: string
          detector_id: string
          dimension?: string | null
          id?: string
          measured_at?: string
          metric_value: number
          project_id: string
        }
        Update: {
          context?: Json
          created_at?: string
          detector_id?: string
          dimension?: string | null
          id?: string
          measured_at?: string
          metric_value?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anomaly_samples_detector_id_fkey"
            columns: ["detector_id"]
            isOneToOne: false
            referencedRelation: "anomaly_detectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anomaly_samples_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      app_clip_invocations: {
        Row: {
          clip_id: string
          converted_to_install: boolean
          country: string | null
          created_at: string
          device_model: string | null
          id: string
          platform: string
          project_id: string
          session_ms: number
          source: string
        }
        Insert: {
          clip_id: string
          converted_to_install?: boolean
          country?: string | null
          created_at?: string
          device_model?: string | null
          id?: string
          platform: string
          project_id: string
          session_ms?: number
          source: string
        }
        Update: {
          clip_id?: string
          converted_to_install?: boolean
          country?: string | null
          created_at?: string
          device_model?: string | null
          id?: string
          platform?: string
          project_id?: string
          session_ms?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_clip_invocations_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "app_clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_clip_invocations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      app_clips: {
        Row: {
          advance_experience: boolean
          associations: Json
          bundle_size_kb: number
          created_at: string
          created_by: string | null
          entry_route: string
          id: string
          invocation_url: string
          platform: string
          project_id: string
          settings: Json
          slug: string
          status: string
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          advance_experience?: boolean
          associations?: Json
          bundle_size_kb?: number
          created_at?: string
          created_by?: string | null
          entry_route?: string
          id?: string
          invocation_url: string
          platform?: string
          project_id: string
          settings?: Json
          slug: string
          status?: string
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          advance_experience?: boolean
          associations?: Json
          bundle_size_kb?: number
          created_at?: string
          created_by?: string | null
          entry_route?: string
          id?: string
          invocation_url?: string
          platform?: string
          project_id?: string
          settings?: Json
          slug?: string
          status?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_clips_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_compression_jobs: {
        Row: {
          attempts: number
          compressed_bytes: number
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          original_bytes: number
          output_format: string
          output_path: string | null
          params: Json
          project_id: string
          quality: number | null
          requested_by: string | null
          savings_bytes: number | null
          source_kind: string
          source_path: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          compressed_bytes?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          original_bytes?: number
          output_format: string
          output_path?: string | null
          params?: Json
          project_id: string
          quality?: number | null
          requested_by?: string | null
          savings_bytes?: number | null
          source_kind: string
          source_path: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          compressed_bytes?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          original_bytes?: number
          output_format?: string
          output_path?: string | null
          params?: Json
          project_id?: string
          quality?: number | null
          requested_by?: string | null
          savings_bytes?: number | null
          source_kind?: string
          source_path?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_compression_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          ip: unknown
          metadata: Json
          org_id: string | null
          project_id: string | null
          resource_id: string | null
          resource_type: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          ip?: unknown
          metadata?: Json
          org_id?: string | null
          project_id?: string | null
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          ip?: unknown
          metadata?: Json
          org_id?: string | null
          project_id?: string | null
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      build_artifacts: {
        Row: {
          checksum: string | null
          created_at: string
          id: string
          job_id: string | null
          kind: string
          metadata: Json
          name: string
          project_id: string
          retention_days: number
          run_id: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          checksum?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          kind: string
          metadata?: Json
          name: string
          project_id: string
          retention_days?: number
          run_id: string
          size_bytes?: number
          storage_path: string
        }
        Update: {
          checksum?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          kind?: string
          metadata?: Json
          name?: string
          project_id?: string
          retention_days?: number
          run_id?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "build_artifacts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "build_pipeline_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "build_artifacts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "build_artifacts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "build_pipeline_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      build_pipeline_jobs: {
        Row: {
          attempt: number
          created_at: string
          depends_on: string[]
          duration_ms: number | null
          exit_code: number | null
          finished_at: string | null
          id: string
          logs_excerpt: string | null
          max_attempts: number
          project_id: string
          run_id: string
          stage_key: string
          stage_name: string
          started_at: string | null
          status: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          depends_on?: string[]
          duration_ms?: number | null
          exit_code?: number | null
          finished_at?: string | null
          id?: string
          logs_excerpt?: string | null
          max_attempts?: number
          project_id: string
          run_id: string
          stage_key: string
          stage_name: string
          started_at?: string | null
          status?: string
        }
        Update: {
          attempt?: number
          created_at?: string
          depends_on?: string[]
          duration_ms?: number | null
          exit_code?: number | null
          finished_at?: string | null
          id?: string
          logs_excerpt?: string | null
          max_attempts?: number
          project_id?: string
          run_id?: string
          stage_key?: string
          stage_name?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "build_pipeline_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "build_pipeline_jobs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "build_pipeline_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      build_pipeline_runs: {
        Row: {
          commit_sha: string | null
          created_at: string
          duration_ms: number | null
          finished_at: string | null
          id: string
          inputs: Json
          pipeline_id: string
          project_id: string
          ref: string | null
          run_number: number
          started_at: string | null
          status: string
          trigger: string
          triggered_by: string | null
        }
        Insert: {
          commit_sha?: string | null
          created_at?: string
          duration_ms?: number | null
          finished_at?: string | null
          id?: string
          inputs?: Json
          pipeline_id: string
          project_id: string
          ref?: string | null
          run_number: number
          started_at?: string | null
          status?: string
          trigger: string
          triggered_by?: string | null
        }
        Update: {
          commit_sha?: string | null
          created_at?: string
          duration_ms?: number | null
          finished_at?: string | null
          id?: string
          inputs?: Json
          pipeline_id?: string
          project_id?: string
          ref?: string | null
          run_number?: number
          started_at?: string | null
          status?: string
          trigger?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "build_pipeline_runs_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "build_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "build_pipeline_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      build_pipelines: {
        Row: {
          concurrency: number
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          id: string
          name: string
          project_id: string
          schedule_cron: string | null
          stages: Json
          trigger: string
          updated_at: string
        }
        Insert: {
          concurrency?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          name: string
          project_id: string
          schedule_cron?: string | null
          stages?: Json
          trigger?: string
          updated_at?: string
        }
        Update: {
          concurrency?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          name?: string
          project_id?: string
          schedule_cron?: string | null
          stages?: Json
          trigger?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "build_pipelines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      bundle_assets: {
        Row: {
          bytes: number
          compressed_bytes: number | null
          id: number
          kind: string
          metadata: Json
          path: string
          project_id: string
          snapshot_id: string
        }
        Insert: {
          bytes?: number
          compressed_bytes?: number | null
          id?: number
          kind: string
          metadata?: Json
          path: string
          project_id: string
          snapshot_id: string
        }
        Update: {
          bytes?: number
          compressed_bytes?: number | null
          id?: number
          kind?: string
          metadata?: Json
          path?: string
          project_id?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundle_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_assets_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "bundle_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      bundle_snapshots: {
        Row: {
          build_number: number | null
          created_at: string
          created_by: string | null
          download_bytes: number | null
          id: string
          install_bytes: number | null
          notes: string | null
          platform: string
          project_id: string
          source: string
          total_bytes: number
          version_name: string
        }
        Insert: {
          build_number?: number | null
          created_at?: string
          created_by?: string | null
          download_bytes?: number | null
          id?: string
          install_bytes?: number | null
          notes?: string | null
          platform: string
          project_id: string
          source?: string
          total_bytes?: number
          version_name: string
        }
        Update: {
          build_number?: number | null
          created_at?: string
          created_by?: string | null
          download_bytes?: number | null
          id?: string
          install_bytes?: number | null
          notes?: string | null
          platform?: string
          project_id?: string
          source?: string
          total_bytes?: number
          version_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundle_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      canary_events: {
        Row: {
          actor_id: string | null
          detail: string | null
          event: string
          id: number
          occurred_at: string
          project_id: string
          rollout_id: string
          stage: number | null
          status: Database["public"]["Enums"]["canary_status"] | null
        }
        Insert: {
          actor_id?: string | null
          detail?: string | null
          event: string
          id?: number
          occurred_at?: string
          project_id: string
          rollout_id: string
          stage?: number | null
          status?: Database["public"]["Enums"]["canary_status"] | null
        }
        Update: {
          actor_id?: string | null
          detail?: string | null
          event?: string
          id?: number
          occurred_at?: string
          project_id?: string
          rollout_id?: string
          stage?: number | null
          status?: Database["public"]["Enums"]["canary_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "canary_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canary_events_rollout_id_fkey"
            columns: ["rollout_id"]
            isOneToOne: false
            referencedRelation: "canary_rollouts"
            referencedColumns: ["id"]
          },
        ]
      }
      canary_metrics: {
        Row: {
          crashes: number
          errors: number
          id: number
          p95_latency_ms: number | null
          project_id: string
          recorded_at: string
          rollout_id: string
          sessions: number
          source: string
          stage: number
        }
        Insert: {
          crashes?: number
          errors?: number
          id?: number
          p95_latency_ms?: number | null
          project_id: string
          recorded_at?: string
          rollout_id: string
          sessions?: number
          source?: string
          stage: number
        }
        Update: {
          crashes?: number
          errors?: number
          id?: number
          p95_latency_ms?: number | null
          project_id?: string
          recorded_at?: string
          rollout_id?: string
          sessions?: number
          source?: string
          stage?: number
        }
        Relationships: [
          {
            foreignKeyName: "canary_metrics_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canary_metrics_rollout_id_fkey"
            columns: ["rollout_id"]
            isOneToOne: false
            referencedRelation: "canary_rollouts"
            referencedColumns: ["id"]
          },
        ]
      }
      canary_rollouts: {
        Row: {
          artifact_ref: string
          baseline_ref: string | null
          crash_budget_ppm: number
          created_at: string
          created_by: string | null
          current_stage: number
          ended_at: string | null
          error_budget_ppm: number
          id: string
          name: string
          project_id: string
          stages: Json
          started_at: string | null
          status: Database["public"]["Enums"]["canary_status"]
          updated_at: string
        }
        Insert: {
          artifact_ref: string
          baseline_ref?: string | null
          crash_budget_ppm?: number
          created_at?: string
          created_by?: string | null
          current_stage?: number
          ended_at?: string | null
          error_budget_ppm?: number
          id?: string
          name: string
          project_id: string
          stages?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["canary_status"]
          updated_at?: string
        }
        Update: {
          artifact_ref?: string
          baseline_ref?: string | null
          crash_budget_ppm?: number
          created_at?: string
          created_by?: string | null
          current_stage?: number
          ended_at?: string | null
          error_budget_ppm?: number
          id?: string
          name?: string
          project_id?: string
          stages?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["canary_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canary_rollouts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ci_gates: {
        Row: {
          created_at: string
          created_by: string | null
          deployment_id: string | null
          duration_ms: number | null
          error: string | null
          id: string
          kind: Database["public"]["Enums"]["gate_kind"]
          project_id: string
          report: Json
          score: number | null
          status: Database["public"]["Enums"]["gate_status"]
          target_url: string | null
          threshold: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deployment_id?: string | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          kind: Database["public"]["Enums"]["gate_kind"]
          project_id: string
          report?: Json
          score?: number | null
          status?: Database["public"]["Enums"]["gate_status"]
          target_url?: string | null
          threshold?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deployment_id?: string | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["gate_kind"]
          project_id?: string
          report?: Json
          score?: number | null
          status?: Database["public"]["Enums"]["gate_status"]
          target_url?: string | null
          threshold?: number
        }
        Relationships: [
          {
            foreignKeyName: "ci_gates_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "deployments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ci_gates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      collab_comments: {
        Row: {
          anchor: Json
          author_id: string | null
          body: string
          created_at: string
          id: string
          parent_id: string | null
          project_id: string
          resolved_at: string | null
          session_id: string
          updated_at: string
        }
        Insert: {
          anchor?: Json
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          parent_id?: string | null
          project_id: string
          resolved_at?: string | null
          session_id: string
          updated_at?: string
        }
        Update: {
          anchor?: Json
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          project_id?: string
          resolved_at?: string | null
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collab_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "collab_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collab_comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collab_comments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "collab_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      collab_ops: {
        Row: {
          actor_id: string | null
          client_id: string | null
          created_at: string
          id: string
          op_kind: string
          parent_version: number
          payload: Json
          project_id: string
          session_id: string
          version: number
        }
        Insert: {
          actor_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          op_kind: string
          parent_version?: number
          payload?: Json
          project_id: string
          session_id: string
          version: number
        }
        Update: {
          actor_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          op_kind?: string
          parent_version?: number
          payload?: Json
          project_id?: string
          session_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "collab_ops_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collab_ops_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "collab_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      collab_participants: {
        Row: {
          color: string
          cursor: Json
          display_name: string
          id: string
          joined_at: string
          last_seen: string
          project_id: string
          selection: Json
          session_id: string
          status: string
          user_id: string
        }
        Insert: {
          color?: string
          cursor?: Json
          display_name: string
          id?: string
          joined_at?: string
          last_seen?: string
          project_id: string
          selection?: Json
          session_id: string
          status?: string
          user_id: string
        }
        Update: {
          color?: string
          cursor?: Json
          display_name?: string
          id?: string
          joined_at?: string
          last_seen?: string
          project_id?: string
          selection?: Json
          session_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collab_participants_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collab_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "collab_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      collab_sessions: {
        Row: {
          base_version: number
          created_at: string
          created_by: string | null
          document_path: string
          head_version: number
          id: string
          project_id: string
          snapshot: Json
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          base_version?: number
          created_at?: string
          created_by?: string | null
          document_path: string
          head_version?: number
          id?: string
          project_id: string
          snapshot?: Json
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          base_version?: number
          created_at?: string
          created_by?: string | null
          document_path?: string
          head_version?: number
          id?: string
          project_id?: string
          snapshot?: Json
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collab_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      crash_reports: {
        Row: {
          app_version: string
          breadcrumbs: Json
          build_number: string | null
          created_at: string
          device_model: string | null
          fingerprint: string
          id: string
          message: string
          metadata: Json
          occurred_at: string
          os_version: string | null
          platform: string
          project_id: string
          severity: string
          stack_raw: string
          stack_symbolicated: string | null
          symbolicated: boolean
          user_id_external: string | null
        }
        Insert: {
          app_version: string
          breadcrumbs?: Json
          build_number?: string | null
          created_at?: string
          device_model?: string | null
          fingerprint: string
          id?: string
          message: string
          metadata?: Json
          occurred_at?: string
          os_version?: string | null
          platform: string
          project_id: string
          severity?: string
          stack_raw: string
          stack_symbolicated?: string | null
          symbolicated?: boolean
          user_id_external?: string | null
        }
        Update: {
          app_version?: string
          breadcrumbs?: Json
          build_number?: string | null
          created_at?: string
          device_model?: string | null
          fingerprint?: string
          id?: string
          message?: string
          metadata?: Json
          occurred_at?: string
          os_version?: string | null
          platform?: string
          project_id?: string
          severity?: string
          stack_raw?: string
          stack_symbolicated?: string | null
          symbolicated?: boolean
          user_id_external?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crash_reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      deep_links: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          params: Json
          path: string
          project_id: string
          screen_slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          params?: Json
          path: string
          project_id: string
          screen_slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          params?: Json
          path?: string
          project_id?: string
          screen_slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deep_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      deploy_healing: {
        Row: {
          action: string
          ci_gate_id: string | null
          created_at: string
          deployment_id: string | null
          detail: Json
          id: string
          project_id: string
          proposal_id: string | null
          rollback_to_deployment_id: string | null
          status: string
          summary: string
          updated_at: string
        }
        Insert: {
          action: string
          ci_gate_id?: string | null
          created_at?: string
          deployment_id?: string | null
          detail?: Json
          id?: string
          project_id: string
          proposal_id?: string | null
          rollback_to_deployment_id?: string | null
          status?: string
          summary?: string
          updated_at?: string
        }
        Update: {
          action?: string
          ci_gate_id?: string | null
          created_at?: string
          deployment_id?: string | null
          detail?: Json
          id?: string
          project_id?: string
          proposal_id?: string | null
          rollback_to_deployment_id?: string | null
          status?: string
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deploy_healing_ci_gate_id_fkey"
            columns: ["ci_gate_id"]
            isOneToOne: false
            referencedRelation: "ci_gates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deploy_healing_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "deployments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deploy_healing_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deploy_healing_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "agent_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deploy_healing_rollback_to_deployment_id_fkey"
            columns: ["rollback_to_deployment_id"]
            isOneToOne: false
            referencedRelation: "deployments"
            referencedColumns: ["id"]
          },
        ]
      }
      deployments: {
        Row: {
          created_at: string
          created_by: string
          file_count: number
          id: string
          is_current: boolean
          label: string | null
          project_id: string
          slug: string
          snapshot: Json
          status: string
          version_num: number
        }
        Insert: {
          created_at?: string
          created_by: string
          file_count?: number
          id?: string
          is_current?: boolean
          label?: string | null
          project_id: string
          slug: string
          snapshot?: Json
          status?: string
          version_num: number
        }
        Update: {
          created_at?: string
          created_by?: string
          file_count?: number
          id?: string
          is_current?: boolean
          label?: string | null
          project_id?: string
          slug?: string
          snapshot?: Json
          status?: string
          version_num?: number
        }
        Relationships: [
          {
            foreignKeyName: "deployments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      device_pairings: {
        Row: {
          code: string
          created_at: string
          created_by: string
          device_model: string | null
          device_name: string | null
          expires_at: string
          id: string
          last_seen_at: string | null
          os_version: string | null
          paired_at: string | null
          platform: Database["public"]["Enums"]["device_platform"] | null
          project_id: string
          status: Database["public"]["Enums"]["pairing_status"]
          token_hash: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          device_model?: string | null
          device_name?: string | null
          expires_at?: string
          id?: string
          last_seen_at?: string | null
          os_version?: string | null
          paired_at?: string | null
          platform?: Database["public"]["Enums"]["device_platform"] | null
          project_id: string
          status?: Database["public"]["Enums"]["pairing_status"]
          token_hash: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          device_model?: string | null
          device_name?: string | null
          expires_at?: string
          id?: string
          last_seen_at?: string | null
          os_version?: string | null
          paired_at?: string | null
          platform?: Database["public"]["Enums"]["device_platform"] | null
          project_id?: string
          status?: Database["public"]["Enums"]["pairing_status"]
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_pairings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      e2e_tests: {
        Row: {
          created_at: string
          created_by: string
          error: string | null
          id: string
          last_run_report: Json
          last_run_status: string | null
          model: string | null
          name: string
          project_id: string
          spec_code: string
          spec_path: string
          status: string
          updated_at: string
          user_story: string
        }
        Insert: {
          created_at?: string
          created_by: string
          error?: string | null
          id?: string
          last_run_report?: Json
          last_run_status?: string | null
          model?: string | null
          name: string
          project_id: string
          spec_code?: string
          spec_path: string
          status?: string
          updated_at?: string
          user_story: string
        }
        Update: {
          created_at?: string
          created_by?: string
          error?: string | null
          id?: string
          last_run_report?: Json
          last_run_status?: string | null
          model?: string | null
          name?: string
          project_id?: string
          spec_code?: string
          spec_path?: string
          status?: string
          updated_at?: string
          user_story?: string
        }
        Relationships: [
          {
            foreignKeyName: "e2e_tests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      edge_cache_purges: {
        Row: {
          created_at: string
          detail: string | null
          finished_at: string | null
          id: string
          project_id: string
          purged_count: number
          requested_by: string | null
          scope: string
          started_at: string | null
          status: string
          targets: Json
          zone_id: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          finished_at?: string | null
          id?: string
          project_id: string
          purged_count?: number
          requested_by?: string | null
          scope: string
          started_at?: string | null
          status?: string
          targets?: Json
          zone_id: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          finished_at?: string | null
          id?: string
          project_id?: string
          purged_count?: number
          requested_by?: string | null
          scope?: string
          started_at?: string | null
          status?: string
          targets?: Json
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "edge_cache_purges_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edge_cache_purges_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "edge_cache_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      edge_cache_zones: {
        Row: {
          created_at: string
          default_ttl_seconds: number
          enabled: boolean
          hostname: string
          id: string
          name: string
          project_id: string
          rules: Json
          stale_while_revalidate_seconds: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_ttl_seconds?: number
          enabled?: boolean
          hostname: string
          id?: string
          name: string
          project_id: string
          rules?: Json
          stale_while_revalidate_seconds?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_ttl_seconds?: number
          enabled?: boolean
          hostname?: string
          id?: string
          name?: string
          project_id?: string
          rules?: Json
          stale_while_revalidate_seconds?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "edge_cache_zones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_assignments: {
        Row: {
          assigned_at: string
          experiment_id: string
          id: number
          project_id: string
          subject_id: string
          variant: string
        }
        Insert: {
          assigned_at?: string
          experiment_id: string
          id?: number
          project_id: string
          subject_id: string
          variant: string
        }
        Update: {
          assigned_at?: string
          experiment_id?: string
          id?: number
          project_id?: string
          subject_id?: string
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiment_assignments_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_exposures: {
        Row: {
          experiment_id: string
          id: number
          is_conversion: boolean
          metric_key: string
          metric_value: number
          occurred_at: string
          project_id: string
          properties: Json
          subject_id: string
          variant: string
        }
        Insert: {
          experiment_id: string
          id?: number
          is_conversion?: boolean
          metric_key: string
          metric_value?: number
          occurred_at?: string
          project_id: string
          properties?: Json
          subject_id: string
          variant: string
        }
        Update: {
          experiment_id?: string
          id?: number
          is_conversion?: boolean
          metric_key?: string
          metric_value?: number
          occurred_at?: string
          project_id?: string
          properties?: Json
          subject_id?: string
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiment_exposures_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_exposures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      experiments: {
        Row: {
          created_at: string
          created_by: string | null
          ended_at: string | null
          hypothesis: string | null
          id: string
          key: string
          primary_metric: string
          project_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["experiment_status"]
          traffic_percent: number
          updated_at: string
          variants: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          hypothesis?: string | null
          id?: string
          key: string
          primary_metric: string
          project_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["experiment_status"]
          traffic_percent?: number
          updated_at?: string
          variants?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          hypothesis?: string | null
          id?: string
          key?: string
          primary_metric?: string
          project_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["experiment_status"]
          traffic_percent?: number
          updated_at?: string
          variants?: Json
        }
        Relationships: [
          {
            foreignKeyName: "experiments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          id: string
          key: string
          project_id: string
          rollout_percent: number
          rules: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          key: string
          project_id: string
          rollout_percent?: number
          rules?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          key?: string
          project_id?: string
          rollout_percent?: number
          rules?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      hot_reload_bundles: {
        Row: {
          bundle_url: string | null
          changed_paths: Json
          checksum: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          notes: string | null
          project_id: string
          seq: number
          size_bytes: number
        }
        Insert: {
          bundle_url?: string | null
          changed_paths?: Json
          checksum: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          notes?: string | null
          project_id: string
          seq: number
          size_bytes?: number
        }
        Update: {
          bundle_url?: string | null
          changed_paths?: Json
          checksum?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          notes?: string | null
          project_id?: string
          seq?: number
          size_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "hot_reload_bundles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      hot_reload_clients: {
        Row: {
          client_token_hash: string
          created_at: string
          current_bundle_id: string | null
          device_label: string | null
          id: string
          last_seen_at: string
          last_seq: number
          platform: string
          project_id: string
          status: string
        }
        Insert: {
          client_token_hash: string
          created_at?: string
          current_bundle_id?: string | null
          device_label?: string | null
          id?: string
          last_seen_at?: string
          last_seq?: number
          platform: string
          project_id: string
          status?: string
        }
        Update: {
          client_token_hash?: string
          created_at?: string
          current_bundle_id?: string | null
          device_label?: string | null
          id?: string
          last_seen_at?: string
          last_seq?: number
          platform?: string
          project_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hot_reload_clients_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      hot_reload_events: {
        Row: {
          bundle_id: string | null
          client_id: string | null
          detail: string | null
          event: string
          id: number
          metadata: Json
          occurred_at: string
          project_id: string
        }
        Insert: {
          bundle_id?: string | null
          client_id?: string | null
          detail?: string | null
          event: string
          id?: number
          metadata?: Json
          occurred_at?: string
          project_id: string
        }
        Update: {
          bundle_id?: string | null
          client_id?: string | null
          detail?: string | null
          event?: string
          id?: number
          metadata?: Json
          occurred_at?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hot_reload_events_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "hot_reload_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hot_reload_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "hot_reload_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hot_reload_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      kms_key_audit: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          id: string
          key_id: string
          metadata: Json
          project_id: string
          reason: string | null
          version: number | null
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          id?: string
          key_id: string
          metadata?: Json
          project_id: string
          reason?: string | null
          version?: number | null
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          id?: string
          key_id?: string
          metadata?: Json
          project_id?: string
          reason?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kms_key_audit_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "kms_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kms_key_audit_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      kms_key_versions: {
        Row: {
          activated_at: string
          algorithm: string
          created_at: string
          destroyed_at: string | null
          fingerprint: string
          id: string
          key_id: string
          project_id: string
          public_jwk: Json | null
          retired_at: string | null
          state: string
          version: number
          wrapped_dek: string
        }
        Insert: {
          activated_at?: string
          algorithm: string
          created_at?: string
          destroyed_at?: string | null
          fingerprint: string
          id?: string
          key_id: string
          project_id: string
          public_jwk?: Json | null
          retired_at?: string | null
          state?: string
          version: number
          wrapped_dek: string
        }
        Update: {
          activated_at?: string
          algorithm?: string
          created_at?: string
          destroyed_at?: string | null
          fingerprint?: string
          id?: string
          key_id?: string
          project_id?: string
          public_jwk?: Json | null
          retired_at?: string | null
          state?: string
          version?: number
          wrapped_dek?: string
        }
        Relationships: [
          {
            foreignKeyName: "kms_key_versions_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "kms_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kms_key_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      kms_keys: {
        Row: {
          algorithm: string
          alias: string
          created_at: string
          created_by: string | null
          current_version: number
          id: string
          next_rotation_at: string
          project_id: string
          purpose: string
          rotation_days: number
          status: string
          updated_at: string
        }
        Insert: {
          algorithm?: string
          alias: string
          created_at?: string
          created_by?: string | null
          current_version?: number
          id?: string
          next_rotation_at?: string
          project_id: string
          purpose?: string
          rotation_days?: number
          status?: string
          updated_at?: string
        }
        Update: {
          algorithm?: string
          alias?: string
          created_at?: string
          created_by?: string | null
          current_version?: number
          id?: string
          next_rotation_at?: string
          project_id?: string
          purpose?: string
          rotation_days?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kms_keys_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          embedding: string | null
          id: string
          metadata: Json
          project_id: string
          source_path: string
          source_type: string
          tokens: number
          updated_at: string
        }
        Insert: {
          chunk_index?: number
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          project_id: string
          source_path: string
          source_type: string
          tokens?: number
          updated_at?: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          project_id?: string
          source_path?: string
          source_type?: string
          tokens?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          created_at: string
          id: string
          parts: Json
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parts?: Json
          project_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parts?: Json
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_builds: {
        Row: {
          artifact_path: string | null
          build_type: Database["public"]["Enums"]["mobile_build_type"]
          bundle_id: string | null
          created_at: string
          created_by: string | null
          duration_ms: number | null
          id: string
          log: string
          platform: Database["public"]["Enums"]["mobile_platform"]
          project_id: string
          signing_profile_id: string | null
          status: Database["public"]["Enums"]["mobile_build_status"]
          updated_at: string
          version_code: number
          version_name: string
        }
        Insert: {
          artifact_path?: string | null
          build_type?: Database["public"]["Enums"]["mobile_build_type"]
          bundle_id?: string | null
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          id?: string
          log?: string
          platform: Database["public"]["Enums"]["mobile_platform"]
          project_id: string
          signing_profile_id?: string | null
          status?: Database["public"]["Enums"]["mobile_build_status"]
          updated_at?: string
          version_code?: number
          version_name?: string
        }
        Update: {
          artifact_path?: string | null
          build_type?: Database["public"]["Enums"]["mobile_build_type"]
          bundle_id?: string | null
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          id?: string
          log?: string
          platform?: Database["public"]["Enums"]["mobile_platform"]
          project_id?: string
          signing_profile_id?: string | null
          status?: Database["public"]["Enums"]["mobile_build_status"]
          updated_at?: string
          version_code?: number
          version_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "mobile_builds_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_builds_signing_profile_id_fkey"
            columns: ["signing_profile_id"]
            isOneToOne: false
            referencedRelation: "mobile_signing_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_screens: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          layout: Json
          name: string
          position: number
          project_id: string
          route: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          layout?: Json
          name: string
          position?: number
          project_id: string
          route?: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          layout?: Json
          name?: string
          position?: number
          project_id?: string
          route?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mobile_screens_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_signing_profiles: {
        Row: {
          alias: string | null
          auth_tag: string
          ciphertext: string
          created_at: string
          created_by: string | null
          filename: string | null
          id: string
          iv: string
          last_four: string | null
          name: string
          platform: Database["public"]["Enums"]["mobile_platform"]
          project_id: string
          updated_at: string
        }
        Insert: {
          alias?: string | null
          auth_tag: string
          ciphertext: string
          created_at?: string
          created_by?: string | null
          filename?: string | null
          id?: string
          iv: string
          last_four?: string | null
          name: string
          platform: Database["public"]["Enums"]["mobile_platform"]
          project_id: string
          updated_at?: string
        }
        Update: {
          alias?: string | null
          auth_tag?: string
          ciphertext?: string
          created_at?: string
          created_by?: string | null
          filename?: string | null
          id?: string
          iv?: string
          last_four?: string | null
          name?: string
          platform?: Database["public"]["Enums"]["mobile_platform"]
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mobile_signing_profiles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      model_routes: {
        Row: {
          created_at: string
          enabled: boolean
          fallback_models: string[]
          id: string
          max_cost_usd: number
          preferred_model: string
          project_id: string
          quality_tier: string
          task_kind: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          fallback_models?: string[]
          id?: string
          max_cost_usd?: number
          preferred_model: string
          project_id: string
          quality_tier?: string
          task_kind: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          fallback_models?: string[]
          id?: string
          max_cost_usd?: number
          preferred_model?: string
          project_id?: string
          quality_tier?: string
          task_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_routes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      native_capabilities: {
        Row: {
          capability_key: string
          config: Json
          created_at: string
          enabled: boolean
          id: string
          justification: string | null
          platform: Database["public"]["Enums"]["cap_platform"]
          project_id: string
          risk: Database["public"]["Enums"]["cap_risk"]
          updated_at: string
          usage_description: string
        }
        Insert: {
          capability_key: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          justification?: string | null
          platform?: Database["public"]["Enums"]["cap_platform"]
          project_id: string
          risk?: Database["public"]["Enums"]["cap_risk"]
          updated_at?: string
          usage_description?: string
        }
        Update: {
          capability_key?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          justification?: string | null
          platform?: Database["public"]["Enums"]["cap_platform"]
          project_id?: string
          risk?: Database["public"]["Enums"]["cap_risk"]
          updated_at?: string
          usage_description?: string
        }
        Relationships: [
          {
            foreignKeyName: "native_capabilities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          project_id: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          project_id?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          project_id?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      on_device_model_builds: {
        Row: {
          artifact_path: string | null
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          manifest: Json
          model_id: string
          project_id: string
          quantization: string
          sha256: string | null
          signature: string | null
          size_bytes: number
          status: string
          target_platform: string
          updated_at: string
          version: string
        }
        Insert: {
          artifact_path?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          manifest?: Json
          model_id: string
          project_id: string
          quantization: string
          sha256?: string | null
          signature?: string | null
          size_bytes?: number
          status?: string
          target_platform: string
          updated_at?: string
          version: string
        }
        Update: {
          artifact_path?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          manifest?: Json
          model_id?: string
          project_id?: string
          quantization?: string
          sha256?: string | null
          signature?: string | null
          size_bytes?: number
          status?: string
          target_platform?: string
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "on_device_model_builds_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "on_device_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "on_device_model_builds_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      on_device_model_downloads: {
        Row: {
          build_id: string
          bytes_transferred: number
          created_at: string
          device_class: string | null
          duration_ms: number
          error: string | null
          id: string
          platform: string
          project_id: string
          success: boolean
        }
        Insert: {
          build_id: string
          bytes_transferred?: number
          created_at?: string
          device_class?: string | null
          duration_ms?: number
          error?: string | null
          id?: string
          platform: string
          project_id: string
          success?: boolean
        }
        Update: {
          build_id?: string
          bytes_transferred?: number
          created_at?: string
          device_class?: string | null
          duration_ms?: number
          error?: string | null
          id?: string
          platform?: string
          project_id?: string
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "on_device_model_downloads_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "on_device_model_builds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "on_device_model_downloads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      on_device_models: {
        Row: {
          base_size_mb: number
          capabilities: Json
          context_window: number
          created_at: string
          created_by: string | null
          default_quant: string
          family: string
          id: string
          license: string
          name: string
          platforms: string[]
          project_id: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          base_size_mb: number
          capabilities?: Json
          context_window?: number
          created_at?: string
          created_by?: string | null
          default_quant?: string
          family: string
          id?: string
          license?: string
          name: string
          platforms?: string[]
          project_id: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          base_size_mb?: number
          capabilities?: Json
          context_window?: number
          created_at?: string
          created_by?: string | null
          default_quant?: string
          family?: string
          id?: string
          license?: string
          name?: string
          platforms?: string[]
          project_id?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "on_device_models_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          plan_id: string
          seats: number
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          plan_id?: string
          seats?: number
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          plan_id?: string
          seats?: number
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      ota_bundles: {
        Row: {
          channel: string
          created_at: string
          id: string
          manifest: Json
          project_id: string
          published_by: string
          sha256: string
          size_bytes: number
          storage_path: string
          version: number
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          manifest?: Json
          project_id: string
          published_by: string
          sha256: string
          size_bytes: number
          storage_path: string
          version: number
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          manifest?: Json
          project_id?: string
          published_by?: string
          sha256?: string
          size_bytes?: number
          storage_path?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ota_bundles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      passkey_challenges: {
        Row: {
          challenge: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          project_id: string
          purpose: string
          rp_id: string
          user_id: string | null
        }
        Insert: {
          challenge: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          project_id: string
          purpose: string
          rp_id: string
          user_id?: string | null
        }
        Update: {
          challenge?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          project_id?: string
          purpose?: string
          rp_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "passkey_challenges_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      passkey_credentials: {
        Row: {
          aaguid: string | null
          backed_up: boolean
          counter: number
          created_at: string
          credential_id: string
          device_label: string | null
          id: string
          last_used_at: string | null
          project_id: string
          public_key: string
          revoked_at: string | null
          transports: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          aaguid?: string | null
          backed_up?: boolean
          counter?: number
          created_at?: string
          credential_id: string
          device_label?: string | null
          id?: string
          last_used_at?: string | null
          project_id: string
          public_key: string
          revoked_at?: string | null
          transports?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          aaguid?: string | null
          backed_up?: boolean
          counter?: number
          created_at?: string
          credential_id?: string
          device_label?: string | null
          id?: string
          last_used_at?: string | null
          project_id?: string
          public_key?: string
          revoked_at?: string | null
          transports?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "passkey_credentials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          event_id: string
          event_type: string
          id: string
          payload: Json
          processed_at: string
          provider: string
          subscription_id: string | null
          user_id: string | null
        }
        Insert: {
          event_id: string
          event_type: string
          id?: string
          payload: Json
          processed_at?: string
          provider?: string
          subscription_id?: string | null
          user_id?: string | null
        }
        Update: {
          event_id?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string
          provider?: string
          subscription_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          ai_message_quota: number
          created_at: string
          features: Json
          id: string
          interval: string
          is_active: boolean
          name: string
          price_inr_paise: number
          razorpay_plan_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          ai_message_quota?: number
          created_at?: string
          features?: Json
          id: string
          interval?: string
          is_active?: boolean
          name: string
          price_inr_paise?: number
          razorpay_plan_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          ai_message_quota?: number
          created_at?: string
          features?: Json
          id?: string
          interval?: string
          is_active?: boolean
          name?: string
          price_inr_paise?: number
          razorpay_plan_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      preview_sessions: {
        Row: {
          bundle_url: string | null
          bundle_version: string | null
          created_at: string
          error: string | null
          event_count: number
          id: string
          last_event_at: string | null
          pairing_id: string | null
          project_id: string
          status: Database["public"]["Enums"]["preview_status"]
          updated_at: string
        }
        Insert: {
          bundle_url?: string | null
          bundle_version?: string | null
          created_at?: string
          error?: string | null
          event_count?: number
          id?: string
          last_event_at?: string | null
          pairing_id?: string | null
          project_id: string
          status?: Database["public"]["Enums"]["preview_status"]
          updated_at?: string
        }
        Update: {
          bundle_url?: string | null
          bundle_version?: string | null
          created_at?: string
          error?: string | null
          event_count?: number
          id?: string
          last_event_at?: string | null
          pairing_id?: string | null
          project_id?: string
          status?: Database["public"]["Enums"]["preview_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "preview_sessions_pairing_id_fkey"
            columns: ["pairing_id"]
            isOneToOne: false
            referencedRelation: "device_pairings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preview_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_comments: {
        Row: {
          anchor_path: string | null
          author_id: string
          body: string
          created_at: string
          id: string
          mentions: string[]
          project_id: string
          resolved: boolean
          updated_at: string
        }
        Insert: {
          anchor_path?: string | null
          author_id: string
          body: string
          created_at?: string
          id?: string
          mentions?: string[]
          project_id: string
          resolved?: boolean
          updated_at?: string
        }
        Update: {
          anchor_path?: string | null
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          mentions?: string[]
          project_id?: string
          resolved?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_domains: {
        Row: {
          created_at: string
          created_by: string
          hostname: string
          id: string
          last_checked_at: string | null
          project_id: string
          region: string
          status: string
          verification_token: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          hostname: string
          id?: string
          last_checked_at?: string | null
          project_id: string
          region?: string
          status?: string
          verification_token: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          hostname?: string
          id?: string
          last_checked_at?: string | null
          project_id?: string
          region?: string
          status?: string
          verification_token?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_domains_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_files: {
        Row: {
          content: string
          created_at: string
          id: string
          language: string | null
          path: string
          project_id: string
          updated_at: string
          version: number
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          language?: string | null
          path: string
          project_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          language?: string | null
          path?: string
          project_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          project_id: string
          role: Database["public"]["Enums"]["project_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          project_id: string
          role?: Database["public"]["Enums"]["project_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          project_id?: string
          role?: Database["public"]["Enums"]["project_role"]
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
      project_residency: {
        Row: {
          backup_zone: string | null
          created_at: string
          dataclass: Json
          encryption_mode: string
          id: string
          pinned_at: string
          primary_zone: string
          project_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          backup_zone?: string | null
          created_at?: string
          dataclass?: Json
          encryption_mode?: string
          id?: string
          pinned_at?: string
          primary_zone: string
          project_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          backup_zone?: string | null
          created_at?: string
          dataclass?: Json
          encryption_mode?: string
          id?: string
          pinned_at?: string
          primary_zone?: string
          project_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_residency_backup_zone_fkey"
            columns: ["backup_zone"]
            isOneToOne: false
            referencedRelation: "residency_zones"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "project_residency_primary_zone_fkey"
            columns: ["primary_zone"]
            isOneToOne: false
            referencedRelation: "residency_zones"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "project_residency_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_secrets: {
        Row: {
          auth_tag: string
          ciphertext: string
          created_at: string
          created_by: string
          id: string
          iv: string
          last_four: string
          name: string
          project_id: string
          updated_at: string
        }
        Insert: {
          auth_tag: string
          ciphertext: string
          created_at?: string
          created_by: string
          id?: string
          iv: string
          last_four?: string
          name: string
          project_id: string
          updated_at?: string
        }
        Update: {
          auth_tag?: string
          ciphertext?: string
          created_at?: string
          created_by?: string
          id?: string
          iv?: string
          last_four?: string
          name?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_secrets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_versions: {
        Row: {
          created_at: string
          file_count: number
          id: string
          label: string | null
          owner_id: string
          project_id: string
          snapshot: Json
        }
        Insert: {
          created_at?: string
          file_count?: number
          id?: string
          label?: string | null
          owner_id: string
          project_id: string
          snapshot: Json
        }
        Update: {
          created_at?: string
          file_count?: number
          id?: string
          label?: string | null
          owner_id?: string
          project_id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "project_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          initial_prompt: string | null
          is_public: boolean
          name: string
          owner_id: string
          public_share_token: string | null
          slug: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          initial_prompt?: string | null
          is_public?: boolean
          name: string
          owner_id: string
          public_share_token?: string | null
          slug: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          initial_prompt?: string | null
          is_public?: boolean
          name?: string
          owner_id?: string
          public_share_token?: string | null
          slug?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      push_campaigns: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          data: Json
          error: string | null
          fail_count: number
          id: string
          project_id: string
          scheduled_at: string | null
          sent_at: string | null
          sent_count: number
          status: Database["public"]["Enums"]["push_status"]
          target: Database["public"]["Enums"]["push_target"]
          target_value: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          data?: Json
          error?: string | null
          fail_count?: number
          id?: string
          project_id: string
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: Database["public"]["Enums"]["push_status"]
          target?: Database["public"]["Enums"]["push_target"]
          target_value?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          error?: string | null
          fail_count?: number
          id?: string
          project_id?: string
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: Database["public"]["Enums"]["push_status"]
          target?: Database["public"]["Enums"]["push_target"]
          target_value?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_campaigns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      push_devices: {
        Row: {
          created_at: string
          device_label: string | null
          id: string
          last_seen_at: string
          platform: Database["public"]["Enums"]["mobile_platform"]
          project_id: string
          token: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device_label?: string | null
          id?: string
          last_seen_at?: string
          platform: Database["public"]["Enums"]["mobile_platform"]
          project_id: string
          token: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device_label?: string | null
          id?: string
          last_seen_at?: string
          platform?: Database["public"]["Enums"]["mobile_platform"]
          project_id?: string
          token?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_devices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_reports: {
        Row: {
          created_at: string
          created_by: string
          findings: Json
          id: string
          kind: string
          project_id: string
          score: number
          status: string
          summary: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          findings?: Json
          id?: string
          kind: string
          project_id: string
          score: number
          status: string
          summary?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          findings?: Json
          id?: string
          kind?: string
          project_id?: string
          score?: number
          status?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quality_reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          user_id: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          user_id: string
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      release_notes: {
        Row: {
          breaking: Json
          channel: string
          created_at: string
          created_by: string | null
          highlights: Json
          id: string
          language: string
          platform: string
          project_id: string
          published_at: string | null
          source_commits: Json
          status: string
          summary_md: string
          tone: string
          updated_at: string
          version: string
        }
        Insert: {
          breaking?: Json
          channel?: string
          created_at?: string
          created_by?: string | null
          highlights?: Json
          id?: string
          language?: string
          platform?: string
          project_id: string
          published_at?: string | null
          source_commits?: Json
          status?: string
          summary_md?: string
          tone?: string
          updated_at?: string
          version: string
        }
        Update: {
          breaking?: Json
          channel?: string
          created_at?: string
          created_by?: string | null
          highlights?: Json
          id?: string
          language?: string
          platform?: string
          project_id?: string
          published_at?: string | null
          source_commits?: Json
          status?: string
          summary_md?: string
          tone?: string
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "release_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      residency_audit: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          from_zone: string | null
          id: string
          metadata: Json
          project_id: string
          reason: string | null
          to_zone: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          from_zone?: string | null
          id?: string
          metadata?: Json
          project_id: string
          reason?: string | null
          to_zone?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          from_zone?: string | null
          id?: string
          metadata?: Json
          project_id?: string
          reason?: string | null
          to_zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "residency_audit_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      residency_zones: {
        Row: {
          code: string
          compliance: Json
          country: string
          created_at: string
          display_name: string
          enabled: boolean
          id: string
          provider: string
        }
        Insert: {
          code: string
          compliance?: Json
          country: string
          created_at?: string
          display_name: string
          enabled?: boolean
          id?: string
          provider: string
        }
        Update: {
          code?: string
          compliance?: Json
          country?: string
          created_at?: string
          display_name?: string
          enabled?: boolean
          id?: string
          provider?: string
        }
        Relationships: []
      }
      review_prompts: {
        Row: {
          cooldown_days: number
          copy: Json
          created_at: string
          enabled: boolean
          id: string
          min_sessions: number
          name: string
          project_id: string
          sentiment_threshold: number
          trigger: string
          trigger_event: string | null
          updated_at: string
        }
        Insert: {
          cooldown_days?: number
          copy?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          min_sessions?: number
          name: string
          project_id: string
          sentiment_threshold?: number
          trigger: string
          trigger_event?: string | null
          updated_at?: string
        }
        Update: {
          cooldown_days?: number
          copy?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          min_sessions?: number
          name?: string
          project_id?: string
          sentiment_threshold?: number
          trigger?: string
          trigger_event?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_prompts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      review_responses: {
        Row: {
          app_version: string | null
          comment: string | null
          created_at: string
          id: string
          platform: string | null
          project_id: string
          prompt_id: string | null
          rating: number
          routed_to: string
          sentiment: number | null
          subject_id: string
        }
        Insert: {
          app_version?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          platform?: string | null
          project_id: string
          prompt_id?: string | null
          rating: number
          routed_to: string
          sentiment?: number | null
          subject_id: string
        }
        Update: {
          app_version?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          platform?: string | null
          project_id?: string
          prompt_id?: string | null
          rating?: number
          routed_to?: string
          sentiment?: number | null
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_responses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_responses_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "review_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      scim_audit: {
        Row: {
          created_at: string
          detail: Json
          external_id: string | null
          id: string
          method: string
          org_id: string
          path: string
          status_code: number
          token_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: Json
          external_id?: string | null
          id?: string
          method: string
          org_id: string
          path: string
          status_code: number
          token_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: Json
          external_id?: string | null
          id?: string
          method?: string
          org_id?: string
          path?: string
          status_code?: number
          token_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scim_audit_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scim_audit_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "scim_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      scim_provisioned_users: {
        Row: {
          active: boolean
          created_at: string
          display_name: string | null
          email: string
          external_id: string
          id: string
          org_id: string
          raw: Json
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name?: string | null
          email: string
          external_id: string
          id?: string
          org_id: string
          raw?: Json
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string | null
          email?: string
          external_id?: string
          id?: string
          org_id?: string
          raw?: Json
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scim_provisioned_users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      scim_tokens: {
        Row: {
          created_at: string
          created_by: string
          id: string
          last_used_at: string | null
          name: string
          org_id: string
          revoked_at: string | null
          token_hash: string
          token_prefix: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          last_used_at?: string | null
          name: string
          org_id: string
          revoked_at?: string | null
          token_hash: string
          token_prefix: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          last_used_at?: string | null
          name?: string
          org_id?: string
          revoked_at?: string | null
          token_hash?: string
          token_prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "scim_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      siem_deliveries: {
        Row: {
          attempt: number
          audit_id: string | null
          created_at: string
          destination_id: string
          error: string | null
          event_name: string
          http_code: number | null
          id: string
          latency_ms: number | null
          org_id: string
          response_snippet: string | null
          status: Database["public"]["Enums"]["siem_delivery_status"]
        }
        Insert: {
          attempt?: number
          audit_id?: string | null
          created_at?: string
          destination_id: string
          error?: string | null
          event_name: string
          http_code?: number | null
          id?: string
          latency_ms?: number | null
          org_id: string
          response_snippet?: string | null
          status?: Database["public"]["Enums"]["siem_delivery_status"]
        }
        Update: {
          attempt?: number
          audit_id?: string | null
          created_at?: string
          destination_id?: string
          error?: string | null
          event_name?: string
          http_code?: number | null
          id?: string
          latency_ms?: number | null
          org_id?: string
          response_snippet?: string | null
          status?: Database["public"]["Enums"]["siem_delivery_status"]
        }
        Relationships: [
          {
            foreignKeyName: "siem_deliveries_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audit_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siem_deliveries_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "siem_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siem_deliveries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      siem_destinations: {
        Row: {
          created_at: string
          created_by: string
          enabled: boolean
          endpoint_url: string
          event_filter: string[]
          id: string
          last_delivery_at: string | null
          last_error: string | null
          last_status:
            | Database["public"]["Enums"]["siem_delivery_status"]
            | null
          name: string
          org_id: string
          provider: Database["public"]["Enums"]["siem_provider"]
          secret_hash: string
          secret_hint: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          enabled?: boolean
          endpoint_url: string
          event_filter?: string[]
          id?: string
          last_delivery_at?: string | null
          last_error?: string | null
          last_status?:
            | Database["public"]["Enums"]["siem_delivery_status"]
            | null
          name: string
          org_id: string
          provider: Database["public"]["Enums"]["siem_provider"]
          secret_hash: string
          secret_hint?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          enabled?: boolean
          endpoint_url?: string
          event_filter?: string[]
          id?: string
          last_delivery_at?: string | null
          last_error?: string | null
          last_status?:
            | Database["public"]["Enums"]["siem_delivery_status"]
            | null
          name?: string
          org_id?: string
          provider?: Database["public"]["Enums"]["siem_provider"]
          secret_hash?: string
          secret_hint?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "siem_destinations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sso_connections: {
        Row: {
          attribute_map: Json
          certificate: string
          created_at: string
          created_by: string
          display_name: string
          domain: string
          entity_id: string
          id: string
          last_error: string | null
          last_tested_at: string | null
          org_id: string
          provider: Database["public"]["Enums"]["sso_provider"]
          sso_url: string
          status: Database["public"]["Enums"]["sso_status"]
          updated_at: string
        }
        Insert: {
          attribute_map?: Json
          certificate: string
          created_at?: string
          created_by?: string
          display_name: string
          domain: string
          entity_id: string
          id?: string
          last_error?: string | null
          last_tested_at?: string | null
          org_id: string
          provider: Database["public"]["Enums"]["sso_provider"]
          sso_url: string
          status?: Database["public"]["Enums"]["sso_status"]
          updated_at?: string
        }
        Update: {
          attribute_map?: Json
          certificate?: string
          created_at?: string
          created_by?: string
          display_name?: string
          domain?: string
          entity_id?: string
          id?: string
          last_error?: string | null
          last_tested_at?: string | null
          org_id?: string
          provider?: Database["public"]["Enums"]["sso_provider"]
          sso_url?: string
          status?: Database["public"]["Enums"]["sso_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sso_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      store_listings: {
        Row: {
          age_rating: string
          category: string | null
          checklist: Json
          contact_email: string | null
          created_at: string
          full_description: string
          id: string
          keywords: string[]
          platform: Database["public"]["Enums"]["mobile_platform"]
          privacy_url: string | null
          project_id: string
          screenshots: Json
          short_description: string
          status: string
          subtitle: string
          support_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          age_rating?: string
          category?: string | null
          checklist?: Json
          contact_email?: string | null
          created_at?: string
          full_description?: string
          id?: string
          keywords?: string[]
          platform: Database["public"]["Enums"]["mobile_platform"]
          privacy_url?: string | null
          project_id: string
          screenshots?: Json
          short_description?: string
          status?: string
          subtitle?: string
          support_url?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          age_rating?: string
          category?: string | null
          checklist?: Json
          contact_email?: string | null
          created_at?: string
          full_description?: string
          id?: string
          keywords?: string[]
          platform?: Database["public"]["Enums"]["mobile_platform"]
          privacy_url?: string | null
          project_id?: string
          screenshots?: Json
          short_description?: string
          status?: string
          subtitle?: string
          support_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_listings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      store_submission_events: {
        Row: {
          actor_id: string | null
          created_at: string
          detail: string | null
          event: string
          id: string
          metadata: Json
          project_id: string
          status: string | null
          submission_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          detail?: string | null
          event: string
          id?: string
          metadata?: Json
          project_id: string
          status?: string | null
          submission_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          detail?: string | null
          event?: string
          id?: string
          metadata?: Json
          project_id?: string
          status?: string | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_submission_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_submission_events_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "store_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      store_submissions: {
        Row: {
          build_id: string | null
          created_at: string
          created_by: string | null
          external_submission_id: string | null
          id: string
          listing_id: string | null
          platform: string
          project_id: string
          release_notes: string | null
          reviewed_at: string | null
          reviewer_notes: string | null
          status: string
          submitted_at: string | null
          track: string
          updated_at: string
          validation_report: Json
          version_code: string | null
          version_name: string
        }
        Insert: {
          build_id?: string | null
          created_at?: string
          created_by?: string | null
          external_submission_id?: string | null
          id?: string
          listing_id?: string | null
          platform: string
          project_id: string
          release_notes?: string | null
          reviewed_at?: string | null
          reviewer_notes?: string | null
          status?: string
          submitted_at?: string | null
          track?: string
          updated_at?: string
          validation_report?: Json
          version_code?: string | null
          version_name: string
        }
        Update: {
          build_id?: string | null
          created_at?: string
          created_by?: string | null
          external_submission_id?: string | null
          id?: string
          listing_id?: string | null
          platform?: string
          project_id?: string
          release_notes?: string | null
          reviewed_at?: string | null
          reviewer_notes?: string | null
          status?: string
          submitted_at?: string | null
          track?: string
          updated_at?: string
          validation_report?: Json
          version_code?: string | null
          version_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_submissions_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "mobile_builds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_submissions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "store_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_submissions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          metadata: Json
          plan_id: string
          razorpay_customer_id: string | null
          razorpay_subscription_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json
          plan_id: string
          razorpay_customer_id?: string | null
          razorpay_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json
          plan_id?: string
          razorpay_customer_id?: string | null
          razorpay_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      symbol_maps: {
        Row: {
          app_version: string
          build_number: string | null
          content: string
          created_at: string
          file_name: string
          id: string
          kind: string
          platform: string
          project_id: string
          size_bytes: number
          uploaded_by: string | null
        }
        Insert: {
          app_version: string
          build_number?: string | null
          content: string
          created_at?: string
          file_name: string
          id?: string
          kind: string
          platform: string
          project_id: string
          size_bytes?: number
          uploaded_by?: string | null
        }
        Update: {
          app_version?: string
          build_number?: string | null
          content?: string
          created_at?: string
          file_name?: string
          id?: string
          kind?: string
          platform?: string
          project_id?: string
          size_bytes?: number
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "symbol_maps_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      template_listings: {
        Row: {
          author_id: string
          created_at: string
          currency: string
          id: string
          payout_pct: number
          price_minor: number
          status: string
          template_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          created_at?: string
          currency?: string
          id?: string
          payout_pct?: number
          price_minor: number
          status?: string
          template_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          created_at?: string
          currency?: string
          id?: string
          payout_pct?: number
          price_minor?: number
          status?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_listings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: true
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_payouts: {
        Row: {
          author_id: string
          created_at: string
          currency: string
          fee_minor: number
          gross_minor: number
          id: string
          net_minor: number
          paid_at: string | null
          purchase_id: string
          status: string
        }
        Insert: {
          author_id: string
          created_at?: string
          currency: string
          fee_minor: number
          gross_minor: number
          id?: string
          net_minor: number
          paid_at?: string | null
          purchase_id: string
          status?: string
        }
        Update: {
          author_id?: string
          created_at?: string
          currency?: string
          fee_minor?: number
          gross_minor?: number
          id?: string
          net_minor?: number
          paid_at?: string | null
          purchase_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_payouts_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: true
            referencedRelation: "template_purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      template_purchases: {
        Row: {
          amount_minor: number
          author_id: string
          buyer_id: string
          created_at: string
          currency: string
          id: string
          intent_id: string
          listing_id: string
          provider: string
          receipt_url: string | null
          refunded: boolean
          status: string
          template_id: string
          updated_at: string
        }
        Insert: {
          amount_minor: number
          author_id: string
          buyer_id: string
          created_at?: string
          currency: string
          id?: string
          intent_id: string
          listing_id: string
          provider?: string
          receipt_url?: string | null
          refunded?: boolean
          status?: string
          template_id: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          author_id?: string
          buyer_id?: string
          created_at?: string
          currency?: string
          id?: string
          intent_id?: string
          listing_id?: string
          provider?: string
          receipt_url?: string | null
          refunded?: boolean
          status?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_purchases_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "template_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_purchases_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_ratings: {
        Row: {
          created_at: string
          id: string
          rating: number
          review: string | null
          template_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          rating: number
          review?: string | null
          template_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          rating?: number
          review?: string | null
          template_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_ratings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          author_id: string | null
          avg_rating: number
          category: string
          created_at: string
          description: string
          files: Json
          id: string
          initial_prompt: string | null
          is_active: boolean
          is_featured: boolean
          is_public: boolean
          name: string
          rating_count: number
          slug: string
          sort_order: number
          thumbnail_url: string | null
          updated_at: string
          use_count: number
        }
        Insert: {
          author_id?: string | null
          avg_rating?: number
          category?: string
          created_at?: string
          description?: string
          files?: Json
          id?: string
          initial_prompt?: string | null
          is_active?: boolean
          is_featured?: boolean
          is_public?: boolean
          name: string
          rating_count?: number
          slug: string
          sort_order?: number
          thumbnail_url?: string | null
          updated_at?: string
          use_count?: number
        }
        Update: {
          author_id?: string | null
          avg_rating?: number
          category?: string
          created_at?: string
          description?: string
          files?: Json
          id?: string
          initial_prompt?: string | null
          is_active?: boolean
          is_featured?: boolean
          is_public?: boolean
          name?: string
          rating_count?: number
          slug?: string
          sort_order?: number
          thumbnail_url?: string | null
          updated_at?: string
          use_count?: number
        }
        Relationships: []
      }
      usage_aggregates: {
        Row: {
          computed_at: string
          day: string
          event_count: number
          id: string
          metric_key: string
          org_id: string
          total: number
        }
        Insert: {
          computed_at?: string
          day: string
          event_count?: number
          id?: string
          metric_key: string
          org_id: string
          total?: number
        }
        Update: {
          computed_at?: string
          day?: string
          event_count?: number
          id?: string
          metric_key?: string
          org_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_aggregates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          idempotency_key: string | null
          metric_key: string
          occurred_at: string
          org_id: string
          project_id: string | null
          properties: Json
          quantity: number
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          metric_key: string
          occurred_at?: string
          org_id: string
          project_id?: string | null
          properties?: Json
          quantity: number
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          metric_key?: string
          occurred_at?: string
          org_id?: string
          project_id?: string | null
          properties?: Json
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_invoices: {
        Row: {
          created_at: string
          currency: string
          generated_at: string
          generated_by: string | null
          id: string
          line_items: Json
          org_id: string
          paid_at: string | null
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          line_items?: Json
          org_id: string
          paid_at?: string | null
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          line_items?: Json
          org_id?: string
          paid_at?: string | null
          period_end?: string
          period_start?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_ledger: {
        Row: {
          cost_cents: number
          created_at: string
          id: string
          kind: string
          meta: Json
          project_id: string | null
          run_id: string | null
          tokens: number
          user_id: string
        }
        Insert: {
          cost_cents?: number
          created_at?: string
          id?: string
          kind: string
          meta?: Json
          project_id?: string | null
          run_id?: string | null
          tokens?: number
          user_id: string
        }
        Update: {
          cost_cents?: number
          created_at?: string
          id?: string
          kind?: string
          meta?: Json
          project_id?: string | null
          run_id?: string | null
          tokens?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_ledger_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_ledger_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_meters: {
        Row: {
          aggregation: Database["public"]["Enums"]["usage_aggregation"]
          created_at: string
          display_name: string
          enabled: boolean
          hard_cap: number | null
          id: string
          included_quota: number
          metric_key: string
          org_id: string
          price_per_unit_cents: number
          unit: string
          updated_at: string
        }
        Insert: {
          aggregation?: Database["public"]["Enums"]["usage_aggregation"]
          created_at?: string
          display_name: string
          enabled?: boolean
          hard_cap?: number | null
          id?: string
          included_quota?: number
          metric_key: string
          org_id: string
          price_per_unit_cents?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          aggregation?: Database["public"]["Enums"]["usage_aggregation"]
          created_at?: string
          display_name?: string
          enabled?: boolean
          hard_cap?: number | null
          id?: string
          included_quota?: number
          metric_key?: string
          org_id?: string
          price_per_unit_cents?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_meters_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string
          notes: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          notes?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          notes?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      zt_access_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          issued_to_user_id: string
          label: string
          last_used_at: string | null
          org_id: string
          resource_pattern: string
          revoked_at: string | null
          scope: string[]
          token_hash: string
          token_hint: string
          use_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          issued_to_user_id: string
          label: string
          last_used_at?: string | null
          org_id: string
          resource_pattern: string
          revoked_at?: string | null
          scope?: string[]
          token_hash: string
          token_hint: string
          use_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          issued_to_user_id?: string
          label?: string
          last_used_at?: string | null
          org_id?: string
          resource_pattern?: string
          revoked_at?: string | null
          scope?: string[]
          token_hash?: string
          token_hint?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "zt_access_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      zt_decisions: {
        Row: {
          action: string
          context: Json
          decision: Database["public"]["Enums"]["policy_effect"]
          id: string
          matched_policy_id: string | null
          occurred_at: string
          org_id: string
          reason: string | null
          resource: string
          subject_id: string | null
          subject_kind: string
        }
        Insert: {
          action: string
          context?: Json
          decision: Database["public"]["Enums"]["policy_effect"]
          id?: string
          matched_policy_id?: string | null
          occurred_at?: string
          org_id: string
          reason?: string | null
          resource: string
          subject_id?: string | null
          subject_kind?: string
        }
        Update: {
          action?: string
          context?: Json
          decision?: Database["public"]["Enums"]["policy_effect"]
          id?: string
          matched_policy_id?: string | null
          occurred_at?: string
          org_id?: string
          reason?: string | null
          resource?: string
          subject_id?: string | null
          subject_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "zt_decisions_matched_policy_id_fkey"
            columns: ["matched_policy_id"]
            isOneToOne: false
            referencedRelation: "zt_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zt_decisions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      zt_policies: {
        Row: {
          action_pattern: string
          conditions: Json
          created_at: string
          created_by: string | null
          description: string | null
          effect: Database["public"]["Enums"]["policy_effect"]
          enabled: boolean
          id: string
          name: string
          org_id: string
          priority: number
          resource_pattern: string
          subject: Json
          updated_at: string
        }
        Insert: {
          action_pattern: string
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          effect?: Database["public"]["Enums"]["policy_effect"]
          enabled?: boolean
          id?: string
          name: string
          org_id: string
          priority?: number
          resource_pattern: string
          subject?: Json
          updated_at?: string
        }
        Update: {
          action_pattern?: string
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          effect?: Database["public"]["Enums"]["policy_effect"]
          enabled?: boolean
          id?: string
          name?: string
          org_id?: string
          priority?: number
          resource_pattern?: string
          subject?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "zt_policies_org_id_fkey"
            columns: ["org_id"]
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
      analytics_daily_counts: {
        Args: {
          _from: string
          _project_id: string
          _to: string
          _user_id: string
        }
        Returns: {
          count: number
          day: string
          event_name: string
        }[]
      }
      check_rate_limit: {
        Args: {
          _bucket: string
          _max: number
          _user_id: string
          _window: string
        }
        Returns: boolean
      }
      experiment_results: {
        Args: { _exp_id: string; _user_id: string }
        Returns: {
          conversion_rate: number
          conversions: number
          exposures: number
          total_value: number
          variant: string
        }[]
      }
      get_user_plan: {
        Args: { _user_id: string }
        Returns: {
          ai_message_quota: number
          plan_id: string
          status: string
        }[]
      }
      has_org_role: {
        Args: {
          _min_role: Database["public"]["Enums"]["org_role"]
          _org_id: string
          _user_id: string
        }
        Returns: boolean
      }
      has_project_role: {
        Args: {
          _min_role: Database["public"]["Enums"]["project_role"]
          _project_id: string
          _user_id: string
        }
        Returns: boolean
      }
      match_knowledge: {
        Args: {
          _k?: number
          _project_id: string
          _query: string
          _user_id: string
        }
        Returns: {
          content: string
          id: string
          similarity: number
          source_path: string
          source_type: string
        }[]
      }
      next_deployment_version: { Args: { _slug: string }; Returns: number }
      usage_period_totals: {
        Args: { _from: string; _org_id: string; _to: string }
        Returns: {
          event_count: number
          metric_key: string
          total: number
        }[]
      }
    }
    Enums: {
      a2a_agent_status: "active" | "paused" | "revoked"
      a2a_message_status:
        | "pending"
        | "delivered"
        | "acknowledged"
        | "failed"
        | "rejected"
      canary_status:
        | "draft"
        | "active"
        | "paused"
        | "promoting"
        | "promoted"
        | "rolled_back"
        | "aborted"
      cap_platform: "ios" | "android" | "both"
      cap_risk: "low" | "medium" | "high"
      device_platform: "ios" | "android" | "web"
      experiment_status:
        | "draft"
        | "running"
        | "paused"
        | "completed"
        | "archived"
      gate_kind: "lighthouse" | "smoke" | "a11y"
      gate_status: "pending" | "passed" | "failed" | "error"
      guardrail_action: "block" | "warn" | "redact"
      guardrail_severity: "low" | "medium" | "high" | "critical"
      guardrail_type:
        | "pii_redact"
        | "prompt_injection"
        | "toxicity"
        | "topic_filter"
        | "rate_cap"
        | "secret_leak"
      invoice_status: "draft" | "issued" | "paid" | "void"
      mobile_build_status: "queued" | "building" | "success" | "failed"
      mobile_build_type: "debug" | "release"
      mobile_platform: "ios" | "android"
      org_role: "owner" | "admin" | "editor" | "viewer"
      pairing_status: "pending" | "paired" | "revoked" | "expired"
      policy_effect: "allow" | "deny"
      preview_status: "idle" | "connecting" | "live" | "error"
      project_role: "owner" | "editor" | "viewer"
      push_status: "draft" | "scheduled" | "sending" | "sent" | "failed"
      push_target: "all" | "user" | "segment"
      siem_delivery_status: "pending" | "success" | "failed" | "retrying"
      siem_provider: "splunk_hec" | "datadog" | "generic_webhook"
      skill_kind: "mcp" | "http_tool" | "prompt"
      skill_visibility: "private" | "public"
      sso_provider:
        | "okta"
        | "azure_ad"
        | "google_workspace"
        | "onelogin"
        | "jumpcloud"
        | "generic_saml"
      sso_status: "pending" | "active" | "disabled" | "error"
      usage_aggregation: "sum" | "max" | "last" | "count"
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
      a2a_agent_status: ["active", "paused", "revoked"],
      a2a_message_status: [
        "pending",
        "delivered",
        "acknowledged",
        "failed",
        "rejected",
      ],
      canary_status: [
        "draft",
        "active",
        "paused",
        "promoting",
        "promoted",
        "rolled_back",
        "aborted",
      ],
      cap_platform: ["ios", "android", "both"],
      cap_risk: ["low", "medium", "high"],
      device_platform: ["ios", "android", "web"],
      experiment_status: [
        "draft",
        "running",
        "paused",
        "completed",
        "archived",
      ],
      gate_kind: ["lighthouse", "smoke", "a11y"],
      gate_status: ["pending", "passed", "failed", "error"],
      guardrail_action: ["block", "warn", "redact"],
      guardrail_severity: ["low", "medium", "high", "critical"],
      guardrail_type: [
        "pii_redact",
        "prompt_injection",
        "toxicity",
        "topic_filter",
        "rate_cap",
        "secret_leak",
      ],
      invoice_status: ["draft", "issued", "paid", "void"],
      mobile_build_status: ["queued", "building", "success", "failed"],
      mobile_build_type: ["debug", "release"],
      mobile_platform: ["ios", "android"],
      org_role: ["owner", "admin", "editor", "viewer"],
      pairing_status: ["pending", "paired", "revoked", "expired"],
      policy_effect: ["allow", "deny"],
      preview_status: ["idle", "connecting", "live", "error"],
      project_role: ["owner", "editor", "viewer"],
      push_status: ["draft", "scheduled", "sending", "sent", "failed"],
      push_target: ["all", "user", "segment"],
      siem_delivery_status: ["pending", "success", "failed", "retrying"],
      siem_provider: ["splunk_hec", "datadog", "generic_webhook"],
      skill_kind: ["mcp", "http_tool", "prompt"],
      skill_visibility: ["private", "public"],
      sso_provider: [
        "okta",
        "azure_ad",
        "google_workspace",
        "onelogin",
        "jumpcloud",
        "generic_saml",
      ],
      sso_status: ["pending", "active", "disabled", "error"],
      usage_aggregation: ["sum", "max", "last", "count"],
    },
  },
} as const
