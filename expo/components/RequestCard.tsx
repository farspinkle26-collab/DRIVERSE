import React from "react";
import { StyleSheet, View, Text } from "react-native";
import { MapPin, Calendar, Clock, TruckIcon, MessageCircle } from "lucide-react-native";
import { useRouter } from "expo-router";
import Card from "./Card";
import { TowRequest } from "@/types";
import Button from "./Button";
import { useTheme } from "@/hooks/useThemeStore";

interface RequestCardProps {
  request: TowRequest;
  onViewDetails?: () => void;
  onCancel?: () => void;
  showDriverActions?: boolean;
  showDriverView?: boolean;
  onAccept?: () => void;
  onComplete?: () => void;
  onChat?: () => void;
}

const RequestCard: React.FC<RequestCardProps> = ({
  request,
  onViewDetails,
  onCancel,
  showDriverActions = false,
  showDriverView = false,
  onAccept,
  onComplete,
  onChat,
}) => {
  const { theme } = useTheme();
  const router = useRouter();
  
  const handleOpenChat = () => {
    if (onChat) {
      onChat();
    } else {
      // Determine receiverId based on user role and request data
      const receiverId = request.driverId || request.customerId || 'unknown';
      router.push({
        pathname: "/chat",
        params: { 
          requestId: request.id,
          receiverId: receiverId
        }
      });
    }
  };
  
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(price);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return theme.warning;
      case "accepted":
        return theme.info;
      case "in_progress":
        return theme.info;
      case "completed":
        return theme.success;
      case "cancelled":
        return theme.danger;
      default:
        return theme.textLight;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "pending":
        return "Pending";
      case "accepted":
        return "Accepted";
      case "in_progress":
        return "In Progress";
      case "completed":
        return "Completed";
      case "cancelled":
        return "Cancelled";
      default:
        return status;
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.statusContainer}>
          <View 
            style={[
              styles.statusIndicator, 
              { backgroundColor: getStatusColor(request.status) }
            ]} 
          />
          <Text style={[styles.statusText, { color: theme.textDark }]}>{getStatusText(request.status)}</Text>
        </View>
        <Text style={[styles.price, { color: theme.primary }]}>{formatPrice(request.price)}</Text>
      </View>

      <View style={styles.locationContainer}>
        <View style={styles.locationItem}>
          <MapPin size={16} color={theme.primary} style={styles.icon} />
          <Text style={[styles.locationText, { color: theme.text }]} numberOfLines={1}>
            {request.pickup.address}
          </Text>
        </View>
        
        <View style={[styles.locationDivider, { backgroundColor: theme.border }]} />
        
        <View style={styles.locationItem}>
          <MapPin size={16} color={theme.secondary} style={styles.icon} />
          <Text style={[styles.locationText, { color: theme.text }]} numberOfLines={1}>
            {request.dropoff.address}
          </Text>
        </View>
      </View>

      <View style={styles.infoContainer}>
        <View style={styles.infoItem}>
          <Calendar size={16} color={theme.textLight} style={styles.icon} />
          <Text style={[styles.infoText, { color: theme.textLight }]}>
            {formatDate(request.createdAt)}
          </Text>
        </View>
        
        <View style={styles.infoItem}>
          <Clock size={16} color={theme.textLight} style={styles.icon} />
          <Text style={[styles.infoText, { color: theme.textLight }]}>
            {formatTime(request.createdAt)}
          </Text>
        </View>
        
        <View style={styles.infoItem}>
          <TruckIcon size={16} color={theme.textLight} style={styles.icon} />
          <Text style={[styles.infoText, { color: theme.textLight }]}>
            {request.distance} km
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        {showDriverActions && request.status === "pending" && onAccept && (
          <Button
            title="Terima"
            onPress={onAccept}
            variant="primary"
            size="small"
            style={styles.actionButton}
          />
        )}
        
        {showDriverActions && request.status === "accepted" && onComplete && (
          <Button
            title="Selesai"
            onPress={onComplete}
            variant="primary"
            size="small"
            style={styles.actionButton}
          />
        )}
        
        {/* Chat button for accepted/in-progress requests */}
        {(request.status === "accepted" || request.status === "in_progress") && request.driverId && (
          <Button
            title="Chat"
            onPress={handleOpenChat}
            variant="outline"
            size="small"
            style={[styles.actionButton, { borderColor: theme.primary }]}
            textStyle={{ color: theme.primary }}
            icon={<MessageCircle size={14} color={theme.primary} />}
          />
        )}
        
        {onViewDetails && (
          <Button
            title="View Details"
            onPress={onViewDetails}
            variant="outline"
            size="small"
            style={styles.actionButton}
          />
        )}
        
        {onCancel && request.status !== "completed" && request.status !== "cancelled" && (
          <Button
            title="Cancel"
            onPress={onCancel}
            variant="outline"
            size="small"
            style={[styles.actionButton, { borderColor: theme.danger }]}
            textStyle={{ color: theme.danger }}
          />
        )}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "500",
  },
  price: {
    fontSize: 16,
    fontWeight: "bold",
  },
  locationContainer: {
    marginBottom: 12,
  },
  locationItem: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 4,
  },
  locationDivider: {
    height: 16,
    width: 1,
    marginLeft: 8,
    marginVertical: 2,
  },
  locationText: {
    fontSize: 14,
    flex: 1,
  },
  infoContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  infoText: {
    fontSize: 12,
  },
  icon: {
    marginRight: 4,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  actionButton: {
    marginLeft: 8,
  },
});

export default RequestCard;