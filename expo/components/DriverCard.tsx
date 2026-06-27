import React from "react";
import { StyleSheet, View, Text, Image, TouchableOpacity } from "react-native";
import { Phone, MessageCircle, Star } from "lucide-react-native";
import Card from "./Card";
import { Driver } from "@/types";
import Button from "./Button";
import { useTheme } from "@/hooks/useThemeStore";

interface DriverCardProps {
  driver: Driver;
  onCall?: () => void;
  onMessage?: () => void;
  onSelect?: () => void;
  selected?: boolean;
  compact?: boolean;
}

const DriverCard: React.FC<DriverCardProps> = ({
  driver,
  onCall,
  onMessage,
  onSelect,
  selected = false,
  compact = false,
}) => {
  const { theme } = useTheme();
  
  return (
    <Card 
      style={[
        styles.card, 
        selected && { borderWidth: 2, borderColor: theme.primary },
        compact && styles.compactCard
      ]}
    >
      <View style={styles.content}>
        <Image 
          source={{ uri: driver.profilePicture || "https://images.unsplash.com/photo-1633332755192-727a05c4013d?q=80&w=200&auto=format&fit=crop" }} 
          style={[styles.avatar, compact && styles.compactAvatar]} 
        />
        
        <View style={styles.info}>
          <Text style={[styles.name, { color: theme.textDark }]}>{driver.name}</Text>
          
          <View style={styles.ratingContainer}>
            <Star size={16} color={theme.secondary} fill={theme.secondary} />
            <Text style={[styles.rating, { color: theme.textDark }]}>{driver.rating.toFixed(1)}</Text>
          </View>
          
          {!compact && (
            <>
              <Text style={[styles.vehicleInfo, { color: theme.text }]}>
                {driver.vehicleType} • {driver.licensePlate}
              </Text>
              
              {driver.location && (
                <Text style={[styles.location, { color: theme.textLight }]} numberOfLines={1}>
                  {driver.location.address}
                </Text>
              )}
            </>
          )}
        </View>
      </View>
      
      {!compact && (
        <View style={[styles.actions, { borderTopColor: theme.border }]}>
          {onCall && (
            <TouchableOpacity 
              style={[
                styles.actionButton,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                }
              ]} 
              onPress={onCall}
            >
              <Phone size={20} color={theme.primary} />
            </TouchableOpacity>
          )}
          
          {onMessage && (
            <TouchableOpacity 
              style={[
                styles.actionButton,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                }
              ]} 
              onPress={onMessage}
            >
              <MessageCircle size={20} color={theme.primary} />
            </TouchableOpacity>
          )}
          
          {onSelect && (
            <Button 
              title={selected ? "Selected" : "Select"} 
              onPress={onSelect}
              variant={selected ? "primary" : "outline"}
              size="small"
              style={styles.selectButton}
            />
          )}
        </View>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
  },
  compactCard: {
    padding: 12,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
  },
  compactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  rating: {
    fontSize: 14,
    marginLeft: 4,
    fontWeight: "500",
  },
  vehicleInfo: {
    fontSize: 14,
    marginBottom: 4,
  },
  location: {
    fontSize: 14,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
    borderWidth: 1,
  },
  selectButton: {
    marginLeft: 12,
  },
});

export default DriverCard;