// Server-side data access. Each function issues ONE paginated SELECT per table
// (never dozens of per-widget calls) and returns typed rows. Every fetch is
// resilient: if a table is missing or RLS/permission blocks it, we return an
// empty set plus an `available: false` flag so the UI can show "not yet
// live"/"unavailable" instead of crashing.
import "server-only";
import { supabaseAdmin } from "./supabaseAdmin";
import type {
  ProfileRow,
  TripRow,
  DailyQuestRow,
  QuestTemplateRow,
  UserXpRow,
  EventRow,
  EventParticipantRow,
  PartyRow,
  PartyMemberRow,
  DirectMessageRow,
  GroupMessageRow,
  GroupConversationRow,
  PlaceRow,
  OsmCacheRow,
  CarRow,
  PaymentRow,
  UserLocationRow,
} from "./types";

export interface TableResult<T> {
  rows: T[];
  available: boolean;
  error?: string;
}

const PAGE = 1000;
const MAX_ROWS = 100_000; // safety cap for an internal tool

/** Paginate a SELECT until exhausted (or the safety cap is hit). */
async function fetchAll<T>(
  table: string,
  columns: string,
  order?: { column: string; ascending?: boolean },
): Promise<TableResult<T>> {
  const sb = supabaseAdmin();
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    let q = sb.from(table).select(columns).range(from, from + PAGE - 1);
    if (order) q = q.order(order.column, { ascending: order.ascending ?? false });
    const { data, error } = await q;
    if (error) {
      // First page failing => treat the whole table as unavailable.
      if (from === 0) return { rows: [], available: false, error: error.message };
      break;
    }
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return { rows: out, available: true };
}

// ── Per-table fetchers ───────────────────────────────────────────────
export const getProfiles = () =>
  fetchAll<ProfileRow>(
    "profiles",
    "id,name,role,verification_status,driver_verification_status,company_verification_status,country,created_at,verified_at",
  );

export const getTrips = () =>
  fetchAll<TripRow>(
    "trips",
    "id,user_id,distance_km,duration_seconds,avg_speed_kmh,top_speed_kmh,destination_name,destination_lat,destination_lng,xp_earned,created_at,completed_at",
  );

export const getDailyQuests = () =>
  fetchAll<DailyQuestRow>(
    "daily_quests",
    "id,user_id,template_id,difficulty,category,status,target,progress,xp_reward,title,created_at,completed_at",
  );

export const getQuestTemplates = () =>
  fetchAll<QuestTemplateRow>(
    "quest_templates",
    "id,title_template,difficulty,category,objective_type",
  );

export const getUserXp = () =>
  fetchAll<UserXpRow>("user_xp", "user_id,level,total_xp");

export const getEvents = () =>
  fetchAll<EventRow>(
    "events",
    "id,creator_id,event_type,status,country,created_at,starts_at",
  );

export const getEventParticipants = () =>
  fetchAll<EventParticipantRow>(
    "event_participants",
    "event_id,user_id,role,joined_at",
  );

export const getParties = () =>
  fetchAll<PartyRow>(
    "parties",
    "id,leader_id,name,visibility,max_members,created_at",
  );

export const getPartyMembers = () =>
  fetchAll<PartyMemberRow>("party_members", "party_id,user_id,status,created_at");

export const getDirectMessages = () =>
  fetchAll<DirectMessageRow>("direct_messages", "id,sender_id,created_at");

export const getGroupMessages = () =>
  fetchAll<GroupMessageRow>(
    "group_messages",
    "id,conversation_id,sender_id,created_at",
  );

export const getGroupConversations = () =>
  fetchAll<GroupConversationRow>("group_conversations", "id,kind");

export const getPlaces = () =>
  fetchAll<PlaceRow>(
    "places",
    "id,category,status,submitted_by_user_id,created_at",
  );

export const getOsmCache = () =>
  fetchAll<OsmCacheRow>("osm_places_cache", "category,payload");

export const getCars = () =>
  fetchAll<CarRow>("car_collections", "id,user_id,make,model,category,created_at");

// Live map presence. Feeds the POV Social density gate (a Social POV script
// needs real drivers on the map to be honest), so it reads only the freshness
// columns — never coordinates.
export const getUserLocations = () =>
  fetchAll<UserLocationRow>("user_locations", "user_id,is_online,updated_at");

export const getPayments = () =>
  fetchAll<PaymentRow>(
    "payment_transactions",
    "id,amount,currency,status,created_at",
  );
