import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef } from 'react';
import { COLORS } from '../../constants';

const AnimatedTabIcon = ({ focused, icon, outlineIcon, color, inactiveColor }: any) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const translateYAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: focused ? 1.1 : 1,
        friction: 5,
        tension: 100,
        useNativeDriver: true,
      }),
      Animated.spring(translateYAnim, {
        toValue: focused ? -20 : 0,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: focused ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [focused]);

  return (
    <Animated.View style={{
      alignItems: "center",
      justifyContent: "center",
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: focused ? "#FFF3E0" : "transparent",
      transform: [{ scale: scaleAnim }, { translateY: translateYAnim }],
      elevation: focused ? 8 : 0,
      shadowColor: focused ? COLORS.primary : "transparent",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: focused ? 0.3 : 0,
      shadowRadius: 6,
      borderWidth: focused ? 2 : 0,
      borderColor: "#FFFFFF",
    }}>
      <Ionicons 
        name={focused ? icon : outlineIcon}
        size={24} 
        color={focused ? color : inactiveColor} 
      />
    </Animated.View>
  );
};

export default function TabLayout() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
      <Tabs
        initialRouteName="index"
        screenOptions={{
          tabBarActiveTintColor: COLORS.primary,
          tabBarInactiveTintColor: "#9CA3AF",
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "600",
            marginTop: 4,
            marginBottom: Platform.OS === "ios" ? 0 : 6,
            fontFamily: Platform.OS === "ios" ? "System" : "sans-serif-medium",
          },
          tabBarItemStyle: {
            paddingTop: 6,
            paddingBottom: Platform.OS === "ios" ? 0 : 6,
          },
          tabBarStyle: {
            height: Platform.OS === "ios" ? 88 : 70,
            paddingTop: 6,
            paddingBottom: Platform.OS === "ios" ? 34 : 10,
            backgroundColor: "#FFFFFF",
            borderTopWidth: 1,
            borderTopColor: "#E5E7EB",
            elevation: 24,
            shadowColor: "#000000",
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.1,
            shadowRadius: 16,
            position: "absolute",
          },
          tabBarBackground: () => (
            <View style={{
              flex: 1,
              backgroundColor: "#FFFFFF",
              borderTopWidth: 1,
              borderTopColor: "#E5E7EB",
            }} />
          ),
          headerStyle: {
            backgroundColor: COLORS.primary,
          },
          headerTintColor: COLORS.white,
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          headerShown: false,
        }}
      >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon 
              focused={focused}
              icon="home"
              outlineIcon="home-outline"
              color={COLORS.primary}
              inactiveColor="#9CA3AF"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'My Reports',
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon 
              focused={focused}
              icon="list"
              outlineIcon="list-outline"
              color={COLORS.primary}
              inactiveColor="#9CA3AF"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map View',
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon 
              focused={focused}
              icon="map"
              outlineIcon="map-outline"
              color={COLORS.primary}
              inactiveColor="#9CA3AF"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon 
              focused={focused}
              icon="person"
              outlineIcon="person-outline"
              color={COLORS.primary}
              inactiveColor="#9CA3AF"
            />
          ),
        }}
      />
    </Tabs>
    </SafeAreaView>
  );
}
