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
import { Canvas, Skia, Path, useCanvasRef, Text as SkiaText, Fill, useFont} from "@shopify/react-native-skia";
import * as FileSystem from "expo-file-system";
import axios from "axios";
import * as ScreenOrientation from "expo-screen-orientation";

export const NoteTakingSpace: React.FC = () => {
  const [paths, setPaths] = useState<Path[]>([]);
  const [redoStack, setRedoStack] = useState<Path[]>([]);
  const [recognizedText, setRecognizedText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentPath, setCurrentPath] = useState<Path | null>(null);
  const canvasRef = useRef<useCanvasRef>(null);
  const [lastTouch, setLastTouch] = useState<{ x: number; y: number } | null>(null);
  const font = useFont(require("../assets/fonts/QEMamasAndPapas.ttf"), 30); 
  const [showRecognizedText, setShowRecognizedText] = useState(true);
  const googleApiKey = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;

  // Debounce timer ref for auto OCR recognition.
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Lock orientation on mount
  useEffect(() => {
    async function changeScreenOrientation() {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.ALL);
    }
    changeScreenOrientation();
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT);
    };
  }, []);

  // Auto-trigger OCR recognition after drawing stops (debounce)
  useEffect(() => {
    // Clear any previous timer if exists
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }
    // If there are strokes, set a timeout to process OCR after a pause (e.g., 1000ms)
    if (paths.length > 0) {
      typingTimerRef.current = setTimeout(() => {
        recognizeTextWithGoogleOCR();
      }, 1000); // adjust delay as needed
    }
    // Cleanup on unmount or paths change
    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
    };
  }, [paths]);

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
        currentPath.lineTo(locationX, locationY);
        setCurrentPath(currentPath.copy());
      }
    },
    onPanResponderRelease: (event) => {
      const { locationX, locationY } = event.nativeEvent;
    
      // Save position for OCR placement
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
  };
  
  const captureCanvas = async (): Promise<string | null> => {
    setShowRecognizedText(false); // temporarily hide text
  
    await new Promise((resolve) => setTimeout(resolve, 100)); // let UI update
  
    const snapshot = canvasRef.current?.makeImageSnapshot();
  
    setShowRecognizedText(true); // show text again

 
    if (!canvasRef.current) {
      console.log("Error: canvasRef is null");
      return null;
    }

  
    if (!snapshot) {
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
      const filePath: string | null = await captureCanvas();
      if (!filePath) throw new Error("Image capture failed");

      const base64Image: string = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const requestBody = {
        requests: [
          {
            image: { content: base64Image },
            features: [{ type: "TEXT_DETECTION" }],
            imageContext: {
              languageHints: ["en"], // 👈 Specifies only English
            },
          },
        ],
      };

      const response = await axios.post(
        `https://vision.googleapis.com/v1/images:annotate?key=${googleApiKey}`,
        requestBody
      );

      const text: string =
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
          {/* Add white background */}
          <Fill color="white" />
          {paths.map((path, index) => (
            <Path key={index} path={path} color="black" style="stroke" strokeWidth={2} />
          ))}
          {currentPath && (
            <Path path={currentPath} color="black" style="stroke" strokeWidth={2} />
          )}
          {recognizedText && lastTouch && font &&(
            <SkiaText
              x={lastTouch.x}
              y={lastTouch.y - 75} // ≈2cm above last touch
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
      </View>
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
    backgroundColor: "white", // Fallback for non-Skia rendering
  },
  canvas: {
    flex: 1,
    width: "100%",
    height: "100%",
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
