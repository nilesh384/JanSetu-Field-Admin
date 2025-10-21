import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  Alert,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { storage } from '../../utils/storage';
import { reportService } from '../../services/report.service';
import { Admin, DashboardStats, Report } from '../../types';
import { COLORS, CATEGORIES } from '../../constants';

const { width } = Dimensions.get('window');

export default function DashboardScreen() {
  const router = useRouter();
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [todayReports, setTodayReports] = useState<Report[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    loadData();
    
    // Update time every minute
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  const loadData = async () => {
    try {
      const adminData = await storage.getAdmin();
      if (!adminData) {
        router.replace('/login');
        return;
      }
      setAdmin(adminData);

      // Load dashboard stats and today's reports (activity endpoint doesn't exist)
      const [statsRes, todayRes] = await Promise.all([
        reportService.getDashboardStats(adminData.id).catch(e => ({ success: false, error: e })),
        reportService.getTodayReports(adminData.id).catch(e => ({ success: false, error: e })),
      ]);

      if (statsRes.success && 'data' in statsRes) {
        setStats(statsRes.data);
      }
      if (todayRes.success && 'data' in todayRes) {
        setTodayReports(todayRes.data);
        // Create mock recent activity from today's reports for display
        const mockActivity = todayRes.data.slice(0, 3).map((report: Report) => ({
          id: report.id,
          action: report.status === 'resolved' ? 'completed' : report.status === 'in_progress' ? 'started' : 'assigned',
          reportTitle: report.title,
          createdAt: report.updatedAt || report.createdAt,
        }));
        setRecentActivity(mockActivity);
      }
    } catch (error) {
      console.error('Error loading dashboard:', error);
      Alert.alert('Error', 'Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const getPriorityColor = (priority: string) => {
    return COLORS.priority[priority as keyof typeof COLORS.priority] || COLORS.gray[500];
  };

  const getStatusColor = (status: string) => {
    return COLORS.status[status as keyof typeof COLORS.status] || COLORS.gray[500];
  };

  const getCompletionRate = () => {
    if (!stats || stats.totalAssigned === 0) return 0;
    return Math.round((stats.completedThisMonth / stats.totalAssigned) * 100);
  };

  const getTimeOfDayGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const getPriorityDistribution = () => {
    if (!todayReports || todayReports.length === 0) return [];
    const priorityCount = { critical: 0, high: 0, medium: 0, low: 0 };
    todayReports.forEach(report => {
      priorityCount[report.priority as keyof typeof priorityCount]++;
    });
    return Object.entries(priorityCount).map(([priority, count]) => ({
      priority,
      count,
      color: getPriorityColor(priority),
      percentage: Math.round((count / todayReports.length) * 100)
    }));
  };

  const getCategoryIcon = (category: string): keyof typeof MaterialCommunityIcons.glyphMap => {
    const iconMap: { [key: string]: keyof typeof MaterialCommunityIcons.glyphMap } = {
      'Public Safety & Emergency': 'shield-alert',
      'Water Supply & Sewerage': 'water',
      'Traffic & Transport': 'car',
      'Municipal Urban Planning & Encroachment Removal': 'city',
      'Street Lighting & Electrical': 'lightbulb',
      'Roads & Infrastructure': 'road',
      'Public Health & Hygiene': 'medical-bag',
      'Others': 'cog'
    };
    return iconMap[category] || 'cog';
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
      {/* Enhanced Welcome Section */}
      <View style={styles.welcomeSection}>
        <View style={styles.greetingRow}>
          <View>
            <Text style={styles.greetingText}>{getTimeOfDayGreeting()},</Text>
            <Text style={styles.nameText}>{admin?.fullName}</Text>
            <Text style={styles.departmentText}>{admin?.department}</Text>
          </View>
          <View style={styles.timeContainer}>
            <Text style={styles.timeText}>
              {currentTime.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
            <Text style={styles.dateText}>
              {currentTime.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </Text>
          </View>
        </View>
      </View>

      {/* Enhanced Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { backgroundColor: COLORS.primary }]}>
          <View style={styles.statIconContainer}>
            <Ionicons name="briefcase" size={28} color={COLORS.white} />
          </View>
          <Text style={styles.statValue}>{stats?.totalAssigned || 0}</Text>
          <Text style={styles.statLabel}>Total Assigned</Text>
        </View>

        <View style={[styles.statCard, { backgroundColor: COLORS.warning }]}>
          <View style={styles.statIconContainer}>
            <Ionicons name="time" size={28} color={COLORS.white} />
          </View>
          <Text style={styles.statValue}>{stats?.pending || 0}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>

        <View style={[styles.statCard, { backgroundColor: COLORS.status.in_progress }]}>
          <View style={styles.statIconContainer}>
            <Ionicons name="construct" size={28} color={COLORS.white} />
          </View>
          <Text style={styles.statValue}>{stats?.inProgress || 0}</Text>
          <Text style={styles.statLabel}>In Progress</Text>
        </View>

        <View style={[styles.statCard, { backgroundColor: COLORS.success }]}>
          <View style={styles.statIconContainer}>
            <Ionicons name="checkmark-circle" size={28} color={COLORS.white} />
          </View>
          <Text style={styles.statValue}>{stats?.completedToday || 0}</Text>
          <Text style={styles.statLabel}>Completed Today</Text>
        </View>
      </View>

      {/* Performance Overview */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Performance Overview</Text>
        <View style={styles.performanceCard}>
          <View style={styles.performanceHeader}>
            <Text style={styles.performanceTitle}>Monthly Progress</Text>
            <View style={styles.completionBadge}>
              <Text style={styles.completionText}>{getCompletionRate()}%</Text>
            </View>
          </View>
          
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill, 
                { width: `${getCompletionRate()}%` }
              ]} 
            />
          </View>

          <View style={styles.performanceRow}>
            <Text style={styles.performanceLabel}>Completed This Week</Text>
            <Text style={styles.performanceValue}>{stats?.completedThisWeek || 0}</Text>
          </View>
          <View style={styles.performanceRow}>
            <Text style={styles.performanceLabel}>Completed This Month</Text>
            <Text style={styles.performanceValue}>{stats?.completedThisMonth || 0}</Text>
          </View>
          <View style={styles.performanceRow}>
            <Text style={styles.performanceLabel}>Avg. Response Time</Text>
            <Text style={styles.performanceValue}>
              {stats?.avgTimeSpent ? `${Math.round(stats.avgTimeSpent)} min` : 'N/A'}
            </Text>
          </View>
        </View>
      </View>

      {/* Priority Distribution */}
      {todayReports.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today's Priority Breakdown</Text>
          <View style={styles.priorityCard}>
            {getPriorityDistribution().map(({ priority, count, color, percentage }) => (
              <View key={priority} style={styles.priorityRow}>
                <View style={styles.priorityInfo}>
                  <View style={[styles.priorityDot, { backgroundColor: color }]} />
                  <Text style={styles.priorityLabel}>{priority.charAt(0).toUpperCase() + priority.slice(1)}</Text>
                </View>
                <View style={styles.priorityStats}>
                  <Text style={styles.priorityCount}>{count}</Text>
                  <Text style={styles.priorityPercent}>({percentage}%)</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Today's Reports */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Today's Reports</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/reports')}>
            <Text style={styles.viewAllLink}>View All →</Text>
          </TouchableOpacity>
        </View>

        {todayReports.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={COLORS.gray[400]} />
            <Text style={styles.emptyText}>No reports assigned for today</Text>
            <Text style={styles.emptySubtext}>Check back later or view all reports</Text>
          </View>
        ) : (
          todayReports.slice(0, 5).map((report) => (
            <TouchableOpacity
              key={report.id}
              style={styles.reportCard}
              onPress={() => router.push(`/report/${report.id}`)}
            >
              <View style={styles.reportHeader}>
                <View style={styles.reportMeta}>
                  <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(report.priority) }]}>
                    <Text style={styles.priorityText}>{report.priority.toUpperCase()}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(report.status) }]}>
                    <Text style={styles.statusText}>{report.status.replace('_', ' ').toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.reportTime}>{formatTime(report.createdAt)}</Text>
              </View>
              
              <Text style={styles.reportTitle}>{report.title}</Text>
              
              <View style={styles.reportCategory}>
                <MaterialCommunityIcons 
                  name={getCategoryIcon(report.category)} 
                  size={16} 
                  color={COLORS.gray[600]} 
                />
                <Text style={styles.categoryText}>{report.category}</Text>
              </View>
              
              {report.address && (
                <View style={styles.locationRow}>
                  <Ionicons name="location" size={16} color={COLORS.gray[500]} />
                  <Text style={styles.locationText} numberOfLines={1}>{report.address}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <View style={styles.activityCard}>
            {recentActivity.map((activity, index) => (
              <View key={index} style={styles.activityItem}>
                <View style={styles.activityIcon}>
                  <Ionicons 
                    name={activity.action === 'started' ? 'play' : activity.action === 'completed' ? 'checkmark' : 'create'} 
                    size={16} 
                    color={COLORS.primary} 
                  />
                </View>
                <View style={styles.activityContent}>
                  <Text style={styles.activityText}>
                    {activity.action === 'started' && 'Started work on'}
                    {activity.action === 'completed' && 'Completed'}
                    {activity.action === 'updated' && 'Updated progress on'}
                    {' '}
                    <Text style={styles.activityTitle}>{activity.reportTitle}</Text>
                  </Text>
                  <Text style={styles.activityTime}>{formatTime(activity.createdAt)}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Enhanced Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActionsGrid}>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => router.push('/(tabs)/reports')}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: COLORS.primary + '20' }]}>
              <Ionicons name="list" size={32} color={COLORS.primary} />
            </View>
            <Text style={styles.quickActionText}>All Reports</Text>
            <Text style={styles.quickActionSubtext}>View & manage</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => router.push('/(tabs)/map')}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: COLORS.success + '20' }]}>
              <Ionicons name="map" size={32} color={COLORS.success} />
            </View>
            <Text style={styles.quickActionText}>Map View</Text>
            <Text style={styles.quickActionSubtext}>Location overview</Text>
          </TouchableOpacity>
        </View>
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
    backgroundColor: COLORS.background,
  },
  welcomeSection: {
    backgroundColor: COLORS.primary,
    padding: 24,
    paddingTop: 24,
  },
  greetingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greetingText: {
    fontSize: 16,
    color: COLORS.white,
    opacity: 0.9,
  },
  nameText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.white,
    marginTop: 4,
  },
  departmentText: {
    fontSize: 14,
    color: COLORS.white,
    opacity: 0.8,
    marginTop: 4,
  },
  timeContainer: {
    alignItems: 'flex-end',
  },
  timeText: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.white,
  },
  dateText: {
    fontSize: 12,
    color: COLORS.white,
    opacity: 0.8,
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: (width - 48) / 2,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.white,
    opacity: 0.9,
    textAlign: 'center',
    fontWeight: '500',
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.gray[900],
  },
  viewAllLink: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
  performanceCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  performanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  performanceTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray[800],
  },
  completionBadge: {
    backgroundColor: COLORS.success,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  completionText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  progressBar: {
    height: 8,
    backgroundColor: COLORS.gray[200],
    borderRadius: 4,
    marginBottom: 20,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.success,
    borderRadius: 4,
  },
  performanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[100],
  },
  performanceLabel: {
    fontSize: 14,
    color: COLORS.gray[600],
  },
  performanceValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray[900],
  },
  priorityCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  priorityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  priorityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  priorityDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  priorityLabel: {
    fontSize: 14,
    color: COLORS.gray[700],
    fontWeight: '500',
  },
  priorityStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priorityCount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.gray[900],
  },
  priorityPercent: {
    fontSize: 12,
    color: COLORS.gray[500],
  },
  emptyState: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.gray[600],
    marginTop: 12,
    fontWeight: '500',
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.gray[400],
    marginTop: 4,
  },
  reportCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  reportMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  reportTime: {
    fontSize: 12,
    color: COLORS.gray[500],
    fontWeight: '500',
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray[900],
    marginBottom: 8,
    lineHeight: 22,
  },
  reportCategory: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  categoryText: {
    fontSize: 14,
    color: COLORS.gray[600],
    fontWeight: '500',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 12,
    color: COLORS.gray[500],
    flex: 1,
  },
  activityCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  activityItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[100],
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    fontSize: 14,
    color: COLORS.gray[600],
    lineHeight: 20,
  },
  activityTitle: {
    fontWeight: '600',
    color: COLORS.gray[900],
  },
  activityTime: {
    fontSize: 12,
    color: COLORS.gray[400],
    marginTop: 2,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  quickActionButton: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  quickActionIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray[900],
    marginBottom: 4,
  },
  quickActionSubtext: {
    fontSize: 12,
    color: COLORS.gray[500],
  },
});
