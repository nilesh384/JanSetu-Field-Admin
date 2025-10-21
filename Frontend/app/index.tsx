import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { storage } from '../utils/storage';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { COLORS } from '../constants';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const admin = await storage.getAdmin();
    if (admin) {
      router.replace('/(tabs)');
    } else {
      router.replace('/login');
    }
  };

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});
