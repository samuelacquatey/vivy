import React, { useState, useEffect, useRef } from "react";
import { View, Button, StyleSheet, ActivityIndicator, Alert, Text, Image } from "react-native";
import { Canvas, Skia, Path, useCanvasRef } from "@shopify/react-native-skia";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import axios from "axios";
import * as ScreenOrientation from "expo-screen-orientation";
import { PanResponder } from "react-native";
import { API_KEY } from "../config";

export const NoteTakingSpace: React.FC = () => {
  const [paths, setPaths] = useState<Path[]>([]);
  const [currentPath, setCurrentPath] = useState<Path | null>(null);
  const [redoStack, setRedoStack] = useState<Path[]>([]);
  const [recognizedText, setRecognizedText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
  const canvasRef = useCanvasRef();
  const captureTimeout = useRef<NodeJS.Timeout | null>(null);

  // Lock screen orientation on mount
  useEffect(() => {
    async function changeScreenOrientation() {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.ALL);
    }
    changeScreenOrientation();
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT);
    };
  }, []);

  // PanResponder for drawing on canvas
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      const { locationX, locationY } = event.nativeEvent;
      const newPath = Skia.Path.Make();
      newPath.moveTo(locationX, locationY);
      setCurrentPath(newPath);
    },
    onPanResponderMove: (event) => {
      if (currentPath) {
        const { locationX, locationY } = event.nativeEvent;
        const updatedPath = currentPath.copy();
        updatedPath.lineTo(locationX, locationY);
        setCurrentPath(updatedPath);
      }
    },
    onPanResponderRelease: () => {
      if (currentPath) {
        setPaths((prev) => [...prev, currentPath.copy()]);
        setCurrentPath(null);
        setRedoStack([]);
      }
    },
  });

  // Undo the last path
  const undoLastPath = () => {
    if (paths.length > 0) {
      setRedoStack((prev) => [...prev, paths[paths.length - 1]]);
      setPaths((prev) => prev.slice(0, -1));
    }
  };

  // Redo the last undone path
  const redoLastPath = () => {
    if (redoStack.length > 0) {
      setPaths((prev) => [...prev, redoStack[redoStack.length - 1]]);
      setRedoStack((prev) => prev.slice(0, -1));
    }
  };

  // Clear the canvas
  const clearCanvas = () => {
    setPaths([]);
    setCurrentPath(null);
    setRedoStack([]);
  };

  // Capture canvas as an image
  const captureCanvas = async (): Promise<string | null> => {
    if (!canvasRef.current) {
      console.log("Error: canvasRef is null");
      return null;
    }

    console.log("Capturing canvas...");

    // Introduce a small delay to ensure rendering
    await new Promise((resolve) => setTimeout(resolve, 100));

    const snapshot = canvasRef.current.makeImageSnapshot();
    if (!snapshot) {
      console.log("Error: makeImageSnapshot() returned null");
      Alert.alert("Error", "Failed to capture drawing");
      return null;
    }
    console.log("Snapshot created successfully");

    const filePath = `${FileSystem.documentDirectory}handwriting_${Date.now()}.png`;
    console.log("Saving image to:", filePath);
    try {
      console.log("Image saved successfully");
      setCapturedImageUri(filePath);
    } catch (error) {
      console.log("Error saving image:", error);
      return null;
    }

    return filePath;
  };

  // Share the captured image
  const shareImage = async () => {
    const filePath = await captureCanvas();
    if (filePath) {
      await Sharing.shareAsync(filePath);
    } else {
      Alert.alert("No Image", "Failed to capture an image for sharing.");
    }
  };

  // Google OCR Function
  const recognizeTextWithGoogleOCR = async (): Promise<void> => {
    if (!API_KEY) {
      Alert.alert("Error", "Google API key not configured. See instructions.");
      return;
    }

    setIsProcessing(true);
    setRecognizedText("");
    console.log("Starting OCR process...");

    try {
      const filePath: string | null = await captureCanvas();
      if (!filePath) throw new Error("Image capture failed");
      console.log("Canvas captured successfully. File path:", filePath);

      const base64Image: string = await FileSystem.readAsStringAsync(filePath, { encoding: FileSystem.EncodingType.Base64 });
      console.log("Base64 image data retrieved successfully. Length:", base64Image.length);

      const requestBody = {
        requests: [
          {
            image: { content: base64Image },
            features: [{ type: "TEXT_DETECTION" }],
          },
        ],
      };
      console.log("Sending OCR request to Google Vision API...");

      const response = await axios.post(
        `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`,
        requestBody
      );
      console.log("OCR Response received:", JSON.stringify(response.data, null, 2));

      const text: string = response.data.responses[0]?.fullTextAnnotation?.text || "No text recognized";
      console.log("Extracted text:", text);
      setRecognizedText(text);
    } catch (error) {
      console.error("OCR Error:", error);
      Alert.alert("Error", "Failed to recognize handwriting. Please ensure your API key is valid and the image contains clear handwriting.");
    } finally {
      setIsProcessing(false);
      console.log("OCR process completed.");
    }
  };

  return (
    <View style={styles.container}>
      {/* Drawing canvas */}
      <View style={styles.canvasContainer} {...panResponder.panHandlers}>
        <Canvas style={styles.canvas} ref={canvasRef}>
          {paths.map((path, index) => (
            <Path key={index} path={path} color="black" style="stroke" strokeWidth={2} />
          ))}
          {currentPath && <Path path={currentPath} color="black" style="stroke" strokeWidth={2} />}
        </Canvas>
      </View>
      {/* Drawing control buttons */}
      <View style={styles.buttons}>
        <Button title="Undo" onPress={undoLastPath} />
        <Button title="Redo" onPress={redoLastPath} />
        <Button title="Clear" onPress={clearCanvas} />
        <Button title="Recognize Text" onPress={recognizeTextWithGoogleOCR} />
        <Button title="Share Image" onPress={shareImage} />
      </View>
      {/* Display captured image if available */}
      {capturedImageUri && <Image source={{ uri: capturedImageUri }} style={styles.capturedImage} />}
      {isProcessing && <ActivityIndicator size="large" color="blue" />}
      {recognizedText ? <Text style={styles.textOutput}>{recognizedText}</Text> : null}
    </View>
  );
};

export default NoteTakingSpace;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  canvasContainer: {
    flex: 1,
    width: "100%",
    backgroundColor: "white",
  },
  canvas: {
    flex: 1,
    width: "100%",
  },
  buttons: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    padding: 10,
  },
  capturedImage: {
    width: 300,
    height: 300,
    marginVertical: 10,
  },
  textOutput: {
    marginTop: 10,
    padding: 10,
    fontSize: 16,
    textAlign: "center",
  },
});