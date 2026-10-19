import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { api, ApiError } from '../api/client';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

export const AlertsScreen = ({ navigation }) => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [acknowledging, setAcknowledging] = useState(new Set());
  const [alertStatus, setAlertStatus] = useState('open');

  const fetchAlerts = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      setError(null);
      const data = await api.getAlerts(alertStatus);
      setAlerts(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err instanceof ApiError 
        ? err.message 
        : 'Failed to load alerts';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [alertStatus]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAlerts();
  }, [fetchAlerts]);

  const onRefresh = () => {
    fetchAlerts(true);
  };

  const handleAcknowledge = async (alertId) => {
    if (acknowledging.has(alertId)) return;

    try {
      setAcknowledging(prev => new Set(prev).add(alertId));
      await api.acknowledgeAlert(alertId);
      setAlerts((prev) =>
        prev.map((a) => (a._id === alertId ? { ...a, acknowledged: true } : a))
      );
      if (alertStatus === 'open') {
        setAlerts((prev) => prev.filter((a) => a._id !== alertId));
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to acknowledge alert';
      Alert.alert('Error', message);
    } finally {
      setAcknowledging(prev => {
        const next = new Set(prev);
        next.delete(alertId);
        return next;
      });
    }
  };

  const renderAlert = ({ item }) => (
    <TouchableOpacity
      style={[
        styles.alertCard,
        item.acknowledged && styles.alertCardAcknowledged,
      ]}
      onPress={() => !acknowledging.has(item._id) && handleAcknowledge(item._id)}
      disabled={acknowledging.has(item._id)}
    >
      <View style={styles.alertHeader}>
        <View style={styles.alertTypeContainer}>
          <Text style={styles.alertTypeLabel}>
            {(item.type || 'unknown').replace('_', ' ').toUpperCase()}
          </Text>
          {item.acknowledged && (
            <View style={styles.acknowledgedBadge}>
              <Text style={styles.acknowledgedBadgeText}>ACKNOWLEDGED</Text>
            </View>
          )}
        </View>
        <Text style={styles.alertTime}>
          {new Date(item.raisedAt).toLocaleString()}
        </Text>
      </View>
      <Text style={styles.alertDevice}>
        Device #{item.deviceId ?? 'unknown'}
      </Text>
      {item.details && typeof item.details === 'object' && Object.keys(item.details).length > 0 && (
        <View style={styles.alertDetails}>
          {Object.entries(item.details).map(([key, value]) => (
            <Text key={key} style={styles.detailText}>
              {key}: {JSON.stringify(value)}
            </Text>
          ))}
        </View>
      )}
      {!item.acknowledged && !acknowledging.has(item._id) && (
        <View style={styles.acknowledgeHint}>
          <Text style={styles.acknowledgeHintText}>Tap to acknowledge</Text>
        </View>
      )}
      {acknowledging.has(item._id) && (
        <View style={styles.acknowledgingOverlay}>
          <ActivityIndicator size="small" color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return <LoadingState message="Loading alerts..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={fetchAlerts} />;
  }

  const emptyTitle =
    alertStatus === 'open'
      ? 'No Open Alerts'
      : alertStatus === 'acknowledged'
      ? 'No Acknowledged Alerts'
      : 'No Alerts';
  const emptyText =
    alertStatus === 'open'
      ? 'All devices are operating normally'
      : alertStatus === 'acknowledged'
      ? 'No alerts have been acknowledged yet'
      : 'No alerts are available';

  const statusLabelFor = (status) =>
    status.charAt(0).toUpperCase() + status.slice(1);

  const statusSelector = (
    <View style={styles.statusSelector}>
      {['open', 'acknowledged', 'all'].map((status) => (
        <TouchableOpacity
          key={status}
          style={[
            styles.statusButton,
            alertStatus === status && styles.statusButtonActive,
          ]}
          onPress={() => setAlertStatus(status)}
        >
          <Text
            style={[
              styles.statusButtonText,
              alertStatus === status && styles.statusButtonTextActive,
            ]}
          >
            {statusLabelFor(status)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  if (alerts.length === 0) {
    return (
      <View style={styles.emptyState}>
        {statusSelector}
        <Text style={styles.emptyTitle}>{emptyTitle}</Text>
        <Text style={styles.emptyText}>{emptyText}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={alerts}
      keyExtractor={(item, index) => String(item._id ?? index)}
      renderItem={renderAlert}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={statusSelector}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          {statusSelector}
          <Text style={styles.emptyTitle}>{emptyTitle}</Text>
          <Text style={styles.emptyText}>{emptyText}</Text>
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
  alertCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B6B',
  },
  alertCardAcknowledged: {
    opacity: 0.6,
    borderLeftColor: '#4CAF50',
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  alertTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertTypeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  acknowledgedBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  acknowledgedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  alertTime: {
    fontSize: 13,
    color: '#999',
  },
  alertDevice: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  alertDetails: {
    marginBottom: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  detailText: {
    fontSize: 12,
    color: '#888',
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  acknowledgeHint: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  acknowledgeHintText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#007AFF',
    textAlign: 'center',
  },
  acknowledgingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  statusSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  statusButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  statusButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  statusButtonTextActive: {
    color: '#fff',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
});