import React, { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Image,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { ArrowLeft, Crown, Sparkles, MessageCircle, Globe, Lock } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { useParty, Party, PartyMember } from "@/hooks/usePartyStore";
import { supabase } from "@/lib/supabase";
import { CutCornerButton, CutCornerSurface } from "@/components/CutCorner";
import { PlatinumNameBadge } from "@/components/platinum/PlatinumBadge";
import PlatinumAura from "@/components/platinum/PlatinumAura";
import { ListAvatarFrame } from "@/components/frames/AvatarFrame";
import { ListAvatarAura } from "@/components/auras/ProfileAura";
import { usePlatinumDirectory } from "@/hooks/usePlatinumDirectory";
import { ICON_STROKE } from "@/components/TripCard";
import { borderWidth, colors, cut, fontFamily, onRacingRed, radius, spacing, textStyle } from "@/constants/theme";

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
  const platinumMembers = usePlatinumDirectory(roster.map((m) => m.user_id));

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
        <ActivityIndicator color={colors.racingRed} style={{ marginTop: insets.top + 140 }} />
      </View>
    );
  }

  if (!convoy) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.emptyState, { paddingTop: insets.top + 140 }]}>
          <Text style={styles.emptyTitle}>Convoy not found</Text>
          <Text style={styles.emptyBody}>It may have been disbanded. Go back and pick another one from the list.</Text>
        </View>
      </View>
    );
  }

  const full = convoy.max_members > 0 && roster.length >= convoy.max_members;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.topBar, { paddingTop: insets.top + spacing.spacingSm }]}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()} hitSlop={spacing.spacingSm}>
          <ArrowLeft size={20} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>{convoy.name}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.spacingLg, paddingBottom: insets.bottom + spacing.spacingXxl }} showsVerticalScrollIndicator={false}>
        <CutCornerSurface
          fill={colors.carbonSurface}
          borderColor={colors.hairline}
          borderWidth={borderWidth.hairline}
          cutSize={cut.md}
          corners="topRight"
          contentStyle={styles.headerCard}
        >
          <View style={[styles.colorDot, { backgroundColor: convoy.color }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.convoyName}>{convoy.name}</Text>
            <View style={styles.visRow}>
              {convoy.visibility === "public" ? (
                <Globe size={12} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
              ) : (
                <Lock size={12} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
              )}
              <Text style={styles.rowSub}>
                {convoy.visibility === "public" ? "Open convoy" : "Invite only"} · {roster.length}{convoy.max_members > 0 ? `/${convoy.max_members}` : ""} inside
              </Text>
            </View>
          </View>
        </CutCornerSurface>

        {!!convoy.description && <Text style={styles.blurb}>{convoy.description}</Text>}

        {joinError && <Text style={styles.errorText}>{joinError}</Text>}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Who's inside</Text>
          {roster.map((m) => (
            <View key={m.id} style={styles.memberRow}>
              {/* The aura marks a Platinum member's avatar here the same way
                  it does on their profile — one signal, one place it can be.
                  The rank frame sits inside the aura and outside the convoy
                  border, so a row shows all three without any of them moving:
                  subscription, rank, convoy membership. `list` detail keeps
                  shape and colour but phase-locks every row's animation to
                  one clock. */}
              {/* The rank aura is the outermost layer, and in a roster it is
                  static and only drawn from tier 8 up — the point is that a
                  top-ranked driver stands out *against* rows that have no
                  glow, so most rows having none is the mechanism, not a gap.
                  Passing `isPlatinum` keeps it mutually exclusive with the
                  chrome aura below it. */}
              <ListAvatarAura level={m.level} isPlatinum={platinumMembers.has(m.user_id)} size={40}>
                <PlatinumAura show={platinumMembers.has(m.user_id)} size={40}>
                  <ListAvatarFrame level={m.level} size={40}>
                    <View style={[styles.avatar, m.status === "accepted" && { borderColor: convoy.color, borderWidth: borderWidth.emphasis }]}>
                      {m.avatar ? (
                        <Image source={{ uri: m.avatar }} style={styles.avatarImg} />
                      ) : (
                        <Text style={styles.avatarText}>{m.name[0]?.toUpperCase()}</Text>
                      )}
                    </View>
                  </ListAvatarFrame>
                </PlatinumAura>
              </ListAvatarAura>
              <View style={{ flex: 1 }}>
                <View style={styles.rowNameLine}>
                  <Text style={styles.rowName}>{m.name}{m.user_id === user?.id ? " (You)" : ""}</Text>
                  <PlatinumNameBadge show={platinumMembers.has(m.user_id)} name={m.name} />
                </View>
                <Text style={styles.rowSub}>Level {m.level}</Text>
              </View>
              {m.role === "leader" ? (
                <Crown size={16} color={colors.racingRed} strokeWidth={ICON_STROKE} />
              ) : (
                <Sparkles size={15} color={convoy.color} strokeWidth={ICON_STROKE} />
              )}
            </View>
          ))}
        </View>

        {conversationId && isMember && (
          <CutCornerButton
            title="Open convoy chat"
            corners="topRight"
            icon={<MessageCircle size={16} color={onRacingRed} strokeWidth={ICON_STROKE} />}
            onPress={() => router.push(`/messages/group/${conversationId}` as any)}
            style={styles.actionBtn}
          />
        )}

        {!isMember && convoy.visibility === "public" && (
          <CutCornerButton
            title={full ? "Convoy full" : "Join convoy"}
            corners="topRight"
            onPress={handleJoin}
            disabled={full || joining}
            style={styles.actionBtn}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.voidBlack },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.spacingLg,
    paddingBottom: spacing.spacingSm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.sharp,
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
    flex: 1,
    textAlign: "center",
    marginHorizontal: spacing.spacingSm,
  },

  emptyState: { flex: 1, alignItems: "center", gap: spacing.spacingSm, paddingHorizontal: spacing.spacingXl },
  emptyTitle: { ...textStyle("displayMd"), color: colors.textPrimary, textAlign: "center" },
  emptyBody: { ...textStyle("body"), color: colors.textSecondary, textAlign: "center" },

  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    padding: spacing.spacingLg,
    marginBottom: spacing.spacingMd,
  },
  colorDot: { width: 40, height: 40, borderRadius: radius.circle },
  convoyName: { ...textStyle("displayMd"), color: colors.textPrimary },
  visRow: { flexDirection: "row", alignItems: "center", gap: spacing.spacingXs, marginTop: spacing.spacingXs },
  blurb: { ...textStyle("body"), color: colors.textSecondary, marginBottom: spacing.spacingXl },

  section: { marginBottom: spacing.spacingXl },
  sectionLabel: { ...textStyle("caption"), color: colors.textSecondary, letterSpacing: 1, marginBottom: spacing.spacingSm },

  memberRow: { flexDirection: "row", alignItems: "center", gap: spacing.spacingSm, paddingVertical: spacing.spacingSm },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.circle,
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: 40, height: 40, borderRadius: radius.circle },
  avatarText: { ...textStyle("displayMd", { fontSize: 15, lineHeight: 18 }), color: colors.textPrimary },
  rowNameLine: { flexDirection: "row", alignItems: "center", gap: spacing.spacingXs },
  rowName: { ...textStyle("body", { fontFamily: fontFamily.bodySemiBold }), color: colors.textPrimary },
  rowSub: { ...textStyle("caption"), color: colors.textSecondary },

  errorText: { ...textStyle("caption"), color: colors.racingRed, marginBottom: spacing.spacingMd },

  actionBtn: { marginBottom: spacing.spacingMd },
});
