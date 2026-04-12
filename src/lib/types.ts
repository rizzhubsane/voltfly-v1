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
      hubs: {
        Row: {
          id: string
          name: string
          address: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          address?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          address?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          id: string
          name: string
          email: string
          role: string
          hub_id: string | null
          is_active: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          email: string
          role: string
          hub_id?: string | null
          is_active?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          email?: string
          role?: string
          hub_id?: string | null
          is_active?: boolean | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_users_hub_id_fkey"
            columns: ["hub_id"]
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          }
        ]
      }
      riders: {
        Row: {
          id: string
          name: string
          phone_1: string
          phone_2: string | null
          status: string
          hub_id: string | null
          driver_id: string | null
          wallet_balance?: number | null
          outstanding_balance: number
          payment_status: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          phone_1: string
          phone_2?: string | null
          status?: string
          hub_id?: string | null
          driver_id?: string | null
          wallet_balance?: number | null
          outstanding_balance?: number
          payment_status?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          phone_1?: string
          phone_2?: string | null
          status?: string
          hub_id?: string | null
          driver_id?: string | null
          wallet_balance?: number | null
          outstanding_balance?: number
          payment_status?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "riders_hub_id_fkey"
            columns: ["hub_id"]
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          }
        ]
      }
      kyc: {
        Row: {
          id: string
          rider_id: string
          aadhaar_number: string | null
          pan_number: string | null
          address_local: string | null
          address_village: string | null
          photo_url: string | null
          pcc_url: string | null
          aadhaar_front_url: string | null
          aadhaar_back_url: string | null
          pan_url: string | null
          ref1_name: string | null
          ref1_phone: string | null
          ref2_name: string | null
          ref2_phone: string | null
          ref3_name: string | null
          ref3_phone: string | null
          kyc_status: string
          rejection_reason: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          rider_id: string
          aadhaar_number?: string | null
          pan_number?: string | null
          address_local?: string | null
          address_village?: string | null
          photo_url?: string | null
          pcc_url?: string | null
          aadhaar_front_url?: string | null
          aadhaar_back_url?: string | null
          pan_url?: string | null
          ref1_name?: string | null
          ref1_phone?: string | null
          ref2_name?: string | null
          ref2_phone?: string | null
          ref3_name?: string | null
          ref3_phone?: string | null
          kyc_status?: string
          rejection_reason?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          rider_id?: string
          aadhaar_number?: string | null
          pan_number?: string | null
          address_local?: string | null
          address_village?: string | null
          photo_url?: string | null
          pcc_url?: string | null
          aadhaar_front_url?: string | null
          aadhaar_back_url?: string | null
          pan_url?: string | null
          ref1_name?: string | null
          ref1_phone?: string | null
          ref2_name?: string | null
          ref2_phone?: string | null
          ref3_name?: string | null
          ref3_phone?: string | null
          kyc_status?: string
          rejection_reason?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kyc_rider_id_fkey"
            columns: ["rider_id"]
            referencedRelation: "riders"
            referencedColumns: ["id"]
          }
        ]
      }
      vehicles: {
        Row: {
          id: string
          vehicle_id: string | null  // format: VFELXXXX
          chassis_number: string
          hub_id: string | null
          assigned_rider_id: string | null
          assigned_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          vehicle_id?: string | null
          chassis_number: string
          hub_id?: string | null
          assigned_rider_id?: string | null
          assigned_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          vehicle_id?: string | null
          chassis_number?: string
          hub_id?: string | null
          assigned_rider_id?: string | null
          assigned_at?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_hub_id_fkey"
            columns: ["hub_id"]
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_assigned_rider_id_fkey"
            columns: ["assigned_rider_id"]
            referencedRelation: "riders"
            referencedColumns: ["id"]
          }
        ]
      }

      vehicle_handover_checklists: {
        Row: {
          id: string
          vehicle_id: string
          rider_id: string
          type: 'assignment' | 'return'
          charger: boolean
          battery: boolean
          key: boolean
          mirrors: boolean
          foot_mat: boolean
          odometer_reading: string | null
          motor_number: string | null
          helmet: boolean
          lights: boolean
          horn: boolean
          indicators: boolean
          tyres: boolean
          tools_kit: boolean
          notes: string | null
          recorded_by: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          vehicle_id: string
          rider_id: string
          type: 'assignment' | 'return'
          charger?: boolean
          battery?: boolean
          key?: boolean
          mirrors?: boolean
          foot_mat?: boolean
          odometer_reading?: string | null
          motor_number?: string | null
          helmet?: boolean
          lights?: boolean
          horn?: boolean
          indicators?: boolean
          tyres?: boolean
          tools_kit?: boolean
          notes?: string | null
          recorded_by?: string | null
          created_at?: string | null
        }
        Update: {
          charger?: boolean
          battery?: boolean
          key?: boolean
          mirrors?: boolean
          foot_mat?: boolean
          odometer_reading?: string | null
          motor_number?: string | null
          helmet?: boolean
          lights?: boolean
          horn?: boolean
          indicators?: boolean
          tyres?: boolean
          tools_kit?: boolean
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_handover_checklists_vehicle_id_fkey"
            columns: ["vehicle_id"]
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_handover_checklists_rider_id_fkey"
            columns: ["rider_id"]
            referencedRelation: "riders"
            referencedColumns: ["id"]
          }
        ]
      }

      // ─────────────────────────────────────────────────────────────────────
      // Voltfly operational tables (minimal typing for app usage)
      // ─────────────────────────────────────────────────────────────────────

      payments: {
        Row: {
          id: string
          rider_id: string
          amount: number
          plan_type: string | null
          method: string | null
          status: string
          razorpay_payment_id: string | null
          due_date: string | null
          paid_at: string | null
          recorded_by: string | null
          notes: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          rider_id: string
          amount: number
          plan_type?: string | null
          method?: string | null
          status?: string
          razorpay_payment_id?: string | null
          due_date?: string | null
          paid_at?: string | null
          recorded_by?: string | null
          notes?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          rider_id?: string
          amount?: number
          plan_type?: string | null
          method?: string | null
          status?: string
          razorpay_payment_id?: string | null
          due_date?: string | null
          paid_at?: string | null
          recorded_by?: string | null
          notes?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_rider_id_fkey"
            columns: ["rider_id"]
            referencedRelation: "riders"
            referencedColumns: ["id"]
          }
        ]
      }

      security_deposits: {
        Row: {
          id: string
          rider_id: string
          amount_paid: number | null
          razorpay_payment_id: string | null
          status: string | null
          deductions: Json | null
          refund_amount: number | null
          refunded_at: string | null
          refund_razorpay_id: string | null
          processed_at: string | null
          processed_by: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          rider_id: string
          amount_paid?: number | null
          razorpay_payment_id?: string | null
          status?: string | null
          deductions?: Json | null
          refund_amount?: number | null
          refunded_at?: string | null
          refund_razorpay_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          rider_id?: string
          amount_paid?: number | null
          razorpay_payment_id?: string | null
          status?: string | null
          deductions?: Json | null
          refund_amount?: number | null
          refunded_at?: string | null
          refund_razorpay_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_deposits_rider_id_fkey"
            columns: ["rider_id"]
            referencedRelation: "riders"
            referencedColumns: ["id"]
          }
        ]
      }

      batteries: {
        Row: {
          id: string
          current_rider_id: string
          driver_id: string | null
          battery_id: string | null
          status: string | null
          last_action_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          current_rider_id: string
          driver_id?: string | null
          battery_id?: string | null
          status?: string | null
          last_action_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          current_rider_id?: string
          driver_id?: string | null
          battery_id?: string | null
          status?: string | null
          last_action_at?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batteries_current_rider_id_fkey"
            columns: ["current_rider_id"]
            referencedRelation: "riders"
            referencedColumns: ["id"]
          }
        ]
      }

      battery_assignments: {
        Row: {
          id: string
          current_rider_id: string
          driver_id: string | null
          battery_id: string | null
          status: string | null
          last_action_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          current_rider_id: string
          driver_id?: string | null
          battery_id?: string | null
          status?: string | null
          last_action_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          current_rider_id?: string
          driver_id?: string | null
          battery_id?: string | null
          status?: string | null
          last_action_at?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "battery_assignments_current_rider_id_fkey"
            columns: ["current_rider_id"]
            referencedRelation: "riders"
            referencedColumns: ["id"]
          }
        ]
      }

      battery_events_log: {
        Row: {
          id: string
          rider_id: string
          driver_id: string | null
          action: string
          trigger_type: string | null
          triggered_by: string | null
          reason: string | null
          upgrid_response: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          rider_id: string
          driver_id?: string | null
          action: string
          trigger_type?: string | null
          triggered_by?: string | null
          reason?: string | null
          upgrid_response?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          rider_id?: string
          driver_id?: string | null
          action?: string
          trigger_type?: string | null
          triggered_by?: string | null
          reason?: string | null
          upgrid_response?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "battery_events_log_rider_id_fkey"
            columns: ["rider_id"]
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battery_events_log_triggered_by_fkey"
            columns: ["triggered_by"]
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          }
        ]
      }
      service_requests: {
        Row: {
          id: string
          rider_id: string
          type: string | null
          description: string | null
          issue_description: string | null
          vehicle_id: string | null
          photo_url: string | null
          status: string
          payment_status: string | null
          total_parts_cost: number | null
          charges: number | null
          resolution_notes: string | null
          created_at: string | null
          resolved_at: string | null
        }
        Insert: {
          id?: string
          rider_id: string
          type?: string | null
          description?: string | null
          issue_description?: string | null
          vehicle_id?: string | null
          photo_url?: string | null
          status?: string
          payment_status?: string | null
          total_parts_cost?: number | null
          charges?: number | null
          resolution_notes?: string | null
          created_at?: string | null
          resolved_at?: string | null
        }
        Update: {
          id?: string
          rider_id?: string
          type?: string | null
          description?: string | null
          issue_description?: string | null
          vehicle_id?: string | null
          photo_url?: string | null
          status?: string
          payment_status?: string | null
          total_parts_cost?: number | null
          charges?: number | null
          resolution_notes?: string | null
          created_at?: string | null
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_rider_id_fkey"
            columns: ["rider_id"]
            referencedRelation: "riders"
            referencedColumns: ["id"]
          }
        ]
      }
      notifications: {
        Row: {
          id: string
          rider_id: string | null
          type: string
          title: string
          message: string
          channel: string
          created_at: string | null
        }
        Insert: {
          id?: string
          rider_id?: string | null
          type?: string
          title?: string
          message?: string
          channel?: string
          created_at?: string | null
        }
        Update: {
          id?: string
          rider_id?: string | null
          type?: string
          title?: string
          message?: string
          channel?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_rider_id_fkey"
            columns: ["rider_id"]
            referencedRelation: "riders"
            referencedColumns: ["id"]
          }
        ]
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

