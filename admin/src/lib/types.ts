// Raw row shapes (only the columns the dashboard reads). Field names mirror the
// actual Supabase schema in expo/*.sql.

export interface ProfileRow {
  id: string;
  name: string | null;
  role: "customer" | "driver" | "company" | null;
  verification_status: string | null;
  driver_verification_status: string | null;
  company_verification_status: string | null;
  country: string | null;
  created_at: string | null;
  verified_at: string | null;
}

export interface TripRow {
  id: string;
  user_id: string;
  distance_km: number | null;
  duration_seconds: number | null;
  avg_speed_kmh: number | null;
  top_speed_kmh: number | null;
  destination_name: string | null;
  destination_lat: number | null;
  destination_lng: number | null;
  xp_earned: number | null;
  created_at: string | null;
  completed_at: string | null;
}

export interface DailyQuestRow {
  id: string;
  user_id: string;
  template_id: string | null;
  difficulty: "easy" | "medium" | "hard" | null;
  category: string | null;
  status: "active" | "completed" | "expired" | null;
  target: number | null;
  progress: number | null;
  xp_reward: number | null;
  title: string | null;
  created_at: string | null;
  completed_at: string | null;
}

export interface QuestTemplateRow {
  id: string;
  title_template: string;
  difficulty: string;
  category: string;
  objective_type: string;
}

export interface UserXpRow {
  user_id: string;
  level: number | null;
  total_xp: number | null;
}

export interface EventRow {
  id: string;
  creator_id: string;
  event_type: "meetup" | "convoy" | "cruise" | "race" | null;
  status: string | null;
  country: string | null;
  created_at: string | null;
  starts_at: string | null;
}

export interface EventParticipantRow {
  event_id: string;
  user_id: string;
  role: string | null;
  joined_at: string | null;
}

export interface PartyRow {
  id: string;
  leader_id: string;
  name: string | null;
  visibility: string | null;
  max_members: number | null;
  created_at: string | null;
}

export interface PartyMemberRow {
  party_id: string;
  user_id: string;
  status: string | null;
  created_at: string | null;
}

export interface DirectMessageRow {
  id: string;
  sender_id: string;
  created_at: string | null;
}

export interface GroupMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  created_at: string | null;
}

export interface GroupConversationRow {
  id: string;
  kind: "event" | "convoy" | null;
}

export interface PlaceRow {
  id: string;
  category: string | null;
  status: string | null;
  submitted_by_user_id: string | null;
  created_at: string | null;
}

export interface OsmCacheRow {
  category: string | null;
  payload: unknown;
}

export interface CarRow {
  id: string;
  user_id: string;
  make: string | null;
  model: string | null;
  category: string | null;
  created_at: string | null;
}

export interface PaymentRow {
  id: string;
  amount: number | null;
  currency: string | null;
  status: string | null;
  created_at: string | null;
}
