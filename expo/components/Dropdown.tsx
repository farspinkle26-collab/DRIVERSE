import React, { useState } from "react";
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  Modal, 
  FlatList,
  ViewStyle,
  TextStyle,
} from "react-native";
import { ChevronDown, Check } from "lucide-react-native";
import Card from "./Card";
import { useTheme } from "@/hooks/useThemeStore";

interface DropdownOption {
  label: string;
  value: string;
}

interface DropdownProps {
  label?: string;
  placeholder: string;
  options: DropdownOption[];
  value: string | null;
  onChange: (value: string) => void;
  error?: string;
  containerStyle?: ViewStyle;
  labelStyle?: TextStyle;
  errorStyle?: TextStyle;
}

const Dropdown: React.FC<DropdownProps> = ({
  label,
  placeholder,
  options,
  value,
  onChange,
  error,
  containerStyle,
  labelStyle,
  errorStyle,
}) => {
  const { theme } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);

  const selectedOption = options.find(option => option.value === value);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setModalVisible(false);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={[styles.label, { color: theme.textDark }, labelStyle]}>{label}</Text>}
      
      <TouchableOpacity 
        style={[
          styles.inputContainer,
          { 
            borderColor: error ? theme.danger : theme.border,
            backgroundColor: theme.card,
          }
        ]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <Text 
          style={[
            styles.inputText,
            { color: selectedOption ? theme.text : theme.textLight },
          ]}
          numberOfLines={1}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </Text>
        <ChevronDown size={20} color={theme.textLight} />
      </TouchableOpacity>

      {error && <Text style={[styles.error, { color: theme.danger }, errorStyle]}>{error}</Text>}

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.overlay }]}>
          <Card style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.textDark }]}>Select Option</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={[styles.closeButton, { color: theme.text }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.optionItem}
                  onPress={() => handleSelect(item.value)}
                >
                  <Text style={[styles.optionText, { color: theme.text }]}>{item.label}</Text>
                  {value === item.value && (
                    <Check size={20} color={theme.primary} />
                  )}
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.border }]} />}
              style={styles.optionsList}
            />
          </Card>
        </View>
      </Modal>
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
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  inputText: {
    flex: 1,
    fontSize: 16,
  },
  error: {
    fontSize: 14,
    marginTop: 4,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "70%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  closeButton: {
    fontSize: 24,
  },
  optionsList: {
    maxHeight: 400,
  },
  optionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 4,
  },
  optionText: {
    fontSize: 16,
    flex: 1,
  },
  separator: {
    height: 1,
  },
});

export default Dropdown;