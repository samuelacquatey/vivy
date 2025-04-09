import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Your routes are automatically handled by expo-router */}
    </Stack>
  );
}
