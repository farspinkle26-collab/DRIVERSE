import React, { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  TouchableOpacity,
  TextInput,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, Stack } from "expo-router";
import { ArrowLeft, Crown, UserPlus, LogOut, X, Check, Radio, Flag } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { useParty } from "@/hooks/usePartyStore";
import { supabase } from "@/lib/supabase";
import { CutCornerButton, CutCornerSurface } from "@/components/CutCorner";
import { PlatinumNameBadge } from "@/components/platinum/PlatinumBadge";
import PlatinumAura from "@/components/platinum/PlatinumAura";
import TierLimitNotice from "@/components/platinum/TierLimitNotice";
import { usePlatinumDirectory } from "@/hooks/usePlatinumDirectory";
import { ICON_STROKE } from "@/components/TripCard";
import {
  borderWidth,
  colors,
  cut,
  fontFamily,
  radius,
  spacing,
  textStyle,
} from "@/constants/theme";

interface Contact {
  id: string;
  name: string;
  avatar?: string;
}

function IconButton({
  icon,
  onPress,
  hitSlop = spacing.spacingSm,
}: {
  icon: React.ReactNode;
  onPress?: () => void;
  hitSlop?: number;
}) {
  return (
    <Pressable style={styles.iconBtn} onPress={onPress} hitSlop={hitSlop}>
      {icon}
    </Pressable>
  );
}

