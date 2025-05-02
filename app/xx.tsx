// This is a scaffold for animating handwriting to OCR text at a cursor position using React Native Skia

import React, { useState, useRef } from "react";
import { View, StyleSheet, Button } from "react-native";
import {
  Canvas,
  Path,
  Skia,
  Fill,
  Text as SkiaText,
  useFont,
  useValue,
  runTiming,
  Easing,
  Group,
  mix,
} from "@shopify/react-native-skia";

export const AnimatedTextInsertionCanvas = () => {
  const [paths, setPaths] = useState([]); // All drawn paths
  const [ocrText, setOcrText] = useState("");
  const [cursor, setCursor] = useState({ x: 50, y: 100 });
  const fade = useValue(1); // For fading stroke
  const scale = useValue(1); // For shrinking stroke

  const font = useFont(require("../assets/fonts/QEMamasAndPapas.ttf"), 30); 

  const startAnimation = () => {
    // Animate fade and scale of handwriting
    runTiming(fade, 0, { duration: 800, easing: Easing.inOut(Easing.ease) });
    runTiming(scale, 0.5, { duration: 800, easing: Easing.inOut(Easing.ease) });
    // After delay, show OCR text
    setTimeout(() => {
      setOcrText("Recognized Text"); // Replace with OCR result
    }, 600);
  };

  const examplePath = Skia.Path.Make();
  examplePath.moveTo(20, 50);
  examplePath.lineTo(200, 80);

  return (
    <View style={styles.container}>
      <Canvas style={{ flex: 1 }}>
        <Fill color="white" />

        {/* Handwriting path animated */}
        <Group
          opacity={fade}
          transform={[{ scale }]} // Scale relative to origin (top-left), could use transformOrigin
        >
          <Path path={examplePath} color="black" style="stroke" strokeWidth={2} />
        </Group>

        {/* Insert OCR text at cursor */}
        {ocrText && font && (
          <SkiaText
            x={cursor.x}
            y={cursor.y}
            text={ocrText}
            font={font}
            color="black"
          />
        )}
      </Canvas>

      <Button title="Animate to Text" onPress={startAnimation} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
});

export default AnimatedTextInsertionCanvas;
