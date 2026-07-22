import React, { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { ArrowLeft, Crown, Sparkles, MessageCircle, Globe, Lock } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { useParty, Party, PartyMember } from "@/hooks/usePartyStore";
import { supabase } from "@/lib/supabase";

export default function ConvoyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { party: myParty, getPartyDetail, joinParty } = useParty();

  const [convoy, setConvoy] = useState<Party | null>(null);
  const [roster, setRoster] = useState<PartyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const isMine = myParty?.id === id;
  const isMember = isMine || roster.some((m) => m.user_id === user?.id);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { party: p, members } = await getPartyDetail(id);
    setConvoy(p);
    setRoster(members);
    setLoading(false);

    const { data: convo } = await supabase
      .from("group_conversations")
      .select("id")
      .eq("party_id", id)
      .maybeSingle();
    setConversationId(convo?.id ?? null);
  }, [id, getPartyDetail]);

  useEffect(() => { load(); }, [load]);

  const handleJoin = useCallback(async () => {
    if (!id) return;
    setJoining(true);
    setJoinError(null);
    const result = await joinParty(id);
    setJoining(false);
    if (!result.ok) setJoinError(result.message ?? "Couldn't join");
    else load();
  }, [id, joinParty, load]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={StyleSheet.absoluteFill} />
        <ActivityIndicator color="#3B82F6" style={{ marginTop: insets.top + 140 }} />
      </View>
    );
  }

  if (!convoy) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={StyleSheet.absoluteFill} />
        <View style={[styles.emptyState, { paddingTop: insets.top + 140 }]}>
          <Text style={styles.emptyTitle}>Convoy not found</Text>
        </View>
      </View>
    );
  }

  const full = convoy.max_members > 0 && roster.length >= convoy.max_members;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={StyleSheet.absoluteFill} />

      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>{convoy.name}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.headerCard}>
          <View style={[styles.colorDot, { backgroundColor: convoy.color }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.convoyName}>{convoy.name}</Text>
            <View style={styles.visRow}>
              {convoy.visibility === "public" ? (
                <Globe size={12} color="#8A8A9A" />
              ) : (
                <Lock size={12} color="#8A8A9A" />
              )}
              <Text style={styles.rowSub}>
                {convoy.visibility === "public" ? "Open convoy" : "Invite only"} · {roster.length}{convoy.max_members > 0 ? `/${convoy.max_members}` : ""} inside
              </Text>
            </View>
          </View>
        </View>

        {!!convoy.description && <Text style={styles.blurb}>{convoy.description}</Text>}

        {joinError && <Text style={styles.errorText}>{joinError}</Text>}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Who's inside</Text>
          {roster.map((m) => (
            <View key={m.id} style={[styles.memberRow, m.status === "accepted" && styles.memberRowSpecial]}>
              <View style={[styles.avatar, m.status === "accepted" && { borderColor: convoy.color, borderWidth: 2 }]}>
                {m.avatar ? (
                  <Image source={{ uri: m.avatar }} style={styles.avatarImg} />
                ) : (
                  <Text style={styles.avatarText}>{m.name[0]?.toUpperCase()}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{m.name}{m.user_id === user?.id ? " (You)" : ""}</Text>
                <Text style={styles.rowSub}>Level {m.level}</Text>
              </View>
              {m.role === "leader" ? (
                <Crown size={16} color="#FFD700" />
              ) : (
                <Sparkles size={15} color={convoy.color} />
              )}
            </View>
          ))}
        </View>

        {conversationId && isMember && (
          <TouchableOpacity
            style={styles.chatBtn}
            onPress={() => router.push(`/messages/group/${conversationId}` as any)}
            activeOpacity={0.85}
          >
            <MessageCircle size={16} color="#FFFFFF" />
            <Text style={styles.chatBtnText}>Open convoy chat</Text>
          </TouchableOpacity>
        )}

        {!isMember && convoy.visibility === "public" && (
          <TouchableOpacity
            style={[styles.joinBtn, full && { opacity: 0.5 }]}
            onPress={handleJoin}
            disabled={full || joining}
            activeOpacity={0.85}
          >
            {joining ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.joinBtnText}>{full ? "Convoy full" : "Join convoy"}</Text>}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060609" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  topTitle: { fontSize: 16, fontWeight: "800", color: "#FFFFFF", flex: 1, textAlign: "center", marginHorizontal: 8 },

  emptyState: { flex: 1, alignItems: "center", gap: 8, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },

  headerCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", padding: 16, marginBottom: 12 },
  colorDot: { width: 40, height: 40, borderRadius: 20 },
  convoyName: { fontSize: 18, fontWeight: "800", color: "#FFFFFF" },
  visRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  blurb: { color: "#8A8A9A", fontSize: 13, lineHeight: 19, marginBottom: 18 },

  section: { marginBottom: 22 },
  sectionLabel: { fontSize: 12, fontWeight: "800", color: "#8A8A9A", letterSpacing: 0.6, marginBottom: 10, textTransform: "uppercase" },

  memberRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  memberRowSpecial: { backgroundColor: "rgba(255,255,255,0.02)", borderRadius: 12, paddingHorizontal: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(59,130,246,0.14)", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: 40, height: 40, borderRadius: 20 },
  avatarText: { fontSize: 15, fontWeight: "800", color: "#3B82F6" },
  rowName: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  rowSub: { fontSize: 12, color: "#8A8A9A" },

  errorText: { color: "#EF4444", fontSize: 13, fontWeight: "600", marginBottom: 12 },

  chatBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#3B82F6", borderRadius: 14, paddingVertical: 14, marginBottom: 12 },
  chatBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },

  joinBtn: { backgroundColor: "#3B82F6", borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  joinBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
});
