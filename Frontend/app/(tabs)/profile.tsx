import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { storage } from '../../utils/storage';
import { Admin } from '../../types';
import { COLORS } from '../../constants';

export default function ProfileScreen() {
  const router = useRouter();
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const adminData = await storage.getAdmin();
      setAdmin(adminData);
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await storage.removeAdmin();
          router.replace('/login');
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!admin) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <ScrollView style={styles.scrollView}>
        {/* Profile Header */}
        <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <Ionicons name="person-circle" size={100} color={COLORS.primary} />
        </View>
        <Text style={styles.name}>{admin.fullName}</Text>
        <Text style={styles.email}>{admin.email}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{admin.role}</Text>
        </View>
      </View>

      {/* Info Cards */}
      <View style={styles.section}>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="briefcase" size={20} color={COLORS.gray[600]} />
            <Text style={styles.infoLabel}>Department</Text>
          </View>
          <Text style={styles.infoValue}>{admin.department}</Text>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="calendar" size={20} color={COLORS.gray[600]} />
            <Text style={styles.infoLabel}>Joined</Text>
          </View>
          <Text style={styles.infoValue}>
            {new Date(admin.createdAt).toLocaleDateString('en-US', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </Text>
        </View>

        {admin.lastLogin && (
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="time" size={20} color={COLORS.gray[600]} />
              <Text style={styles.infoLabel}>Last Login</Text>
            </View>
            <Text style={styles.infoValue}>
              {new Date(admin.lastLogin).toLocaleString('en-US', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>
        )}
      </View>

      {/* Settings Options */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Settings</Text>

        <TouchableOpacity style={styles.optionCard}>
          <View style={styles.optionLeft}>
            <Ionicons name="notifications" size={24} color={COLORS.primary} />
            <Text style={styles.optionText}>Notifications</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={COLORS.gray[400]} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.optionCard}>
          <View style={styles.optionLeft}>
            <Ionicons name="location" size={24} color={COLORS.primary} />
            <Text style={styles.optionText}>Location Settings</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={COLORS.gray[400]} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.optionCard}>
          <View style={styles.optionLeft}>
            <Ionicons name="shield-checkmark" size={24} color={COLORS.primary} />
            <Text style={styles.optionText}>Privacy</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={COLORS.gray[400]} />
        </TouchableOpacity>
      </View>

      {/* App Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>

        <TouchableOpacity style={styles.optionCard}>
          <View style={styles.optionLeft}>
            <Ionicons name="information-circle" size={24} color={COLORS.gray[600]} />
            <Text style={styles.optionText}>Help & Support</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={COLORS.gray[400]} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.optionCard}>
          <View style={styles.optionLeft}>
            <Ionicons name="document-text" size={24} color={COLORS.gray[600]} />
            <Text style={styles.optionText}>Terms & Conditions</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={COLORS.gray[400]} />
        </TouchableOpacity>

        <View style={styles.optionCard}>
          <View style={styles.optionLeft}>
            <Ionicons name="code-slash" size={24} color={COLORS.gray[600]} />
            <Text style={styles.optionText}>Version</Text>
          </View>
          <Text style={styles.versionText}>1.0.0</Text>
        </View>
      </View>

      {/* Logout Button */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out" size={24} color={COLORS.danger} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: COLORS.white,
    alignItems: 'center',
    padding: 24,
    paddingTop: 32,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.gray[900],
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: COLORS.gray[600],
    marginBottom: 12,
  },
  roleBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.white,
    textTransform: 'uppercase',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.gray[900],
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: COLORS.gray[600],
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray[900],
  },
  optionCard: {
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optionText: {
    fontSize: 16,
    color: COLORS.gray[900],
  },
  versionText: {
    fontSize: 14,
    color: COLORS.gray[500],
  },
  logoutButton: {
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.danger,
  },
});
