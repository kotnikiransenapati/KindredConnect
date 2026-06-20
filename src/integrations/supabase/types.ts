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
    }
    Enums: {
      a2a_agent_status: "active" | "paused" | "revoked"
      a2a_message_status:
        | "pending"
        | "delivered"
        | "acknowledged"
        | "failed"
        | "rejected"
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
      mobile_build_status: "queued" | "building" | "success" | "failed"
      mobile_build_type: "debug" | "release"
      mobile_platform: "ios" | "android"
      org_role: "owner" | "admin" | "editor" | "viewer"
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
      mobile_build_status: ["queued", "building", "success", "failed"],
      mobile_build_type: ["debug", "release"],
      mobile_platform: ["ios", "android"],
      org_role: ["owner", "admin", "editor", "viewer"],
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
    },
  },
} as const
