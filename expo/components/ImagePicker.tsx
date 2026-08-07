import React, { useState } from "react";
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  Image, 
  ViewStyle,
  TextStyle,
  Platform,
} from "react-native";
import { Camera, ImageIcon, X } from "lucide-react-native";
import * as ImagePickerExpo from "expo-image-picker";
import Colors from "@/constants/colors";
import Card from "./Card";
import { appAlert } from "@/lib/appAlert";

interface ImagePickerProps {
  label?: string;
  placeholder?: string;
  value: string | null;
  onChange: (imageUri: string | null) => void;
  error?: string;
  containerStyle?: ViewStyle;
  labelStyle?: TextStyle;
  errorStyle?: TextStyle;
}

const ImagePicker: React.FC<ImagePickerProps> = ({
  label,
  placeholder = "Add photo",
  value,
  onChange,
  error,
  containerStyle,
  labelStyle,
  errorStyle,
}) => {
  const [loading, setLoading] = useState(false);

  const requestPermissions = async () => {
    if (Platform.OS !== 'web') {
      const { status: cameraStatus } = await ImagePickerExpo.requestCameraPermissionsAsync();
      const { status: mediaStatus } = await ImagePickerExpo.requestMediaLibraryPermissionsAsync();
      
      if (cameraStatus !== 'granted' || mediaStatus !== 'granted') {
        appAlert(
          'Permissions Required',
          'We need camera and photo library permissions to take or select photos.',
          [{ text: 'OK' }]
        );
        return false;
      }
    }
    return true;
  };

  const showImagePicker = () => {
    appAlert(
      "Select Photo",
      "Choose how you want to add a photo",
      [
        {
          text: "Camera",
          onPress: takePhoto,
        },
        {
          text: "Photo Library",
          onPress: pickImage,
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ]
    );
  };

  const takePhoto = async () => {
    try {
      setLoading(true);
      
      const hasPermission = await requestPermissions();
      if (!hasPermission) return;

      const result = await ImagePickerExpo.launchCameraAsync({
        mediaTypes: ImagePickerExpo.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        onChange(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Error taking photo:", error);
      appAlert("Error", "Failed to take photo. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    try {
      setLoading(true);
      
      const hasPermission = await requestPermissions();
      if (!hasPermission) return;

      const result = await ImagePickerExpo.launchImageLibraryAsync({
        mediaTypes: ImagePickerExpo.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        onChange(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Error picking image:", error);
      appAlert("Error", "Failed to select image. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const removeImage = () => {
    onChange(null);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={[styles.label, labelStyle]}>{label}</Text>}
      
      {value ? (
        <Card style={styles.imageContainer}>
          <Image source={{ uri: value }} style={styles.image} />
          <TouchableOpacity 
            style={styles.removeButton}
            onPress={removeImage}
          >
            <X size={20} color={Colors.white} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.changeButton}
            onPress={showImagePicker}
          >
            <Text style={styles.changeButtonText}>Change Photo</Text>
          </TouchableOpacity>
        </Card>
      ) : (
        <TouchableOpacity 
          style={[
            styles.placeholderContainer,
            { borderColor: error ? Colors.danger : Colors.border }
          ]}
          onPress={showImagePicker}
          disabled={loading}
          activeOpacity={0.7}
        >
          <View style={styles.placeholderContent}>
            {loading ? (
              <Text style={styles.placeholderText}>Loading...</Text>
            ) : (
              <>
                <View style={styles.iconContainer}>
                  <Camera size={32} color={Colors.primary} />
                  <ImageIcon size={24} color={Colors.primary} style={styles.overlayIcon} />
                </View>
                <Text style={styles.placeholderText}>{placeholder}</Text>
                <Text style={styles.placeholderSubtext}>Tap to take photo or select from gallery</Text>
              </>
            )}
          </View>
        </TouchableOpacity>
      )}

      {error && <Text style={[styles.error, errorStyle]}>{error}</Text>}
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
    color: Colors.textDark,
    fontWeight: "500",
  },
  placeholderContainer: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 12,
    backgroundColor: Colors.background,
    minHeight: 120,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderContent: {
    alignItems: "center",
    padding: 20,
  },
  iconContainer: {
    position: "relative",
    marginBottom: 12,
  },
  overlayIcon: {
    position: "absolute",
    bottom: -4,
    right: -4,
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 2,
  },
  placeholderText: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: "500",
    marginBottom: 4,
  },
  placeholderSubtext: {
    fontSize: 14,
    color: Colors.textLight,
    textAlign: "center",
  },
  imageContainer: {
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: 200,
    borderRadius: 12,
  },
  removeButton: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: Colors.danger,
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  changeButton: {
    position: "absolute",
    bottom: 8,
    left: 8,
    right: 8,
    backgroundColor: Colors.overlay,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  changeButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: "500",
  },
  error: {
    color: Colors.danger,
    fontSize: 14,
    marginTop: 4,
  },
});

export default ImagePicker;