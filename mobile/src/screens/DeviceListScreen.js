import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { api, ApiError } from '../api/client';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

export const DeviceListScreen = ({ navigation }) => {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchDevices = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      setError(null);
      const data = await api.getDevices();
      setDevices(data || []);
    } catch (err) {
      const message = err instanceof ApiError 
        ? err.message 
        : 'Failed to load devices';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDevices();
  }, [fetchDevices]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.navigate('Alerts')}>
          <Text style={styles.headerButtonText}>Alerts</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const onRefresh = () => {
    fetchDevices(true);
  };

  const renderDevice = ({ item }) => (
    <TouchableOpacity
      style={styles.deviceCard}
      onPress={() => navigation.navigate('DeviceDetail', { deviceId: item.deviceId })}
    >
      <View style={styles.deviceHeader}>
        <View>
          <Text style={styles.deviceId}>Device #{item.deviceId}</Text>
          <Text style={styles.deviceLabel}>{item.label}</Text>
        </View>
        {item.hasOpenAlert && (
          <View style={styles.alertBadge}>
            <Text style={styles.alertBadgeText}>⚠ Open Alert</Text>
          </View>
        )}
      </View>
      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Temperature</Text>
          <Text style={styles.metricValue}>
            {item.latestTemperature !== null 
              ? `${item.latestTemperature.toFixed(2)}°C` 
              : '—'}
          </Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Activity Score</Text>
          <Text style={styles.metricValue}>
            {item.latestActivityScore !== null 
              ? item.latestActivityScore.toFixed(2)
              : '—'}
          </Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Last Seen</Text>
          <Text style={styles.metricValue}>
            {item.lastSeen 
              ? new Date(item.lastSeen).toLocaleString() 
              : '—'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return <LoadingState message="Loading devices..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={fetchDevices} />;
  }

  if (devices.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No devices registered</Text>
        <Text style={styles.emptySubtext}>
          Register a device via the API to see it here
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={devices}
      keyExtractor={(item) => String(item.deviceId)}
      renderItem={renderDevice}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      contentContainerStyle={styles.listContent}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No devices registered</Text>
        </View>
      }
    />
  );
};

const styles = StyleSheet.create({
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  deviceCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  deviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  deviceId: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  deviceLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  alertBadge: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  alertBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E65100',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metric: {
    flex: 1,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 11,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1A1A1A',
    marginTop: 2,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
});