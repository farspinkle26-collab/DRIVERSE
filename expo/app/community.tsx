import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import {
  ArrowLeft,
  Users,
  Flag,
  Calendar,
  MapPin,
  Clock,
  Plus,
  Check,
  Settings,
  AlertCircle,
} from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { useEvents } from "@/hooks/useEventsStore";
import { useParty } from "@/hooks/usePartyStore";
import { EventTypeIcon } from "@/components/EventMeta";
import CreateConvoyModal from "@/components/CreateConvoyModal";
import { CutCornerButton, CutCornerSurface } from "@/components/CutCorner";
import { ICON_STROKE } from "@/components/TripCard";
import {
  alpha,
  borderWidth,
  colors,
  cut,
  fontFamily,
  radius,
  spacing,
  textStyle,
} from "@/constants/theme";

function formatWhen(startsAt: string): string {
  const d = new Date(startsAt);
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
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

export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { user, isAuthenticated } = useAuth();
  const { events, loadingEvents, fetchEvents, joinEvent, leaveEvent } = useEvents();
  const {
    party,
    members,
    publicParties,
    loadingPublicParties,
    browsePublicParties,
    joinParty,
  } = useParty();

  const [tab, setTab] = useState<"convoy" | "events">(params.tab === "events" ? "events" : "convoy");
  const [refreshing, setRefreshing] = useState(false);

  // Re-sync the active tab whenever we're navigated here with a new `tab`
  // param, even if this screen instance is already mounted (e.g. going
  // Drive -> Community -> back -> Drive -> Community again reuses it, so
  // the useState initial value alone won't reflect the new param).
  useEffect(() => {
    if (params.tab === "events" || params.tab === "convoy") {
      setTab(params.tab);
    }
  }, [params.tab]);

  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const [createConvoyOpen, setCreateConvoyOpen] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      fetchEvents();
      browsePublicParties();
    }
  }, [isAuthenticated, fetchEvents, browsePublicParties]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchEvents(), browsePublicParties()]);
    setRefreshing(false);
  }, [fetchEvents, browsePublicParties]);

  const browsableConvoys = useMemo(
    () => publicParties.filter((p) => p.id !== party?.id),
    [publicParties, party?.id]
  );

  const handleJoinConvoy = useCallback(async (convoyId: string) => {
    setJoiningId(convoyId);
    setJoinError(null);
    const result = await joinParty(convoyId);
    setJoiningId(null);
    if (!result.ok) setJoinError(result.message ?? "Couldn't join that convoy");
    else router.push(`/convoy/${convoyId}` as any);
  }, [joinParty, router]);

  const handleToggleEvent = useCallback(async (eventId: string, joined: boolean) => {
    setJoiningId(eventId);
    setJoinError(null);
    const result = joined ? await leaveEvent(eventId) : await joinEvent(eventId);
    setJoiningId(null);
    if (result.error) setJoinError(result.error);
  }, [joinEvent, leaveEvent]);

  const handleCreate = () => {
    if (tab === "convoy") setCreateConvoyOpen(true);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.spacingSm }]}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()} hitSlop={spacing.spacingSm}>
          <ArrowLeft size={20} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
        </Pressable>
        <Text style={styles.topTitle}>COMMUNITY</Text>
        {tab === "convoy" ? (
          <Pressable style={styles.iconBtn} onPress={handleCreate} hitSlop={spacing.spacingSm}>
            <Plus size={20} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TabButton label="Convoy" icon={Flag} active={tab === "convoy"} onPress={() => setTab("convoy")} />
        <TabButton label="Events" icon={Calendar} active={tab === "events"} onPress={() => setTab("events")} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.spacingLg, paddingBottom: insets.bottom + spacing.spacingXxl }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.racingRed} />}
      >
        {!isAuthenticated ? (
          <Message
            icon={<Users size={spacing.spacingXl} color={colors.textSecondary} strokeWidth={ICON_STROKE} />}
            heading="SIGN IN TO JOIN THE COMMUNITY"
            body="Convoys and events live on your account."
            action={{ label: "Sign In", onPress: () => router.push("/login" as any) }}
          />
        ) : (joinError || locationError) ? (
          <View style={styles.errorBanner}>
            <AlertCircle size={14} color={colors.racingRed} strokeWidth={ICON_STROKE} />
            <Text style={styles.errorBannerText}>{joinError ?? locationError}</Text>
          </View>
        ) : null}

        {isAuthenticated && tab === "convoy" ? (
          <>
            {party && (
              <View style={styles.headerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>YOUR CONVOY</Text>
                  <Text style={styles.sectionSub}>Riding with {members.length} driver{members.length === 1 ? "" : "s"}</Text>
                </View>
              </View>
            )}
            {party && (
              <Pressable onPress={() => router.push(`/convoy/${party.id}` as any)}>
                <CutCornerSurface
                  fill={colors.carbonSurface}
                  borderColor={colors.hairline}
                  borderWidth={borderWidth.hairline}
                  cutSize={cut.md}
                  corners="topRight"
                  contentStyle={styles.card}
                >
                  <View style={styles.cardTop}>
                    <View style={[styles.colorDot, { backgroundColor: party.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{party.name}</Text>
                      {!!party.description && <Text style={styles.cardDesc}>{party.description}</Text>}
                    </View>
                    <Pressable onPress={() => router.push("/convoy" as any)} hitSlop={spacing.spacingSm}>
                      <Settings size={18} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                    </Pressable>
                  </View>
                  <View style={styles.cardMeta}>
                    <View style={styles.metaItem}>
                      <Users size={13} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                      <Text style={styles.metaText}>{members.length} member{members.length === 1 ? "" : "s"}</Text>
                    </View>
                  </View>
                </CutCornerSurface>
              </Pressable>
            )}

            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>{party ? "OTHER CONVOYS" : "JOIN A CONVOY"}</Text>
                <Text style={styles.sectionSub}>Ride together — joined members are marked special</Text>
              </View>
            </View>

            {loadingPublicParties && browsableConvoys.length === 0 ? (
              <ActivityIndicator color={colors.racingRed} style={styles.loader} />
            ) : browsableConvoys.length === 0 ? (
              <Message
                icon={<Flag size={spacing.spacingXl} color={colors.textSecondary} strokeWidth={ICON_STROKE} />}
                heading="NO PUBLIC CONVOYS YET"
                body="Tap the + in the top right to start the first one."
              />
            ) : (
              browsableConvoys.map((c) => {
                const full = c.max_members > 0 && c.member_count >= c.max_members;
                return (
                  <Pressable key={c.id} onPress={() => router.push(`/convoy/${c.id}` as any)}>
                    <CutCornerSurface
                      fill={colors.carbonSurface}
                      borderColor={colors.hairline}
                      borderWidth={borderWidth.hairline}
                      cutSize={cut.md}
                      corners="topRight"
                      contentStyle={styles.card}
                    >
                      <View style={styles.cardTop}>
                        <View style={[styles.colorDot, { backgroundColor: c.color }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardTitle}>{c.name}</Text>
                          <Text style={styles.cardDesc}>{c.description || `Led by ${c.leader_name}`}</Text>
                        </View>
                      </View>
                      <View style={styles.cardMeta}>
                        <View style={styles.metaItem}>
                          <Users size={13} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                          <Text style={styles.metaText}>
                            {c.member_count}{c.max_members > 0 ? `/${c.max_members}` : ""} members
                          </Text>
                        </View>
                      </View>
                      {!party && (
                        <CutCornerButton
                          title={full ? "Full" : "Join convoy"}
                          size="sm"
                          corners="topRight"
                          disabled={full || joiningId === c.id}
                          onPress={() => handleJoinConvoy(c.id)}
                          icon={joiningId === c.id ? undefined : <Flag size={14} color={colors.voidBlack} strokeWidth={ICON_STROKE} />}
                          style={styles.actionBtn}
                        />
                      )}
                    </CutCornerSurface>
                  </Pressable>
                );
              })
            )}
          </>
        ) : null}

        {isAuthenticated && tab === "events" ? (
          <>
            {!user?.country && (
              <Pressable style={styles.warnBanner} onPress={() => router.push("/(tabs)/profile" as any)}>
                <AlertCircle size={14} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                <Text style={styles.warnBannerText}>Set your country to see local events</Text>
              </Pressable>
            )}

            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>EVENTS NEAR YOU</Text>
                <Text style={styles.sectionSub}>
                  {user?.country ? `Happening in ${user.country}` : "Set your country to find events"}
                </Text>
              </View>
            </View>

            {loadingEvents && events.length === 0 ? (
              <ActivityIndicator color={colors.racingRed} style={styles.loader} />
            ) : events.length === 0 ? (
              <Message
                icon={<Calendar size={spacing.spacingXl} color={colors.textSecondary} strokeWidth={ICON_STROKE} />}
                heading="NO EVENTS NEAR YOU YET"
                body="Open the map and tap Event to put the first one up."
                action={{ label: "Open Map", onPress: () => router.push("/(tabs)/map" as any) }}
              />
            ) : (
              events.map((ev) => (
                <Pressable key={ev.id} onPress={() => router.push(`/event/${ev.id}` as any)}>
                  <CutCornerSurface
                    fill={colors.carbonSurface}
                    borderColor={ev.is_live ? colors.racingRed : colors.hairline}
                    borderWidth={borderWidth.hairline}
                    cutSize={cut.md}
                    corners="topRight"
                    contentStyle={styles.card}
                  >
                    <View style={styles.cardTop}>
                      <View style={styles.eventThumb}>
                        <EventTypeIcon
                          type={ev.event_type}
                          size={20}
                          color={ev.is_live ? colors.racingRed : colors.textPrimary}
                          strokeWidth={ICON_STROKE}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{ev.title}</Text>
                        <Text style={styles.hostText}>by {ev.host_name}{ev.is_live ? " · Live now" : ""}</Text>
                      </View>
                    </View>

                    <View style={styles.eventMeta}>
                      <View style={styles.metaItem}>
                        <Clock size={13} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                        <Text style={styles.metaText}>{formatWhen(ev.starts_at)}</Text>
                      </View>
                      {!!ev.location_name && (
                        <View style={styles.metaItem}>
                          <MapPin size={13} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                          <Text style={styles.metaText}>{ev.location_name}</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.eventFooter}>
                      <View style={styles.metaItem}>
                        <Users size={13} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                        <Text style={styles.metaText}>
                          {ev.participant_count}{ev.max_participants > 0 ? `/${ev.max_participants}` : ""} going
                        </Text>
                      </View>
                      <CutCornerButton
                        title={ev.is_joined ? "Going" : "RSVP"}
                        variant={ev.is_joined ? "primary" : "outline"}
                        size="sm"
                        corners="topRight"
                        disabled={joiningId === ev.id}
                        onPress={() => handleToggleEvent(ev.id, ev.is_joined)}
                        icon={
                          joiningId === ev.id
                            ? undefined
                            : ev.is_joined
                              ? <Check size={14} color={colors.voidBlack} strokeWidth={ICON_STROKE} />
                              : undefined
                        }
                      />
                    </View>
                  </CutCornerSurface>
                </Pressable>
              ))
            )}
          </>
        ) : null}
      </ScrollView>

      <CreateConvoyModal
        visible={createConvoyOpen}
        onClose={() => setCreateConvoyOpen(false)}
        onCreated={() => { setCreateConvoyOpen(false); browsePublicParties(); }}
      />
    </View>
  );
}

function TabButton({
  label,
  icon: Icon,
  active,
  onPress,
}: {
  label: string;
  icon: React.FC<{ size: number; color: string; strokeWidth?: number }>;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.tab} onPress={onPress}>
      <View style={styles.tabInner}>
        <Icon size={15} color={active ? colors.textPrimary : colors.textSecondary} strokeWidth={ICON_STROKE} />
        <Text style={[styles.tabText, active && styles.tabTextActive]}>{label.toUpperCase()}</Text>
      </View>
      <View style={[styles.tabRule, active && styles.tabRuleActive]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.voidBlack },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.spacingLg,
    paddingBottom: spacing.spacingMd,
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
  topTitle: { ...textStyle("displayMd"), color: colors.textPrimary },

  tabs: {
    flexDirection: "row",
    gap: spacing.spacingXl,
    marginHorizontal: spacing.spacingLg,
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.hairline,
  },
  tab: { flex: 1, gap: spacing.spacingSm, alignItems: "center" },
  tabInner: { flexDirection: "row", alignItems: "center", gap: spacing.spacingXs },
  tabText: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 1,
    color: colors.textSecondary,
  },
  tabTextActive: { color: colors.textPrimary },
  tabRule: {
    height: borderWidth.emphasis,
    width: "100%",
    backgroundColor: "transparent",
    marginBottom: -borderWidth.hairline,
  },
  tabRuleActive: { backgroundColor: colors.racingRed },

  headerRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.spacingLg, marginBottom: spacing.spacingMd },
  sectionTitle: { ...textStyle("caption"), color: colors.textSecondary, letterSpacing: 1 },
  sectionSub: { ...textStyle("caption"), color: colors.textSecondary, marginTop: spacing.spacingXs },

  card: { padding: spacing.spacingLg, gap: spacing.spacingMd, marginBottom: spacing.spacingMd },
  cardTop: { flexDirection: "row", gap: spacing.spacingMd, alignItems: "center" },
  cardTitle: { ...textStyle("displayMd"), color: colors.textPrimary },
  cardDesc: { ...textStyle("caption"), color: colors.textSecondary, marginTop: spacing.spacingXs },

  colorDot: { width: 16, height: 16, borderRadius: radius.circle },
  cardMeta: { flexDirection: "row", gap: spacing.spacingLg },
  metaItem: { flexDirection: "row", alignItems: "center", gap: spacing.spacingXs },
  metaText: { ...textStyle("caption"), color: colors.textSecondary },

  actionBtn: { marginTop: spacing.spacingXs },

  eventThumb: {
    width: 44,
    height: 44,
    borderRadius: radius.sharp,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.voidBlack,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
  },
  hostText: { ...textStyle("caption"), color: colors.textSecondary, marginTop: spacing.spacingXs },
  eventMeta: { gap: spacing.spacingXs },
  eventFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  message: { alignItems: "center", gap: spacing.spacingSm, paddingVertical: spacing.spacingXxl, paddingHorizontal: spacing.spacingLg },
  messageHeading: { ...textStyle("displayMd"), color: colors.textPrimary, textAlign: "center" },
  messageBody: { ...textStyle("body"), color: colors.textSecondary, textAlign: "center" },
  messageAction: { marginTop: spacing.spacingSm },
  loader: { marginTop: spacing.spacingMd },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
    backgroundColor: alpha(colors.racingRed, 0.1),
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: alpha(colors.racingRed, 0.3),
    padding: spacing.spacingMd,
    marginBottom: spacing.spacingMd,
  },
  errorBannerText: { ...textStyle("caption"), color: colors.racingRed, flex: 1 },
  warnBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
    backgroundColor: colors.carbonSurface,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    padding: spacing.spacingMd,
    marginBottom: spacing.spacingMd,
  },
  warnBannerText: { ...textStyle("caption"), color: colors.textSecondary, flex: 1 },
});
