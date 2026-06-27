import React from "react";
import { 
  StyleSheet, 
  TextInput, 
  View, 
  Text, 
  TextInputProps,
  ViewStyle,
  TextStyle,
} from "react-native";
import { useTheme } from "@/hooks/useThemeStore";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
  labelStyle?: TextStyle;
  errorStyle?: TextStyle;
}

const Input: React.FC<InputProps> = ({
  label,
  error,
  leftIcon,
  rightIcon,
  containerStyle,
  inputStyle,
  labelStyle,
  errorStyle,
  ...rest
}) => {
  const { theme } = useTheme();
  
  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={[styles.label, { color: theme.textDark }, labelStyle]}>{label}</Text>}
      
      <View style={[
        styles.inputContainer, 
        { 
          borderColor: error ? theme.danger : theme.border,
          backgroundColor: theme.card,
        },
      ]}>
        {leftIcon && <View style={styles.iconContainer}>{leftIcon}</View>}
        
        <TextInput
          style={[
            styles.input,
            { color: theme.text },
            leftIcon && { paddingLeft: 8 },
            rightIcon && { paddingRight: 8 },
            inputStyle,
          ]}
          placeholderTextColor={theme.textLight}
          {...rest}
        />
        
        {rightIcon && <View style={styles.iconContainer}>{rightIcon}</View>}
      </View>
      
      {error && <Text style={[styles.error, { color: theme.danger }, errorStyle]}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    width: "100%",
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    fontWeight: "500",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  iconContainer: {
    paddingHorizontal: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  error: {
    fontSize: 14,
    marginTop: 4,
  },
});

export default Input;