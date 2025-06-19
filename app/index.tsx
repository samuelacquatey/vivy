import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Button,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Text,
  Image,
  PanResponder,
} from "react-native";
import {
  Canvas,
  Skia,
  Path,
  useCanvasRef,
  Text as SkiaText,
  Fill,
  useFont,
} from "@shopify/react-native-skia";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import axios from "axios";
import * as ScreenOrientation from "expo-screen-orientation";
import { API_KEY } from "../config";

export const NoteTakingSpace: React.FC = () => {
  const [paths, setPaths] = useState<Path[]>([]);
  const [redoStack, setRedoStack] = useState<Path[]>([]);
  const [recognizedText, setRecognizedText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentPath, setCurrentPath] = useState<Path | null>(null);
  const canvasRef = useRef<useCanvasRef>(null);
  const [lastTouch, setLastTouch] = useState<{ x: number; y: number } | null>(null);
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null); // ✅ Added
  const font = useFont(require("../assets/fonts/SpaceMono-Regular.ttf"), 30);
  const [showRecognizedText, setShowRecognizedText] = useState(true);

  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    async function changeScreenOrientation() {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.ALL);
    }
    changeScreenOrientation();
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT);
    };
  }, []);

  useEffect(() => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }
    if (paths.length > 0) {
      typingTimerRef.current = setTimeout(() => {
        recognizeTextWithGoogleOCR();
      }, 1000);
    }
    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
    };
  }, [paths]);

  const shareImage = async () => {
    const filePath = await captureCanvas();
    if (filePath && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(filePath);
    } else {
      Alert.alert("Error", "Sharing is not available on this device or capture failed.");
    }
  };

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
    onPanResponderRelease: (event) => {
      const { locationX, locationY } = event.nativeEvent;
      setLastTouch({ x: locationX, y: locationY });
      if (currentPath) {
        setPaths((prev) => [...prev, currentPath]);
        setRedoStack([]);
      }
      setCurrentPath(null);
    },
  });

  const undoLastPath = () => {
    if (paths.length > 0) {
      setRedoStack((prev) => [...prev, paths[paths.length - 1]]);
      setPaths((prev) => prev.slice(0, -1));
    }
  };

  const redoLastPath = () => {
    if (redoStack.length > 0) {
      setPaths((prev) => [...prev, redoStack[redoStack.length - 1]]);
      setRedoStack((prev) => prev.slice(0, -1));
    }
  };

  const clearCanvas = () => {
    setPaths([]);
    setCurrentPath(null);
    setRedoStack([]);
    setRecognizedText("");
    setCapturedImageUri(null); // optional cleanup
  };

  const captureCanvas = async (): Promise<string | null> => {
    setShowRecognizedText(false);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const snapshot = canvasRef.current?.makeImageSnapshot();
    setShowRecognizedText(true);

    if (!canvasRef.current || !snapshot) {
      Alert.alert("Error", "Failed to capture drawing");
      return null;
    }

    const base64Data = snapshot.encodeToBase64();
    if (!base64Data) {
      Alert.alert("Error", "Failed to encode snapshot");
      return null;
    }

    const filePath = `${FileSystem.documentDirectory}handwriting_${Date.now()}.png`;
    try {
      await FileSystem.writeAsStringAsync(filePath, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });
      setCapturedImageUri(filePath); // ✅ Save for display
    } catch (error) {
      console.log("Error saving image:", error);
      return null;
    }

    return filePath;
  };

  const recognizeTextWithGoogleOCR = async (): Promise<void> => {
    setIsProcessing(true);
    setRecognizedText("");

    try {
      const filePath = await captureCanvas();
      if (!filePath) throw new Error("Image capture failed");

      const base64Image = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const requestBody = {
        requests: [
          {
            image: { content: base64Image },
            features: [{ type: "TEXT_DETECTION" }],
            imageContext: {
              languageHints: ["en"],
            },
          },
        ],
      };

      const response = await axios.post(
        `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`,
        requestBody
      );

      const text =
        response.data.responses[0]?.fullTextAnnotation?.text || "No text recognized";
      setRecognizedText(text);
    } catch (error) {
      console.error("OCR Error:", error);
      Alert.alert("Error", "Failed to recognize handwriting");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.canvasContainer} {...panResponder.panHandlers}>
        <Canvas style={styles.canvas} ref={canvasRef}>
          <Fill color="white" />
          {paths.map((path, index) => (
            <Path key={index} path={path} color="black" style="stroke" strokeWidth={2} />
          ))}
          {currentPath && (
            <Path path={currentPath} color="black" style="stroke" strokeWidth={2} />
          )}
          {recognizedText && lastTouch && font && (
            <SkiaText
              x={lastTouch.x}
              y={lastTouch.y - 75}
              text={recognizedText}
              font={font}
              color="black"
            />
          )}
        </Canvas>
      </View>

      <View style={styles.buttons}>
        <Button title="Undo" onPress={undoLastPath} />
        <Button title="Redo" onPress={redoLastPath} />
        <Button title="Clear" onPress={clearCanvas} />
        <Button title="Recognize Text" onPress={recognizeTextWithGoogleOCR} />
        <Button title="Share Image" onPress={shareImage} />
      </View>

      {capturedImageUri && (
        <Image source={{ uri: capturedImageUri }} style={styles.capturedImage} />
      )}
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
    height: 400,
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
