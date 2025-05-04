import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Button,
  StyleSheet,
  ActivityIndicator,
  Alert,
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
import axios from "axios";
import * as ScreenOrientation from "expo-screen-orientation";

export const NoteTakingSpace: React.FC = () => {
  const [paths, setPaths] = useState<Path[]>([]);
  const [recognizedTextLines, setRecognizedTextLines] = useState<{ x: number; y: number; text: string }[]>([]);
  const [currentPath, setCurrentPath] = useState<Path | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [startPosition, setStartPosition] = useState<{ x: number; y: number } | null>(null);
  const [showRecognizedText, setShowRecognizedText] = useState(true);
  const ocrTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<useCanvasRef>(null);
  const font = useFont(require("../assets/fonts/QEMamasAndPapas.ttf"), 30);
  const googleApiKey = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;

  useEffect(() => {
    async function lockOrientation() {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.ALL);
    }
    lockOrientation();
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT);
    };
  }, []);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      const { locationX, locationY } = event.nativeEvent;
      const newPath = Skia.Path.Make();
      newPath.moveTo(locationX, locationY);
      setCurrentPath(newPath);
      setStartPosition({ x: locationX, y: locationY });
      if (ocrTimeoutRef.current) {
        clearTimeout(ocrTimeoutRef.current); // cancel OCR if user starts writing again
      }
    },
    onPanResponderMove: (event) => {
      if (currentPath) {
        const { locationX, locationY } = event.nativeEvent;
        currentPath.lineTo(locationX, locationY);
        setCurrentPath(currentPath.copy());
      }
    },
    onPanResponderRelease: async () => {
      if (currentPath && startPosition) {
        setPaths((prev) => [...prev, currentPath]);
        setCurrentPath(null);
        // wait a bit for Skia to render
        setTimeout(() => {
          recognizeTextWithGoogleOCR(startPosition);
          setPaths([]); // clear after recognition
        }, 1500); // 100ms is usually enough
      }
    },
    
    onPanResponderTerminationRequest: () => false,
  });

  const captureCanvas = async (): Promise<string | null> => {
    setShowRecognizedText(false); // hide text temporarily
    await new Promise((res) => setTimeout(res, 100)); // small delay to allow render to update

    const snapshot = canvasRef.current?.makeImageSnapshot();
    if (!snapshot) {
      setShowRecognizedText(true);
      return null;
    }

    const base64Data = snapshot.encodeToBase64();
    const filePath = `${FileSystem.documentDirectory}handwriting_${Date.now()}.png`;
    try {
      await FileSystem.writeAsStringAsync(filePath, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return filePath;
    } catch {
      return null;
    } finally {
      setShowRecognizedText(true); // show text again
    }
  };

  const recognizeTextWithGoogleOCR = async (position: { x: number; y: number }): Promise<void> => {
    setIsProcessing(true);
    try {
      const filePath = await captureCanvas();
      if (!filePath) throw new Error("Failed to capture image");
      const base64Image = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const requestBody = {
        requests: [
          {
            image: { content: base64Image },
            features: [{ type: "TEXT_DETECTION" }],
            imageContext: { languageHints: ["en"] },
          },
        ],
      };

      const response = await axios.post(
        `https://vision.googleapis.com/v1/images:annotate?key=${googleApiKey}`,
        requestBody
      );

      const text =
        response.data.responses[0]?.fullTextAnnotation?.text?.trim() || "";
      if (text) {
        setRecognizedTextLines((prev) => [...prev, { ...position, text }]);
      }
    } catch (err) {
      Alert.alert("OCR Error", "Could not process text");
    } finally {
      setIsProcessing(false);
    }
  };

  const clearCanvas = () => {
    setPaths([]);
    setRecognizedTextLines([]);
    setStartPosition(null);
    if (ocrTimeoutRef.current) clearTimeout(ocrTimeoutRef.current);
  };

  return (
    <View style={styles.container}>
      <View style={styles.canvasContainer}>
        <Canvas style={styles.canvas} ref={canvasRef} {...panResponder.panHandlers}>
          <Fill color="white" />
          {paths.map((path, index) => (
            <Path key={index} path={path} color="black" style="stroke" strokeWidth={2} />
          ))}
          {currentPath && (
            <Path path={currentPath} color="black" style="stroke" strokeWidth={2} />
          )}
          {showRecognizedText &&
            recognizedTextLines.map((line, idx) =>
              font ? (
                <SkiaText
                  key={idx}
                  x={line.x}
                  y={line.y}
                  text={line.text}
                  font={font}
                  color="black"
                />
              ) : null
            )}
        </Canvas>
      </View>

      <View style={styles.buttons}>
        <Button title="Clear" onPress={clearCanvas} />
      </View>
      {isProcessing && <ActivityIndicator size="large" color="blue" />}
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
    height: "100%",
  },
  buttons: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    padding: 10,
  },
});
