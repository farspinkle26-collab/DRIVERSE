import React, { useState } from "react";
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity,
  ViewStyle,
  TextStyle,
} from "react-native";
import { Check } from "lucide-react-native";
import Input from "./Input";
import { BreakdownInfo } from "@/types";
import { useTheme } from "@/hooks/useThemeStore";

interface VehicleProblemSelectorProps {
  value: BreakdownInfo;
  onChange: (value: BreakdownInfo) => void;
  error?: string;
  containerStyle?: ViewStyle;
  labelStyle?: TextStyle;
  errorStyle?: TextStyle;
}

const VehicleProblemSelector: React.FC<VehicleProblemSelectorProps> = ({
  value,
  onChange,
  error,
  containerStyle,
  labelStyle,
  errorStyle,
}) => {
  const { theme } = useTheme();
  const [customProblem, setCustomProblem] = useState("");

  const problemOptions = [
    { label: "Engine Won't Start", value: "engine_wont_start", icon: "🚗" },
    { label: "Flat Tire", value: "flat_tire", icon: "🛞" },
    { label: "Battery Dead", value: "battery_dead", icon: "🔋" },
    { label: "Accident", value: "accident", icon: "💥" },
    { label: "Vehicle Stuck", value: "stuck", icon: "🚧" },
    { label: "Overheating", value: "overheating", icon: "🌡️" },
    { label: "Other", value: "other", icon: "❓" },
  ];

  const handleOptionSelect = (optionValue: string) => {
    if (optionValue === "other") {
      // If "Other" is selected, use custom problem text
      onChange({
        type: optionValue as any,
        notes: customProblem || "Other issue",
      });
    } else {
      // For predefined options, clear custom text and use the option
      setCustomProblem("");
      onChange({
        type: optionValue as any,
        notes: "",
      });
    }
  };

  const handleCustomProblemChange = (text: string) => {
    setCustomProblem(text);
    if (value.type === "other") {
      onChange({
        type: "other",
        notes: text,
      });
    }
  };

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={[styles.label, { color: theme.textDark }, labelStyle]}>
        What&apos;s the problem with your vehicle?
      </Text>
      
      <View style={styles.optionsContainer}>
        {problemOptions.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.optionButton,
              {
                backgroundColor: value.type === option.value ? theme.primary + "20" : theme.card,
                borderColor: value.type === option.value ? theme.primary : theme.border,
              }
            ]}
            onPress={() => handleOptionSelect(option.value)}
            activeOpacity={0.7}
          >
            <View style={styles.optionContent}>
              <Text style={styles.optionIcon}>{option.icon}</Text>
              <Text 
                style={[
                  styles.optionText,
                  { 
                    color: value.type === option.value ? theme.primary : theme.text,
                    fontWeight: value.type === option.value ? "600" : "400",
                  }
                ]}
              >
                {option.label}
              </Text>
              {value.type === option.value && (
                <Check size={20} color={theme.primary} />
              )}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Custom problem input - always visible but only active when "Other" is selected */}
      <View style={styles.customContainer}>
        <Input
          label="Other (please describe)"
          placeholder="Describe your vehicle problem in detail..."
          value={customProblem}
          onChangeText={handleCustomProblemChange}
          multiline
          numberOfLines={3}
          style={{ textAlignVertical: "top" }}
          containerStyle={[
            styles.customInput,
            { opacity: value.type === "other" ? 1 : 0.6 }
          ]}
          editable={value.type === "other"}
        />
        
        {value.type !== "other" && customProblem === "" && (
          <Text style={[styles.customHint, { color: theme.textLight }]}>
            Select &quot;Other&quot; above to describe a custom problem
          </Text>
        )}
      </View>

      {error && (
        <Text style={[styles.error, { color: theme.danger }, errorStyle]}>
          {error}
        </Text>
      )}
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
    marginBottom: 16,
    fontWeight: "500",
  },
  optionsContainer: {
    marginBottom: 16,
  },
  optionButton: {
    borderWidth: 2,
    borderRadius: 12,
    marginBottom: 8,
    overflow: "hidden",
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  optionIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  optionText: {
    flex: 1,
    fontSize: 16,
  },
  customContainer: {
    marginTop: 8,
  },
  customInput: {
    marginBottom: 8,
  },
  customHint: {
    fontSize: 12,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: -8,
  },
  error: {
    fontSize: 14,
    marginTop: 8,
  },
});

export default VehicleProblemSelector;