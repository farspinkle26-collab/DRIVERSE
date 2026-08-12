/**
 * Driveverse — send a trip into a friend's DM.
 *
 * A friend picker over `fetchAcceptedFriends` (the same query
 * `app/messages/index.tsx`'s compose sheet uses), writing a `direct_messages`
 * row with `message_type: "trip"` — see
 * `database_migration_direct_message_share.sql` for the column and why the
 * card is denormalised into `metadata` rather than joined at read time.
 *
 * Stays open after a send so the driver can share to more than one friend in
 * one pass — each row gets its own "Sent" state rather than the whole sheet
 * closing out from under them.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, Send, Users, X } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { supabase } from "@/lib/supabase";
import { fetchAcceptedFriends, type FriendContact } from "@/lib/friends";
import {
  borderWidth,
  colors,
  fontFamily,
  radius,
  spacing,
  textStyle,
} from "@/constants/theme";

export interface ShareTripPayload {
  id: string;
  title: string;
  distanceLabel: string;
  durationLabel: string;
}

interface ShareTripToFriendModalProps {
  visible: boolean;
  trip: ShareTripPayload;
  onClose: () => void;
}

const ICON_STROKE = 1.75;

export default function ShareTripToFriendModal({
  visible,
  trip,
  onClose,
}: ShareTripToFriendModalProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [friends, setFriends] = useState<FriendContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !user) return;
    setError(null);
    setSentTo(new Set());
    setLoading(true);
    let active = true;
    fetchAcceptedFriends(user.id).then((list) => {
      if (active) {
        setFriends(list);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [visible, user]);

  const handleSend = useCallback(
    async (friend: FriendContact) => {
      if (!user || sendingTo) return;
      setError(null);
      setSendingTo(friend.id);
      const { error: sendErr } = await supabase.from("direct_messages").insert({
        sender_id: user.id,
        receiver_id: friend.id,
        content: `Shared a trip: ${trip.title} (${trip.distanceLabel} · ${trip.durationLabel})`,
        message_type: "trip",
        metadata: {
          trip_id: trip.id,
          title: trip.title,
          distance_label: trip.distanceLabel,
          duration_label: trip.durationLabel,
        },
      });
      setSendingTo(null);
      if (sendErr) {
        setError("Couldn't send that. Try again.");
        return;
      }
      setSentTo((prev) => new Set(prev).add(friend.id));
    },
    [user, sendingTo, trip]
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.spacingXl }]}>
        <View style={styles.header}>
          <Text style={styles.title}>SEND TO A FRIEND</Text>
          <Pressable onPress={onClose} hitSlop={spacing.spacingSm}>
            <X size={20} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <ScrollView style={styles.list}>
          {loading ? (
            <ActivityIndicator color={colors.racingRed} style={styles.loader} />
          ) : friends.length === 0 ? (
            <View style={styles.empty}>
              <Users size={spacing.spacingXl} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
              <Text style={styles.emptyText}>
                Add friends first — then they'll show up here to share with.
              </Text>
            </View>
          ) : (
            friends.map((f) => {
              const sent = sentTo.has(f.id);
              const sending = sendingTo === f.id;
              return (
                <Pressable
                  key={f.id}
                  style={styles.row}
                  disabled={sending}
                  onPress={() => handleSend(f)}
                  accessibilityRole="button"
                  accessibilityLabel={sent ? `Sent to ${f.name}` : `Send trip to ${f.name}`}
                >
                  <View style={styles.avatar}>
                    {f.avatar ? (
                      <Image source={{ uri: f.avatar }} style={styles.avatarImg} />
                    ) : (
                      <Text style={styles.avatarText}>{f.name[0]?.toUpperCase() ?? "?"}</Text>
                    )}
                  </View>
                  <Text style={styles.rowName} numberOfLines={1}>{f.name}</Text>
                  {sending ? (
                    <ActivityIndicator size="small" color={colors.textSecondary} />
                  ) : sent ? (
                    <Check size={18} color={colors.racingRed} strokeWidth={ICON_STROKE} />
                  ) : (
                    <Send size={18} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                  )}
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    backgroundColor: colors.carbonSurface,
    borderTopWidth: borderWidth.hairline,
    borderLeftWidth: borderWidth.hairline,
    borderRightWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.spacingXl,
    paddingTop: spacing.spacingLg,
    maxHeight: "70%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.spacingMd,
  },
  title: { ...textStyle("displayMd"), color: colors.textPrimary, letterSpacing: 1 },
  error: {
    ...textStyle("caption"),
    color: colors.racingRed,
    marginBottom: spacing.spacingSm,
  },
  list: { maxHeight: 360 },
  loader: { marginVertical: spacing.spacingXl },
  empty: { alignItems: "center", gap: spacing.spacingSm, paddingVertical: spacing.spacingXl },
  emptyText: { ...textStyle("body"), color: colors.textSecondary, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    paddingVertical: spacing.spacingSm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.circle,
    backgroundColor: colors.voidBlack,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: 44, height: 44, borderRadius: radius.circle },
  avatarText: { ...textStyle("displayMd", { fontSize: 16, lineHeight: 19 }), color: colors.textPrimary },
  rowName: {
    flex: 1,
    ...textStyle("body", { fontFamily: fontFamily.bodySemiBold }),
    color: colors.textPrimary,
  },
});
