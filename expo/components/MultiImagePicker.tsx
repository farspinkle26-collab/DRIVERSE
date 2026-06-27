import React, { useState } from "react";
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  Image, 
  Alert,
  ViewStyle,
  TextStyle,
  Platform,
  ScrollView,
} from "react-native";
import { Camera, ImageIcon, X, Plus } from "lucide-react-native";
import * as ImagePickerExpo from "expo-image-picker";
import { useTheme } from "@/hooks/useThemeStore";
import Card from "./Card";

interface MultiImagePickerProps {
  label?: string;
  placeholder?: string;
  value: string[];
  onChange: (images: string[]) => void;
  error?: string;
  containerStyle?: ViewStyle;
  labelStyle?: TextStyle;
  errorStyle?: TextStyle;
  minImages?: number;
  maxImages?: number;
}

const MultiImagePicker: React.FC<MultiImagePickerProps> = ({
  label,
  placeholder = "Add photos",
  value,
  onChange,
  error,
  containerStyle,
  labelStyle,
  errorStyle,
  minImages = 1,
  maxImages = 3,
}) => {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);

  const requestPermissions = async () => {
    if (Platform.OS === 'web') {
      return true;
    }
    
    try {
      const { status: cameraStatus } = await ImagePickerExpo.requestCameraPermissionsAsync();
      const { status: mediaStatus } = await ImagePickerExpo.requestMediaLibraryPermissionsAsync();
      
      if (cameraStatus !== 'granted' || mediaStatus !== 'granted') {
        Alert.alert(
          'Permissions Required',
          'We need camera and photo library permissions to take or select photos.',
          [{ text: 'OK' }]
        );
        return false;
      }
    } catch (error) {
      console.error('Permission request error:', error);
      return false;
    }
    return true;
  };

  const showImagePicker = () => {
    console.log('showImagePicker called, current photos:', value.length, '/', maxImages);
    
    if (value.length >= maxImages) {
      Alert.alert("Maximum Photos", `You can only upload up to ${maxImages} photos.`);
      return;
    }

    if (Platform.OS === 'web') {
      // On web, directly open image library
      pickImage();
    } else {
      // On mobile, show options
      Alert.alert(
        "Add Photo",
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
    }
  };

  const takePhoto = async () => {
    try {
      setLoading(true);
      
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        setLoading(false);
        return;
      }

      const result = await ImagePickerExpo.launchCameraAsync({
        mediaTypes: ImagePickerExpo.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        base64: false,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const imageUri = result.assets[0].uri;
        console.log('Camera image selected:', imageUri);
        const newImages = [...value, imageUri];
        onChange(newImages);
      }
    } catch (error) {
      console.error("Error taking photo:", error);
      Alert.alert("Error", "Failed to take photo. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    try {
      setLoading(true);
      console.log('pickImage called');
      
      if (Platform.OS !== 'web') {
        const hasPermission = await requestPermissions();
        if (!hasPermission) {
          setLoading(false);
          return;
        }
      }

      const result = await ImagePickerExpo.launchImageLibraryAsync({
        mediaTypes: ImagePickerExpo.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        base64: false,
      });

      console.log('Image picker result:', result);

      if (!result.canceled && result.assets && result.assets[0]) {
        const imageUri = result.assets[0].uri;
        console.log('Gallery image selected:', imageUri);
        const newImages = [...value, imageUri];
        onChange(newImages);
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert("Error", "Failed to select image. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const removeImage = (index: number) => {
    const newImages = value.filter((_, i) => i !== index);
    onChange(newImages);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text style={[styles.label, { color: theme.textDark }, labelStyle]}>
          {label}
        </Text>
      )}
      
      <View style={styles.photoCounter}>
        <Text style={[styles.counterText, { color: theme.textLight }]}>
          {value.length}/{maxImages} photos
        </Text>
        {value.length < minImages && (
          <Text style={[styles.requiredText, { color: theme.danger }]}>
            (minimum {minImages} required)
          </Text>
        )}
      </View>

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContainer}
      >
        {value.map((imageUri, index) => (
          <Card key={index} style={[styles.imageContainer, { backgroundColor: theme.card }]}>
            <Image source={{ uri: imageUri }} style={styles.image} />
            <TouchableOpacity 
              style={[styles.removeButton, { backgroundColor: theme.danger }]}
              onPress={() => removeImage(index)}
            >
              <X size={16} color={theme.white} />
            </TouchableOpacity>
          </Card>
        ))}
        
        {value.length < maxImages && (
          <TouchableOpacity 
            style={[
              styles.addButton,
              { 
                borderColor: error ? theme.danger : theme.border,
                backgroundColor: theme.background,
              }
            ]}
            onPress={showImagePicker}
            disabled={loading}
            activeOpacity={0.7}
          >
            <View style={styles.addButtonContent}>
              {loading ? (
                <Text style={[styles.addButtonText, { color: theme.textLight }]}>
                  Loading...
                </Text>
              ) : (
                <>
                  <View style={[styles.iconContainer, { backgroundColor: theme.primary + "20" }]}>
                    <Plus size={24} color={theme.primary} />
                  </View>
                  <Text style={[styles.addButtonText, { color: theme.text }]}>
                    Add Photo
                  </Text>
                </>
              )}
            </View>
          </TouchableOpacity>
        )}
      </ScrollView>

      {value.length === 0 && (
        <TouchableOpacity 
          style={[
            styles.placeholderContainer,
            { 
              borderColor: error ? theme.danger : theme.border,
              backgroundColor: theme.background,
            }
          ]}
          onPress={showImagePicker}
          disabled={loading}
          activeOpacity={0.7}
        >
          <View style={styles.placeholderContent}>
            {loading ? (
              <Text style={[styles.placeholderText, { color: theme.textLight }]}>
                Loading...
              </Text>
            ) : (
              <>
                <View style={styles.placeholderIconContainer}>
                  <Camera size={32} color={theme.primary} />
                  <ImageIcon size={24} color={theme.primary} style={styles.overlayIcon} />
                </View>
                <Text style={[styles.placeholderText, { color: theme.text }]}>
                  {placeholder}
                </Text>
                <Text style={[styles.placeholderSubtext, { color: theme.textLight }]}>
                  Tap to take photo or select from gallery
                </Text>
                <Text style={[styles.placeholderSubtext, { color: theme.textLight }]}>
                  ({minImages}-{maxImages} photos required)
                </Text>
              </>
            )}
          </View>
        </TouchableOpacity>
      )}

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
    marginBottom: 8,
    fontWeight: "500",
  },
  photoCounter: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  counterText: {
    fontSize: 14,
    fontWeight: "500",
  },
  requiredText: {
    fontSize: 12,
    marginLeft: 8,
    fontStyle: "italic",
  },
  scrollContainer: {
    paddingRight: 16,
  },
  imageContainer: {
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
    marginRight: 12,
    width: 120,
    height: 120,
  },
  image: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
  },
  removeButton: {
    position: "absolute",
    top: 8,
    right: 8,
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  addButton: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 12,
    width: 120,
    height: 120,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  addButtonContent: {
    alignItems: "center",
    padding: 12,
  },
  iconContainer: {
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },
  placeholderContainer: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 12,
    minHeight: 120,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderContent: {
    alignItems: "center",
    padding: 20,
  },
  placeholderIconContainer: {
    position: "relative",
    marginBottom: 12,
  },
  overlayIcon: {
    position: "absolute",
    bottom: -4,
    right: -4,
    backgroundColor: "white",
    borderRadius: 12,
    padding: 2,
  },
  placeholderText: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 4,
  },
  placeholderSubtext: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 16,
  },
  error: {
    fontSize: 14,
    marginTop: 8,
  },
});

export default MultiImagePicker;