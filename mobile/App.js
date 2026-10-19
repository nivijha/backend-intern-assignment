import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DeviceListScreen } from './src/screens/DeviceListScreen';
import { DeviceDetailScreen } from './src/screens/DeviceDetailScreen';
import { AlertsScreen } from './src/screens/AlertsScreen';

const Stack = createNativeStackNavigator();

const App = () => {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="auto" />
        <Stack.Navigator
          initialRouteName="Devices"
          screenOptions={{
            headerStyle: {
              backgroundColor: '#fff',
              borderBottomWidth: 1,
              borderBottomColor: '#E0E0E0',
              elevation: 0,
              shadowOpacity: 0,
            },
            headerTitleStyle: {
              fontSize: 18,
              fontWeight: '600',
              color: '#1A1A1A',
            },
            headerTintColor: '#007AFF',
            headerBackTitleVisible: false,
          }}
        >
          <Stack.Screen
            name="Devices"
            component={DeviceListScreen}
            options={{ title: 'Devices' }}
          />
          <Stack.Screen
            name="DeviceDetail"
            component={DeviceDetailScreen}
            options={({ route }) => ({
              title: `Device #${route.params?.deviceId}`,
            })}
          />
          <Stack.Screen
            name="Alerts"
            component={AlertsScreen}
            options={{ title: 'Alerts' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
};

export default App;