export type Hub = Database['public']['Tables']['hubs']['Row'];
export type AdminUser = Database['public']['Tables']['admin_users']['Row'];
export type Rider = Database['public']['Tables']['riders']['Row'];
export type KycRecord = Database['public']['Tables']['kyc']['Row'];
export type KycWithRider = KycRecord & { riders: Rider };
export type RiderWithHub = Rider & { hubs: Pick<Hub, 'name'> | null; vehicle_id?: string | null; driver_id?: string | null };
export type Vehicle = Database['public']['Tables']['vehicles']['Row'];
export type VehicleWithDetails = Vehicle & { 
  hubs: Pick<Hub, 'name'> | null; 
  riders: Pick<Rider, 'name'> | null;
};

export type HandoverChecklist = Database['public']['Tables']['vehicle_handover_checklists']['Row'];

// Checklist item keys (boolean fields only)
export const HANDOVER_ITEMS = [
  { key: 'charger',   label: 'Charger' },
  { key: 'key',       label: 'Key' },
  { key: 'mirrors',   label: 'Mirrors' },
  { key: 'foot_mat',  label: 'Foot Mat' },
  { key: 'helmet',    label: 'Helmet' },
  { key: 'lights',    label: 'Lights' },
  { key: 'horn',      label: 'Horn' },
  { key: 'indicators',label: 'Indicators' },
  { key: 'tyres',     label: 'Tyres' },
  { key: 'tools_kit', label: 'Tools Kit' },
] as const;

