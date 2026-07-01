import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
  Linking,
  Platform,
  Modal,
  Dimensions,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Audio, Video, ResizeMode } from 'expo-av';
import { storage } from '../../utils/storage';
import { reportService } from '../../services/report.service';
import { whatsAppService } from '../../services/whatsapp.service';
import { Report, Admin } from '../../types';
import { COLORS, getFieldAdminStatusLabel } from '../../constants';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ReportDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Photo zoom states
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  
  // Photo upload states
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [showUploadSection, setShowUploadSection] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Audio player states
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioPosition, setAudioPosition] = useState(0);

  // Video modal states
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [showVideoModal, setShowVideoModal] = useState(false);

  useEffect(() => {
    loadReportDetails();
    
    // Cleanup audio on unmount
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [id]);

  const loadReportDetails = async () => {
    try {
      const adminData = await storage.getAdmin();
      if (!adminData) {
        router.replace('/login');
        return;
      }
      setAdmin(adminData);

      const response = await reportService.getReportById(String(id));
      if (response.success) {
        setReport(response.data);
      }
    } catch (error) {
      console.error('Error loading report:', error);
      Alert.alert('Error', 'Failed to load report details');
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = () => {
    if (!report) return;

    const scheme = Platform.select({
      ios: 'maps:',
      android: 'geo:',
    });
    
    const url = Platform.select({
      ios: `${scheme}?q=${report.latitude},${report.longitude}`,
      android: `${scheme}${report.latitude},${report.longitude}?q=${report.latitude},${report.longitude}(${encodeURIComponent(report.title)})`,
    });

    // Fallback to Google Maps web URL
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${report.latitude},${report.longitude}`;

    Linking.canOpenURL(url!).then((supported) => {
      if (supported) {
        Linking.openURL(url!);
      } else {
        Linking.openURL(googleMapsUrl);
      }
    });
  };

  const handleStartWork = async () => {
    if (!report || !admin) return;

    try {
      setActionLoading(true);

      // Get current location
      const { status } = await Location.requestForegroundPermissionsAsync();
      let location = null;
      
      if (status === 'granted') {
        const currentLocation = await Location.getCurrentPositionAsync({});
        location = {
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
        };
      }

      const response = await reportService.startWork(report.id, {
        adminId: admin.id,
        notes: 'Work started',
        ...location,
      });

      if (response.success) {
        Alert.alert('Success', 'Report marked as In Progress');
        loadReportDetails();
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to start work');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteReport = async () => {
    if (!report || !admin) return;
    setShowUploadSection(true);
  };

  const handlePickPhotos = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera roll permission is required');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 5 - uploadedPhotos.length,
    });

    if (!result.canceled && result.assets) {
      setUploadingPhoto(true);
      
      for (const asset of result.assets) {
        try {
          const uploadResult = await reportService.uploadWorkPhoto({
            uri: asset.uri,
            type: 'image/jpeg',
            name: 'resolution-photo.jpg',
          });
          
          if (uploadResult.success && uploadResult.data?.url) {
            setUploadedPhotos(prev => [...prev, uploadResult.data.url]);
          }
        } catch (error) {
          console.error('Error uploading photo:', error);
          Alert.alert('Upload Error', 'Failed to upload one or more photos');
        }
      }
      
      setUploadingPhoto(false);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera permission is required');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setUploadingPhoto(true);
      
      try {
        const uploadResult = await reportService.uploadWorkPhoto({
          uri: result.assets[0].uri,
          type: 'image/jpeg',
          name: 'resolution-photo.jpg',
        });
        
        if (uploadResult.success && uploadResult.data?.url) {
          setUploadedPhotos(prev => [...prev, uploadResult.data.url]);
        }
      } catch (error) {
        console.error('Error uploading photo:', error);
        Alert.alert('Upload Error', 'Failed to upload photo');
      }
      
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setUploadedPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitCompletion = async () => {
    if (!report || !admin) return;
    
    if (!resolutionNotes.trim()) {
      Alert.alert('Missing Information', 'Please add resolution notes');
      return;
    }

    try {
      setActionLoading(true);

      console.log('Submitting completion with:', {
        reportId: report.id,
        adminId: admin.id,
        resolvedNotes: resolutionNotes,
        resolvedPhotos: uploadedPhotos,
      });

      const response = await reportService.completeReport(report.id, {
        adminId: admin.id,
        resolvedNotes: resolutionNotes,
        resolvedPhotos: uploadedPhotos,
      });

      console.log('Completion response:', response);

      if (response.success) {
        // Trigger WhatsApp notification via local OpenWA instance
        if (report.user && report.user.phoneNumber) {
          const messageText = `Hello ${report.user.fullName || 'Citizen'}, your report "${report.title}" has been successfully resolved! Thank you for using Jan Setu.`;
          whatsAppService.sendTextMessage(report.user.phoneNumber, messageText)
            .then(res => {
              if (res.success) {
                console.log('✅ WhatsApp notification sent successfully');
              } else {
                console.warn('⚠️ WhatsApp notification failed:', res.error);
              }
            })
            .catch(err => {
              console.error('❌ Failed to trigger WhatsApp service:', err);
            });
        }

        Alert.alert('Success', 'Report marked as Resolved', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (error: any) {
      console.error('Error completing report:', error);
      Alert.alert('Error', error.response?.data?.message || error.message || 'Failed to complete report');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelCompletion = () => {
    setShowUploadSection(false);
    setUploadedPhotos([]);
    setResolutionNotes('');
  };

  const handlePhotoPress = (url: string) => {
    setSelectedPhoto(url);
    setShowPhotoModal(true);
  };

  const handleCallUser = () => {
    if (!report?.user?.phoneNumber) {
      Alert.alert('Error', 'User phone number not available');
      return;
    }

    const phoneUrl = `tel:${report.user.phoneNumber}`;
    Linking.openURL(phoneUrl);
  };

  const handlePlayAudio = async () => {
    if (!report?.audioUrl) return;

    try {
      if (sound) {
        // If sound is already loaded, toggle play/pause
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          if (isPlaying) {
            await sound.pauseAsync();
            setIsPlaying(false);
          } else {
            // Check if audio has finished, if so, replay from beginning
            if (status.didJustFinish || status.positionMillis === status.durationMillis) {
              await sound.replayAsync();
              setIsPlaying(true);
            } else {
              await sound.playAsync();
              setIsPlaying(true);
            }
          }
        }
      } else {
        // Load and play the audio for the first time
        setAudioLoading(true);
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });

        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: report.audioUrl },
          { shouldPlay: true },
          (status) => {
            if (status.isLoaded) {
              setAudioDuration(status.durationMillis || 0);
              setAudioPosition(status.positionMillis || 0);
              
              if (status.didJustFinish) {
                setIsPlaying(false);
                setAudioPosition(0);
              }
            }
          }
        );

        setSound(newSound);
        setIsPlaying(true);
        setAudioLoading(false);
      }
    } catch (error) {
      console.error('Error playing audio:', error);
      Alert.alert('Error', 'Failed to play audio');
      setAudioLoading(false);
      setIsPlaying(false);
    }
  };

  const formatTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const isVideoFile = (url: string) => {
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'];
    return videoExtensions.some(ext => url.toLowerCase().includes(ext));
  };

  const handleVideoPress = (url: string) => {
    setSelectedVideo(url);
    setShowVideoModal(true);
  };

  const getPriorityColor = (priority: string) => {
    return COLORS.priority[priority as keyof typeof COLORS.priority] || COLORS.gray[500];
  };

  const getStatusColor = (status: string) => {
    return COLORS.status[status as keyof typeof COLORS.status] || COLORS.gray[500];
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Report not found</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Report Details',
          headerStyle: { backgroundColor: COLORS.primary },
          headerTintColor: COLORS.white,
        }}
      />
      <ScrollView style={styles.container}>
        {/* Header Info */}
        <View style={styles.headerCard}>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: getPriorityColor(report.priority) }]}>
              <Text style={styles.badgeText}>{report.priority.toUpperCase()}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: getStatusColor(report.status) }]}>
              <Text style={styles.badgeText}>{getFieldAdminStatusLabel(report.status)}</Text>
            </View>
          </View>

          <Text style={styles.title}>{report.title}</Text>
          <Text style={styles.category}>{report.category}</Text>

          <View style={styles.infoRow}>
            <Ionicons name="calendar" size={16} color={COLORS.gray[500]} />
            <Text style={styles.infoText}>
              {new Date(report.createdAt).toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Ionicons name="arrow-up" size={18} color={COLORS.success} />
              <Text style={styles.statText}>{report.upvotes}</Text>
            </View>
            <View style={styles.stat}>
              <Ionicons name="eye" size={18} color={COLORS.gray[500]} />
              <Text style={styles.statText}>{report.viewCount}</Text>
            </View>
            <View style={styles.stat}>
              <Ionicons name="share-social" size={18} color={COLORS.gray[500]} />
              <Text style={styles.statText}>{report.shareCount}</Text>
            </View>
          </View>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{report.description}</Text>
        </View>

        {/* Media */}
        {report.mediaUrls && report.mediaUrls.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Media ({report.mediaUrls.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {report.mediaUrls.map((url, index) => {
                const isVideo = isVideoFile(url);
                return (
                  <TouchableOpacity 
                    key={index} 
                    onPress={() => isVideo ? handleVideoPress(url) : handlePhotoPress(url)}
                  >
                    {isVideo ? (
                      <View style={styles.videoThumbnailContainer}>
                        <Video
                          source={{ uri: url }}
                          style={styles.mediaImage}
                          resizeMode={ResizeMode.COVER}
                          shouldPlay={false}
                          useNativeControls={false}
                        />
                        <View style={styles.videoOverlay}>
                          <Ionicons name="play-circle" size={48} color={COLORS.white} />
                        </View>
                      </View>
                    ) : (
                      <>
                        <Image source={{ uri: url }} style={styles.mediaImage} />
                        <View style={styles.zoomOverlay}>
                          <Ionicons name="expand" size={24} color={COLORS.white} />
                        </View>
                      </>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Audio */}
        {report.audioUrl && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Audio Recording</Text>
            <View style={styles.audioContainer}>
              <TouchableOpacity 
                style={[styles.audioButton, audioLoading && styles.audioButtonDisabled]}
                onPress={handlePlayAudio}
                disabled={audioLoading}
              >
                {audioLoading ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Ionicons 
                    name={isPlaying ? 'pause-circle' : 'play-circle'} 
                    size={24} 
                    color={COLORS.white} 
                  />
                )}
                <Text style={styles.audioButtonText}>
                  {audioLoading ? 'Loading...' : isPlaying ? 'Pause' : 'Play'}
                </Text>
              </TouchableOpacity>
              
              {audioDuration > 0 && (
                <View style={styles.audioProgressContainer}>
                  <View style={styles.audioTimeContainer}>
                    <Text style={styles.audioTimeText}>{formatTime(audioPosition)}</Text>
                    <Text style={styles.audioTimeText}>{formatTime(audioDuration)}</Text>
                  </View>
                  <View style={styles.progressBarBackground}>
                    <View 
                      style={[
                        styles.progressBarFill, 
                        { width: `${(audioPosition / audioDuration) * 100}%` }
                      ]} 
                    />
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Location */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          {report.address && (
            <View style={styles.locationRow}>
              <Ionicons name="location" size={20} color={COLORS.primary} />
              <Text style={styles.addressText}>{report.address}</Text>
            </View>
          )}
          <TouchableOpacity style={styles.navigateButton} onPress={handleNavigate}>
            <Ionicons name="navigate" size={20} color={COLORS.white} />
            <Text style={styles.navigateText}>Navigate with Google Maps</Text>
          </TouchableOpacity>
        </View>

        {/* User Info */}
        {report.user && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Reported By</Text>
            <View style={styles.userCard}>
              <View style={styles.userInfo}>
                <Ionicons name="person-circle" size={40} color={COLORS.gray[400]} />
                <View style={styles.userDetails}>
                  <Text style={styles.userName}>{report.user.fullName}</Text>
                  <Text style={styles.userPhone}>{report.user.phoneNumber}</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.callButton} onPress={handleCallUser}>
                <Ionicons name="call" size={20} color={COLORS.white} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Resolution Info */}
        {report.isResolved && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Resolution Details</Text>
            <Text style={styles.resolvedNotes}>{report.resolvedNotes}</Text>
            {report.resolvedPhotos && report.resolvedPhotos.length > 0 && (
              <>
                <Text style={styles.subTitle}>Resolution Photos ({report.resolvedPhotos.length})</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.resolvedPhotosContainer}>
                  {report.resolvedPhotos.map((url, index) => (
                    <TouchableOpacity key={index} onPress={() => handlePhotoPress(url)}>
                      <Image source={{ uri: url }} style={styles.mediaImage} />
                      <View style={styles.zoomOverlay}>
                        <Ionicons name="expand" size={24} color={COLORS.white} />
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}
          </View>
        )}

        {/* Inline Photo Upload Section */}
        {showUploadSection && (
          <View style={styles.uploadSection}>
            <View style={styles.uploadSectionHeader}>
              <Text style={styles.uploadSectionTitle}>Complete Report</Text>
              <TouchableOpacity onPress={handleCancelCompletion}>
                <Ionicons name="close-circle" size={24} color={COLORS.gray[500]} />
              </TouchableOpacity>
            </View>

            {/* Resolution Notes */}
            <Text style={styles.uploadLabel}>Resolution Notes *</Text>
            <TextInput
              style={styles.textArea}
              placeholder="Describe how the issue was resolved..."
              value={resolutionNotes}
              onChangeText={setResolutionNotes}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            {/* Photo Upload */}
            <Text style={styles.uploadLabel}>Resolution Photos (Max 5)</Text>
            
            <View style={styles.photoActions}>
              <TouchableOpacity 
                style={styles.photoActionButton}
                onPress={handleTakePhoto}
                disabled={uploadedPhotos.length >= 5 || uploadingPhoto}
              >
                <Ionicons name="camera" size={24} color={uploadedPhotos.length >= 5 ? COLORS.gray[400] : COLORS.primary} />
                <Text style={[styles.photoActionText, uploadedPhotos.length >= 5 && styles.disabledText]}>Take Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.photoActionButton}
                onPress={handlePickPhotos}
                disabled={uploadedPhotos.length >= 5 || uploadingPhoto}
              >
                <Ionicons name="images" size={24} color={uploadedPhotos.length >= 5 ? COLORS.gray[400] : COLORS.primary} />
                <Text style={[styles.photoActionText, uploadedPhotos.length >= 5 && styles.disabledText]}>Choose from Gallery</Text>
              </TouchableOpacity>
            </View>

            {/* Photo Preview Grid */}
            {uploadedPhotos.length > 0 && (
              <View style={styles.photoGrid}>
                {uploadedPhotos.map((url, index) => (
                  <View key={index} style={styles.photoPreviewContainer}>
                    <TouchableOpacity onPress={() => handlePhotoPress(url)}>
                      <Image source={{ uri: url }} style={styles.photoPreview} />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.removePhotoButton}
                      onPress={() => handleRemovePhoto(index)}
                    >
                      <Ionicons name="close-circle" size={24} color={COLORS.danger} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {uploadingPhoto && (
              <View style={styles.uploadingIndicator}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.uploadingText}>Uploading photos...</Text>
              </View>
            )}

            <Text style={styles.photoCount}>
              {uploadedPhotos.length} / 5 photos uploaded
            </Text>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, (!resolutionNotes.trim() || actionLoading) && styles.submitButtonDisabled]}
              onPress={handleSubmitCompletion}
              disabled={!resolutionNotes.trim() || actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={24} color={COLORS.white} />
                  <Text style={styles.submitButtonText}>Submit & Complete</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Photo Zoom Modal */}
      <Modal
        visible={showPhotoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPhotoModal(false)}
      >
        <View style={styles.photoModal}>
          <TouchableOpacity 
            style={styles.photoModalClose}
            onPress={() => setShowPhotoModal(false)}
          >
            <Ionicons name="close" size={32} color={COLORS.white} />
          </TouchableOpacity>
          
          {selectedPhoto && (
            <Image 
              source={{ uri: selectedPhoto }} 
              style={styles.photoModalImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* Video Modal */}
      <Modal
        visible={showVideoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowVideoModal(false)}
      >
        <View style={styles.photoModal}>
          <TouchableOpacity 
            style={styles.photoModalClose}
            onPress={() => setShowVideoModal(false)}
          >
            <Ionicons name="close" size={32} color={COLORS.white} />
          </TouchableOpacity>
          
          {selectedVideo && (
            <Video
              source={{ uri: selectedVideo }}
              style={styles.videoModalPlayer}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
            />
          )}
        </View>
      </Modal>

      {/* Action Buttons */}
      {!report.isResolved && (
        <View style={styles.actionBar}>
          {(report.status === 'pending' || report.status === 'assigned') && (
            <TouchableOpacity
              style={[styles.actionButton, styles.startButton]}
              onPress={handleStartWork}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Ionicons name="play-circle" size={24} color={COLORS.white} />
                  <Text style={styles.actionButtonText}>Start Work</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {report.status === 'in_progress' && !showUploadSection && (
            <TouchableOpacity
              style={[styles.actionButton, styles.completeButton]}
              onPress={handleCompleteReport}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={24} color={COLORS.white} />
                  <Text style={styles.actionButtonText}>Mark as Complete</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}
    </>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: COLORS.gray[500],
  },
  headerCard: {
    backgroundColor: COLORS.white,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[200],
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 20,
    marginBottom: 12,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.gray[900],
    marginBottom: 8,
  },
  category: {
    fontSize: 16,
    color: COLORS.gray[600],
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  infoText: {
    fontSize: 14,
    color: COLORS.gray[600],
  },
  statsRow: {
    flexDirection: 'row',
    gap: 24,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray[700],
  },
  section: {
    backgroundColor: COLORS.white,
    padding: 20,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.gray[900],
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: COLORS.gray[700],
    lineHeight: 24,
  },
  mediaImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginRight: 12,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 16,
  },
  addressText: {
    flex: 1,
    fontSize: 16,
    color: COLORS.gray[700],
  },
  navigateButton: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
  },
  navigateText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  userCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.gray[50],
    borderRadius: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray[900],
  },
  userPhone: {
    fontSize: 14,
    color: COLORS.gray[600],
    marginTop: 2,
  },
  callButton: {
    backgroundColor: COLORS.success,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resolvedNotes: {
    fontSize: 16,
    color: COLORS.gray[700],
    marginBottom: 12,
    lineHeight: 24,
  },
  resolvedPhotosContainer: {
    marginTop: 8,
  },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[200],
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
  },
  startButton: {
    backgroundColor: COLORS.status.in_progress,
  },
  completeButton: {
    backgroundColor: COLORS.success,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  zoomOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray[700],
    marginBottom: 8,
    marginTop: 12,
  },
  // Inline Photo Upload Section Styles
  uploadSection: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  uploadSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[200],
  },
  uploadSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.gray[900],
  },
  uploadLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray[900],
    marginBottom: 8,
  },
  textArea: {
    borderWidth: 1,
    borderColor: COLORS.gray[300],
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: COLORS.gray[900],
    minHeight: 100,
    marginBottom: 24,
  },
  photoActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  photoActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 12,
    backgroundColor: COLORS.background,
  },
  photoActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  disabledText: {
    color: COLORS.gray[400],
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  photoPreviewContainer: {
    position: 'relative',
    width: (Dimensions.get('window').width - 80) / 3, // 3 columns with gaps and padding
  },
  photoPreview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: COLORS.gray[100],
  },
  removePhotoButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  uploadingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  uploadingText: {
    fontSize: 14,
    color: COLORS.gray[600],
  },
  photoCount: {
    fontSize: 12,
    color: COLORS.gray[500],
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.success,
    padding: 16,
    borderRadius: 12,
  },
  submitButtonDisabled: {
    backgroundColor: COLORS.gray[300],
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  // Photo Zoom Modal Styles
  photoModal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoModalClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
  },
  photoModalImage: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
  audioContainer: {
    gap: 12,
  },
  audioButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  audioButtonDisabled: {
    backgroundColor: COLORS.gray[400],
  },
  audioButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
    flex: 1,
    textAlign: 'center',
  },
  audioProgressContainer: {
    gap: 8,
  },
  audioTimeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  audioTimeText: {
    fontSize: 12,
    color: COLORS.gray[600],
    fontWeight: '500',
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: COLORS.gray[200],
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  videoThumbnailContainer: {
    position: 'relative',
  },
  videoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
  },
  videoModalPlayer: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height * 0.5,
  },
});
