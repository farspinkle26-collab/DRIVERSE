import React, { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, Stack } from "expo-router";
import { ArrowLeft, Crown, UserPlus, LogOut, X, Check, Radio, Flag } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { useParty } from "@/hooks/usePartyStore";
import { supabase } from "@/lib/supabase";

interface Contact {
  id: string;
  name: string;
  avatar?: string;
}

export default function ConvoyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const {
    party,
    members,
    invites,
    loading,
    isLeader,
    createParty,
    inviteFriend,
    acceptInvite,
    declineInvite,
    leaveParty,
    kickMember,
    publicParties,
    loadingPublicParties,
    browsePublicParties,
    joinParty,
  } = useParty();

  const [nameDraft, setNameDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [friends, setFriends] = useState<Contact[]>([]);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const loadFriends = useCallback(async () => {
    if (!user) return;
    const { data: sent } = await supabase
      .from("friends")
      .select("friend_id, profiles!friends_friend_id_fkey(name, avatar)")
      .eq("user_id", user.id)
      .eq("status", "accepted");
    const { data: received } = await supabase
      .from("friends")
      .select("user_id, profiles!friends_user_id_fkey(name, avatar)")
      .eq("friend_id", user.id)
      .eq("status", "accepted");
    const list: Contact[] = [
      ...(sent ?? []).map((r: any) => ({ id: r.friend_id, name: r.profiles?.name ?? "Driver", avatar: r.profiles?.avatar })),
      ...(received ?? []).map((r: any) => ({ id: r.user_id, name: r.profiles?.name ?? "Driver", avatar: r.profiles?.avatar })),
    ];
    setFriends(list);
  }, [user]);

  useEffect(() => {
    if (isAuthenticated) loadFriends();
  }, [isAuthenticated, loadFriends]);

  useEffect(() => {
    if (isAuthenticated && !party) browsePublicParties();
  }, [isAuthenticated, party, browsePublicParties]);

  const handleJoinPublic = useCallback(async (convoyId: string) => {
    setJoiningId(convoyId);
    setJoinError(null);
    const result = await joinParty(convoyId);
    setJoiningId(null);
    if (!result.ok) setJoinError(result.message ?? "Couldn't join that convoy");
  }, [joinParty]);

  const memberIds = new Set(members.map((m) => m.user_id));

  const handleCreate = useCallback(async () => {
    if (!nameDraft.trim() || creating) return;
    setCreating(true);
    const ok = await createParty(nameDraft.trim());
    setCreating(false);
    if (ok) setNameDraft("");
    else Alert.alert("Couldn't create convoy", "Please try again.");
  }, [nameDraft, creating, createParty]);

  const handleInvite = useCallback(async (friendId: string, friendName: string) => {
    setInvitingId(friendId);
    const result = await inviteFriend(friendId);
    setInvitingId(null);
    if (!result.ok) Alert.alert("Couldn't Invite", result.message ?? "Something went wrong.");
    else Alert.alert("Invite Sent!", `${friendName} was invited to join your convoy.`);
  }, [inviteFriend]);

  const handleLeave = useCallback(() => {
    if (!party) return;
    const isSolo = members.length <= 1;
    Alert.alert(
      isLeader ? "Disband Convoy?" : "Leave Convoy?",
      isLeader && !isSolo
        ? "You're the leader — leaving disbands the convoy for everyone."
        : "You can rejoin later if someone invites you again.",
      [
        { text: "Cancel", style: "cancel" },
        { text: isLeader ? "Disband" : "Leave", style: "destructive", onPress: () => leaveParty() },
      ]
    );
  }, [party, isLeader, members.length, leaveParty]);

  const handleKick = useCallback((memberId: string, name: string) => {
    Alert.alert("Remove from Convoy?", `${name} will be removed from the convoy.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => kickMember(memberId) },
    ]);
  }, [kickMember]);

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={StyleSheet.absoluteFill} />
        <View style={[styles.emptyState, { paddingTop: insets.top + 140 }]}>
          <Crown size={44} color="#3A3A4E" />
          <Text style={styles.emptyTitle}>Sign in to start a convoy</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={StyleSheet.absoluteFill} />

      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Convoy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.blurb}>
          Ride together — a convoy marks your friends with a special colored ring on the map so you can track each other in real time.
        </Text>

        {/* ═══ PENDING INVITES ═══ */}
        {invites.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Convoy Invites</Text>
            {invites.map((inv) => (
              <View key={inv.id} style={styles.inviteCard}>
                <View style={[styles.colorDot, { backgroundColor: inv.party_color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{inv.party_name}</Text>
                  <Text style={styles.rowSub}>Led by {inv.leader_name}</Text>
                </View>
                <TouchableOpacity style={styles.acceptBtn} onPress={() => acceptInvite(inv.party_id)}>
                  <Check size={16} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.declineBtn} onPress={() => declineInvite(inv.party_id)}>
                  <X size={16} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {loading ? (
          <ActivityIndicator color="#FF3B30" style={{ marginTop: 24 }} />
        ) : !party ? (
          <View style={styles.section}>
            <View style={styles.createCard}>
              <Radio size={30} color="#FF3B30" />
              <Text style={styles.createTitle}>Start a Convoy</Text>
              <Text style={styles.rowSub}>Name it, then invite friends from here or from the map.</Text>
              <TextInput
                style={styles.createInput}
                placeholder="Convoy name"
                placeholderTextColor="#5A5A6E"
                value={nameDraft}
                onChangeText={setNameDraft}
                maxLength={30}
              />
              <TouchableOpacity
                style={[styles.createBtn, !nameDraft.trim() && { opacity: 0.5 }]}
                onPress={handleCreate}
                disabled={!nameDraft.trim() || creating}
                activeOpacity={0.85}
              >
                {creating ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.createBtnText}>Create Convoy</Text>}
              </TouchableOpacity>
            </View>

            {joinError && <Text style={[styles.rowSub, { color: "#EF4444", marginTop: 12 }]}>{joinError}</Text>}

            <Text style={[styles.sectionLabel, { marginTop: 22 }]}>Browse Open Convoys</Text>
            {loadingPublicParties && publicParties.length === 0 ? (
              <ActivityIndicator color="#FF3B30" style={{ marginTop: 8 }} />
            ) : publicParties.length === 0 ? (
              <Text style={styles.rowSub}>No open convoys yet — start your own above.</Text>
            ) : (
              publicParties.map((c) => {
                const full = c.max_members > 0 && c.member_count >= c.max_members;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.inviteCard}
                    activeOpacity={0.8}
                    onPress={() => router.push(`/convoy/${c.id}` as any)}
                  >
                    <View style={[styles.colorDot, { backgroundColor: c.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{c.name}</Text>
                      <Text style={styles.rowSub}>
                        {c.member_count}{c.max_members > 0 ? `/${c.max_members}` : ""} members · Led by {c.leader_name}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.acceptBtn, full && { opacity: 0.5 }]}
                      onPress={() => handleJoinPublic(c.id)}
                      disabled={full || joiningId === c.id}
                    >
                      {joiningId === c.id ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Flag size={14} color="#FFFFFF" />}
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <View style={styles.convoyHeaderCard}>
                <View style={[styles.colorDot, { backgroundColor: party.color, width: 40, height: 40, borderRadius: 20 }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.convoyName}>{party.name}</Text>
                  <Text style={styles.rowSub}>{members.length} member{members.length === 1 ? "" : "s"}</Text>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Members</Text>
              {members.map((m) => (
                <View key={m.id} style={styles.memberRow}>
                  <TouchableOpacity
                    style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}
                    activeOpacity={0.7}
                    onPress={() => router.push(`/user/${m.user_id}` as any)}
                  >
                    <View style={styles.avatar}>
                      {m.avatar ? <Image source={{ uri: m.avatar }} style={styles.avatarImg} /> : <Text style={styles.avatarText}>{m.name[0]?.toUpperCase()}</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{m.name}{m.user_id === user?.id ? " (You)" : ""}</Text>
                      <Text style={styles.rowSub}>Level {m.level}{m.status === "invited" ? " · Invited" : ""}</Text>
                    </View>
                  </TouchableOpacity>
                  {m.role === "leader" && <Crown size={16} color="#FFD700" />}
                  {isLeader && m.user_id !== user?.id && (
                    <TouchableOpacity onPress={() => handleKick(m.user_id, m.name)} style={{ marginLeft: 10 }}>
                      <X size={16} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Invite Friends</Text>
              {friends.filter((f) => !memberIds.has(f.id)).length === 0 ? (
                <Text style={styles.rowSub}>All your friends are already in this convoy.</Text>
              ) : (
                friends.filter((f) => !memberIds.has(f.id)).map((f) => (
                  <View key={f.id} style={styles.memberRow}>
                    <View style={styles.avatar}>
                      {f.avatar ? <Image source={{ uri: f.avatar }} style={styles.avatarImg} /> : <Text style={styles.avatarText}>{f.name[0]?.toUpperCase()}</Text>}
                    </View>
                    <Text style={[styles.rowName, { flex: 1 }]}>{f.name}</Text>
                    <TouchableOpacity
                      style={styles.inviteBtn}
                      onPress={() => handleInvite(f.id, f.name)}
                      disabled={invitingId === f.id}
                    >
                      {invitingId === f.id ? <ActivityIndicator size="small" color="#FF3B30" /> : <UserPlus size={16} color="#FF3B30" />}
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>

            <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave} activeOpacity={0.8}>
              <LogOut size={16} color="#EF4444" />
              <Text style={styles.leaveBtnText}>{isLeader ? "Disband Convoy" : "Leave Convoy"}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060609" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  topTitle: { fontSize: 18, fontWeight: "800", color: "#FFFFFF" },

  emptyState: { flex: 1, alignItems: "center", gap: 8, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#FFFFFF", marginTop: 8 },

  blurb: { color: "#8A8A9A", fontSize: 13, lineHeight: 19, marginBottom: 18 },
  section: { marginBottom: 22 },
  sectionLabel: { fontSize: 12, fontWeight: "800", color: "#8A8A9A", letterSpacing: 0.6, marginBottom: 10, textTransform: "uppercase" },

  inviteCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", padding: 12, marginBottom: 8 },
  colorDot: { width: 14, height: 14, borderRadius: 7 },
  rowName: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  rowSub: { fontSize: 12, color: "#8A8A9A", marginTop: 2 },
  acceptBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#22C55E", alignItems: "center", justifyContent: "center" },
  declineBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(239,68,68,0.12)", alignItems: "center", justifyContent: "center" },

  createCard: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", padding: 22, gap: 8 },
  createTitle: { fontSize: 17, fontWeight: "800", color: "#FFFFFF", marginTop: 4 },
  createInput: { width: "100%", marginTop: 10, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", paddingHorizontal: 14, paddingVertical: 10, color: "#FFFFFF", fontSize: 14, textAlign: "center" },
  createBtn: { width: "100%", marginTop: 6, backgroundColor: "#FF3B30", borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  createBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },

  convoyHeaderCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", padding: 16 },
  convoyName: { fontSize: 18, fontWeight: "800", color: "#FFFFFF" },

  memberRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,59,48,0.14)", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: 40, height: 40, borderRadius: 20 },
  avatarText: { fontSize: 15, fontWeight: "800", color: "#FF3B30" },
  inviteBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,59,48,0.12)", alignItems: "center", justifyContent: "center" },

  leaveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4, paddingVertical: 14, borderRadius: 14, backgroundColor: "rgba(239,68,68,0.08)", borderWidth: 1, borderColor: "rgba(239,68,68,0.2)" },
  leaveBtnText: { color: "#EF4444", fontWeight: "700", fontSize: 14 },
});