export type HandoverItemKey = typeof HANDOVER_ITEMS[number]['key'];

export interface HandoverFormState {
  charger: boolean;
  battery: boolean;
  key: boolean;
  mirrors: boolean;
  foot_mat: boolean;
  odometer_reading: string;
  motor_number: string;
  helmet: boolean;
  lights: boolean;
  horn: boolean;
  indicators: boolean;
  tyres: boolean;
  tools_kit: boolean;
  notes: string;
}

export const DEFAULT_HANDOVER_FORM: HandoverFormState = {
  charger: false,
  battery: false,
  key: false,
  mirrors: false,
  foot_mat: false,
  odometer_reading: '',
  motor_number: '',
  helmet: false,
  lights: false,
  horn: false,
  indicators: false,
  tyres: false,
  tools_kit: false,
  notes: '',
};

// ─── Rider Detail (get_rider_full response) ─────────────────────────────────

export interface VehicleInfo {
  id: string;
  vehicle_id: string | null;
  chassis_number: string | null;
  status: string | null;
  assigned_at: string | null;
}

export interface BatteryInfo {
  id: string;
  driver_id: string | null;
  battery_id: string | null;
  deployment_date: string | null;
  status: string | null;
}

export interface PaymentRecord {
  id: string;
  rider_id: string;
  amount: number;
  plan_type: string | null;
  payment_method: string | null;
  payment_date: string | null;
  status: string;
  notes: string | null;
  created_at: string | null;
}

export interface ServiceRequest {
  id: string;
  rider_id: string;
  type: string | null;
  description: string | null;
  issue_description: string | null;
  status: string;
  parts_selected: { name: string; price: number }[] | null;
  total_parts_cost: number | null;
  created_at: string | null;
  resolved_at: string | null;
}

export interface BatteryEvent {
  id: string;
  rider_id: string;
  event_type: string; // 'block' | 'unblock'
  trigger_type: string | null; // 'manual' | 'auto_payment' | etc.
  triggered_by: string | null;
  created_at: string | null;
}

export interface RiderFullData {
  rider: Rider & { hubs: Pick<Hub, 'name'> | null };
  kyc: KycRecord | null;
  vehicle: VehicleInfo | null;
  payments: PaymentRecord[];
  service_requests: ServiceRequest[];
}

