import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  StatusBar,
  Dimensions,
  TextInput,
  ScrollView,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import { storage } from '../../utils/storage';
import { reportService } from '../../services/report.service';
import { Report } from '../../types';
import { COLORS, PRIORITY_OPTIONS, STATUS_OPTIONS, getFieldAdminStatusLabel } from '../../constants';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

export default function MapScreen() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [filteredReports, setFilteredReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedPriority, setSelectedPriority] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mapType, setMapType] = useState<'standard' | 'satellite' | 'hybrid'>('standard');
  const [showReportModal, setShowReportModal] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  });

  useEffect(() => {
    loadLocationAndReports();
  }, []);

  useEffect(() => {
    if (reports.length > 0) {
      calculateStats(reports);
      filterReports();
    }
  }, [reports, searchQuery, selectedPriority, selectedStatus]);

  useEffect(() => {
    filterReports();
  }, [reports, searchQuery, selectedPriority, selectedStatus]);

  const loadLocationAndReports = async () => {
    try {
      // Request location permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to use the map');
        return;
      }

      // Get current location
      const currentLocation = await Location.getCurrentPositionAsync({});
      setLocation({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      });

      // Load assigned reports
      const admin = await storage.getAdmin();
      if (admin) {
        const response = await reportService.getAssignedReports(admin.id);
        if (response.success) {
          const reportsData = response.data.filter(report => 
            report.latitude && report.longitude
          );
          setReports(reportsData);
          calculateStats(reportsData);
        }
      }
    } catch (error) {
      console.error('Error loading map data:', error);
      Alert.alert('Error', 'Failed to load map data');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (reportsList: Report[]) => {
    const statsData = {
      total: reportsList.length,
      critical: reportsList.filter(r => r.priority === 'critical').length,
      high: reportsList.filter(r => r.priority === 'high').length,
      medium: reportsList.filter(r => r.priority === 'medium').length,
      low: reportsList.filter(r => r.priority === 'low').length,
    };
    setStats(statsData);
  };

  const filterReports = () => {
    let filtered = [...reports];

    // Search filter
    if (searchQuery.trim()) {
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

    setFilteredReports(filtered);
  };

  const getPriorityColor = (priority: string) => {
    const colors = {
      critical: '#ef4444',
      high: '#f97316',
      medium: '#eab308',
      low: '#22c55e'
    };
    return colors[priority as keyof typeof colors] || '#6b7280';
  };

  const focusOnReport = (report: Report) => {
    if (mapRef.current && report.latitude && report.longitude) {
      mapRef.current.animateToRegion({
        latitude: report.latitude,
        longitude: report.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
      setSelectedReport(report);
      setShowReportModal(true);
    }
  };

  const clearFilters = () => {
    setSelectedPriority(null);
    setSelectedStatus(null);
    setSearchQuery('');
  };

  const getMarkerColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return '#dc2626';
      case 'high':
        return '#ea580c';
      case 'medium':
        return '#f59e0b';
      case 'low':
        return '#10b981';
      default:
        return '#6b7280';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#6366F1" />
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  if (!location) {
    return (
      <View style={styles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#6366F1" />
        <Ionicons name="location-outline" size={64} color="#CBD5E1" />
        <Text style={styles.errorText}>Unable to get your location</Text>
        <Text style={styles.errorSubtext}>Please enable location services</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadLocationAndReports}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#6366F1" barStyle="light-content" />
      
      {/* Header Section with Statistics */}
      <ExpoLinearGradient
        colors={['#6366F1', '#8B5CF6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Reports Map</Text>
        <Text style={styles.headerSubtitle}>Track and manage all field reports</Text>
        
        {/* Statistics Cards */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.statsContainer}
          contentContainerStyle={styles.statsContent}
        >
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="clipboard-list-outline" size={20} color="#FFFFFF" />
            <Text style={styles.statValue}>{stats.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.statValue}>{stats.critical}</Text>
            <Text style={styles.statLabel}>Critical</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="trending-up" size={20} color="#FFFFFF" />
            <Text style={styles.statValue}>{stats.high}</Text>
            <Text style={styles.statLabel}>High</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="check-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.statValue}>{stats.low}</Text>
            <Text style={styles.statLabel}>Low</Text>
          </View>
        </ScrollView>

        {/* Search and Filter Section */}
        <View style={styles.searchFilterContainer}>
          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <MaterialCommunityIcons name="magnify" size={20} color="rgba(255, 255, 255, 0.9)" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search reports..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="rgba(255, 255, 255, 0.7)"
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <MaterialCommunityIcons name="close" size={20} color="rgba(255, 255, 255, 0.9)" />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Filter Button */}
          <TouchableOpacity 
            style={styles.filterButton}
            onPress={() => setShowFilterModal(true)}
          >
            <MaterialCommunityIcons name="filter-variant" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Map Type Toggle */}
          <TouchableOpacity 
            style={styles.mapTypeButton}
            onPress={() => setMapType(mapType === 'standard' ? 'satellite' : 'standard')}
          >
            <MaterialCommunityIcons 
              name={mapType === 'standard' ? 'satellite-variant' : 'map-outline'} 
              size={20} 
              color="#FFFFFF" 
            />
          </TouchableOpacity>
        </View>

        {/* Active Filters */}
        {(selectedPriority || selectedStatus || searchQuery) && (
          <View style={styles.activeFiltersContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {searchQuery ? (
                <View style={styles.filterChip}>
                  <Text style={styles.filterChipText}>Search: {searchQuery}</Text>
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <MaterialCommunityIcons name="close" size={16} color="#6366F1" />
                  </TouchableOpacity>
                </View>
              ) : null}
              {selectedPriority ? (
                <View style={styles.filterChip}>
                  <Text style={styles.filterChipText}>Priority: {selectedPriority}</Text>
                  <TouchableOpacity onPress={() => setSelectedPriority(null)}>
                    <MaterialCommunityIcons name="close" size={16} color="#6366F1" />
                  </TouchableOpacity>
                </View>
              ) : null}
              {selectedStatus ? (
                <View style={styles.filterChip}>
                  <Text style={styles.filterChipText}>Status: {selectedStatus}</Text>
                  <TouchableOpacity onPress={() => setSelectedStatus(null)}>
                    <MaterialCommunityIcons name="close" size={16} color="#6366F1" />
                  </TouchableOpacity>
                </View>
              ) : null}
              <TouchableOpacity style={styles.clearFiltersButton} onPress={clearFilters}>
                <Text style={styles.clearFiltersText}>Clear All</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}
      </ExpoLinearGradient>
      {/* Enhanced Map with Filtered Reports */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        mapType={mapType}
        initialRegion={{
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        showsUserLocation
        showsMyLocationButton
        toolbarEnabled={false}
        onMarkerPress={(event) => {
          const reportId = event.nativeEvent.id;
          const report = filteredReports.find(r => r.id === reportId);
          if (report) {
            setSelectedReport(report);
            setShowReportModal(true);
          }
        }}
      >
        {filteredReports.map((report) => (
          <Marker
            key={report.id}
            identifier={report.id}
            coordinate={{
              latitude: report.latitude,
              longitude: report.longitude,
            }}
            title={report.title}
            description={`${report.category} - ${report.priority} priority`}
            pinColor={getPriorityColor(report.priority)}
          >
            <View style={[styles.customMarker, { borderColor: getPriorityColor(report.priority) }]}>
              <MaterialCommunityIcons
                name="alert-circle"
                size={20}
                color={getPriorityColor(report.priority)}
              />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Filter Modal */}
      <Modal
        visible={showFilterModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.filterModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter Reports</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.secondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.filterContent}>
              {/* Priority Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Priority</Text>
                <View style={styles.filterOptions}>
                  {['critical', 'high', 'medium', 'low'].map((priority) => (
                    <TouchableOpacity
                      key={priority}
                      style={[
                        styles.filterOption,
                        selectedPriority === priority && styles.selectedFilterOption
                      ]}
                      onPress={() => setSelectedPriority(selectedPriority === priority ? null : priority)}
                    >
                      <View style={[styles.priorityIndicator, { backgroundColor: getPriorityColor(priority) }]} />
                      <Text style={[
                        styles.filterOptionText,
                        selectedPriority === priority && styles.selectedFilterText
                      ]}>
                        {priority.charAt(0).toUpperCase() + priority.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Status Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Status</Text>
                <View style={styles.filterOptions}>
                  {['pending', 'in-progress', 'resolved', 'closed'].map((status) => (
                    <TouchableOpacity
                      key={status}
                      style={[
                        styles.filterOption,
                        selectedStatus === status && styles.selectedFilterOption
                      ]}
                      onPress={() => setSelectedStatus(selectedStatus === status ? null : status)}
                    >
                      <Text style={[
                        styles.filterOptionText,
                        selectedStatus === status && styles.selectedFilterText
                      ]}>
                        {status.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.clearButton} onPress={clearFilters}>
                <Text style={styles.clearButtonText}>Clear All</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyButton} onPress={() => setShowFilterModal(false)}>
                <Text style={styles.applyButtonText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Report Details Modal */}
      <Modal
        visible={showReportModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowReportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.reportModal}>
            {selectedReport && (
              <>
                <View style={styles.reportModalHeader}>
                  <View style={styles.reportTitleContainer}>
                    <Text style={styles.reportModalTitle}>{selectedReport.title}</Text>
                    <View style={styles.reportBadges}>
                      <View style={[styles.reportPriorityBadge, { backgroundColor: getPriorityColor(selectedReport.priority) }]}>
                        <Text style={styles.badgeText}>{selectedReport.priority}</Text>
                      </View>
                      <View style={styles.statusBadge}>
                        <Text style={styles.statusBadgeText}>{getFieldAdminStatusLabel(selectedReport.status)}</Text>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setShowReportModal(false)}>
                    <MaterialCommunityIcons name="close" size={24} color={COLORS.secondary} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.reportModalContent}>
                  <Text style={styles.reportDescription}>{selectedReport.description}</Text>
                  
                  <View style={styles.reportDetails}>
                    <View style={styles.reportDetailRow}>
                      <MaterialCommunityIcons name="shape-outline" size={20} color={COLORS.secondary} />
                      <Text style={styles.reportDetailText}>Category: {selectedReport.category}</Text>
                    </View>
                    <View style={styles.reportDetailRow}>
                      <MaterialCommunityIcons name="map-marker-outline" size={20} color={COLORS.secondary} />
                      <Text style={styles.reportDetailText}>Location: {selectedReport.address || 'Location not available'}</Text>
                    </View>
                    <View style={styles.reportDetailRow}>
                      <MaterialCommunityIcons name="calendar-outline" size={20} color={COLORS.secondary} />
                      <Text style={styles.reportDetailText}>
                        Reported: {new Date(selectedReport.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.focusButton}
                    onPress={() => {
                      focusOnReport(selectedReport);
                      setShowReportModal(false);
                    }}
                  >
                    <MaterialCommunityIcons name="crosshairs-gps" size={20} color={COLORS.white} />
                    <Text style={styles.focusButtonText}>Focus on Map</Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F8FAFC',
  },
  errorText: {
    fontSize: 16,
    color: '#64748B',
    marginTop: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  errorSubtext: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#6366F1',
    borderRadius: 12,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  retryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  map: {
    flex: 1,
    marginBottom: 80,
  },
  marker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  infoCard: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  infoHeader: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  priorityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  reportTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 4,
  },
  reportCategory: {
    fontSize: 14,
    color: '#64748B',
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewButton: {
    backgroundColor: '#6366F1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  viewButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  legend: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  legendTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 8,
  },
  legendItems: {
    gap: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 11,
    color: '#64748B',
  },
  // Modern Header with Gradient
  header: {
    padding: 20,
    paddingTop: 40,
    paddingBottom: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.85)',
    marginBottom: 20,
  },
  statsContainer: {
    marginBottom: 16,
  },
  statsContent: {
    paddingHorizontal: 4,
  },
  statCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 4,
    minWidth: 90,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  criticalCard: {
    borderColor: 'rgba(255, 255, 255, 0.3)',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  highCard: {
    borderColor: 'rgba(255, 255, 255, 0.3)',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  lowCard: {
    borderColor: 'rgba(255, 255, 255, 0.3)',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 4,
  },
  statNumber: {
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
  searchFilterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: '#FFFFFF',
  },
  filterButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  mapTypeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  activeFiltersContainer: {
    marginTop: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    gap: 6,
  },
  filterChipText: {
    color: '#6366F1',
    fontSize: 12,
    fontWeight: '600',
  },
  clearFiltersButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  clearFiltersText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  customMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  filterModal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    maxHeight: height * 0.8,
  },
  reportModal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    maxHeight: height * 0.7,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
  },
  filterContent: {
    padding: 20,
  },
  filterSection: {
    marginBottom: 24,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 12,
  },
  filterOptions: {
    gap: 8,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  selectedFilterOption: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  filterOptionText: {
    fontSize: 14,
    color: '#64748B',
    marginLeft: 8,
    fontWeight: '500',
  },
  selectedFilterText: {
    color: '#6366F1',
    fontWeight: '700',
  },
  priorityIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 12,
  },
  clearButton: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: '700',
  },
  applyButton: {
    flex: 1,
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  applyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  reportModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  reportTitleContainer: {
    flex: 1,
    marginRight: 16,
  },
  reportModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  reportBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  reportPriorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  statusBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  reportModalContent: {
    padding: 20,
  },
  reportDescription: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
    marginBottom: 16,
  },
  reportDetails: {
    gap: 12,
    marginBottom: 20,
  },
  reportDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reportDetailText: {
    fontSize: 14,
    color: '#64748B',
    flex: 1,
  },
  focusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  focusButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
