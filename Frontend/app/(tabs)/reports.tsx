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
import { storage } from '../../utils/storage';
import { reportService } from '../../services/report.service';
import { Report } from '../../types';
import { COLORS, PRIORITY_OPTIONS, STATUS_OPTIONS, CATEGORIES } from '../../constants';

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
      pending: reportsList.filter(r => r.status === 'pending').length,
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

    // Status filter
    if (selectedStatus) {
      filtered = filtered.filter((report) => report.status === selectedStatus);
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
    >
      <View style={styles.reportHeader}>
        <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(item.priority) }]}>
          <Text style={styles.priorityText}>{item.priority.toUpperCase()}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{item.status.replace('_', ' ').toUpperCase()}</Text>
        </View>
      </View>

      <Text style={styles.reportTitle}>{item.title}</Text>
      <Text style={styles.reportCategory}>{item.category}</Text>

      {item.address && (
        <View style={styles.locationRow}>
          <Ionicons name="location" size={16} color={COLORS.gray[500]} />
          <Text style={styles.locationText} numberOfLines={1}>
            {item.address}
          </Text>
        </View>
      )}

      <View style={styles.reportFooter}>
        <View style={styles.reportStats}>
          <Ionicons name="arrow-up" size={16} color={COLORS.gray[500]} />
          <Text style={styles.statText}>{item.upvotes}</Text>
          <Ionicons name="eye" size={16} color={COLORS.gray[500]} style={{ marginLeft: 12 }} />
          <Text style={styles.statText}>{item.viewCount}</Text>
        </View>
        <Text style={styles.reportDate}>
          {new Date(item.createdAt).toLocaleDateString()}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      
      {/* Header with Statistics */}
      <View style={styles.headerSection}>
        
        {/* Statistics Cards */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: COLORS.primary }]}>
            <Text style={styles.statValue}>{stats.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          
          <View style={[styles.statCard, { backgroundColor: COLORS.warning }]}>
            <Text style={styles.statValue}>{stats.pending}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          
          <View style={[styles.statCard, { backgroundColor: COLORS.primary }]}>
            <Text style={styles.statValue}>{stats.inProgress}</Text>
            <Text style={styles.statLabel}>In Progress</Text>
          </View>
          
          <View style={[styles.statCard, { backgroundColor: COLORS.success }]}>
            <Text style={styles.statValue}>{stats.completed}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
        </View>
      </View>

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
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={64} color={COLORS.gray[400]} />
            <Text style={styles.emptyText}>No reports found</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerSection: {
    backgroundColor: COLORS.white,
    padding: 20,
    paddingTop: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.gray[900],
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: COLORS.gray[600],
    marginBottom: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.white,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.white,
    opacity: 0.9,
    marginTop: 4,
    textAlign: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    margin: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  filtersContainer: {
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray[700],
    marginBottom: 8,
    marginTop: 8,
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.gray[100],
    borderWidth: 1,
    borderColor: COLORS.gray[200],
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.gray[700],
  },
  filterChipTextActive: {
    color: COLORS.white,
  },
  resultsHeader: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  resultsText: {
    fontSize: 14,
    color: COLORS.gray[600],
  },
  listContent: {
    padding: 16,
    paddingTop: 0,
  },
  reportCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  reportHeader: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  priorityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray[900],
    marginBottom: 4,
  },
  reportCategory: {
    fontSize: 14,
    color: COLORS.gray[600],
    marginBottom: 8,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  locationText: {
    fontSize: 12,
    color: COLORS.gray[500],
    flex: 1,
  },
  reportFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[100],
  },
  reportStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: COLORS.gray[500],
  },
  reportDate: {
    fontSize: 12,
    color: COLORS.gray[500],
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.gray[500],
    marginTop: 16,
  },
});
