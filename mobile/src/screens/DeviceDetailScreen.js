import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { api, ApiError } from '../api/client';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

export const DeviceDetailScreen = ({ route, navigation }) => {
  const { deviceId } = route.params;
  const [device, setDevice] = useState(null);
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const latestBattery = readings.length > 0 ? readings[0].battery : undefined;

  const fetchDevice = useCallback(async () => {
    try {
      const data = await api.getDevice(deviceId);
      setDevice(data);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to load device';
      throw new Error(message);
    }
  }, [deviceId]);

  const fetchReadings = useCallback(async (pageNum = 1, isRefresh = false) => {
    try {
      if (pageNum === 1 && !isRefresh) setLoading(true);
      if (pageNum > 1) setLoadingMore(true);
      if (isRefresh) setRefreshing(true);
      setError(null);

      const data = await api.getReadings(deviceId, { page: pageNum, limit: 20 });
      const newReadings = data?.readings || [];

      if (pageNum === 1) {
        setReadings(newReadings);
        setPage(1);
      } else {
        setReadings((prev) => [...prev, ...newReadings]);
      }

      const totalPages = data?.pagination?.totalPages;
      setHasMore(totalPages != null ? pageNum < totalPages : newReadings.length === 20);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to load readings';
      throw new Error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [deviceId]);

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore && !loading) {
      setPage((prev) => prev + 1);
    }
  }, [loadingMore, hasMore, loading]);

  const onRefresh = () => {
    setPage(1);
    fetchReadings(1, true);
  };

  useEffect(() => {
    let mounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    Promise.all([fetchDevice(), fetchReadings(1)])
      .catch((err) => {
        if (mounted) setError(err.message);
      });
    return () => {
      mounted = false;
    };
  }, [fetchDevice, fetchReadings]);

  useEffect(() => {
    if (page > 1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchReadings(page);
    }
  }, [page, fetchReadings]);

  if (loading) {
    return <LoadingState message="Loading device..." />;
  }

  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={() => {
          setError(null);
          setLoading(true);
          setPage(1);
          Promise.all([fetchDevice(), fetchReadings(1)]).catch((err) => setError(err.message));
        }}
      />
    );
  }

  if (!device) {
    return <ErrorState message="Device not found" />;
  }

  const renderReading = ({ item }) => (
    <View style={styles.readingCard}>
      <View style={styles.readingHeader}>
        <Text style={styles.readingTime}>
          {new Date(item.deviceTimestamp).toLocaleString()}
        </Text>
        <Text style={styles.readingSequence}>Seq: {item.sequence}</Text>
      </View>
      <View style={styles.readingMetrics}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Temp</Text>
          <Text style={styles.metricValue}>{item.temperature?.toFixed(2)}°C</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Battery</Text>
          <Text style={styles.metricValue}>{item.battery}%</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Activity</Text>
          <Text style={styles.metricValue}>{item.activityScore?.toFixed(2)}</Text>
        </View>
      </View>
    </View>
  );

  const deviceHeader = (
    <View style={styles.deviceInfo}>
      <Text style={styles.deviceTitle}>Device #{device.deviceId}</Text>
      <Text style={styles.deviceLabel}>{device.label}</Text>
      {device.location ? (
        <Text style={styles.deviceLocation}>{device.location}</Text>
      ) : null}
      {device.installationDate && (
        <Text style={styles.deviceInstallation}>
          Installed: {new Date(device.installationDate).toLocaleDateString()}
        </Text>
      )}
    </View>
  );

  const latestMetrics = (
    <View style={styles.latestMetrics}>
      <Text style={styles.sectionTitle}>Latest Reading</Text>
      <View style={styles.metricsGrid}>
        <View style={styles.metricCard}>
          <Text style={styles.metricCardLabel}>Temperature</Text>
          <Text style={styles.metricCardValue}>
            {device.latestTemperature !== null
              ? `${device.latestTemperature.toFixed(2)}°C`
              : '—'}
          </Text>
          {latestBattery !== undefined && (
            <>
              <Text style={styles.metricCardLabel}>Battery</Text>
              <Text style={styles.metricCardValue}>{latestBattery}%</Text>
            </>
          )}
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricCardLabel}>Activity Score</Text>
          <Text style={styles.metricCardValue}>
            {device.latestActivityScore !== null
              ? device.latestActivityScore.toFixed(2)
              : '—'}
          </Text>
          <Text style={styles.metricCardLabel}>Last Seen</Text>
          <Text style={styles.metricCardValue}>
            {device.lastSeen ? new Date(device.lastSeen).toLocaleString() : '—'}
          </Text>
        </View>
      </View>
    </View>
  );

  const emptyReadings = (
    <View style={styles.emptyReadings}>
      <Text style={styles.emptyText}>No readings available</Text>
    </View>
  );

  return (
    <FlatList
      data={readings}
      ListHeaderComponent={
        <>
          {deviceHeader}
          {latestMetrics}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Readings</Text>
            {loadingMore && <Text style={{ color: '#007AFF' }}>Loading…</Text>}
          </View>
        </>
      }
      keyExtractor={(item) => String(item._id)}
      renderItem={renderReading}
      ListEmptyComponent={emptyReadings}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      contentContainerStyle={styles.listContent}
      style={styles.flatList}
    />
  );
};

const styles = StyleSheet.create({
  flatList: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
  },
  deviceInfo: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  deviceTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  deviceLabel: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  deviceLocation: {
    fontSize: 14,
    color: '#888',
    marginTop: 8,
  },
  deviceInstallation: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  latestMetrics: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricCard: {
    flex: 1,
    marginHorizontal: 4,
  },
  metricCardLabel: {
    fontSize: 12,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricCardValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginTop: 4,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  readingCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  readingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  readingTime: {
    fontSize: 13,
    color: '#666',
  },
  readingSequence: {
    fontSize: 13,
    color: '#999',
    fontFamily: 'monospace',
  },
  readingMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  metric: {
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 10,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1A1A1A',
    marginTop: 2,
  },
  emptyReadings: {
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },
});
