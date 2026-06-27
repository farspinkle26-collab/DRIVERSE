import React from "react";
import { 
  StyleSheet, 
  View, 
  ViewStyle, 
  StyleProp 
} from "react-native";
import { useTheme } from "@/hooks/useThemeStore";

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  elevation?: number;
  borderRadius?: number;
  padding?: number;
}

const Card: React.FC<CardProps> = ({
  children,
  style,
  elevation = 2,
  borderRadius = 16,
  padding = 16,
}) => {
  const { theme } = useTheme();
  
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          shadowColor: theme.shadowLight,
          borderRadius,
          padding,
          shadowOpacity: elevation > 4 ? 0.15 : 0.08,
          shadowRadius: elevation * 2,
          elevation,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    shadowOffset: { width: 0, height: 4 },
    marginVertical: 6,
    marginHorizontal: 0,
  },
});

export default Card;