import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  StatusBar,
  Dimensions,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import { storage } from '../../utils/storage';
import { reportService } from '../../services/report.service';
import { Report } from '../../types';
import { COLORS, PRIORITY_OPTIONS, STATUS_OPTIONS, CATEGORIES, getFieldAdminStatusLabel } from '../../constants';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';

const { width } = Dimensions.get('window');

export default function ReportsScreen() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [filteredReports, setFilteredReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
  });

  useEffect(() => {
    loadReports();
  }, []);

  useEffect(() => {
    filterReports();
  }, [reports, searchQuery, selectedPriority, selectedStatus]);

  const checkForPendingFilter = async () => {
    // Check if we should filter by status
    const filter = await storage.getItem('reportFilter');
    if (filter && typeof filter === 'string') {
      if (filter === 'all') {
        // Clear all filters to show all reports
        setSelectedStatus(null);
        setSelectedPriority(null);
        setShowFilters(false);
      } else {
        // Apply specific status filter
        setSelectedStatus(filter);
        setShowFilters(true);
      }
      // Clear the filter preference
      await storage.removeItem('reportFilter');
    }
  };

  // Check for pending filter when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      checkForPendingFilter();
    }, [])
  );

  const loadReports = async () => {
    try {
      const admin = await storage.getAdmin();
      if (!admin) {
        router.replace('/login');
        return;
      }

      const response = await reportService.getAssignedReports(admin.id);
      console.log('Reports response:', response);
      if (response.success && response.data) {
        const reportsData = Array.isArray(response.data) ? response.data : [];
        setReports(reportsData);
        calculateStats(reportsData);
      } else {
        setReports([]);
      }
    } catch (error) {
      console.error('Error loading reports:', error);
      setReports([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const calculateStats = (reportsList: Report[]) => {
    const statsData = {
      total: reportsList.length,
      pending: reportsList.filter(r => r.status === 'pending' || r.status === 'assigned').length,
      inProgress: reportsList.filter(r => r.status === 'in_progress').length,
      completed: reportsList.filter(r => r.status === 'resolved').length,
    };
    setStats(statsData);
  };

  const getPriorityColor = (priority: string) => {
    return COLORS.priority[priority as keyof typeof COLORS.priority] || COLORS.gray[500];
  };

  const getStatusColor = (status: string) => {
    return COLORS.status[status as keyof typeof COLORS.status] || COLORS.gray[500];
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

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const clearFilters = () => {
    setSelectedPriority(null);
    setSelectedStatus(null);
    setSearchQuery('');
  };

  const filterReports = () => {
    if (!reports || !Array.isArray(reports)) {
      setFilteredReports([]);
      return;
    }
    
    let filtered = [...reports];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (report) =>
          report.title.toLowerCase().includes(query) ||
          report.description.toLowerCase().includes(query) ||
          report.category.toLowerCase().includes(query) ||
          report.address?.toLowerCase().includes(query)
      );
    }

    // Priority filter
    if (selectedPriority) {
      filtered = filtered.filter((report) => report.priority === selectedPriority);
    }

    // Status filter - for field admin, treat 'assigned' and 'pending' as the same
    if (selectedStatus) {
      if (selectedStatus === 'pending') {
        // When filtering for 'pending', include both 'pending' and 'assigned' statuses
        filtered = filtered.filter((report) => report.status === 'pending' || report.status === 'assigned');
      } else {
        filtered = filtered.filter((report) => report.status === selectedStatus);
      }
    }

    // Sort by priority and date
    filtered.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder];
      const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder];
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    setFilteredReports(filtered);
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadReports();
  };

  const renderReport = ({ item }: { item: Report }) => (
    <TouchableOpacity
      style={styles.reportCard}
      onPress={() => router.push(`/report/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.reportHeader}>
        <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(item.priority) }]}>
          <Ionicons name="flag" size={10} color="#FFFFFF" style={{ marginRight: 4 }} />
          <Text style={styles.priorityText}>{item.priority.toUpperCase()}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{getFieldAdminStatusLabel(item.status)}</Text>
        </View>
      </View>

      <Text style={styles.reportTitle} numberOfLines={2}>{item.title}</Text>
      
      <View style={styles.categoryRow}>
        <MaterialCommunityIcons 
          name={getCategoryIcon(item.category)} 
          size={16} 
          color="#8B5CF6" 
        />
        <Text style={styles.reportCategory} numberOfLines={1}>{item.category}</Text>
      </View>

      {item.address && (
        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={14} color="#94A3B8" />
          <Text style={styles.locationText} numberOfLines={1}>
            {item.address}
          </Text>
        </View>
      )}

      <View style={styles.reportFooter}>
        <View style={styles.reportStats}>
          <View style={styles.statItem}>
            <Ionicons name="arrow-up-outline" size={16} color="#64748B" />
            <Text style={styles.statText}>{item.upvotes}</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="eye-outline" size={16} color="#64748B" />
            <Text style={styles.statText}>{item.viewCount}</Text>
          </View>
        </View>
        <View style={styles.dateContainer}>
          <Ionicons name="calendar-outline" size={12} color="#94A3B8" />
          <Text style={styles.reportDate}>
            {new Date(item.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric'
            })}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#6366F1" />
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#6366F1" />
      
      {/* Header with Gradient and Statistics */}
      <ExpoLinearGradient
        colors={['#6366F1', '#8B5CF6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerSection}
      >
        <Text style={styles.headerTitle}>My Reports</Text>
        <Text style={styles.headerSubtitle}>{reports.length} total reports assigned</Text>
      </ExpoLinearGradient>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={COLORS.gray[400]} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search reports..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <TouchableOpacity onPress={() => setShowFilters(!showFilters)}>
          <Ionicons
            name="options"
            size={24}
            color={showFilters ? COLORS.primary : COLORS.gray[400]}
          />
        </TouchableOpacity>
      </View>

      {/* Filters */}
      {showFilters && (
        <View style={styles.filtersContainer}>
          <Text style={styles.filterLabel}>Priority:</Text>
          <View style={styles.filterChips}>
            <TouchableOpacity
              style={[
                styles.filterChip,
                !selectedPriority && styles.filterChipActive,
              ]}
              onPress={() => setSelectedPriority(null)}
            >
              <Text style={[styles.filterChipText, !selectedPriority && styles.filterChipTextActive]}>
                All
              </Text>
            </TouchableOpacity>
            {PRIORITY_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.filterChip,
                  selectedPriority === option.value && styles.filterChipActive,
                ]}
                onPress={() => setSelectedPriority(option.value)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selectedPriority === option.value && styles.filterChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.filterLabel}>Status:</Text>
          <View style={styles.filterChips}>
            <TouchableOpacity
              style={[
                styles.filterChip,
                !selectedStatus && styles.filterChipActive,
              ]}
              onPress={() => setSelectedStatus(null)}
            >
              <Text style={[styles.filterChipText, !selectedStatus && styles.filterChipTextActive]}>
                All
              </Text>
            </TouchableOpacity>
            {STATUS_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.filterChip,
                  selectedStatus === option.value && styles.filterChipActive,
                ]}
                onPress={() => setSelectedStatus(option.value)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selectedStatus === option.value && styles.filterChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Results Count */}
      <View style={styles.resultsHeader}>
        <Text style={styles.resultsText}>
          {filteredReports.length} {filteredReports.length === 1 ? 'report' : 'reports'} found
        </Text>
      </View>

      {/* Reports List */}
      <FlatList
        data={filteredReports}
        renderItem={renderReport}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            colors={['#6366F1']}
            tintColor="#6366F1"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={64} color="#CBD5E1" />
            <Text style={styles.emptyText}>No reports found</Text>
            <Text style={styles.emptySubtext}>Try adjusting your filters</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  headerSection: {
    padding: 20,
    paddingTop: 40,
    paddingBottom: 6,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTitle: {
    fontSize: 28,
    textAlign: 'center',
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.85)',
    marginBottom: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 2,
    textAlign: 'center',
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    margin: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    gap: 12,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1E293B',
  },
  filtersContainer: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  resultsHeader: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  resultsText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  reportCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  reportHeader: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
    lineHeight: 22,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  reportCategory: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
    flex: 1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  locationText: {
    fontSize: 12,
    color: '#94A3B8',
    flex: 1,
  },
  reportFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  reportStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reportDate: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#64748B',
    marginTop: 16,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
  },
});
