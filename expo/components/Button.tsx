import React from "react";
import { 
  StyleSheet, 
  Text, 
  TouchableOpacity, 
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  TouchableOpacityProps
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/hooks/useThemeStore";

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline" | "text" | "gradient";
  size?: "small" | "medium" | "large";
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
}

const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = "primary",
  size = "medium",
  loading = false,
  disabled = false,
  style,
  textStyle,
  icon,
  iconPosition = "left",
  ...rest
}) => {
  const { theme } = useTheme();
  
  const getButtonStyle = (): ViewStyle => {
    let buttonStyle: ViewStyle = {};

    // Variant styles
    switch (variant) {
      case "primary":
        buttonStyle = {
          backgroundColor: theme.primary,
          borderColor: theme.primary,
        };
        break;
      case "secondary":
        buttonStyle = {
          backgroundColor: theme.secondary,
          borderColor: theme.secondary,
        };
        break;
      case "outline":
        buttonStyle = {
          backgroundColor: theme.transparent,
          borderColor: theme.primary,
          borderWidth: 2,
        };
        break;
      case "text":
        buttonStyle = {
          backgroundColor: theme.transparent,
          borderColor: theme.transparent,
        };
        break;
      case "gradient":
        buttonStyle = {
          backgroundColor: theme.transparent,
          borderColor: theme.transparent,
        };
        break;
    }

    // Size styles
    switch (size) {
      case "small":
        buttonStyle = {
          ...buttonStyle,
          paddingVertical: 8,
          paddingHorizontal: 16,
          borderRadius: 8,
        };
        break;
      case "medium":
        buttonStyle = {
          ...buttonStyle,
          paddingVertical: 12,
          paddingHorizontal: 24,
          borderRadius: 12,
        };
        break;
      case "large":
        buttonStyle = {
          ...buttonStyle,
          paddingVertical: 16,
          paddingHorizontal: 32,
          borderRadius: 16,
        };
        break;
    }

    // Disabled style
    if (disabled || loading) {
      buttonStyle = {
        ...buttonStyle,
        opacity: 0.6,
      };
    }

    return buttonStyle;
  };

  const getTextStyle = (): TextStyle => {
    let textStyleObj: TextStyle = {
      fontWeight: "600",
      textAlign: "center",
    };

    // Variant text styles
    switch (variant) {
      case "primary":
      case "secondary":
      case "gradient":
        textStyleObj = {
          ...textStyleObj,
          color: theme.white,
        };
        break;
      case "outline":
      case "text":
        textStyleObj = {
          ...textStyleObj,
          color: theme.primary,
        };
        break;
    }

    // Size text styles
    switch (size) {
      case "small":
        textStyleObj = {
          ...textStyleObj,
          fontSize: 14,
        };
        break;
      case "medium":
        textStyleObj = {
          ...textStyleObj,
          fontSize: 16,
        };
        break;
      case "large":
        textStyleObj = {
          ...textStyleObj,
          fontSize: 18,
        };
        break;
    }

    return textStyleObj;
  };

  const buttonContent = (
    <>
      {loading ? (
        <ActivityIndicator 
          color={variant === "outline" || variant === "text" ? theme.primary : theme.white} 
          size="small" 
        />
      ) : (
        <>
          {icon && iconPosition === "left" && icon}
          <Text style={[styles.text, getTextStyle(), textStyle]}>{title}</Text>
          {icon && iconPosition === "right" && icon}
        </>
      )}
    </>
  );

  if (variant === "gradient") {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.8}
        testID="button"
        style={[{ opacity: disabled || loading ? 0.6 : 1 }, style]}
        {...rest}
      >
        <LinearGradient
          colors={[theme.gradientStart, theme.gradientMiddle, theme.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.button, getButtonStyle()]}
        >
          {buttonContent}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.button, getButtonStyle(), style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      testID="button"
      {...rest}
    >
      {buttonContent}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 0,
    gap: 8,
  },
  text: {
    fontSize: 16,
  },
});

export default Button;