function Message({
  icon,
  heading,
  body,
  action,
}: {
  icon: React.ReactNode;
  heading: string;
  body: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.message}>
      {icon}
      <Text style={styles.messageHeading}>{heading}</Text>
      <Text style={styles.messageBody}>{body}</Text>
      {action ? (
        <CutCornerButton
          title={action.label}
          variant="outline"
          size="sm"
          corners="topRight"
          onPress={action.onPress}
          style={styles.messageAction}
        />
      ) : null}
    </View>
  );
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
    convoyMemberLimit,
    seatsTaken,
  } = useParty();
  const platinumMembers = usePlatinumDirectory(members.map((m) => m.user_id));

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
        <View style={[styles.emptyState, { paddingTop: insets.top + 140 }]}>
          <Message
            icon={<Radio size={spacing.spacingXl} color={colors.textSecondary} strokeWidth={ICON_STROKE} />}
            heading="SIGN IN TO JOIN A CONVOY"
            body="A convoy marks your friends with a matching ring on the map so you can track each other live."
            action={{ label: "Sign In", onPress: () => router.push("/login" as any) }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.topBar, { paddingTop: insets.top + spacing.spacingSm }]}>
        <IconButton
          icon={<ArrowLeft size={20} color={colors.textPrimary} strokeWidth={ICON_STROKE} />}
          onPress={() => router.back()}
        />
        <Text style={styles.topTitle}>CONVOY</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.spacingLg, paddingBottom: insets.bottom + spacing.spacingXxl }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.blurb}>
          Ride together — a convoy marks your friends with a matching ring on the map so you can track each other in real time.
        </Text>

        {/* ─── PENDING INVITES ────────────────────────────────── */}
        {invites.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Convoy Invites</Text>
            {invites.map((inv) => (
              <CutCornerSurface
                key={inv.id}
                fill={colors.carbonSurface}
                borderColor={colors.hairline}
                borderWidth={borderWidth.hairline}
                cutSize={cut.sm}
                corners="topRight"
                contentStyle={styles.row}
              >
                <View style={[styles.colorDot, { backgroundColor: inv.party_color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{inv.party_name}</Text>
                  <Text style={styles.rowSub}>Led by {inv.leader_name}</Text>
                </View>
                <Pressable style={styles.acceptBtn} onPress={() => acceptInvite(inv.party_id)}>
                  <Check size={16} color={colors.voidBlack} strokeWidth={ICON_STROKE} />
                </Pressable>
                <Pressable style={styles.declineBtn} onPress={() => declineInvite(inv.party_id)}>
                  <X size={16} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                </Pressable>
              </CutCornerSurface>
            ))}
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={colors.racingRed} style={styles.loader} />
        ) : !party ? (
          <View style={styles.section}>
            <CutCornerSurface
              fill={colors.carbonSurface}
              borderColor={colors.hairline}
              borderWidth={borderWidth.hairline}
              cutSize={cut.md}
              corners="topRight"
              contentStyle={styles.createCard}
            >
              <Radio size={spacing.spacingXl} color={colors.racingRed} strokeWidth={ICON_STROKE} />
              <Text style={styles.createTitle}>Start a Convoy</Text>
              <Text style={styles.rowSub}>Name it, then invite friends from here or from the map.</Text>
              <TextInput
                style={styles.createInput}
                placeholder="Convoy name"
                placeholderTextColor={colors.textSecondary}
                value={nameDraft}
                onChangeText={setNameDraft}
                maxLength={30}
              />
              <CutCornerButton
                title="Create Convoy"
                corners="topRight"
                onPress={handleCreate}
                disabled={!nameDraft.trim() || creating}
                style={{ width: "100%" }}
              />
            </CutCornerSurface>

            {joinError && <Text style={styles.errorText}>{joinError}</Text>}

            <Text style={[styles.sectionLabel, { marginTop: spacing.spacingXl }]}>Browse Open Convoys</Text>
            {loadingPublicParties && publicParties.length === 0 ? (
              <ActivityIndicator color={colors.racingRed} style={styles.loaderSm} />
            ) : publicParties.length === 0 ? (
              <Text style={styles.rowSub}>No public convoys nearby — start your own above.</Text>
            ) : (
              publicParties.map((c) => {
                const full = c.max_members > 0 && c.member_count >= c.max_members;
                return (
                  <Pressable key={c.id} onPress={() => router.push(`/convoy/${c.id}` as any)}>
                    <CutCornerSurface
                      fill={colors.carbonSurface}
                      borderColor={colors.hairline}
                      borderWidth={borderWidth.hairline}
                      cutSize={cut.sm}
                      corners="topRight"
                      contentStyle={styles.row}
                    >
                      <View style={[styles.colorDot, { backgroundColor: c.color }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowName}>{c.name}</Text>
                        <Text style={styles.rowSub}>
                          {c.member_count}{c.max_members > 0 ? `/${c.max_members}` : ""} members · Led by {c.leader_name}
                        </Text>
                      </View>
                      <Pressable
                        style={[styles.acceptBtn, full && styles.disabled]}
                        onPress={() => handleJoinPublic(c.id)}
                        disabled={full || joiningId === c.id}
                      >
                        {joiningId === c.id ? (
                          <ActivityIndicator size="small" color={colors.voidBlack} />
                        ) : (
                          <Flag size={14} color={colors.voidBlack} strokeWidth={ICON_STROKE} />
                        )}
                      </Pressable>
                    </CutCornerSurface>
                  </Pressable>
                );
              })
            )}
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <CutCornerSurface
                fill={colors.carbonSurface}
                borderColor={colors.hairline}
                borderWidth={borderWidth.hairline}
                cutSize={cut.md}
                corners="topRight"
                contentStyle={styles.convoyHeaderCard}
              >
                <View style={[styles.colorDot, styles.colorDotLg, { backgroundColor: party.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.convoyName}>{party.name}</Text>
                  <Text style={styles.rowSub}>{members.length} member{members.length === 1 ? "" : "s"}</Text>
                </View>
              </CutCornerSurface>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Members</Text>
              {members.map((m) => (
                <View key={m.id} style={styles.memberRow}>
                  <Pressable
                    style={styles.memberIdentity}
                    onPress={() => router.push(`/user/${m.user_id}` as any)}
                  >
                    <PlatinumAura show={platinumMembers.has(m.user_id)} size={40}>
                      <View style={styles.avatar}>
                        {m.avatar ? <Image source={{ uri: m.avatar }} style={styles.avatarImg} /> : <Text style={styles.avatarText}>{m.name[0]?.toUpperCase()}</Text>}
                      </View>
                    </PlatinumAura>
                    <View style={{ flex: 1 }}>
                      <View style={styles.rowNameLine}>
                        <Text style={styles.rowName}>{m.name}{m.user_id === user?.id ? " (You)" : ""}</Text>
                        <PlatinumNameBadge show={platinumMembers.has(m.user_id)} name={m.name} />
                      </View>
                      <Text style={styles.rowSub}>Level {m.level}{m.status === "invited" ? " · Invited" : ""}</Text>
                    </View>
                  </Pressable>
                  {m.role === "leader" && <Crown size={16} color={colors.racingRed} strokeWidth={ICON_STROKE} />}
                  {isLeader && m.user_id !== user?.id && (
                    <Pressable onPress={() => handleKick(m.user_id, m.name)} hitSlop={spacing.spacingSm} style={styles.kickBtn}>
                      <X size={16} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                    </Pressable>
                  )}
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Invite Friends</Text>
              {/* Convoy size follows the ORGANISER's tier, so this notice is
                  only shown to the leader — a member cannot lift it and
                  offering them an upgrade would be a misleading upsell. */}
              {isLeader && (
                <TierLimitNotice
                  current={seatsTaken}
                  cap={convoyMemberLimit}
                  noun="drivers"
                  benefit="convoy"
                  atCapMessage="Go Platinum to roll 8 deep."
                  style={styles.convoyLimitNotice}
                />
              )}
              {friends.filter((f) => !memberIds.has(f.id)).length === 0 ? (
                <Text style={styles.rowSub}>All your friends are already in this convoy.</Text>
              ) : (
                friends.filter((f) => !memberIds.has(f.id)).map((f) => (
                  <View key={f.id} style={styles.memberRow}>
                    <View style={styles.avatar}>
                      {f.avatar ? <Image source={{ uri: f.avatar }} style={styles.avatarImg} /> : <Text style={styles.avatarText}>{f.name[0]?.toUpperCase()}</Text>}
                    </View>
                    <Text style={[styles.rowName, { flex: 1 }]}>{f.name}</Text>
                    <Pressable
                      style={styles.inviteBtn}
                      onPress={() => handleInvite(f.id, f.name)}
                      disabled={invitingId === f.id}
                    >
                      {invitingId === f.id ? (
                        <ActivityIndicator size="small" color={colors.textSecondary} />
                      ) : (
                        <UserPlus size={16} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                      )}
                    </Pressable>
                  </View>
                ))
              )}
            </View>

            <CutCornerButton
              title={isLeader ? "Disband Convoy" : "Leave Convoy"}
              variant="outline"
              corners="topRight"
              icon={<LogOut size={16} color={colors.racingRed} strokeWidth={ICON_STROKE} />}
              onPress={handleLeave}
              style={{ marginTop: spacing.spacingXs }}
            />
          </>
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
  },

  emptyState: { flex: 1, paddingHorizontal: spacing.spacingLg },

  message: {
    alignItems: "center",
    gap: spacing.spacingSm,
  },
  messageHeading: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
    textAlign: "center",
  },
  messageBody: {
    ...textStyle("body"),
    color: colors.textSecondary,
    textAlign: "center",
  },
  messageAction: {
    marginTop: spacing.spacingSm,
  },

  blurb: {
    ...textStyle("body"),
    color: colors.textSecondary,
    marginBottom: spacing.spacingXl,
  },
  section: { marginBottom: spacing.spacingXl },
  sectionLabel: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: spacing.spacingSm,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
    padding: spacing.spacingMd,
    marginBottom: spacing.spacingSm,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: radius.circle,
  },
  colorDotLg: { width: 40, height: 40 },
  rowNameLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingXs,
  },
  rowName: {
    ...textStyle("body", { fontFamily: fontFamily.bodySemiBold }),
    color: colors.textPrimary,
  },
  convoyLimitNotice: {
    marginBottom: spacing.spacingMd,
  },
  rowSub: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    marginTop: 2,
  },
  acceptBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sharp,
    backgroundColor: colors.racingRed,
    alignItems: "center",
    justifyContent: "center",
  },
  declineBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sharp,
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.4 },

  createCard: {
    alignItems: "center",
    padding: spacing.spacingXl,
    gap: spacing.spacingSm,
  },
  createTitle: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
  },
  createInput: {
    width: "100%",
    marginTop: spacing.spacingSm,
    backgroundColor: colors.voidBlack,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.spacingMd,
    paddingVertical: spacing.spacingSm,
    color: colors.textPrimary,
    textAlign: "center",
    ...textStyle("body"),
  },
  errorText: {
    ...textStyle("caption"),
    color: colors.racingRed,
    marginTop: spacing.spacingSm,
  },
  loader: { marginTop: spacing.spacingXl },
  loaderSm: { marginTop: spacing.spacingSm },

  convoyHeaderCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    padding: spacing.spacingLg,
  },
  convoyName: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
  },

  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
    paddingVertical: spacing.spacingSm,
  },
  memberIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
    flex: 1,
  },
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
  avatarText: {
    ...textStyle("displayMd", { fontSize: 15, lineHeight: 18 }),
    color: colors.textPrimary,
  },
  kickBtn: { padding: spacing.spacingXs },
  inviteBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.sharp,
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
});
